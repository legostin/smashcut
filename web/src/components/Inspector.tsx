import { useEffect, useState } from 'react';
import type { Item, ParamSpec, Project } from '../../../shared/types';
import { useStore, useSelectedItem, actions, api, setState, notify, refreshGallery, time } from '../store';
import { Icon } from './Icon';

export function Inspector({ project }: { project: Project }) {
  const item = useSelectedItem();
  if (!item) return <ProjectSettings project={project} />;
  return <ItemInspector key={item.id} item={item} project={project} />;
}

function Num({ label, value, onChange, step = 0.01, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(+value.toFixed(3))), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="number" step={step} min={min} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = Number(v); if (!Number.isNaN(n) && n !== value) onChange(n); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

function ItemInspector({ item, project }: { item: Item; project: Project }) {
  const clip = useStore((s) => (item.kind === 'clip' ? s.clips.find((c) => c.id === item.ref) : undefined));
  const music = useStore((s) => (item.kind === 'music' ? s.music.find((m) => m.id === item.ref) : undefined));
  const media = useStore((s) => (item.kind === 'media' ? s.media.find((m) => m.file === item.ref) : undefined));
  const errors = useStore((s) => s.clipErrors[item.id]);
  const up = (patch: Partial<Item>) => actions.updateItem(item.id, patch);
  const visual = item.kind === 'clip' || (item.kind === 'media' && media?.type !== 'audio');
  const audible = item.kind === 'music' || (item.kind === 'media' && (media?.type === 'audio' || media?.hasAudio));
  return (
    <div className="col gap12">
      <div className="row gap8">
        <span className={`tl-kind kind-${item.kind === 'clip' ? 'graphics' : item.kind === 'music' ? 'music' : media?.type === 'audio' ? 'audio' : 'video'}`} />
        <div className="grow minw0">
          <div className="strong ellipsis">{clip?.name || music?.name || item.ref}</div>
          <div className="muted xsmall ellipsis">{item.kind === 'clip' ? `clips/${item.ref}` : item.kind === 'music' ? `music/${item.ref}/score.js` : `media/${item.ref}`} · {item.id}</div>
        </div>
        <button className="icon-btn" title="Удалить с таймлайна (Del)" onClick={() => actions.removeItem(item.id)}><Icon name="trash" /></button>
      </div>
      {clip?.description && <div className="muted small">{clip.description}</div>}
      {errors?.length ? <div className="error-box">{errors.map((e, i) => <div key={i}>⚠ {e}</div>)}</div> : null}
      <div className="grid3">
        <Num label="Старт, s" value={item.start} min={0} onChange={(v) => up({ start: Math.max(0, v) })} />
        <Num label="Длит., s" value={item.duration} min={0.04} onChange={(v) => up({ duration: Math.max(0.04, v) })} />
        <Num label="Trim in, s" value={item.in} min={0} onChange={(v) => up({ in: Math.max(0, v) })} />
      </div>
      <div className="grid2">
        {visual && <label className="field"><span>Прозрачность</span><input type="range" min={0} max={1} step={0.01} value={item.opacity ?? 1} onChange={(e) => up({ opacity: Number(e.target.value) })} /></label>}
        {audible && <label className="field"><span>Громкость {Math.round((item.volume ?? 1) * 100)}%</span><input type="range" min={0} max={1.5} step={0.01} value={item.volume ?? 1} onChange={(e) => up({ volume: Number(e.target.value) })} /></label>}
        <label className="field"><span>Дорожка</span>
          <select className="input" value={item.track} onChange={(e) => up({ track: e.target.value })}>
            {project.tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      {item.kind === 'media' && media?.type !== 'audio' && (
        <div className="grid3">
          <label className="field"><span>Fit</span><select className="input" value={item.transform?.fit || 'contain'} onChange={(e) => up({ transform: { ...item.transform, fit: e.target.value as 'contain' | 'cover' } })}><option value="contain">contain</option><option value="cover">cover</option></select></label>
          <Num label="Scale" value={item.transform?.scale ?? 1} step={0.05} onChange={(v) => up({ transform: { ...item.transform, scale: v } })} />
          <Num label="X / Y px" value={item.transform?.x ?? 0} step={1} onChange={(v) => up({ transform: { ...item.transform, x: v } })} />
        </div>
      )}
      {clip && Object.keys(clip.schema).length > 0 && (
        <div className="col gap8">
          <div className="section-title row between">
            <span>Параметры шаблона</span>
            {item.params && Object.keys(item.params).length > 0 && <button className="btn xs ghost" onClick={() => api('PATCH', `/api/project`, { items: project.items.map((i) => (i.id === item.id ? { ...i, params: {} } : i)) })}>Сбросить</button>}
          </div>
          {Object.entries(clip.schema).map(([k, spec]) => <ParamField key={k} k={k} spec={spec} value={item.params?.[k] ?? spec.default} onChange={(v) => up({ params: { [k]: v } })} />)}
        </div>
      )}
      {music?.meta && (
        <div className="card small">
          <div><b>{music.meta.bpm}</b> BPM · {music.meta.bars} тактов · {music.meta.duration.toFixed(1)}s</div>
          <div className="muted xsmall">Секции: {music.meta.sections.map((s) => `${s.name} @${s.start.toFixed(1)}s`).join(', ') || '—'}</div>
          {music.meta.markers.length > 0 && <div className="muted xsmall">Маркеры: {music.meta.markers.map((m) => `${m.name} @${m.time.toFixed(1)}s`).join(', ')}</div>}
        </div>
      )}
      <div className="col gap6">
        <div className="section-title">Агент</div>
        <div className="row gap6 wrap">
          <button className="btn sm" onClick={() => setState({ rightTab: 'agent', chatDraft: item.kind === 'clip' ? `В клипе «${clip?.name || item.ref}» ` : item.kind === 'music' ? `В треке «${music?.name}» ` : '' , selectedTaskId: null })}><Icon name="bot" size={13} /> Попросить агента</button>
          <button className="btn sm ghost" onClick={() => setState({ commentMode: true })}><Icon name="comment" size={13} /> Комментарий на кадре</button>
          {item.kind === 'clip' && <button className="btn sm ghost" onClick={async () => { const r = await api('POST', '/api/agent/lint-clip', { clipId: item.ref }); notify(r.ok ? 'info' : 'error', r.ok ? 'Клип проходит проверки контракта' : r.issues.join('\n')); }}><Icon name="check" size={13} /> Проверить</button>}
          {(item.kind === 'clip' || item.kind === 'music') && <button className="btn sm ghost" onClick={async () => { await api('POST', '/api/library', { kind: item.kind, id: item.ref }); notify('info', 'Сохранено в «Моя библиотека»'); refreshGallery(); }}><Icon name="book" size={13} /> В библиотеку</button>}
        </div>
      </div>
      {(item.kind === 'clip' || item.kind === 'music') && <Versions path={item.kind === 'clip' ? `clips/${item.ref}` : `music/${item.ref}`} clipId={item.kind === 'clip' ? item.ref : undefined} />}
    </div>
  );
}

function ParamField({ k, spec, value, onChange }: { k: string; spec: ParamSpec; value: unknown; onChange: (v: unknown) => void }) {
  const label = spec.label || k;
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  if (spec.type === 'color') return <label className="field row-field"><span>{label}</span><div className="row gap6"><input type="color" value={String(local || '#ffffff').slice(0, 7)} onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }} /><code className="xsmall">{String(local)}</code></div></label>;
  if (spec.type === 'boolean') return <label className="field row-field"><span>{label}</span><input type="checkbox" checked={!!local} onChange={(e) => onChange(e.target.checked)} /></label>;
  if (spec.type === 'select') return <label className="field"><span>{label}</span><select className="input" value={String(local)} onChange={(e) => onChange(e.target.value)}>{(spec.options || []).map((o) => <option key={o}>{o}</option>)}</select></label>;
  if (spec.type === 'number') return (
    <label className="field"><span>{label}: <b>{String(local)}</b></span>
      {spec.min != null && spec.max != null && spec.max - spec.min <= 1000
        ? <input type="range" min={spec.min} max={spec.max} step={spec.step || 0.01} value={Number(local)} onChange={(e) => { setLocal(Number(e.target.value)); }} onPointerUp={() => onChange(local)} onKeyUp={() => onChange(local)} />
        : <input className="input" type="number" step={spec.step || 0.01} value={Number(local)} onChange={(e) => setLocal(Number(e.target.value))} onBlur={() => onChange(local)} />}
    </label>
  );
  const commit = () => { if (local !== value) onChange(local); };
  if (spec.type === 'textarea') return <label className="field"><span>{label}</span><textarea className="input" rows={4} value={String(local ?? '')} onChange={(e) => setLocal(e.target.value)} onBlur={commit} /></label>;
  return <label className="field"><span>{label}</span><input className="input" value={String(local ?? '')} onChange={(e) => setLocal(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} /></label>;
}

function Versions({ path, clipId }: { path: string; clipId?: string }) {
  const [list, setList] = useState<{ sha: string; date: string; message: string }[]>([]);
  const fv = useStore((s) => (clipId ? s.fileVersion[clipId] : 0));
  const tasks = useStore((s) => s.tasks.length);
  useEffect(() => { api('GET', `/api/versions?path=${encodeURIComponent(path)}`).then(setList).catch(() => {}); }, [path, fv, tasks]);
  if (!list.length) return null;
  return (
    <div className="col gap6">
      <div className="section-title row gap6"><Icon name="history" size={13} /> Версии</div>
      {list.slice(0, 12).map((v, i) => (
        <div key={v.sha} className="version-row">
          <div className="grow minw0">
            <div className="small ellipsis">{v.message}</div>
            <div className="muted xsmall">{v.sha} · {new Date(v.date).toLocaleString()}</div>
          </div>
          {clipId && i > 0 && <button className="btn xs ghost" title="Сравнить с текущей" onClick={() => setState({ dialog: { compare: { clipId, sha: v.sha } } })}>A/B</button>}
          {i > 0 && <button className="btn xs ghost" title="Вернуть эту версию" onClick={async () => { if (confirm(`Откатить ${path} к ${v.sha}? Текущее состояние сохранится в истории.`)) { await api('POST', '/api/versions/restore', { sha: v.sha, path }); notify('info', 'Версия восстановлена'); } }}>↺</button>}
        </div>
      ))}
    </div>
  );
}

function ProjectSettings({ project }: { project: Project }) {
  const presets: [string, number, number][] = [['16:9 1080p', 1920, 1080], ['9:16 Reels', 1080, 1920], ['1:1', 1080, 1080], ['4:5', 1080, 1350], ['4K', 3840, 2160]];
  return (
    <div className="col gap12">
      <div className="muted small">Ничего не выбрано — настройки проекта. Кликните элемент на таймлайне, чтобы редактировать его.</div>
      <label className="field"><span>Название</span><input className="input" defaultValue={project.name} onBlur={(e) => e.target.value !== project.name && actions.patchProject({ name: e.target.value })} /></label>
      <div className="chips">{presets.map(([n, w, h]) => <button key={n} className={'chip' + (project.width === w && project.height === h ? ' active' : '')} onClick={() => actions.patchProject({ width: w, height: h })}>{n}</button>)}</div>
      <div className="grid3">
        <Num label="Ширина" value={project.width} step={1} onChange={(v) => actions.patchProject({ width: Math.round(v) })} />
        <Num label="Высота" value={project.height} step={1} onChange={(v) => actions.patchProject({ height: Math.round(v) })} />
        <Num label="FPS" value={project.fps} step={1} onChange={(v) => actions.patchProject({ fps: Math.round(v) })} />
      </div>
      <div className="grid2">
        <Num label="Длительность, s" value={project.duration} step={1} onChange={(v) => actions.patchProject({ duration: v })} />
        <label className="field"><span>Фон</span><input type="color" value={project.background} onChange={(e) => actions.patchProject({ background: e.target.value })} /></label>
      </div>
      <div className="col gap6">
        <div className="section-title row between"><span>Маркеры</span><button className="btn xs ghost" onClick={() => actions.patchProject({ markers: [...project.markers, { id: 'm' + Date.now().toString(36), time: +time.get().toFixed(3), label: 'Маркер ' + (project.markers.length + 1) }] })}>+ на плейхеде</button></div>
        {project.markers.map((m) => (
          <div key={m.id} className="row gap6">
            <input className="input grow" defaultValue={m.label} onBlur={(e) => actions.patchProject({ markers: project.markers.map((x) => (x.id === m.id ? { ...x, label: e.target.value } : x)) })} />
            <span className="muted xsmall">{m.time.toFixed(2)}s</span>
            <button className="icon-btn xs" onClick={() => actions.patchProject({ markers: project.markers.filter((x) => x.id !== m.id) })}><Icon name="x" size={12} /></button>
          </div>
        ))}
      </div>
      <Versions path="project.json" />
    </div>
  );
}
