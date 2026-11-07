import { useEffect, useState } from 'react';
import type { Item } from '../../../shared/types';
import { TRANSITIONS, EFFECTS, MASKS, BLENDS, type ItemFx, type Transition, type Effect, type Mask, type TransitionType, type EffectType } from '../../../shared/fx';
import { actions, setState } from '../store';
import { Icon } from './Icon';

/** Transitions / effects / mask / blend controls for the selected item */
export function FxPanel({ item }: { item: Item }) {
  const fx: ItemFx = item.fx || {};
  const set = (patch: Partial<ItemFx>) => actions.updateItem(item.id, { fx: clean({ ...fx, ...patch }) });
  return (
    <>
      <div className="ip-section">
        <div className="ip-section-title row between"><span>Переходы</span><button className="link" onClick={() => setState({ libraryOpen: true })}>Библиотека</button></div>
        <TransitionRow label="Вход" value={fx.in} max={item.duration} onChange={(v) => set({ in: v })} />
        <TransitionRow label="Выход" value={fx.out} max={item.duration} onChange={(v) => set({ out: v })} />
      </div>

      <div className="ip-section">
        <div className="ip-section-title row between"><span>Эффекты{fx.effects?.length ? ` · ${fx.effects.length}` : ''}</span><AddEffect onAdd={(type) => {
          const spec = EFFECTS.find((e) => e.type === type)!;
          const params: Record<string, number | string> = {};
          for (const p of spec.params) params[p.key] = p.def;
          for (const o of spec.options || []) params[o.key] = o.def;
          set({ effects: [...(fx.effects || []), { id: Math.random().toString(36).slice(2, 8), type, params }] });
        }} /></div>
        {(fx.effects || []).map((e, i) => (
          <EffectRow key={e.id || i} e={e}
            onChange={(ne) => set({ effects: fx.effects!.map((x, j) => (j === i ? ne : x)) })}
            onRemove={() => set({ effects: fx.effects!.filter((_, j) => j !== i) })} />
        ))}
        {!fx.effects?.length && <div className="muted small">Цвет, размытие, виньетка, зерно, кен-бёрнс, тряска…</div>}
      </div>

      <div className="ip-section">
        <div className="ip-section-title row between">
          <span>Маска</span>
          {fx.mask
            ? <button className="link danger" onClick={() => set({ mask: undefined })}>Убрать</button>
            : <select className="mini-select" value="" onChange={(e) => { const m = MASKS.find((x) => x.shape === e.target.value); if (m) set({ mask: { ...m.def } }); }}><option value="">+ Добавить</option>{MASKS.map((m) => <option key={m.shape} value={m.shape}>{m.name}</option>)}</select>}
        </div>
        {fx.mask && <MaskEditor m={fx.mask} onChange={(m) => set({ mask: m })} />}
      </div>

      <div className="ip-section">
        <label className="field-line"><span>Наложение</span>
          <select value={fx.blend || 'normal'} onChange={(e) => set({ blend: e.target.value as ItemFx['blend'] })}>
            {BLENDS.map((b) => <option key={b.mode} value={b.mode}>{b.name}</option>)}
          </select>
        </label>
      </div>
    </>
  );
}

function clean(fx: ItemFx): ItemFx {
  const out: ItemFx = {};
  if (fx.in) out.in = fx.in;
  if (fx.out) out.out = fx.out;
  if (fx.effects?.length) out.effects = fx.effects;
  if (fx.mask) out.mask = fx.mask;
  if (fx.blend && fx.blend !== 'normal') out.blend = fx.blend;
  return out;
}

function TransitionRow({ label, value, max, onChange }: { label: string; value?: Transition; max: number; onChange: (v?: Transition) => void }) {
  const [d, setD] = useState(value?.duration ?? 0.5);
  useEffect(() => setD(value?.duration ?? 0.5), [value?.duration]);
  return (
    <div className="tr-row">
      <span className="tr-label">{label}</span>
      <select value={value?.type || ''} onChange={(e) => onChange(e.target.value ? { type: e.target.value as TransitionType, duration: value?.duration ?? Math.min(0.6, +(max / 3).toFixed(2)) } : undefined)}>
        <option value="">Нет</option>
        {[...new Set(TRANSITIONS.map((t) => t.group))].map((g) => (
          <optgroup key={g} label={g}>{TRANSITIONS.filter((t) => t.group === g).map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}</optgroup>
        ))}
      </select>
      {value && (
        <>
          <input type="range" min={0.1} max={Math.max(0.2, Math.min(3, max))} step={0.05} value={d} onChange={(e) => setD(Number(e.target.value))} onPointerUp={() => onChange({ ...value, duration: d })} onKeyUp={() => onChange({ ...value, duration: d })} />
          <span className="slider-val">{d.toFixed(2)}s</span>
        </>
      )}
    </div>
  );
}

function AddEffect({ onAdd }: { onAdd: (t: EffectType) => void }) {
  return (
    <select className="mini-select" value="" onChange={(e) => e.target.value && onAdd(e.target.value as EffectType)}>
      <option value="">+ Добавить</option>
      {[...new Set(EFFECTS.map((x) => x.group))].map((g) => <optgroup key={g} label={g}>{EFFECTS.filter((x) => x.group === g).map((x) => <option key={x.type} value={x.type}>{x.name}</option>)}</optgroup>)}
    </select>
  );
}

function EffectRow({ e, onChange, onRemove }: { e: Effect; onChange: (e: Effect) => void; onRemove: () => void }) {
  const spec = EFFECTS.find((x) => x.type === e.type);
  const [open, setOpen] = useState(true);
  if (!spec) return null;
  const on = e.enabled !== false;
  return (
    <div className={'fx-row' + (on ? '' : ' off')}>
      <div className="fx-row-head">
        <button className="fx-row-name" onClick={() => setOpen(!open)}><Icon name="chevron" size={10} />{spec.name}</button>
        <input type="checkbox" className="toggle" checked={on} title="Вкл/выкл" onChange={(ev) => onChange({ ...e, enabled: ev.target.checked })} />
        <button className="icon-btn xs" title="Удалить" onClick={onRemove}><Icon name="x" size={11} /></button>
      </div>
      {open && (
        <div className="fx-row-body">
          {(spec.options || []).map((o) => o.values.length
            ? <label key={o.key} className="field-line"><span>{o.label}</span><select value={String(e.params?.[o.key] ?? o.def)} onChange={(ev) => onChange({ ...e, params: { ...e.params, [o.key]: ev.target.value } })}>{o.values.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            : <label key={o.key} className="field-line"><span>{o.label}</span><span className="color-swatch" style={{ background: String(e.params?.[o.key] ?? o.def) }}><input type="color" value={String(e.params?.[o.key] ?? o.def)} onChange={(ev) => onChange({ ...e, params: { ...e.params, [o.key]: ev.target.value } })} /></span></label>)}
          {spec.params.map((p) => <ParamSlider key={p.key} label={p.label} min={p.min} max={p.max} step={p.step} value={Number(e.params?.[p.key] ?? p.def)} onChange={(v) => onChange({ ...e, params: { ...e.params, [p.key]: v } })} />)}
        </div>
      )}
    </div>
  );
}

function ParamSlider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => onChange(v)} onKeyUp={() => onChange(v)} />
      <span className="slider-val">{+v.toFixed(2)}</span>
    </label>
  );
}

function MaskEditor({ m, onChange }: { m: Mask; onChange: (m: Mask) => void }) {
  return (
    <div className="col gap8">
      <label className="field-line"><span>Форма</span>
        <select value={m.shape} onChange={(e) => onChange({ ...MASKS.find((x) => x.shape === e.target.value)!.def, invert: m.invert })}>{MASKS.map((x) => <option key={x.shape} value={x.shape}>{x.name}</option>)}</select>
      </label>
      {m.shape !== 'linear' && <>
        <ParamSlider label="X" min={0} max={1} step={0.005} value={m.x} onChange={(x) => onChange({ ...m, x })} />
        <ParamSlider label="Y" min={0} max={1} step={0.005} value={m.y} onChange={(y) => onChange({ ...m, y })} />
        <ParamSlider label="Ширина" min={0.02} max={1} step={0.005} value={m.w} onChange={(w) => onChange({ ...m, w })} />
        <ParamSlider label="Высота" min={0.02} max={1} step={0.005} value={m.h} onChange={(h) => onChange({ ...m, h })} />
      </>}
      {m.shape === 'rounded' && <ParamSlider label="Скругление" min={0} max={0.5} step={0.005} value={m.radius ?? 0.06} onChange={(radius) => onChange({ ...m, radius })} />}
      {m.shape === 'linear' && <ParamSlider label="Угол, °" min={0} max={360} step={1} value={m.angle ?? 90} onChange={(angle) => onChange({ ...m, angle })} />}
      <ParamSlider label="Растушёвка, px" min={0} max={600} step={2} value={m.feather ?? 0} onChange={(feather) => onChange({ ...m, feather })} />
      <label className="field-line"><span>Инвертировать</span><input type="checkbox" className="toggle" checked={!!m.invert} onChange={(e) => onChange({ ...m, invert: e.target.checked })} /></label>
    </div>
  );
}
