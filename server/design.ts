import type { DesignSystem } from '../shared/types.ts';
import { cur } from './project.ts';
import { bus } from './bus.ts';
import { readJson, writeJson, Mutex } from './util.ts';

/** design.json — the project's design system (colour, type, motion, spacing tokens). Clips read it as CSS vars. */
export const EMPTY_DESIGN: DesignSystem = { colors: [], type: [], motion: [], spacing: [] };
const mutex = new Mutex();
let lastWrite = 0;

const slugKey = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

export function normalizeDesign(d: Partial<DesignSystem>): DesignSystem {
  return {
    name: d.name || '',
    colors: (d.colors || []).map((c) => ({ name: slugKey(c.name), value: String(c.value || '#000'), role: c.role || '' })),
    type: (d.type || []).map((t) => ({ role: slugKey(t.role), family: t.family || 'Inter', weight: Number(t.weight) || 400, size: Number(t.size) || 32, tracking: t.tracking != null ? Number(t.tracking) : undefined, sample: t.sample })),
    motion: (d.motion || []).map((m) => ({ name: slugKey(m.name), ease: m.ease || 'power3.out', duration: Number(m.duration) || 0.6 })),
    spacing: (d.spacing || []).map((x) => ({ name: slugKey(x.name), value: Number(x.value) || 0 })),
    notes: d.notes || '',
    updatedAt: d.updatedAt,
  };
}

export function getDesign(): DesignSystem {
  return normalizeDesign(readJson<Partial<DesignSystem>>(cur().p('design.json'), EMPTY_DESIGN));
}

export function saveDesign(patch: Partial<DesignSystem>) {
  return mutex.run(async () => {
    const d = normalizeDesign({ ...getDesign(), ...patch, updatedAt: new Date().toISOString() });
    lastWrite = Date.now();
    writeJson(cur().p('design.json'), d);
    bus.send({ type: 'design', design: d });
    return d;
  });
}

export function onDesignFileChanged() {
  if (Date.now() - lastWrite < 800) return;
  bus.send({ type: 'design', design: getDesign() });
}

/** CSS custom properties for clips */
export function designCss(d: DesignSystem) {
  const lines: string[] = [];
  for (const c of d.colors) lines.push(`--color-${c.name}: ${c.value};`);
  for (const t of d.type) {
    lines.push(`--font-${t.role}: '${t.family}', system-ui, sans-serif;`, `--weight-${t.role}: ${t.weight};`, `--size-${t.role}: ${t.size}px;`);
    if (t.tracking != null) lines.push(`--tracking-${t.role}: ${t.tracking}em;`);
  }
  for (const m of d.motion) lines.push(`--dur-${m.name}: ${m.duration}s;`);
  for (const s of d.spacing || []) lines.push(`--space-${s.name}: ${s.value}px;`);
  return `:root{${lines.join('')}}`;
}
