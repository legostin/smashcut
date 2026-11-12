// Level facts of a voice recording, measured on decoded PCM (no log parsing):
// noise floor, speech level, voiced segments (for trimming the edges and for estimating word timings).
import { decodePcm } from '../audio/analyze.ts';

export interface VoiceLevels {
  /** seconds */
  duration: number;
  /** dBFS RMS of the quietest windows (10th percentile of 20 ms windows) ≈ room noise in the pauses */
  noiseDb: number;
  /** dBFS RMS of the loud windows (90th percentile) ≈ the speech itself */
  speechDb: number;
  /** speech − noise, dB */
  snrDb: number;
  /** [start, end] in seconds where somebody speaks */
  voiced: [number, number][];
}

const WIN = 0.02;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-7));

export function levelsOfPcm(pcm: Float32Array, sampleRate: number): VoiceLevels {
  const hop = Math.max(1, Math.round(sampleRate * WIN));
  const env: number[] = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + hop; j++) s += pcm[j] * pcm[j];
    env.push(db(Math.sqrt(s / hop)));
  }
  const duration = pcm.length / sampleRate;
  if (!env.length) return { duration, noiseDb: -120, speechDb: -120, snrDb: 0, voiced: [] };
  const sorted = [...env].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  const noiseDb = Math.max(-120, q(0.1));
  const speechDb = q(0.9);
  // speech sits well above the room; a window counts as voiced when it clears the noise by 8 dB and is within 32 dB of the speech level
  const thr = Math.max(noiseDb + 8, speechDb - 32);
  const voiced: [number, number][] = [];
  let st = -1;
  for (let k = 0; k <= env.length; k++) {
    const on = k < env.length && env[k] > thr;
    if (on && st < 0) st = k;
    if (!on && st >= 0) { voiced.push([st * WIN, k * WIN]); st = -1; }
  }
  // close gaps shorter than 120 ms (stops, consonant clusters), drop blips shorter than 60 ms (clicks)
  const merged: [number, number][] = [];
  for (const seg of voiced) {
    const last = merged[merged.length - 1];
    if (last && seg[0] - last[1] < 0.12) last[1] = seg[1]; else merged.push([seg[0], seg[1]]);
  }
  const segs = merged.filter(([a, b]) => b - a >= 0.06).map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)] as [number, number]);
  return { duration: +duration.toFixed(3), noiseDb: +noiseDb.toFixed(1), speechDb: +speechDb.toFixed(1), snrDb: +(speechDb - noiseDb).toFixed(1), voiced: segs };
}

export async function voiceLevels(absFile: string): Promise<VoiceLevels> {
  return levelsOfPcm(await decodePcm(absFile, 16000), 16000);
}

/** RMS level (dBFS) of the given [start, end] regions of a file — e.g. the air left around the speech, to measure the noise there */
export async function regionLevel(absFile: string, regions: [number, number][]): Promise<number | null> {
  const sr = 16000;
  const pcm = await decodePcm(absFile, sr);
  let sum = 0, n = 0;
  for (const [a, b] of regions) for (let i = Math.max(0, Math.round(a * sr)); i < Math.min(pcm.length, Math.round(b * sr)); i++) { sum += pcm[i] * pcm[i]; n++; }
  return n >= sr * 0.05 ? +db(Math.sqrt(sum / n)).toFixed(1) : null;
}

/** where the speech starts and ends, with a little air kept on both sides */
export function speechBounds(lv: VoiceLevels, padding = 0.15): { start: number; end: number } {
  if (!lv.voiced.length) return { start: 0, end: lv.duration };
  return { start: +Math.max(0, lv.voiced[0][0] - padding).toFixed(3), end: +Math.min(lv.duration, lv.voiced[lv.voiced.length - 1][1] + padding).toFixed(3) };
}

/** the longest stretch with nobody speaking (kept 0.25 s away from the words), ≥ 0.7 s — where the room noise can be measured cleanly */
export function quietRegion(lv: VoiceLevels): [number, number] | null {
  const gaps: [number, number][] = [];
  let at = 0;
  for (const [a, b] of lv.voiced) { gaps.push([at === 0 ? 0.05 : at + 0.25, a - 0.25]); at = b; }
  gaps.push([at === 0 ? 0.05 : at + 0.25, lv.duration - 0.05]);
  const best = gaps.filter(([a, b]) => b - a >= 0.7).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
  return best ? [+best[0].toFixed(3), +Math.min(best[1], best[0] + 3).toFixed(3)] : null;
}
