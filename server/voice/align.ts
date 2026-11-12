// Word timings for a recorded take.
//   estimateWords()  instant: the script's words spread over the voiced parts of the recording by syllables
//   alignWords()     accurate: what Whisper heard (words with timestamps) aligned to the script's words;
//                    words it did not hear get a slot between their matched neighbours.
// The script stays the source of the TEXT (captions show exactly what was written); the recording gives the TIMING.
import { syllables } from './speech.ts';
import type { VoiceLevels } from './levels.ts';

export interface W { text: string; start: number; end: number }
export interface AlignStats { matched: number; total: number; missed: string[]; extra: string[] }

const key = (s: string) => s.toLowerCase().replace(/́/g, '').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

function lev(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[n];
}
const sim = (a: string, b: string) => (a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length, 1));

/** spread `words` over [from, to] by syllables */
function spread(words: string[], from: number, to: number): W[] {
  const wts = words.map((w) => syllables(w) + 0.4);
  const total = wts.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0, to - from);
  let acc = 0;
  return words.map((text, i) => {
    const s = from + (span * acc) / total;
    acc += wts[i];
    const e = from + (span * acc) / total;
    return { text, start: +s.toFixed(3), end: +Math.max(e, s + 0.02).toFixed(3) };
  });
}

/** no recognition: the words laid over the voiced segments in order, pauses skipped */
export function estimateWords(words: string[], lv: VoiceLevels): W[] {
  if (!words.length) return [];
  const segs = lv.voiced.length ? lv.voiced : ([[0, lv.duration]] as [number, number][]);
  const voicedTotal = segs.reduce((a, [s, e]) => a + (e - s), 0) || 1;
  // voiced timeline → real time
  const real = (v: number) => {
    let left = v;
    for (const [s, e] of segs) { if (left <= e - s) return s + left; left -= e - s; }
    return segs[segs.length - 1][1];
  };
  return spread(words, 0, voicedTotal).map((w) => ({ text: w.text, start: +real(w.start).toFixed(3), end: +Math.max(real(w.end), real(w.start) + 0.02).toFixed(3) }));
}

/** align the script's spoken words to the recognised words; every script word gets a timing */
export function alignWords(script: string[], heard: W[], lv: VoiceLevels): { words: W[]; stats: AlignStats } {
  const h = heard.filter((w) => key(w.text));
  const sk = script.map(key), hk = h.map((w) => key(w.text));
  const n = sk.length, m = hk.length;
  if (!n) return { words: [], stats: { matched: 0, total: 0, missed: [], extra: h.map((w) => w.text) } };
  if (!m) return { words: estimateWords(script, lv), stats: { matched: 0, total: n, missed: script.slice(0, 12), extra: [] } };
  const GAP = -0.4, MIN = 0.5;
  const sc: Float32Array[] = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const bt: Uint8Array[] = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i++) { sc[i][0] = i * GAP; bt[i][0] = 1; }
  for (let j = 1; j <= m; j++) { sc[0][j] = j * GAP; bt[0][j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = sim(sk[i - 1], hk[j - 1]);
    const d = sc[i - 1][j - 1] + (s >= MIN ? s : -0.6), u = sc[i - 1][j] + GAP, l = sc[i][j - 1] + GAP;
    if (d >= u && d >= l) { sc[i][j] = d; bt[i][j] = 0; } else if (u >= l) { sc[i][j] = u; bt[i][j] = 1; } else { sc[i][j] = l; bt[i][j] = 2; }
  }
  const pair = new Int32Array(n).fill(-1);
  const used = new Uint8Array(m);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const b = bt[i][j];
    if (i > 0 && j > 0 && b === 0) { if (sim(sk[i - 1], hk[j - 1]) >= MIN) { pair[i - 1] = j - 1; used[j - 1] = 1; } i--; j--; }
    else if (i > 0 && (b === 1 || j === 0)) i--;
    else j--;
  }
  const first = lv.voiced.length ? lv.voiced[0][0] : 0;
  const last = lv.voiced.length ? lv.voiced[lv.voiced.length - 1][1] : lv.duration;
  const words: W[] = new Array(n);
  let matched = 0;
  for (let i = 0; i < n;) {
    if (pair[i] >= 0) { const w = h[pair[i]]; words[i] = { text: script[i], start: w.start, end: Math.max(w.end, w.start + 0.02) }; matched++; i++; continue; }
    // a run of words Whisper did not hear: fit it between the matched neighbours
    let k = i;
    while (k < n && pair[k] < 0) k++;
    const from = i > 0 ? words[i - 1].end : Math.min(first, k < n ? h[pair[k]].start : first);
    const to = k < n ? h[pair[k]].start : Math.max(last, from);
    spread(script.slice(i, k), from, Math.max(from, to)).forEach((w, x) => { words[i + x] = w; });
    i = k;
  }
  const missed = script.filter((_, i) => pair[i] < 0);
  const extra = h.filter((_, j) => !used[j]).map((w) => w.text);
  return { words, stats: { matched, total: n, missed: missed.slice(0, 12), extra: extra.slice(0, 12) } };
}
