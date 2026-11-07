import { useEffect, useState } from 'react';
import type { Item, Project } from '../../../shared/types';
import { actions, useStore, getState } from '../store';
import { clipFrames } from './Player';
import { Icon } from './Icon';
import { t } from '../i18n';

export type Box = { x: number; y: number; w: number; h: number };

/** untransformed content box of an item in frame px (clips: measured inside the live iframe; media: fitted rect) */
export function measureItem(item: Item, project: Project): Box | null {
  const W = project.width, H = project.height;
  if (item.kind === 'clip') {
    const f = clipFrames.get(item.id);
    try {
      const b = (f?.contentWindow as any)?.__studio?.bbox?.();
      if (b && b.w > 2 && b.h > 2) return b;
    } catch { /* cross-origin / not ready */ }
    return null;
  }
  const m = getState().media.find((x) => x.file === item.ref);
  if (!m?.width || !m?.height) return { x: 0, y: 0, w: W, h: H };
  const k = item.transform?.fit === 'cover' ? Math.max(W / m.width, H / m.height) : Math.min(W / m.width, H / m.height);
  const w = m.width * k, h = m.height * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/** put the content box at an anchor (ax, ay ∈ 0 | 0.5 | 1) with a safe margin, keeping scale/rotation */
export function anchorTransform(item: Item, project: Project, box: Box, ax: number, ay: number, marginPct: number) {
  const tr = item.transform || {};
  const s = tr.scale ?? 1;
  const m = (marginPct / 100) * Math.min(project.width, project.height);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const tx = ax === 0 ? m + (box.w * s) / 2 : ax === 1 ? project.width - m - (box.w * s) / 2 : project.width / 2;
  const ty = ay === 0 ? m + (box.h * s) / 2 : ay === 1 ? project.height - m - (box.h * s) / 2 : project.height / 2;
  return { ...tr, ox: +((cx / project.width) * 100).toFixed(3), oy: +((cy / project.height) * 100).toFixed(3), x: Math.round(tx - cx), y: Math.round(ty - cy) };
}

const ANCHORS: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [0.5, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]];

export function LayoutPanel({ item, project }: { item: Item; project: Project }) {
  const tr = item.transform || {};
  const hasDesign = useStore((s) => s.design.colors.length > 0 || s.design.type.length > 0);
  const [margin, setMargin] = useState(() => Number(localStorage.getItem('safeMargin') || 6));
  const [msg, setMsg] = useState('');
  const setTr = (patch: Partial<NonNullable<Item['transform']>>) => actions.updateItem(item.id, { transform: { ...tr, ...patch } });
  const anchor = (ax: number, ay: number) => {
    const box = measureItem(item, project);
    if (!box) { setMsg(t('The clip content is not visible right now — move the playhead to where the graphics are on screen')); return; }
    setMsg('');
    actions.updateItem(item.id, { transform: anchorTransform(item, project, box, ax, ay, margin) });
  };
  const energy = Number(item.params?.__energy ?? 1);
  const style = (item.params?.__style as string) || 'design';
  return (
    <div className="ip-section">
      <div className="ip-section-title row between"><span>{t('Layout')}</span>{(tr.x || tr.y || (tr.scale ?? 1) !== 1 || tr.rotate) ? <button className="link" onClick={() => actions.updateItem(item.id, { transform: { fit: tr.fit } })}>{t('Reset')}</button> : null}</div>
      <div className="layout-row">
        <div className="anchor-grid" title={t('Snap to the frame edge with a safe margin')}>
          {ANCHORS.map(([ax, ay]) => <button key={`${ax}${ay}`} onClick={() => anchor(ax, ay)} aria-label={`anchor ${ax} ${ay}`}><span /></button>)}
        </div>
        <div className="col gap8 grow minw0">
          <Slide label={t('Scale')} reset={1} min={0.2} max={3} step={0.01} value={tr.scale ?? 1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTr({ scale: v })} />
          <Slide label={t('Rotation')} reset={0} min={-180} max={180} step={1} value={tr.rotate ?? 0} fmt={(v) => `${Math.round(v)}°`} onChange={(v) => setTr({ rotate: v })} />
          <Slide label={t('Margin')} min={0} max={20} step={0.5} value={margin} fmt={(v) => `${v}%`} onChange={(v) => { setMargin(v); try { localStorage.setItem('safeMargin', String(v)); } catch {} }} />
        </div>
      </div>
      {msg && <div className="muted xsmall">{msg}</div>}
      <div className="muted xsmall">{t('Move and scale right in the frame: the selected clip has a box with handles.')}</div>

      {item.kind === 'clip' && (
        <>
          <div className="ip-section-title" style={{ marginTop: 6 }} title={t('Energy speeds up the intro and outro and stretches the hold; the clip start and end stay put')}>{t('Rhythm')} <span className="muted">{t('· faster or calmer in/out')}</span></div>
          <Slide label={t('Energy')} reset={1} min={0.5} max={2.5} step={0.05} value={energy} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => actions.updateItem(item.id, { params: { __energy: Math.abs(v - 1) < 0.03 ? 1 : v } })} />
          <div className="ip-section-title row between" style={{ marginTop: 6 }}>
            <span>{t('Style')}</span>
            <div className="seg sm">
              <button className={style !== 'own' ? 'on' : ''} disabled={!hasDesign} title={hasDesign ? '' : t('The project has no design system yet')} onClick={() => actions.updateItem(item.id, { params: { __style: 'design' } })}>{t('Design system')}</button>
              <button className={style === 'own' ? 'on' : ''} onClick={() => actions.updateItem(item.id, { params: { __style: 'own' } })}>{t('Own')}</button>
            </div>
          </div>
          {!hasDesign && <div className="muted xsmall">{t('Once there is a design system, the template colors and fonts will come from it automatically.')}</div>}
        </>
      )}
    </div>
  );
}

function Slide({ label, min, max, step, value, fmt, onChange, reset }: { label: string; reset?: number; min: number; max: number; step: number; value: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => onChange(v)} onKeyUp={() => onChange(v)} onDoubleClick={() => onChange(reset ?? v)} />
      <span className="slider-val">{fmt(v)}</span>
    </label>
  );
}

export function TokenChip({ token }: { token?: string }) {
  if (!token) return null;
  return <span className="token-chip" title={t('The value comes from the design system. Change the parameter and it becomes your own.')}><Icon name="sparkle" size={9} />{token}</span>;
}
