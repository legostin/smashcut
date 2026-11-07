import fs from 'node:fs';
import type { Timing, MusicMeta } from '../shared/types.ts';
import { cur, hasProject } from './project.ts';
import { readJson, writeJson } from './util.ts';
import type { AudioAnalysis } from './audio/analyze.ts';
import type { Transcript } from './audio/transcribe.ts';

/**
 * Project-wide timing in project seconds: beats/bars/sections/markers from music items
 * (and analysed audio items), transcript words from media items on the timeline.
 */
export function computeTiming(): Timing {
  const store = cur();
  const p = store.project;
  const t: Timing = { bpm: 0, beats: [], bars: [], sections: [], markers: [], words: [] };
  const inRange = (x: number, it: { start: number; duration: number }) => x >= it.start - 1e-6 && x <= it.start + it.duration + 1e-6;
  const items = [...p.items].sort((a, b) => a.start - b.start);
  for (const it of items) {
    const off = it.start - it.in;
    if (it.kind === 'music') {
      const meta = readJson<{ meta?: MusicMeta }>(store.p('.studio', 'music', it.ref + '.json'), {}).meta;
      if (!meta) continue;
      if (!t.bpm) t.bpm = meta.bpm;
      const spb = 60 / meta.bpm;
      const total = Math.ceil(meta.duration / spb);
      for (let i = 0; i <= total; i++) {
        const x = off + i * spb;
        if (inRange(x, it)) { t.beats.push(+x.toFixed(4)); if (i % meta.beatsPerBar === 0) t.bars.push(+x.toFixed(4)); }
      }
      for (const s of meta.sections) if (inRange(off + s.start, it)) t.sections.push({ name: s.name, start: +(off + s.start).toFixed(4), end: +Math.min(off + s.end, it.start + it.duration).toFixed(4) });
      for (const m of meta.markers) if (inRange(off + m.time, it)) t.markers.push({ name: m.name, time: +(off + m.time).toFixed(4) });
    }
    if (it.kind === 'media') {
      const an = readJson<AudioAnalysis | null>(store.p('.studio', 'analysis', it.ref + '.json'), null);
      if (an && an.beats.length && !t.beats.length) {
        t.bpm = an.bpm;
        an.beats.forEach((b, i) => { const x = off + b; if (inRange(x, it)) { t.beats.push(+x.toFixed(4)); if (i % 4 === 0) t.bars.push(+x.toFixed(4)); } });
      }
      const tr = readJson<Transcript | null>(store.p('.studio', 'transcripts', it.ref + '.json'), null);
      if (tr) for (const w of tr.words) { const s = off + w.start; if (inRange(s, it)) t.words.push({ text: w.text, start: +s.toFixed(3), end: +(off + w.end).toFixed(3) }); }
    }
  }
  for (const m of p.markers) t.markers.push({ name: m.label, time: m.time });
  t.beats.sort((a, b) => a - b);
  t.words.sort((a, b) => a.start - b.start);
  if (!t.bpm) t.bpm = 120;
  return t;
}

let last = '';
export function recomputeTiming() {
  if (!hasProject()) return null;
  const t = computeTiming();
  const s = JSON.stringify(t);
  if (s !== last) {
    last = s;
    writeJson(cur().p('.studio', 'timing.json'), t);
  }
  return t;
}
export function getTiming(): Timing {
  const f = cur().p('.studio', 'timing.json');
  if (!fs.existsSync(f)) return recomputeTiming()!;
  return readJson<Timing>(f, recomputeTiming()!);
}
