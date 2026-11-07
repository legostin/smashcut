import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { Item } from '../shared/types.ts';
import { cur } from './project.ts';
import { ROOT, getSettings } from './config.ts';
import { bus } from './bus.ts';
import { nid, readJson, writeJson, runOk } from './util.ts';
import { getDesign } from './design.ts';
import { probeMedia } from './media.ts';
import { sheet } from './render/compose.ts';
import { recomputeTiming } from './timing.ts';
import { uerr } from './i18n.ts';

/**
 * Blender integration: 3D scenes are code (scenes3d/<id>/scene.py, using runtime/blender/studio3d.py) rendered
 * headless in stages — mock (Workbench, half-res: composition/camera/timing) → look (EEVEE: materials & light)
 * → final (EEVEE high samples + motion blur, or Cycles). Renders become media (mp4, or WebM with alpha) on the timeline.
 */
export type Quality = 'mock' | 'look' | 'final';
export interface Scene3D { id: string; name: string; duration: number; transparent?: boolean; params?: Record<string, unknown>; stage?: Quality; rendered?: Partial<Record<Quality, string>>; updatedAt?: string }
export interface Render3DJob { id: string; project: string; sceneId: string; quality: Quality; mode: 'stills' | 'animation'; status: 'running' | 'done' | 'error'; progress: number; output?: string; sheet?: string; error?: string; startedAt: string; endedAt?: string }

const RUNNER = path.join(ROOT, 'runtime', 'blender', 'run.py');
const MAC_APP = '/Applications/Blender.app/Contents/MacOS/Blender';

export function blenderBin(): string | null {
  const s = getSettings() as any;
  for (const c of [s.blenderPath, process.env.STUDIO_BLENDER, MAC_APP]) if (c && fs.existsSync(c)) return c;
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() || null : null;
}
export function blenderVersion(): string | null {
  const b = blenderBin();
  if (!b) return null;
  const r = spawnSync(b, ['--version'], { encoding: 'utf8', timeout: 20000 });
  return r.status === 0 ? (r.stdout.split('\n')[0] || '').trim() : null;
}

const dirOf = (id: string) => cur().p('scenes3d', id);
const safeId = (id: string) => { if (!/^[a-z0-9][a-z0-9_-]{0,60}$/i.test(id)) throw uerr('Invalid 3D scene id: {id}', { id }); return id; };

export function listScenes3d(): (Scene3D & { hasBlend: boolean })[] {
  const base = cur().p('scenes3d');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'scene.py'))).map((d) => ({ ...readJson<Scene3D>(path.join(base, d, 'manifest.json'), { id: d, name: d, duration: 5 }), id: d, hasBlend: fs.existsSync(path.join(base, d, 'scene.blend')) }));
}
export function getScene3d(id: string) {
  const dir = dirOf(safeId(id));
  if (!fs.existsSync(path.join(dir, 'scene.py'))) throw uerr('3D scene not found: {id}', { id }, 404);
  return { manifest: readJson<Scene3D>(path.join(dir, 'manifest.json'), { id, name: id, duration: 5 }), code: fs.readFileSync(path.join(dir, 'scene.py'), 'utf8'), dir: path.relative(cur().dir, dir) };
}

const SKELETON = (name: string) => `import studio3d as s3

# ${name}
# Time is in seconds. Stage: ctx.quality = 'mock' | 'look' | 'final'. Colours: ctx.color('accent'|'bg'|'text'|'surface'…).
def build(ctx):
    s3.world(ctx.color('bg', '#101014'))
    s3.light_rig('studio')
    s3.floor(s3.mat(ctx.color('bg', '#101014'), rough=0.6), z=-0.6)
    hero = s3.rounded_box((1, 1, 1), radius=0.12, material=s3.mat(ctx.color('accent', '#d4ff3a'), rough=0.35))
    s3.pop(hero, 0.0, 0.6)
    s3.turntable(hero, turns=0.25, t0=0, t1=ctx.duration, ease='inOutSine')
    cam = s3.camera(lens=50, location=(0, -6, 1.6), target=(0, 0, 0))
    s3.dolly(cam, (0.6, -4.8, 1.2), 0, ctx.duration, 'outCubic')
`;

export function createScene3d(o: { id: string; name?: string; duration?: number; transparent?: boolean; code?: string; params?: Record<string, unknown> }) {
  const id = safeId(o.id);
  const dir = dirOf(id);
  fs.mkdirSync(dir, { recursive: true });
  const prev = readJson<Scene3D | null>(path.join(dir, 'manifest.json'), null);
  const m: Scene3D = { ...(prev || {}), id, name: o.name || prev?.name || id, duration: o.duration ?? prev?.duration ?? 5, transparent: o.transparent ?? prev?.transparent ?? false, params: o.params ?? prev?.params ?? {}, updatedAt: new Date().toISOString() };
  writeJson(path.join(dir, 'manifest.json'), m);
  if (o.code || !fs.existsSync(path.join(dir, 'scene.py'))) fs.writeFileSync(path.join(dir, 'scene.py'), o.code || SKELETON(m.name));
  return getScene3d(id);
}

const jobs = new Map<string, Render3DJob>();
export const listJobs3d = () => { const id = cur().id; return [...jobs.values()].filter((j) => j.project === id).slice(-20); };
const emit = (j: Render3DJob) => bus.send({ type: 'render3d', job: { ...j } } as any);

/**
 * Render a scene: stills (contact sheet for checking) or the animation (→ media + timeline).
 * place: put/replace the render on the timeline (keeps the position of a previous render of this scene).
 */
export function render3d(id: string, o: { quality?: Quality; mode?: 'stills' | 'animation'; times?: number[]; place?: { start?: number; track?: string } | false }): { job: Render3DJob; done: Promise<Render3DJob> } {
  const bin = blenderBin();
  if (!bin) throw uerr('Blender not found. Install it from blender.org (or set the path in Settings).');
  const store = cur();
  const { manifest } = getScene3d(id);
  const quality: Quality = o.quality || 'mock';
  const mode = o.mode || 'animation';
  const p = store.project;
  const job: Render3DJob = { id: 'b' + nid(), project: store.id, sceneId: id, quality, mode, status: 'running', progress: 0, startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  emit(job);
  const work = store.p('.studio', '3d', id, `${quality}-${mode}`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const spec = {
    scene: path.join(dirOf(id), 'scene.py'), outDir: work, mode, quality, fps: p.fps, duration: manifest.duration,
    width: p.width, height: p.height, transparent: !!manifest.transparent, times: o.times, params: manifest.params || {},
    design: getDesign(), projectDir: store.dir, blend: path.join(dirOf(id), 'scene.blend'),
  };
  writeJson(path.join(work, 'job.json'), spec);
  const done = new Promise<Render3DJob>((resolve) => {
    const proc = spawn(bin, ['-b', '--factory-startup', '--python', RUNNER, '--', path.join(work, 'job.json')], { cwd: store.dir });
    let log = '';
    const onData = (b: Buffer) => {
      const s = b.toString(); log = (log + s).slice(-8000);
      for (const m of s.matchAll(/STUDIO3D progress (\d+)\/(\d+)/g)) { job.progress = (+m[1] / +m[2]) * (mode === 'animation' ? 0.9 : 1); emit(job); }
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('close', async (code) => {
      try {
        if (code !== 0 || !/STUDIO3D done/.test(log)) {
          const err = /STUDIO3D error (.*)/.exec(log)?.[1] || log.split('\n').filter((l) => /Error|Traceback|line \d+/.test(l)).slice(-6).join('\n') || `blender exited with ${code}`;
          throw new Error(err);
        }
        if (mode === 'stills') {
          const files = fs.readdirSync(work).filter((f) => /^still-\d+\.png$/.test(f)).sort();
          const times = o.times || [manifest.duration / 2];
          const png = await sheet(files.map((f, i) => ({ png: fs.readFileSync(path.join(work, f)), caption: `${quality} · ${(times[i] ?? 0).toFixed(2)}s` })), { cols: Math.min(3, files.length), width: 1440 });
          const rel = path.join('.studio', 'frames', `3d-${id}-${quality}.png`);
          fs.mkdirSync(store.p('.studio', 'frames'), { recursive: true });
          fs.writeFileSync(store.p(rel), png);
          job.sheet = rel;
        } else {
          const alpha = !!manifest.transparent;
          const name = `3d-${id}-${quality}.${alpha ? 'webm' : 'mp4'}`;
          const out = store.p('media', name);
          const fps = String(p.fps);
          const args = ['-y', '-v', 'error', '-framerate', fps, '-i', path.join(work, '%04d.png')];
          if (alpha) args.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', quality === 'final' ? '20' : '32', '-deadline', quality === 'final' ? 'good' : 'realtime', '-cpu-used', quality === 'final' ? '2' : '8', '-auto-alt-ref', '0');
          else args.push('-vf', `scale=${p.width}:${p.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', quality === 'final' ? 'slow' : 'veryfast', '-crf', quality === 'final' ? '16' : '22', '-movflags', '+faststart', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
          await runOk('ffmpeg', [...args, out + '.tmp' + path.extname(out)]);
          fs.renameSync(out + '.tmp' + path.extname(out), out);
          await probeMedia(name, true);
          job.output = name;
          const m = readJson<Scene3D>(path.join(dirOf(id), 'manifest.json'), manifest);
          writeJson(path.join(dirOf(id), 'manifest.json'), { ...m, stage: quality, rendered: { ...(m.rendered || {}), [quality]: name } });
          if (o.place !== false) await placeRender(id, name, manifest.duration, o.place || {});
        }
        job.status = 'done'; job.progress = 1;
      } catch (e) {
        job.status = 'error'; job.error = (e as Error).message.slice(0, 1200);
      }
      job.endedAt = new Date().toISOString();
      emit(job);
      resolve(job);
    });
  });
  return { job, done };
}

/** put the render on the timeline, replacing an earlier render of the same scene (keeps its position & track) */
async function placeRender(id: string, file: string, duration: number, at: { start?: number; track?: string }) {
  const store = cur();
  await store.update((pp) => {
    const prev = pp.items.find((i) => i.kind === 'media' && i.ref.startsWith(`3d-${id}-`));
    if (prev) { prev.ref = file; prev.duration = +duration.toFixed(3); prev.label = `3D: ${id}`; return; }
    const start = at.start ?? 0, end = start + duration;
    const free = (tid: string) => !pp.items.some((i) => i.track === tid && i.start < end && i.start + i.duration > start);
    // a free video track (or the requested one); otherwise a dedicated "3D" track
    let track = at.track || pp.tracks.find((t) => t.kind === 'video' && free(t.id))?.id;
    if (!track) {
      track = pp.tracks.some((t) => t.id === 'v3d') && free('v3d') ? 'v3d' : 'v3d' + (pp.tracks.some((t) => t.id === 'v3d') ? '-' + nid().slice(0, 3) : '');
      if (!pp.tracks.some((t) => t.id === track)) {
        // just above the footage, below graphics/captions (an opaque render must not cover titles)
        const vi = pp.tracks.findIndex((t) => t.kind === 'video');
        pp.tracks.splice(vi >= 0 ? vi : 0, 0, { id: track, kind: 'video', name: '3D' });
      }
    }
    const item: Item = { id: 'i' + nid(), kind: 'media', ref: file, track, start: +(at.start ?? 0).toFixed(3), duration: +duration.toFixed(3), in: 0, label: `3D: ${id}` } as Item;
    pp.items.push(item);
    pp.duration = Math.max(pp.duration, Math.ceil(item.start + item.duration));
  });
  recomputeTiming();
}

/** open the generated .blend in the Blender app (for hands-on polishing; the script stays the source of truth) */
export function openInBlender(id: string) {
  const blend = path.join(dirOf(safeId(id)), 'scene.blend');
  if (!fs.existsSync(blend)) throw uerr('Render the scene once first — the .blend is created on render.');
  const bin = blenderBin();
  if (process.platform === 'darwin') spawn('open', ['-a', 'Blender', blend], { detached: true, stdio: 'ignore' }).unref();
  else if (bin) spawn(bin, [blend], { detached: true, stdio: 'ignore' }).unref();
  return { blend: path.relative(cur().dir, blend) };
}
