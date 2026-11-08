// Video ops: chroma_key, remove_background_video, trim, speed, reframe, slowmo, extract_frames, to_gif, loop.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { MEDIA_EXT } from '../../project.ts';
import { probe, inputArgs, ffmpeg, videoEncoder, audioEncoder, WEBM_ALPHA, WEBM_AUDIO, PRORES_4444, PRORES_AUDIO, parseAspect, even, ffColor, type Probe } from '../ff.ts';
import { matte, BG_MODELS, type BgModel } from '../ml.ts';

const VID = ['video'] as ('video')[];
const kindOf = (rel: string) => MEDIA_EXT[path.extname(rel).toLowerCase()];
async function source(ctx: OpContext, rel: string, need: 'video' | 'audio' | 'any' = 'video') {
  const abs = ctx.abs(rel);
  const info = await probe(abs);
  if (need === 'video' && !info.hasVideo) throw uerr('{file} has no video stream', { file: rel });
  if (need === 'audio' && !info.hasAudio) throw uerr('{file} has no audio stream', { file: rel });
  return { abs, info, input: inputArgs(abs, info) };
}
/** input args with a seek before -i */
const seekInput = (s: { abs: string; info: Probe }, start: number, dur?: number) => ['-ss', String(start), ...(dur ? ['-t', String(dur)] : []), ...inputArgs(s.abs, s.info)];
/** atempo accepts 0.5…100 per instance; chain for slower factors */
function atempo(f: number) { const parts: string[] = []; while (f < 0.5) { parts.push('atempo=0.5'); f /= 0.5; } parts.push(`atempo=${f.toFixed(5)}`); return parts.join(','); }
function range(info: Probe, start: number, end: number, duration: number, file: string) {
  if (start >= info.duration) throw uerr('start {start}s is past the end of {file} ({dur}s)', { start, file, dur: info.duration.toFixed(2) });
  const stop = duration > 0 ? Math.min(info.duration, start + duration) : end > 0 ? Math.min(info.duration, end) : info.duration;
  if (stop <= start) throw uerr('end must be after start');
  return { start, dur: stop - start };
}

defineOp({
  id: 'chroma_key',
  title: 'Chroma key (green / blue screen)',
  category: 'video',
  cost: 'medium',
  description: 'Remove a green/blue (or any solid colour) screen from footage → transparent video: WebM VP9 with alpha (plays in the editor; put it on a track above the background) and/or ProRes 4444 .mov (for other NLEs). color=auto samples the frame border. Raise similarity if screen remains, lower it if the subject gets holes; blend softens edges; despill removes the green/blue cast on the subject. Also keys a still image → PNG.',
  inputs: {
    video: { type: 'file', label: 'Footage', accept: ['video', 'image'], required: true },
    color: { type: 'enum', label: 'Key colour', values: ['auto', 'green', 'blue', 'custom'], default: 'auto' },
    customColor: { type: 'color', label: 'Custom colour', default: '#00b140' },
    similarity: { type: 'number', label: 'Similarity', min: 0.01, max: 0.6, step: 0.01, default: 0.16 },
    blend: { type: 'number', label: 'Edge blend', min: 0, max: 0.5, step: 0.01, default: 0.08 },
    despill: { type: 'boolean', label: 'Despill', default: true },
    format: { type: 'enum', label: 'Output', values: ['webm', 'mov', 'both'], default: 'webm', description: 'webm = VP9 alpha (editor/web); mov = ProRes 4444 (Premiere/Resolve/FCP, large)' },
  },
  outputs: { video: { kind: 'video', optional: true, description: 'WebM VP9 + alpha' }, mov: { kind: 'video', optional: true, description: 'ProRes 4444 + alpha' }, image: { kind: 'image', optional: true, description: 'PNG (still input)' }, key: { kind: 'json', description: '{color, spill} — the key colour used (useful with color=auto)' } },
  async run(ctx, p: any) {
    const isImage = kindOf(p.video) === 'image';
    const s = await source(ctx, p.video);
    let key = p.color === 'green' ? '#00b140' : p.color === 'blue' ? '#0047bb' : p.customColor;
    if (p.color === 'auto') {
      ctx.progress(0.02, 'sampling key colour');
      const f = path.join(ctx.tmp(), 'sample.png');
      await ffmpeg(ctx, [...(isImage ? [] : ['-ss', String(Math.min(0.5, s.info.duration / 2))]), ...s.input, '-frames:v', '1', '-vf', 'scale=240:-2', f]);
      const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const ring = Math.max(2, Math.round(info.width * 0.06));
      const ch: number[][] = [[], [], []];
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (x >= ring && x < info.width - ring && y >= ring && y < info.height - ring) continue;
        const i = (y * info.width + x) * 3; ch[0].push(data[i]); ch[1].push(data[i + 1]); ch[2].push(data[i + 2]);
      }
      const med = ch.map((a) => a.sort((x, y) => x - y)[a.length >> 1]);
      key = '#' + med.map((v) => v.toString(16).padStart(2, '0')).join('');
    }
    const [, g, b] = [1, 3, 5].map((i) => parseInt(key.slice(i, i + 2), 16));
    const spill = b > g ? 'blue' : 'green';
    const chain = `chromakey=${ffColor(key)}:${p.similarity}:${p.blend}${p.despill ? `,despill=type=${spill}:mix=0.6:expand=0.1` : ''}`;
    if (isImage) {
      const image = ctx.out('key', 'png');
      await ffmpeg(ctx, [...s.input, '-vf', `${chain},format=rgba`, '-frames:v', '1', ctx.abs(image)]);
      return { image, key: { color: key, spill } };
    }
    const outs: Record<string, any> = { key: { color: key, spill } };
    const webm = p.format !== 'mov', mov = p.format !== 'webm';
    const args = [...s.input, '-filter_complex', `[0:v]${chain},${webm && mov ? 'split=2[a][b]' : webm ? 'null[a]' : 'null[b]'}`];
    const audio = s.info.hasAudio;
    if (webm) { outs.video = ctx.out('key', 'webm'); args.push('-map', '[a]', ...(audio ? ['-map', '0:a:0', ...WEBM_AUDIO] : []), ...WEBM_ALPHA, ctx.abs(outs.video)); }
    if (mov) { outs.mov = ctx.out('key', 'mov'); args.push('-map', '[b]', ...(audio ? ['-map', '0:a:0', ...PRORES_AUDIO] : []), ...PRORES_4444, ctx.abs(outs.mov)); }
    await ffmpeg(ctx, args, { duration: s.info.duration, stage: 'keying' });
    return outs;
  },
});

defineOp({
  id: 'remove_background_video',
  title: 'Remove background (video, ML)',
  category: 'video',
  cost: 'slow',
  timeoutSec: 1800,
  description: 'Cut the subject out of ordinary footage (no green screen) with per-frame ML segmentation → WebM VP9 with alpha at a reduced frame rate (default 12 fps). Slow: ~1 s per frame with isnet, ~0.15 s with modnet (people only). Limited to 20 s per run — use start/duration to pick the part. For green-screen footage use chroma_key instead (faster, sharper).',
  limits: '≤ 20 s of source per run; output fps = fps param; width ≤ maxWidth',
  inputs: {
    video: { type: 'file', label: 'Footage', accept: VID, required: true },
    model: { type: 'enum', label: 'Model', values: ['isnet', 'modnet'], default: 'isnet', description: 'isnet = any subject; modnet = people, ~6× faster' },
    fps: { type: 'number', label: 'Frames per second', min: 2, max: 30, default: 12 },
    start: { type: 'number', label: 'Start s', min: 0, default: 0 },
    duration: { type: 'number', label: 'Duration s', min: 0, max: 20, default: 0, description: '0 = to the end (max 20 s)' },
    maxWidth: { type: 'number', label: 'Max width', min: 160, max: 1920, default: 960 },
    threshold: { type: 'number', label: 'Hard edge threshold', min: 0, max: 1, step: 0.05, default: 0 },
  },
  outputs: { video: { kind: 'video', description: 'WebM VP9 + alpha' }, info: { kind: 'json' } },
  async run(ctx, p: { video: string; model: BgModel; fps: number; start: number; duration: number; maxWidth: number; threshold: number }) {
    const s = await source(ctx, p.video);
    const rg = range(s.info, p.start, 0, p.duration, p.video);
    if (rg.dur > 20.01) throw uerr('remove_background_video handles at most 20 s per run ({file} is {dur}s from start) — set duration ≤ 20 or trim first', { file: p.video, dur: rg.dur.toFixed(1) });
    const dir = path.join(ctx.tmp(), 'frames');
    fs.mkdirSync(dir, { recursive: true });
    await ffmpeg(ctx, [...seekInput(s, rg.start, rg.dur), '-vf', `fps=${p.fps},scale=w='trunc(min(${p.maxWidth},iw)/2)*2':h=-2`, path.join(dir, 'f%05d.png')], { duration: rg.dur, range: [0, 0.08], stage: 'extracting frames' });
    const frames = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    if (!frames.length) throw uerr('No frames extracted from {file}', { file: p.video });
    const maskFile = path.join(ctx.tmp(), 'masks.gray');
    const fd = fs.openSync(maskFile, 'w');
    let W = 0, H = 0;
    try {
      ctx.progress(0.08, `loading model ${p.model} (first run downloads ${BG_MODELS[p.model].size})`);
      for (let i = 0; i < frames.length; i++) {
        if (ctx.signal.aborted) throw ctx.signal.reason;
        const m = await matte(path.join(dir, frames[i]), p.model);
        W = m.width; H = m.height;
        if (p.threshold > 0) { const t = p.threshold * 255; for (let k = 0; k < m.mask.length; k++) m.mask[k] = m.mask[k] >= t ? 255 : 0; }
        fs.writeSync(fd, m.mask);
        ctx.progress(0.1 + 0.8 * ((i + 1) / frames.length), `segmenting ${i + 1}/${frames.length}`);
      }
    } finally { fs.closeSync(fd); }
    const video = ctx.out('nobg', 'webm');
    const audio = s.info.hasAudio;
    await ffmpeg(ctx, [
      '-framerate', String(p.fps), '-i', path.join(dir, 'f%05d.png'),
      '-f', 'rawvideo', '-pix_fmt', 'gray', '-video_size', `${W}x${H}`, '-framerate', String(p.fps), '-i', maskFile,
      ...(audio ? ['-ss', String(rg.start), '-t', String(rg.dur), '-i', s.abs] : []),
      '-filter_complex', '[0:v]format=rgb24[c];[1:v]format=gray[m];[c][m]alphamerge,format=yuva420p[v]',
      '-map', '[v]', ...(audio ? ['-map', '2:a:0', ...WEBM_AUDIO, '-shortest'] : []), ...WEBM_ALPHA, '-r', String(p.fps), ctx.abs(video),
    ], { duration: rg.dur, range: [0.9, 1], stage: 'encoding' });
    return { video, info: { frames: frames.length, fps: p.fps, width: W, height: H, start: rg.start, duration: +rg.dur.toFixed(3), model: p.model } };
  },
});

defineOp({
  id: 'trim',
  title: 'Trim',
  category: 'video',
  cost: 'fast',
  description: 'Cut a time range out of a video or audio file into a new file (frame-accurate re-encode; alpha WebM stays alpha). Give end or duration. Note: to just use part of a clip on the timeline you do not need this — set the item\'s `in` and `duration`; trim is for feeding a shorter piece into other ops (slowmo, gif, background removal).',
  inputs: {
    media: { type: 'file', label: 'Video or audio', accept: ['video', 'audio'], required: true },
    start: { type: 'number', label: 'Start s', min: 0, default: 0 },
    end: { type: 'number', label: 'End s', min: 0, default: 0, description: '0 = to the end' },
    duration: { type: 'number', label: 'Duration s', min: 0, default: 0, description: 'overrides end when > 0' },
  },
  outputs: { media: { kind: 'video', sameAs: 'media' } },
  async run(ctx, p: any) {
    const isAudio = kindOf(p.media) === 'audio';
    const s = await source(ctx, p.media, isAudio ? 'audio' : 'video');
    const rg = range(s.info, p.start, p.end, p.duration, p.media);
    const enc = isAudio ? audioEncoder(path.extname(p.media)) : videoEncoder(s.info.alpha, s.info.hasAudio);
    const media = ctx.out(`trim${Math.round(rg.start * 10) / 10}-${Math.round((rg.start + rg.dur) * 10) / 10}`.replace(/\./g, '_'), enc.ext);
    await ffmpeg(ctx, [...seekInput(s, rg.start, rg.dur), ...(isAudio ? ['-vn'] : ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2']), ...enc.args, ctx.abs(media)], { duration: rg.dur, stage: 'trimming' });
    return { media };
  },
});

defineOp({
  id: 'speed',
  title: 'Speed / reverse / boomerang',
  category: 'video',
  cost: 'medium',
  description: 'Change playback speed of a video (factor 2 = twice as fast, 0.5 = half speed by frame duplication — for smooth slow motion use slowmo), play it in reverse, or make a boomerang (forward then backward, audio dropped). Audio follows the speed with pitch preserved (atempo). Reverse/boomerang load the clip into memory: ≤ 30 s.',
  limits: 'reverse/boomerang: ≤ 30 s source',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    factor: { type: 'number', label: 'Speed ×', min: 0.1, max: 16, step: 0.05, default: 2 },
    mode: { type: 'enum', label: 'Mode', values: ['normal', 'reverse', 'boomerang'], default: 'normal' },
    audio: { type: 'boolean', label: 'Keep audio', default: true },
  },
  outputs: { video: { kind: 'video' } },
  async run(ctx, p: any) {
    const s = await source(ctx, p.video);
    if (p.mode !== 'normal' && s.info.duration > 30.5) throw uerr('{mode} works on ≤ 30 s clips ({file} is {dur}s) — trim first', { mode: p.mode, file: p.video, dur: s.info.duration.toFixed(1) });
    const keepAudio = p.audio && s.info.hasAudio && p.mode !== 'boomerang';
    const fps = Math.min(60, s.info.fps || 30);
    const enc = videoEncoder(s.info.alpha, keepAudio);
    let vf = '[0:v]';
    if (p.mode === 'reverse') vf += 'reverse,';
    if (p.mode === 'boomerang') vf += 'split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1:a=0,';
    vf += `setpts=PTS/${p.factor},fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2[v]`;
    let af = '';
    if (keepAudio) af = `;[0:a]${p.mode === 'reverse' ? 'areverse,' : ''}${atempo(p.factor)}[a]`;
    const tag = p.mode === 'normal' ? `x${p.factor}`.replace('.', '_') : p.mode === 'reverse' && p.factor === 1 ? 'reverse' : `${p.mode}${p.factor !== 1 ? '-x' + String(p.factor).replace('.', '_') : ''}`;
    const video = ctx.out(tag, enc.ext);
    const outDur = (s.info.duration * (p.mode === 'boomerang' ? 2 : 1)) / p.factor;
    await ffmpeg(ctx, [...s.input, '-filter_complex', vf + af, '-map', '[v]', ...(keepAudio ? ['-map', '[a]'] : []), ...enc.args, ctx.abs(video)], { duration: outDur, stage: 'retiming' });
    return { video };
  },
});

defineOp({
  id: 'reframe',
  title: 'Reframe to aspect ratio',
  category: 'video',
  cost: 'medium',
  description: 'Change the aspect ratio of a video or image (e.g. 16:9 footage → 9:16 for Reels/Shorts, 1:1, 4:5). mode=crop keeps the area around the focus point (focusX/focusY 0…1, e.g. 0.3 = subject left of centre); pad letterboxes with padColor; blur fills the bars with a blurred, zoomed copy (social style). width sets the output width (0 = keep the source resolution).',
  inputs: {
    media: { type: 'file', label: 'Video or image', accept: ['video', 'image'], required: true },
    aspect: { type: 'string', label: 'Aspect', default: '9:16', description: 'w:h, e.g. 9:16, 1:1, 4:5, 16:9, 2.39' },
    mode: { type: 'enum', label: 'Mode', values: ['crop', 'pad', 'blur'], default: 'crop' },
    focusX: { type: 'number', label: 'Focus x', min: 0, max: 1, step: 0.01, default: 0.5 },
    focusY: { type: 'number', label: 'Focus y', min: 0, max: 1, step: 0.01, default: 0.5 },
    width: { type: 'number', label: 'Output width', min: 0, max: 4096, default: 0 },
    padColor: { type: 'color', label: 'Pad colour', default: '#000000' },
  },
  outputs: { media: { kind: 'video', sameAs: 'media' } },
  async run(ctx, p: any) {
    const isImage = kindOf(p.media) === 'image';
    const s = await source(ctx, p.media);
    const r = parseAspect(p.aspect);
    const sw = s.info.width, sh = s.info.height, sa = sw / sh;
    let W = 0, H = 0, chain: string;
    // output size: explicit width, else the region size at source resolution (the dimension kept from the source stays exact)
    const size = (rw: number, rh: number) => {
      if (p.width) { W = even(p.width); H = even(W / r); }
      else if (r < 1) { H = even(rh); W = even(H * r); }
      else { W = even(rw); H = even(W / r); }
    };
    if (p.mode === 'crop') {
      const cw = sa > r ? Math.round(sh * r) : sw, ch = sa > r ? sh : Math.round(sw / r);
      size(cw, ch);
      const x = Math.round((sw - cw) * p.focusX), y = Math.round((sh - ch) * p.focusY);
      chain = `[0:v]crop=${cw}:${ch}:${x}:${y},scale=${W}:${H}:flags=lanczos,setsar=1[v]`;
    } else {
      size(sa > r ? sw : Math.round(sh * r), sa > r ? Math.round(sw / r) : sh);
      const fg = `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2`;
      const ox = `(W-w)*${p.focusX}`, oy = `(H-h)*${p.focusY}`;
      chain = p.mode === 'pad'
        ? `[0:v]${fg},pad=${W}:${H}:(ow-iw)*${p.focusX}:(oh-ih)*${p.focusY}:color=${ffColor(p.padColor)},setsar=1[v]`
        : `[0:v]split[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=luma_radius=min(h\\,w)/20:luma_power=2,eq=brightness=-0.06:saturation=1.1[b];[fg]${fg}[f];[b][f]overlay=${ox}:${oy},setsar=1[v]`;
    }
    if (W > 8192 || H > 8192) throw uerr('Output {w}×{h} is too large — set width', { w: W, h: H });
    const tag = 'r' + p.aspect.replace(/[^\d.]+/g, 'x');
    if (isImage) {
      const media = ctx.out(tag, 'png');
      await ffmpeg(ctx, [...s.input, '-filter_complex', chain, '-map', '[v]', '-frames:v', '1', ctx.abs(media)]);
      return { media };
    }
    const enc = videoEncoder(s.info.alpha && p.mode !== 'blur', s.info.hasAudio);
    const media = ctx.out(tag, enc.ext);
    await ffmpeg(ctx, [...s.input, '-filter_complex', chain, '-map', '[v]', ...(s.info.hasAudio ? ['-map', '0:a:0'] : []), ...enc.args, ctx.abs(media)], { duration: s.info.duration, stage: 'reframing' });
    return { media };
  },
});

defineOp({
  id: 'slowmo',
  title: 'Smooth slow motion',
  category: 'video',
  cost: 'slow',
  description: 'Slow a clip down by `factor` and synthesise the in-between frames with motion-compensated interpolation (ffmpeg minterpolate, method mci) — smooth slow-mo from normal footage. blend = cross-fades frames (cheaper, ghosting); dup = repeats frames (choppy). Works best on clean, moderate motion; fast/complex motion shows warping. Slow (~2–10 fps processing at 1080p): ≤ 15 s source per run, trim first.',
  limits: '≤ 15 s source',
  timeoutSec: 1800,
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    factor: { type: 'number', label: 'Slow-down ×', min: 1.25, max: 8, step: 0.25, default: 2 },
    method: { type: 'enum', label: 'Method', values: ['mci', 'blend', 'dup'], default: 'mci' },
    fps: { type: 'number', label: 'Output fps', min: 0, max: 120, default: 0, description: '0 = source fps' },
    audio: { type: 'boolean', label: 'Keep audio (slowed)', default: false },
  },
  outputs: { video: { kind: 'video' } },
  async run(ctx, p: any) {
    const s = await source(ctx, p.video);
    if (s.info.duration > 15.5) throw uerr('slowmo works on ≤ 15 s clips ({file} is {dur}s) — trim first', { file: p.video, dur: s.info.duration.toFixed(1) });
    const fps = p.fps || Math.round(s.info.fps) || 30;
    const interp = p.method === 'dup' ? `fps=${fps}` : `minterpolate=fps=${fps}:mi_mode=${p.method}${p.method === 'mci' ? ':mc_mode=aobmc:me_mode=bidir:vsbmc=1' : ''}`;
    const keepAudio = p.audio && s.info.hasAudio;
    const enc = videoEncoder(s.info.alpha, keepAudio);
    const video = ctx.out(`slow${p.factor}`.replace('.', '_'), enc.ext);
    await ffmpeg(ctx, [...s.input, '-filter_complex', `[0:v]setpts=${p.factor}*PTS,${interp},scale=trunc(iw/2)*2:trunc(ih/2)*2[v]${keepAudio ? `;[0:a]${atempo(1 / p.factor)}[a]` : ''}`, '-map', '[v]', ...(keepAudio ? ['-map', '[a]'] : []), ...enc.args, ctx.abs(video)], { duration: s.info.duration * p.factor, stage: 'interpolating' });
    return { video };
  },
});

defineOp({
  id: 'extract_frames',
  title: 'Extract frames',
  category: 'video',
  cost: 'fast',
  description: 'Grab still frames from a video as images: `count` evenly spaced frames, or one every `every` seconds (max 48), plus a contact sheet. Use to pick a thumbnail, get a frame for remove_background/palette/morph_images, or to look at footage.',
  limits: '≤ 48 frames',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    count: { type: 'number', label: 'Count', min: 1, max: 48, step: 1, default: 6 },
    every: { type: 'number', label: 'Every s', min: 0, default: 0, description: '> 0 = one frame every N seconds (overrides count)' },
    times: { type: 'string', label: 'Exact times', default: '', description: 'comma-separated seconds, e.g. "0.5, 2, 3.25" (overrides count/every)' },
    format: { type: 'enum', label: 'Format', values: ['png', 'jpg'], default: 'png' },
    width: { type: 'number', label: 'Width', min: 0, max: 7680, default: 0, description: '0 = source size' },
  },
  outputs: { frames: { kind: 'json', description: '{files:[media/…], times:[s]}' }, sheet: { kind: 'image', description: 'contact sheet' } },
  async run(ctx, p: any) {
    const s = await source(ctx, p.video);
    const D = s.info.duration;
    let times: number[];
    if (String(p.times || '').trim()) times = String(p.times).split(/[,\s]+/).filter(Boolean).map(Number).filter((t) => Number.isFinite(t) && t >= 0 && t < D);
    else if (p.every > 0) { times = []; for (let t = 0; t < D && times.length < 48; t += p.every) times.push(+t.toFixed(3)); }
    else times = Array.from({ length: Math.round(p.count) }, (_, i) => +(((i + 0.5) * D) / Math.round(p.count)).toFixed(3));
    if (!times.length) throw uerr('No valid times inside {file} (duration {dur}s)', { file: p.video, dur: D.toFixed(2) });
    if (times.length > 48) times = times.slice(0, 48);
    const files: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const f = ctx.out(`f${String(i + 1).padStart(2, '0')}`, p.format);
      await ffmpeg(ctx, ['-ss', String(times[i]), ...s.input, '-frames:v', '1', ...(p.format === 'jpg' ? ['-vf', `${p.width ? `scale=${p.width}:-2:` : 'scale='}out_range=full,format=yuvj420p`, '-q:v', '2'] : p.width ? ['-vf', `scale=${p.width}:-2`] : []), ctx.abs(f)]);
      if (!fs.existsSync(ctx.abs(f))) throw uerr('Could not read a frame at {t}s', { t: times[i] });
      files.push(f);
      ctx.progress(0.9 * ((i + 1) / times.length), `frame ${i + 1}/${times.length}`);
    }
    // contact sheet
    const cols = Math.ceil(Math.sqrt(files.length)), rows = Math.ceil(files.length / cols);
    const tw = 320, th = Math.max(2, Math.round((tw * (s.info.height || 9)) / (s.info.width || 16)));
    const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(ctx.abs(f)).resize(tw, th, { fit: 'contain', background: '#111' }).png().toBuffer(), left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 4) })));
    const sheet = ctx.out('frames', 'jpg');
    await sharp({ create: { width: cols * (tw + 4) - 4, height: rows * (th + 4) - 4, channels: 3, background: '#111111' } }).composite(tiles).jpeg({ quality: 85 }).toFile(ctx.abs(sheet));
    return { frames: { files, times }, sheet };
  },
});

defineOp({
  id: 'to_gif',
  title: 'Video → GIF',
  category: 'convert',
  cost: 'medium',
  description: 'Make an animated GIF from (part of) a video with an optimised palette (palettegen/paletteuse). Keep it short and small: GIF size grows fast — 480 px wide, 12 fps, ≤ 6 s is a good default. Transparent WebM keeps transparency (1-bit).',
  limits: '≤ 30 s',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    start: { type: 'number', label: 'Start s', min: 0, default: 0 },
    duration: { type: 'number', label: 'Duration s', min: 0, max: 30, default: 0, description: '0 = whole clip (max 30 s)' },
    fps: { type: 'number', label: 'fps', min: 1, max: 30, default: 12 },
    width: { type: 'number', label: 'Width', min: 32, max: 1280, default: 480 },
    colors: { type: 'number', label: 'Colours', min: 4, max: 256, default: 256 },
    dither: { type: 'enum', label: 'Dither', values: ['sierra2_4a', 'floyd_steinberg', 'bayer', 'none'], default: 'sierra2_4a' },
    loop: { type: 'boolean', label: 'Loop forever', default: true },
  },
  outputs: { gif: { kind: 'image' } },
  async run(ctx, p: any) {
    const s = await source(ctx, p.video);
    const rg = range(s.info, p.start, 0, p.duration, p.video);
    if (rg.dur > 30.01) throw uerr('GIFs are limited to 30 s — set duration');
    const gif = ctx.out('anim', 'gif');
    await ffmpeg(ctx, [...seekInput(s, rg.start, rg.dur), '-filter_complex',
      `[0:v]fps=${p.fps},scale=${p.width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${Math.round(p.colors)}:stats_mode=diff:reserve_transparent=${s.info.alpha ? 1 : 0}[pal];[b][pal]paletteuse=dither=${p.dither}:diff_mode=rectangle${s.info.alpha ? ':alpha_threshold=128' : ''}`,
      '-loop', p.loop ? '0' : '-1', ctx.abs(gif)], { duration: rg.dur, stage: 'encoding gif' });
    return { gif };
  },
});

defineOp({
  id: 'loop',
  title: 'Loop',
  category: 'video',
  cost: 'medium',
  description: 'Repeat a clip `count` times into one file. crossfade > 0 first makes the clip a SEAMLESS loop (its last `crossfade` seconds dissolve into its start, so the cycle is shorter by that amount and has no visible jump) — ideal for background plates and ambient B-roll. Audio is looped/cross-faded too.',
  limits: 'total output ≤ 10 min',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    count: { type: 'number', label: 'Repeats', min: 1, max: 50, step: 1, default: 3 },
    crossfade: { type: 'number', label: 'Seamless crossfade s', min: 0, max: 5, step: 0.1, default: 0 },
  },
  outputs: { video: { kind: 'video' }, info: { kind: 'json', description: '{cycle, duration}' } },
  async run(ctx, p: any) {
    const s = await source(ctx, p.video);
    const D = s.info.duration, c = p.crossfade, n = Math.round(p.count);
    if (c > 0 && c > D / 3) throw uerr('crossfade must be ≤ a third of the clip ({max}s)', { max: (D / 3).toFixed(2) });
    const cycle = c > 0 ? D - c : D;
    if (cycle * n > 600) throw uerr('Looped output would be {s}s — max 600 s', { s: Math.round(cycle * n) });
    const audio = s.info.hasAudio;
    let src = s.abs, srcInfo = s.info;
    if (c > 0) {
      const ext = s.info.alpha ? 'webm' : 'mp4';
      src = path.join(ctx.tmp(), 'cycle.' + ext);
      const fps = Math.round(s.info.fps) || 30;
      const fc = `[0:v]fps=${fps},settb=AVTB,split[a][b];[a]trim=${c}:${D},setpts=PTS-STARTPTS[main];[b]trim=0:${c},setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=${c}:offset=${(D - 2 * c).toFixed(4)},scale=trunc(iw/2)*2:trunc(ih/2)*2[v]`
        + (audio ? `;[0:a]asplit[x][y];[x]atrim=${c}:${D},asetpts=PTS-STARTPTS[am];[y]atrim=0:${c},asetpts=PTS-STARTPTS[ah];[am][ah]acrossfade=d=${c}[aa]` : '');
      await ffmpeg(ctx, [...s.input, '-filter_complex', fc, '-map', '[v]', ...(audio ? ['-map', '[aa]'] : []), ...videoEncoder(s.info.alpha, audio).args, src], { duration: cycle, range: [0, 0.5], stage: 'making seamless cycle' });
      srcInfo = await probe(src);
    }
    const enc = videoEncoder(s.info.alpha, audio);
    const video = ctx.out(`loop${n}`, enc.ext);
    await ffmpeg(ctx, ['-stream_loop', String(n - 1), ...inputArgs(src, srcInfo), '-map', '0:v:0', ...(audio ? ['-map', '0:a:0'] : []), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', ...enc.args, ctx.abs(video)], { duration: cycle * n, range: [c > 0 ? 0.5 : 0, 1], stage: 'looping' });
    return { video, info: { cycle: +cycle.toFixed(3), duration: +(cycle * n).toFixed(3) } };
  },
});
