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

const inflight = new Map<string, Promise<string | null>>();
/** official preview image, downloaded once into ~/.agent-videostudio/inspiration */
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
      const res = await fetch(it.thumb!, { headers: { 'user-agent': 'AgentVideoStudio/0.1 (+preview cache)' }, signal: AbortSignal.timeout(15000) });
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
