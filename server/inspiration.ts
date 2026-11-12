import fs from 'node:fs';
import path from 'node:path';
import type { Inspiration } from '../shared/types.ts';
import { GALLERY_DIR, HOME_DIR, BASE_URL } from './config.ts';
import { readJson, hashDir } from './util.ts';
import { renderLoop } from './gallery.ts';
import { renderClipFrames } from './render/clips.ts';
import { sheet } from './render/compose.ts';

/**
 * Inspiration: a small curated set of the best real-world pieces (studios, launches, films, creators). Each entry is
 * a link, the author, our own breakdown — and ONE line saying what we borrow (`take`), shown by our own mini-scene
 * (gallery/inspiration/<id>/, a clip like any other) that re-creates just that technique in a neutral style.
 * We never ship the works themselves, and an entry without a mini-scene is not listed: the preview is the point.
 */
const FILE = path.join(GALLERY_DIR, 'inspiration.json');
const DEMOS = path.join(GALLERY_DIR, 'inspiration');
/** folder of an entry's mini-scene (index.html + clip.js + style.css) */
export const inspirationDemoDir = (id: string) => path.join(DEMOS, id);
const hasDemo = (id: string) => /^[\w-]+$/.test(id) && fs.existsSync(path.join(inspirationDemoDir(id), 'index.html'));
const demoPage = (id: string) => `/gallery/inspiration/${id}/index.html`;

/** every entry in the file, listed or not (for checks) */
export const allInspiration = (): Inspiration[] => readJson<Inspiration[]>(FILE, []);
/** the collection: only entries that say what we take and show it */
export const listInspiration = (): Inspiration[] => allInspiration().filter((x) => x.take && x.demo && hasDemo(x.id));
export const getInspiration = (id: string) => listInspiration().find((x) => x.id === id);

/**
 * for agents: find pieces to learn from — by words (title, author, take, tags, techniques, breakdown), group
 * (motion / edit) and category. Ranked by how many query words hit; the take, techniques and tags weigh more than the breakdown.
 */
export function searchInspiration(o: { query?: string; group?: string; category?: string; limit?: number }) {
  const words = String(o.query || '').toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 1);
  const scored = listInspiration()
    .filter((x) => (!o.group || (x.group || 'motion') === o.group) && (!o.category || x.category === o.category))
    .map((x) => {
      const strong = `${x.title} ${x.by} ${x.take} ${(x.tags || []).join(' ')} ${(x.techniques || []).join(' ')} ${x.category}`.toLowerCase();
      const weak = x.breakdown.toLowerCase();
      const score = words.reduce((n, w) => n + (strong.includes(w) ? 3 : 0) + (weak.includes(w) ? 1 : 0), 0);
      return { x, score };
    })
    .filter((r) => !words.length || r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(20, o.limit || 8)).map(({ x }) => ({ id: x.id, group: x.group || 'motion', category: x.category, title: x.title, by: x.by, year: x.year, url: x.url, take: x.take, techniques: x.techniques, tags: x.tags, breakdown: x.breakdown, demo: `gallery/inspiration/${x.id}/clip.js` }));
}
export function inspirationCategories() {
  const m = new Map<string, number>();
  for (const x of listInspiration()) { const k = `${x.group || 'motion'}/${x.category}`; m.set(k, (m.get(k) || 0) + 1); }
  return Object.fromEntries([...m.entries()].sort());
}

/** cache key of a mini-scene: its files + how it is shown */
const kitHash = () => ['_kit.css', '_kit.js'].map((f) => { try { const st = fs.statSync(path.join(DEMOS, f)); return `${st.size}-${Math.round(st.mtimeMs)}`; } catch { return ''; } }).join('|');
const demoKey = (x: Inspiration) => hashDir(inspirationDemoDir(x.id), JSON.stringify(x.demo) + kitHash());

const stillJobs = new Map<string, Promise<string | null>>();
/** the still of an entry: the frame of our mini-scene that shows the borrowed technique best (demo.poster), cached in ~/.smashcut/thumbs */
export function inspirationThumb(id: string): Promise<string | null> {
  const x = getInspiration(id);
  if (!x) return Promise.resolve(null);
  const out = path.join(HOME_DIR, 'thumbs', `inspiration-${id}-${demoKey(x)}.png`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (stillJobs.has(out)) return stillJobs.get(out)!;
  const p = (async () => {
    try {
      const d = x.demo.loop || 4;
      const input = { width: 1920, height: 1080, fps: 30, duration: d, timing: false };
      const r = await renderClipFrames(`${BASE_URL}${demoPage(id)}#${encodeURIComponent(JSON.stringify(input))}`, { width: 1920, height: 1080 }, [Math.min(x.demo.poster, d)]);
      // a mini-scene that throws is not a preview: no still, the entry shows as broken (and the smoke test fails)
      if (!r.frames[0] || r.errors.length) { console.error('inspiration still', id, r.errors.join('; ') || 'no frame'); return null; }
      const png = await sheet([{ png: r.frames[0], caption: '' }], { cols: 1, width: 656, checker: false, bg: '#16161b' });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, png);
      return out;
    } catch (e) { console.error('inspiration still', id, (e as Error).message); return null; }
  })().finally(() => stillJobs.delete(out));
  stillJobs.set(out, p);
  return p;
}

/** where the looping preview of a moving mini-scene lives (null: the entry is a still — nothing moves in what we take) */
export function inspirationPreviewPath(id: string): string | null {
  const x = getInspiration(id);
  return x?.demo.loop ? path.join(HOME_DIR, 'previews', `inspiration-${id}-${demoKey(x)}.mp4`) : null;
}
/** render the loop (whole mini-scene, start to end, so it loops seamlessly); queued with the technique previews */
export function inspirationPreview(id: string, front = false): Promise<string | null> {
  const x = getInspiration(id), out = inspirationPreviewPath(id);
  if (!x || !out) return Promise.resolve(null);
  return renderLoop(out, demoPage(id), { duration: x.demo.loop! }, front);
}
/** warm every still and loop in the background (once per mini-scene version) */
export function warmInspiration() {
  for (const x of listInspiration()) {
    inspirationThumb(x.id).catch(() => {});
    if (x.demo.loop) inspirationPreview(x.id).catch((e) => console.error('inspiration preview', x.id, (e as Error).message));
  }
}
