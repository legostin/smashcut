import { useEffect, useState } from 'react';
import type { Item, ParamSpec, Project } from '../../../shared/types';
import { useStore, actions, api, setState, notify, refreshGallery, getState } from '../store';
import { Icon } from './Icon';

/** Contextual panel for the selected timeline item: the few controls that matter + "ask the agent". */
export function ItemPanel({ item, project }: { item: Item; project: Project }) {
  const clip = useStore((s) => (item.kind === 'clip' ? s.clips.find((c) => c.id === item.ref) : undefined));
  const music = useStore((s) => (item.kind === 'music' ? s.music.find((m) => m.id === item.ref) : undefined));
  const media = useStore((s) => (item.kind === 'media' ? s.media.find((m) => m.file === item.ref) : undefined));
  const errors = useStore((s) => s.clipErrors[item.id]);
  const [ask, setAsk] = useState('');
  const up = (patch: Partial<Item>) => actions.updateItem(item.id, patch);
  const name = clip?.name || music?.name || item.ref;
  const visual = item.kind === 'clip' || (item.kind === 'media' && media?.type !== 'audio');
  const audible = item.kind === 'music' || (item.kind === 'media' && (media?.type === 'audio' || media?.hasAudio));
  const schema = clip?.schema || {};
  const askAgent = async () => {
    const what = ask.trim();
    if (!what) return;
    const subject = item.kind === 'clip' ? `В клипе «${name}» (clips/${item.ref})` : item.kind === 'music' ? `В треке «${name}» (music/${item.ref})` : `Для элемента ${item.ref} на таймлайне`;
    await actions.startTask(`${subject}: ${what}`, { itemId: item.id });
    setAsk('');
  };
  return (
    <div className="item-panel">
      <div className="ip-head">
        <button className="icon-btn" title="Назад к агенту (Esc)" onClick={() => setState({ selectedItemId: null })}><Icon name="back" size={15} /></button>
        <div className="grow minw0">
          <div className="ip-title ellipsis">{name}</div>
          <div className="ip-sub ellipsis">{item.kind === 'clip' ? 'Графика' : item.kind === 'music' ? `Музыка${music?.meta ? ` · ${music.meta.bpm} BPM` : ''}` : media?.type === 'audio' ? 'Аудио' : media?.type === 'image' ? 'Изображение' : 'Видео'} · {item.start.toFixed(2)}–{(item.start + item.duration).toFixed(2)} s</div>
        </div>
        <Menu item={item} />
      </div>

      <div className="ip-body">
        {errors?.length ? <div className="ip-error">{errors.slice(-2).join('\n')}</div> : null}

        {Object.keys(schema).length > 0 && (
          <Section title="Параметры">
            {Object.entries(schema).map(([k, spec]) => <ParamField key={k} k={k} spec={spec} value={item.params?.[k] ?? spec.default} onChange={(v) => up({ params: { [k]: v } })} />)}
          </Section>
        )}

        <Section title="Время">
          <div className="row gap8">
            <Num label="Старт" value={item.start} onChange={(v) => up({ start: Math.max(0, v) })} />
            <Num label="Длина" value={item.duration} onChange={(v) => up({ duration: Math.max(0.04, v) })} />
            <Num label="Сдвиг" value={item.in} onChange={(v) => up({ in: Math.max(0, v) })} />
          </div>
          {visual && <Slider label="Прозрачность" value={item.opacity ?? 1} max={1} onChange={(v) => up({ opacity: v })} fmt={(v) => `${Math.round(v * 100)}%`} />}
          {audible && <Slider label="Громкость" value={item.volume ?? 1} max={1.5} onChange={(v) => up({ volume: v })} fmt={(v) => `${Math.round(v * 100)}%`} />}
        </Section>

        {(item.kind === 'clip' || item.kind === 'music') && <History path={item.kind === 'clip' ? `clips/${item.ref}` : `music/${item.ref}`} clipId={item.kind === 'clip' ? item.ref : undefined} />}
      </div>

      <div className="composer compact">
        <textarea rows={1} value={ask} placeholder={item.kind === 'clip' ? 'Попросить агента изменить этот клип…' : 'Попросить агента…'}
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
          {item.kind === 'clip' && <button className="menu-item" onClick={run(async () => { const r = await api('POST', '/api/agent/lint-clip', { clipId: item.ref }); notify(r.ok ? 'info' : 'error', r.ok ? 'Клип в порядке' : r.issues.join('\n')); })}>Проверить клип</button>}
          {(item.kind === 'clip' || item.kind === 'music') && <button className="menu-item" onClick={run(async () => { await api('POST', '/api/library', { kind: item.kind, id: item.ref }); notify('info', 'Сохранено в библиотеку'); refreshGallery(); })}>Сохранить в библиотеку</button>}
          {item.kind === 'clip' && <button className="menu-item" onClick={run(() => api('POST', `/api/clips/${item.ref}/duplicate`))}>Дублировать клип</button>}
          {item.params && Object.keys(item.params).length > 0 && <button className="menu-item" onClick={run(() => { const p = useStoreSnapshot(); api('PATCH', '/api/project', { items: p.items.map((i) => (i.id === item.id ? { ...i, params: {} } : i)) }); })}>Сбросить параметры</button>}
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={run(() => actions.removeItem(item.id))}>Убрать с таймлайна</button>
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

function Slider({ label, value, max, onChange, fmt }: { label: string; value: number; max: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={0} max={max} step={0.01} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => onChange(v)} onKeyUp={() => onChange(v)} />
      <span className="slider-val">{fmt(v)}</span>
    </label>
  );
}

function ParamField({ k, spec, value, onChange }: { k: string; spec: ParamSpec; value: unknown; onChange: (v: unknown) => void }) {
  const label = spec.label || k;
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
    if (spec.min != null && spec.max != null && spec.max - spec.min <= 1000) return <Slider label={label} value={Number(local)} max={spec.max} onChange={onChange} fmt={(v) => String(+v.toFixed(2))} />;
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
      <button className="disclosure" onClick={() => setOpen(!open)}><Icon name="chevron" size={11} /> История · {list.length}</button>
      {open && list.slice(0, 15).map((v, i) => (
        <div key={v.sha} className="version">
          <div className="grow minw0">
            <div className="ellipsis">{v.message.replace(/^agent\((\w+)\): /, '$1: ')}</div>
            <div className="muted xsmall">{new Date(v.date).toLocaleString()}</div>
          </div>
          {i > 0 && clipId && <button className="link" onClick={() => setState({ dialog: { compare: { clipId, sha: v.sha } } })}>сравнить</button>}
          {i > 0 && <button className="link" onClick={async () => { if (confirm('Вернуть эту версию? Текущая останется в истории.')) { await api('POST', '/api/versions/restore', { sha: v.sha, path }); notify('info', 'Версия восстановлена'); } }}>вернуть</button>}
        </div>
      ))}
    </div>
  );
}
