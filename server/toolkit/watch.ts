// watch_video — lets a model that only sees images and text "watch" a video in one call:
//   structure  shots (same cut decision as detect_shots), ASL, cuts/min, the pacing curve, sections
//   look       contact sheets: one numbered frame per shot, big enough to read on-screen text
//   motion     motion strips: rows of 8 frames at ~12 fps around cuts (both sides), motion peaks and evenly spaced moments
//   sound      transcript (local Whisper), tempo/beat grid, loudness curve, cuts on beats
// One ffmpeg pass at 320 px gives per-frame scene score, motion (scdet mafd) and luma; frames for the sheets are fast
// seeks (-ss before -i). Results are cached per file + range in .studio/watch/<name>-<hash>/ (images, summary.txt,
// transcript.txt, result.json), so re-watching is instant. REST: POST /api/agent/watch-video (server/toolkit/routes.ts).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
type Overlay = { input: string | Buffer; left: number; top: number };
import { cur } from '../project.ts';
import { bin } from '../bin.ts';
import { uerr } from '../i18n.ts';
import { readJson, writeJson, sha1, slug } from '../util.ts';
import { decodePcm, analyzePcm, loudnessSparkline } from '../audio/analyze.ts';
import { transcribeMedia } from '../media.ts';
import { probe, inputArgs, type Probe } from './ff.ts';
import { shotsFromScores, type Shot } from './ops/shots.ts';
import { normFile } from './registry.ts';
import { runOpAndWait } from './index.ts';

const VERSION = 1;
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v|avi|gif)$/i;
const SHEET_W = 1568; // Claude's long-edge limit before it downscales
const SHEET_MAX_H = 1180;

export interface WatchRequest { file?: string; url?: string; start?: number; end?: number; focus?: string; detail?: 'quick' | 'full' }
export interface WatchResult {
  file: string; start: number; end: number; detail: 'quick' | 'full'; cached: boolean; ms: number;
  /** the compact summary a model reads first */
  text: string;
  /** project-relative image paths */
  sheets: string[]; strips: string[]; keyframes: string;
  /** the images worth showing inline (≤ 6) */
  inline: string[];
  dir: string;
  data: Record<string, unknown>;
}

/** per analysed frame: time, scene score, motion (mafd), mean luma 0–255 (thumbnail), brightest pixel (320 px, native range) and a 64-bin colour histogram */
interface Fr { t: number; s: number; m: number; y: number; ymax: number; h: Float32Array; d: number }
interface Moment { kind: 'cut' | 'motion' | 'even' | 'focus'; at: number; from: number; label: string; cutAt?: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const tc2 = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const BARS = '▁▂▃▄▅▆▇█';

function ff(args: string[], timeoutMs = 10 * 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), ['-hide_banner', '-nostdin', '-y', '-v', 'error', ...args]);
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stderr.on('data', (d) => { err += d; if (err.length > 8000) err = err.slice(-4000); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.trim().split('\n').slice(-3).join(' | ').slice(-500))); });
  });
}

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

/** one pass at 320 px: scene score (cuts) and mafd (motion) per frame, plus a 32×18 RGB thumbnail per frame
 *  (luma → fades / black, colour histogram → dissolves that never spike the scene score) */
const TW = 32, TH = 18;
async function analyzeFrames(abs: string, info: Probe, s: number, dur: number, tmp: string): Promise<Fr[]> {
  const f = ['scene', 'mafd', 'ymax'].map((n) => path.join(tmp, n + '.txt'));
  const e = f.map((x) => x.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"));
  const thumbs = path.join(tmp, 'thumbs.rgb');
  await ff(['-ss', String(s), '-t', String(dur), ...inputArgs(abs, info), '-an', '-sn', '-dn', '-filter_complex',
    `[0:v]scale=320:-2,split=2[a][b];[a]select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file='${e[0]}',scdet=threshold=100,metadata=print:key=lavfi.scd.mafd:file='${e[1]}',signalstats,metadata=print:key=lavfi.signalstats.YMAX:file='${e[2]}'[o1];[b]scale=${TW}:${TH}:flags=area,format=rgb24[o2]`,
    '-map', '[o1]', '-fps_mode', 'passthrough', '-f', 'null', '-', '-map', '[o2]', '-fps_mode', 'passthrough', '-f', 'rawvideo', thumbs]);
  const read = (file: string, key: string) => {
    const out: { t: number; v: number }[] = [];
    let t = NaN;
    for (const line of (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n')) {
      const mt = /pts_time:([\d.e-]+)/.exec(line); if (mt) { t = Number(mt[1]); continue; }
      if (line.startsWith(key + '=')) out.push({ t, v: Number(line.slice(key.length + 1)) || 0 });
    }
    return out;
  };
  const sc = read(f[0], 'lavfi.scene_score'), mo = read(f[1], 'lavfi.scd.mafd'), ym = read(f[2], 'lavfi.signalstats.YMAX');
  const raw = fs.existsSync(thumbs) ? fs.readFileSync(thumbs) : Buffer.alloc(0);
  const fsz = TW * TH * 3;
  let prevY = 0;
  return sc.map((x, i) => {
    let y = 0;
    const ymax = ym[i]?.v ?? 255;
    const h = new Float32Array(64);
    const o = i * fsz;
    if (o + fsz <= raw.length) {
      for (let p = 0; p < TW * TH; p++) {
        const r = raw[o + p * 3], g = raw[o + p * 3 + 1], b = raw[o + p * 3 + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        y += l;
        h[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)] += 1 / (TW * TH);
      }
      y /= TW * TH;
    } else y = 128;
    // change from the previous frame relative to brightness (finds cuts between two dark shots, where scene scores stay low)
    let d = 0;
    if (i > 0 && o + fsz <= raw.length) { for (let p = 0; p < fsz; p++) d += Math.abs(raw[o + p] - raw[o - fsz + p]); d /= fsz; d /= (y + prevY) / 2 + 8; }
    prevY = y;
    return { t: x.t, s: x.v, m: mo[i]?.v ?? 0, y, ymax, h, d };
  });
}
/** 0 (same colours) … 1 (nothing in common) */
const hdist = (a: Float32Array, b: Float32Array) => { let d = 0; for (let i = 0; i < 64; i++) d += Math.abs(a[i] - b[i]); return d / 2; };

/** ffmpeg → JPEG frames: n frames at `rate` fps from t0 (n = 1: a single frame at t0), scaled to w×h */
async function grab(abs: string, info: Probe, t0: number, n: number, rate: number, w: number, h: number, outPattern: string): Promise<string[]> {
  const vf = `${n > 1 ? `fps=${rate},` : ''}scale=${w}:${h}:out_range=full,format=yuvj420p`;
  await ff(['-ss', String(Math.max(0, t0)), ...inputArgs(abs, info), '-frames:v', String(n), '-vf', vf, '-q:v', '3', '-f', 'image2', outPattern], 120_000);
  const files: string[] = [];
  for (let i = 1; i <= n; i++) { const p = outPattern.replace('%02d', String(i).padStart(2, '0')); if (fs.existsSync(p)) files.push(p); }
  return files;
}

const sheetFont = 'font-family="Helvetica, Arial, sans-serif"';

/** contact sheets: one frame per shot, numbered, caption under the frame (never over it) */
async function shotSheets(frames: { file: string; caption: string }[], fw: number, fh: number, cols: number, dir: string, prefix: string): Promise<string[]> {
  const gap = 6, cap = 24;
  const rows = Math.max(1, Math.floor((SHEET_MAX_H + gap) / (fh + cap + gap)));
  const per = cols * rows;
  const out: string[] = [];
  for (let p = 0; p * per < frames.length; p++) {
    const page = frames.slice(p * per, (p + 1) * per);
    const nRows = Math.ceil(page.length / cols);
    const W = cols * fw + (cols - 1) * gap, H = nRows * (fh + cap) + (nRows - 1) * gap;
    const comps: Overlay[] = [];
    let svg = '';
    page.forEach((f, k) => {
      const x = (k % cols) * (fw + gap), y = Math.floor(k / cols) * (fh + cap + gap);
      if (fs.existsSync(f.file)) comps.push({ input: f.file, left: x, top: y });
      svg += `<text x="${x + 6}" y="${y + fh + 17}" ${sheetFont} font-size="15" font-weight="bold" fill="#f2f2f2">${xml(f.caption)}</text>`;
    });
    comps.push({ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 });
    const file = path.join(dir, `${prefix}-${p + 1}.jpg`);
    await sharp({ create: { width: W, height: H, channels: 3, background: '#141414' } }).composite(comps).jpeg({ quality: 80 }).toFile(file);
    out.push(file);
  }
  return out;
}

/** motion strips: one row per moment (header + 8 frames left → right), a bar marks the first frame after a cut */
async function stripSheets(rows: { header: string; frames: { file: string; t: number }[]; cutAt?: number }[], fw: number, fh: number, dir: string): Promise<string[]> {
  const gap = 4, head = 22, rowGap = 8;
  const rowH = head + fh + rowGap;
  const per = Math.max(1, Math.floor((SHEET_MAX_H + rowGap) / rowH));
  const out: string[] = [];
  for (let p = 0; p * per < rows.length; p++) {
    const page = rows.slice(p * per, (p + 1) * per);
    const W = 8 * fw + 7 * gap, H = page.length * rowH - rowGap;
    const comps: Overlay[] = [];
    let svg = '';
    page.forEach((r, k) => {
      const y = k * rowH;
      svg += `<text x="2" y="${y + 16}" ${sheetFont} font-size="15" font-weight="bold" fill="#ffd166">${xml(r.header)}</text>`;
      let marked = false;
      r.frames.forEach((f, i) => {
        const x = i * (fw + gap);
        comps.push({ input: f.file, left: x, top: y + head });
        svg += `<rect x="${x}" y="${y + head + fh - 17}" width="44" height="17" fill="rgba(0,0,0,0.65)"/><text x="${x + 3}" y="${y + head + fh - 4}" ${sheetFont} font-size="12" fill="#fff">${f.t.toFixed(2)}</text>`;
        if (r.cutAt != null && !marked && f.t >= r.cutAt - 0.001) { marked = true; svg += `<rect x="${x}" y="${y + head}" width="4" height="${fh}" fill="#ff5a36"/><text x="${x + 7}" y="${y + head + 15}" ${sheetFont} font-size="12" font-weight="bold" fill="#ff5a36">CUT</text>`; }
      });
    });
    comps.push({ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 });
    const file = path.join(dir, `motion-${p + 1}.jpg`);
    await sharp({ create: { width: W, height: H, channels: 3, background: '#141414' } }).composite(comps).jpeg({ quality: 76 }).toFile(file);
    out.push(file);
  }
  return out;
}

/** 2×2 key frames with times (the art director's view of a video reference) */
async function keyGrid(abs: string, info: Probe, times: number[], file: string, tmp: string) {
  const ar = (info.width || 16) / (info.height || 9);
  const fw = ar >= 1 ? 640 : Math.round(480 * ar) & ~1, fh = Math.round(fw / ar) & ~1;
  const files = await pool(times.slice(0, 4), 4, (t, i) => grab(abs, info, t, 1, 1, fw, fh, path.join(tmp, `key${i}-%02d.jpg`)).then((f) => f[0]));
  const gap = 6, cap = 22;
  const W = 2 * fw + gap, H = 2 * (fh + cap) + gap;
  const comps: Overlay[] = [];
  let svg = '';
  files.forEach((f, k) => {
    const x = (k % 2) * (fw + gap), y = Math.floor(k / 2) * (fh + cap + gap);
    if (f) comps.push({ input: f, left: x, top: y });
    svg += `<text x="${x + 4}" y="${y + fh + 16}" ${sheetFont} font-size="15" fill="#eee">t=${times[k].toFixed(2)}s</text>`;
  });
  comps.push({ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#141414' } }).composite(comps).jpeg({ quality: 82 }).toFile(file);
}

// ---------- the source: a media file, or a link imported once (yt-dlp for video sites) ----------
async function resolveSource(req: WatchRequest): Promise<string> {
  const store = cur();
  if (req.file) {
    const rel = normFile(store.dir, String(req.file));
    if (!fs.existsSync(store.p(rel))) throw uerr('File not found: {file} (give a path in the project, e.g. media/photo.png)', { file: rel });
    return rel;
  }
  if (!req.url) throw uerr('Give file (media/…) or url');
  const urls = store.p('.studio', 'watch', 'urls.json');
  const map = readJson<Record<string, string>>(urls, {});
  if (map[req.url] && fs.existsSync(store.p(map[req.url]))) return map[req.url];
  const j = await runOpAndWait('import_url', { url: req.url, pick: 'video', maxHeight: 720 });
  const files: string[] = (j.outputs as any)?.files?.files || [];
  const vid = files.find((f) => VIDEO_EXT.test(f));
  if (!vid) throw uerr('No video found at {url} (got {files})', { url: req.url, files: files.join(', ') || 'nothing' });
  writeJson(urls, { ...readJson<Record<string, string>>(urls, {}), [req.url]: vid });
  return vid;
}

const inflight = new Map<string, Promise<WatchResult>>();

/** watch a video (see the header). Concurrent identical calls share one run; finished ones come from the cache. */
export function watchVideo(req: WatchRequest): Promise<WatchResult> {
  const k = cur().id + ':' + JSON.stringify([req.file, req.url, req.start, req.end, req.focus, req.detail]);
  if (!inflight.has(k)) inflight.set(k, run(req).finally(() => inflight.delete(k)));
  return inflight.get(k)!;
}

/** times named in a focus string: "0:12", "1:05.5", "12.5s", "12 s" */
function focusTimes(focus: string): number[] {
  const out: number[] = [];
  for (const m of focus.matchAll(/\b(\d{1,2}):(\d{2}(?:\.\d+)?)\b/g)) out.push(Number(m[1]) * 60 + Number(m[2]));
  for (const m of focus.matchAll(/\b(\d+(?:\.\d+)?)\s?(?:s|sec|seconds?)\b/gi)) out.push(Number(m[1]));
  return [...new Set(out.map((t) => r2(t)))].slice(0, 4);
}

async function run(req: WatchRequest): Promise<WatchResult> {
  const t0 = Date.now();
  const store = cur();
  const rel = await resolveSource(req);
  const timing: Record<string, number> = { source: Date.now() - t0 };
  const abs = store.p(rel);
  const info = await probe(abs);
  if (!info.hasVideo) throw uerr('{file} has no video stream', { file: rel });
  const detail: 'quick' | 'full' = req.detail === 'quick' ? 'quick' : 'full';
  const s = Math.max(0, Math.min(Number(req.start) || 0, Math.max(0, info.duration - 0.2)));
  const e = Math.min(info.duration, req.end != null && Number(req.end) > s ? Number(req.end) : info.duration);
  const dur = e - s;
  if (!(dur > 0.2)) throw uerr('The range is empty');
  if (dur > 1200) throw uerr('Watch at most 20 minutes at a time — pass start/end');
  const focus = String(req.focus || '').trim();
  const fTimes = focusTimes(focus).filter((t) => t >= s && t <= e);
  const st = fs.statSync(abs);
  const key = sha1(JSON.stringify({ v: VERSION, rel, m: st.mtimeMs, z: st.size, s: r2(s), e: r2(e), detail, fTimes, fk: /transition|cut|edit|монтаж|переход|склейк/i.test(focus), mk: /motion|anim|type|text|camera|move|eas|движ|анимац/i.test(focus) })).slice(0, 10);
  const dirRel = `.studio/watch/${slug(path.basename(rel).replace(/\.[^.]+$/, ''))}-${key}`;
  const dir = store.p(dirRel);
  const resultFile = path.join(dir, 'result.json');
  const prev = readJson<WatchResult | null>(resultFile, null);
  if (prev && [...prev.sheets, ...prev.strips, prev.keyframes].every((f) => fs.existsSync(store.p(f)))) {
    return { ...prev, cached: true, ms: Date.now() - t0, text: prev.text.replace(/^WATCHED/, 'WATCHED (cached)') };
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const relOf = (f: string) => path.relative(store.dir, f).split(path.sep).join('/');

  try {
    // ---- sound and speech run next to the picture analysis ----
    const tA = Date.now();
    const audioP = info.hasAudio ? decodePcm(abs, 22050, s, dur).then((pcm) => analyzePcm(pcm, 22050)).catch(() => null).finally(() => { timing.audio = Date.now() - tA; }) : Promise.resolve(null);
    const mediaName = rel.replace(/^media\//, '');
    // Whisper transcribes the whole file (cached per file): only when that stays reasonable, or it is already done
    const trCached = fs.existsSync(store.p('.studio', 'transcripts', mediaName + '.json'));
    const transcriptP = info.hasAudio && (trCached || (info.duration <= 1200 && (detail === 'full' || info.duration <= 300)))
      ? transcribeMedia(mediaName).catch((err) => ({ error: String(err?.message || err) })).finally(() => { timing.speech = Date.now() - tA; })
      : Promise.resolve(null);

    const tStartPicture = Date.now();
    // ---- picture: hard cuts (detect_shots' decision), fades through black, dissolves; motion per shot ----
    const frames = await analyzeFrames(abs, info, s, dur, tmp);
    for (const f of frames) f.t = +(f.t + s).toFixed(4);
    const n = frames.length;
    const fpsA = n / dur || 24;
    const bnd = new Map<number, string>(); // boundary time → how the picture gets into the next shot
    for (const x of shotsFromScores(frames.map((f) => ({ t: f.t - s, s: f.s })), 0.3, 0.3, dur).slice(1)) bnd.set(r2(x.start + s), 'hard cut');
    // isolated single-frame jumps of the brightness-relative difference = cuts the scene score missed (dark / low-contrast shots)
    for (let i = 3; i < n - 3; i++) {
      const d = frames[i].d, around = Math.max(frames[i - 2].d, frames[i - 1].d, frames[i + 1].d, frames[i + 2].d);
      if (d >= 0.25 && d >= 3 * around && ![...bnd.keys()].some((b) => Math.abs(b - frames[i].t) < 0.3)) bnd.set(r2(frames[i].t), 'hard cut');
    }
    const isBlack = (f: Fr) => f.y < 12 && f.ymax < 40; // nothing on screen (a title on black is not black)
    const yAt = (i: number) => frames[Math.max(0, Math.min(n - 1, i))]?.y ?? 0;
    const k3 = Math.max(2, Math.round(fpsA * 0.3));
    const clearNear = (a0: number, a1: number) => { for (const t of [...bnd.keys()]) if (t > a0 && t < a1) bnd.delete(t); };
    // runs of black frames: fade/cut to black, a hold, fade/cut back in
    for (let i = 0; i < n;) {
      if (!isBlack(frames[i])) { i++; continue; }
      let j = i; while (j + 1 < n && isBlack(frames[j + 1])) j++;
      const i0 = i; i = j + 1;
      if (j - i0 + 1 < 2) continue;
      const tStart = frames[i0].t, tEnd = j + 1 < n ? frames[j + 1].t : e, len = tEnd - tStart;
      const before = i0 > 0, after = j + 1 < n;
      const fadeOut = before && yAt(i0 - 1) < 0.75 * yAt(i0 - 1 - k3), fadeIn = after && yAt(j + 1) < 0.75 * yAt(j + 1 + k3);
      clearNear(tStart - 0.2, tEnd + 0.2);
      if (before && after && len < 0.5) bnd.set(r2(tEnd), `dip to black (${fadeOut ? 'fade out' : 'cut'} → ${r2(len)} s black → ${fadeIn ? 'fade in' : 'cut in'})`);
      else {
        if (before && tStart > s + 0.25) bnd.set(r2(tStart), `${fadeOut ? 'fade' : 'cut'} to black`);
        if (after) bnd.set(r2(tEnd), `${fadeIn ? 'fade in' : 'cut'} from black`);
      }
    }
    // dissolves: the colours change a lot across ~0.7 s, with stable pictures on both sides and no cut spike
    const kd = Math.max(2, Math.round(fpsA * 0.33));
    const D = frames.map((_, i) => (i >= kd && i + kd < n ? hdist(frames[i - kd].h, frames[i + kd].h) : 0));
    for (let i = 2 * kd; i + 2 * kd < n; i++) {
      const d = D[i];
      if (d < 0.35 || D.slice(i - kd, i + kd + 1).some((x) => x > d)) continue;
      const pre = hdist(frames[i - 2 * kd].h, frames[i - kd].h), post = hdist(frames[i + kd].h, frames[i + 2 * kd].h);
      if (pre > d * 0.4 || post > d * 0.4) continue; // continuous change = movement, not a transition
      const t = frames[i].t;
      if ([...bnd.keys()].some((b) => Math.abs(b - t) < (2 * kd + 2) / fpsA) || frames.slice(i - kd, i + kd + 1).some(isBlack)) continue;
      bnd.set(r2(t), 'dissolve / gradual change');
    }
    const cutInfo: { at: number; type: string }[] = [];
    for (const [t, type] of [...bnd.entries()].filter(([t]) => t > s + 0.2 && t < e - 0.1).sort((p, q) => p[0] - q[0])) if (!cutInfo.length || t - cutInfo[cutInfo.length - 1].at >= 0.25) cutInfo.push({ at: t, type });
    const cuts = cutInfo.map((c) => c.at);
    const edges = [s, ...cuts, e];
    const shots: Shot[] = edges.slice(0, -1).map((x, i) => ({ i: i + 1, start: r2(x), end: r2(edges[i + 1]), duration: r2(edges[i + 1] - x) }));
    const near = (t: number, w: number) => frames.filter((f) => Math.abs(f.t - t) <= w);
    const inShot = (x: Shot) => { const all = frames.filter((f) => f.t >= x.start && f.t < x.end); const core = all.filter((f) => f.t >= x.start + 0.12 && f.t < x.end - 0.12); return core.length ? core : all; };

    // motion level per shot (median frame difference inside the shot, away from its edges)
    const mLevel = (m: number) => (m < 0.1 ? 'static' : m < 1.5 ? 'low' : m < 4 ? 'medium' : 'high'); // share of the picture changing per frame
    const shotInfo = shots.map((x) => { const fr = inShot(x); const m = median(fr.map((f) => f.m)); const black = fr.length > 0 && fr.filter(isBlack).length >= fr.length * 0.8; return { ...x, motion: r2(m), level: black ? 'black' : mLevel(m), luma: Math.round(median(fr.map((f) => f.y)) || 0) }; });
    // a white flash at a hard cut
    for (const c of cutInfo) if (c.type === 'hard cut' && near(c.at, 0.15).some((f) => f.y > 225)) { const k = cuts.indexOf(c.at); if (shotInfo[k].luma < 180 && shotInfo[k + 1].luma < 180) c.type = 'flash (white frame)'; }

    // motion peaks (smoothed frame difference), away from cuts and transitions
    const sm = frames.map((f, i) => mean(frames.slice(Math.max(0, i - 2), i + 3).map((x) => x.m)));
    const medM = median(frames.filter((f) => !isBlack(f)).map((f) => f.m));
    const cand = frames.map((f, i) => ({ t: f.t, v: sm[i], black: isBlack(f) }))
      .filter((x, i) => i > 0 && i < n - 1 && !x.black && x.v >= sm[i - 1] && x.v >= sm[i + 1] && x.v > Math.max(0.8, medM * 1.5)
        && x.t > s + 0.3 && x.t < e - 0.3 && !cutInfo.some((c) => Math.abs(c.at - x.t) < (c.type === 'hard cut' ? 0.35 : 0.8)))
      .sort((p, q) => q.v - p.v);
    const peaks: { t: number; v: number }[] = [];
    for (const c of cand) if (!peaks.some((p) => Math.abs(p.t - c.t) < 1.2)) peaks.push(c);
    const tPicture = Date.now();
    timing.picture = tPicture - tStartPicture;

    // ---- moments for the motion strips ----
    const rate = Math.min(12, Math.max(4, Math.round(info.fps || 12)));
    const span = 7 / rate;
    const focusCut = /transition|cut|edit|монтаж|переход|склейк/i.test(focus), focusMotion = /motion|anim|type|text|camera|move|eas|движ|анимац/i.test(focus);
    const nCut = detail === 'quick' ? (focusCut ? 8 : 5) : (focusCut ? 20 : 14), nMot = detail === 'quick' ? (focusMotion ? 5 : 3) : (focusMotion ? 9 : 6), nEven = detail === 'quick' ? 2 : 3;
    const maxRows = detail === 'quick' ? 14 : 28;
    const clampFrom = (from: number) => Math.max(s, Math.min(from, e - span - 0.02));
    const moments: Moment[] = [];
    const taken = (t: number) => moments.some((m) => Math.abs(m.at - t) < span * 0.9);
    for (const t of fTimes) moments.push({ kind: 'focus', at: t, from: clampFrom(t - span / 2), label: `focus ${tc2(t)}` });
    const pickCuts = cutInfo.length <= nCut ? cutInfo : Array.from({ length: nCut }, (_, i) => cutInfo[Math.round((i * (cutInfo.length - 1)) / Math.max(1, nCut - 1))]);
    const instant = (type: string) => /^(hard cut|flash|cut )/.test(type);
    for (const c of pickCuts) if (!taken(c.at)) moments.push({ kind: 'cut', at: c.at, cutAt: instant(c.type) ? c.at : undefined, from: clampFrom(instant(c.type) ? c.at - 4 / rate : c.at - span / 2), label: `cut ${cutInfo.indexOf(c) + 1} at ${tc2(c.at)} · ${c.type}` });
    for (const p of peaks.slice(0, nMot)) if (!taken(p.t)) moments.push({ kind: 'motion', at: p.t, from: clampFrom(p.t - span / 2), label: `motion peak at ${tc2(p.t)} (shot ${shots.findIndex((q) => p.t >= q.start && p.t < q.end) + 1}, Δ ${r1(p.v)})` });
    for (let i = 0; i < nEven; i++) { const t = s + (dur * (i + 0.5)) / nEven; if (!taken(t)) moments.push({ kind: 'even', at: t, from: clampFrom(t - span / 2), label: `sample at ${tc2(t)}` }); }
    const rowsM = moments.slice(0, maxRows).sort((p, q) => p.at - q.at);

    // ---- frames: start grabbing now, in parallel with the sound ----
    const ar = (info.width || 16) / (info.height || 9);
    const nShotsShown = detail === 'quick' ? Math.min(shots.length, 36) : Math.min(shots.length, 120);
    const shownShots = shots.length <= nShotsShown ? shots : Array.from({ length: nShotsShown }, (_, i) => shots[Math.round((i * (shots.length - 1)) / (nShotsShown - 1))]);
    // columns: the fewest that keep the shots on the sheets shown inline (quick 1, full 2) — bigger frames = readable text
    const colsFor = (c: number) => { const fw = Math.floor((SHEET_W - (c - 1) * 6) / c); const fh = Math.round(fw / ar); return { c, fw: fw & ~1, fh: fh & ~1, per: c * Math.max(1, Math.floor((SHEET_MAX_H + 6) / (fh + 30))) }; };
    const options = (ar >= 1.2 ? [3, 4, 5, 6] : ar >= 0.8 ? [4, 5, 6, 7] : [6, 7, 8, 9]).map(colsFor);
    const lay = options.find((o) => Math.ceil(shownShots.length / o.per) <= (detail === 'quick' ? 1 : 2)) || options[options.length - 1];
    const shotFilesP = pool(shownShots, 4, (x, i) => grab(abs, info, x.start + Math.min(x.duration / 2, Math.max(0.05, x.duration - 0.05)), 1, 1, lay.fw, lay.fh, path.join(tmp, `shot${i}-%02d.jpg`)).then((f) => f[0]));

    const sfw = Math.floor((SHEET_W - 7 * 4) / 8) & ~1;
    const sfh = Math.round(sfw / ar) & ~1;
    const stripFilesP = pool(rowsM, 4, (m, i) => grab(abs, info, m.from, 8, rate, sfw, sfh, path.join(tmp, `m${i}-%02d.jpg`)));
    const keyAbs = path.join(dir, 'keyframes.jpg');
    const keyP = keyGrid(abs, info, [0.125, 0.375, 0.625, 0.875].map((q) => r2(s + dur * q)), keyAbs, tmp);
    for (const x of [shotFilesP, stripFilesP, keyP] as Promise<unknown>[]) x.catch(() => {}); // awaited below


    // ---- audio facts ----
    const aRaw = await audioP;
    const silentTrack = !!aRaw && aRaw.peak < 0.001; // an audio stream with nothing in it (−60 dBFS peak)
    const a = silentTrack ? null : aRaw;
    const beatsAbs = a?.beats.map((b) => r2(b + s)) || [];
    const period = a?.bpm ? 60 / a.bpm : 0;
    const onBeat = (t: number) => beatsAbs.some((b) => Math.abs(b - t) <= 0.08);
    const cutsOnBeat = period ? cuts.filter(onBeat).length : 0;
    const chanceCut = period ? Math.min(1, 0.16 / period) : 0;
    const onsetsOnGrid = a && period && a.onsets.length ? a.onsets.filter((o) => a.beats.some((b) => Math.abs(b - o) <= 0.07)).length / a.onsets.length : 0;
    const chanceOnset = period ? Math.min(1, 0.14 / period) : 0;
    const loud = a ? a.loudness.filter((v) => v > -60) : [];
    const silences: [number, number][] = [];
    if (a) { let st0 = -1; a.loudness.forEach((v, i) => { if (v < -45) { if (st0 < 0) st0 = i; } else { if (st0 >= 0 && i - st0 >= 5) silences.push([r1(s + st0 / 10), r1(s + i / 10)]); st0 = -1; } }); if (st0 >= 0 && a.loudness.length - st0 >= 5) silences.push([r1(s + st0 / 10), r1(e)]); }

    // ---- speech ----
    const tr = await transcriptP;
    const trErr = tr && 'error' in tr ? tr.error : '';
    const junk = /^[\s♪♫*.\-–—]*$|^[[(].*[\])]$|^(music|applause|laughter)$/i;
    const allWords = tr && !('error' in tr) ? tr.words.filter((w) => w.end > s && w.start < e && !junk.test(w.text.trim())) : [];
    // phrases: break on pauses, sentence ends and every 14 words
    const raw: { t: number; end: number; text: string }[] = [];
    { let c0: { t: number; ws: string[]; last: number } | null = null;
      for (const w of allWords) {
        if (!c0 || w.start - c0.last > 0.7 || c0.ws.length >= 14 || /[.!?…]$/.test(c0.ws[c0.ws.length - 1] || '')) { if (c0) raw.push({ t: c0.t, end: c0.last, text: c0.ws.join(' ') }); c0 = { t: w.start, ws: [], last: w.end }; }
        c0.ws.push(w.text.trim()); c0.last = w.end;
      }
      if (c0) raw.push({ t: c0.t, end: c0.last, text: c0.ws.join(' ') }); }
    // Whisper loops over music ("I'm sorry." ×10): ≥ 3 identical phrases in a row are one line, and not counted as speech
    const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').trim();
    const lines: { t: number; text: string }[] = [];
    const loops: [number, number][] = [];
    for (let i = 0; i < raw.length;) {
      let j = i; while (j + 1 < raw.length && norm(raw[j + 1].text) === norm(raw[i].text)) j++;
      if (j - i >= 2) { lines.push({ t: raw[i].t, text: `${raw[i].text} (×${j - i + 1} identical phrases to ${tc(raw[j].t)} — likely Whisper looping over music, not speech)` }); loops.push([raw[i].t, raw[j].end]); }
      else for (let k = i; k <= j; k++) lines.push({ t: raw[k].t, text: raw[k].text });
      i = j + 1;
    }
    const words = allWords.filter((w) => !loops.some(([x, y]) => w.start >= x - 0.01 && w.end <= y + 0.01));
    const hasSpeech = words.length >= 3;
    const segs: [number, number][] = [];
    for (const w of hasSpeech ? words : []) { const l = segs[segs.length - 1]; if (l && w.start - l[1] < 0.5) l[1] = Math.max(l[1], w.end); else segs.push([w.start, w.end]); }
    const speechSec = segs.reduce((acc, [x, y]) => acc + (Math.min(y, e) - Math.max(x, s)), 0);

    // ---- sections: where pacing / loudness / motion / speech change together ----
    const nb = Math.max(1, Math.floor(dur));
    const bins = Array.from({ length: nb }, (_, i) => {
      const b0 = s + (i * dur) / nb, b1 = s + ((i + 1) * dur) / nb, mid = (b0 + b1) / 2;
      const fr = frames.filter((f) => f.t >= b0 && f.t < b1);
      const lv = a ? a.loudness.slice(Math.floor((b0 - s) * 10), Math.ceil((b1 - s) * 10)) : [];
      return [cuts.filter((c) => Math.abs(c - mid) <= 2).length / 4, mean(fr.map((f) => f.m)), lv.length ? mean(lv) : 0, segs.some(([x, y]) => x < b1 && y > b0) ? 1 : 0];
    });
    const sd = [0, 1, 2, 3].map((j) => { const v = bins.map((b) => b[j]); const mu = mean(v); return Math.sqrt(mean(v.map((x) => (x - mu) ** 2))) || 1; });
    const W = Math.max(3, Math.round(nb / 12));
    const nov = bins.map((_, i) => {
      if (i < 2 || i > nb - 2) return 0;
      const L = bins.slice(Math.max(0, i - W), i), R = bins.slice(i, i + W);
      return Math.sqrt([0, 1, 2, 3].reduce((acc, j) => acc + ((mean(L.map((b) => b[j])) - mean(R.map((b) => b[j]))) / sd[j]) ** 2, 0));
    });
    const novMu = mean(nov), novSd = Math.sqrt(mean(nov.map((x) => (x - novMu) ** 2)));
    const maxSections = Math.max(1, Math.min(8, Math.round(dur / 10)));
    const bounds: number[] = [];
    if (dur >= 12) {
      const idx = nov.map((v, i) => ({ v, i })).filter((x, i) => x.v > novMu + 0.5 * novSd && x.v >= (nov[i - 1] ?? 0) && x.v >= (nov[i + 1] ?? 0)).sort((p, q) => q.v - p.v);
      const minGap = Math.max(4, dur / 10);
      for (const x of idx) { const t = s + (x.i * dur) / nb; if (bounds.length < maxSections - 1 && !bounds.some((b) => Math.abs(b - t) < minGap)) bounds.push(t); }
      bounds.sort((p, q) => p - q);
      // snap a boundary to a cut within 1 s
      for (let i = 0; i < bounds.length; i++) { const c = cuts.find((x) => Math.abs(x - bounds[i]) <= 1); if (c != null) bounds[i] = c; }
    }
    const secEdges = [s, ...bounds.map(r1), e];
    const sections = secEdges.slice(0, -1).map((x, i) => {
      const y = secEdges[i + 1];
      const sh = shots.filter((q) => q.start < y && q.end > x);
      const fr = frames.filter((f) => f.t >= x && f.t < y);
      const lv = a ? a.loudness.slice(Math.floor((x - s) * 10), Math.ceil((y - s) * 10)).filter((v) => v > -60) : [];
      const sp = segs.reduce((acc, [p, q]) => acc + Math.max(0, Math.min(q, y) - Math.max(p, x)), 0);
      return { from: r1(x), to: r1(y), shots: sh.length, cuts: cuts.filter((c) => c > x && c < y).length, asl: r1((y - x) / Math.max(1, cuts.filter((c) => c > x && c < y).length + 1)), motion: mLevel(median(fr.map((f) => f.m))), loudnessDb: lv.length ? Math.round(mean(lv)) : null, speechPct: Math.round((100 * sp) / (y - x)) };
    });

    // ---- sheets (the frames were grabbed while sound and speech were analysed) ----
    const shotFiles = await shotFilesP;
    const sheetsAbs = await shotSheets(shownShots.map((x, i) => ({ file: shotFiles[i], caption: `#${x.i}  ${tc(x.start)}  ·  ${x.duration.toFixed(1)} s` })).filter((x) => x.file), lay.fw, lay.fh, lay.c, dir, 'shots');
    const stripFiles = await stripFilesP;
    const stripRows = rowsM.map((m, i) => ({
      header: `${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}  ${m.label}${m.kind === 'cut' && period ? (onBeat(m.at) ? ' · on beat' : ' · off beat') : ''}  ·  ${m.from.toFixed(2)}–${(m.from + span).toFixed(2)} s @ ${rate} fps`,
      frames: stripFiles[i].map((f, k) => ({ file: f, t: r2(m.from + k / rate) })), cutAt: m.cutAt,
    }));
    const stripsAbs = await stripSheets(stripRows.filter((r) => r.frames.length), sfw, sfh, dir);
    await keyP;
    timing.images = Date.now() - tPicture;

    // ---- the text ----
    const asl = dur / shots.length;
    const ds = shots.map((x) => x.duration);
    const third = (lo: number, hi: number) => { const c = cuts.filter((x) => x > lo && x < hi).length; return r1((hi - lo) / (c + 1)); };
    const curve = (() => {
      const vals = shots.length > 80 ? Array.from({ length: 80 }, (_, i) => mean(ds.slice(Math.floor((i * ds.length) / 80), Math.floor(((i + 1) * ds.length) / 80)))) : ds;
      const lo = Math.log(Math.min(...vals) + 0.05), hi = Math.log(Math.max(...vals) + 0.05);
      return vals.map((v) => BARS[hi - lo < 1e-6 ? 3 : Math.round(((Math.log(v + 0.05) - lo) / (hi - lo)) * 7)]).join('');
    })();
    const q = [0, 1, 2, 3].map((i) => third(s + (dur * i) / 4, s + (dur * (i + 1)) / 4));
    const half1 = third(s, s + dur / 2), half2 = third(s + dur / 2, e);
    const trend = half2 < half1 * 0.75 ? 'cuts get faster' : half2 > half1 * 1.33 ? 'cuts get slower' : 'steady';
    const typeCount = cutInfo.reduce<Record<string, number>>((acc, c) => { const k = c.type.replace(/ \(.*\)$/, ''); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const motionDist = shotInfo.reduce<Record<string, number>>((acc, x) => { acc[x.level] = (acc[x.level] || 0) + 1; return acc; }, {});
    const sheets = sheetsAbs.map(relOf), strips = stripsAbs.map(relOf), keyframes = relOf(keyAbs);
    const inlineShots = detail === 'quick' ? 1 : 2;
    const inline = [...sheets.slice(0, inlineShots), ...strips.slice(0, (detail === 'quick' ? 3 : 6) - Math.min(inlineShots, sheets.length))];

    const L: string[] = [];
    L.push(`WATCHED ${rel}${s > 0 || e < info.duration - 0.05 ? ` (range ${tc(s)}–${tc(e)} of ${tc(info.duration)})` : ''} · ${r1(dur)} s · ${info.width}×${info.height}${info.height > info.width ? ' (vertical)' : ''} · ${r1(info.fps)} fps · ${info.hasAudio ? 'with sound' : 'silent'}${focus ? ` · focus: ${focus}` : ''}`);
    const nBlack = shotInfo.filter((x) => x.level === 'black').length, blackSec = shotInfo.filter((x) => x.level === 'black').reduce((acc, x) => acc + x.duration, 0);
    L.push(`EDIT: ${shots.length} shot${shots.length > 1 ? 's' : ''}${nBlack ? ` (${nBlack} black)` : ''} · ${cuts.length} cuts · ASL ${r2(asl)} s${nBlack ? ` (${r2((dur - blackSec) / Math.max(1, shots.length - nBlack))} s without the ${nBlack} black holds)` : ''} (median ${r2(median(ds))}, shortest ${r2(Math.min(...ds))}, longest ${r2(Math.max(...ds))}) · ${r1((cuts.length / dur) * 60)} cuts/min${cuts.length ? ` · cuts: ${Object.entries(typeCount).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}`);
    if (cuts.length) L.push(`PACING (shot lengths in order, ▁ short … █ long): ${curve}\n  ASL by quarter: ${q.map((x) => x + ' s').join(' → ')} (${trend})`);
    L.push(`MOTION (how much of the picture changes per frame): median ${r2(medM)}; shots: ${Object.entries(motionDist).map(([k, v]) => `${v} ${k}`).join(', ')}${peaks.length ? `; strongest motion at ${peaks.slice(0, 5).map((p) => tc(p.t)).join(', ')}` : '; no motion peaks'}`);
    if (silentTrack) L.push('SOUND: the audio track is silent');
    if (a) {
      L.push(`SOUND: ${a.bpm ? `tempo ≈ ${Math.round(a.bpm)} BPM (beat ${r2(period)} s); ${Math.round(onsetsOnGrid * 100)}% of audio onsets sit on that grid (chance ≈ ${Math.round(chanceOnset * 100)}%) → ${onsetsOnGrid > chanceOnset + 0.25 ? 'clear steady beat' : onsetsOnGrid > chanceOnset + 0.1 ? 'some pulse' : 'no steady beat (speech / ambient / rubato)'}` : 'no steady tempo found'}; loudness avg ${loud.length ? Math.round(mean(loud)) : '—'} dBFS RMS, peak ${r1(20 * Math.log10(a.peak + 1e-9))} dBFS${silences.length ? `; silences ${silences.slice(0, 6).map(([x, y]) => `${tc(x)}–${tc(y)}`).join(', ')}` : ''}`);
      L.push(`  loudness over time (▁ quiet … █ loud): ${loudnessSparkline(a.loudness, 60)}`);
      if (period && cuts.length) L.push(`  CUTS ON BEAT: ${cutsOnBeat}/${cuts.length} = ${Math.round((100 * cutsOnBeat) / cuts.length)}% within 80 ms of a beat (chance ≈ ${Math.round(chanceCut * 100)}%)`);
      if (a.accents.length) L.push(`  strongest accents: ${a.accents.slice(0, 10).map((x) => r2(x + s)).join(', ')} s`);
    }
    L.push(`SPEECH: ${trErr ? `transcription failed (${trErr.slice(0, 120)})` : !info.hasAudio || silentTrack ? 'none (silent)' : tr === null ? `not transcribed (${info.duration > 1200 ? 'the file is over 20 min — transcribe_media it once, then watch again' : 'long file in quick mode — use detail:"full"'})` : hasSpeech ? `${Math.round((100 * speechSec) / dur)}% of the time (${words.length} words, ${r1((words.length / Math.max(1, speechSec)) * 60)} wpm while speaking)` : 'no speech detected'}`);
    if (sections.length > 1) {
      L.push('SECTIONS (where pacing, motion, loudness or speech change):');
      sections.forEach((x, i) => L.push(`  ${i + 1}. ${tc(x.from)}–${tc(x.to)} · ${x.shots} shot${x.shots > 1 ? 's' : ''}, ASL ${x.asl} s · motion ${x.motion}${x.loudnessDb != null ? ` · ${x.loudnessDb} dB` : ''}${x.speechPct ? ` · speech ${x.speechPct}%` : ''}`));
    }
    L.push('');
    L.push(`SHOTS (#, start–end, length, motion${shotInfo.some((x) => x.luma < 35) ? ', dark' : ''}; how the cut INTO it happens):`);
    const shotLines = shotInfo.map((x, i) => `  #${x.i} ${tc2(x.start)}–${tc2(x.end)} ${x.duration.toFixed(2)} s · ${x.level}${x.luma < 35 && x.level !== 'black' ? ' · dark' : ''}${i > 0 ? ` · ← ${cutInfo[i - 1].type}${period ? (onBeat(cutInfo[i - 1].at) ? ', on beat' : '') : ''}` : ''}`);
    L.push(...(shotLines.length > 60 ? [...shotLines.slice(0, 40), `  … ${shotLines.length - 50} more in ${dirRel}/summary.txt …`, ...shotLines.slice(-10)] : shotLines));
    if (lines.length) {
      L.push('', 'TRANSCRIPT:');
      const maxL = detail === 'quick' ? 20 : 50;
      L.push(...lines.slice(0, maxL).map((l) => `  [${tc(l.t)}] ${l.text}`));
      if (lines.length > maxL) L.push(`  … ${lines.length - maxL} more lines in ${dirRel}/transcript.txt`);
    }
    L.push('', 'IMAGES (Read any of them again later):');
    L.push(`  contact sheet${sheets.length > 1 ? 's' : ''} — one frame per shot (middle of the shot), "#n start · length": ${sheets.join(', ')}${shownShots.length < shots.length ? ` (${shownShots.length} of ${shots.length} shots, evenly sampled)` : ''}`);
    L.push(`  motion strips — each row = 8 frames left → right at ${rate} fps (${r2(span)} s); red bar = first frame after an instant cut (fades/dissolves are centred instead): ${strips.join(', ')}`);
    stripRows.forEach((r) => L.push(`    ${r.header}`));
    L.push(`  key frames (2×2 at 1/8, 3/8, 5/8, 7/8): ${keyframes}`);
    L.push(`  shown inline below: ${inline.join(', ')}`);
    L.push(`Facts only — measured, not judged. Borrow principles (rhythm, transitions, easing), never copy the piece 1:1.`);
    const text = L.join('\n');

    const data = { timing, probe: info, shots: shotInfo, cuts: cutInfo, peaks: peaks.slice(0, 12).map((p) => ({ t: p.t, v: r2(p.v) })), sections, moments: rowsM, audio: a ? { bpm: a.bpm, beats: beatsAbs.slice(0, 400), accents: a.accents.map((x) => r2(x + s)), cutsOnBeat, chanceCut: r2(chanceCut), onsetsOnGrid: r2(onsetsOnGrid), silences } : null, speech: { hasSpeech, pct: Math.round((100 * speechSec) / dur), words: words.length, lines } };
    fs.writeFileSync(path.join(dir, 'summary.txt'), [text.split('\nSHOTS')[0], 'SHOTS:', ...shotLines].join('\n') + '\n');
    if (lines.length) fs.writeFileSync(path.join(dir, 'transcript.txt'), lines.map((l) => `[${tc2(l.t)}] ${l.text}`).join('\n') + '\n');
    const result: WatchResult = { file: rel, start: r2(s), end: r2(e), detail, cached: false, ms: Date.now() - t0, text, sheets, strips, keyframes, inline, dir: dirRel, data };
    writeJson(resultFile, result);
    // the latest whole-file watch, for the art director's reference board
    if (s === 0 && e >= info.duration - 0.05) { const idx = store.p('.studio', 'watch', 'index.json'); writeJson(idx, { ...readJson<Record<string, unknown>>(idx, {}), [rel]: { dir: dirRel, m: st.mtimeMs } }); }
    return { ...result, text: text.replace(/\n(?=IMAGES)/, `\n(watched in ${r1((Date.now() - t0) / 1000)} s: ${Object.entries(timing).map(([k, v]) => `${k} ${r1(v / 1000)}`).join(', ')})\n`) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * For the art director: a video reference as a picture — 2×2 key frames (with times) from the watch_video cache when the
 * file was watched, else 4 quick seeks. `strip` = the cached motion strip sheet (project-relative), if any.
 */
export async function videoRefFrames(file: string): Promise<{ png: Buffer; strip?: string } | null> {
  try {
    const store = cur();
    const rel = normFile(store.dir, file);
    const abs = store.p(rel);
    const hit = readJson<Record<string, { dir: string; m: number }>>(store.p('.studio', 'watch', 'index.json'), {})[rel];
    if (hit && Math.abs(hit.m - fs.statSync(abs).mtimeMs) < 1) {
      const r = readJson<WatchResult | null>(store.p(hit.dir, 'result.json'), null);
      if (r && fs.existsSync(store.p(r.keyframes))) return { png: fs.readFileSync(store.p(r.keyframes)), strip: r.strips.find((f) => fs.existsSync(store.p(f))) };
    }
    const info = await probe(abs);
    if (!info.hasVideo) return null;
    const tmp = fs.mkdtempSync(path.join(store.p('.studio'), 'refkeys-'));
    try {
      const out = path.join(tmp, 'k.jpg');
      await keyGrid(abs, info, [0.125, 0.375, 0.625, 0.875].map((q) => r2(info.duration * q)), out, tmp);
      return { png: fs.readFileSync(out) };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  } catch { return null; }
}
