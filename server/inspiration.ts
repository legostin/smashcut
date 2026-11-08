import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Inspiration } from '../shared/types.ts';
import { GALLERY_DIR, HOME_DIR } from './config.ts';
import { readJson } from './util.ts';

/**
 * Inspiration: curated real-world motion pieces (studios, launches, code demos) — a link, the author and our own
 * breakdown of the technique. We never ship the works themselves: only the official preview image (cached locally).
 */
const FILE = path.join(GALLERY_DIR, 'inspiration.json');
export const listInspiration = (): Inspiration[] => readJson<Inspiration[]>(FILE, []);
export const getInspiration = (id: string) => listInspiration().find((x) => x.id === id);

/**
 * for agents: find pieces to learn from — by words (title, author, tags, techniques, breakdown), group (motion / edit)
 * and category. Ranked by how many query words hit, techniques and tags weigh more than the breakdown.
 */
export function searchInspiration(o: { query?: string; group?: string; category?: string; limit?: number }) {
  const words = String(o.query || '').toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 1);
  const scored = listInspiration()
    .filter((x) => (!o.group || (x.group || 'motion') === o.group) && (!o.category || x.category === o.category))
    .map((x) => {
      const strong = `${x.title} ${x.by} ${(x.tags || []).join(' ')} ${(x.techniques || []).join(' ')} ${x.category}`.toLowerCase();
      const weak = x.breakdown.toLowerCase();
      const score = words.reduce((n, w) => n + (strong.includes(w) ? 3 : 0) + (weak.includes(w) ? 1 : 0), 0);
      return { x, score };
    })
    .filter((r) => !words.length || r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(20, o.limit || 8)).map(({ x }) => ({ id: x.id, group: x.group || 'motion', category: x.category, title: x.title, by: x.by, year: x.year, url: x.url, techniques: x.techniques, tags: x.tags, breakdown: x.breakdown }));
}
export function inspirationCategories() {
  const m = new Map<string, number>();
  for (const x of listInspiration()) { const k = `${x.group || 'motion'}/${x.category}`; m.set(k, (m.get(k) || 0) + 1); }
  return Object.fromEntries([...m.entries()].sort());
}

const inflight = new Map<string, Promise<string | null>>();
/** official preview image, downloaded once into ~/.smashcut/inspiration */
export function inspirationThumb(id: string): Promise<string | null> {
  const it = getInspiration(id);
  if (!it?.thumb) return Promise.resolve(null);
  const key = crypto.createHash('sha1').update(it.thumb).digest('hex').slice(0, 12);
  const dir = path.join(HOME_DIR, 'inspiration');
  const hit = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.startsWith(key)) : undefined;
  if (hit) return Promise.resolve(path.join(dir, hit));
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    try {
      const res = await fetch(it.thumb!, { headers: { 'user-agent': 'Smashcut/0.1 (+preview cache)' }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${key}.${ext}`);
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      return f;
    } catch { return null; }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
