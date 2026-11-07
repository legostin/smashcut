import { filterComplexFileArgs } from '../../bin.ts';
// Audio ops: extract_audio, normalize, denoise, remove_silence, duck.
// Ops that accept video keep the picture (stream copy) and only process the sound.
import fs from 'node:fs';
import path from 'node:path';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { MEDIA_EXT } from '../../project.ts';
import { probe, ffmpeg, ffmpegAnalyze, audioEncoder, MP4 } from '../ff.ts';

const AV = ['audio', 'video'] as ('audio' | 'video')[];
const kindOf = (rel: string) => MEDIA_EXT[path.extname(rel).toLowerCase()];

async function withAudio(ctx: OpContext, rel: string) {
  const abs = ctx.abs(rel);
  const info = await probe(abs);
  if (!info.hasAudio) throw uerr('{file} has no audio track', { file: rel });
  return { abs, info, isVideo: kindOf(rel) === 'video' && info.hasVideo };
}

/** output container/codec for "same media, processed audio": audio → matching audio codec, video → copy picture */
function avOut(rel: string, isVideo: boolean) {
  const ext = path.extname(rel).toLowerCase().slice(1);
  if (!isVideo) { const e = audioEncoder(ext); return { ext: e.ext, args: ['-vn', ...e.args] }; }
  if (ext === 'webm') return { ext: 'webm', args: ['-map', '0:v:0', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '160k'] };
  if (ext === 'mov' || ext === 'mkv') return { ext, args: ['-map', '0:v:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k'] };
  return { ext: 'mp4', args: ['-map', '0:v:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] };
}

defineOp({
  id: 'extract_audio',
  title: 'Extract audio',
  category: 'convert',
  cost: 'fast',
  description: 'Save the sound track of a video as an audio file (wav = lossless, best for further processing/transcription; m4a/mp3 = small). Use to analyse, denoise, normalise or transcribe the sound separately, or to reuse it under other footage.',
  inputs: {
    video: { type: 'file', label: 'Video', accept: ['video', 'audio'], required: true },
    format: { type: 'enum', label: 'Format', values: ['wav', 'm4a', 'mp3', 'flac'], default: 'wav' },
  },
  outputs: { audio: { kind: 'audio' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.video);
    const enc = audioEncoder(p.format);
    const audio = ctx.out('audio', enc.ext);
    await ffmpeg(ctx, ['-i', s.abs, '-map', '0:a:0', '-vn', ...enc.args, ctx.abs(audio)], { duration: s.info.duration, stage: 'extracting' });
    return { audio };
  },
});

defineOp({
  id: 'normalize',
  title: 'Loudness normalize',
  category: 'audio',
  cost: 'fast',
  description: 'Two-pass EBU R128 loudness normalisation (ffmpeg loudnorm, linear mode) to a target integrated loudness: −14 LUFS (default) for YouTube/Spotify/social, −16 for podcasts/Apple, −23 for broadcast. Also limits true peak. Video input keeps the picture untouched. Returns the measured loudness before/after.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    target: { type: 'number', label: 'Target LUFS', min: -36, max: -5, step: 0.5, default: -14 },
    truePeak: { type: 'number', label: 'True peak dBTP', min: -9, max: 0, step: 0.1, default: -1 },
    lra: { type: 'number', label: 'Loudness range LU', min: 1, max: 20, default: 11 },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' }, loudness: { kind: 'json', description: '{input:{i,tp,lra}, output:{i,tp}}' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const base = `loudnorm=I=${p.target}:TP=${p.truePeak}:LRA=${p.lra}`;
    const parse = (log: string) => { const m = log.lastIndexOf('{'); if (m < 0) throw new Error('loudnorm produced no measurement'); return JSON.parse(log.slice(m, log.indexOf('}', m) + 1)); };
    const m1 = parse(await ffmpegAnalyze(ctx, ['-i', s.abs, '-map', '0:a:0', '-af', `${base}:print_format=json`, '-f', 'null', '-'], { duration: s.info.duration, range: [0, 0.45], stage: 'measuring' }));
    if (!Number.isFinite(Number(m1.input_i)) || Number(m1.input_i) < -70) throw uerr('{file} is silent — nothing to normalise', { file: p.media });
    const enc = avOut(p.media, s.isVideo);
    const media = ctx.out(`norm${Math.abs(p.target)}`.replace('.', '_'), enc.ext);
    const second = `${base}:measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}:linear=true:print_format=json`;
    const log = await ffmpegAnalyze(ctx, ['-i', s.abs, '-map', '0:a:0', '-af', second, '-ar', String(s.info.sampleRate || 48000), ...enc.args, ctx.abs(media)], { duration: s.info.duration, range: [0.45, 1], stage: 'normalising' });
    const m2 = parse(log);
    return { media, loudness: { input: { i: +m1.input_i, tp: +m1.input_tp, lra: +m1.input_lra }, output: { i: +m2.output_i, tp: +m2.output_tp, lra: +m2.output_lra }, mode: m2.normalization_type } };
  },
});

defineOp({
  id: 'denoise',
  title: 'Denoise audio',
  category: 'audio',
  cost: 'fast',
  description: 'Reduce steady background noise (hiss, hum, fan, room tone) in a voice/audio track. method=afftdn (FFT spectral denoiser, adapts to the noise; `strength` = dB of reduction, 6–20 is natural, more sounds watery). arnndn = RNN voice denoiser, needs an .rnnn model file in the project (e.g. from github.com/GregorR/rnnoise-models) passed as `model`. highpass removes rumble below N Hz. Video input keeps the picture.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    method: { type: 'enum', label: 'Method', values: ['afftdn', 'arnndn'], default: 'afftdn' },
    strength: { type: 'number', label: 'Reduction dB', min: 1, max: 60, default: 12 },
    noiseFloor: { type: 'number', label: 'Noise floor dB', min: -80, max: 0, default: 0, description: '0 = auto: measured from the quietest 50 ms windows (pauses); set e.g. −45 if the track has no pauses' },
    highpass: { type: 'number', label: 'High-pass Hz', min: 0, max: 400, default: 80, description: '0 = off' },
    model: { type: 'string', label: 'RNN model (.rnnn)', default: '', description: 'arnndn only: project-relative path to the model file' },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    let dn: string;
    if (p.method === 'arnndn') {
      if (!p.model) throw uerr('arnndn needs an .rnnn model file (put one in the project and pass model:"…"), or use method afftdn');
      const m = ctx.abs(p.model);
      if (!fs.existsSync(m)) throw uerr('Model file not found: {file}', { file: p.model });
      dn = `arnndn=m='${m.replace(/'/g, "\\'").replace(/:/g, '\\:')}'`;
    } else {
      let nf = p.noiseFloor;
      if (!nf) {
        // auto: 10th percentile of 50 ms RMS levels ≈ the noise in pauses; afftdn wants nf at (just above) that level
        const log = await ffmpegAnalyze(ctx, ['-i', s.abs, '-map', '0:a:0', '-af', `aresample=48000,asetnsamples=n=2400,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level,ametadata=print:key=lavfi.astats.Overall.RMS_level`, '-f', 'null', '-'], { duration: s.info.duration, range: [0, 0.3], stage: 'measuring noise' });
        const lv = [...log.matchAll(/RMS_level=(-?[\d.]+)/g)].map((m) => Number(m[1])).filter((x) => Number.isFinite(x) && x > -120).sort((a, b) => a - b);
        nf = lv.length ? Math.max(-80, Math.min(-20, lv[Math.floor(lv.length * 0.1)] + 2)) : -50;
      }
      dn = `afftdn=nr=${p.strength}:nf=${nf.toFixed(1)}`;
    }
    const af = [p.highpass > 0 ? `highpass=f=${p.highpass}` : '', dn].filter(Boolean).join(',');
    const enc = avOut(p.media, s.isVideo);
    const media = ctx.out('denoised', enc.ext);
    await ffmpeg(ctx, ['-i', s.abs, '-map', '0:a:0', '-af', af, ...enc.args, ctx.abs(media)], { duration: s.info.duration, range: [0.3, 1], stage: 'denoising' });
    return { media };
  },
});

defineOp({
  id: 'remove_silence',
  title: 'Remove silence (jump cut)',
  category: 'audio',
  cost: 'medium',
  description: 'Cut out pauses longer than `minSilence` seconds where the sound is below `threshold` dB — from audio, or from video (picture is cut at the same places: talking-head jump cuts). `padding` keeps a little air around speech. Returns the kept segments (source seconds) so you can re-time captions/graphics. Raise threshold (e.g. −30) for noisy recordings.',
  limits: '≤ 400 kept segments',
  timeoutSec: 1800,
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    threshold: { type: 'number', label: 'Silence below dB', min: -80, max: -10, default: -40 },
    minSilence: { type: 'number', label: 'Min pause s', min: 0.1, max: 10, step: 0.05, default: 0.6 },
    padding: { type: 'number', label: 'Padding s', min: 0, max: 1, step: 0.01, default: 0.12 },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' }, segments: { kind: 'json', description: '{kept:[[start,end]…] in source seconds, removed: seconds, duration}' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const D = s.info.duration;
    const log = await ffmpegAnalyze(ctx, ['-i', s.abs, '-map', '0:a:0', '-af', `silencedetect=noise=${p.threshold}dB:d=${p.minSilence}`, '-f', 'null', '-'], { duration: D, range: [0, 0.3], stage: 'detecting silence' });
    const sil: [number, number][] = [];
    let open: number | null = null;
    for (const line of log.split('\n')) {
      const a = /silence_start: (-?[\d.]+)/.exec(line); if (a) open = Math.max(0, Number(a[1]));
      const b = /silence_end: ([\d.]+)/.exec(line); if (b && open != null) { sil.push([open, Number(b[1])]); open = null; }
    }
    if (open != null) sil.push([open, D]);
    // kept = complement of (silence shrunk by padding)
    const kept: [number, number][] = [];
    let t = 0;
    for (const [a, b] of sil) {
      // no padding at the file edges (leading/trailing silence is removed completely)
      const ca = a <= 0.01 ? 0 : a + p.padding, cb = b >= D - 0.01 ? D : b - p.padding;
      if (cb - ca <= 0.05) continue;
      if (ca > t + 0.02) kept.push([+t.toFixed(3), +ca.toFixed(3)]);
      t = cb;
    }
    if (D - t > 0.02) kept.push([+t.toFixed(3), +D.toFixed(3)]);
    if (!kept.length) throw uerr('{file} is silent at {db} dB — lower the threshold', { file: p.media, db: p.threshold });
    if (kept.length > 400) throw uerr('Too many cuts ({n}) — raise minSilence or lower the threshold', { n: kept.length });
    const keptDur = kept.reduce((x, [a, b]) => x + b - a, 0);
    const expr = kept.map(([a, b]) => `between(t\\,${a}\\,${b})`).join('+');
    const script = path.join(ctx.tmp(), 'filter.txt');
    const vf = s.isVideo ? `[0:v]select='${expr}',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2[v];` : '';
    fs.writeFileSync(script, `${vf}[0:a]aselect='${expr}',asetpts=N/SR/TB[a]`);
    let enc: { ext: string; args: string[] };
    if (s.isVideo) {
      const webm = /\.webm$/i.test(p.media);
      enc = webm ? { ext: 'webm', args: ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1', '-c:a', 'libopus'] } : { ext: 'mp4', args: [...MP4, '-c:a', 'aac', '-b:a', '192k'] };
    } else { const e = audioEncoder(path.extname(p.media)); enc = { ext: e.ext, args: e.args }; }
    const media = ctx.out('nosilence', enc.ext);
    await ffmpeg(ctx, ['-i', s.abs, ...filterComplexFileArgs(script), ...(s.isVideo ? ['-map', '[v]'] : []), '-map', '[a]', ...enc.args, ctx.abs(media)], { duration: keptDur, range: [0.3, 1], stage: 'cutting' });
    return { media, segments: { kept, removed: +(D - keptDur).toFixed(3), duration: +keptDur.toFixed(3), cuts: Math.max(0, kept.length - 1) } };
  },
});

const DUCK = { light: { threshold: 0.1, ratio: 3 }, medium: { threshold: 0.05, ratio: 6 }, strong: { threshold: 0.025, ratio: 14 } } as const;

defineOp({
  id: 'duck',
  title: 'Duck music under voice',
  category: 'audio',
  cost: 'fast',
  description: 'Automatically lower a music track wherever a voice track is speaking (sidechain compression) → a new music file of the same length that you put on the music track instead of the original (keep its volume at ~0.8–1). voiceStart = where the voice begins relative to the music start (match the timeline offset). amount light|medium|strong; release = how fast music comes back after speech (ms). mix=true also renders music+voice together.',
  inputs: {
    music: { type: 'file', label: 'Music', accept: ['audio'], required: true },
    voice: { type: 'file', label: 'Voice', accept: AV, required: true },
    voiceStart: { type: 'number', label: 'Voice offset s', min: 0, default: 0 },
    amount: { type: 'enum', label: 'Amount', values: ['light', 'medium', 'strong'], default: 'medium' },
    attack: { type: 'number', label: 'Attack ms', min: 1, max: 500, default: 20 },
    release: { type: 'number', label: 'Release ms', min: 20, max: 3000, default: 400 },
    mix: { type: 'boolean', label: 'Also render mix', default: false },
  },
  outputs: { music: { kind: 'audio', description: 'ducked music' }, mix: { kind: 'audio', optional: true, description: 'ducked music + voice' } },
  async run(ctx, p: any) {
    const m = await withAudio(ctx, p.music), v = await withAudio(ctx, p.voice);
    const D = m.info.duration;
    const { threshold, ratio } = DUCK[p.amount as keyof typeof DUCK];
    const ms = Math.round(p.voiceStart * 1000);
    // keep the music's own layout (a mono→stereo rematrix would lower it by 3 dB); the voice follows it
    const layout = m.info.channels === 1 ? 'mono' : 'stereo';
    const norm = `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=${layout}`;
    const enc = audioEncoder(path.extname(p.music));
    const music = ctx.out('ducked', enc.ext);
    const comp = `sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=${p.attack}:release=${p.release}:makeup=1:link=maximum:detection=rms`;
    // both sides padded (sidechaincompress drops the last partial frame otherwise); -t cuts at the music length
    const head = `[0:a]${norm},apad[mu];[1:a]${norm},adelay=${ms}|${ms},apad[vo]`;
    const fc = p.mix
      ? `${head};[vo]asplit[sc][vm];[mu][sc]${comp},asplit[d1][d2];[d2][vm]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[mx]`
      : `${head};[mu][vo]${comp}[d1]`;
    const outs: Record<string, string> = { music };
    const args = ['-i', m.abs, '-i', v.abs, '-filter_complex', fc, '-map', '[d1]', '-t', String(D), ...enc.args, ctx.abs(music)];
    if (p.mix) { outs.mix = ctx.out('duckmix', enc.ext); args.push('-map', '[mx]', '-t', String(D), ...enc.args, ctx.abs(outs.mix)); }
    await ffmpeg(ctx, args, { duration: D, stage: 'ducking' });
    return outs;
  },
});
