import { useEffect, useRef, useState } from 'react';
import type { Item } from '../../../shared/types';
import { TRANSITIONS, EFFECTS, MASKS, layerFrame, type ItemFx, type TransitionType, type EffectType, type Mask, type LayerFrame } from '../../../shared/fx';
import { useStore, actions, notify, getState, setState } from '../store';
import { Icon } from './Icon';

/** two sample "shots" for previews (inline SVG, no assets) */
const shot = (a: string, b: string, label: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="250" cy="40" r="60" fill="#fff" opacity=".12"/><text x="24" y="150" font-family="Unbounded, sans-serif" font-weight="800" font-size="64" fill="#fff" opacity=".92">${label}</text></svg>`)}`;
const SHOT_A = shot('#1b2a6b', '#0b6b74', 'A');
const SHOT_B = shot('#ff6a3d', '#7c3aed', 'B');

/** apply a computed LayerFrame to a preview element (same math as the renderer) */
function applyFrame(el: HTMLElement, ov: HTMLElement, f: LayerFrame) {
  el.style.opacity = String(f.opacity);
  el.style.transform = f.transform;
  el.style.filter = f.filter;
  el.style.clipPath = f.clipPath;
  el.style.webkitMaskImage = f.maskImage;
  el.style.maskImage = f.maskImage;
  (el.style as any).maskComposite = f.maskComposite || '';
  (el.style as any).webkitMaskComposite = f.maskComposite ? 'source-in' : '';
  let h = '';
  for (const o of f.overlays) if (o.opacity > 0.001) h += `<div class="fxp-ov" style="background:${o.color};opacity:${o.opacity};${o.blend ? `mix-blend-mode:${o.blend}` : ''}"></div>`;
  if (f.vignette) h += `<div class="fxp-ov" style="background:radial-gradient(ellipse, transparent ${f.vignette.size * 100}%, rgba(0,0,0,${f.vignette.amount}) 100%)"></div>`;
  if (f.letterbox) { const bar = Math.max(0, (1 - 1.778 / f.letterbox) / 2) * 100; h += `<div class="fxp-ov" style="background:#000;height:${bar}%"></div><div class="fxp-ov" style="background:#000;height:${bar}%;top:auto;bottom:0"></div>`; }
  if (f.grain) h += `<div class="fxp-ov fxp-grain" style="opacity:${f.grain.amount * 1.5}"></div>`;
  ov.innerHTML = h;
}

/** looping live preview of an fx on the sample shot B (over A for transitions) */
export function FxPreview({ fx, mode }: { fx: ItemFx; mode: 'transition' | 'effect' | 'mask' }) {
  const b = useRef<HTMLDivElement>(null);
  const ov = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = ((now - t0) / 1000) % 2.4;
      // transitions: B enters over A in 0.2..1.0, stays, then exits 1.6..2.4 (if out)
      const lt = mode === 'transition' ? Math.max(0, t - 0.2) : t;
      const f = layerFrame(fx, lt, mode === 'transition' ? 2.2 : 2.4, { width: 320, height: 180 }, 3);
      applyFrame(b.current!, ov.current!, f);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [JSON.stringify(fx), mode]);
  return (
    <div className="fxp">
      {mode === 'transition' && <img className="fxp-shot" src={SHOT_A} alt="" />}
      {mode === 'mask' && <img className="fxp-shot dim" src={SHOT_A} alt="" />}
      <div ref={b} className="fxp-b"><img className="fxp-shot" src={mode === 'effect' ? SHOT_A : SHOT_B} alt="" /><div ref={ov} className="fxp-deco" /></div>
    </div>
  );
}

const selectedItem = (): Item | null => { const s = getState(); return s.project?.items.find((i) => i.id === s.selectedItemId) || null; };
function needItem() {
  const it = selectedItem();
  if (!it) { notify('error', 'Сначала выберите клип на таймлайне — эффект применится к нему'); return null; }
  return it;
}
const patchFx = (it: Item, fx: ItemFx) => actions.updateItem(it.id, { fx: { ...(it.fx || {}), ...fx } });

export function applyTransition(type: TransitionType, where: 'in' | 'out' | 'both', item?: Item | null) {
  const it = item || needItem();
  if (!it) return;
  const d = Math.min(0.6, it.duration / 3);
  const tr = { type, duration: +d.toFixed(2) };
  patchFx(it, where === 'both' ? { in: tr, out: tr } : { [where]: tr });
  notify('info', `Переход добавлен: ${TRANSITIONS.find((x) => x.type === type)?.name}`);
}
export function applyEffect(type: EffectType) {
  const it = needItem();
  if (!it) return;
  const spec = EFFECTS.find((e) => e.type === type)!;
  const params: Record<string, number | string> = {};
  for (const p of spec.params) params[p.key] = p.def;
  for (const o of spec.options || []) params[o.key] = o.def;
  patchFx(it, { effects: [...(it.fx?.effects || []), { id: Math.random().toString(36).slice(2, 8), type, params }] });
  notify('info', `Эффект добавлен: ${spec.name}`);
}
export function applyMask(m: Mask) {
  const it = needItem();
  if (!it) return;
  patchFx(it, { mask: { ...m } });
  notify('info', 'Маска применена');
}

const drag = (data: object) => (e: React.DragEvent) => { e.dataTransfer.setData('application/x-studio', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; };

export function TransitionsGrid({ q }: { q: string }) {
  const groups = [...new Set(TRANSITIONS.map((t) => t.group))];
  const sel = useStore((s) => !!s.selectedItemId);
  return (
    <div className="col gap16">
      <Hint sel={sel} what="переход" />
      {groups.map((g) => {
        const list = TRANSITIONS.filter((t) => t.group === g && (!q || (t.name + t.hint).toLowerCase().includes(q.toLowerCase())));
        if (!list.length) return null;
        return (
          <div key={g} className="col gap8">
            <div className="lib-group">{g}</div>
            <div className="fx-grid">
              {list.map((t) => (
                <div key={t.type} className="fx-card" draggable onDragStart={drag({ type: 'transition', transition: t.type })} title={t.hint}>
                  <FxPreview fx={{ in: { type: t.type, duration: 0.8 }, out: { type: t.type, duration: 0.8 } }} mode="transition" />
                  <div className="fx-name">{t.name}</div>
                  <div className="fx-actions">
                    <button onClick={() => applyTransition(t.type, 'in')}>Вход</button>
                    <button onClick={() => applyTransition(t.type, 'out')}>Выход</button>
                    <button onClick={() => applyTransition(t.type, 'both')}>Оба</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EffectsGrid({ q }: { q: string }) {
  const groups = [...new Set(EFFECTS.map((t) => t.group))];
  const sel = useStore((s) => !!s.selectedItemId);
  return (
    <div className="col gap16">
      <Hint sel={sel} what="эффект" />
      {groups.map((g) => {
        const list = EFFECTS.filter((t) => t.group === g && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
        if (!list.length) return null;
        return (
          <div key={g} className="col gap8">
            <div className="lib-group">{g}</div>
            <div className="fx-grid">
              {list.map((e) => {
                const params: Record<string, number | string> = {};
                for (const p of e.params) params[p.key] = p.def;
                for (const o of e.options || []) params[o.key] = o.def;
                return (
                  <button key={e.type} className="fx-card click" onClick={() => applyEffect(e.type)}>
                    <FxPreview fx={{ effects: [{ type: e.type, params }] }} mode="effect" />
                    <div className="fx-name">{e.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MasksGrid() {
  const sel = useStore((s) => !!s.selectedItemId);
  return (
    <div className="col gap16">
      <Hint sel={sel} what="маску" />
      <div className="fx-grid">
        {MASKS.map((m) => (
          <button key={m.shape} className="fx-card click" onClick={() => applyMask(m.def)} title={m.hint}>
            <FxPreview fx={{ mask: m.def }} mode="mask" />
            <div className="fx-name">{m.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Hint({ sel, what }: { sel: boolean; what: string }) {
  const name = useStore((s) => { const it = s.project?.items.find((i) => i.id === s.selectedItemId); return it ? (s.clips.find((c) => c.id === it.ref)?.name || it.label || it.ref) : ''; });
  return sel
    ? <div className="fx-hint">Применяется к: <b>{name}</b></div>
    : <div className="fx-hint warn"><Icon name="layers" size={13} /> Выберите клип на таймлайне, затем кликните {what}. Переходы можно перетащить прямо на край клипа.</div>;
}

export function useFxLibrarySelectedGuard() { return useStore((s) => s.selectedItemId); }
void setState;
