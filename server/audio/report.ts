// Objective music QA: loudness (EBU R128 via ffmpeg), crest/PLR, spectral balance per band vs genre targets,
// stereo low end, per-section dynamics, static-arrangement detection, silences and endings.
// Every flag carries a concrete fix in the score API (m.channel / m.master / theory helpers).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { bin } from '../bin.ts';
import { cur } from '../project.ts';
import { readJson, safeJoin } from '../util.ts';
import { renderMusic } from '../render/music.ts';
import { decodePcm, analyzePcm } from './analyze.ts';

export type Severity = 'P0' | 'P1' | 'P2';
export interface ReportFlag { id: string; severity: Severity; message: string; fix: string }
export interface Section { name: string; start: number; end: number }
export interface ReportOptions {
  genre?: string;
  /** integrated loudness target (default −14 LUFS) */
  targetLufs?: number;
  /** the music will sit under voice-over: check the 1–4 kHz speech band */
  vo?: boolean;
  sections?: Section[];
  bpm?: number;
  beatsPerBar?: number;
  /** musical length (s) without the reverb tail */
  duration?: number;
}

// ---------------------------------------------------------------- bands & targets
/** analysis bands; level = average power per octave inside the band, in dB relative to the mid band (500–2k) */
export const BANDS = [
  { id: 'sub', lo: 20, hi: 60, label: '20–60 Hz' },
  { id: 'low', lo: 60, hi: 250, label: '60–250 Hz' },
  { id: 'lowmid', lo: 250, hi: 500, label: '250–500 Hz' },
  { id: 'mid', lo: 500, hi: 2000, label: '500 Hz–2 kHz' },
  { id: 'presence', lo: 2000, hi: 6000, label: '2–6 kHz' },
  { id: 'air', lo: 6000, hi: 16000, label: '6–16 kHz' },
] as const;
type BandId = (typeof BANDS)[number]['id'];
type Range = [number, number];
interface Target { bands: Partial<Record<BandId, Range>>; sectionRange: number; needsSub: boolean; crest: Range }

// Targets: per-octave level relative to the 500 Hz–2 kHz band. Calibrated on commercially mastered references
// (pink noise = 0 everywhere; finished mixes slope down ≈ 3–6 dB/oct above ~150 Hz) — see skills/studio-music-as-code/REFERENCE.md.
const T = (sub: Range, low: Range, lowmid: Range, presence: Range, air: Range, o: Partial<Target> = {}): Target =>
  ({ bands: { sub, low, lowmid, presence, air }, sectionRange: 3, needsSub: true, crest: [6, 19], ...o });
export const GENRE_TARGETS: Record<string, Target> = {
  pop:       T([-6, 9], [1, 12], [-2, 8], [-11, -1], [-21, -6]),
  corporate: T([-8, 8], [0, 11], [-2, 8], [-11, -1], [-20, -6]),
  house:     T([-2, 12], [2, 13], [-3, 7.5], [-12, -2], [-21, -4]),
  techno:    T([-2, 12], [2, 13], [-3, 7.5], [-12, -2], [-21, -4]),
  trap:      T([2, 16], [2, 14], [-4, 7.5], [-13, -2], [-22, -4]),
  hiphop:    T([-2, 14], [2, 13], [-3, 8], [-13, -2], [-23, -7]),
  dnb:       T([-2, 13], [1, 12], [-3, 7.5], [-12, -2], [-21, -4]),
  lofi:      T([-8, 10], [0, 12], [-2, 9], [-15, -3], [-30, -9], { crest: [6, 20] }),
  cinematic: T([-6, 14], [-1, 12], [-3, 9], [-14, -1], [-24, -6], { sectionRange: 5, crest: [7, 22] }),
  ambient:   T([-12, 10], [-3, 12], [-3, 9], [-16, -3], [-26, -7], { needsSub: false, sectionRange: 2, crest: [5, 22] }),
};
const GENRE_ALIAS: Record<string, string> = {
  'boom-bap': 'hiphop', boombap: 'hiphop', 'hip-hop': 'hiphop', 'lo-fi': 'lofi', chill: 'lofi', chillhop: 'lofi', edm: 'house', dance: 'house',
  trailer: 'cinematic', epic: 'cinematic', orchestral: 'cinematic', bed: 'ambient', explainer: 'ambient', underscore: 'ambient', calm: 'ambient',
  uplifting: 'corporate', rock: 'pop', synthwave: 'pop', funk: 'pop', 'drum&bass': 'dnb', afro: 'house', latin: 'hiphop', drill: 'trap',
};
export function resolveGenre(g?: string): string {
  const k = String(g || '').toLowerCase().trim();
  if (GENRE_TARGETS[k]) return k;
  if (GENRE_ALIAS[k]) return GENRE_ALIAS[k];
  for (const name of [...Object.keys(GENRE_TARGETS), ...Object.keys(GENRE_ALIAS)]) if (k && k.includes(name)) return GENRE_TARGETS[name] ? name : GENRE_ALIAS[name];
  return 'pop';
}

// ---------------------------------------------------------------- ffmpeg helpers
function ffmpeg(args: string[]): Promise<{ code: number; stderr: string; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), args);
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? 1, stderr: err, stdout: Buffer.concat(out) }));
  });
}
interface Loudness { integrated: number; lra: number; truePeak: number; momentary: { t: number; m: number; s: number }[] }
export async function ebur128(file: string): Promise<Loudness> {
  const r = await ffmpeg(['-hide_banner', '-nostats', '-v', 'verbose', '-i', file, '-vn', '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-']);
  if (r.code !== 0) throw new Error('ffmpeg ebur128 failed: ' + r.stderr.slice(-400));
  const momentary: Loudness['momentary'] = [];
  const re = /t:\s*([\d.]+)\s+TARGET:\S+\s+LUFS\s+M:\s*(-?[\d.]+)\s+S:\s*(-?[\d.]+)/g;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(r.stderr))) momentary.push({ t: +mt[1], m: +mt[2], s: +mt[3] });
  const sum = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (rx: RegExp) => { const x = rx.exec(sum); return x ? +x[1] : NaN; };
  return { integrated: num(/I:\s*(-?[\d.]+|-inf)\s*LUFS/), lra: num(/LRA:\s*(-?[\d.]+)\s*LU/), truePeak: num(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/), momentary };
}
function decodeStereo(file: string, sr: number): Promise<[Float32Array, Float32Array]> {
  return ffmpeg(['-v', 'error', '-i', file, '-vn', '-ac', '2', '-ar', String(sr), '-f', 'f32le', 'pipe:1']).then((r) => {
    if (r.code !== 0) throw new Error('ffmpeg decode failed: ' + r.stderr.slice(-400));
    const b = r.stdout;
    const all = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 0, Math.floor(b.byteLength / 4));
    const n = all.length >> 1, L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = all[2 * i]; R[i] = all[2 * i + 1]; }
    return [L, R];
  });
}

// ---------------------------------------------------------------- DSP
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const br = re[b] * cr - im[b] * ci, bi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - br; im[b] = im[a] - bi; re[a] += br; im[a] += bi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const db = (x: number) => 10 * Math.log10(x + 1e-20);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** long-term average power spectrum (Welch) of mid and side, restricted to [t0, t1) */
function spectra(L: Float32Array, R: Float32Array, sr: number, t0 = 0, t1 = Infinity, N = 8192) {
  const hop = N / 2, win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(L.length, Math.floor(Math.min(t1, L.length / sr) * sr));
  const mid = new Float64Array(N / 2), side = new Float64Array(N / 2);
  const re = new Float64Array(N), im = new Float64Array(N), re2 = new Float64Array(N), im2 = new Float64Array(N);
  let frames = 0;
  for (let o = a; o + N <= b; o += hop) {
    for (let i = 0; i < N; i++) { const l = L[o + i], r = R[o + i]; re[i] = ((l + r) / 2) * win[i]; im[i] = 0; re2[i] = ((l - r) / 2) * win[i]; im2[i] = 0; }
    fft(re, im); fft(re2, im2);
    for (let k = 0; k < N / 2; k++) { mid[k] += re[k] * re[k] + im[k] * im[k]; side[k] += re2[k] * re2[k] + im2[k] * im2[k]; }
    frames++;
  }
  if (frames) for (let k = 0; k < N / 2; k++) { mid[k] /= frames; side[k] /= frames; }
  return { mid, side, binHz: sr / N, frames };
}
function bandPower(spec: Float64Array, binHz: number, lo: number, hi: number) {
  let s = 0;
  for (let k = Math.max(1, Math.ceil(lo / binHz)); k * binHz < hi && k < spec.length; k++) s += spec[k];
  return s;
}
/** per-octave band levels relative to the mid band */
export function bandProfile(spec: Float64Array, binHz: number) {
  const perOct: Record<string, number> = {};
  for (const b of BANDS) perOct[b.id] = db(bandPower(spec, binHz, b.lo, b.hi) / Math.log2(b.hi / b.lo));
  const ref = perOct.mid;
  const rel: Record<string, number> = {};
  for (const b of BANDS) rel[b.id] = r1(perOct[b.id] - ref);
  return rel as Record<BandId, number>;
}

/** coarse log-band spectrogram (dB) of a mono signal: frames × 16 bands */
function bandGram(x: Float32Array, sr: number, N = 2048) {
  const hop = N / 2, edges: number[] = [];
  for (let i = 0; i <= 16; i++) edges.push(40 * Math.pow(11000 / 40, i / 16));
  const bins = edges.map((f) => Math.round((f * N) / sr));
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const re = new Float64Array(N), im = new Float64Array(N);
  const frames: Float64Array[] = [];
  for (let o = 0; o + N <= x.length; o += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const row = new Float64Array(16);
    for (let bnd = 0; bnd < 16; bnd++) { let s = 0; for (let k = bins[bnd]; k < Math.max(bins[bnd] + 1, bins[bnd + 1]); k++) s += re[k] * re[k] + im[k] * im[k]; row[bnd] = Math.max(-90, db(s)); }
    frames.push(row);
  }
  return { frames, fps: sr / hop };
}
function corr(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb + 1e-12);
}
const energyMean = (vals: number[]) => { const v = vals.filter((x) => x > -70); return v.length ? 10 * Math.log10(v.reduce((s, x) => s + Math.pow(10, x / 10), 0) / v.length) : -70; };

// ---------------------------------------------------------------- the report
export async function musicReport(file: string, opts: ReportOptions = {}) {
  const genre = resolveGenre(opts.vo && !opts.genre ? 'ambient' : opts.genre);
  const target = GENRE_TARGETS[genre];
  const targetLufs = opts.targetLufs ?? -14;
  const sr = 44100;
  const [loud, [L, R]] = await Promise.all([ebur128(file), decodeStereo(file, sr)]);
  const fileDur = L.length / sr;
  const dur = Math.min(fileDur, opts.duration || fileDur);
  const flags: ReportFlag[] = [];
  const flag = (id: string, severity: Severity, message: string, fix: string) => flags.push({ id, severity, message, fix });

  // ---- levels
  let peak = 0, sumSq = 0, clipRuns = 0, run = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
    if (a >= 0.999) { run++; if (run === 3) clipRuns++; } else run = 0;
  }
  const nDur = Math.floor(dur * sr);
  for (let i = 0; i < nDur; i++) { const mm = (L[i] + R[i]) / 2; sumSq += mm * mm; }
  const rmsDb = r1(20 * Math.log10(Math.sqrt(sumSq / Math.max(1, nDur)) + 1e-9));
  const peakDb = r1(20 * Math.log10(peak + 1e-9));
  const crest = r1(peakDb - rmsDb);
  const I = loud.integrated, TP = loud.truePeak;
  const plr = r1(TP - I);

  // ---- spectrum (musical part only) + stereo low end
  const sp = spectra(L, R, sr, 0, dur);
  const bands = bandProfile(sp.mid, sp.binHz);
  const lowMid = bandPower(sp.mid, sp.binHz, 20, 120), lowSide = bandPower(sp.side, sp.binHz, 20, 120);
  const allMid = bandPower(sp.mid, sp.binHz, 20, 16000), allSide = bandPower(sp.side, sp.binHz, 20, 16000);
  const lowSideDb = r1(db(lowSide) - db(lowMid));
  const widthDb = r1(db(allSide) - db(allMid));
  const voBand = r1(db(bandPower(sp.mid, sp.binHz, 1000, 4000) / 2) - db(bandPower(sp.mid, sp.binHz, 250, 1000) / 2));

  // ---- loudness flags
  if (!Number.isFinite(I) || I < -60) flag('silent', 'P0', 'The render is (almost) silent.', 'Check that every instrument is connected (m.inst.* / m.channel, or .connect(m.out)) and that notes are scheduled inside [0, duration).');
  else {
    const off = r1(I - targetLufs);
    if (off < -2) flag('too-quiet', Math.abs(off) > 5 ? 'P0' : 'P1', `Too quiet: ${r1(I)} LUFS integrated (target ${targetLufs}).`, `m.master({ preset: 'warm', lufs: ${targetLufs} }) — and if the peak is already near 0 dBFS the mix is peaky: compress drums (m.inst.drums('909', { mix: { comp: { threshold: -18, ratio: 4 } } })) and raise the sustained layers.`);
    if (off > 2) flag('too-loud', off > 5 ? 'P0' : 'P1', `Too loud: ${r1(I)} LUFS integrated (target ${targetLufs}).`, `m.master({ lufs: ${targetLufs} }); lower the loudest channels by 3–6 dB rather than limiting harder.`);
  }
  if (clipRuns > 0) flag('clipping', 'P0', `Clipping: ${clipRuns} run(s) of ≥3 samples at full scale.`, 'Lower the hottest instruments (inst.volume.value -= 3) and let m.master({ lufs: −14 }) set the final level; never push the bus into the limiter.');
  else if (TP > -1) flag('true-peak', 'P1', `True peak ${r1(TP)} dBTP is above −1 dBTP (lossy encoders will clip).`, "m.master({ preset: 'clean', lufs: −14 }) (limits to −1 dBTP) or pull the hottest transient source (kick/impact) down 2 dB.");
  if (Number.isFinite(I) && I > -60) {
    if (crest > target.crest[1]) flag('peaky', 'P1', `Peaky mix: crest factor ${crest} dB (peak ${peakDb} dBFS vs RMS ${rmsDb} dBFS) — a few transients dominate, the body is thin and integrated loudness stays low.`, "Compress the drums (m.inst.drums(kit, { mix: { comp: { threshold: -20, ratio: 4 } } })), lower kick/impact 2–4 dB, raise pads/bass, then m.master({ preset: 'punchy', lufs: −14 }).");
    if (crest < target.crest[0]) flag('squashed', 'P2', `Over-compressed: crest factor ${crest} dB — no punch left.`, "Use m.master({ preset: 'clean' }), less channel compression, and give the kick/snare room (sidechain the pads: m.sidechain(pad, groove, { depth: -6 })).");
  }

  // ---- spectral balance
  const bandLabel = (id: string) => BANDS.find((b) => b.id === id)!.label;
  const over = (id: BandId) => { const rg = target.bands[id]; return rg ? r1(bands[id] - rg[1]) : 0; };
  const under = (id: BandId) => { const rg = target.bands[id]; return rg ? r1(rg[0] - bands[id]) : 0; };
  if (over('lowmid') > 0) flag('mud', 'P1', `Mud: +${over('lowmid')} dB too much at ${bandLabel('lowmid')} (relative to the mids).`, "Voice chords above C3 (m.voiceLead(chords, { range: ['C3','C5'] })), high-pass pads/keys/strings at 180–250 Hz (m.inst.pad('warm', { mix: { highpass: 200 } })), dip 300 Hz on the pad (mix: { eq: { mid: -3, midFreq: 300 } }), and keep only bass + kick below 150 Hz.");
  if (over('low') > 0) flag('boomy', 'P1', `Boomy: +${over('low')} dB at ${bandLabel('low')}.`, "Lower the bass channel 2–4 dB, sidechain it to the kick (m.sidechain(bass, groove, { depth: -6, release: 0.15 }); groove = m.groove(…) or an array of kick times), high-pass everything else at 100–150 Hz.");
  if (target.needsSub && under('sub') > 0) flag('no-sub', 'P1', `Weak sub: ${bandLabel('sub')} is ${under('sub')} dB below the ${genre} range.`, "Add a sub or 808 an octave below the bass (m.inst.bass('sub') with m.bassline(chords, 'root', { octave: 1 })), or a kick with real low end (m.inst.drums('808'|'909')).");
  if (over('sub') > 0) flag('sub-heavy', 'P2', `Sub-heavy: +${over('sub')} dB at ${bandLabel('sub')} — it eats headroom and disappears on phones.`, "High-pass the master/bass at 30 Hz (m.inst.bass('808', { mix: { highpass: 30 } })) and lower the 808/sub 2–3 dB; make the bass audible with harmonics (bass('synth'|'pluck')) instead.");
  if (over('presence') > 0) flag('harsh', 'P1', `Harsh: +${over('presence')} dB at ${bandLabel('presence')}.`, "Low-pass leads/plucks/pads at 5–7 kHz (m.inst.lead('soft', { mix: { lowpass: 6000 } })), use lead('soft') instead of saw/square, lower hats 3 dB, lower velocities on bright patches.");
  if (under('presence') > 0) flag('muffled', 'P2', `Muffled: ${bandLabel('presence')} is ${under('presence')} dB under range — nothing cuts through.`, 'Open the lowpass on the lead/keys, add a pluck or piano in octave 5, or a clap/snare with a 2–4 kHz body.');
  if (under('air') > 0) flag('dull', 'P2', `Dull: ${bandLabel('air')} is ${under('air')} dB below range.`, "Add hats/shaker (m.groove(genre) hat/perc parts), an airy pad (m.inst.pad('airy')), or raise lowpass cut-offs above 10 kHz.");
  if (over('air') > 0) flag('fizzy', 'P2', `Fizzy: +${over('air')} dB at ${bandLabel('air')} (hiss / noisy hats).`, "Lower hats/noise risers 3–4 dB, low-pass the reverb return at 8 kHz (m.reverbSetup({ lowpass: 8000 }) before first use).");
  if (opts.vo && voBand > -2) flag('vo-band', 'P1', `Busy voice band: 1–4 kHz is ${voBand} dB vs 250 Hz–1 kHz — it will mask the voice-over.`, "Keep the melody out of VO lines (m.avoid(melody, voWindows)), use rhythm: 'sparse', low-pass pads/keys at 2.5–3 kHz while VO plays, move the lead an octave down or drop it.");

  // ---- stereo
  if (lowSideDb > -12 && lowMid > 0) flag('low-not-mono', 'P1', `Low end not mono: side energy below 120 Hz is ${lowSideDb} dB relative to mid.`, 'Pan bass/kick/808 to 0, no stereo width/chorus on bass, high-pass reverb and delay returns at 150–200 Hz, keep wide pads high-passed at 200 Hz.');
  if (widthDb < -30) flag('mono-mix', 'P2', `Mix is mono (side ${widthDb} dB).`, "Pan hats/perc ±0.2–0.4, plucks/arps ±0.3, use stereo pads and reverb sends (mix: { sends: { reverb: 0.3 }, width: 0.7 }).");

  // ---- time-domain checks on momentary loudness
  const mom = loud.momentary;
  const audible = mom.filter((x) => x.m > -45);
  const firstAudible = audible.length ? audible[0].t - 0.4 : 0;
  if (audible.length && firstAudible > 0.6) flag('late-start', 'P1', `Nothing audible for the first ${r1(firstAudible)} s.`, 'Start a sound on bar 0 (pad, pickup, riser) — video music must speak from frame 0.');
  {
    let gapStart: number | null = null;
    for (const x of mom) {
      const t = x.t - 0.4;
      if (t < 0.5 || t > dur - 0.5) continue;
      if (x.m < -50) { if (gapStart == null) gapStart = t; }
      else { if (gapStart != null && t - gapStart >= 1) flag('silent-gap', 'P0', `Silent gap ${r1(gapStart)}–${r1(t)} s.`, 'Keep a pad/drone or reverb tail through the gap, or make it a deliberate ≤1-beat stop before a drop.'); gapStart = null; }
    }
  }
  {
    const tailN = Math.floor(0.05 * sr);
    let s = 0;
    for (let i = L.length - tailN; i < L.length; i++) s += L[i] * L[i] + R[i] * R[i];
    const endDb = 10 * Math.log10(s / (2 * tailN) + 1e-12);
    if (endDb > -40) flag('hard-end', 'P1', `Ends abruptly: the last 50 ms are still at ${r1(endDb)} dBFS.`, 'End on a final chord/hit on a downbeat with release (tail: 2–3 s), not mid-loop; fade-outs are a last resort.');
  }

  // ---- per-section dynamics and static arrangement
  const spb = opts.bpm ? 60 / opts.bpm : 0, bpb = opts.beatsPerBar || 4, barLen = spb * bpb;
  const secs = (opts.sections || []).filter((s) => s.end - s.start > 0.5);
  const mono = await decodePcm(file, 22050);
  const ana = analyzePcm(mono, 22050);
  const sectionStats = secs.map((s) => {
    const inS = mom.filter((x) => x.t - 0.2 >= s.start && x.t - 0.2 < s.end).map((x) => x.m);
    const sp2 = spectra(L, R, sr, s.start, s.end);
    const onsets = ana.onsets.filter((t) => t >= s.start && t < s.end).length;
    return { name: s.name, start: r1(s.start), end: r1(s.end), lufs: r1(energyMean(inS)), onsetsPerSec: r1(onsets / (s.end - s.start)), bands: sp2.frames ? bandProfile(sp2.mid, sp2.binHz) : null };
  });
  if (sectionStats.length >= 2) {
    const ls = sectionStats.map((s) => s.lufs);
    const range = r1(Math.max(...ls) - Math.min(...ls));
    if (range < target.sectionRange) flag('no-dynamics', 'P1', `No dynamics between sections: section loudness spans only ${range} LU (${sectionStats.map((s) => `${s.name} ${s.lufs}`).join(', ')}).`, "Give each section an energy (m.arrange([{ name: 'intro', energy: 0.2 }, …])) so layers enter/leave; thin the intro to pad + one element, add drums/bass/lead at the drop, drop to a breakdown before the last chorus. Aim for 4–8 LU between quietest and loudest section.");
  }
  // static: compare consecutive blocks (4 bars, or 8 s without a bpm) of a coarse spectrogram
  const staticRuns: { from: number; to: number; sim: number }[] = [];
  let blockSimilarity: number[] = [];
  const blockSec = barLen ? barLen * 4 : 8;
  {
    const g = bandGram(mono.subarray(0, Math.floor(dur * 22050)), 22050);
    const bf = Math.round(blockSec * g.fps);
    const nb = Math.floor(g.frames.length / bf);
    const blockVec = (i: number) => { const v: number[] = []; for (let f = i * bf; f < (i + 1) * bf; f++) for (const x of g.frames[f]) v.push(x); return v; };
    const sims: number[] = [];
    for (let i = 0; i + 1 < nb; i++) sims.push(corr(blockVec(i), blockVec(i + 1)));
    blockSimilarity = sims.map((x) => Math.round(x * 100) / 100);
    let runStart = -1;
    for (let i = 0; i <= sims.length; i++) {
      const same = i < sims.length && sims[i] >= 0.97;
      if (same && runStart < 0) runStart = i;
      if (!same && runStart >= 0) {
        const blocks = i - runStart + 1;
        const ss = sims.slice(runStart, i);
        if (blocks * blockSec > (barLen ? barLen * 8 : 16) + 1e-6) staticRuns.push({ from: runStart * blockSec, to: (i + 1) * blockSec, sim: Math.round(Math.min(...ss) * 100) / 100 });
        runStart = -1;
      }
    }
    for (const sr2 of staticRuns) {
      const where = barLen ? `bars ${Math.round(sr2.from / barLen)}–${Math.round(sr2.to / barLen)}` : `${r1(sr2.from)}–${r1(sr2.to)} s`;
      flag('static', 'P1', `Static: ${where} repeat the same ${barLen ? '4-bar' : '8 s'} block (similarity ≥ ${sr2.sim}) — nothing changes for more than 8 bars.`, 'Change something every 4–8 bars: add/remove a layer (m.arrange energy per section), a fill on bar 8 (m.groove(genre, { fills: 8 })), vary the melody (m.melody form "A A\' B A\'\'"), open a filter (plan.automate(filter.frequency, …)), switch the bass style or the arp pattern.');
    }
  }

  const order: Record<Severity, number> = { P0: 0, P1: 1, P2: 2 };
  flags.sort((a, b) => order[a.severity] - order[b.severity]);
  const p0 = flags.filter((f) => f.severity === 'P0').length, p1 = flags.filter((f) => f.severity === 'P1').length;
  const head = `${r1(I)} LUFS, ${r1(TP)} dBTP, crest ${crest} dB`;
  const verdict = !flags.length
    ? `clean — ${head}, spectrum in the ${genre} range${sectionStats.length >= 2 ? `, sections ${r1(Math.max(...sectionStats.map((s) => s.lufs)) - Math.min(...sectionStats.map((s) => s.lufs)))} LU apart` : ''}`
    : `${flags.length} issue(s)${p0 ? ` (${p0} P0)` : ''}${!p0 && !p1 ? ' — polish only' : ''}: ${flags.slice(0, 4).map((f) => f.message.split(':')[0].replace(/\.$/, '')).join('; ')} — ${head}`;
  return {
    file: path.basename(file), genre, verdict, flags,
    metrics: {
      duration: r1(dur), fileDuration: r1(fileDur), lufs: r1(I), truePeakDbtp: r1(TP), lra: r1(loud.lra), peakDbfs: peakDb, rmsDbfs: rmsDb, crestDb: crest, plr,
      bands, bandNote: 'dB per octave relative to 500 Hz–2 kHz (pink noise = 0); targets ' + JSON.stringify(target.bands),
      voBandDb: voBand, lowSideDb, stereoWidthDb: widthDb, detectedBpm: ana.bpm, onsetsPerSec: r1(ana.onsets.length / Math.max(1, dur)),
    },
    sections: sectionStats,
    staticRuns,
    blockSimilarity, blockNote: `similarity of consecutive ${barLen ? '4-bar' : '8 s'} blocks (≥ 0.97 = verbatim repeat)`,
    targets: { lufs: targetLufs, truePeak: -1, ...target },
  };
}

/** route helper: report for music/<id> (renders if needed, uses its sections) or a project file */
export async function musicReportFor(body: { musicId?: string; file?: string; genre?: string; targetLufs?: number; vo?: boolean }) {
  const store = cur();
  let file: string, opts: ReportOptions = { genre: body.genre, targetLufs: body.targetLufs, vo: body.vo };
  if (body.musicId) {
    const info = await renderMusic(body.musicId);
    if (info.renderError) throw new Error(info.renderError);
    if (!info.rendered) throw new Error('music not rendered: ' + body.musicId);
    file = store.p(info.rendered);
    const meta: any = info.meta || {};
    const mf = readJson<any>(store.p('music', body.musicId, 'manifest.json'), {});
    opts = { ...opts, sections: meta.sections, bpm: meta.bpm, beatsPerBar: meta.beatsPerBar, duration: meta.duration, genre: body.genre || mf.genre || mf.category || (mf.tags || []).join(' ') || meta.title || info.name };
  } else if (body.file) {
    const rel = body.file.includes('/') ? body.file : 'media/' + body.file;
    file = safeJoin(store.dir, rel);
    if (!fs.existsSync(file)) throw new Error('file not found: ' + rel);
  } else throw new Error('music-report needs musicId or file');
  const rep = await musicReport(file, opts);
  return { musicId: body.musicId, ...rep };
}
