import { useEffect, useRef, useState } from 'react';
import { ScriptPanel } from './components/ScriptPanel';
import { Board } from './components/Board';
import { useStore, setState, api, notify, time, refresh, getState, useSelectedItem, seek as seekTo, actions, projectBase, projectHeaders, openInNewTab, syncUrl, goHome, type View } from './store';
import { Viewer } from './components/Viewer';
import { Timeline } from './components/Timeline';
import { Library } from './components/Library';
import { Chat } from './components/Chat';
import { ItemPanel } from './components/ItemPanel';
import { Icon } from './components/Icon';
import { VersionDialog } from './components/VersionDialog';
import { GeneratorSettings } from './components/GeneratorSettings';
import { Home } from './components/Home';
import { uniqueProjectName } from './components/HeroComposer';
import { Storyboard, SelectionBar } from './components/Storyboard';
import { SceneStrip, useTimelineHotkey } from './components/SceneStrip';
import { Teleprompter } from './components/Teleprompter';
import type { Project, Settings, Voice } from '../../shared/types';
import { t, tn, LANGS, setLocale, useLocale, fmtNumber, type Lang } from './i18n';

function useUndoRedo() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      const r = await api<{ ok: boolean }>('POST', e.shiftKey ? '/api/redo' : '/api/undo');
      if (!r.ok) notify('info', e.shiftKey ? t('Nothing to redo') : t('Nothing to undo'));
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
  const screen = useStore((s) => s.screen);
  const prompter = useStore((s) => s.prompter);
  useEffect(() => { syncUrl(); }, [screen]);
  const [tlHeight, setTlHeight] = useState(() => Number(localStorage.getItem('tlh') || 240));
  const tlOpen = useStore((s) => s.timelineOpen);
  useTimelineHotkey();
  useLandingView();
  if (screen === 'home') return (
    <div className="app-home">
      <Home />
      <Modal open={dialog === 'settings'}><SettingsDialog /></Modal>
      <Reconnecting />
      <Notices />
    </div>
  );
  if (!project) return (
    <div className="app-empty">
      {!connected ? <div className="muted">{t('Connecting to the server…')}</div> : <div className="sheet"><ProjectsDialog /></div>}
      <Notices />
    </div>
  );
  return (
    <div className={'app view-' + view + (tlOpen ? ' tl-open' : '')} style={{ gridTemplateRows: `52px minmax(0, 1fr) ${tlOpen ? tlHeight + 'px' : '56px'}` }}>
      <TopBar />
      <Rail />
      <div className="main">
        <div className="stage-swap">
          <div className={'swap-layer' + (view === 'story' ? '' : ' off')}>{view === 'story' && <Storyboard project={project} />}</div>
          <div className={'swap-layer' + (view === 'edit' ? '' : ' off')}><Viewer project={project} /></div>
          <div className={'swap-layer' + (view === 'board' ? '' : ' off')}>{view === 'board' && <Board project={project} />}</div>
          {view !== 'board' && <SelectionBar />}
        </div>
        <Side project={project} />
        <Library />
      </div>
      {!tlOpen ? <div className="bottom collapsed"><SceneStrip project={project} /></div> : <div className="bottom">
        <div className="resizer" onPointerDown={(e) => {
          const y0 = e.clientY, h0 = tlHeight;
          const mv = (ev: PointerEvent) => { const h = Math.min(window.innerHeight - 300, Math.max(120, h0 - (ev.clientY - y0))); setTlHeight(h); localStorage.setItem('tlh', String(h)); };
          window.addEventListener('pointermove', mv);
          window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
        }} />
        <Timeline project={project} />
      </div>}
      <Modal open={dialog === 'projects'}><ProjectsDialog /></Modal>
      <Modal open={dialog === 'settings'}><SettingsDialog /></Modal>
      <Modal open={dialog === 'export'}><ExportDialog /></Modal>
      <Modal open={dialog === 'version'}><VersionDialog /></Modal>
      <Modal open={!!dialog && typeof dialog === 'object'} wide>{dialog && typeof dialog === 'object' && 'compare' in dialog ? <CompareDialog clipId={dialog.compare.clipId} sha={dialog.compare.sha} /> : null}</Modal>
      <Lightbox />
      {prompter && <Teleprompter />}
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
        <button className={tab === 'agent' ? 'on' : ''} onClick={() => setState({ sideTab: 'agent' })}>{t('Agent')}{running > 0 && <span className="tab-live" />}</button>
        <button className={tab === 'script' ? 'on' : ''} onClick={() => setState({ sideTab: 'script' })}>{t('Script')}{scenes.length > 0 && <span className="tab-count">{doneScenes}/{scenes.length}</span>}</button>
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
  return <div className={'reconnect' + (show ? ' show' : '')}><span className="spinner sm" /> {t('Reconnecting to the editor… agents keep working')}</div>;
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

/** when a project opens: if it has clips but no scenes, show the edit (player + timeline) instead of an empty storyboard */
function useLandingView() {
  const project = useStore((s) => s.project);
  const scenes = useStore((s) => s.script.scenes.length);
  const key = project ? projectBase() : '';
  const landed = useRef('');
  useEffect(() => {
    if (!project || !key || landed.current === key) return;
    landed.current = key;
    if (scenes === 0 && project.items.length > 0 && getState().view === 'story') {
      setState({ view: 'edit' });
      if (!getState().timelineOpen) actions.setTimelineOpen(true);
    }
  }, [key, project, scenes]);
}

function TopBar() {
  const project = useStore((s) => s.project)!;
  const connected = useStore((s) => s.connected);
  const job = useStore((s) => s.jobs.find((j) => j.status === 'running'));
  const running = useStore((s) => s.tasks.filter((x) => x.status === 'running' && !x.waiting && !(x.question && x.question.answer == null)).length); // waiting for sub-agents / for your answer = idle
  const [family, setFamily] = useState<{ dir: string; label?: string; width: number; height: number; current?: boolean }[]>([]);
  const curVer = family.find((v) => v.current)?.label;
  const shownName = curVer && curVer !== 'Original' && project.name.endsWith(' — ' + curVer) ? project.name.slice(0, -(' — ' + curVer).length) : project.name;
  useEffect(() => { document.title = /Smashcut/.test(project.name) ? project.name : `${project.name} — Smashcut`; }, [project.name]);
  useEffect(() => { api<typeof family>('GET', '/api/variants').then(setFamily).catch(() => setFamily([])); }, [project.name, project.width, project.height]);
  const openVariant = async (dir: string) => { await api('POST', '/api/projects/open', { path: dir }); await refresh(); time.set(0); setState({ selectedItemId: null, selectedTaskId: null, sceneSelection: [] }); };
  return (
    <header className="topbar">
      <div className="row gap10 minw0">
        <span className="logo" role="button" tabIndex={0} title={t('Home')} onClick={goHome} onKeyDown={(e) => e.key === 'Enter' && goHome()}><svg width="16" height="16" viewBox="0 0 24 24"><path d="M4 4h9.5L8 20H4z" fill="currentColor" /><path d="M16 4h4v16h-9.5z" fill="currentColor" transform="translate(1.2 -1.2)" /></svg></span>
        <button className="project-name" onClick={() => setState({ dialog: 'projects' })} title={t('Projects')}>
          <span className={'conn' + (connected ? '' : ' off')} /><span className="ellipsis" title={project.name}>{shownName}</span><Icon name="chevron" size={12} />
        </button>
        <nav className="versions" aria-label={t('Versions of this video')}>
          {(family.length > 1 ? family : [{ dir: '', label: 'Original', width: project.width, height: project.height, current: true }]).map((v) => (
            <button key={v.dir || 'cur'} className={'ver' + (v.current ? ' on' : '')} onClick={() => !v.current && v.dir && openVariant(v.dir)} title={v.dir}>
              <span className="ver-ratio" style={{ aspectRatio: `${v.width} / ${v.height}` }} />{v.label === 'Original' || !v.label ? t('Original') : v.label}
            </button>
          ))}
          <button className="ver add" onClick={() => setState({ dialog: 'version' })} title={t('A copy in another language, format or length — the agent adapts it')}><Icon name="plus" size={11} /> {t('version')}</button>
        </nav>
      </div>
      <div className="row gap8 end">
        {running > 0 && <button className="agents-pill" onClick={() => setState({ sideTab: 'agent' })}><span className="pulse" />{tn(running, '{n} agent working', '{n} agents working')}</button>}
        {job && <div className="tb-progress"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /><span>{t('Export {p}%', { p: Math.round(job.progress * 100) })}</span></div>}
        <button className="btn sm accent" onClick={() => setState({ dialog: 'export' })}>{t('Export')}</button>
      </div>
    </header>
  );
}

/** left navigation rail: main views + libraries/settings */
function Rail() {
  const view = useStore((s) => s.view);
  const libraryOpen = useStore((s) => s.libraryOpen);
  const libraryTab = useStore((s) => s.libraryTab);
  const lib = (tab: 'inspiration' | 'templates' | 'media' | 'project') => setState({ libraryOpen: !(libraryOpen && libraryTab === tab), libraryTab: tab });
  const V = ({ v, icon, label }: { v: View; icon: string; label: string }) => (
    <button className={'rail-btn' + (view === v ? ' on' : '')} onClick={() => actions.setView(v)} aria-label={label} data-tip={label}><Icon name={icon} size={19} /></button>
  );
  return (
    <nav className="rail" aria-label={t('Sections')}>
      <V v="story" icon="story" label={t('Storyboard')} />
      <V v="edit" icon="edit" label={t('Edit')} />
      <V v="board" icon="canvas" label={t('Canvas')} />
      <span className="rail-sep" />
      <button className={'rail-btn' + (libraryOpen && libraryTab === 'inspiration' ? ' on' : '')} onClick={() => lib('inspiration')} aria-label={t('Inspiration')} data-tip={t('Inspiration')}><Icon name="star" size={18} /></button>
      <button className={'rail-btn' + (libraryOpen && libraryTab === 'templates' ? ' on' : '')} onClick={() => lib('templates')} aria-label={t('Techniques')} data-tip={t('Techniques')}><Icon name="sparkle" size={18} /></button>
      <button className={'rail-btn' + (libraryOpen && libraryTab === 'media' ? ' on' : '')} onClick={() => lib('media')} aria-label={t('Media')} data-tip={t('Media')}><Icon name="image" size={19} /></button>
      <button className={'rail-btn' + (libraryOpen && libraryTab === 'project' ? ' on' : '')} onClick={() => lib('project')} aria-label={t('Edit library')} data-tip={t('Transitions, effects, masks')}><Icon name="wand" size={19} /></button>
      <div className="grow" />
      <button className="rail-btn" onClick={() => setState({ dialog: 'settings' })} aria-label={t('Settings')} data-tip={t('Settings')}><Icon name="gear" size={18} /></button>
    </nav>
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
  const dir = useStore((s) => s.dir);
  const [data, setData] = useState<{ current: string | null; projects: string[]; projectsDir: string; open?: string[]; ids?: Record<string, string> } | null>(null);
  const [name, setName] = useState('');
  const [size, setSize] = useState('1920x1080');
  const [openPath, setOpenPath] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    api('GET', '/api/projects').then(setData);
    api<{ projects: { dir: string; name: string }[] }>('GET', '/api/home').then((h) => setNames(Object.fromEntries(h.projects.map((p) => [p.dir, p.name])))).catch(() => {});
  }, []);
  const open = async (p: string) => { await api('POST', '/api/projects/open', { path: p }); await refresh(); setState({ dialog: null, selectedItemId: null, selectedTaskId: null }); time.set(0); };
  const create = async () => {
    const [w, h] = size.split('x').map(Number);
    await api('POST', '/api/projects/create', { name: await uniqueProjectName(name.trim() || t('New project')), width: w, height: h });
    await refresh(); setState({ dialog: null, selectedItemId: null, selectedTaskId: null }); time.set(0);
  };
  return (
    <div className="col gap16">
      <div className="row between"><h2>{t('Projects')}</h2><button className="link" onClick={() => { setState({ dialog: null }); goHome(); }}>{t('Home')}</button></div>
      <div className="col gap6">
        {data?.projects.map((p) => {
          const id = data.ids?.[p];
          const here = p === dir;
          return (
            <div key={p} className={'project-row' + (here ? ' current' : '')}>
              <button className="project-open" onClick={(e) => (e.metaKey || e.ctrlKey) && id ? openInNewTab(id) : !here && open(p)} title={t('Open here · ⌘-click opens in a new tab')}>
                <Icon name="folder" size={14} /> <span className="strong project-row-name ellipsis">{names[p] || p.split('/').pop()}</span>
                {here && <span className="pill xs">{t('this tab')}</span>}
                <span className="muted xsmall ellipsis">{p}</span>
              </button>
              {id && !here && <button className="icon-btn xs" title={t('Open in a new tab')} onClick={() => openInNewTab(id)}><Icon name="external" size={13} /></button>}
            </div>
          );
        })}
      </div>
      <div className="card col gap8">
        <div className="strong small">{t('New project')}</div>
        <div className="row gap6">
          <input className="input grow" placeholder={t('Name')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="1920x1080">16:9 · 1920×1080</option><option value="1080x1920">9:16 · 1080×1920</option><option value="1080x1080">1:1 · 1080×1080</option><option value="1080x1350">4:5 · 1080×1350</option><option value="3840x2160">4K</option>
          </select>
          <button className="btn primary sm" onClick={create}>{t('Create')}</button>
        </div>
        <div className="muted xsmall">{t('Created in {dir}. A project is a regular folder with git history.', { dir: data?.projectsDir ?? '' })}</div>
      </div>
      <div className="row gap6">
        <input className="input grow" placeholder={t('/path/to/project/folder')} value={openPath} onChange={(e) => setOpenPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && openPath && open(openPath)} />
        <button className="btn sm" onClick={() => openPath && open(openPath)}>{t('Open')}</button>
      </div>
    </div>
  );
}

function SettingsDialog() {
  const settings = useStore((s) => s.settings);
  const agents = useStore((s) => s.agents);
  const dir = useStore((s) => s.dir);
  const repo = useStore((s) => (s as any).repo as string | undefined);
  const home = useStore((s) => s.screen === 'home');
  const [s, setS] = useState<Settings | undefined>(settings);
  /** the learned-taste box registers its unsaved edit here, so the one Save button saves it too */
  const tasteSave = useRef<(() => Promise<unknown>) | null>(null);
  if (!s) return null;
  const save = async () => {
    if (tasteSave.current) await tasteSave.current().catch((e) => notify('error', (e as Error).message));
    const next = await api('PATCH', '/api/settings', s); setState({ settings: next, agent: next.defaultAgent, dialog: null }); notify('info', t('Saved'));
  };
  const port = import.meta.env.DEV ? '4317' : location.port || '4317';
  const mcpCmd = `claude mcp add studio -e STUDIO_URL=${location.protocol}//${location.hostname}:${port} -- node ${repo || '<repo>'}/server/mcp/stdio.mjs`;
  return (
    <div className="col gap12">
      <h2>{t('Settings')}</h2>
      <div className="grid2">
        <LanguageField />
        <label className="field"><span>{t('Default agent')}</span><select className="input" value={s.defaultAgent} onChange={(e) => setS({ ...s, defaultAgent: e.target.value as any })}><option value="claude">Claude Code</option><option value="codex">Codex</option></select></label>
        <label className="field"><span>{t('Agent permissions')}</span><select className="input" value={s.permissionMode} onChange={(e) => setS({ ...s, permissionMode: e.target.value as any })}><option value="auto">{t('Auto — ask here when in doubt')}</option><option value="acceptEdits">{t('File edits only — ask for the rest')}</option><option value="bypassPermissions">{t('Everything, no questions')}</option></select></label>
        <label className="field"><span>{t('Claude model')}</span><input className="input" value={s.claudeModel || ''} onChange={(e) => setS({ ...s, claudeModel: e.target.value || undefined })} placeholder={t('Default (e.g. opus / sonnet)')} /></label>
        <label className="field"><span>{t('Codex model')}</span><input className="input" value={s.codexModel || ''} onChange={(e) => setS({ ...s, codexModel: e.target.value || undefined })} placeholder={t('Default')} /></label>
        <label className="field"><span>{t('Export speed (parallel renders)')}</span><input className="input" type="number" min={1} max={12} value={s.renderWorkers} onChange={(e) => setS({ ...s, renderWorkers: Number(e.target.value) })} /></label>
        <label className="field"><span>{t('Speech recognition (subtitles)')}</span><select className="input" value={s.transcribeModel} onChange={(e) => setS({ ...s, transcribeModel: e.target.value })}><option value="Xenova/whisper-tiny">{t('whisper-tiny (fast)')}</option><option value="Xenova/whisper-base">whisper-base</option><option value="Xenova/whisper-small">{t('whisper-small (more accurate)')}</option></select></label>
      </div>
      <AgentPoolSettings s={s} setS={setS} />
      <HouseStyleSettings s={s} setS={setS} tasteSave={tasteSave} />
      <VoiceSettings s={s} setS={setS} />
      <GeneratorSettings s={s} setS={setS} />
      <div className="card small col gap4">
        <span className="strong">{t('Agents on this computer')}</span>
        <div><b>Claude Code:</b> {agents?.claude || t('not found')}</div>
        <div><b>Codex:</b> {agents?.codex || t('not found')}</div>
        <div className="muted xsmall">{t('Connect the editor MCP to an agent in your own terminal:')}</div>
        <code className="xsmall selectable">{mcpCmd}</code>
        {!home && <div className="muted xsmall">{t('Project folder:')} <code className="selectable">{dir}</code></div>}
      </div>
      <div className="row gap6 end settings-foot"><button className="btn ghost sm" onClick={() => setState({ dialog: null })}>{t('Cancel')}</button><button className="btn primary sm" onClick={save}>{t('Save')}</button></div>
    </div>
  );
}

/** how many agents run at once, and whether a task may split its work between sub-agents */
function AgentPoolSettings({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  const sub = s.subagents !== false;
  return (
    <div className="set-section col gap10">
      <div className="section-title">{t('Agents')}</div>
      <div className="set-row">
        <div className="col gap2 grow">
          <span className="small">{t('Agents at once (maximum)')}</span>
          <span className="muted xsmall">{t('The most agents working at the same time — tasks and their sub-agents together, across all open projects. The rest wait in the queue. A lead agent that is just waiting for its sub-agents does not take a slot.')}</span>
        </div>
        <Stepper value={s.parallelTasks} min={1} max={8} onChange={(v) => setS({ ...s, parallelTasks: v })} />
      </div>
      <div className="set-row">
        <div className="col gap2 grow">
          <span className="small">{t('Sub-agents')}</span>
          <span className="muted xsmall">{t('A task may split its work: the lead agent hands self-contained assignments (one clip, the music, a voice-over pass) to sub-agents that work in parallel, then reviews and assembles the result. Sub-agents appear under their task in the agent panel. Faster, but uses more of your agent quota.')}</span>
        </div>
        <input type="checkbox" className="toggle" checked={sub} onChange={(e) => setS({ ...s, subagents: e.target.checked })} />
      </div>
      <div className="set-row">
        <div className="col gap2 grow">
          <span className="small">{t('Use my Claude Code / Codex setup')}</span>
          <span className="muted xsmall">{t('Off (recommended): agents get only the editor tools and the project skills — faster start, cleaner context, no access to your other MCP servers (mail, calendars, browsers), hooks or plugins. On: agents load your global configuration.')}</span>
        </div>
        <input type="checkbox" className="toggle" checked={!!s.agentUserConfig} onChange={(e) => setS({ ...s, agentUserConfig: e.target.checked })} />
      </div>
      {sub && (
        <div className="set-row">
          <div className="col gap2 grow">
            <span className="small">{t('Sub-agents per task')}</span>
            <span className="muted xsmall">{t('How many sub-agents one task may run at the same time, within the overall limit above. Sub-agents start before new tasks in the queue.')}</span>
          </div>
          <Stepper value={s.maxSubagents ?? 3} min={1} max={6} onChange={(v) => setS({ ...s, maxSubagents: v })} />
        </div>
      )}
      <div className="set-row">
        <div className="col gap2 grow">
          <span className="small">{t('Art director review')}</span>
          <span className="muted xsmall">{(s.artDirector || 'light') === 'light'
            ? t('Light: free measured checks on every scene, and one fresh-eyes review of the whole video at the end. Good results at a small cost.')
            : s.artDirector === 'scenes'
              ? t('Thorough: a fresh-eyes critic reviews every scene before it is done, then the whole video. Best results, slower and costs more.')
              : t('Off: the agent checks its own work with measured checks; you can still ask for a review on any scene.')}</span>
        </div>
        <select className="input" style={{ width: 140 }} value={s.artDirector || 'light'} onChange={(e) => setS({ ...s, artDirector: e.target.value as any })}>
          <option value="light">{t('Light')}</option>
          <option value="scenes">{t('Thorough')}</option>
          <option value="off">{t('Off')}</option>
        </select>
      </div>
      {(s.artDirector || 'light') !== 'off' && (
        <div className="set-row">
          <div className="col gap2 grow">
            <span className="small">{t('Art director model')}</span>
            <span className="muted xsmall">{t('Sonnet sees well and costs a fraction of Opus. Pick Opus for the most demanding work.')}</span>
          </div>
          <select className="input" style={{ width: 140 }} value={s.artDirectorModel || ''} onChange={(e) => setS({ ...s, artDirectorModel: e.target.value || undefined })}>
            <option value="">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="fable">Fable</option>
          </select>
        </div>
      )}
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span>{value}</span>
      <button disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** the user's standing instructions for every project (sent to agents with each task) */
function HouseStyleSettings({ s, setS, tasteSave }: { s: Settings; setS: (s: Settings) => void; tasteSave: React.MutableRefObject<(() => Promise<unknown>) | null> }) {
  const h = s.houseStyle || {};
  const set = (k: 'style' | 'direction' | 'colors', v: string) => setS({ ...s, houseStyle: { ...h, [k]: v } });
  return (
    <div className="set-section col gap10">
      <div className="col gap2">
        <div className="section-title">{t('Your style')}</div>
        <span className="muted xsmall">{t('Standing instructions for agents in every project. A project’s own script and design system win when they conflict.')}</span>
      </div>
      <label className="field"><span>{t('Visual style')}</span>
        <textarea className="input" rows={2} value={h.style || ''} onChange={(e) => set('style', e.target.value)} placeholder={t('e.g. clean Swiss minimalism, lots of negative space, no gradients or glow, flat shapes')} />
      </label>
      <label className="field"><span>{t('Direction & pacing')}</span>
        <textarea className="input" rows={2} value={h.direction || ''} onChange={(e) => set('direction', e.target.value)} placeholder={t('e.g. hook in the first 2 s, cuts on the beat, calm easing (power3.out), no shaky cams, end on the logo')} />
      </label>
      <label className="field"><span>{t('Colours & type')}</span>
        <textarea className="input" rows={2} value={h.colors || ''} onChange={(e) => set('colors', e.target.value)} placeholder={t('e.g. off-black #111 background, one accent #FF5A36, Inter for text, Unbounded for titles')} />
      </label>
      <LearnedTaste saveRef={tasteSave} />
    </div>
  );
}

/** the taste profile the agents learned from the user's picks, approvals, notes, reverts and 👍/👎 (editable) */
function LearnedTaste({ saveRef }: { saveRef: React.MutableRefObject<(() => Promise<unknown>) | null> }) {
  type St = { profile: string; events: number; pending: number; distilledAt?: string; lastError?: string; running?: boolean };
  const [st, setSt] = useState<St | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'' | 'distill' | 'forget'>('');
  const [confirmForget, setConfirmForget] = useState(false);
  const load = (r?: St) => (r ? Promise.resolve(r) : api<St>('GET', '/api/taste')).then((x) => { setSt(x); setDraft(x.profile); });
  useEffect(() => { load().catch(() => {}); }, []);
  const run = async (k: 'distill' | 'forget', fn: () => Promise<St>) => {
    setBusy(k);
    try { await load(await fn()); } catch (e) { notify('error', (e as Error).message); load().catch(() => {}); } finally { setBusy(''); }
  };
  const dirty = !!st && draft.trim() !== st.profile.trim();
  // an unsaved edit here is saved by the dialog's Save button
  useEffect(() => { saveRef.current = dirty ? () => api<St>('PUT', '/api/taste', { profile: draft }) : null; return () => { saveRef.current = null; }; }, [dirty, draft, saveRef]);
  if (!st) return null;
  return (
    <div className="col gap6 taste-learned">
      <div className="row between">
        <span className="small">{t('Learned taste')}</span>
        <span className="muted xsmall">{tn(st.pending, '{n} signal since last update', '{n} signals since last update')}</span>
      </div>
      <span className="muted xsmall">{t('Agents learn it from what you do: the drafts you pick, scenes you approve or send back, your notes, reverted agent work and 👍/👎 on finished tasks. Edit it freely.')}</span>
      <textarea className="input mono" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Nothing learned yet — it fills in as you work.')} />
      {st.lastError && <span className="muted xsmall">{t('Last update failed: {err}', { err: st.lastError })}</span>}
      <div className="row gap6">
        <button className="btn sm" title={t('Turn the new signals into the profile now (it also happens on its own)')} disabled={!st.pending || dirty || !!busy} onClick={() => run('distill', () => api<St>('POST', '/api/taste/distill'))}>{busy === 'distill' ? <><span className="spinner sm" /> {t('Updating…')}</> : t('Update now')}</button>
        {dirty && <span className="muted xsmall">{t('Your edit is saved with the Save button below.')}</span>}
        <span className="grow" />
        {confirmForget
          ? <>
              <span className="muted xsmall">{t('Forget everything learned?')}</span>
              <button className="btn sm" disabled={!!busy} onClick={() => { setConfirmForget(false); run('forget', () => api<St>('DELETE', '/api/taste')); }}>{t('Forget')}</button>
              <button className="btn sm ghost" onClick={() => setConfirmForget(false)}>{t('Cancel')}</button>
            </>
          : <button className="btn sm ghost" disabled={!!busy || (!st.profile && !st.events)} onClick={() => setConfirmForget(true)}>{t('Forget')}</button>}
      </div>
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
      const r = await fetch('/api/voice/voices' + (refresh ? '?refresh=1' : ''), { headers: projectHeaders() });
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
      <div className="row between"><span className="strong">{t('Voiceover · ElevenLabs')}</span>{voices && <span className="muted xsmall">{tn(voices.length, '{n} voice', '{n} voices')}</span>}</div>
      <div className="row gap6">
        <input className="input grow" type="password" placeholder={t('ElevenLabs API key (xi-api-key)')} value={s.elevenlabsKey || ''} onChange={(e) => setS({ ...s, elevenlabsKey: e.target.value })} autoComplete="off" />
        <button className="btn sm" disabled={loading} onClick={() => load(true)}>{loading ? <span className="spinner sm" /> : t('Check')}</button>
      </div>
      {err && <div className="error-box">{err}</div>}
      {voices && (
        <div className="grid2">
          <label className="field"><span>{t('Default voice')}</span>
            <div className="row gap6">
              <select className="input grow" value={s.elevenlabsVoiceId || ''} onChange={(e) => setS({ ...s, elevenlabsVoiceId: e.target.value })}>
                <option value="">{t('— choose —')}</option>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}</option>)}
              </select>
              <button className="icon-btn" title={t('Listen')} disabled={!voice?.preview} onClick={() => preview(voice)}><Icon name="play" size={12} /></button>
            </div>
          </label>
          <label className="field"><span>{t('Model')}</span>
            <select className="input" value={s.elevenlabsModel || 'eleven_multilingual_v2'} onChange={(e) => setS({ ...s, elevenlabsModel: e.target.value })}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="muted xsmall">{t('The key is stored only locally (~/.smashcut). The voiceover lands on an audio track, and word timings work for subtitles right away.')}</div>
    </div>
  );
}

const FORMATS = [
  { id: 'mp4', name: 'MP4 · H.264', hint: 'Social media, YouTube, messengers' },
  { id: 'prores', name: 'ProRes 4444 · MOV', hint: 'Editing in Premiere, DaVinci, Final Cut; supports alpha' },
  { id: 'webm', name: 'WebM · VP9', hint: 'Web, supports alpha' },
  { id: 'gif', name: 'GIF', hint: 'Previews and stickers, up to 20 fps, no sound' },
] as const;

function ExportDialog() {
  const project = useStore((s) => s.project)!;
  const jobs = useStore((s) => s.jobs);
  const exportsList = useStore((s) => s.exports);
  const end = project.items.length ? Math.max(1, ...project.items.map((i) => i.start + i.duration)) : Math.max(1, project.duration);
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
      <h2>{t('Export')}</h2>
      <div className="fmt-grid">
        {FORMATS.map((f) => (
          <button key={f.id} className={'fmt' + (format === f.id ? ' on' : '')} onClick={() => setFormat(f.id)}>
            <span className="fmt-name">{f.name}</span><span className="fmt-hint">{t(f.hint)}</span>
          </button>
        ))}
      </div>
      <div className="exp-opts">
        <label className="field"><span>{t('Range, s')}</span><div className="row gap6"><input className="input" type="number" step={0.1} value={from} onChange={(e) => setFrom(Number(e.target.value))} /><span className="muted">—</span><input className="input" type="number" step={0.1} value={to} onChange={(e) => setTo(Number(e.target.value))} /></div></label>
        <label className="field"><span>{t('Size · {w}×{h}', { w: outW, h: outH })}</span><div className="seg">{[0.5, 1, 2].map((v) => <button key={v} className={scale === v ? 'on' : ''} onClick={() => setScale(v)}>{v * 100}%</button>)}</div></label>
        {format !== 'gif' && format !== 'prores' && <label className="field"><span>{t('Quality')}</span><div className="seg">{([['small', 'Compact'], ['standard', 'Standard'], ['high', 'Maximum']] as const).map(([k, l]) => <button key={k} className={quality === k ? 'on' : ''} onClick={() => setQuality(k)}>{t(l)}</button>)}</div></label>}
        <label className="field"><span>{t('Motion blur')} {blur > 1 ? t('· ×{n} subframes, 180° shutter', { n: blur }) : t('· off')}</span><div className="seg">{[1, 4, 8].map((v) => <button key={v} className={blur === v ? 'on' : ''} onClick={() => setBlur(v)}>{v === 1 ? t('Off') : v === 4 ? t('Soft') : t('Cinema')}</button>)}</div></label>
        {alphaOk && <label className="field-line"><span>{t('Transparent background (graphics only, for overlaying in another editor)')}</span><input type="checkbox" className="toggle" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /></label>}
      </div>
      <div className="row between">
        <span className="muted xsmall">{blur > 1 ? t('Graphics render {n}× slower. ', { n: blur }) : ''}{t('Color BT.709 · {fps} fps', { fps: project.fps })}</span>
        {running
          ? <button className="btn sm" onClick={() => api('POST', `/api/export/${job.id}/cancel`)}>{t('Cancel export')}</button>
          : <button className="btn primary" onClick={start}>{t('Start export')}</button>}
      </div>
      {job && (
        <div className="col gap8">
          <div className="row between small"><span>{job.status === 'done' ? t('Done') : job.status === 'error' ? (isCancelled(job.error) ? t('Cancelled') : t('Error')) : t(job.stageKey || job.stage, job.stageParams)}</span><span className="mono">{Math.round(job.progress * 100)}%</span></div>
          <div className="progress"><div style={{ width: `${job.progress * 100}%` }} /></div>
          {job.error && !isCancelled(job.error) && <pre className="error-box xsmall">{job.error}</pre>}
          {job.output && /\.(mp4|webm)$/.test(job.output) && <video className="export-preview" src={`${projectBase()}/${job.output}`} controls />}
          {job.output && /\.gif$/.test(job.output) && <img className="export-preview" src={`${projectBase()}/${job.output}`} alt="" />}
        </div>
      )}
      {exportsList.length > 0 && (
        <div className="col gap4">
          <div className="section-title">{t('Files')}</div>
          {exportsList.slice(0, 8).map((e) => (
            <div key={e.file} className="row gap8 small">
              <a href={`${projectBase()}/${e.file}`} target="_blank" rel="noreferrer" className="ellipsis grow">{e.file.split('/').pop()}</a>
              <span className="muted xsmall">{fmtNumber(e.size / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB</span>
              <a className="btn xs" href={`${projectBase()}/${e.file}`} download>{t('Download')}</a>
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
  const [tm, setT] = useState(() => {
    const it = project.items.find((i) => i.kind === 'clip' && i.ref === clipId);
    return it ? Math.max(0, time.get() - it.start + it.in) : 1;
  });
  const item = project.items.find((i) => i.kind === 'clip' && i.ref === clipId);
  const dur = item ? item.duration + item.in : getState().clips.find((c) => c.id === clipId)?.duration || 5;
  const a = useRef<HTMLIFrameElement>(null), b = useRef<HTMLIFrameElement>(null);
  useEffect(() => { api('POST', '/api/versions/materialize', { sha, clipId }).then((r) => setBase(r.base)); }, [sha, clipId]);
  useEffect(() => { for (const f of [a.current, b.current]) f?.contentWindow?.postMessage({ __studio: true, type: 'seek', t: tm }, '*'); }, [tm, base]);
  const input = encodeURIComponent(JSON.stringify(item ? { params: item.params || {}, offset: item.start - item.in, duration: dur, width: project.width, height: project.height, fps: project.fps } : { width: project.width, height: project.height, fps: project.fps, duration: dur }));
  const scale = 0.3;
  const frame = (src: string, ref: React.RefObject<HTMLIFrameElement | null>, label: string) => (
    <div className="col gap4">
      <div className="small strong">{label}</div>
      <div className="compare-frame" style={{ width: project.width * scale, height: project.height * scale }}>
        <iframe ref={ref} src={src} style={{ width: project.width, height: project.height, transform: `scale(${scale})` }} onLoad={() => setTimeout(() => ref.current?.contentWindow?.postMessage({ __studio: true, type: 'seek', t: tm }, '*'), 300)} />
      </div>
    </div>
  );
  return (
    <div className="col gap12">
      <h2>{t('Compare versions · {clip}', { clip: clipId })}</h2>
      <div className="row gap12 wrap">
        {base && frame(`${base}/${clipId}/index.html#${input}`, a, t('Version {sha}', { sha }))}
        {frame(`${projectBase()}/clips/${clipId}/index.html#${input}`, b, t('Current'))}
      </div>
      <input type="range" min={0} max={dur} step={1 / project.fps} value={tm} onChange={(e) => setT(Number(e.target.value))} />
      <div className="row between small"><span className="muted">t = {tm.toFixed(2)}s {t('(clip time)')}</span>
        <button className="btn sm" onClick={async () => { if (confirm(t('Restore this version?'))) { await api('POST', '/api/versions/restore', { sha, path: `clips/${clipId}` }); setState({ dialog: null }); notify('info', t('Restored')); } }}>↺ {t('Restore version {sha}', { sha })}</button>
      </div>
    </div>
  );
}

function isCancelled(err?: string) { return err === 'Cancelled' || err === '\u041e\u0442\u043c\u0435\u043d\u0435\u043d\u043e'; /* legacy server value */ }

function LanguageField() {
  const lang = useLocale();
  return (
    <label className="field"><span>{t('Language')}</span>
      <select className="input" value={lang} onChange={(e) => setLocale(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </label>
  );
}

function Notices() {
  const notices = useStore((s) => s.notices);
  return <div className="notices">{notices.map((n) => <div key={n.id} className={'notice ' + n.level}>{n.text}</div>)}</div>;
}
