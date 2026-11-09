// Implicit taste signals: what the user changes by hand after the agents (the direction of the change is the
// strongest evidence of what they want), and what they export. One pending signal per item / design / project
// (recordTaste `key`): a burst of tweaks becomes one "from → to" summary against the state before the burst.
import type { DesignSystem, Item } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { getScript } from '../script.ts';
import { recordTaste } from './memory.ts';

const BURST_MS = 10 * 60_000;
const bases = new Map<string, { snap: unknown; at: number }>();

/** the state before the current burst of edits (kept until the user leaves it alone for 10 min) */
function base<T>(key: string, now: T): T {
  const b = bases.get(key);
  if (b && Date.now() - b.at < BURST_MS) { b.at = Date.now(); return b.snap as T; }
  bases.set(key, { snap: structuredClone(now), at: Date.now() });
  return structuredClone(now);
}
const short = (v: unknown) => { if (v === undefined || v === null || v === '') return 'default'; const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 48 ? s.slice(0, 48) + '…' : s; };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** call BEFORE applying a user's item patch: remembers the pre-burst state */
export function itemBefore(item: Item | undefined) {
  if (!item) return;
  try { base('item:' + cur().id + ':' + item.id, item); } catch { /* never block an edit */ }
}

/** call AFTER a user's item patch */
export function itemAfter(item: Item | undefined) {
  if (!item) return;
  try {
    const key = 'item:' + cur().id + ':' + item.id;
    const b = bases.get(key)?.snap as Item | undefined;
    if (!b) return;
    const ch: string[] = [];
    const d0 = num(b.duration), d1 = num(item.duration);
    if (d0 && d1 && Math.abs(d1 - d0) / d0 > 0.1) ch.push(`${d1 < d0 ? 'shortened' : 'lengthened'} it ${d0.toFixed(1)} s → ${d1.toFixed(1)} s`);
    const p0 = b.params || {}, p1 = item.params || {};
    for (const k of new Set([...Object.keys(p0), ...Object.keys(p1)])) {
      if (JSON.stringify(p0[k]) === JSON.stringify(p1[k])) continue;
      const name = k === '__energy' ? 'motion energy' : k.startsWith('__') ? null : k;
      if (name) ch.push(`${name}: ${short(p0[k])} → ${short(p1[k])}`);
    }
    for (const f of ['opacity', 'volume'] as const) {
      const a = num(b[f]) ?? 1, z = num(item[f]) ?? 1;
      if (Math.abs(a - z) > 0.08) ch.push(`${f} ${Math.round(a * 100)}% → ${Math.round(z * 100)}%`);
    }
    const s0 = num(b.transform?.scale) ?? 1, s1 = num(item.transform?.scale) ?? 1;
    if (Math.abs(s1 - s0) > 0.08) ch.push(`made it ${s1 > s0 ? 'bigger' : 'smaller'} (scale ${s0.toFixed(2)} → ${s1.toFixed(2)})`);
    if (JSON.stringify(b.fx || {}) !== JSON.stringify(item.fx || {})) ch.push(`effects/transitions ${short(b.fx || 'none')} → ${short(item.fx || 'none')}`);
    if (!ch.length) return;
    const sc = getScript().scenes.find((s) => s.itemIds?.includes(item.id) || (item.start >= s.start && item.start < s.start + s.duration));
    const what = `the ${item.kind === 'clip' ? 'graphics clip' : item.kind} “${item.label || item.ref}”${sc ? ` in scene “${sc.title}”` : ''}`;
    recordTaste({ kind: 'edit', text: `The user changed ${what} by hand: ${ch.join('; ')}.`, sceneId: sc?.id, key });
  } catch { /* never block an edit */ }
}

/** the user edited the design system by hand */
export function designEdit(before: DesignSystem, after: Partial<DesignSystem>) {
  try {
    const key = 'design:' + cur().id;
    const b = base(key, before);
    const ch: string[] = [];
    const colors = new Map(b.colors.map((c) => [c.name, c.value]));
    for (const c of after.colors || []) { const old = colors.get(c.name); if (old && old.toLowerCase() !== c.value.toLowerCase()) ch.push(`colour “${c.name}”${c.role ? ` (${c.role})` : ''} ${old} → ${c.value}`); else if (!old) ch.push(`added colour “${c.name}” ${c.value}`); }
    const types = new Map(b.type.map((x) => [x.role, x]));
    for (const x of after.type || []) {
      const o = types.get(x.role);
      if (!o) { ch.push(`added type role ${x.role}: ${x.family} ${x.weight}`); continue; }
      if (o.family !== x.family) ch.push(`${x.role} font ${o.family} → ${x.family}`);
      if (o.weight !== x.weight) ch.push(`${x.role} weight ${o.weight} → ${x.weight}`);
      if (o.size && x.size && Math.abs(x.size - o.size) / o.size > 0.1) ch.push(`${x.role} size ${o.size} → ${x.size}`);
    }
    const motion = new Map(b.motion.map((m) => [m.name, m]));
    for (const m of after.motion || []) { const o = motion.get(m.name); if (o && (o.ease !== m.ease || Math.abs(o.duration - m.duration) > 0.05)) ch.push(`motion “${m.name}” ${o.ease} ${o.duration}s → ${m.ease} ${m.duration}s`); }
    if (!ch.length) return;
    recordTaste({ kind: 'edit', text: `The user edited the design system by hand: ${ch.slice(0, 10).join('; ')}.`, key });
  } catch { /* never block */ }
}

/** the user exported the video: the edit as a whole is good enough to ship */
export function exported() {
  try {
    const store = cur();
    const s = getScript();
    const p = store.project;
    recordTaste({ kind: 'approve', text: `The user exported “${p.name}” (${p.width}×${p.height}, ${Math.round(p.duration)} s${s.scenes.length ? `, ${s.scenes.length} scenes: ${s.scenes.map((x) => x.title).slice(0, 8).join(' / ')}` : ''}) — the whole edit was good enough to ship.`, key: 'export:' + store.id });
  } catch { /* never block */ }
}
