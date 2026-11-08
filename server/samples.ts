// Sample library for music-as-code instruments (runtime/music-ext/instruments.js).
// Samples are NOT vendored: a small curated set of freely licensed files is fetched on first use into
// ${HOME_DIR}/samples/<pack>/…, verified by sha256, lightly processed (onset trim, peak normalise, loop crossfade,
// fade-out, 16-bit WAV) and listed in ${HOME_DIR}/samples/index.json, which the render page reads via /samples/index.json.
// Offline / failed downloads never fail a render: instruments fall back to their synth versions.
// Licenses: every pack lists its license; CC-BY packs are credited in ATTRIBUTIONS.md (repo root).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HOME_DIR, RUNTIME_DIR } from './config.ts';

export const SAMPLES_DIR = process.env.STUDIO_SAMPLES_DIR || path.join(HOME_DIR, 'samples');
const DISABLED = process.env.STUDIO_SAMPLES === 'off';
const INDEX_FILE = path.join(SAMPLES_DIR, 'index.json');

export interface SamplePack { id: string; name: string; source: string; license: string; licenseUrl: string; attribution?: string }
export interface SampleProc { trim?: boolean; norm?: number; fade?: number; loop?: [number, number, number] }
export interface SampleFile {
  pack: string; file: string; url: string; sha256: string; size: number;
  /** fetch only the first `bytes` bytes (HTTP Range) — long WAVs are cut to what the instrument needs */
  bytes?: number;
  inst: string; note?: string; vel?: number; rr?: number; offset?: number; gain?: number; maxSec?: number;
  proc?: SampleProc;
}

export const PACKS: SamplePack[] = [
  { id: 'salamander', name: 'Salamander Grand Piano V3 (mp3 mirror, felixroos/dough-samples)', source: 'https://archive.org/details/SalamanderGrandPianoV3', license: 'CC-BY-3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', attribution: 'Salamander Grand Piano V3 by Alexander Holm — CC BY 3.0' },
  { id: 'vsco2', name: 'VSCO 2 Community Edition (Versilian Studios)', source: 'https://github.com/sgossner/VSCO-2-CE', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'vcsl', name: 'Versilian Community Sample Library (VCSL)', source: 'https://github.com/sgossner/VCSL', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'tr808', name: 'Roland TR08 100% gain, default tuning — Karman_Lyne (freesound pack 29226)', source: 'https://freesound.org/people/Karman_Lyne/packs/29226/', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'tr909', name: 'TR-909 Drum Hits — GRD-music- (freesound pack 23395)', source: 'https://freesound.org/people/GRD-music-/packs/23395/', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'fsfx', name: 'Freesound CC0 FX: 620818 (SkyernAklea), 177242, 408141 (Jofae), 683101 (florianreichelt), 27281 (EcoDTR), 110218 (genocidalguitar), 428073 (newagesoup), 371583 (OwlStorm)', source: 'https://freesound.org/', license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'wurli', name: 'Wurlitzer EP200 — Greg Sullivan (sfzinstruments/GregSullivan.E-Pianos)', source: 'https://github.com/sfzinstruments/GregSullivan.E-Pianos', license: 'CC-BY-3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', attribution: 'Wurlitzer EP200 samples by Greg Sullivan (http://www.sullivang.net/) — CC BY 3.0; SFZ mapping by kinwie / sfzinstruments' },
];

// ---------- WAV processing ----------
interface Pcm { sr: number; ch: Float32Array[] }
function decodeWav(b: Buffer): Pcm | null {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  let o = 12, fmt: { tag: number; nch: number; sr: number; align: number; bits: number } | null = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4);
    if (id === 'fmt ') {
      let tag = b.readUInt16LE(o + 8);
      if (tag === 0xfffe && sz >= 26) tag = b.readUInt16LE(o + 8 + 24);
      fmt = { tag, nch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), align: b.readUInt16LE(o + 20), bits: b.readUInt16LE(o + 22) };
    }
    if (id === 'data' && fmt) {
      const start = o + 8, end = Math.min(b.length, start + sz); // data may be truncated (range fetch)
      const n = Math.floor((end - start) / fmt.align), bps = fmt.bits / 8;
      const ch = Array.from({ length: fmt.nch }, () => new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < fmt.nch; c++) {
        const p = start + i * fmt.align + c * bps;
        let v = 0;
        if (fmt.tag === 3 && bps === 4) v = b.readFloatLE(p);
        else if (bps === 2) v = b.readInt16LE(p) / 32768;
        else if (bps === 3) v = b.readIntLE(p, 3) / 8388608;
        else if (bps === 4) v = b.readInt32LE(p) / 2147483648;
        else if (bps === 1) v = (b[p] - 128) / 128;
        ch[c][i] = v;
      }
      return { sr: fmt.sr, ch };
    }
    o += 8 + sz + (sz & 1);
  }
  return null;
}
function encodeWav16(p: Pcm): Buffer {
  const n = p.ch[0].length, nch = p.ch.length;
  const b = Buffer.alloc(44 + n * nch * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * nch * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(nch, 22); b.writeUInt32LE(p.sr, 24); b.writeUInt32LE(p.sr * nch * 2, 28); b.writeUInt16LE(nch * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * nch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) { const s = Math.max(-1, Math.min(1, p.ch[c][i])); b.writeInt16LE(Math.round(s < 0 ? s * 32768 : s * 32767), o); o += 2; }
  return b;
}
/** onset trim, peak normalise, equal-power loop crossfade (loop = [start, end, xfade] seconds after the onset), fade-out */
function processPcm(p: Pcm, proc: SampleProc): { pcm: Pcm; loop?: [number, number] } {
  let ch = p.ch;
  const len = () => ch[0].length;
  let peak = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  if (peak <= 0) return { pcm: p };
  if (proc.trim) {
    const thr = peak * 0.01; // −40 dB re peak
    let on = 0;
    outer: for (let i = 0; i < len(); i++) for (const c of ch) if (Math.abs(c[i]) > thr) { on = i; break outer; }
    const s = Math.max(0, on - Math.round(0.002 * p.sr));
    ch = ch.map((c) => c.slice(s));
  }
  if (proc.norm != null) { const g = Math.pow(10, proc.norm / 20) / peak; for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= g; }
  let loop: [number, number] | undefined;
  if (proc.loop) {
    const [ls, le0, xf] = proc.loop;
    const s = Math.round(ls * p.sr), x = Math.round(xf * p.sr);
    const e = Math.min(Math.round(le0 * p.sr), len());
    if (e - x > s && s - x >= 0) {
      for (const c of ch) for (let i = 0; i < x; i++) {
        const w = (i + 0.5) / x, a = c[e - x + i], b = c[s - x + i];
        c[e - x + i] = a * Math.cos((w * Math.PI) / 2) + b * Math.sin((w * Math.PI) / 2);
      }
      ch = ch.map((c) => c.slice(0, e));
      loop = [s / p.sr, e / p.sr];
    }
  }
  if (!loop && proc.fade) {
    const f = Math.min(len(), Math.round(proc.fade * p.sr));
    for (const c of ch) for (let i = 0; i < f; i++) c[len() - f + i] *= Math.pow(1 - (i + 1) / f, 2);
  }
  return { pcm: { sr: p.sr, ch }, loop };
}

// ---------- download ----------
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const localPath = (f: SampleFile) => path.join(SAMPLES_DIR, f.pack, f.file);
const STATE_FILE = path.join(SAMPLES_DIR, 'state.json');
type State = Record<string, { sha256: string; loop?: [number, number] }>;
const keyOf = (f: SampleFile) => f.pack + '/' + f.file;

async function fetchBytes(f: SampleFile, timeoutMs: number): Promise<Buffer> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(f.url, { headers: f.bytes ? { range: `bytes=0-${f.bytes - 1}` } : {}, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let b = Buffer.from(await r.arrayBuffer());
    if (f.bytes && b.length > f.bytes) b = b.subarray(0, f.bytes); // server ignored the Range header
    return b;
  } finally { clearTimeout(t); }
}

function readState(): State { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }

function writeIndex(state: State) {
  const inst: Record<string, any[]> = {};
  for (const f of SAMPLE_FILES) {
    const s = state[keyOf(f)];
    if (!s || s.sha256 !== f.sha256 || !fs.existsSync(localPath(f))) continue;
    (inst[f.inst] ||= []).push({ url: `/samples/${f.pack}/${f.file}`, note: f.note, vel: f.vel, rr: f.rr, offset: f.offset, gain: f.gain, loop: s.loop });
  }
  const json = JSON.stringify({ version: 1, inst });
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_FILE) || fs.readFileSync(INDEX_FILE, 'utf8') !== json) fs.writeFileSync(INDEX_FILE, json);
  return json;
}

let ensuring: Promise<void> | null = null;
let offlineUntil = 0;
/** download missing samples once (sha256-verified); never throws — on failure instruments use synth fallbacks */
export function ensureSamples(): Promise<void> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    try {
      fs.mkdirSync(SAMPLES_DIR, { recursive: true });
      const state = readState();
      const missing = SAMPLE_FILES.filter((f) => state[keyOf(f)]?.sha256 !== f.sha256 || !fs.existsSync(localPath(f)));
      if (!missing.length || DISABLED || Date.now() < offlineUntil) { writeIndex(state); return; }
      const total = missing.reduce((a, f) => a + f.size, 0);
      console.log(`  Samples: downloading ${missing.length} files (${(total / 1e6).toFixed(1)} MB, once) → ${SAMPLES_DIR}`);
      let done = 0, bytes = 0, failed = 0, lastLog = 0, consecutiveNet = 0;
      const queue = [...missing];
      const worker = async () => {
        while (queue.length) {
          if (consecutiveNet >= 4) { queue.length = 0; break; } // looks offline — stop trying
          const f = queue.shift()!;
          try {
            const buf = await fetchBytes(f, 45000);
            consecutiveNet = 0;
            if (sha(buf) !== f.sha256) throw new Error('sha256 mismatch');
            const out = localPath(f);
            fs.mkdirSync(path.dirname(out), { recursive: true });
            let loop: [number, number] | undefined;
            if (/\.wav$/i.test(f.file) && f.proc) {
              const pcm = decodeWav(buf);
              if (!pcm) throw new Error('not a PCM wav');
              const r = processPcm(pcm, f.proc);
              loop = r.loop;
              fs.writeFileSync(out + '.tmp', encodeWav16(r.pcm));
            } else fs.writeFileSync(out + '.tmp', buf);
            fs.renameSync(out + '.tmp', out);
            state[keyOf(f)] = { sha256: f.sha256, ...(loop ? { loop } : {}) };
            bytes += f.size;
          } catch (e) {
            failed++;
            if ((e as Error).name === 'AbortError' || /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|network/i.test(String((e as Error).message) + String((e as any).cause?.code || ''))) consecutiveNet++;
            if (failed <= 3) console.warn(`  Samples: ${f.pack}/${f.file} failed: ${(e as Error).message}`);
          }
          done++;
          if (Date.now() - lastLog > 2000 || !queue.length) { lastLog = Date.now(); process.stdout.write(`  Samples: ${done}/${missing.length} (${(bytes / 1e6).toFixed(1)} MB)\n`); }
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      fs.writeFileSync(STATE_FILE, JSON.stringify(state));
      writeIndex(state);
      if (failed) {
        offlineUntil = Date.now() + 10 * 60 * 1000;
        console.warn(`  Samples: ${failed} file(s) unavailable — those instruments use synth fallbacks (retry in 10 min).`);
      } else console.log('  Samples ready.');
    } catch (e) {
      console.warn('  Samples: ' + (e as Error).message + ' — using synth fallbacks');
      try { writeIndex(readState()); } catch {}
    }
  })().finally(() => { ensuring = null; });
  return ensuring;
}

/** /samples/index.json — always valid JSON (an empty index when nothing is downloaded yet) */
export function sampleIndexJson(): string {
  try { return fs.readFileSync(INDEX_FILE, 'utf8'); } catch {}
  try { return writeIndex(readState()); } catch { return '{"version":1,"inst":{}}'; }
}

/** changes whenever the available samples or the instrument/mix runtime change → part of the music render cache key */
export function soundStamp(): string {
  const h = crypto.createHash('sha1').update(sampleIndexJson());
  for (const f of ['mix.js', 'instruments.js', 'theory.js', 'index.js']) { try { h.update(fs.readFileSync(path.join(RUNTIME_DIR, 'music-ext', f))); } catch {} }
  try { h.update(fs.readFileSync(path.join(RUNTIME_DIR, 'music.js'))); } catch {}
  return h.digest('hex').slice(0, 12);
}

// ---------- manifest (generated: url, byte range, sha256 of the fetched bytes, processing) ----------
// prettier-ignore
export const SAMPLE_FILES: SampleFile[] = [
  { pack: "salamander", file: "piano/A0.mp3", inst: "piano", note: "A0", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A0v8.mp3", size: 317747, sha256: "0e7869511bd3342a63fcb7df2fa1e9c4ab656d93a32d6dc472adbf98e10364d3" },
  { pack: "salamander", file: "piano/C1.mp3", inst: "piano", note: "C1", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C1v8.mp3", size: 288101, sha256: "eca440cecae64d3665235abc0001a1d2ec9e2717ef772268755115ba80acb785" },
  { pack: "salamander", file: "piano/Ds1.mp3", inst: "piano", note: "D#1", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Ds1v8.mp3", size: 345891, sha256: "2675110d0f94adfafdd66a0c6d273c6897ccfc0f7419762e9c61590e01a9a690" },
  { pack: "salamander", file: "piano/Fs1.mp3", inst: "piano", note: "F#1", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Fs1v8.mp3", size: 304678, sha256: "9e908e308a21501ca3cd936d22922a83041674a1076528a137a31135d1b0d1a1" },
  { pack: "salamander", file: "piano/A1.mp3", inst: "piano", note: "A1", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A1v8.mp3", size: 307723, sha256: "ed415a636cd1ac0f461f55ab3997be6fa1f9877728077a91b89b1114e4339ae2" },
  { pack: "salamander", file: "piano/C2.mp3", inst: "piano", note: "C2", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C2v8.mp3", size: 314035, sha256: "41664af78045c416e98c990d0bab0b6c26c61da63e2a7d62d6dd4dafc5a82167" },
  { pack: "salamander", file: "piano/Ds2.mp3", inst: "piano", note: "D#2", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Ds2v8.mp3", size: 317075, sha256: "acd6c32d9a88675c1ae326f14727aae0a3667cc70f9ef7a39b6bc5c1a3a0342c" },
  { pack: "salamander", file: "piano/Fs2.mp3", inst: "piano", note: "F#2", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Fs2v8.mp3", size: 292012, sha256: "710685dd1a82b0dfa849c0056b50f4e6836c818c393e582b3c07ff17ddcacd04" },
  { pack: "salamander", file: "piano/A2.mp3", inst: "piano", note: "A2", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A2v8.mp3", size: 239448, sha256: "ea3b12700be31a2d7fa1db672ced04802368f75f08162ce3afd20ee2c56b6b1e" },
  { pack: "salamander", file: "piano/C3.mp3", inst: "piano", note: "C3", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C3v8.mp3", size: 212578, sha256: "790bf54430365989ae14fad704264a46bce4baedced5298d6d700a1d3c7600c6" },
  { pack: "salamander", file: "piano/Ds3.mp3", inst: "piano", note: "D#3", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Ds3v8.mp3", size: 225299, sha256: "dcca048dc25de903f86efddfac6b4320597deb4f300cea70f215dd1d900cdca6" },
  { pack: "salamander", file: "piano/Fs3.mp3", inst: "piano", note: "F#3", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Fs3v8.mp3", size: 227534, sha256: "e632f2dc532a3158693c026b93698c8ed6c6fc03c9854bb75c887542cef118da" },
  { pack: "salamander", file: "piano/A3.mp3", inst: "piano", note: "A3", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A3v8.mp3", size: 231394, sha256: "298d319fca1ca6934ea5b07d7100002f8dfdbf8cf36fa068c8df8b5a9eb49c13" },
  { pack: "salamander", file: "piano/C4.mp3", inst: "piano", note: "C4", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C4v8.mp3", size: 219187, sha256: "497464f6d8e0455c6b72b35bf7fed1bbd14a382b90bb389c3c88ebf9ffc8a566" },
  { pack: "salamander", file: "piano/Ds4.mp3", inst: "piano", note: "D#4", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Ds4v8.mp3", size: 197277, sha256: "423aeb40f9719f32892eb313236b56e39a363e13616fccc7f721ab0427eb9150" },
  { pack: "salamander", file: "piano/Fs4.mp3", inst: "piano", note: "F#4", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Fs4v8.mp3", size: 176999, sha256: "eefc4e8bc71867c06dbb5c926bff50ccde942d19ee885e958ec110186cf631b1" },
  { pack: "salamander", file: "piano/A4.mp3", inst: "piano", note: "A4", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A4v8.mp3", size: 173442, sha256: "c5270f435ab7100e6fa4a363d985b7a41ab1c20ea0d12dd8fc1106e7e753cd7c" },
  { pack: "salamander", file: "piano/C5.mp3", inst: "piano", note: "C5", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C5v8.mp3", size: 172477, sha256: "9748a6d4668a571291983c3dbe3907cb3597a17f33cdb63672f25043c685b028" },
  { pack: "salamander", file: "piano/Fs5.mp3", inst: "piano", note: "F#5", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Fs5v8.mp3", size: 130413, sha256: "7a0830da67ed80a322f9bd3718ef0050c8ba8a4588f7f33599b1719ad0fbdb67" },
  { pack: "salamander", file: "piano/A5.mp3", inst: "piano", note: "A5", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A5v8.mp3", size: 135673, sha256: "4d8c5386a638ec0fd1f70081bf4b51cae2b8f6acf7ffc849052c37bb49da142c" },
  { pack: "salamander", file: "piano/C6.mp3", inst: "piano", note: "C6", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C6v8.mp3", size: 95919, sha256: "583f570482c22e94fe37df0e31cadb005ba9f9ce742cc465311ba06c235d994d" },
  { pack: "salamander", file: "piano/Ds6.mp3", inst: "piano", note: "D#6", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Ds6v8.mp3", size: 104470, sha256: "fecea39137ab19a7a45a5fe97e9b338eddbab7bd9bb15746cf185f49ddcfa4e9" },
  { pack: "salamander", file: "piano/Fs6.mp3", inst: "piano", note: "F#6", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/Fs6v8.mp3", size: 83193, sha256: "f6dd2f92614e9e07f10e0928f31ec887f6f5540952a2991b478d824ad3ffb087" },
  { pack: "salamander", file: "piano/A6.mp3", inst: "piano", note: "A6", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/A6v8.mp3", size: 73955, sha256: "1b9106440f720f7120c7ef723e4b8c95bb887e4b3d3d57d6f84bf56d34ec9535" },
  { pack: "salamander", file: "piano/C7.mp3", inst: "piano", note: "C7", offset: 0.006, gain: 6, url: "https://raw.githubusercontent.com/felixroos/dough-samples/9eacfc86ec4393e68a463ff52b01c19cfaa77f38/piano/C7v8.mp3", size: 48513, sha256: "86faf0061f6aa4e47c8b50a656650bc3a274dbd3281668fcdd7bdebec9eaf9ec" },
  { pack: "vsco2", file: "strings/sus_C2.wav", inst: "strings", note: "C2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_C1_v1_1.wav", bytes: 1111364, size: 1111364, sha256: "ea98595e28d6dddd17764b65ee830b84e0eba7c6e2671cb2a6de224c442fe01d", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_G2.wav", inst: "strings", note: "G2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_G1_v1_1.wav", bytes: 1111364, size: 1111364, sha256: "d56b96eb1bf49a1440a2976996654da6183b49c908a3f6854c2f30f65f1249b0", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_D3.wav", inst: "strings", note: "D3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_D2_v1_1.wav", bytes: 1111364, size: 1111364, sha256: "42c6ecda5e67440a4c8af432fc63ac6b39aea4ab0e94d3c99805dee1e88f57f7", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_A3.wav", inst: "strings", note: "A3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_A2_v1_1.wav", bytes: 1111364, size: 1111364, sha256: "207bccaf4a218dce353975b15b47a5a5613ce9e72552cb5c8c75e5532068a289", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_D4.wav", inst: "strings", note: "D4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_D3_v1_1.wav", bytes: 1111364, size: 1111364, sha256: "b18d0a9c8d439335bb8a0cc9bcd02a05d22a6829a2846f6d69218e0e2ac1144d", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_A4.wav", inst: "strings", note: "A4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_A3_v1.wav", bytes: 740924, size: 740924, sha256: "fc72180cfa49a6305956c126a2ea52e10b39d81de1fe85964452cbd8bcb41fe4", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_E5.wav", inst: "strings", note: "E5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_E4_v1.wav", bytes: 740924, size: 740924, sha256: "a6924c2e436d757565853072097bf44250dff2d9c118a84f853a07919aa2a5e1", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/sus_B5.wav", inst: "strings", note: "B5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_B4_v1.wav", bytes: 740924, size: 740924, sha256: "e291f5447af8aebb9bb617c118d3a9c4665c25ebf88f80888b7648684634858e", proc: {"trim":true,"norm":-3,"loop":[1.4,3.6,0.6]} },
  { pack: "vsco2", file: "strings/pizz_C2.wav", inst: "strings.pizz", note: "C2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_C1_v2_RR1.wav", bytes: 423404, size: 423404, sha256: "37eb2c6fc927cd4935b0db39d269ec97af77ea6c33b8f9e197e1a2d1b2ea747d", proc: {"trim":true,"norm":-1,"fade":0.25} },
  { pack: "vsco2", file: "strings/pizz_G2.wav", inst: "strings.pizz", note: "G2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_G1_v2_RR1.wav", bytes: 423404, size: 423404, sha256: "43f497ce1c57aa545da897f982b5a475959c4395115645c67fcb0859046969b3", proc: {"trim":true,"norm":-1,"fade":0.25} },
  { pack: "vsco2", file: "strings/pizz_D3.wav", inst: "strings.pizz", note: "D3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_D2_v2_RR1.wav", bytes: 423404, size: 423404, sha256: "29d5a49d615d7cfdcf79bc93058abd3340c02c0caff6fcfc3064e63e53172098", proc: {"trim":true,"norm":-1,"fade":0.25} },
  { pack: "vsco2", file: "strings/pizz_A3.wav", inst: "strings.pizz", note: "A3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_A2_v2_RR1.wav", bytes: 423404, size: 423404, sha256: "25c39c2457c1084179532ca293952170c7e6f6ef4e97f006a49ee2da1029f24d", proc: {"trim":true,"norm":-1,"fade":0.25} },
  { pack: "vsco2", file: "strings/pizz_D4.wav", inst: "strings.pizz", note: "D4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_D3_v2_rr1.wav", bytes: 282286, size: 282286, sha256: "bf8020c611668fcb85db436471ee467f45001a784ccbed3f67726a94e20c60f1", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/pizz_A4.wav", inst: "strings.pizz", note: "A4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_A3_v2_rr1.wav", size: 194010, sha256: "631720219cbd7b11718b393bdacf04eb512ef5071f9e5d0d73d74b3f17179ec2", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/pizz_E5.wav", inst: "strings.pizz", note: "E5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_E4_v2_rr1.wav", size: 146742, sha256: "1e1dcef99c3961a601ed0c8336fbf4819fd432ab783445fe4f44fc488e598993", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/pizz_B5.wav", inst: "strings.pizz", note: "B5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_B4_v2_rr1.wav", size: 106362, sha256: "ec6f6320f9403a5e0bbb1d0c534abe667a6a2093654343a389b26cf083d513d2", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_C2.wav", inst: "strings.stac", note: "C2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_C1_v2_RR1.wav", bytes: 317564, size: 317564, sha256: "7cc88d5fa665382afd61ab45301e9f3d3da0f3b0fa07e44ccadc19217bf7380c", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_G2.wav", inst: "strings.stac", note: "G2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_G1_v2_RR1.wav", bytes: 317564, size: 317564, sha256: "de79d38edcac7a9b799256a52fe7453448834432dfd2f2bf67cf2645dc8fc0a1", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_D3.wav", inst: "strings.stac", note: "D3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_D2_v2_RR1.wav", bytes: 317564, size: 317564, sha256: "027d1ab61e3b71bfbf5d5577de551bcf69a0de5c5695ab9ba87dcb1404ecdb28", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_A3.wav", inst: "strings.stac", note: "A3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_A2_v2_RR1.wav", bytes: 317564, size: 317564, sha256: "7e8c45bd035e69de9cc496fb540e7b9ba0633ae920aa9394070a96611c31c1a5", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_D4.wav", inst: "strings.stac", note: "D4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_D3_v2_rr1.wav", bytes: 211726, size: 211726, sha256: "418e2f8d8ed03c75ff024eea975571622b0d6372da65e48f8a3d9006f517f44d", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_A4.wav", inst: "strings.stac", note: "A4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_A3_v2_rr1.wav", bytes: 211726, size: 211726, sha256: "4de73ce188fa8adec683b6539a6c44d91e3ddb0fa2915e2847bc02a526b8273c", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_E5.wav", inst: "strings.stac", note: "E5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_E4_v2_rr1.wav", size: 106314, sha256: "db063e7e21abb2d3271d0e96068601fbb48a91f2f0bfde8dea773ce1a6bacfb0", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "strings/spic_B5.wav", inst: "strings.stac", note: "B5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_B4_v2_rr1.wav", size: 199926, sha256: "d1495f4eaff7b3e4bd8d86b886dc81ccb52b113fb93630e8f68792ed452dc822", proc: {"trim":true,"norm":-1,"fade":0.2} },
  { pack: "vsco2", file: "bass/upright_E1.wav", inst: "bass.upright", note: "E1", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_E0_v3_rr1.wav", bytes: 388184, size: 388184, sha256: "e7e6dd82064786d59846119272984809db369ef6da0c91cfd09b054fc0e3fef1", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "bass/upright_G1.wav", inst: "bass.upright", note: "G1", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_G0_v3_rr1.wav", bytes: 388184, size: 388184, sha256: "0b05ca1eb5dc66fc6961e5a09a5f84988a62b9e17536e559616f76dc905f9138", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "bass/upright_As1.wav", inst: "bass.upright", note: "A#1", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_A%230_v3_rr1.wav", bytes: 388184, size: 388184, sha256: "65745a9f7e672e6fd1017a7d44ef2c64af0732e1b04ce26a8d2a001ab2f101f2", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "bass/upright_C2.wav", inst: "bass.upright", note: "C2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_C1_v3_rr1.wav", bytes: 388184, size: 388184, sha256: "dca403f85e311cbab345c0c5fa3d8b31052cc71acbe9c653af42aa7a46b9e8a2", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "bass/upright_E2.wav", inst: "bass.upright", note: "E2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_E1_v3_rr1.wav", bytes: 388184, size: 388184, sha256: "e4bf17888d03c209f2edcee47e341bed138d3f39c513370d387738527bcfea4a", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "bass/upright_Gs2.wav", inst: "bass.upright", note: "G#2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_G%231_v1_rr1.wav", bytes: 388184, size: 388184, sha256: "136ec5ea20f8d37603e0b2521c9b780fa394510d3e04b72304423b0404042468", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "bass/upright_Cs3.wav", inst: "bass.upright", note: "C#3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_C%232_v1_rr1.wav", bytes: 388184, size: 388184, sha256: "e4ad6f42acc7510ed1d253d6f36d518459d67151ccdd207b2612f626960a3919", proc: {"trim":true,"norm":-1,"fade":0.4} },
  { pack: "vsco2", file: "brass/horn_D3.wav", inst: "brass", note: "D3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_D2_v2_1.wav", bytes: 564524, size: 564524, sha256: "a511a0296b5aeec019ac406478e5748add82089f72197555d7fdda35813c870d", proc: {"trim":true,"norm":-3,"loop":[1.2,2.9,0.5]} },
  { pack: "vsco2", file: "brass/horn_F3.wav", inst: "brass", note: "F3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_F2_v2_1.wav", bytes: 564524, size: 564524, sha256: "8bac637a6b80d74d8d7d246dffffbd7749ba4acde083cc462427f0c3c482a997", proc: {"trim":true,"norm":-3,"loop":[1.2,2.9,0.5]} },
  { pack: "vsco2", file: "brass/horn_A3.wav", inst: "brass", note: "A3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_A2_v2_1.wav", bytes: 564524, size: 564524, sha256: "66ee51f04c0ab886ff2918e97ed39a01668de9ba5b581fc8221ba90b8762ea89", proc: {"trim":true,"norm":-3,"loop":[1.2,2.9,0.5]} },
  { pack: "vsco2", file: "brass/horn_C4.wav", inst: "brass", note: "C4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_C3_v2_1.wav", bytes: 564524, size: 564524, sha256: "18937fbb51ec9fbb0db9b74e48c879300f099c96ea2640000deb15e4c08aa7dd", proc: {"trim":true,"norm":-3,"loop":[1.2,2.9,0.5]} },
  { pack: "vsco2", file: "brass/tbn_F2.wav", inst: "brass", note: "F2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_F1_v2_1.wav", bytes: 564524, size: 564524, sha256: "debc26d980cc8992f53fd7ea7b23b996b9ff864b6ae1f44f9bcaef45c8191750", proc: {"trim":true,"norm":-3,"loop":[1.2,2.9,0.5]} },
  { pack: "vsco2", file: "brass/tbn_As2.wav", inst: "brass", note: "A#2", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%231_v2_1.wav", bytes: 564524, size: 564524, sha256: "97435a90058e5dbd8774dd5d180357351a0d1701ec0e084367af305017ca96e3", proc: {"trim":true,"norm":-3,"loop":[1.2,2.9,0.5]} },
  { pack: "vsco2", file: "mallets/marimba_C3.wav", inst: "marimba", note: "C3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_C2_loud_01.wav", bytes: 396944, size: 396944, sha256: "57d5643d8995dc9f8ee6fc810d2fd4d46862d82db0d25031f9b8e7284af96cd3", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vsco2", file: "mallets/marimba_G3.wav", inst: "marimba", note: "G3", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_G2_loud_01.wav", bytes: 396944, size: 396944, sha256: "c5e9cf7aa0119e660f379d9dd28f91f661b7d9df0f05c0d9d0d0b9ac63c1df7a", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vsco2", file: "mallets/marimba_F4.wav", inst: "marimba", note: "F4", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_F3_loud_01.wav", bytes: 396944, size: 396944, sha256: "898a9c8588e8743f4e7295204a07d2c015145ee2f3be1f615c4643891aae6a7f", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vsco2", file: "mallets/marimba_C5.wav", inst: "marimba", note: "C5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_C4_loud_01.wav", bytes: 396944, size: 396944, sha256: "8bcd593ffde6ed1a5b6123a69033cb69ec341c7b739e5d1deece08d941c05836", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vsco2", file: "mallets/marimba_G5.wav", inst: "marimba", note: "G5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_G4_loud_01.wav", bytes: 396944, size: 396944, sha256: "86cfc2c220b0e01501e428d1d37cfad46192432d069855fdfa8ae931c3f65b8b", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vsco2", file: "mallets/marimba_F6.wav", inst: "marimba", note: "F6", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_F5_loud_01.wav", bytes: 396944, size: 396944, sha256: "b06a186ab1c023b15e7ea143ce4eafaefb7e0f5b0830e2e4cc1d94710ca4c435", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vsco2", file: "mallets/glock_G5.wav", inst: "glock", note: "G5", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_G4.wav", bytes: 388126, size: 388126, sha256: "4ddc049842642d11ff88380c7cef83bb51d8e823a6f0768aa1fa6c5cafcb192d", proc: {"trim":true,"norm":-1,"fade":0.5} },
  { pack: "vsco2", file: "mallets/glock_C6.wav", inst: "glock", note: "C6", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_C5.wav", bytes: 388126, size: 388126, sha256: "1ed8a3783219aac95ff2108ade5fc703546b751ae6c83a2120559a118a34e74e", proc: {"trim":true,"norm":-1,"fade":0.5} },
  { pack: "vsco2", file: "mallets/glock_G6.wav", inst: "glock", note: "G6", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_G5.wav", bytes: 388126, size: 388126, sha256: "6f25730f90e7dbac63f6f4fbaefb5afe9d2a3c356d9e532248317186c71d48dc", proc: {"trim":true,"norm":-1,"fade":0.5} },
  { pack: "vsco2", file: "mallets/glock_C7.wav", inst: "glock", note: "C7", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_C6.wav", bytes: 388126, size: 388126, sha256: "dc25e21e28b72b9e6c341ef10bf444903be11c53777375885ac0aa72fd60e82f", proc: {"trim":true,"norm":-1,"fade":0.5} },
  { pack: "vsco2", file: "mallets/glock_G7.wav", inst: "glock", note: "G7", url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_G6.wav", bytes: 388126, size: 388126, sha256: "bf4bf3f100f08bb28950ee83325199f49ee775b2dd2a3e7f106a4dde0b19802d", proc: {"trim":true,"norm":-1,"fade":0.5} },
  { pack: "vsco2", file: "fx/timpani_0.wav", inst: "fx.timpani", rr: 0, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v4_rr1_Sum.wav", bytes: 564584, size: 564584, sha256: "50345a9a55de54ea9ad157713a480e178ce1bbefe7224c8e0ecae7521f8d0186", proc: {"trim":true,"norm":-1,"fade":0.8} },
  { pack: "vsco2", file: "fx/timpani_1.wav", inst: "fx.timpani", rr: 1, url: "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v4_rr1_Sum.wav", bytes: 564584, size: 564584, sha256: "91daed5098ad43b12bcde8d7cb4ec094998589439cb92a055a90d23eaf3cceb3", proc: {"trim":true,"norm":-1,"fade":0.8} },
  { pack: "vcsl", file: "kit/kick_6_0.wav", inst: "kit.acoustic", note: "kick", vel: 0.6, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%201/BDrumNew_hit_v5_rr1_Sum.wav", bytes: 158804, size: 158804, sha256: "f2a36254779d3e8f60b9545ae29959db5e4f1c2cd5fc43e56cbc79c102acefb7", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/kick_10_0.wav", inst: "kit.acoustic", note: "kick", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%201/BDrumNew_hit_v7_rr1_Sum.wav", bytes: 158804, size: 158804, sha256: "c5824ef7d0619617a9e33a6b47a256b59021d1ad7bb3cb0c5aefed7c9bb77056", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/snare_6_0.wav", inst: "kit.acoustic", note: "snare", vel: 0.6, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Snare%20Drum%2C%20Modern%201/Snare2_HitSN_v5_rr1_Mid.wav", bytes: 141164, size: 141164, sha256: "2c6d5b87718d00aa3e2b390c3d03f1258340da794b26ac99ac6bd42fb1cd3d4d", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/snare_10_0.wav", inst: "kit.acoustic", note: "snare", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Snare%20Drum%2C%20Modern%201/Snare2_HitSN_v7_rr1_Mid.wav", bytes: 141164, size: 141164, sha256: "a19c76e129e6f142c10c69b1d31ab0ff28c326a582865fa9fa89ddb324c111bd", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/snare_10_1.wav", inst: "kit.acoustic", note: "snare", vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Snare%20Drum%2C%20Modern%201/Snare2_HitSN_v7_rr2_Mid.wav", bytes: 141164, size: 141164, sha256: "56df2021c161098dfb9762830fcdd0d4aa8ef4a3de3131955cccf195319670ea", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/rim_10_0.wav", inst: "kit.acoustic", note: "rim", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Snare%20Drum%2C%20Modern%202/Snare3M_Xstick_v2_rr1_Mid.wav", bytes: 88244, size: 88244, sha256: "9366c9589f3001393b71e8880c4cb587a316f40ce83175bfbb3548521b3534bc", proc: {"trim":true,"norm":-1,"fade":0.16666666666666666} },
  { pack: "vcsl", file: "kit/hat_6_0.wav", inst: "kit.acoustic", note: "hat", vel: 0.6, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hi-Hat%20Cymbal/HiHat_HitC_v2_rr1_Mid.wav", bytes: 88304, size: 88304, sha256: "807545e979202a6566c4285f10c228646c146d74abc1f1f95c92bff0b21c78ce", proc: {"trim":true,"norm":-1,"fade":0.16666666666666666} },
  { pack: "vcsl", file: "kit/hat_10_0.wav", inst: "kit.acoustic", note: "hat", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hi-Hat%20Cymbal/HiHat_HitC_v4_rr1_Mid.wav", bytes: 88304, size: 88304, sha256: "dcfa16315d681e89a2399a274a4af4a6758a00c0f10088753eb2ddeb74d56ef8", proc: {"trim":true,"norm":-1,"fade":0.16666666666666666} },
  { pack: "vcsl", file: "kit/hat_10_1.wav", inst: "kit.acoustic", note: "hat", vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hi-Hat%20Cymbal/HiHat_HitC_v4_rr2_Mid.wav", bytes: 88304, size: 88304, sha256: "52f2d8b120af205c7317b11841117e8e25947d32981becb30eb4ae16ba4d40d4", proc: {"trim":true,"norm":-1,"fade":0.16666666666666666} },
  { pack: "vcsl", file: "kit/openHat_10_0.wav", inst: "kit.acoustic", note: "openHat", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Hi-Hat%20Cymbal/HiHat_HitLoose_rr1_Mid.wav", bytes: 247060, size: 247060, sha256: "c180c72aaec5c12f07d154e0b5f6d9867123e1374b112948748cd3d02416ee06", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/tom_10_0.wav", inst: "kit.acoustic", note: "tom", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%202/Stick/TomL_HitS_v3_rr1_Mid.wav", bytes: 211724, size: 211724, sha256: "bb6c962fb95bf2e1b7b431da99c9334bc7ea7a9e2cc5e105d1a1c2a2e4ca73d9", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/tom_10_1.wav", inst: "kit.acoustic", note: "tom", vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%201/Stick/TomH_HitS_v3_rr1_Mid.wav", bytes: 211724, size: 211724, sha256: "d5dd658f18e89757bba1132dfa3d7cda8f58fd24de2a9e1bc8bfffd4c0745312", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/clap_10_0.wav", inst: "kit.acoustic", note: "clap", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Claps/Clap_rr1.wav", size: 141974, sha256: "4c9f3fe4a34733b9be6ed9ce5e5aad48b19c1029ae9c6dd1b96294a847539e3f", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/clap_10_1.wav", inst: "kit.acoustic", note: "clap", vel: 1, rr: 1, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Claps/Clap_rr3.wav", size: 132222, sha256: "e8c13dc41f31b479f8e3ec49e9dfc49c17d299cce36eedb657fe170f0e6fcb44", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/crash_10_0.wav", inst: "kit.acoustic", note: "crash", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_hit_stick_f1.wav", bytes: 617446, size: 617446, sha256: "650e1203e217831def984f32b80f3335477f1da19ccf457889d0cbda9127a856", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/ride_10_0.wav", inst: "kit.acoustic", note: "ride", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_hit_stick_pp1.wav", bytes: 388126, size: 388126, sha256: "d545643e64a14bdb75f6305c83fe26afbee17d335164e4dd9a99ec1f10fb5cef", proc: {"trim":true,"norm":-1,"fade":0.3} },
  { pack: "vcsl", file: "kit/perc_10_0.wav", inst: "kit.acoustic", note: "perc", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Tambourine%201/Tamb1_Hit_v2_rr1_Mid.wav", bytes: 141224, size: 141224, sha256: "c33221fbd0f2461a062ba03c6615daef7e7b140fa82781bc3ba5bf9b3c289e6e", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/shaker_10_0.wav", inst: "kit.acoustic", note: "shaker", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Shaker%2C%20Small/Mid_Shaker_Slap_rr1.wav", bytes: 88248, size: 88248, sha256: "3e1baa8d071323a66260f26473211429ab1bae76dfe5629c57998a33249218ac", proc: {"trim":true,"norm":-1,"fade":0.16666666666666666} },
  { pack: "vcsl", file: "kit/cowbell_10_0.wav", inst: "kit.acoustic", note: "cowbell", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Cowbells/Cowbell1_Normal_v3_rr1_Mid.wav", bytes: 141224, size: 141224, sha256: "397172b06657623e95ac75ef3fdff5adc5f248f6d512c0051f765eb2c679115d", proc: {"trim":true,"norm":-1,"fade":0.26666666666666666} },
  { pack: "vcsl", file: "kit/claves_10_0.wav", inst: "kit.acoustic", note: "claves", vel: 1, rr: 0, url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Claves/Claves1_Hit_v2_rr1_Mid.wav", bytes: 88304, size: 88304, sha256: "6dab0bdb481380a7e77b912b5e087f68b33b0c8b7d9a4198a1f0d688f6bf952d", proc: {"trim":true,"norm":-1,"fade":0.16666666666666666} },
  { pack: "vcsl", file: "fx/bassdrum.wav", inst: "fx.bassdrum", url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%202/bassdrum_hit_ff.wav", bytes: 617446, size: 617446, sha256: "b93c4018f5be5d2a7d03d8bf8d8871b1c99f8bd135e936232602325acea523a0", proc: {"trim":true,"norm":-1,"fade":0.8} },
  { pack: "vcsl", file: "fx/clash.wav", inst: "fx.clash", url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Clash%20Cymbals%201/cymbal_crash1_ff2.wav", bytes: 705646, size: 705646, sha256: "8c62c14b7daf6fe1a9466eb24d1ae2b9c5379d0044f827294d20f192469c4528", proc: {"trim":true,"norm":-1,"fade":0.8} },
  { pack: "vcsl", file: "fx/cymbal.wav", inst: "fx.cymbal", url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_hit_f1.wav", bytes: 705646, size: 705646, sha256: "f3a24f358934b59e11e33ce7d6c81dc9fc3314b6c22dc10a148035a932aa768f", proc: {"trim":true,"norm":-1,"fade":0.8} },
  { pack: "vcsl", file: "fx/swell.wav", inst: "fx.swell", url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_cresc_4s.wav", size: 2291710, sha256: "bb3b6b251b0b9dac23b7b0fae47aab84a70abbefa4a110b05c9f4ad733e70741", proc: {"trim":false,"norm":-1,"fade":0.05} },
  { pack: "vcsl", file: "fx/gong.mp3", inst: "fx.gong", url: "https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Gong%202/hit_full1.mp3", size: 838404, sha256: "3d0deafcf2b0624076dd924ed72adf7b96b7f0a926c7127bb6eaf28a175921f9" },
  { pack: "tr808", file: "kick_0.mp3", inst: "kit.808", note: "kick", vel: 1, rr: 0, offset: 0, gain: -0.7, url: "https://cdn.freesound.org/previews/519/519306_1478679-hq.mp3", size: 26999, sha256: "0b1d261d67a07801f2657e0452d2fcc23afd6fde87508afd0fa4b6a8474bd973" },
  { pack: "tr808", file: "snare_0.mp3", inst: "kit.808", note: "snare", vel: 1, rr: 0, offset: 0, gain: -0.4, url: "https://cdn.freesound.org/previews/520/520171_1478679-hq.mp3", size: 7933, sha256: "c6c9b735bc88ac786c7332c160764a9e88440e604f243b451d01342586078166" },
  { pack: "tr808", file: "clap_0.mp3", inst: "kit.808", note: "clap", vel: 1, rr: 0, offset: 0, gain: -1.1, url: "https://cdn.freesound.org/previews/519/519305_1478679-hq.mp3", size: 47589, sha256: "e1d675544d934fb5e2ed91bb87e1a83eb99b276f0fa98fa1ed8ee8286681f724" },
  { pack: "tr808", file: "hat_0.mp3", inst: "kit.808", note: "hat", vel: 1, rr: 0, offset: 0, gain: -1.5, url: "https://cdn.freesound.org/previews/519/519308_1478679-hq.mp3", size: 5376, sha256: "4f469635cad162b683b40f5ca5872672fa8da960ca66a95521a7ca71f17a1c94" },
  { pack: "tr808", file: "openHat_0.mp3", inst: "kit.808", note: "openHat", vel: 1, rr: 0, offset: 0.0068, gain: -0.8, url: "https://cdn.freesound.org/previews/519/519307_1478679-hq.mp3", size: 17899, sha256: "e8f46328012710d9fc5af0243538e53aaa23a1bcfc20eb197b9a3ac15290be94" },
  { pack: "tr808", file: "rim_0.mp3", inst: "kit.808", note: "rim", vel: 1, rr: 0, offset: 0, gain: -1, url: "https://cdn.freesound.org/previews/520/520172_1478679-hq.mp3", size: 5115, sha256: "32d9943385aef9bc79b205cc1d0dc0f263f07bb272c23b51207826864c5f35fb" },
  { pack: "tr808", file: "tom_0.mp3", inst: "kit.808", note: "tom", vel: 1, rr: 0, offset: 0, gain: -0.7, url: "https://cdn.freesound.org/previews/520/520169_1478679-hq.mp3", size: 14297, sha256: "647943839a5f4c14d222196ffada9d2c6f483fd13a7c29728bcdcb9d7400e4d6" },
  { pack: "tr808", file: "tom_1.mp3", inst: "kit.808", note: "tom", vel: 1, rr: 1, offset: 0, gain: -0.7, url: "https://cdn.freesound.org/previews/520/520174_1478679-hq.mp3", size: 19826, sha256: "718041996d60bc08ff3ca58b2759f50776ae1dab09af606efd023c9929f09208" },
  { pack: "tr808", file: "tom_2.mp3", inst: "kit.808", note: "tom", vel: 1, rr: 2, offset: 0, gain: -0.7, url: "https://cdn.freesound.org/previews/520/520170_1478679-hq.mp3", size: 15914, sha256: "392e75a8d122f3a40fa9febd938a23f5ad8d354f01f8eae0fc51bef328bfae63" },
  { pack: "tr808", file: "crash_0.mp3", inst: "kit.808", note: "crash", vel: 1, rr: 0, offset: 0, gain: -1.7, url: "https://cdn.freesound.org/previews/519/519302_1478679-hq.mp3", size: 86827, sha256: "b9ecacce55e6dada35ddffad72d1c7f10fc56a932fe55d8c58ccbe86a9492390" },
  { pack: "tr808", file: "cowbell_0.mp3", inst: "kit.808", note: "cowbell", vel: 1, rr: 0, offset: 0, gain: -0.7, url: "https://cdn.freesound.org/previews/519/519303_1478679-hq.mp3", size: 45708, sha256: "3c529155de4967fd48e91edccc863eb02fc6704ba6a00a45c42b44079b786f1d" },
  { pack: "tr808", file: "claves_0.mp3", inst: "kit.808", note: "claves", vel: 1, rr: 0, offset: 0, gain: -1.3, url: "https://cdn.freesound.org/previews/519/519304_1478679-hq.mp3", size: 2348, sha256: "4d9d8cc3fa4c1d2c7330716b40e51b0e02a04b819edcbc5fffbaf14aa599829a" },
  { pack: "tr909", file: "kick_0.mp3", inst: "kit.909", note: "kick", vel: 1, rr: 0, offset: 0.0011, gain: 0.8, url: "https://cdn.freesound.org/previews/414/414970_8070456-hq.mp3", size: 15072, sha256: "8bfdc1640d5ae0ca59db370f26aa5fdb5ac1cc67c15bd3217919dd3800cd1441" },
  { pack: "tr909", file: "kick_1.mp3", inst: "kit.909", note: "kick", vel: 1, rr: 1, offset: 0.0007, gain: 0, url: "https://cdn.freesound.org/previews/414/414969_8070456-hq.mp3", size: 22464, sha256: "7e12b83f17d191c52394428eb29160f619cbbc6ef9f319451c0fe795d1063f80" },
  { pack: "tr909", file: "snare_0.mp3", inst: "kit.909", note: "snare", vel: 1, rr: 0, offset: 0.0004, gain: -2.3, url: "https://cdn.freesound.org/previews/414/414954_8070456-hq.mp3", size: 21408, sha256: "8ee7c2318c8b15429b2628cfe8a01e430c6d1ee11e937589260deffc630f6905" },
  { pack: "tr909", file: "snare_1.mp3", inst: "kit.909", note: "snare", vel: 1, rr: 1, offset: 0.0007, gain: -2.7, url: "https://cdn.freesound.org/previews/414/414955_8070456-hq.mp3", size: 15600, sha256: "be33629f1cc6271352431aafc3d5c91ae67d8acf3b457c9af284f2cc57e16627" },
  { pack: "tr909", file: "clap_0.mp3", inst: "kit.909", note: "clap", vel: 1, rr: 0, offset: 0.0005, gain: -2.8, url: "https://cdn.freesound.org/previews/414/414946_8070456-hq.mp3", size: 25296, sha256: "a0aa87be90bb3810d37139e11277bd91f2abcf358bbdc2f6c5850cd096d184af" },
  { pack: "tr909", file: "clap_1.mp3", inst: "kit.909", note: "clap", vel: 1, rr: 1, offset: 0.0003, gain: -1.6, url: "https://cdn.freesound.org/previews/414/414951_8070456-hq.mp3", size: 24000, sha256: "4f122ebca76c3a26e1e33a06c3b237d470039ef504288698ce84752b5750f27b" },
  { pack: "tr909", file: "hat_0.mp3", inst: "kit.909", note: "hat", vel: 1, rr: 0, offset: 0.0022, gain: 3.5, url: "https://cdn.freesound.org/previews/414/414967_8070456-hq.mp3", size: 8808, sha256: "136a0c0c1519f92e9c05bf17dc86435347e9c240ccccce7a85b80e638abbe558" },
  { pack: "tr909", file: "openHat_0.mp3", inst: "kit.909", note: "openHat", vel: 1, rr: 0, offset: 0.0023, gain: 3.6, url: "https://cdn.freesound.org/previews/414/414964_8070456-hq.mp3", size: 16032, sha256: "5eb183fe707a9bca513b6f15073641d9349dc3eeb6422b4ed40581eb0831d3c3" },
  { pack: "tr909", file: "rim_0.mp3", inst: "kit.909", note: "rim", vel: 1, rr: 0, offset: 0.0003, gain: -3.5, url: "https://cdn.freesound.org/previews/414/414958_8070456-hq.mp3", size: 22944, sha256: "0a9be50dc2a25943f45f2318dba28b2b5bd3a81cd8f0d3b9044528066774fc61" },
  { pack: "tr909", file: "ride_0.mp3", inst: "kit.909", note: "ride", vel: 1, rr: 0, offset: 0.0007, gain: 6, url: "https://cdn.freesound.org/previews/414/414949_8070456-hq.mp3", size: 22464, sha256: "7e807243212a7104f181b6f599da43cbeb491dc31cf1fc612f161a0e9df23484" },
  { pack: "fsfx", file: "riser_0.mp3", inst: "fx.riser", rr: 0, gain: 6.8, url: "https://cdn.freesound.org/previews/620/620818_6998976-hq.mp3", size: 230880, sha256: "eb7c55e6e59c2c0e7815c34b9128c802b8395cdb15b72804ba8f82ed404ee889" },
  { pack: "fsfx", file: "impact_0.mp3", inst: "fx.impact", rr: 0, offset: 0.5478, gain: -0.7, url: "https://cdn.freesound.org/previews/177/177242_3277771-hq.mp3", size: 183264, sha256: "197108983686613d34eba2777e2c3936655367ce557c2f35cdbb6ce4f045eddc" },
  { pack: "fsfx", file: "impact_1.mp3", inst: "fx.impact", rr: 1, offset: 0.0101, gain: -3.7, url: "https://cdn.freesound.org/previews/408/408141_6512973-hq.mp3", size: 156231, sha256: "c462e9177cbc351e15cc2c8743f5f704b17d416c097f35864a9c7cedadb0c1d8" },
  { pack: "fsfx", file: "whoosh_0.mp3", inst: "fx.whoosh", rr: 0, offset: 0.1939, gain: 3.5, url: "https://cdn.freesound.org/previews/683/683101_6253486-hq.mp3", size: 45312, sha256: "3319e044194b8185671ff8d3a2c9660d101fbae67ea31c2f6460e9cf6c1eac9d" },
  { pack: "fsfx", file: "whoosh_1.mp3", inst: "fx.whoosh", rr: 1, offset: 0.548, gain: 0.4, url: "https://cdn.freesound.org/previews/27/27281_181367-hq.mp3", size: 113071, sha256: "4e5ebffa39a9b8e7553f91a7dce1756502bec924f0dd31e241b15fa0e420f313" },
  { pack: "fsfx", file: "revcymbal_0.mp3", inst: "fx.revcymbal", rr: 0, gain: 7.3, url: "https://cdn.freesound.org/previews/110/110218_1763875-hq.mp3", size: 73878, sha256: "718e625538fc12c0aa7f5cb16ce15275133d13f747d9be4dfd319fdd097641f5" },
  { pack: "fsfx", file: "subdrop_0.mp3", inst: "fx.subdrop", rr: 0, offset: 0.0566, gain: -2.1, url: "https://cdn.freesound.org/previews/428/428073_4067257-hq.mp3", size: 44575, sha256: "cd886173aa0270c9adbdb04fa14eb7f4cde53bd70506a4bf8d6e14de00e6bfd9" },
  { pack: "fsfx", file: "vinyl_0.mp3", inst: "fx.vinyl", rr: 0, gain: 4.6, url: "https://cdn.freesound.org/previews/371/371583_140737-hq.mp3", size: 139872, sha256: "afce5e1081409abec6cdacf4781ca975b00962a9e76bb523c9c329b234da52a2" },
  { pack: "wurli", file: "c2f.flac", inst: "keys.wurli", note: "C2", offset: 0.0059, gain: -1, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/c2f.flac", size: 92770, sha256: "08718ed4e5056faebe76474b2ab10e438f7cc12b68a7c36d2e7e870bbae7a940" },
  { pack: "wurli", file: "f2f.flac", inst: "keys.wurli", note: "F2", offset: 0.0006, gain: -1, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/f2f.flac", size: 89272, sha256: "0f0dfdc26e048c1fc9d9a2d28e563e75d3ddfe969ba38f2442add1c3141e56b4" },
  { pack: "wurli", file: "b2f.flac", inst: "keys.wurli", note: "B2", offset: 0.001, gain: -1, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/b2f.flac", size: 76172, sha256: "f108bef2502572820e5e0875e55af7269acecb935bd45c5dc5fb461fbb712586" },
  { pack: "wurli", file: "e3f.flac", inst: "keys.wurli", note: "E3", offset: 0.0004, gain: -0.6, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/e3f.flac", size: 56270, sha256: "ff6cabe344d017ab2f00dfcb62e2017b3f5a6256c6c3694c47ce6bd04be01be0" },
  { pack: "wurli", file: "ab3f.flac", inst: "keys.wurli", note: "G#3", offset: 0, gain: -0.7, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/ab3f.flac", size: 60967, sha256: "0abe94b5e160be20501e99a0816d14d384d5c414e02a29af4c95cf47b9cd0d89" },
  { pack: "wurli", file: "db4f.flac", inst: "keys.wurli", note: "C#4", offset: 0, gain: -0.9, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/db4f.flac", size: 64401, sha256: "ee85bf0a9ae66b56e523cca6823f0246fb83d841c4aa84b0ffa0fd8b294f705c" },
  { pack: "wurli", file: "ab4f.flac", inst: "keys.wurli", note: "G#4", offset: 0, gain: -0.7, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/ab4f.flac", size: 67295, sha256: "eddec48948d58040c634c8755b2c1c07cb47b25b2b3ed639d64a7880f4cde630" },
  { pack: "wurli", file: "db5f.flac", inst: "keys.wurli", note: "C#5", offset: 0.0001, gain: -1, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/db5f.flac", size: 58401, sha256: "ea800df4e60ec214d53ec3034b72284a70cb6293784bea2f0a62be8892d7c2da" },
  { pack: "wurli", file: "g5f.flac", inst: "keys.wurli", note: "G5", offset: 0, gain: -0.9, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/g5f.flac", size: 35062, sha256: "52e029d9cfaa6f0e0251d66d3e887affadc958f474353b282488a87674624c17" },
  { pack: "wurli", file: "db6f.flac", inst: "keys.wurli", note: "C#6", offset: 0.0001, gain: -1, url: "https://raw.githubusercontent.com/sfzinstruments/GregSullivan.E-Pianos/8c3e581acda3594b553948ff0222d4f84a698376/Wurlitzer%20EP200/Samples/db6f.flac", size: 34214, sha256: "ed495b7e8314f498939c6d7904c59eeccd3095ac1b6294744151844457640b7c" },
];
