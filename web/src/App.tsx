import { useEffect, useRef, useState } from 'react';
import { ScriptPanel } from './components/ScriptPanel';
import { Board } from './components/Board';
import { useStore, setState, api, notify, time, refresh, getState, useSelectedItem, seek as seekTo, actions } from './store';
import { Viewer } from './components/Viewer';
import { Timeline } from './components/Timeline';
import { Library } from './components/Library';
import { Chat } from './components/Chat';
import { ItemPanel } from './components/ItemPanel';
import { Icon } from './components/Icon';
import type { Project, Settings, Voice } from '../../shared/types';

function useUndoRedo() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      const r = await api<{ ok: boolean }>('POST', e.shiftKey ? '/api/redo' : '/api/undo');
      if (!r.ok) notify('info', e.shiftKey ? 'Нечего повторять' : 'Нечего отменять');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  useFollowAgent();
  useUndoRedo();
  const project = useStore((s) => s.project);
  const connected = useStore((s) => s.connected);
  const dialog = useStore((s) => s.dialog);
  const view = useStore((s) => s.view);
  const [tlHeight, setTlHeight] = useState(() => Number(localStorage.getItem('tlh') || 240));
  if (!project) return (
    <div className="app-empty">
      {!connected ? <div className="muted">Подключение к серверу…</div> : <div className="sheet"><ProjectsDialog /></div>}
      <Notices />
    </div>
  );
  return (
    <div className={'app view-' + view} style={{ gridTemplateRows: view === 'board' ? '48px minmax(0, 1fr) 0px' : `48px minmax(0, 1fr) ${tlHeight}px` }}>
      <TopBar />
      <div className="main">
        <div className="stage-swap">
          <div className={'swap-layer' + (view === 'edit' ? '' : ' off')}><Viewer project={project} /></div>
          <div className={'swap-layer' + (view === 'board' ? '' : ' off')}>{view === 'board' && <Board project={project} />}</div>
        </div>
        <Side project={project} />
        <Library />
      </div>
      <div className="bottom">
        <div className="resizer" onPointerDown={(e) => {
          const y0 = e.clientY, h0 = tlHeight;
          const mv = (ev: PointerEvent) => { const h = Math.min(window.innerHeight - 300, Math.max(120, h0 - (ev.clientY - y0))); setTlHeight(h); localStorage.setItem('tlh', String(h)); };
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
        }} />
        <Timeline project={project} />
      </div>
      <Modal open={dialog === 'projects'}><ProjectsDialog /></Modal>
      <Modal open={dialog === 'settings'}><SettingsDialog /></Modal>
      <Modal open={dialog === 'export'}><ExportDialog /></Modal>
      <Modal open={!!dialog && typeof dialog === 'object'} wide>{dialog && typeof dialog === 'object' && 'compare' in dialog ? <CompareDialog clipId={dialog.compare.clipId} sha={dialog.compare.sha} /> : null}</Modal>
      <Lightbox />
      <Reconnecting />
      <Notices />
    </div>
  );
}

/** Right column: Agent / Script tabs; the selected item's panel slides over both. */
function Side({ project }: { project: Project }) {
  const item = useSelectedItem();
  const tab = useStore((s) => s.sideTab);
  const running = useStore((s) => s.tasks.filter((t) => t.status === 'running' || t.status === 'queued').length);
  const scenes = useStore((s) => s.script.scenes);
  const doneScenes = scenes.filter((x) => x.status === 'done').length;
  return (
    <aside className="side">
      <div className="side-tabs">
        <button className={tab === 'agent' ? 'on' : ''} onClick={() => setState({ sideTab: 'agent' })}>Агент{running > 0 && <span className="tab-live" />}</button>
        <button className={tab === 'script' ? 'on' : ''} onClick={() => setState({ sideTab: 'script' })}>Сценарий{scenes.length > 0 && <span className="tab-count">{doneScenes}/{scenes.length}</span>}</button>
      </div>
      <div className="side-stack">
        <div className={'side-layer' + (tab === 'agent' ? '' : ' hidden left')}><Chat /></div>
        <div className={'side-layer' + (tab === 'script' ? '' : ' hidden')}><ScriptPanel /></div>
      </div>
      <div className={'side-layer over' + (item ? '' : ' hidden')}>{item && <ItemPanel key={item.id} item={item} project={project} />}</div>
    </aside>
  );
}

/** Follow the agent: when a running task starts working on a clip/track, bring it into view. */
function useFollowAgent() {
  const tasks = useStore((s) => s.tasks);
  const follow = useStore((s) => s.followAgent);
  const seen = useRef<string>('');
  useEffect(() => {
    if (!follow) return;
    const live = tasks.filter((t) => t.status === 'running' && t.focus && (t.focus.kind === 'clip' || t.focus.kind === 'music')).sort((a, b) => (b.focus!.at - a.focus!.at))[0];
    if (!live) return;
    const key = live.id + ':' + live.focus!.kind + ':' + live.focus!.id;
    if (key === seen.current) return;
    seen.current = key;
    const st = getState();
    if (st.playing || !st.project) return;
    const kind = live.focus!.kind;
    const it = st.project.items.find((i) => i.kind === kind && i.ref === live.focus!.id);
    if (!it) return;
    const t = time.get();
    if (t < it.start || t >= it.start + it.duration) seekTo(it.start + Math.min(it.duration / 2, 1.2));
  }, [tasks, follow]);
}

function Reconnecting() {
  const connected = useStore((s) => s.connected);
  const [show, setShow] = useState(false);
  useEffect(() => { if (connected) { setShow(false); return; } const t = setTimeout(() => setShow(true), 700); return () => clearTimeout(t); }, [connected]);
  return <div className={'reconnect' + (show ? ' show' : '')}><span className="spinner sm" /> Переподключение к редактору… агенты продолжают работать</div>;
}

function Lightbox() {
  const src = useStore((s) => s.lightbox);
  const [shown, setShown] = useState<string | null>(src);
  useEffect(() => { if (src) setShown(src); }, [src]);
  useEffect(() => { if (!src) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setState({ lightbox: null }); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [src]);
  if (!shown) return null;
  return (
    <div className={'lightbox' + (src ? ' open' : '')} onClick={() => setState({ lightbox: null })} onTransitionEnd={() => { if (!src) setShown(null); }}>
      <img src={shown} alt="" />
    </div>
  );
}

function TopBar() {
  const project = useStore((s) => s.project)!;
  const connected = useStore((s) => s.connected);
  const job = useStore((s) => s.jobs.find((j) => j.status === 'running'));
  const libraryOpen = useStore((s) => s.libraryOpen);
  return (
    <header className="topbar">
      <div className="row gap8">
        <ViewSwitch />
        <button className={'tb-btn' + (libraryOpen ? ' on' : '')} onClick={() => setState({ libraryOpen: !libraryOpen })} title="Шаблоны, медиа, ассеты">
          <Icon name="plus" size={14} /> Добавить
        </button>
      </div>
      <button className="project-name" onClick={() => setState({ dialog: 'projects' })} title="Проекты">
        <span className={'conn' + (connected ? '' : ' off')} />{project.name}<Icon name="chevron" size={12} />
      </button>
      <div className="row gap8 end">
        {job && <div className="tb-progress"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /><span>Экспорт {Math.round(job.progress * 100)}%</span></div>}
        <button className="icon-btn" title="Настройки" onClick={() => setState({ dialog: 'settings' })}><Icon name="gear" size={15} /></button>
        <button className="btn sm primary" onClick={() => setState({ dialog: 'export' })}>Экспорт</button>
      </div>
    </header>
  );
}

function ViewSwitch() {
  const view = useStore((s) => s.view);
  return (
    <div className="view-switch">
      <span className="vs-thumb" style={{ transform: `translateX(${view === 'edit' ? 0 : 100}%)` }} />
      <button className={view === 'edit' ? 'on' : ''} onClick={() => actions.setView('edit')}>Монтаж</button>
      <button className={view === 'board' ? 'on' : ''} onClick={() => actions.setView('board')}>Холст</button>
    </div>
  );
}

function Modal({ children, open, wide }: { children: React.ReactNode; open: boolean; wide?: boolean }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); else { const t = setTimeout(() => setMounted(false), 200); return () => clearTimeout(t); } }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setState({ dialog: null }); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!mounted) return null;
  return (
    <div className={'modal-back' + (open ? ' open' : '')} onPointerDown={(e) => e.target === e.currentTarget && setState({ dialog: null })}>
      <div className={'modal' + (wide ? ' wide' : '')}>{children}</div>
    </div>
  );
}

function ProjectsDialog() {
  const [data, setData] = useState<{ current: string | null; projects: string[]; projectsDir: string } | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState('1920x1080');
  const [openPath, setOpenPath] = useState('');
  useEffect(() => { api('GET', '/api/projects').then(setData); }, []);
  const open = async (p: string) => { await api('POST', '/api/projects/open', { path: p }); await refresh(); setState({ dialog: null, selectedItemId: null, selectedTaskId: null }); time.set(0); };
  const create = async () => {
    const [w, h] = size.split('x').map(Number);
    await api('POST', '/api/projects/create', { name: name || 'Новый проект', width: w, height: h });
    await refresh(); setState({ dialog: null, selectedItemId: null, selectedTaskId: null }); time.set(0);
  };
  return (
    <div className="col gap16">
      <h2>Проекты</h2>
      <div className="col gap6">
        {data?.projects.map((p) => (
          <button key={p} className={'project-row' + (p === data.current ? ' current' : '')} onClick={() => open(p)}>
            <Icon name="folder" size={14} /> <span className="strong">{p.split('/').pop()}</span> <span className="muted xsmall ellipsis">{p}</span>
          </button>
        ))}
      </div>
      <div className="card col gap8">
        <div className="strong small">Новый проект</div>
        <div className="row gap6">
          <input className="input grow" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="1920x1080">16:9 · 1920×1080</option><option value="1080x1920">9:16 · 1080×1920</option><option value="1080x1080">1:1 · 1080×1080</option><option value="1080x1350">4:5 · 1080×1350</option><option value="3840x2160">4K</option>
          </select>
          <button className="btn primary sm" onClick={create}>Создать</button>
        </div>
        <div className="muted xsmall">Создаётся в {data?.projectsDir}. Проект — обычная папка с git-историей.</div>
      </div>
      <div className="row gap6">
        <input className="input grow" placeholder="/путь/к/папке/проекта" value={openPath} onChange={(e) => setOpenPath(e.target.value)} />
        <button className="btn sm" onClick={() => openPath && open(openPath)}>Открыть</button>
      </div>
    </div>
  );
}

function SettingsDialog() {
  const settings = useStore((s) => s.settings);
  const agents = useStore((s) => s.agents);
  const dir = useStore((s) => s.dir);
  const repo = useStore((s) => (s as any).repo as string | undefined);
  const [s, setS] = useState<Settings | undefined>(settings);
  if (!s) return null;
  const save = async () => { const next = await api('PATCH', '/api/settings', s); setState({ settings: next, agent: next.defaultAgent, dialog: null }); notify('info', 'Сохранено'); };
  const mcpCmd = `claude mcp add studio -e STUDIO_URL=${location.protocol}//${location.hostname}:4317 -- node ${repo || '<repo>'}/server/mcp/stdio.mjs`;
  return (
    <div className="col gap12">
      <h2>Настройки</h2>
      <div className="grid2">
        <label className="field"><span>Агент по умолчанию</span><select className="input" value={s.defaultAgent} onChange={(e) => setS({ ...s, defaultAgent: e.target.value as any })}><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label>
        <label className="field"><span>Права агентов</span><select className="input" value={s.permissionMode} onChange={(e) => setS({ ...s, permissionMode: e.target.value as any })}><option value="auto">Авто — спорное спрашивать здесь</option><option value="acceptEdits">Только правки файлов — остальное спрашивать</option><option value="bypassPermissions">Всё без вопросов</option></select></label>
        <label className="field"><span>Модель Claude (пусто = по умолчанию)</span><input className="input" value={s.claudeModel || ''} onChange={(e) => setS({ ...s, claudeModel: e.target.value || undefined })} placeholder="напр. opus / sonnet" /></label>
        <label className="field"><span>Модель Codex</span><input className="input" value={s.codexModel || ''} onChange={(e) => setS({ ...s, codexModel: e.target.value || undefined })} /></label>
        <label className="field"><span>Параллельных агентов</span><input className="input" type="number" min={1} max={8} value={s.parallelTasks} onChange={(e) => setS({ ...s, parallelTasks: Number(e.target.value) })} /></label>
        <label className="field"><span>Воркеров рендера</span><input className="input" type="number" min={1} max={12} value={s.renderWorkers} onChange={(e) => setS({ ...s, renderWorkers: Number(e.target.value) })} /></label>
        <label className="field"><span>Модель транскрипции</span><select className="input" value={s.transcribeModel} onChange={(e) => setS({ ...s, transcribeModel: e.target.value })}><option value="Xenova/whisper-tiny">whisper-tiny (быстро)</option><option value="Xenova/whisper-base">whisper-base</option><option value="Xenova/whisper-small">whisper-small (точнее)</option></select></label>
      </div>
      <VoiceSettings s={s} setS={setS} />
      <div className="card small col gap4">
        <div><b>Claude Code:</b> {agents?.claude || 'не найден'}</div>
        <div><b>Codex:</b> {agents?.codex || 'не найден'}</div>
        <div className="muted xsmall">Подключить MCP редактора к агенту в своём терминале:</div>
        <code className="xsmall selectable">{mcpCmd}</code>
        <div className="muted xsmall">Папка проекта: <code className="selectable">{dir}</code></div>
      </div>
      <div className="row gap6 end"><button className="btn ghost sm" onClick={() => setState({ dialog: null })}>Отмена</button><button className="btn primary sm" onClick={save}>Сохранить</button></div>
    </div>
  );
}

function VoiceSettings({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const hasKey = (s as any).hasElevenlabsKey || (s.elevenlabsKey && !s.elevenlabsKey.startsWith('••••'));
  const load = async (refresh = false) => {
    setLoading(true); setErr('');
    try {
      if (s.elevenlabsKey && !s.elevenlabsKey.startsWith('••••')) await api('PATCH', '/api/settings', { elevenlabsKey: s.elevenlabsKey });
      const r = await fetch('/api/voice/voices' + (refresh ? '?refresh=1' : ''));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setVoices(j.voices); setModels(j.models);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { if (hasKey) load(); }, []);
  const preview = (v?: Voice) => { audio.current?.pause(); if (v?.preview) { audio.current = new Audio(v.preview); audio.current.play().catch(() => {}); } };
  const voice = voices?.find((v) => v.id === s.elevenlabsVoiceId);
  return (
    <div className="card col gap10">
      <div className="row between"><span className="strong">Озвучка · ElevenLabs</span>{voices && <span className="muted xsmall">{voices.length} голосов</span>}</div>
      <div className="row gap6">
        <input className="input grow" type="password" placeholder="API-ключ ElevenLabs (xi-api-key)" value={s.elevenlabsKey || ''} onChange={(e) => setS({ ...s, elevenlabsKey: e.target.value })} autoComplete="off" />
        <button className="btn sm" disabled={loading} onClick={() => load(true)}>{loading ? <span className="spinner sm" /> : 'Проверить'}</button>
      </div>
      {err && <div className="error-box">{err}</div>}
      {voices && (
        <div className="grid2">
          <label className="field"><span>Голос по умолчанию</span>
            <div className="row gap6">
              <select className="input grow" value={s.elevenlabsVoiceId || ''} onChange={(e) => setS({ ...s, elevenlabsVoiceId: e.target.value })}>
                <option value="">— выберите —</option>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}</option>)}
              </select>
              <button className="icon-btn" title="Прослушать" disabled={!voice?.preview} onClick={() => preview(voice)}><Icon name="play" size={12} /></button>
            </div>
          </label>
          <label className="field"><span>Модель</span>
            <select className="input" value={s.elevenlabsModel || 'eleven_multilingual_v2'} onChange={(e) => setS({ ...s, elevenlabsModel: e.target.value })}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="muted xsmall">Ключ хранится только локально (~/.agent-videostudio). Озвучка ложится на аудиодорожку, а тайминги слов сразу работают для субтитров.</div>
    </div>
  );
}

const FORMATS = [
  { id: 'mp4', name: 'MP4 · H.264', hint: 'Соцсети, YouTube, мессенджеры' },
  { id: 'prores', name: 'ProRes 4444 · MOV', hint: 'Монтаж в Premiere, DaVinci, Final Cut; поддерживает альфу' },
  { id: 'webm', name: 'WebM · VP9', hint: 'Веб, поддерживает альфу' },
  { id: 'gif', name: 'GIF', hint: 'Превью и стикеры, до 20 fps, без звука' },
] as const;

function ExportDialog() {
  const project = useStore((s) => s.project)!;
  const jobs = useStore((s) => s.jobs);
  const exportsList = useStore((s) => s.exports);
  const end = Math.max(1, ...project.items.map((i) => i.start + i.duration));
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(+end.toFixed(2));
  const [format, setFormat] = useState<'mp4' | 'prores' | 'webm' | 'gif'>(() => (localStorage.getItem('exp.format') as any) || 'mp4');
  const [quality, setQuality] = useState<'high' | 'standard' | 'small'>('standard');
  const [scale, setScale] = useState(1);
  const [blur, setBlur] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const job = [...jobs].reverse()[0];
  const running = job?.status === 'running';
  const alphaOk = format === 'prores' || format === 'webm';
  const start = () => { localStorage.setItem('exp.format', format); api('POST', '/api/export', { from, to, format, quality, scale, motionBlur: blur, transparent: alphaOk && transparent }); };
  const outW = Math.round((project.width * scale) / 2) * 2, outH = Math.round((project.height * scale) / 2) * 2;
  return (
    <div className="col gap16">
      <h2>Экспорт</h2>
      <div className="fmt-grid">
        {FORMATS.map((f) => (
          <button key={f.id} className={'fmt' + (format === f.id ? ' on' : '')} onClick={() => setFormat(f.id)}>
            <span className="fmt-name">{f.name}</span><span className="fmt-hint">{f.hint}</span>
          </button>
        ))}
      </div>
      <div className="exp-opts">
        <label className="field"><span>Фрагмент, с</span><div className="row gap6"><input className="input" type="number" step={0.1} value={from} onChange={(e) => setFrom(Number(e.target.value))} /><span className="muted">—</span><input className="input" type="number" step={0.1} value={to} onChange={(e) => setTo(Number(e.target.value))} /></div></label>
        <label className="field"><span>Размер · {outW}×{outH}</span><div className="seg">{[0.5, 1, 2].map((v) => <button key={v} className={scale === v ? 'on' : ''} onClick={() => setScale(v)}>{v * 100}%</button>)}</div></label>
        {format !== 'gif' && format !== 'prores' && <label className="field"><span>Качество</span><div className="seg">{([['small', 'Компактно'], ['standard', 'Стандарт'], ['high', 'Максимум']] as const).map(([k, l]) => <button key={k} className={quality === k ? 'on' : ''} onClick={() => setQuality(k)}>{l}</button>)}</div></label>}
        <label className="field"><span>Motion blur {blur > 1 ? `· ×${blur} подкадров, затвор 180°` : '· выкл'}</span><div className="seg">{[1, 4, 8].map((v) => <button key={v} className={blur === v ? 'on' : ''} onClick={() => setBlur(v)}>{v === 1 ? 'Выкл' : v === 4 ? 'Мягкий' : 'Кино'}</button>)}</div></label>
        {alphaOk && <label className="field-line"><span>Прозрачный фон (только графика, для наложения в другом редакторе)</span><input type="checkbox" className="toggle" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /></label>}
      </div>
      <div className="row between">
        <span className="muted xsmall">{blur > 1 ? `Рендер графики дольше в ${blur} раз. ` : ''}Цвет BT.709 · {project.fps} fps</span>
        {running
          ? <button className="btn sm" onClick={() => api('POST', `/api/export/${job.id}/cancel`)}>Отменить</button>
          : <button className="btn primary" onClick={start}>Экспортировать</button>}
      </div>
      {job && (
        <div className="col gap8">
          <div className="row between small"><span>{job.status === 'done' ? 'Готово' : job.status === 'error' ? (job.error === 'Отменено' ? 'Отменено' : 'Ошибка') : job.stage}</span><span className="mono">{Math.round(job.progress * 100)}%</span></div>
          <div className="progress"><div style={{ width: `${job.progress * 100}%` }} /></div>
          {job.error && job.error !== 'Отменено' && <pre className="error-box xsmall">{job.error}</pre>}
          {job.output && /\.(mp4|webm)$/.test(job.output) && <video className="export-preview" src={`/p/${job.output}`} controls />}
          {job.output && /\.gif$/.test(job.output) && <img className="export-preview" src={`/p/${job.output}`} alt="" />}
        </div>
      )}
      {exportsList.length > 0 && (
        <div className="col gap4">
          <div className="section-title">Файлы</div>
          {exportsList.slice(0, 8).map((e) => (
            <div key={e.file} className="row gap8 small">
              <a href={`/p/${e.file}`} target="_blank" rel="noreferrer" className="ellipsis grow">{e.file.split('/').pop()}</a>
              <span className="muted xsmall">{(e.size / 1e6).toFixed(1)} MB</span>
              <a className="btn xs" href={`/p/${e.file}`} download>Скачать</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompareDialog({ clipId, sha }: { clipId: string; sha: string }) {
  const project = useStore((s) => s.project)!;
  const [base, setBase] = useState<string | null>(null);
  const [t, setT] = useState(() => {
    const it = project.items.find((i) => i.kind === 'clip' && i.ref === clipId);
    return it ? Math.max(0, time.get() - it.start + it.in) : 1;
  });
  const item = project.items.find((i) => i.kind === 'clip' && i.ref === clipId);
  const dur = item ? item.duration + item.in : getState().clips.find((c) => c.id === clipId)?.duration || 5;
  const a = useRef<HTMLIFrameElement>(null), b = useRef<HTMLIFrameElement>(null);
  useEffect(() => { api('POST', '/api/versions/materialize', { sha, clipId }).then((r) => setBase(r.base)); }, [sha, clipId]);
  useEffect(() => { for (const f of [a.current, b.current]) f?.contentWindow?.postMessage({ __studio: true, type: 'seek', t }, '*'); }, [t, base]);
  const input = encodeURIComponent(JSON.stringify(item ? { params: item.params || {}, offset: item.start - item.in, duration: dur, width: project.width, height: project.height, fps: project.fps } : { width: project.width, height: project.height, fps: project.fps, duration: dur }));
  const scale = 0.3;
  const frame = (src: string, ref: React.RefObject<HTMLIFrameElement | null>, label: string) => (
    <div className="col gap4">
      <div className="small strong">{label}</div>
      <div className="compare-frame" style={{ width: project.width * scale, height: project.height * scale }}>
        <iframe ref={ref} src={src} style={{ width: project.width, height: project.height, transform: `scale(${scale})` }} onLoad={() => setTimeout(() => ref.current?.contentWindow?.postMessage({ __studio: true, type: 'seek', t }, '*'), 300)} />
      </div>
    </div>
  );
  return (
    <div className="col gap12">
      <h2>Сравнение версий · {clipId}</h2>
      <div className="row gap12 wrap">
        {base && frame(`${base}/${clipId}/index.html#${input}`, a, `Версия ${sha}`)}
        {frame(`/p/clips/${clipId}/index.html#${input}`, b, 'Текущая')}
      </div>
      <input type="range" min={0} max={dur} step={1 / project.fps} value={t} onChange={(e) => setT(Number(e.target.value))} />
      <div className="row between small"><span className="muted">t = {t.toFixed(2)}s (время клипа)</span>
        <button className="btn sm" onClick={async () => { if (confirm('Вернуть эту версию?')) { await api('POST', '/api/versions/restore', { sha, path: `clips/${clipId}` }); setState({ dialog: null }); notify('info', 'Восстановлено'); } }}>↺ Вернуть версию {sha}</button>
      </div>
    </div>
  );
}

function Notices() {
  const notices = useStore((s) => s.notices);
  return <div className="notices">{notices.map((n) => <div key={n.id} className={'notice ' + n.level}>{n.text}</div>)}</div>;
}
