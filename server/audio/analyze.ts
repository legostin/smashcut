import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runOk } from '../util.ts';
import { bin } from '../bin.ts';

/** number of channels of the first audio stream (0 if unknown) */
function audioChannels(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(bin('ffprobe'), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', file]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve(0));
    p.on('close', () => resolve(parseInt(out, 10) || 0));
  });
}

/** decode any audio/video file to mono float32 PCM (stereo is averaged (L+R)/2 so levels stay true; ffmpeg's -ac 1 adds +3 dB on correlated stereo) */
export async function decodePcm(file: string, sampleRate = 22050, from?: number, dur?: number): Promise<Float32Array> {
  const stereo = (await audioChannels(file)) === 2;
  return new Promise((resolve, reject) => {
    const args = ['-v', 'error'];
    if (from != null) args.push('-ss', String(from));
    if (dur != null) args.push('-t', String(dur));
    args.push('-i', file, '-vn', ...(stereo ? ['-af', 'pan=mono|c0=0.5*c0+0.5*c1'] : ['-ac', '1']), '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1');
    const p = spawn(bin('ffmpeg'), args);
    const chunks: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg decode failed: ' + err.slice(-500)));
      const b = Buffer.concat(chunks);
      const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      resolve(new Float32Array(ab, 0, Math.floor(b.byteLength / 4)));
    });
  });
}

/** peaks for waveform drawing: `perSecond` max-abs values per second */
export function computePeaks(pcm: Float32Array, sampleRate: number, perSecond = 50): number[] {
  const hop = Math.max(1, Math.floor(sampleRate / perSecond));
  const out: number[] = [];
  for (let i = 0; i < pcm.length; i += hop) {
    let m = 0;
    for (let j = i; j < Math.min(pcm.length, i + hop); j++) { const v = Math.abs(pcm[j]); if (v > m) m = v; }
    out.push(Math.round(m * 1000) / 1000);
  }
  return out;
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export interface AudioAnalysis {
  duration: number;
  bpm: number;
  beats: number[];
  onsets: number[];
  /** RMS loudness in dBFS, every 0.1s */
  loudness: number[];
  peak: number;
  /** strongest moments (onset strength peaks) — good cut points */
  accents: number[];
}

export function analyzePcm(pcm: Float32Array, sr: number): AudioAnalysis {
  const N = 1024, hop = 512;
  const frames = Math.max(0, Math.floor((pcm.length - N) / hop));
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let prev = new Float64Array(N / 2);
  const flux = new Float64Array(frames);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    for (let i = 0; i < N; i++) { re[i] = pcm[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let s = 0;
    const mag = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) {
      mag[k] = Math.log1p(10 * Math.hypot(re[k], im[k]));
      const d = mag[k] - prev[k];
      if (d > 0) s += d;
    }
    flux[f] = s;
    prev = mag;
  }
  const fps = sr / hop;
  // normalise + adaptive threshold
  const W = Math.round(fps * 0.5);
  const env = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let m = 0, c = 0;
    for (let j = Math.max(0, f - W); j < Math.min(frames, f + W); j++) { m += flux[j]; c++; }
    env[f] = Math.max(0, flux[f] - (m / c) * 1.1);
  }
  const maxEnv = env.reduce((a, b) => Math.max(a, b), 1e-9);
  const onsets: number[] = [];
  const strengths: { t: number; s: number }[] = [];
  for (let f = 1; f < frames - 1; f++) {
    if (env[f] > env[f - 1] && env[f] >= env[f + 1] && env[f] > maxEnv * 0.12) {
      const t = (f * hop) / sr;
      if (!onsets.length || t - onsets[onsets.length - 1] > 0.07) { onsets.push(+t.toFixed(3)); strengths.push({ t: +t.toFixed(3), s: env[f] / maxEnv }); }
    }
  }
  // tempo via autocorrelation in 70..180 bpm
  let bestLag = 0, best = -1;
  const minLag = Math.round((60 / 180) * fps), maxLag = Math.round((60 / 70) * fps);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag];
    // mild preference for ~120 bpm
    const bpm = (60 * fps) / lag;
    s *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 1.2, 2));
    if (s > best) { best = s; bestLag = lag; }
  }
  const duration = pcm.length / sr;
  const beats: number[] = [];
  let bpm = 0;
  if (bestLag > 0 && onsets.length > 8) {
    bpm = Math.round(((60 * fps) / bestLag) * 10) / 10;
    // phase that maximises envelope on the grid
    let bestPhase = 0, bestScore = -1;
    for (let ph = 0; ph < bestLag; ph++) {
      let s = 0;
      for (let f = ph; f < frames; f += bestLag) s += env[f];
      if (s > bestScore) { bestScore = s; bestPhase = ph; }
    }
    const period = 60 / bpm;
    for (let t = (bestPhase * hop) / sr; t < duration; t += period) beats.push(+t.toFixed(3));
  }
  const loudness: number[] = [];
  const step = Math.round(sr * 0.1);
  let peak = 0;
  for (let i = 0; i < pcm.length; i += step) {
    let s = 0;
    for (let j = i; j < Math.min(pcm.length, i + step); j++) { s += pcm[j] * pcm[j]; peak = Math.max(peak, Math.abs(pcm[j])); }
    const rms = Math.sqrt(s / step);
    loudness.push(Math.round(20 * Math.log10(rms + 1e-9) * 10) / 10);
  }
  const accents = strengths.sort((a, b) => b.s - a.s).slice(0, 24).map((x) => x.t).sort((a, b) => a - b);
  return { duration, bpm, beats, onsets, loudness, peak, accents };
}

/** spectrogram PNG for agent "hearing" */
export async function spectrogram(file: string, out: string, opts: { from?: number; dur?: number } = {}) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ['-y', '-v', 'error'];
  if (opts.from != null) args.push('-ss', String(opts.from));
  if (opts.dur != null) args.push('-t', String(opts.dur));
  args.push('-i', file, '-lavfi', 'showspectrumpic=s=1600x480:mode=combined:color=intensity:scale=log:legend=1', out);
  await runOk('ffmpeg', args);
  return out;
}

/** compact text summary of loudness for LLMs: one char per bucket */
export function loudnessSparkline(loudness: number[], buckets = 80) {
  const chars = ' ▁▂▃▄▅▆▇█';
  const per = Math.max(1, Math.ceil(loudness.length / buckets));
  let s = '';
  for (let i = 0; i < loudness.length; i += per) {
    const v = Math.max(...loudness.slice(i, i + per));
    const n = Math.max(0, Math.min(8, Math.round(((v + 48) / 48) * 8)));
    s += chars[n];
  }
  return s;
}
