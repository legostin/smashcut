import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { GalleryItem, PackageManifest } from '../shared/types.ts';
import { runOk } from './util.ts';
import { GALLERY_DIR, LIBRARY_DIR, HOME_DIR, BASE_URL } from './config.ts';
import { cur } from './project.ts';
import { copyDir, readJson, writeJson, hashDir, slug } from './util.ts';
import { renderClipFrames } from './render/clips.ts';
import { sheet } from './render/compose.ts';

const roots = { builtin: GALLERY_DIR, library: LIBRARY_DIR } as const;
type Origin = keyof typeof roots;
const urlBase = { builtin: '/gallery', library: '/library' } as const;

export function listGallery(): GalleryItem[] {
  const out: GalleryItem[] = [];
  for (const origin of Object.keys(roots) as Origin[]) {
    // kits3d: ready-made Three.js studio starters (clips like any other, shown as "3D kits")
    for (const kind of ['clips', 'kits3d', 'music'] as const) {
      const base = path.join(roots[origin], kind);
      if (!fs.existsSync(base)) continue;
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const dir = path.join(base, e.name);
        const m = readJson<Partial<PackageManifest>>(path.join(dir, 'manifest.json'), {});
        if (kind !== 'music' && !fs.existsSync(path.join(dir, 'index.html'))) continue;
        if (kind === 'music' && !fs.existsSync(path.join(dir, 'score.js'))) continue;
        out.push({
          id: e.name, kind: kind === 'music' ? 'music' : 'clip', name: m.name || e.name, description: m.description, category: m.category || (kind === 'music' ? 'music' : kind === 'kits3d' ? '3d-kit' : 'other'),
          tags: m.tags || [], duration: m.duration, origin,
          url: kind !== 'music' ? `${urlBase[origin]}/${kind}/${e.name}/index.html` : `${urlBase[origin]}/music/${e.name}/score.js`,
          thumb: kind !== 'music' ? `/api/gallery/thumb/${origin}/${e.name}` : undefined,
        });
      }
    }
  }
  return out;
}

/** folder of a clip package: clips/<id>, or kits3d/<id> for the 3D studio starters */
function clipFolder(origin: Origin, id: string) {
  return !fs.existsSync(path.join(roots[origin], 'clips', id)) && fs.existsSync(path.join(roots[origin], 'kits3d', id)) ? 'kits3d' : 'clips';
}
export function packageDir(origin: Origin, kind: 'clip' | 'music', id: string) {
  return path.join(roots[origin], kind === 'clip' ? clipFolder(origin, id) : 'music', id);
}
/** URL of a clip package's page */
const clipPage = (origin: Origin, id: string) => `${urlBase[origin]}/${clipFolder(origin, id)}/${id}/index.html`;

const thumbJobs = new Map<string, Promise<string>>();
export function galleryThumb(origin: Origin, id: string): Promise<string> {
  const dir = packageDir(origin, 'clip', id);
  const h = hashDir(dir);
  const out = path.join(HOME_DIR, 'thumbs', `${origin}-${id}-${h}.png`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  const key = out;
  if (thumbJobs.has(key)) return thumbJobs.get(key)!;
  const p = (async () => {
    const m = readJson<Partial<PackageManifest>>(path.join(dir, 'manifest.json'), {});
    const d = m.duration || 5;
    const input = { width: 1920, height: 1080, fps: 30, duration: d, timing: false };
    const url = `${BASE_URL}${clipPage(origin, id)}#${encodeURIComponent(JSON.stringify(input))}`;
    const r = await renderClipFrames(url, { width: 1920, height: 1080 }, [d * 0.55]);
    const png = await sheet([{ png: r.frames[0], caption: '' }], { cols: 1, width: 480, checker: false, bg: '#16161b' });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    return out;
  })().finally(() => thumbJobs.delete(key));
  thumbJobs.set(key, p);
  return p;
}

/**
 * Looping preview video of a technique (for the live gallery grid): ~5 s at 24 fps, 640 px wide, H.264.
 * Rendered once per clip version and cached in ~/.smashcut/previews; generated one at a time.
 */
const previewQueue: (() => Promise<void>)[] = [];
const previewJobs = new Map<string, Promise<string>>();
let previewBusy = false;
function pumpPreviews() {
  if (previewBusy) return;
  const next = previewQueue.shift();
  if (!next) return;
  previewBusy = true;
  next().finally(() => { previewBusy = false; pumpPreviews(); });
}
export function previewPath(origin: Origin, id: string) {
  const dir = packageDir(origin, 'clip', id);
  return path.join(HOME_DIR, 'previews', `${origin}-${id}-${hashDir(dir)}.mp4`);
}
export function galleryPreview(origin: Origin, id: string, front = false): Promise<string> {
  const out = previewPath(origin, id);
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (previewJobs.has(out)) return previewJobs.get(out)!;
  const p = new Promise<string>((resolve, reject) => {
    const job = async () => {
      try {
        const dir = packageDir(origin, 'clip', id);
        const m = readJson<Partial<PackageManifest>>(path.join(dir, 'manifest.json'), {});
        const d = m.duration || 5;
        const len = Math.min(d, 6), fps = 24;
        const input = { width: 1920, height: 1080, fps: 30, duration: d, timing: false };
        const url = `${BASE_URL}${clipPage(origin, id)}#${encodeURIComponent(JSON.stringify(input))}`;
        // the most lively stretch: start a little in so entrances are visible, end before long holds
        const t0 = Math.max(0, Math.min(d - len, d * 0.05));
        const times = Array.from({ length: Math.round(len * fps) }, (_, k) => t0 + k / fps);
        const r = await renderClipFrames(url, { width: 1920, height: 1080 }, times);
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-prev-'));
        const ext = r.frames[0]?.[0] === 0xff ? 'jpg' : 'png';
        r.frames.forEach((f, k) => fs.writeFileSync(path.join(tmp, `f${String(k).padStart(4, '0')}.${ext}`), f));
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await runOk('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(tmp, `f%04d.${ext}`), '-vf', 'scale=640:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-movflags', '+faststart', '-an', out + '.tmp.mp4']);
        fs.renameSync(out + '.tmp.mp4', out);
        fs.rmSync(tmp, { recursive: true, force: true });
        resolve(out);
      } catch (e) { reject(e); } finally { previewJobs.delete(out); }
    };
    if (front) previewQueue.unshift(job); else previewQueue.push(job);
    pumpPreviews();
  });
  previewJobs.set(out, p);
  p.catch(() => {});
  return p;
}
/** warm all previews in the background (once per clip version) */
export function warmPreviews() {
  for (const g of listGallery()) if (g.kind === 'clip' && !fs.existsSync(previewPath(g.origin as Origin, g.id))) galleryPreview(g.origin as Origin, g.id).catch((e) => console.error('preview', g.id, (e as Error).message));
}

function uniqueId(base: string, exists: (id: string) => boolean) {
  let id = slug(base);
  let n = 2;
  while (exists(id)) id = `${slug(base)}-${n++}`;
  return id;
}

/** copy a gallery/library package into the project; returns the new id */
export function useTemplate(origin: Origin, kind: 'clip' | 'music', id: string, newId?: string) {
  const store = cur();
  const src = packageDir(origin, kind, id);
  if (!fs.existsSync(src)) throw new Error(`template not found: ${origin}/${kind}/${id}`);
  const folder = kind === 'clip' ? 'clips' : 'music';
  const target = uniqueId(newId || id, (x) => fs.existsSync(store.p(folder, x)));
  copyDir(src, store.p(folder, target));
  const mf = store.p(folder, target, 'manifest.json');
  const m = readJson<PackageManifest>(mf, { id: target, kind, name: target } as PackageManifest);
  writeJson(mf, { ...m, id: target, source: `${origin}:${id}` });
  return target;
}

/** save a project clip/music into ~/.smashcut/library */
export function saveToLibrary(kind: 'clip' | 'music', id: string, name?: string) {
  const store = cur();
  const folder = kind === 'clip' ? 'clips' : 'music';
  const src = store.p(folder, id);
  const dst = path.join(LIBRARY_DIR, folder, id);
  fs.rmSync(dst, { recursive: true, force: true });
  copyDir(src, dst);
  const mf = path.join(dst, 'manifest.json');
  const m = readJson<PackageManifest>(mf, { id, kind, name: id } as PackageManifest);
  writeJson(mf, { ...m, id, kind, name: name || m.name || id });
  return { origin: 'library', id };
}

export function deleteFromLibrary(kind: 'clip' | 'music', id: string) {
  fs.rmSync(path.join(LIBRARY_DIR, kind === 'clip' ? 'clips' : 'music', id), { recursive: true, force: true });
}
