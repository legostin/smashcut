import { useEffect, useState } from 'react';
import type { Item, ParamSpec, Project } from '../../../shared/types';
import { useStore, actions, api, setState, notify, refreshGallery, getState } from '../store';
import { Icon } from './Icon';
import { FxPanel } from './FxPanel';
import { LayoutPanel, TokenChip } from './LayoutPanel';
import { t, fmtDate } from '../i18n';

/** Contextual panel for the selected timeline item: the few controls that matter + "ask the agent". */
export function ItemPanel({ item, project }: { item: Item; project: Project }) {
  const clip = useStore((s) => (item.kind === 'clip' ? s.clips.find((c) => c.id === item.ref) : undefined));
  const music = useStore((s) => (item.kind === 'music' ? s.music.find((m) => m.id === item.ref) : undefined));
  const media = useStore((s) => (item.kind === 'media' ? s.media.find((m) => m.file === item.ref) : undefined));
  const errors = useStore((s) => s.clipErrors[item.id]);
  const bindings = useStore((s) => s.clipBindings[item.id]);
  const design = useStore((s) => s.design);
  const [ask, setAsk] = useState('');
  const up = (patch: Partial<Item>) => actions.updateItem(item.id, patch);
  const name = clip?.name || music?.name || item.ref;
  const visual = item.kind === 'clip' || (item.kind === 'media' && media?.type !== 'audio');
  const audible = item.kind === 'music' || (item.kind === 'media' && (media?.type === 'audio' || media?.hasAudio));
  const schema = Object.fromEntries(Object.entries(clip?.schema || {}).filter(([k, v]) => !k.startsWith('__') && !(v as any).hidden));
  const askAgent = async () => {
    const what = ask.trim();
    if (!what) return;
    const subject = item.kind === 'clip' ? `In clip "${name}" (clips/${item.ref})` : item.kind === 'music' ? `In track "${name}" (music/${item.ref})` : `For timeline item ${item.ref}`;
    await actions.startTask(`${subject}: ${what}`, { itemId: item.id });
    setAsk('');
  };
  return (
    <div className="item-panel">
      <div className="ip-head">
        <button className="icon-btn" title={t('Back to the agent (Esc)')} onClick={() => setState({ selectedItemId: null })}><Icon name="back" size={15} /></button>
        <div className="grow minw0">
          <div className="ip-title ellipsis">{name}</div>
          <div className="ip-sub ellipsis">{item.kind === 'clip' ? t('Graphics') : item.kind === 'music' ? `${t('Music')}${music?.meta ? ` · ${music.meta.bpm} BPM` : ''}` : media?.type === 'audio' ? t('Audio') : media?.type === 'image' ? t('Image') : t('Video')} · {item.start.toFixed(2)}–{(item.start + item.duration).toFixed(2)} s</div>
        </div>
        <Menu item={item} />
      </div>

      <div className="ip-body">
        {errors?.length ? <div className="ip-error">{errors.slice(-2).join('\n')}</div> : null}

        {Object.keys(schema).length > 0 && (
          <Section title={t('Parameters')}>
            {Object.entries(schema).map(([k, spec]) => {
              const tok = !(k in (item.params || {})) ? bindings?.[k] : undefined;
              const tokVal = tok ? (spec.type === 'color' ? design.colors.find((c) => c.name === tok)?.value : design.type.find((t) => t.role === tok)?.family) : undefined;
              return <ParamField key={k} k={k} spec={spec} token={tok} value={item.params?.[k] ?? tokVal ?? spec.default} onChange={(v) => up({ params: { [k]: v } })} />;
            })}
          </Section>
        )}

        <Section title={t('Time')}>
          <div className="row gap8">
            <Num label={t('Start')} value={item.start} onChange={(v) => up({ start: Math.max(0, v) })} />
            <Num label={t('Duration')} value={item.duration} onChange={(v) => up({ duration: Math.max(0.04, v) })} />
            <Num label={t('In offset')} value={item.in} onChange={(v) => up({ in: Math.max(0, v) })} />
          </div>
          {visual && <Slider label={t('Opacity')} value={item.opacity ?? 1} max={1} onChange={(v) => up({ opacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />}
          {audible && <Slider label={t('Volume')} value={item.volume ?? 1} max={1.5} onChange={(v) => up({ volume: v })} fmt={(v) => `${Math.round(v * 100)}%`} />}
        </Section>

        {item.kind === 'media' && /^3d-/.test(item.ref) && <Stage3D item={item} />}

        {visual && <LayoutPanel item={item} project={project} />}

        {item.kind !== 'music' && <FxPanel item={item} />}

        {(item.kind === 'clip' || item.kind === 'music') && <History path={item.kind === 'clip' ? `clips/${item.ref}` : `music/${item.ref}`} clipId={item.kind === 'clip' ? item.ref : undefined} />}
      </div>

      <div className="composer compact">
        <textarea rows={1} value={ask} placeholder={item.kind === 'clip' ? t('Ask the agent to change this clip…') : t('Ask the agent…')}
          onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAgent(); } }} />
        <button className="send" disabled={!ask.trim()} onClick={askAgent}><Icon name="arrowUp" size={14} /></button>
      </div>
    </div>
  );
}

function Menu({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = () => setOpen(false);
    window.addEventListener('pointerdown', c);
    return () => window.removeEventListener('pointerdown', c);
  }, [open]);
  const run = (fn: () => unknown) => () => { setOpen(false); fn(); };
  return (
    <div className="rel" onPointerDown={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => setOpen(!open)}><Icon name="more" size={15} /></button>
      {open && (
        <div className="menu right">
          {item.kind === 'clip' && <button className="menu-item" onClick={run(async () => { const r = await api('POST', '/api/agent/lint-clip', { clipId: item.ref }); notify(r.ok ? 'info' : 'error', r.ok ? t('The clip looks fine') : r.issues.join('\n')); })}>{t('Check clip')}</button>}
          {(item.kind === 'clip' || item.kind === 'music') && <button className="menu-item" onClick={run(async () => { await api('POST', '/api/library', { kind: item.kind, id: item.ref }); notify('info', t('Saved to the library')); refreshGallery(); })}>{t('Save to library')}</button>}
          {item.kind === 'clip' && <button className="menu-item" onClick={run(async () => { const r = await api('POST', '/api/library/style', { itemId: item.id }); notify('info', t('Style “{name}” saved to “My library”', { name: r.name })); refreshGallery(); })}>{t('Save as style')}</button>}
          {item.kind === 'clip' && <button className="menu-item" onClick={run(() => actions.startTask(variationsPrompt(item, getState().clips.find((c) => c.id === item.ref)?.name || item.ref)))}>{t('Agent variations…')}</button>}
          {item.kind === 'clip' && <button className="menu-item" onClick={run(() => api('POST', `/api/clips/${item.ref}/duplicate`))}>{t('Duplicate clip')}</button>}
          {item.params && Object.keys(item.params).length > 0 && <button className="menu-item" onClick={run(() => { const p = useStoreSnapshot(); api('PATCH', '/api/project', { items: p.items.map((i) => (i.id === item.id ? { ...i, params: {} } : i)) }); })}>{t('Reset parameters')}</button>}
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={run(() => actions.removeItem(item.id))}>{t('Remove from timeline')}</button>
        </div>
      )}
    </div>
  );
}
const useStoreSnapshot = () => getState().project!;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="ip-section"><div className="ip-section-title">{title}</div>{children}</div>;
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(+value.toFixed(2)));
  useEffect(() => setV(String(+value.toFixed(2))), [value]);
  const commit = () => { const n = Number(v); if (!Number.isNaN(n) && n !== value) onChange(n); };
  return (
    <label className="num">
      <span>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

function Slider({ label, value, max, min = 0, step = 0.01, onChange, fmt }: { label: React.ReactNode; value: number; max: number; min?: number; step?: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => onChange(v)} onKeyUp={() => onChange(v)} />
      <span className="slider-val">{fmt(v)}</span>
    </label>
  );
}

function ParamField({ k, spec, value, onChange, token }: { k: string; spec: ParamSpec; value: unknown; onChange: (v: unknown) => void; token?: string }) {
  const label = <>{spec.label || k}<TokenChip token={token} /></>;
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => { if (local !== value) onChange(local); };
  if (spec.type === 'color') return (
    <label className="field-line">
      <span>{label}</span>
      <span className="color-swatch" style={{ background: String(local) }}><input type="color" value={String(local || '#ffffff').slice(0, 7)} onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }} /></span>
    </label>
  );
  if (spec.type === 'boolean') return <label className="field-line"><span>{label}</span><input type="checkbox" className="toggle" checked={!!local} onChange={(e) => onChange(e.target.checked)} /></label>;
  if (spec.type === 'select') return <label className="field-line"><span>{label}</span><select value={String(local)} onChange={(e) => onChange(e.target.value)}>{(spec.options || []).map((o) => <option key={o}>{o}</option>)}</select></label>;
  if (spec.type === 'number') {
    if (spec.min != null && spec.max != null && spec.max - spec.min <= 1000) return <Slider label={label} value={Number(local)} min={spec.min} max={spec.max} step={spec.step || 0.01} onChange={onChange} fmt={(v) => String(+v.toFixed(2))} />;
    return <label className="field-line"><span>{label}</span><input className="inline-input" value={String(local)} onChange={(e) => setLocal(e.target.value)} onBlur={() => { const n = Number(local); if (!Number.isNaN(n)) onChange(n); }} /></label>;
  }
  if (spec.type === 'textarea') return <label className="field-block"><span>{label}</span><textarea rows={4} value={String(local ?? '')} onChange={(e) => setLocal(e.target.value)} onBlur={commit} /></label>;
  return <label className="field-block"><span>{label}</span><input value={String(local ?? '')} onChange={(e) => setLocal(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} /></label>;
}

function History({ path, clipId }: { path: string; clipId?: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ sha: string; date: string; message: string }[]>([]);
  const fv = useStore((s) => (clipId ? s.fileVersion[clipId] : 0));
  const tasks = useStore((s) => s.tasks.length);
  useEffect(() => { api('GET', `/api/versions?path=${encodeURIComponent(path)}`).then(setList).catch(() => {}); }, [path, fv, tasks]);
  if (list.length < 2) return null;
  return (
    <div className="ip-section">
      <button className="disclosure" onClick={() => setOpen(!open)}><Icon name="chevron" size={11} /> {t('History')} · {list.length}</button>
      {open && list.slice(0, 15).map((v, i) => (
        <div key={v.sha} className="version">
          <div className="grow minw0">
            <div className="ellipsis">{v.message.replace(/^agent\((\w+)\): /, '$1: ')}</div>
            <div className="muted xsmall">{fmtDate(v.date)}</div>
          </div>
          {i > 0 && clipId && <button className="link" onClick={() => setState({ dialog: { compare: { clipId, sha: v.sha } } })}>{t('compare')}</button>}
          {i > 0 && <button className="link" onClick={async () => { if (confirm(t('Restore this version? The current one stays in the history.'))) { await api('POST', '/api/versions/restore', { sha: v.sha, path }); notify('info', t('Version restored')); } }}>{t('restore')}</button>}
        </div>
      ))}
    </div>
  );
}

function variationsPrompt(item: Item, name: string) {
  return `Make 3 stylistic variations of the clip "${name}" (clips/${item.ref}, item ${item.id}, ${item.start.toFixed(2)}–${(item.start + item.duration).toFixed(2)} s).
Each one as a separate clip clips/${item.ref}-v1, -v2, -v3 (copy the package and edit the copy): different typography, animation rhythm, composition and color accent; same texts and meaning; follow the project's design system if there is one.
Put the variants on a new graphics track (set_project tracks) at the same time as the original, but turn their visibility off (hidden: true) — the user will switch them. Do not change the original.
Render contact sheets of all three (render_clip) and briefly describe how they differ.`;
}

/** 3D render on the timeline: re-render it in another stage (mock → look → final), open the .blend */
const STAGES3D = [
  { q: 'mock', label: 'Mock', hint: 'Solid blocking, half-res — composition, camera, timing (seconds)' },
  { q: 'look', label: 'Look', hint: 'EEVEE — materials and light (about a second per frame)' },
  { q: 'final', label: 'Final', hint: 'High samples + motion blur — slow, for the approved shot' },
] as const;
function Stage3D({ item }: { item: Item }) {
  const m = /^3d-(.+)-(mock|look|final)\.(mp4|webm)$/.exec(item.ref);
  const id = m?.[1] || '', cur = m?.[2] || 'mock';
  const job = useStore((s) => [...s.render3d].reverse().find((j) => j.sceneId === id && j.mode === 'animation'));
  const busy = job?.status === 'running';
  const render = (q: string) => api('POST', `/api/3d/${encodeURIComponent(id)}/render`, { quality: q, mode: 'animation', wait: false });
  return (
    <div className="ip-section">
      <div className="ip-section-title row between"><span>{t('3D stage')}</span><button className="link" onClick={() => api('POST', `/api/3d/${encodeURIComponent(id)}/open`).catch(() => {})}>{t('Open in Blender')}</button></div>
      <div className="stage3d">
        {STAGES3D.map((s) => (
          <button key={s.q} className={'stage3d-btn' + (cur === s.q ? ' on' : '')} disabled={busy} title={t(s.hint)} onClick={() => render(s.q)}>
            <span className="stage3d-name">{t(s.label)}</span>
            <span className="stage3d-sub">{cur === s.q ? t('current') : t('render')}</span>
          </button>
        ))}
      </div>
      {busy && <div className="stage3d-prog"><div style={{ width: `${Math.round((job!.progress || 0) * 100)}%` }} /><span>{t('Rendering {q} · {p}%', { q: t(STAGES3D.find((x) => x.q === job!.quality)?.label || ''), p: Math.round((job!.progress || 0) * 100) })}</span></div>}
      {job?.status === 'error' && <div className="small err">{job.error}</div>}
      <div className="muted xsmall">{t('The scene is code in scenes3d/{id}/scene.py — ask the agent for changes; the timeline position is kept between stages.', { id })}</div>
    </div>
  );
}
