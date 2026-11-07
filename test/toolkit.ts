// Media toolkit test: boots its own server in a temp sandbox, generates synthetic inputs with ffmpeg
// (green-screen clip with a moving shape, two "product" images, test clips, voice-like tone bursts,
// music bed, noisy tone), runs every op through REST and checks the outputs (exist, alpha, sizes,
// durations, loudness, ducking depth), plus cache, cancel, validation errors and the MCP tools.
// Run: npx tsx test/toolkit.ts      (ML models download once into $STUDIO_MODELS, default <tmp>/avs-toolkit-models)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-toolkit-'));
const PORT = 4421 + Math.floor(Math.random() * 70);
const BASE = `http://127.0.0.1:${PORT}`;
const MODELS = process.env.STUDIO_MODELS || path.join(os.tmpdir(), 'avs-toolkit-models');
const PROJ = path.join(tmp, 'projects', 'tk');
const MEDIA = path.join(PROJ, 'media');
const only = (process.env.ONLY || '').split(',').filter(Boolean);
let failures = 0;
const ok = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };

function sh(cmd: string, args: string[]) {
  return new Promise<{ code: number; out: Buffer; err: string }>((res) => {
    const p = spawn(cmd, args); const out: Buffer[] = []; let err = '';
    p.stdout.on('data', (d) => out.push(d)); p.stderr.on('data', (d) => (err += d)); p.on('close', (code) => res({ code: code ?? 1, out: Buffer.concat(out), err }));
  });
}
async function ff(args: string[]) { const r = await sh('ffmpeg', ['-hide_banner', '-y', '-v', 'error', ...args]); if (r.code) throw new Error('ffmpeg: ' + r.err); }
async function probe(rel: string) {
  const r = await sh('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path.join(PROJ, rel)]);
  const j = JSON.parse(r.out.toString());
  const v = j.streams.find((s: any) => s.codec_type === 'video');
  const a = j.streams.find((s: any) => s.codec_type === 'audio');
  return { duration: Number(j.format.duration) || 0, width: v?.width, height: v?.height, codec: v?.codec_name, profile: v?.profile, pixFmt: v?.pix_fmt, alphaMode: v?.tags?.alpha_mode, audio: !!a, fps: v ? eval(v.avg_frame_rate) : 0 };
}
/** mean alpha (0..255) of the frame at t, decoded with libvpx for VP9 */
async function alphaMean(rel: string, t = 0.5) {
  const isVp9 = /\.webm$/.test(rel);
  const r = await sh('ffmpeg', ['-v', 'error', '-ss', String(t), ...(isVp9 ? ['-c:v', 'libvpx-vp9'] : []), '-i', path.join(PROJ, rel), '-frames:v', '1', '-vf', 'format=rgba,alphaextract', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const b = r.out;
  let s = 0; for (const x of b) s += x;
  return { mean: b.length ? s / b.length : -1, corner: b[0] };
}
async function imgStats(rel: string) {
  const { data, info } = await sharp(path.join(PROJ, rel)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => { const i = (Math.round(y) * info.width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  let sa = 0; for (let i = 3; i < data.length; i += 4) sa += data[i];
  return { w: info.width, h: info.height, meanA: sa / (info.width * info.height), at, fmt: (await sharp(path.join(PROJ, rel)).metadata()).format };
}
/** RMS level (dB) of an audio file between a and b seconds */
async function rmsDb(rel: string, a: number, b: number) {
  const r = await sh('ffmpeg', ['-v', 'info', '-ss', String(a), '-t', String(b - a), '-i', path.join(PROJ, rel), '-af', 'astats=measure_overall=RMS_level:measure_perchannel=none', '-f', 'null', '-']);
  return Number(/RMS level dB: (-?[\d.]+|-inf)/.exec(r.err)?.[1]?.replace('-inf', '-200'));
}

async function api(method: string, url: string, body?: unknown) {
  const r = await fetch(BASE + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(`${method} ${url}: ${r.status} ${JSON.stringify(j)}`), { status: r.status, body: j });
  return j;
}
const timings: string[] = [];
async function run(op: string, params: Record<string, unknown>) {
  const t0 = Date.now();
  const j = await api('POST', '/api/toolkit/run', { op, params, wait: true });
  timings.push(`${op}: ${((Date.now() - t0) / 1000).toFixed(1)}s${j.cached ? ' (cached)' : ''}`);
  if (j.status !== 'done') throw new Error(`${op} ${j.status}: ${j.error}`);
  return j;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
async function step(name: string, fn: () => Promise<void>) {
  if (only.length && !only.some((o) => name.includes(o))) return;
  try { await fn(); } catch (e) { ok(name, false, (e as Error).message.slice(0, 600)); }
}

// ---------- synthetic inputs ----------
fs.mkdirSync(MEDIA, { recursive: true });
console.log('generating inputs in', MEDIA);
const L = (s: string) => ['-f', 'lavfi', '-i', s];
// green screen: studio green with a red box + yellow disc moving across, plus a tone
await ff([...L('color=c=0x00b140:s=640x360:d=3:r=30'), ...L('color=c=0xd02020:s=120x160:d=3:r=30'), ...L('sine=f=330:d=3'),
  '-filter_complex', "[0][1]overlay=x='60+t*120':y=100[v]", '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(MEDIA, 'greenscreen.mp4')]);
// product photo: object (red box with a yellow cap) on a soft blue-grey studio gradient
await ff([...L('gradients=s=512x512:c0=0x9fb4c8:c1=0xdde6ee:x0=0:y0=0:x1=512:y1=512:d=1'), ...L('color=c=0xc81e1e:s=200x240:d=1'), ...L('color=c=0xf0c020:s=120x60:d=1'),
  '-filter_complex', '[0][1]overlay=156:170[a];[a][2]overlay=196:120', '-frames:v', '1', path.join(MEDIA, 'product.png')]);
await ff([...L('gradients=s=512x512:c0=0x9fb4c8:c1=0xdde6ee:x0=0:y0=0:x1=512:y1=512:d=1'), ...L('color=c=0x1e5ac8:s=220x200:d=1'), ...L('color=c=0xf0c020:s=100x60:d=1'),
  '-filter_complex', '[0][1]overlay=190:200[a];[a][2]overlay=250:150', '-frames:v', '1', path.join(MEDIA, 'productB.png')]);
// two shots with sound
await ff([...L('testsrc2=s=640x360:d=3:r=30'), ...L('sine=f=440:d=3'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(MEDIA, 'clipA.mp4')]);
await ff([...L('mandelbrot=s=640x360:r=30'), ...L('sine=f=660:d=3'), '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(MEDIA, 'clipB.mp4')]);
// "voice": tone bursts 1–2.5 s and 4–5 s over a quiet noise floor; music bed: steady chord; noisy tone
const voiceExpr = "0.6*sin(2*PI*220*t)*sin(2*PI*3*t)*(between(t,1,2.5)+between(t,4,5))+0.002*(random(0)-0.5)";
await ff([...L(`aevalsrc='${voiceExpr}':s=48000:d=6`), path.join(MEDIA, 'voice.wav')]);
await ff([...L("aevalsrc='0.2*sin(2*PI*261.6*t)+0.2*sin(2*PI*329.6*t)+0.2*sin(2*PI*392*t)':s=48000:d=6"), path.join(MEDIA, 'music.wav')]);
await ff([...L("aevalsrc='0.4*sin(2*PI*220*t)*sin(2*PI*3*t)*(between(t,0.5,1.5)+between(t,2,2.8))+0.04*(random(0)-0.5)':s=48000:d=3"), path.join(MEDIA, 'noisy.wav')]);
// talking-head stand-in: picture + the voice track (for remove_silence on video)
await ff([...L('testsrc2=s=320x180:d=6:r=25'), '-i', path.join(MEDIA, 'voice.wav'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(MEDIA, 'talk.mp4')]);

const server = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'server/index.ts'), PROJ], {
  cwd: ROOT, env: { ...process.env, STUDIO_PORT: String(PORT), STUDIO_HOME: path.join(tmp, 'home'), STUDIO_PROJECTS: path.join(tmp, 'projects'), STUDIO_MODELS: MODELS }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

try {
  for (let i = 0; i < 120; i++) {
    try { const j = await (await fetch(BASE + '/api/state')).json(); if (j.project) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const cat = await api('GET', '/api/toolkit');
  const ids = cat.ops.map((o: any) => o.id);
  const expected = ['remove_background', 'transform', 'adjust', 'sticker', 'palette', 'convert', 'chroma_key', 'remove_background_video', 'trim', 'speed', 'reframe', 'slowmo', 'extract_frames', 'to_gif', 'loop', 'morph_images', 'morph_video_cut', 'extract_audio', 'normalize', 'denoise', 'remove_silence', 'duck', 'detect_shots', 'split_shots'];
  ok('catalog lists all ops', expected.every((x) => ids.includes(x)), ids.join(','));
  ok('catalog is JSON-serialisable form specs', cat.ops.every((o: any) => o.title && o.description && Object.values(o.inputs).every((s: any) => s.type && s.label)));

  // ---------- image ----------
  let nobg = '';
  await step('remove_background', async () => {
    const j = await run('remove_background', { image: 'product.png' });
    nobg = j.outputs.image;
    const s = await imgStats(nobg);
    const [, , , ca] = s.at(2, 2), [, , , oa] = s.at(256, 290), [, , , cap] = s.at(256, 150);
    // object = 200×240 + 120×60 (overlap 120×10) = 54000 px of 262144 → mean alpha ≈ 52.5
    ok('remove_background → PNG with alpha (bg transparent, object opaque)', s.fmt === 'png' && ca < 10 && oa > 200 && cap > 200 && near(s.meanA, 52.5, 12), `corner ${ca}, body ${oa}, cap ${cap}, meanA ${s.meanA.toFixed(1)} (${nobg})`);
    ok('remove_background mask + provenance + library', fs.existsSync(path.join(PROJ, j.outputs.mask)) && fs.existsSync(path.join(PROJ, '.studio/media', path.basename(nobg) + '.source.json')) && fs.existsSync(path.join(PROJ, '.studio/media', path.basename(nobg) + '.json')));
    const src = JSON.parse(fs.readFileSync(path.join(PROJ, '.studio/media', path.basename(nobg) + '.source.json'), 'utf8'));
    ok('provenance records op, params, inputs', src.kind === 'toolkit' && src.op === 'remove_background' && src.inputs.image === 'media/product.png' && src.params.model === 'isnet');
    const again = await run('remove_background', { image: 'media/product.png' });
    ok('identical re-run is served from cache', again.cached === true && again.outputs.image === nobg);
    const trimmed = await run('remove_background', { image: 'product.png', model: 'modnet', trim: true, threshold: 0.5 });
    const t = await imgStats(trimmed.outputs.image);
    ok('remove_background modnet + trim + threshold', t.w < 512 && t.h < 512, `${t.w}×${t.h}`);
  });
  await step('transform', async () => {
    const j = await run('transform', { image: 'product.png', cropX: 100, cropY: 50, cropW: 300, cropH: 400, rotate: 90, flip: 'horizontal', width: 200 });
    const s = await imgStats(j.outputs.image);
    ok('transform crop 300×400 → rotate 90 → width 200', s.w === 200 && s.h === 150, `${s.w}×${s.h}`);
    const c = await run('transform', { image: 'product.png', width: 300, height: 100, fit: 'contain', format: 'webp' });
    const cs = await imgStats(c.outputs.image);
    ok('transform contain with transparent letterbox (webp)', cs.w === 300 && cs.h === 100 && cs.fmt === 'webp' && cs.at(2, 50)[3] === 0);
  });
  await step('adjust', async () => {
    const j = await run('adjust', { image: 'product.png', saturation: -1, contrast: 0.3, brightness: 0.1, blur: 1.5, sharpen: 0 });
    const s = await imgStats(j.outputs.image);
    const [r, g, b] = s.at(256, 300);
    ok('adjust saturation −1 → greyscale', Math.abs(r - g) < 6 && Math.abs(g - b) < 6, `${r},${g},${b}`);
    const h = await run('adjust', { image: nobg || 'product.png', hue: 120, sharpen: 2 });
    const hs = await imgStats(h.outputs.image);
    ok('adjust keeps alpha', !nobg || hs.at(2, 2)[3] < 10);
  });
  await step('sticker', async () => {
    const j = await run('sticker', { image: nobg || 'product.png', outline: 16, shadow: 0.5 });
    const s = await imgStats(j.outputs.image);
    const src = await imgStats(nobg || 'product.png');
    const pad = (s.w - src.w) / 2;
    const ring = s.at(pad + 156 - 8, pad + 300); // 8 px left of the body edge → in the white outline
    ok('sticker: padded canvas, white outline, transparent corners', s.w > src.w && s.at(1, 1)[3] === 0 && ring[0] > 240 && ring[1] > 240 && ring[2] > 240 && ring[3] > 240, `${s.w}×${s.h}, ring ${ring}`);
    const auto = await run('sticker', { image: 'productB.png', outline: 10, shadow: 0 });
    const as = await imgStats(auto.outputs.image);
    ok('sticker autoCut on an opaque photo', as.at(1, 1)[3] === 0 && as.meanA > 20 && as.meanA < 160, `meanA ${as.meanA.toFixed(1)}`);
  });
  await step('palette', async () => {
    const j = await run('palette', { image: 'product.png', count: 4 });
    const cols = j.outputs.colors.colors;
    const hasRed = cols.some((c: any) => c.rgb[0] > 150 && c.rgb[1] < 80 && c.rgb[2] < 80);
    ok('palette: 4 colours incl. the red body, shares sum ≈ 1', cols.length === 4 && hasRed && near(cols.reduce((a: number, c: any) => a + c.share, 0), 1, 0.01), cols.map((c: any) => c.hex + ':' + c.share).join(' '));
    ok('palette swatch image', (await imgStats(j.outputs.swatch)).w === 96 * 4);
  });
  await step('convert', async () => {
    const j = await run('convert', { image: nobg || 'product.png', format: 'jpg', quality: 80, maxSize: 256, background: '#ff00ff' });
    const s = await imgStats(j.outputs.image);
    ok('convert → jpg 256 px, transparency flattened on background', s.fmt === 'jpeg' && s.w === 256 && (!nobg || (s.at(1, 1)[0] > 200 && s.at(1, 1)[1] < 60)), `${s.fmt} ${s.w}×${s.h} corner ${s.at(1, 1)}`);
  });

  // ---------- video ----------
  await step('chroma_key', async () => {
    const j = await run('chroma_key', { video: 'greenscreen.mp4', format: 'both' });
    const w = await probe(j.outputs.video), m = await probe(j.outputs.mov);
    const a = await alphaMean(j.outputs.video, 1);
    const am = await alphaMean(j.outputs.mov, 1);
    // red box 120×160 of 640×360 → mean alpha ≈ 21
    ok('chroma_key → WebM VP9 alpha', w.codec === 'vp9' && w.alphaMode === '1' && near(w.duration, 3, 0.15) && w.audio && a.corner === 0 && near(a.mean, 21.2, 6), `alpha mean ${a.mean.toFixed(1)}, key ${JSON.stringify(j.outputs.key)}`);
    ok('chroma_key → ProRes 4444 with alpha', m.codec === 'prores' && /4444/.test(m.profile || '') && /yuva/.test(m.pixFmt || '') && near(am.mean, 21.2, 6), `${m.profile} ${m.pixFmt} alpha ${am.mean.toFixed(1)}`);
    const img = await ff(['-ss', '1', '-i', path.join(MEDIA, 'greenscreen.mp4'), '-frames:v', '1', path.join(MEDIA, 'gsframe.png')]).then(() => run('chroma_key', { video: 'gsframe.png', color: 'green', similarity: 0.2 }));
    const is = await imgStats(img.outputs.image);
    ok('chroma_key on a still → PNG alpha', is.at(2, 2)[3] === 0 && is.meanA > 10 && is.meanA < 40, `meanA ${is.meanA.toFixed(1)}`);
  });
  await step('remove_background_video', async () => {
    const j = await run('remove_background_video', { video: 'greenscreen.mp4', fps: 6, duration: 1.5, maxWidth: 480 });
    const p = await probe(j.outputs.video);
    const a = await alphaMean(j.outputs.video, 0.5);
    ok('remove_background_video → WebM alpha, 1.5 s @ 6 fps', p.alphaMode === '1' && near(p.duration, 1.5, 0.25) && j.outputs.info.frames === 9 && a.corner < 10 && a.mean > 5 && a.mean < 80, `dur ${p.duration} frames ${j.outputs.info.frames} alpha ${a.mean.toFixed(1)} ${p.width}×${p.height}`);
    const err = await api('POST', '/api/toolkit/run', { op: 'remove_background_video', params: { video: 'talk.mp4', duration: 25 } }).catch((e) => e);
    ok('remove_background_video rejects > 20 s', err.status === 400, err.body?.error);
  });
  let short = '';
  await step('trim', async () => {
    const j = await run('trim', { media: 'clipA.mp4', start: 0.5, end: 2 });
    short = j.outputs.media;
    const p = await probe(short);
    ok('trim video 0.5–2 s', near(p.duration, 1.5, 0.1) && p.audio, `${p.duration}s ${short}`);
    const a = await run('trim', { media: 'voice.wav', start: 1, duration: 2 });
    const pa = await probe(a.outputs.media);
    ok('trim audio keeps wav', a.outputs.media.endsWith('.wav') && near(pa.duration, 2, 0.05), `${pa.duration}`);
  });
  await step('speed', async () => {
    const f = await probe((await run('speed', { video: 'clipA.mp4', factor: 2 })).outputs.video);
    ok('speed ×2 → 1.5 s with audio', near(f.duration, 1.5, 0.12) && f.audio, `${f.duration}`);
    const r = await probe((await run('speed', { video: 'clipA.mp4', factor: 1, mode: 'reverse' })).outputs.video);
    ok('reverse keeps duration', near(r.duration, 3, 0.12), `${r.duration}`);
    const b = await probe((await run('speed', { video: 'clipA.mp4', factor: 1.5, mode: 'boomerang' })).outputs.video);
    ok('boomerang ×1.5 → 4 s, no audio', near(b.duration, 4, 0.15) && !b.audio, `${b.duration}`);
  });
  await step('reframe', async () => {
    const c = await probe((await run('reframe', { media: 'clipA.mp4', aspect: '9:16', focusX: 0.3 })).outputs.media);
    ok('reframe crop 16:9 → 9:16', near(c.width / c.height, 9 / 16, 0.01) && c.height === 360, `${c.width}×${c.height}`);
    const b = await probe((await run('reframe', { media: 'clipA.mp4', aspect: '1:1', mode: 'blur', width: 480 })).outputs.media);
    ok('reframe blur-pad → 1:1 480 px', b.width === 480 && b.height === 480 && near(b.duration, 3, 0.1));
    const i = await imgStats((await run('reframe', { media: 'product.png', aspect: '16:9', mode: 'pad', padColor: '#ff0000' })).outputs.media);
    ok('reframe image pad 16:9 with colour', near(i.w / i.h, 16 / 9, 0.01) && i.at(2, i.h / 2)[0] > 240 && i.at(2, i.h / 2)[1] < 20, `${i.w}×${i.h}`);
  });
  await step('slowmo', async () => {
    const j = await run('slowmo', { video: short || 'clipA.mp4', factor: 2 });
    const p = await probe(j.outputs.video);
    ok('slowmo ×2 (minterpolate mci) → 3 s @ 30 fps', near(p.duration, (short ? 1.5 : 3) * 2, 0.15) && Math.round(p.fps) === 30, `${p.duration}s ${p.fps}fps`);
  });
  await step('extract_frames', async () => {
    const j = await run('extract_frames', { video: 'clipA.mp4', count: 4 });
    ok('extract_frames 4 + sheet', j.outputs.frames.files.length === 4 && j.outputs.frames.files.every((f: string) => fs.existsSync(path.join(PROJ, f))) && fs.existsSync(path.join(PROJ, j.outputs.sheet)), j.outputs.frames.files.join(','));
    const e = await run('extract_frames', { video: 'clipA.mp4', every: 1, format: 'jpg', width: 320 });
    ok('extract_frames every 1 s', e.outputs.frames.times.join(',') === '0,1,2' && (await imgStats(e.outputs.frames.files[0])).w === 320);
    const k = await run('extract_frames', { video: (await run('chroma_key', { video: 'greenscreen.mp4' })).outputs.video, times: '1' });
    ok('extract_frames keeps alpha of WebM', (await imgStats(k.outputs.frames.files[0])).at(2, 2)[3] < 10);
  });
  await step('to_gif', async () => {
    const j = await run('to_gif', { video: 'clipA.mp4', start: 0.5, duration: 1, fps: 10, width: 240 });
    const p = await probe(j.outputs.gif);
    ok('to_gif 240 px', p.codec === 'gif' && p.width === 240 && near(p.duration, 1, 0.15), `${p.width} ${p.duration}`);
  });
  await step('loop', async () => {
    const h = await probe((await run('loop', { video: 'clipA.mp4', count: 3 })).outputs.video);
    ok('loop ×3 → 9 s', near(h.duration, 9, 0.2) && h.audio, `${h.duration}`);
    const s = await run('loop', { video: 'clipA.mp4', count: 2, crossfade: 0.5 });
    const p = await probe(s.outputs.video);
    ok('seamless loop (0.5 s crossfade) ×2 → 5 s', near(p.duration, 5, 0.2) && s.outputs.info.cycle === 2.5, `${p.duration}`);
  });

  // ---------- morph ----------
  await step('morph_images', async () => {
    const m = await probe((await run('morph_images', { imageA: 'product.png', imageB: 'productB.png', duration: 1, hold: 0.25 })).outputs.video);
    ok('morph_images (minterpolate) → 1.5 s 512²', near(m.duration, 1.5, 0.1) && m.width === 512, `${m.duration}s ${m.width}×${m.height}`);
    const d = await probe((await run('morph_images', { imageA: 'product.png', imageB: 'productB.png', mode: 'dissolve', duration: 1, hold: 0.5, width: 256 })).outputs.video);
    ok('morph_images dissolve → 2 s 256²', near(d.duration, 2, 0.1) && d.width === 256, `${d.duration}s`);
  });
  await step('morph_video_cut', async () => {
    const j = await run('morph_video_cut', { videoA: 'clipA.mp4', videoB: 'clipB.mp4', duration: 0.8, join: true });
    const b = await probe(j.outputs.bridge), jj = await probe(j.outputs.joined);
    ok('morph_video_cut morph bridge 0.8 s + joined 6.8 s', near(b.duration, 0.8, 0.1) && near(jj.duration, 6.8, 0.2) && jj.audio, `${b.duration} / ${jj.duration}`);
    const d = await run('morph_video_cut', { videoA: 'clipA.mp4', videoB: 'clipB.mp4', duration: 1, mode: 'dissolve', join: true });
    const db = await probe(d.outputs.bridge), dj = await probe(d.outputs.joined);
    ok('morph_video_cut dissolve bridge 1 s + joined 5 s', near(db.duration, 1, 0.1) && near(dj.duration, 5, 0.2), `${db.duration} / ${dj.duration}`);
  });

  // ---------- audio ----------
  await step('extract_audio', async () => {
    const j = await run('extract_audio', { video: 'clipA.mp4' });
    const p = await probe(j.outputs.audio);
    ok('extract_audio → wav 3 s', j.outputs.audio.endsWith('.wav') && near(p.duration, 3, 0.1) && !p.width);
  });
  await step('normalize', async () => {
    const j = await run('normalize', { media: 'music.wav' });
    ok('normalize → −14 LUFS', near(j.outputs.loudness.output.i, -14, 1) && j.outputs.loudness.output.tp <= -0.5, JSON.stringify(j.outputs.loudness));
    const v = await run('normalize', { media: 'clipA.mp4', target: -16 });
    const p = await probe(v.outputs.media);
    ok('normalize video keeps picture', p.codec === 'h264' && p.audio && near(v.outputs.loudness.output.i, -16, 1.2), JSON.stringify(v.outputs.loudness.output));
  });
  await step('denoise', async () => {
    const j = await run('denoise', { media: 'noisy.wav', strength: 20, highpass: 0 });
    // noise-only gap 0–0.45 s vs "speech" 0.6–1.4 s
    const gb = await rmsDb('media/noisy.wav', 0, 0.45), ga = await rmsDb(j.outputs.media, 0, 0.45);
    const sb = await rmsDb('media/noisy.wav', 0.6, 1.4), sa = await rmsDb(j.outputs.media, 0.6, 1.4);
    ok('denoise (auto noise floor) lowers noise in pauses > 10 dB, keeps speech level', ga < gb - 10 && near(sa, sb, 1), `pause ${gb.toFixed(1)} → ${ga.toFixed(1)} dB, speech ${sb.toFixed(1)} → ${sa.toFixed(1)} dB`);
    const e = await api('POST', '/api/toolkit/run', { op: 'denoise', params: { media: 'noisy.wav', method: 'arnndn' }, wait: true });
    ok('denoise arnndn without model → clear error', e.status === 'error' && /rnnn/.test(e.error), e.error);
  });
  await step('remove_silence', async () => {
    const j = await run('remove_silence', { media: 'voice.wav', threshold: -35, minSilence: 0.4, padding: 0.1 });
    const p = await probe(j.outputs.media);
    const kept = j.outputs.segments.kept;
    // speech 1–2.5 and 4–5 (+0.1 padding each side) → ≈ 2.9 s; sin(3πt) envelope zero-crossings are short (< 0.4 s) so they stay
    ok('remove_silence audio → 2 segments ≈ 2.9 s', kept.length === 2 && near(p.duration, 2.9, 0.25), `${p.duration}s ${JSON.stringify(kept)}`);
    const v = await run('remove_silence', { media: 'talk.mp4', threshold: -35, minSilence: 0.4, padding: 0.1 });
    const pv = await probe(v.outputs.media);
    ok('remove_silence video (jump cuts)', pv.width === 320 && pv.audio && near(pv.duration, 2.9, 0.3), `${pv.duration}s`);
  });
  await step('duck', async () => {
    const j = await run('duck', { music: 'music.wav', voice: 'voice.wav', amount: 'strong', release: 200, mix: true });
    const p = await probe(j.outputs.music);
    const quiet = await rmsDb(j.outputs.music, 1.5, 2.3), loud = await rmsDb(j.outputs.music, 0.1, 0.8), orig = await rmsDb('media/music.wav', 1.5, 2.3);
    ok('duck: music lowered under the voice (> 6 dB), unchanged elsewhere', near(p.duration, 6, 0.05) && loud - quiet > 6 && near(loud, orig, 1.5), `outside ${loud.toFixed(1)} dB, under voice ${quiet.toFixed(1)} dB (orig ${orig.toFixed(1)})`);
    ok('duck mix output', fs.existsSync(path.join(PROJ, j.outputs.mix)) && near((await probe(j.outputs.mix)).duration, 6, 0.05));
    const off = await run('duck', { music: 'music.wav', voice: 'voice.wav', voiceStart: 3 });
    ok('duck with voiceStart offset (no mix)', !off.outputs.mix && (await rmsDb(off.outputs.music, 4.2, 5.3)) < (await rmsDb(off.outputs.music, 0.2, 1)) - 3);
  });

  // ---------- jobs: validation, cancel, listing ----------
  await step('jobs', async () => {
    const e1 = await api('POST', '/api/toolkit/run', { op: 'nope', params: {} }).catch((e) => e);
    ok('unknown op → 404', e1.status === 404);
    const e2 = await api('POST', '/api/toolkit/run', { op: 'trim', params: { media: 'product.png' } }).catch((e) => e);
    ok('wrong file kind → 400 with message', e2.status === 400 && /expects video\/audio/.test(e2.body?.error), e2.body?.error);
    const e3 = await api('POST', '/api/toolkit/run', { op: 'speed', params: { video: 'clipA.mp4', factor: 99 } }).catch((e) => e);
    ok('out-of-range number → 400', e3.status === 400 && /≤ 16/.test(e3.body?.error), e3.body?.error);
    const e4 = await api('POST', '/api/toolkit/run', { op: 'trim', params: { media: '../../etc/passwd' } }).catch((e) => e);
    ok('path escape rejected', e4.status >= 400, e4.body?.error);
    // cancel a slow job
    const before = fs.readdirSync(MEDIA).length;
    const job = await api('POST', '/api/toolkit/run', { op: 'slowmo', params: { video: 'clipA.mp4', factor: 8, fps: 60 } });
    await new Promise((r) => setTimeout(r, 1500));
    const c = await api('POST', `/api/toolkit/jobs/${job.id}/cancel`);
    let st: any;
    for (let i = 0; i < 40; i++) { st = await api('GET', `/api/toolkit/jobs/${job.id}`); if (st.status !== 'running') break; await new Promise((r) => setTimeout(r, 250)); }
    ok('cancel kills the job and leaves no output', c.ok && st.status === 'error' && st.error === 'cancelled' && fs.readdirSync(MEDIA).length === before, `${st.status} ${st.error}`);
    const list = await api('GET', '/api/toolkit/jobs');
    ok('jobs list', list.length > 10 && list.some((x: any) => x.id === job.id));
    const state = await api('GET', '/api/state');
    const lib = JSON.stringify(state.media || state);
    ok('outputs appear in the media library', lib.includes('product.nobg.png') || !nobg);
  });

  // ---------- MCP ----------
  await step('shots', async () => {
    // 5 shots with cuts at 1, 2, 3.5 (a colour-matched, soft cut) and 5 s
    const segs = ['color=c=0x1b2a6b:s=640x360:r=30:d=1', 'testsrc2=s=640x360:r=30:d=1', 'color=c=0xff5a36:s=640x360:r=30:d=1.5'];
    for (let i = 0; i < segs.length; i++) await ff([...L(segs[i]), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(tmp, `seg${i}.mp4`)]);
    await ff([...L('mandelbrot=s=640x360:r=30'), '-t', '1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(tmp, 'seg3.mp4')]);
    await ff([...L('color=c=0x0f3b3a:s=640x360:r=30:d=1.5'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(tmp, 'seg4.mp4')]);
    fs.writeFileSync(path.join(tmp, 'segs.txt'), [0, 1, 2, 3, 4].map((i) => `file '${path.join(tmp, `seg${i}.mp4`)}'`).join('\n'));
    await ff(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'segs.txt'), '-c', 'copy', path.join(MEDIA, 'edit.mp4')]);
    const d = await run('detect_shots', { video: 'edit.mp4' });
    const starts = d.outputs.shots.shots.map((x: any) => x.start);
    ok('detect_shots finds hard and soft cuts', starts.length === 5 && [0, 1, 2, 3.5, 5].every((t, i) => near(starts[i], t, 0.05)), JSON.stringify(starts));
    ok('detect_shots rhythm + sheet', d.outputs.shots.rhythm.shots === 5 && fs.existsSync(path.join(PROJ, d.outputs.sheet)), JSON.stringify(d.outputs.shots.rhythm));
    const sp = await run('split_shots', { video: 'edit.mp4', only: '2,4' });
    const files = sp.outputs.files.files;
    const durs = await Promise.all(files.map(async (f: string) => +(await sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(PROJ, f)])).out.toString().trim()));
    ok('split_shots exports selected shots', files.length === 2 && near(durs[0], 1 - 0.08, 0.1) && near(durs[1], 1.5 - 0.08, 0.1), JSON.stringify({ files, durs }));
  });

  await step('mcp', async () => {
    const tr = new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'server/mcp/stdio.mjs')], env: { ...process.env, STUDIO_URL: BASE } as Record<string, string> });
    const mcp = new Client({ name: 'toolkit-test', version: '1' });
    await mcp.connect(tr);
    const tools = (await mcp.listTools()).tools.map((t) => t.name);
    ok('MCP has list_media_tools + run_media_tool', tools.includes('list_media_tools') && tools.includes('run_media_tool'));
    const l: any = await mcp.callTool({ name: 'list_media_tools', arguments: { category: 'audio' } });
    ok('MCP list_media_tools (compact, filtered)', /duck \[audio/.test(l.content[0].text) && !/chroma_key/.test(l.content[0].text), l.content[0].text.length + ' chars');
    const r: any = await mcp.callTool({ name: 'run_media_tool', arguments: { op: 'extract_frames', params: { video: 'clipB.mp4', count: 2 } } });
    const out = JSON.parse(r.content[0].text);
    ok('MCP run_media_tool waits and returns outputs + note', !r.isError && out.outputs.frames.files.length === 2 && /timeline_add/.test(out.note), out.note);
    const bad: any = await mcp.callTool({ name: 'run_media_tool', arguments: { op: 'trim', params: { media: 'missing.mp4' } } });
    ok('MCP run_media_tool error is readable', bad.isError && /File not found/.test(bad.content[0].text), bad.content[0].text);
    await mcp.close();
  });
} catch (e) {
  ok('toolkit test run', false, (e as Error).stack || String(e));
} finally {
  server.kill('SIGTERM');
  console.log('\ntimings:\n  ' + timings.join('\n  '));
  if (failures) console.log('\nserver log (tail):\n' + log.slice(-3000));
  if (!process.env.KEEP) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('kept', tmp);
  console.log(failures ? `\n${failures} failure(s)` : '\nall toolkit checks passed');
  process.exit(failures ? 1 : 0);
}
