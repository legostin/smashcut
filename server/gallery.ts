import fs from 'node:fs';
import path from 'node:path';
import type { GalleryItem, PackageManifest } from '../shared/types.ts';
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
    for (const kind of ['clips', 'music'] as const) {
      const base = path.join(roots[origin], kind);
      if (!fs.existsSync(base)) continue;
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const dir = path.join(base, e.name);
        const m = readJson<Partial<PackageManifest>>(path.join(dir, 'manifest.json'), {});
        if (kind === 'clips' && !fs.existsSync(path.join(dir, 'index.html'))) continue;
        if (kind === 'music' && !fs.existsSync(path.join(dir, 'score.js'))) continue;
        out.push({
          id: e.name, kind: kind === 'clips' ? 'clip' : 'music', name: m.name || e.name, description: m.description, category: m.category || (kind === 'music' ? 'music' : 'other'),
          tags: m.tags || [], duration: m.duration, origin,
          url: kind === 'clips' ? `${urlBase[origin]}/clips/${e.name}/index.html` : `${urlBase[origin]}/music/${e.name}/score.js`,
          thumb: kind === 'clips' ? `/api/gallery/thumb/${origin}/${e.name}` : undefined,
        });
      }
    }
  }
  return out;
}

export function packageDir(origin: Origin, kind: 'clip' | 'music', id: string) {
  return path.join(roots[origin], kind === 'clip' ? 'clips' : 'music', id);
}

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
    const url = `${BASE_URL}${urlBase[origin]}/clips/${id}/index.html#${encodeURIComponent(JSON.stringify(input))}`;
    const r = await renderClipFrames(url, { width: 1920, height: 1080 }, [d * 0.55]);
    const png = await sheet([{ png: r.frames[0], caption: '' }], { cols: 1, width: 480, checker: false, bg: '#16161b' });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, png);
    return out;
  })().finally(() => thumbJobs.delete(key));
  thumbJobs.set(key, p);
  return p;
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

/** save a project clip/music into ~/.agent-videostudio/library */
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
