// Voice ops — processing of a recorded voice (the author's narration, an interview, a talking head):
//   voice_polish     the whole chain in the right order, with a before/after report (what the teleprompter runs on every take)
//   trim_silence     cut the silence before the first and after the last word
//   declick          mouth clicks / pops
//   voice_eq         rumble cut, mud cut, presence, air
//   compress         compressor + limiter (level-relative threshold)
//   deess            split-band de-esser
//   reduce_breaths   downward expander that turns breaths down between phrases
//   voice_isolate    ElevenLabs Voice Isolator (cloud, paid) for bad rooms / loud backgrounds
// Thresholds are set relative to the measured loudness of the file, so the ops behave the same on a quiet and on a hot recording.
import fs from 'node:fs';
import path from 'node:path';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { ffmpeg, ffmpegAnalyze, audioEncoder, type FfOpts } from '../ff.ts';
import { withAudio, avOut } from './audio.ts';
import { voiceLevels, speechBounds, regionLevel, quietRegion } from '../../voice/levels.ts';
import { apiKey } from '../../voice/elevenlabs.ts';

const AV = ['audio', 'video'] as ('audio' | 'video')[];
const lin = (dB: number) => Math.pow(10, dB / 20).toFixed(5);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : -99; };

export interface Loudness { i: number; tp: number; lra: number; thresh: number; offset: number }
/** integrated loudness (LUFS), true peak (dBTP) and loudness range of a file — EBU R128 via ffmpeg loudnorm */
export async function loudness(ctx: OpContext, abs: string, o: FfOpts = {}): Promise<Loudness> {
  const log = await ffmpegAnalyze(ctx, ['-i', abs, '-map', '0:a:0', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], o);
  const m = log.lastIndexOf('{');
  if (m < 0) throw new Error('loudnorm produced no measurement');
  const j = JSON.parse(log.slice(m, log.indexOf('}', m) + 1));
  return { i: num(j.input_i), tp: num(j.input_tp), lra: num(j.input_lra), thresh: num(j.input_thresh), offset: num(j.target_offset) };
}

// ---------- filter builders (levels in dB; `ref` = integrated loudness of the signal entering the filter) ----------
// noise stage = spectral denoiser + a soft expander that lowers what is left of the room in the pauses.
// Measured on a voice over pink room noise: the denoiser alone gives ~9 dB (and only when its floor is set ~8 dB above the
// measured noise), the expander ~7 dB more in the pauses — together they outweigh what the compressor brings back up.
const DENOISE: Record<string, { nr: number; up: number; range: number }> = { light: { nr: 8, up: 6, range: -6 }, normal: { nr: 12, up: 8, range: -10 }, strong: { nr: 20, up: 10, range: -14 } };
/** `noise` = level of the room in the signal entering the filter (dBFS RMS) */
const denoiseF = (noise: number, mode: string) => {
  const d = DENOISE[mode] || DENOISE.normal;
  return [`afftdn=nr=${d.nr}:nf=${clamp(noise + d.up, -80, -20).toFixed(1)}`, `agate=mode=downward:threshold=${lin(clamp(noise + 2, -70, -24))}:ratio=2:range=${lin(d.range)}:attack=5:release=200:knee=4:detection=rms`];
};
const COMP: Record<string, { rel: number; ratio: number }> = { light: { rel: 2, ratio: 2 }, normal: { rel: -2, ratio: 3 }, strong: { rel: -6, ratio: 4.5 } };
const DEESS: Record<string, number> = { light: -5, normal: -9, strong: -13 };
const DECLICK: Record<string, number> = { light: 6, normal: 4, strong: 2 };

const declickF = (strength: string) => `adeclick=w=55:o=75:a=2:t=${DECLICK[strength] ?? 4}:b=2`;
const eqF = (p: { mud: number; presence: number; air: number }) => [
  p.mud ? `equalizer=f=250:t=q:w=1:g=${p.mud}` : '',
  p.presence ? `equalizer=f=4000:t=q:w=0.9:g=${p.presence}` : '',
  p.air ? `treble=g=${p.air}:f=10000` : '',
].filter(Boolean);
const compF = (ref: number, amount: string) => { const c = COMP[amount] || COMP.normal; return `acompressor=threshold=${lin(ref + c.rel)}:ratio=${c.ratio}:attack=8:release=160:knee=4:detection=rms`; };
const limitF = (ceil: number) => `alimiter=limit=${lin(ceil)}:attack=5:release=50:level=0`;
const breathF = (ref: number, reduction: number, depth = 16) => `agate=mode=downward:threshold=${lin(ref - depth)}:ratio=2:range=${lin(-Math.abs(reduction))}:attack=10:release=180:knee=4:detection=rms`;
/** split-band de-esser: only the band above `split` Hz is compressed (fast, peak-detecting), then summed back — the rest of the voice is untouched */
const deessG = (inL: string, outL: string, ref: number, strength: string, split = 5500) =>
  `${inL}acrossover=split=${split}:order=4th[dslo][dshi];[dshi]acompressor=threshold=${lin(ref + (DEESS[strength] ?? -9))}:ratio=4:attack=1:release=60:knee=2:detection=peak[dshc];[dslo][dshc]amix=inputs=2:normalize=0${outL}`;

/** run one filter graph `[0:a]…[o]` over the sound of a file; video keeps its picture */
async function process(ctx: OpContext, rel: string, name: string, graph: string, stage: string) {
  const s = await withAudio(ctx, rel);
  const enc = avOut(rel, s.isVideo);
  const media = ctx.out(name, enc.ext);
  await ffmpeg(ctx, ['-i', s.abs, '-filter_complex', graph, '-map', '[o]', ...enc.args, ctx.abs(media)], { duration: s.info.duration, stage });
  return { media, s };
}

/** two-pass loudnorm to a target; returns what was reached */
async function normalizeTo(ctx: OpContext, absIn: string, absOut: string, encArgs: string[], target: number, tp: number, duration: number, range: [number, number]) {
  const base = `loudnorm=I=${target}:TP=${tp}:LRA=11`;
  const mid = range[0] + (range[1] - range[0]) * 0.4;
  const log1 = await ffmpegAnalyze(ctx, ['-i', absIn, '-map', '0:a:0', '-af', `${base}:print_format=json`, '-f', 'null', '-'], { duration, range: [range[0], mid], stage: 'measuring loudness' });
  const a = log1.lastIndexOf('{');
  const j1 = JSON.parse(log1.slice(a, log1.indexOf('}', a) + 1));
  if (!(num(j1.input_i) > -70)) throw uerr('The recording is silent — nothing to normalise');
  const second = `${base}:measured_I=${j1.input_i}:measured_TP=${j1.input_tp}:measured_LRA=${j1.input_lra}:measured_thresh=${j1.input_thresh}:offset=${j1.target_offset}:linear=true:print_format=json`;
  const normed = absOut + '.norm.wav';
  const log2 = await ffmpegAnalyze(ctx, ['-i', absIn, '-map', '0:a:0', '-af', second, '-ar', '48000', '-c:a', 'pcm_f32le', '-f', 'wav', normed], { duration, range: [mid, range[1]], stage: 'normalising' });
  const b = log2.lastIndexOf('{');
  const j2 = JSON.parse(log2.slice(b, log2.indexOf('}', b) + 1));
  // loudnorm misses the target on short takes (a few seconds): measure what came out and trim the difference with plain gain,
  // a limiter holding the ceiling
  const got = await loudness(ctx, normed);
  const fix = got.i > -70 ? clamp(target - got.i, -6, 6) : 0;
  const af = Math.abs(fix) >= 0.3 ? `volume=${fix.toFixed(2)}dB,alimiter=limit=${lin(tp)}:attack=5:release=50:level=0` : 'anull';
  await ffmpeg(ctx, ['-i', normed, '-af', af, '-ar', '48000', ...encArgs, absOut]);
  fs.rmSync(normed, { force: true });
  return { mode: String(j2.normalization_type || ''), i: num(j2.output_i), tp: num(j2.output_tp), inputI: num(j1.input_i) };
}

/** ElevenLabs Voice Isolator: upload the sound, get the voice without the room / background. Paid: 1000 characters per minute of audio. */
async function isolateVoice(ctx: OpContext, abs: string, outWav: string, range: [number, number] = [0, 1]) {
  const key = apiKey();
  if (!key) throw uerr('Voice isolation needs an ElevenLabs key: add it in Settings, or use another noise mode.');
  const tmp = ctx.tmp();
  const up = path.join(tmp, 'isolate-in.flac');
  await ffmpeg(ctx, ['-i', abs, '-map', '0:a:0', '-vn', '-c:a', 'flac', up], { range: [range[0], range[0] + (range[1] - range[0]) * 0.1], stage: 'preparing upload' });
  if (fs.statSync(up).size > 480 * 1024 * 1024) throw uerr('The recording is too long for voice isolation (limit: 500 MB / 1 hour)');
  ctx.progress(range[0] + (range[1] - range[0]) * 0.15, 'isolating voice (ElevenLabs)');
  const fd = new FormData();
  fd.append('audio', new Blob([fs.readFileSync(up)], { type: 'audio/flac' }), 'voice.flac');
  const res = await fetch('https://api.elevenlabs.io/v1/audio-isolation', { method: 'POST', headers: { 'xi-api-key': key }, body: fd, signal: ctx.signal });
  if (!res.ok) {
    let m = `${res.status} ${res.statusText}`;
    try { const j: any = await res.json(); m = j?.detail?.message || j?.detail?.status || (typeof j?.detail === 'string' ? j.detail : m); } catch {}
    throw uerr('ElevenLabs voice isolation failed: {error}', { error: m }, 502);
  }
  const raw = path.join(tmp, 'isolate-out.bin');
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  await ffmpeg(ctx, ['-i', raw, '-vn', '-ar', '48000', '-c:a', 'pcm_s24le', outWav], { range: [range[0] + (range[1] - range[0]) * 0.9, range[1]], stage: 'decoding' });
  ctx.provenance({ provider: 'elevenlabs', model: 'audio-isolation' });
  return outWav;
}

const facts = (l: Loudness, lv: { noiseDb: number; snrDb: number; duration: number }) => ({ lufs: +l.i.toFixed(1), truePeak: +l.tp.toFixed(1), lra: +l.lra.toFixed(1), noiseFloor: lv.noiseDb, snr: lv.snrDb, duration: lv.duration });

defineOp({
  id: 'voice_polish',
  title: 'Voice polish (full chain)',
  category: 'audio',
  cost: 'medium',
  version: 5,
  description: 'One-step clean-up of a recorded voice (the author\'s narration from the teleprompter, an interview, a voice memo): trim silence at the edges → rumble cut → declick → noise reduction → (breaths) → EQ → compressor → de-esser → two-pass loudness normalisation with a true-peak ceiling. Thresholds follow the measured level of the file. Returns a report {before, after: {lufs, truePeak, lra, noiseFloor, snr, duration}, trimmed, steps, noiseMeasured} — read it instead of guessing (noiseFloor is measured in the longest pause of the recording, before and after the same chain; noiseMeasured=false means there was no pause ≥ 0.7 s and the figure is a rough estimate). Defaults suit a decent USB mic in a room; noise=strong for a laptop mic or a fan; noise=isolate sends the audio to ElevenLabs Voice Isolator (cloud, paid ≈ 1000 characters per minute, needs the key) — only for bad rooms / loud backgrounds and only when the user agreed. Audio input (for a video run extract_audio first).',
  inputs: {
    media: { type: 'file', label: 'Voice recording', accept: ['audio'], required: true },
    trim: { type: 'boolean', label: 'Trim silence at the edges', default: true },
    noise: { type: 'enum', label: 'Noise reduction', values: ['off', 'light', 'normal', 'strong', 'isolate'], default: 'normal', description: 'light/normal/strong = local spectral denoiser (8/12/20 dB) + a soft expander in the pauses (−6/−10/−14 dB); isolate = ElevenLabs Voice Isolator (cloud, paid)' },
    declick: { type: 'boolean', label: 'Remove clicks', default: true },
    breaths: { type: 'boolean', label: 'Turn breaths down', default: false, description: 'expander between phrases (−10 dB); can soften quiet word endings — check by ear' },
    eq: { type: 'boolean', label: 'EQ (rumble cut + clarity)', default: true },
    compress: { type: 'enum', label: 'Compressor', values: ['off', 'light', 'normal', 'strong'], default: 'normal' },
    deess: { type: 'boolean', label: 'De-esser', default: true },
    target: { type: 'number', label: 'Target LUFS', min: -30, max: -9, step: 0.5, default: -16, description: '−16 for a voice that sits over music in a −14 LUFS mix; −14 for voice-only videos' },
    truePeak: { type: 'number', label: 'True peak dBTP', min: -6, max: -0.1, step: 0.1, default: -1.5 },
    padding: { type: 'number', label: 'Air around speech s', min: 0, max: 1, step: 0.01, default: 0.15 },
  },
  outputs: { media: { kind: 'audio' }, report: { kind: 'json', description: '{before:{lufs,truePeak,lra,noiseFloor,snr,duration}, after:{…}, trimmed:{start,end}, steps:[…], mode, noiseMeasured}' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const tmp = ctx.tmp();
    ctx.progress(0.02, 'measuring');
    const lv0 = await voiceLevels(s.abs);
    const l0 = await loudness(ctx, s.abs, { duration: s.info.duration, range: [0.02, 0.1] });
    if (!(l0.i > -70) || !lv0.voiced.length) throw uerr('{file} is silent — nothing to process', { file: p.media });
    const steps: string[] = [];
    let src = s.abs, lv = lv0, li = l0;
    if (p.noise === 'isolate') {
      src = await isolateVoice(ctx, s.abs, path.join(tmp, 'isolated.wav'), [0.1, 0.4]);
      lv = await voiceLevels(src);
      li = await loudness(ctx, src);
      steps.push('voice isolation (ElevenLabs)');
    }
    const b = p.trim ? speechBounds(lv, p.padding) : { start: 0, end: lv.duration };
    const D = Math.max(0.1, b.end - b.start);
    // bring the speech to a nominal −20 LUFS first, so every threshold below means the same thing on any recording
    const REF = -20;
    const pre = clamp(REF - li.i, -24, 40);
    const head: string[] = [];
    if (p.trim && (b.start > 0.01 || b.end < lv.duration - 0.01)) { head.push(`atrim=start=${b.start}:end=${b.end}`, 'asetpts=PTS-STARTPTS'); steps.push(`trim ${b.start.toFixed(2)} s + ${(lv.duration - b.end).toFixed(2)} s`); }
    const chain: string[] = ['aresample=48000', `volume=${pre.toFixed(2)}dB`];
    if (p.eq) { chain.push('highpass=f=80:poles=2'); steps.push('high-pass 80 Hz'); }
    if (p.declick) { chain.push(declickF('normal')); steps.push('declick'); }
    if (DENOISE[p.noise]) { chain.push(...denoiseF(lv.noiseDb + pre, p.noise)); steps.push(`denoise ${DENOISE[p.noise].nr} dB + expander ${DENOISE[p.noise].range} dB in pauses`); }
    if (p.breaths) { chain.push(breathF(REF, 10)); steps.push('breaths −10 dB'); }
    if (p.eq) { chain.push(...eqF({ mud: -1.5, presence: 2.5, air: 1 })); steps.push('EQ −1.5 dB @250 Hz, +2.5 dB @4 kHz, +1 dB air'); }
    if (p.compress !== 'off') { chain.push(compF(REF, p.compress)); steps.push(`compressor ${COMP[p.compress].ratio}:1`); }
    if (p.deess) steps.push('de-esser');
    /** the chain over [0:a] → [o]; `first` = filters put in front (trim), `last` = behind (fades) */
    const graph = (first: string[], last: string[]) => p.deess
      ? `[0:a]${[...first, ...chain].join(',')}[pre];${deessG('[pre]', last.length ? '[de]' : '[o]', REF, 'normal')}${last.length ? `;[de]${last.join(',')}[o]` : ''}`
      : `[0:a]${[...first, ...chain, ...last].join(',')}[o]`;
    const staged = path.join(tmp, 'chain.wav');
    await ffmpeg(ctx, ['-i', src, '-filter_complex', graph(head, ['afade=t=in:st=0:d=0.015', `afade=t=out:st=${Math.max(0, D - 0.04).toFixed(3)}:d=0.04`]), '-map', '[o]', '-c:a', 'pcm_f32le', staged], { duration: D, range: [0.4, 0.7], stage: 'processing' });
    const enc = audioEncoder(path.extname(p.media));
    const media = ctx.out('voice', enc.ext);
    const n = await normalizeTo(ctx, staged, ctx.abs(media), ['-vn', ...enc.args], p.target, p.truePeak, D, [0.7, 0.95]);
    steps.push(`loudness ${p.target} LUFS, peak ≤ ${p.truePeak} dBTP`);
    const l1 = await loudness(ctx, ctx.abs(media));
    const lv1 = await voiceLevels(ctx.abs(media));
    // Noise before/after, measured in the same place: the longest pause of the recording (no words in it).
    // The pause goes through the same chain and gets the same final gain. A trimmed take has no such pause left,
    // and its quietest windows are quiet speech — so the output file itself cannot tell us its noise floor.
    const before = facts(l0, lv0), after = facts(l1, lv1);
    const q0 = quietRegion(lv0), q = quietRegion(lv);
    let noiseMeasured = false;
    if (q0 && q) {
      const probe = path.join(tmp, 'pause.wav');
      await ffmpeg(ctx, ['-i', src, '-filter_complex', graph([`atrim=start=${q[0]}:end=${q[1]}`, 'asetpts=PTS-STARTPTS'], []), '-map', '[o]', '-c:a', 'pcm_f32le', probe]);
      const raw = await regionLevel(s.abs, [q0]);
      const out = await regionLevel(probe, [[0.35, q[1] - q[0]]]); // the filters settle in the first 0.35 s
      if (raw != null && out != null) {
        noiseMeasured = true;
        before.noiseFloor = raw; before.snr = +(lv0.speechDb - raw).toFixed(1);
        after.noiseFloor = +(out + (l1.i - n.inputI)).toFixed(1); after.snr = +(lv1.speechDb - after.noiseFloor).toFixed(1);
      }
    }
    return { media, report: { before, after, trimmed: { start: b.start, end: +(lv.duration - b.end).toFixed(3) }, steps, mode: n.mode, noiseMeasured } };
  },
});

defineOp({
  id: 'trim_silence',
  title: 'Trim silence at the edges',
  category: 'audio',
  cost: 'fast',
  description: 'Cut the silence (room tone, the click of the record button) before the first and after the last word of a voice recording; pauses inside stay (for those use remove_silence). The speech is found from the measured noise floor, so no threshold to tune; `padding` keeps a little air. Returns what was cut — shift word timings by `start` if you had any.',
  inputs: {
    media: { type: 'file', label: 'Voice recording', accept: ['audio'], required: true },
    padding: { type: 'number', label: 'Air around speech s', min: 0, max: 1, step: 0.01, default: 0.15 },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' }, trimmed: { kind: 'json', description: '{start, end: seconds removed at each edge, duration}' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const lv = await voiceLevels(s.abs);
    if (!lv.voiced.length) throw uerr('{file} is silent — nothing to trim', { file: p.media });
    const b = speechBounds(lv, p.padding);
    const D = b.end - b.start;
    const enc = audioEncoder(path.extname(p.media));
    const media = ctx.out('trim', enc.ext);
    const af = `atrim=start=${b.start}:end=${b.end},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.015,afade=t=out:st=${Math.max(0, D - 0.04).toFixed(3)}:d=0.04`;
    await ffmpeg(ctx, ['-i', s.abs, '-map', '0:a:0', '-vn', '-af', af, ...enc.args, ctx.abs(media)], { duration: D, stage: 'trimming' });
    return { media, trimmed: { start: b.start, end: +(lv.duration - b.end).toFixed(3), duration: +D.toFixed(3) } };
  },
});

defineOp({
  id: 'declick',
  title: 'Remove clicks',
  category: 'audio',
  cost: 'medium',
  description: 'Remove mouth clicks, lip smacks and small pops from a voice (ffmpeg adeclick: the damaged samples are re-synthesised from their neighbours). strength light|normal|strong — strong can dull hard consonants (t, k, p); use it only when clicks are still audible. Video input keeps the picture.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    strength: { type: 'enum', label: 'Strength', values: ['light', 'normal', 'strong'], default: 'normal' },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' } },
  async run(ctx, p: any) {
    const { media } = await process(ctx, p.media, 'declick', `[0:a]${declickF(p.strength)}[o]`, 'removing clicks');
    return { media };
  },
});

defineOp({
  id: 'voice_eq',
  title: 'Voice EQ',
  category: 'audio',
  cost: 'fast',
  description: 'Equaliser for a spoken voice: high-pass (rumble, desk bumps, plosive thump below the voice), a cut at 250 Hz against boxy/muddy rooms, a presence lift at 4 kHz for intelligibility over music, an air shelf at 10 kHz. Gains in dB (0 = off); keep changes within ±4 dB — more sounds processed. A dull laptop/phone mic: presence 3–4, air 2. A harsh condenser: presence 0–1, then deess. Video input keeps the picture.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    highpass: { type: 'number', label: 'High-pass Hz', min: 0, max: 300, default: 80, description: '0 = off; 80 for most voices, 100–120 for a thin voice or a boomy room' },
    mud: { type: 'number', label: '250 Hz dB', min: -9, max: 6, step: 0.5, default: -1.5 },
    presence: { type: 'number', label: '4 kHz dB', min: -6, max: 9, step: 0.5, default: 2.5 },
    air: { type: 'number', label: '10 kHz shelf dB', min: -6, max: 9, step: 0.5, default: 1 },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' } },
  async run(ctx, p: any) {
    const f = [p.highpass > 0 ? `highpass=f=${p.highpass}:poles=2` : '', ...eqF(p)].filter(Boolean);
    if (!f.length) throw uerr('Nothing to do: every band is 0');
    const { media } = await process(ctx, p.media, 'eq', `[0:a]${f.join(',')}[o]`, 'equalising');
    return { media };
  },
});

defineOp({
  id: 'compress',
  title: 'Compressor + limiter',
  category: 'audio',
  cost: 'fast',
  description: 'Even out a voice: loud words come down, so after normalisation the quiet ones are heard — the voice sounds denser and does not sink under music. amount light (2:1) | normal (3:1) | strong (4.5:1, radio/ads); the threshold follows the measured loudness of the file. A limiter then stops stray peaks at `ceiling` dBTP. Loudness drops a little: run normalize (or voice_polish) afterwards. Returns loudness before/after. Do not stack it on an already compressed voice (LRA below ~4 LU). Video input keeps the picture.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    amount: { type: 'enum', label: 'Amount', values: ['light', 'normal', 'strong'], default: 'normal' },
    ceiling: { type: 'number', label: 'Limiter ceiling dB', min: -9, max: -0.1, step: 0.1, default: -1 },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' }, loudness: { kind: 'json', description: '{input:{i,tp,lra}, output:{i,tp,lra}}' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const l0 = await loudness(ctx, s.abs, { duration: s.info.duration, range: [0, 0.3], stage: 'measuring' });
    if (!(l0.i > -70)) throw uerr('{file} is silent — nothing to compress', { file: p.media });
    const { media } = await process(ctx, p.media, 'comp', `[0:a]${compF(l0.i, p.amount)},${limitF(p.ceiling)}[o]`, 'compressing');
    const l1 = await loudness(ctx, ctx.abs(media));
    return { media, loudness: { input: { i: l0.i, tp: l0.tp, lra: l0.lra }, output: { i: l1.i, tp: l1.tp, lra: l1.lra } } };
  },
});

defineOp({
  id: 'deess',
  title: 'De-esser',
  category: 'audio',
  cost: 'fast',
  description: 'Tame harsh "s", "sh", "ch", "ц", "щ": only the band above `split` Hz is compressed when sibilants jump out, the body of the voice is untouched. strength light|normal|strong (strong can make the speaker lisp). Run it AFTER compression and presence/air EQ — they are what makes sibilants stick out. split 5500 Hz fits most voices; 4500 for a low male voice, 6500 for a high one. Video input keeps the picture.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    strength: { type: 'enum', label: 'Strength', values: ['light', 'normal', 'strong'], default: 'normal' },
    split: { type: 'number', label: 'Split Hz', min: 3000, max: 9000, step: 100, default: 5500 },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const l0 = await loudness(ctx, s.abs, { duration: s.info.duration, range: [0, 0.3], stage: 'measuring' });
    if (!(l0.i > -70)) throw uerr('{file} is silent — nothing to process', { file: p.media });
    const { media } = await process(ctx, p.media, 'deess', deessG('[0:a]', '[o]', l0.i, p.strength, p.split), 'de-essing');
    return { media };
  },
});

defineOp({
  id: 'reduce_breaths',
  title: 'Turn breaths down',
  category: 'audio',
  cost: 'fast',
  description: 'Lower breaths and room tone between phrases with a downward expander (not a hard gate, so it does not chop): everything quieter than `sensitivity` dB below the speech level is turned down by up to `reduction` dB. It is level-based, not a breath detector: quiet word endings and soft consonants can go down too — listen to the result (or watch_video / analyze) and lower sensitivity if words lose their tails. Keep reduction ≤ 12: fully removed breaths sound unnatural. Video input keeps the picture.',
  inputs: {
    media: { type: 'file', label: 'Audio or video', accept: AV, required: true },
    reduction: { type: 'number', label: 'Reduction dB', min: 3, max: 24, default: 10 },
    sensitivity: { type: 'number', label: 'Below speech by dB', min: 8, max: 30, default: 16, description: 'smaller = more is treated as a breath' },
  },
  outputs: { media: { kind: 'audio', sameAs: 'media' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const l0 = await loudness(ctx, s.abs, { duration: s.info.duration, range: [0, 0.3], stage: 'measuring' });
    if (!(l0.i > -70)) throw uerr('{file} is silent — nothing to process', { file: p.media });
    const { media } = await process(ctx, p.media, 'breaths', `[0:a]${breathF(l0.i, p.reduction, p.sensitivity)}[o]`, 'reducing breaths');
    return { media };
  },
});

defineOp({
  id: 'voice_isolate',
  title: 'Isolate voice (ElevenLabs)',
  category: 'audio',
  cost: 'medium',
  cache: true,
  description: 'ElevenLabs Voice Isolator: removes the room, street, music and other background from a voice — far stronger than denoise, for recordings a spectral denoiser cannot save. CLOUD and PAID: the audio is uploaded to ElevenLabs and costs ≈ 1000 characters of the user\'s quota per minute of audio; needs the ElevenLabs key from Settings. Use only when the user asked for it or agreed. Limit 500 MB / 1 hour. Output: 48 kHz WAV of the voice only (from a video: its sound track).',
  limits: '≤ 1 hour, ≤ 500 MB; paid',
  inputs: { media: { type: 'file', label: 'Audio or video', accept: AV, required: true } },
  outputs: { media: { kind: 'audio' } },
  async run(ctx, p: any) {
    const s = await withAudio(ctx, p.media);
    const media = ctx.out('isolated', 'wav');
    await isolateVoice(ctx, s.abs, ctx.abs(media));
    return { media };
  },
});
