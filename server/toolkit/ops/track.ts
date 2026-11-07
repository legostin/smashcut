// Object tracking: track_object (detector by words or a box → template tracker with periodic re-detection),
// reframe_follow (crop that follows a track), blur_track (blur / pixelate a tracked object).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { bin } from '../../bin.ts';
import { probe, inputArgs, ffmpeg, videoEncoder, parseAspect, even, type Probe } from '../ff.ts';
import { detectObjects, DETECT_MODEL } from '../ml.ts';
import { readTrack, writeTrack, type TrackPoint, type TrackFile } from '../../tracks.ts';

const VID = ['video'] as ('video')[];
type Box = { x: number; y: number; w: number; h: number }; // analysis pixels

/** gray frames at `fps`, `aw` px wide, as one buffer */
function grayFrames(ctx: OpContext, abs: string, info: Probe, start: number, dur: number, fps: number, aw: number): Promise<{ frames: Uint8Array[]; w: number; h: number }> {
  const ah = even(Math.round((aw * info.height) / info.width));
  return new Promise((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-ss', String(start), '-t', String(dur), ...inputArgs(abs, info), '-an', '-vf', `fps=${fps},scale=${aw}:${ah}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
    const chunks: Buffer[] = [];
    p.stdout.on('data', (d) => chunks.push(d));
    let err = ''; p.stderr.on('data', (d) => (err += d));
    ctx.signal.addEventListener?.('abort', () => p.kill('SIGKILL'));
    p.on('close', (code) => {
      if (code !== 0) return reject(uerr('ffmpeg failed: {error}', { error: err.slice(-400) }));
      const all = Buffer.concat(chunks), size = aw * ah, frames: Uint8Array[] = [];
      for (let o = 0; o + size <= all.length; o += size) frames.push(new Uint8Array(all.buffer, all.byteOffset + o, size));
      resolve({ frames, w: aw, h: ah });
    });
  });
}

/** zero-mean normalised cross-correlation of template T (tw×th) against frame F sampled in box b (scaled to tw×th) */
function ncc(F: Uint8Array, fw: number, fh: number, T: Float32Array, tMean: number, tStd: number, tw: number, th: number, b: Box): number {
  const sx = b.w / tw, sy = b.h / th;
  let sum = 0, sum2 = 0, cross = 0;
  const n = tw * th;
  for (let j = 0; j < th; j++) {
    const yy = Math.min(fh - 1, Math.max(0, Math.round(b.y + j * sy)));
    for (let i = 0; i < tw; i++) {
      const xx = Math.min(fw - 1, Math.max(0, Math.round(b.x + i * sx)));
      const v = F[yy * fw + xx];
      sum += v; sum2 += v * v; cross += v * T[j * tw + i];
    }
  }
  const mean = sum / n, std = Math.sqrt(Math.max(1e-6, sum2 / n - mean * mean));
  return (cross / n - mean * tMean) / (std * tStd);
}
function makeTemplate(F: Uint8Array, fw: number, fh: number, b: Box, tw: number, th: number) {
  const T = new Float32Array(tw * th);
  const sx = b.w / tw, sy = b.h / th;
  for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
    const yy = Math.min(fh - 1, Math.max(0, Math.round(b.y + j * sy))), xx = Math.min(fw - 1, Math.max(0, Math.round(b.x + i * sx)));
    T[j * tw + i] = F[yy * fw + xx];
  }
  let s = 0, s2 = 0; for (const v of T) { s += v; s2 += v * v; }
  const mean = s / T.length;
  return { T, mean, std: Math.sqrt(Math.max(1e-6, s2 / T.length - mean * mean)) };
}

/** one tracking step: search around the previous box (coarse then fine, 3 scales) */
function step(F: Uint8Array, fw: number, fh: number, tpl: ReturnType<typeof makeTemplate>, tw: number, th: number, prev: Box) {
  const R = Math.max(8, Math.round(Math.max(prev.w, prev.h) * 0.6));
  let best = { s: -2, b: prev };
  for (const k of [0.96, 1, 1.04]) {
    const w = prev.w * k, h = prev.h * k;
    const cx = prev.x + prev.w / 2, cy = prev.y + prev.h / 2;
    for (let dy = -R; dy <= R; dy += 3) for (let dx = -R; dx <= R; dx += 3) {
      const b = { x: cx + dx - w / 2, y: cy + dy - h / 2, w, h };
      const s = ncc(F, fw, fh, tpl.T, tpl.mean, tpl.std, tw, th, b);
      if (s > best.s) best = { s, b };
    }
  }
  // refine ±2 px
  const c = best.b;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const b = { ...c, x: c.x + dx, y: c.y + dy };
    const s = ncc(F, fw, fh, tpl.T, tpl.mean, tpl.std, tw, th, b);
    if (s > best.s) best = { s, b };
  }
  return best;
}

const iou = (a: Box, b: Box) => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return i / (a.w * a.h + b.w * b.h - i || 1);
};

async function detectAt(ctx: OpContext, abs: string, info: Probe, t: number, query: string, scale: number): Promise<{ box: Box; score: number } | null> {
  const f = path.join(ctx.tmp(), `det-${Math.round(t * 1000)}.png`);
  await ffmpeg(ctx, ['-ss', String(t), ...inputArgs(abs, info), '-frames:v', '1', '-vf', 'scale=640:-2', f]);
  if (!fs.existsSync(f)) return null;
  const meta = await sharp(f).metadata();
  const k = (info.width / (meta.width || 640)) * scale; // detector px → analysis px
  const r = (await detectObjects(f, [query], 0.04))[0];
  if (!r) return null;
  return { box: { x: r.box.xmin * k, y: r.box.ymin * k, w: (r.box.xmax - r.box.xmin) * k, h: (r.box.ymax - r.box.ymin) * k }, score: r.score };
}

function parseBox(s: string, info: Probe, scale: number): Box {
  const n = String(s).split(/[,\s]+/).filter(Boolean).map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) throw uerr('box must be "x,y,w,h" (0…1 of the frame, or source pixels)');
  const norm = n.every((v) => v <= 1.0001);
  const [x, y, w, h] = norm ? [n[0] * info.width, n[1] * info.height, n[2] * info.width, n[3] * info.height] : n;
  return { x: x * scale, y: y * scale, w: w * scale, h: h * scale };
}

/** median-of-5 then 3-tap mean on each coordinate (lost points are skipped) */
function smooth(points: TrackPoint[], amount: number) {
  if (amount <= 0) return points;
  const keys = ['x', 'y', 'w', 'h'] as const;
  const out = points.map((p) => ({ ...p }));
  const W = Math.max(1, Math.round(amount * 4));
  for (let i = 0; i < points.length; i++) {
    if (points[i].lost) continue;
    // symmetric window that shrinks at the ends (no bias on moving objects)
    const r = Math.min(W, i, points.length - 1 - i);
    for (const k of keys) {
      const vals: number[] = [];
      for (let j = i - r; j <= i + r; j++) if (!points[j].lost) vals.push(points[j][k]);
      vals.sort((a, b) => a - b);
      out[i][k] = +vals[Math.floor(vals.length / 2)].toFixed(5);
    }
  }
  return out;
}

defineOp({
  id: 'track_object',
  title: 'Track an object',
  category: 'video',
  cost: 'medium',
  version: 2,
  description: `Follow an object through a video and save its track (box per frame) as tracks/<name>.json. Start from WORDS (query: "the phone", "red car", "face" — an open-vocabulary detector finds it; first use downloads ${DETECT_MODEL.size}) or from a BOX at time \`at\` ("x,y,w,h", 0…1 of the frame or source px — take a frame with extract_frames, look at it, and estimate the box). A fast template tracker follows it both ways; with a query it re-detects every \`redetect\` s to correct drift. Returns a contact sheet with the box drawn — check it. Then: clips read the track with studio.track(name, t) (graphics that follow the object), reframe_follow crops to it, blur_track hides it.`,
  limits: '≤ 60 s of video per run; objects that leave the frame or are heavily occluded get lost:true',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    query: { type: 'string', label: 'What to track (words)', default: '', description: 'e.g. "the phone in the hand" — or give a box' },
    box: { type: 'string', label: 'Box at `at`', default: '', description: '"x,y,w,h" (0…1 or px)' },
    at: { type: 'number', label: 'Box/query frame, s', min: 0, default: 0 },
    start: { type: 'number', label: 'From, s', min: 0, default: 0 },
    end: { type: 'number', label: 'To, s', min: 0, default: 0, description: '0 = to the end (max 60 s)' },
    fps: { type: 'number', label: 'Analysis fps', min: 2, max: 30, step: 1, default: 12 },
    redetect: { type: 'number', label: 'Re-detect every, s', min: 0, max: 10, step: 0.5, default: 1, description: 'query mode only; 0 = never' },
    smooth: { type: 'number', label: 'Smoothing', min: 0, max: 2, step: 0.25, default: 1 },
    name: { type: 'string', label: 'Track name', default: '', description: 'default: from the query / "track"' },
  },
  outputs: { track: { kind: 'json', description: '{name, file, points, lost, coverage}' }, sheet: { kind: 'image', description: 'frames with the tracked box' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    if (!info.hasVideo) throw uerr('{file} has no video stream', { file: p.video });
    if (!String(p.query || '').trim() && !String(p.box || '').trim()) throw uerr('Say what to track (query) or give a box');
    const start = Math.min(p.start || 0, info.duration - 0.1);
    const end = p.end > 0 ? Math.min(p.end, info.duration) : info.duration;
    const dur = end - start;
    if (dur > 60.01) throw uerr('Track at most 60 s per run — set start/end');
    const fps = p.fps;
    const AW = 320, scale = AW / info.width;
    ctx.progress(0.02, 'reading frames');
    const { frames, w: fw, h: fh } = await grayFrames(ctx, abs, info, start, dur, fps, AW);
    if (!frames.length) throw uerr('Could not read frames');
    const k0 = Math.min(frames.length - 1, Math.max(0, Math.round(((p.at || start) - start) * fps)));
    let init: Box | null = null;
    if (String(p.box || '').trim()) init = parseBox(p.box, info, scale);
    else {
      ctx.progress(0.05, 'finding the object');
      const d = await detectAt(ctx, abs, info, start + k0 / fps, p.query, scale);
      if (!d) throw uerr('Could not find “{q}” at {t}s — try other words, another `at`, or give a box', { q: p.query, t: (start + k0 / fps).toFixed(2) });
      init = d.box;
    }
    const TW = 24, TH = Math.max(8, Math.round((24 * init.h) / Math.max(1, init.w)));
    const boxes: (Box & { s: number; lost?: boolean })[] = new Array(frames.length);
    boxes[k0] = { ...init, s: 1 };
    const query = String(p.query || '').trim();
    const redetEvery = query && p.redetect > 0 ? Math.max(1, Math.round(p.redetect * fps)) : 0;
    let done = 0;
    for (const dir of [1, -1]) {
      let prev: Box = init;
      let tpl = makeTemplate(frames[k0], fw, fh, init, TW, TH);
      const base = tpl;
      for (let k = k0 + dir; k >= 0 && k < frames.length; k += dir) {
        if (ctx.signal.aborted) throw uerr('cancelled');
        let r = step(frames[k], fw, fh, tpl, TW, TH, prev);
        let lost = r.s < 0.35;
        if (redetEvery && (Math.abs(k - k0) % redetEvery === 0 || lost)) {
          const d = await detectAt(ctx, abs, info, start + k / fps, query, scale);
          if (d && (iou(d.box, r.b) > 0.05 || lost || r.s < 0.6)) { r = { s: Math.max(r.s, 0.7), b: d.box }; lost = false; tpl = makeTemplate(frames[k], fw, fh, d.box, TW, TH); }
        }
        boxes[k] = { ...r.b, s: r.s, ...(lost ? { lost: true } : {}) };
        if (!lost) {
          prev = r.b;
          // slow template update keeps it locked on while the object turns; anchor to the first look
          if (r.s > 0.75) { const cur = makeTemplate(frames[k], fw, fh, r.b, TW, TH); for (let i = 0; i < tpl.T.length; i++) tpl.T[i] = 0.6 * tpl.T[i] + 0.15 * cur.T[i] + 0.25 * base.T[i]; let s = 0, s2 = 0; for (const v of tpl.T) { s += v; s2 += v * v; } tpl.mean = s / tpl.T.length; tpl.std = Math.sqrt(Math.max(1e-6, s2 / tpl.T.length - tpl.mean ** 2)); }
        }
        done++;
        if (done % 10 === 0) ctx.progress(0.1 + 0.75 * (done / frames.length), `tracking ${done}/${frames.length}`);
      }
    }
    // to normalised source coords
    let points: TrackPoint[] = boxes.map((b, k) => ({ t: +(start + k / fps).toFixed(4), x: +(b.x / fw).toFixed(5), y: +(b.y / fh).toFixed(5), w: +(b.w / fw).toFixed(5), h: +(b.h / fh).toFixed(5), score: +b.s.toFixed(3), ...(b.lost ? { lost: true } : {}) }));
    points = smooth(points, p.smooth);
    const name = (String(p.name || '').trim() || query || 'track').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'track';
    const track: TrackFile = { name, source: p.video.startsWith('media/') ? p.video : 'media/' + p.video, fps, width: info.width, height: info.height, query: query || undefined, points, createdAt: new Date().toISOString() };
    writeTrack(ctx.dir, track);
    // contact sheet: 8 frames with the box
    ctx.progress(0.9, 'contact sheet');
    const picks = Array.from({ length: Math.min(8, points.length) }, (_, i) => Math.round((i * (points.length - 1)) / Math.max(1, Math.min(8, points.length) - 1)));
    const tw = 320, th = Math.round((tw * info.height) / info.width);
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < picks.length; i++) {
      const pt = points[picks[i]];
      const f = path.join(ctx.tmp(), `sheet-${i}.png`);
      await ffmpeg(ctx, ['-ss', String(pt.t), ...inputArgs(abs, info), '-frames:v', '1', '-vf', `scale=${tw}:${th}`, f]);
      if (!fs.existsSync(f)) continue;
      const col = pt.lost ? '#ff3b30' : '#d4ff3a';
      const svg = Buffer.from(`<svg width="${tw}" height="${th}"><rect x="${pt.x * tw}" y="${pt.y * th}" width="${pt.w * tw}" height="${pt.h * th}" fill="none" stroke="${col}" stroke-width="2.5"/><rect x="0" y="${th - 22}" width="${tw}" height="22" fill="rgba(0,0,0,.6)"/><text x="6" y="${th - 7}" font-family="Helvetica" font-size="13" fill="#fff">${pt.t.toFixed(2)}s · ${pt.lost ? 'LOST' : 'score ' + pt.score}</text></svg>`);
      tiles.push({ input: await sharp(f).composite([{ input: svg }]).png().toBuffer(), left: (i % 4) * (tw + 4), top: Math.floor(i / 4) * (th + 4) });
    }
    const rows = Math.ceil(tiles.length / 4);
    const sheet = ctx.out(`track-${name}`, 'jpg');
    await sharp({ create: { width: 4 * (tw + 4) - 4, height: rows * (th + 4) - 4, channels: 3, background: '#111111' } }).composite(tiles).jpeg({ quality: 85 }).toFile(ctx.abs(sheet));
    const lost = points.filter((x) => x.lost).length;
    return { track: { name, file: `tracks/${name}.json`, points: points.length, lost, coverage: +(1 - lost / points.length).toFixed(3), usage: `studio.track("${name}", t) in a clip → {x,y,w,h,cx,cy,lost} in frame px` }, sheet };
  },
});

/** sendcmd script for per-frame crop/overlay positions */
function cmds(points: TrackPoint[], fn: (p: TrackPoint) => string[]) {
  return points.map((p) => `${p.t.toFixed(4)} ${fn(p).join(', ')};`).join('\n');
}

defineOp({
  id: 'reframe_follow',
  title: 'Reframe following a track',
  category: 'video',
  cost: 'medium',
  version: 1,
  description: 'Crop a video to another aspect (e.g. 16:9 → 9:16) with the crop window following a tracked object (track_object first). Smooth camera-like motion; the window never leaves the frame. Use for vertical cut-downs of horizontal footage.',
  limits: 'the track must belong to this video',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    track: { type: 'string', label: 'Track name', required: true },
    aspect: { type: 'string', label: 'Aspect', default: '9:16' },
    zoom: { type: 'number', label: 'Zoom', min: 1, max: 4, step: 0.05, default: 1, description: '> 1 crops tighter around the object' },
    lag: { type: 'number', label: 'Camera lag', min: 0, max: 1, step: 0.05, default: 0.6, description: 'higher = calmer camera' },
    width: { type: 'number', label: 'Output width', min: 0, max: 3840, default: 0, description: '0 = keep crop size' },
  },
  outputs: { video: { kind: 'video' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    const tr = readTrack(ctx.dir, p.track);
    if (!tr) throw uerr('Track not found: {name} (run track_object first)', { name: p.track });
    const ar = parseAspect(p.aspect);
    let cw = info.height * ar, ch = info.height;
    if (cw > info.width) { cw = info.width; ch = info.width / ar; }
    cw = even(cw / p.zoom); ch = even(ch / p.zoom);
    // camera: exponential smoothing of the object centre
    let cx = 0, cy = 0;
    const a = 1 - Math.min(0.97, p.lag * 0.95);
    const pts = tr.points.map((q, i) => {
      const tx = (q.x + q.w / 2) * info.width, ty = (q.y + q.h / 2) * info.height;
      if (i === 0) { cx = tx; cy = ty; } else if (!q.lost) { cx += (tx - cx) * a; cy += (ty - cy) * a; }
      return { ...q, cx: Math.round(Math.min(info.width - cw, Math.max(0, cx - cw / 2))), cy: Math.round(Math.min(info.height - ch, Math.max(0, cy - ch / 2))) };
    });
    const script = path.join(ctx.tmp(), 'crop.cmd');
    fs.writeFileSync(script, cmds(pts as any, (q: any) => [`crop@crop x ${q.cx}`, `crop@crop y ${q.cy}`]));
    const enc = videoEncoder(!!info.alpha, !!info.hasAudio);
    const out = ctx.out('follow', enc.ext);
    const scale = p.width ? `,scale=${even(p.width)}:-2:flags=lanczos` : '';
    await ffmpeg(ctx, [...inputArgs(abs, info), '-vf', `sendcmd=f='${script.replace(/'/g, "\\'")}',crop@crop=${cw}:${ch}:${pts[0]?.cx ?? 0}:${pts[0]?.cy ?? 0}${scale}`, ...enc.args, ctx.abs(out)], { duration: info.duration, stage: 'reframing' });
    return { video: out };
  },
});

defineOp({
  id: 'blur_track',
  title: 'Blur / pixelate a tracked object',
  category: 'video',
  cost: 'medium',
  version: 1,
  description: 'Hide a tracked object (faces, plates, logos, screens) with a blur or pixelation that follows it (track_object first).',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    track: { type: 'string', label: 'Track name', required: true },
    mode: { type: 'enum', label: 'Mode', values: ['blur', 'pixelate'], default: 'blur' },
    strength: { type: 'number', label: 'Strength', min: 1, max: 60, default: 20 },
    padding: { type: 'number', label: 'Padding', min: 0, max: 1, step: 0.05, default: 0.15, description: 'grow the box by this share' },
  },
  outputs: { video: { kind: 'video' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    const tr = readTrack(ctx.dir, p.track);
    if (!tr) throw uerr('Track not found: {name} (run track_object first)', { name: p.track });
    // fixed box size = the largest tracked box (+padding); position follows the track
    const bw = even(Math.min(info.width, Math.max(...tr.points.map((q) => q.w)) * info.width * (1 + p.padding)));
    const bh = even(Math.min(info.height, Math.max(...tr.points.map((q) => q.h)) * info.height * (1 + p.padding)));
    const pos = (q: TrackPoint) => ({ x: Math.round(Math.min(info.width - bw, Math.max(0, (q.x + q.w / 2) * info.width - bw / 2))), y: Math.round(Math.min(info.height - bh, Math.max(0, (q.y + q.h / 2) * info.height - bh / 2))) });
    const script = path.join(ctx.tmp(), 'blur.cmd');
    fs.writeFileSync(script, cmds(tr.points, (q) => { const o = pos(q); return [`crop@crop x ${o.x}`, `crop@crop y ${o.y}`, `overlay@ov x ${o.x}`, `overlay@ov y ${o.y}`]; }));
    const p0 = pos(tr.points[0]);
    const fx = p.mode === 'pixelate' ? `scale=iw/${Math.round(p.strength)}:ih/${Math.round(p.strength)}:flags=neighbor,scale=${bw}:${bh}:flags=neighbor` : `boxblur=${Math.round(p.strength)}:2`;
    const enc = videoEncoder(!!info.alpha, !!info.hasAudio);
    const out = ctx.out(p.mode === 'pixelate' ? 'pixelated' : 'blurred', enc.ext);
    await ffmpeg(ctx, [...inputArgs(abs, info), '-filter_complex', `[0:v]sendcmd=f='${script.replace(/'/g, "\\'")}',split[a][b];[b]crop@crop=${bw}:${bh}:${p0.x}:${p0.y},${fx}[m];[a][m]overlay@ov=${p0.x}:${p0.y}[v]`, '-map', '[v]', ...(info.hasAudio ? ['-map', '0:a?'] : []), ...enc.args, ctx.abs(out)], { duration: info.duration, stage: 'hiding' });
    return { video: out };
  },
});
