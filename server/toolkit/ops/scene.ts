// Scene-aware tracking (OpenCV wasm): camera_track (how the camera moves over the scene) and
// planar_track (a flat surface — screen, sign, wall — with perspective).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { probe, inputArgs, ffmpeg, type Probe } from '../ff.ts';
import { grayFrames, trackHomographies, inv3, mul3, apply3, norm3, decompose, type Mat3 } from '../cv.ts';
import { writeTrack } from '../../tracks.ts';

const VID = ['video'] as ('video')[];
const AW = 640;

function range(info: Probe, start: number, end: number, max: number) {
  const s = Math.min(Math.max(0, start || 0), info.duration - 0.1);
  const e = end > 0 ? Math.min(end, info.duration) : info.duration;
  if (e - s > max + 0.01) throw uerr('At most {max} s per run — set start/end', { max });
  return { start: s, dur: e - s };
}
/** analysis px ↔ normalised source (0…1) */
const toNorm = (H: Mat3, w: number, h: number): Mat3 => norm3(mul3(mul3([1 / w, 0, 0, 0, 1 / h, 0, 0, 0, 1], H), [w, 0, 0, 0, h, 0, 0, 0, 1]));

async function sheetOf(ctx: OpContext, abs: string, info: Probe, times: number[], draw: (i: number, tw: number, th: number) => string, name: string) {
  const tw = 320, th = Math.round((tw * info.height) / info.width);
  const tiles: { input: Buffer; left: number; top: number }[] = [];
  for (let i = 0; i < times.length; i++) {
    const f = path.join(ctx.tmp(), `sh-${i}.png`);
    await ffmpeg(ctx, ['-ss', String(times[i]), ...inputArgs(abs, info), '-frames:v', '1', '-vf', `scale=${tw}:${th}`, f]);
    if (!fs.existsSync(f)) continue;
    const svg = Buffer.from(`<svg width="${tw}" height="${th}">${draw(i, tw, th)}<rect x="0" y="${th - 20}" width="${tw}" height="20" fill="rgba(0,0,0,.6)"/><text x="6" y="${th - 6}" font-family="Helvetica" font-size="12" fill="#fff">${times[i].toFixed(2)}s</text></svg>`);
    tiles.push({ input: await sharp(f).composite([{ input: svg }]).png().toBuffer(), left: (i % 4) * (tw + 4), top: Math.floor(i / 4) * (th + 4) });
  }
  const out = ctx.out(name, 'jpg');
  await sharp({ create: { width: 4 * (tw + 4) - 4, height: Math.ceil(tiles.length / 4) * (th + 4) - 4, channels: 3, background: '#111111' } }).composite(tiles).jpeg({ quality: 85 }).toFile(ctx.abs(out));
  return out;
}
const picks = (n: number, k = 8) => Array.from({ length: Math.min(k, n) }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, Math.min(k, n) - 1)));
const slugName = (s: string, d: string) => (s || d).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || d;

defineOp({
  id: 'camera_track',
  title: 'Camera track (scene motion)',
  category: 'video',
  cost: 'medium',
  version: 1,
  description: 'Understand how the camera moves over the scene: hundreds of background feature points are followed with optical flow and a robust homography (RANSAC, so moving people/objects are ignored) is solved for every frame relative to the first. Saves tracks/<name>.json (kind camera) with per-frame homography + pan/tilt (px), zoom, roll. Use it to make graphics STICK TO THE WORLD: in a clip, studio.follow(name, x, y, t) returns where the point that was at (x, y) on the first tracked frame is now. Returns a sheet with a grid locked to the scene — if the grid swims, the shot is too blurry/flat or parallax is strong.',
  limits: '≤ 60 s per run; works best on textured backgrounds; strong 3D parallax (camera moving through space near objects) is approximated by a plane',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    start: { type: 'number', label: 'From, s', min: 0, default: 0 },
    end: { type: 'number', label: 'To, s', min: 0, default: 0 },
    fps: { type: 'number', label: 'Analysis fps', min: 0, max: 60, step: 1, default: 0, description: '0 = the video fps (max 30)' },
    name: { type: 'string', label: 'Track name', default: '' },
  },
  outputs: { track: { kind: 'json' }, sheet: { kind: 'image' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    if (!info.hasVideo) throw uerr('{file} has no video stream', { file: p.video });
    const { start, dur } = range(info, p.start, p.end, 60);
    const fps = p.fps > 0 ? p.fps : Math.min(30, Math.round(info.fps || 30));
    ctx.progress(0.02, 'reading frames');
    const { frames, w, h } = await grayFrames(ctx, abs, info, start, dur, fps, AW);
    if (frames.length < 2) throw uerr('Could not read frames');
    const { Hs, inliers } = await trackHomographies(frames, w, h, { signal: ctx.signal, progress: (x) => ctx.progress(0.05 + 0.8 * x, 'tracking the scene') });
    const name = slugName(p.name, 'camera');
    const framesOut = Hs.map((H, k) => { const d = decompose(H, w, h); return { t: +(start + k / fps).toFixed(4), H: toNorm(H, w, h), dx: +(d.dx / w * info.width).toFixed(2), dy: +(d.dy / h * info.height).toFixed(2), scale: +d.scale.toFixed(4), rot: +d.rot.toFixed(3), inliers: inliers[k] }; });
    writeTrack(ctx.dir, { name, kind: 'camera', source: p.video.startsWith('media/') ? p.video : 'media/' + p.video, fps, width: info.width, height: info.height, frames: framesOut, points: [], createdAt: new Date().toISOString() } as any);
    // sheet: a grid from the first frame, mapped into later frames
    const grid: [number, number][] = [];
    for (let gy = 1; gy < 4; gy++) for (let gx = 1; gx < 6; gx++) grid.push([gx / 6, gy / 4]);
    const ix = picks(frames.length);
    const sheet = await sheetOf(ctx, abs, info, ix.map((k) => framesOut[k].t), (i, tw, th) => {
      const H = framesOut[ix[i]].H as Mat3;
      return grid.map(([u, v]) => { const [x, y] = apply3(H, u, v); return `<circle cx="${x * tw}" cy="${y * th}" r="4" fill="none" stroke="#d4ff3a" stroke-width="2"/>`; }).join('');
    }, `camera-${name}`);
    const last = framesOut[framesOut.length - 1];
    const lowInl = framesOut.filter((f) => f.inliers < 20).length;
    return { track: { name, file: `tracks/${name}.json`, frames: framesOut.length, motion: { panX: last.dx, panY: last.dy, zoom: last.scale, roll: last.rot }, weakFrames: lowInl, usage: `studio.follow("${name}", x, y, t) — (x, y) in frame px on the first tracked frame → where that scene point is at t` }, sheet };
  },
});

defineOp({
  id: 'planar_track',
  title: 'Planar track (screen / sign / wall)',
  category: 'video',
  cost: 'medium',
  version: 1,
  description: 'Track a FLAT surface with perspective — a phone/laptop screen, a poster, a sign, a wall, a table top — from its 4 corners on one frame. Feature points inside the surface are followed with optical flow and a homography is solved per frame, so the corners follow rotation, scale and perspective. Saves tracks/<name>.json (kind plane). In a clip: const pl = studio.plane(name, t) → {corners:[[x,y]×4], matrix(w,h) → CSS matrix3d} — put any HTML element (a UI screen, a logo, text) onto the surface: el.style.transform = pl.matrix(el.offsetWidth, el.offsetHeight) with transform-origin 0 0. Get the corners by looking at a frame (extract_frames): order top-left, top-right, bottom-right, bottom-left.',
  limits: '≤ 60 s per run; the surface needs some texture/edges; reflections and heavy occlusion reduce accuracy',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    corners: { type: 'string', label: 'Corners at `at`', required: true, description: '"x1,y1, x2,y2, x3,y3, x4,y4" TL,TR,BR,BL — 0…1 of the frame or source px' },
    at: { type: 'number', label: 'Corners frame, s', min: 0, default: 0 },
    start: { type: 'number', label: 'From, s', min: 0, default: 0 },
    end: { type: 'number', label: 'To, s', min: 0, default: 0 },
    fps: { type: 'number', label: 'Analysis fps', min: 0, max: 60, step: 1, default: 0, description: '0 = the video fps (max 30)' },
    name: { type: 'string', label: 'Track name', default: '' },
  },
  outputs: { track: { kind: 'json' }, sheet: { kind: 'image' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    if (!info.hasVideo) throw uerr('{file} has no video stream', { file: p.video });
    const n = String(p.corners).split(/[,\s]+/).filter(Boolean).map(Number);
    if (n.length !== 8 || n.some((v) => !Number.isFinite(v))) throw uerr('corners must be 8 numbers: x1,y1,…,x4,y4');
    const normIn = n.every((v) => v <= 1.0001);
    const { start, dur } = range(info, p.start, p.end, 60);
    const fps = p.fps > 0 ? p.fps : Math.min(30, Math.round(info.fps || 30));
    ctx.progress(0.02, 'reading frames');
    const { frames, w, h } = await grayFrames(ctx, abs, info, start, dur, fps, AW);
    const ref = Math.min(frames.length - 1, Math.max(0, Math.round(((p.at || start) - start) * fps)));
    const q0: [number, number][] = [0, 1, 2, 3].map((i) => [normIn ? n[i * 2] * w : (n[i * 2] / info.width) * w, normIn ? n[i * 2 + 1] * h : (n[i * 2 + 1] / info.height) * h]);
    // points must lie inside the surface (slightly shrunk to avoid its edges / background)
    const cx = q0.reduce((a, c) => a + c[0], 0) / 4, cy = q0.reduce((a, c) => a + c[1], 0) / 4;
    const shrink = q0.map(([x, y]) => [cx + (x - cx) * 0.92, cy + (y - cy) * 0.92] as [number, number]);
    const { Hs, inliers } = await trackHomographies(frames, w, h, {
      refIndex: ref, maxCorners: 300, signal: ctx.signal, progress: (x) => ctx.progress(0.05 + 0.8 * x, 'tracking the surface'),
      region: (_k, H) => shrink.map(([x, y]) => apply3(H, x, y)),
    });
    const name = slugName(p.name, 'plane');
    const framesOut = Hs.map((H, k) => ({ t: +(start + k / fps).toFixed(4), corners: q0.map(([x, y]) => { const [u, v] = apply3(H, x, y); return [+(u / w).toFixed(5), +(v / h).toFixed(5)]; }), inliers: inliers[k] }));
    writeTrack(ctx.dir, { name, kind: 'plane', source: p.video.startsWith('media/') ? p.video : 'media/' + p.video, fps, width: info.width, height: info.height, frames: framesOut, points: [], createdAt: new Date().toISOString() } as any);
    const ix = picks(frames.length);
    const sheet = await sheetOf(ctx, abs, info, ix.map((k) => framesOut[k].t), (i, tw, th) => {
      const c = framesOut[ix[i]].corners;
      return `<polygon points="${c.map(([u, v]) => `${u * tw},${v * th}`).join(' ')}" fill="rgba(212,255,58,.18)" stroke="#d4ff3a" stroke-width="2"/>`;
    }, `plane-${name}`);
    return { track: { name, file: `tracks/${name}.json`, frames: framesOut.length, weakFrames: framesOut.filter((f) => f.inliers < 12).length, usage: `studio.plane("${name}", t) → {corners, matrix(w, h)}` }, sheet };
  },
});
void inv3;
