/*
 * Agent Video Studio — music-as-code runtime (Tone.js).
 * A score calls studio.music({ bpm, beatsPerBar, bars | duration, sections, markers, build(m) }).
 * The renderer runs build() inside Tone.Offline → deterministic WAV + beat map.
 */
(function () {
  'use strict';
  let def = null, resolveDef;
  const defined = new Promise((r) => (resolveDef = r));
  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.message));

  const CHORDS = {
    '': [0, 4, 7], maj: [0, 4, 7], m: [0, 3, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
    '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9],
  };
  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiToNote = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);
  /** chord('Am7', 3) → ['A3','C4','E4','G4'] */
  function chord(name, octave = 4) {
    const mt = /^([A-G][#b]?)(.*)$/.exec(name);
    if (!mt) throw new Error('bad chord ' + name);
    const iv = CHORDS[mt[2]];
    if (!iv) throw new Error('unknown chord quality ' + mt[2]);
    const root = 12 * (octave + 1) + NOTE[mt[1]];
    return iv.map((i) => midiToNote(root + i));
  }
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9], minorPentatonic: [0, 3, 5, 7, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
  /** scale('A', 'minor', 3) → array of 2 octaves of notes */
  function scale(root, kind = 'major', octave = 4, octaves = 2) {
    const r = 12 * (octave + 1) + NOTE[root];
    const out = [];
    for (let o = 0; o < octaves; o++) for (const i of SCALES[kind]) out.push(midiToNote(r + 12 * o + i));
    return out;
  }

  function meta() {
    const bpm = def.bpm || 120, bpb = def.beatsPerBar || 4, spb = 60 / bpm;
    const bars = def.bars || Math.ceil((def.duration || 8) / (spb * bpb));
    const duration = def.duration || bars * bpb * spb;
    const tail = def.tail != null ? def.tail : 1.5;
    const barT = (b, beat = 0) => (b * bpb + beat) * spb;
    const sections = (def.sections || []).map((s, i, arr) => ({ name: s.name, start: barT(s.bar || 0), end: arr[i + 1] ? barT(arr[i + 1].bar) : duration }));
    const markers = (def.markers || []).map((m) => ({ name: m.name, time: barT(m.bar || 0, m.beat || 0) }));
    return { bpm, beatsPerBar: bpb, bars, duration, tail, sections, markers, title: def.title || '' };
  }

  function makeHelpers(Tone, info) {
    const spb = 60 / info.bpm;
    // master: limiter → soft clip (transparent below ~0.6) → destination; render() also normalises overs
    const clip = new Tone.WaveShaper((x) => (Math.abs(x) < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((Math.abs(x) - 0.6) / 0.4))), 4096).toDestination();
    const out = new Tone.Limiter(-1).connect(clip);
    const bus = new Tone.Gain(0.9).connect(out);
    const queue = [];
    const m = {
      Tone, out: bus, master: out, bpm: info.bpm, spb, duration: info.duration, bars: info.bars, beatsPerBar: info.beatsPerBar,
      sections: info.sections, markers: info.markers,
      /** seconds at bar (0-based), beat, sixteenth */
      bar: (b, beat = 0, six = 0) => (b * info.beatsPerBar + beat + six / 4) * spb,
      beat: (n) => n * spb,
      sixteenth: (n) => (n * spb) / 4,
      chord, scale, midiToNote,
      /**
       * steps('x..x..x.x...x...', { from: 0, to: 4, div: 16 }, (time, i, ch) => kick.triggerAttackRelease('C1','8n',time))
       * pattern chars: 'x' hit, 'X' accent, '.' or '-' rest. Pattern loops over [from, to) bars.
       */
      steps(pattern, opts, cb) {
        const { from = 0, to = info.bars, div = 16 } = opts || {};
        const p = pattern.replace(/\s|\|/g, '');
        const stepDur = (spb * info.beatsPerBar) / div;
        const startT = m.bar(from), endT = m.bar(to);
        for (let i = 0, t = startT; t < endT - 1e-6; i++, t += stepDur) {
          const ch = p[i % p.length];
          if (ch === 'x' || ch === 'X') cb(t, i, ch === 'X' ? 1 : 0.75);
        }
      },
      /** every(1, (time, n) => ...) — fire every `beats` beats between bars from..to */
      every(beats, cb, { from = 0, to = info.bars } = {}) {
        for (let t = m.bar(from), n = 0; t < m.bar(to) - 1e-6; t += beats * spb, n++) cb(t, n);
      },
      /**
       * at(time, fn) — queue a trigger; all queued triggers run sorted by time after build().
       * Use it whenever you schedule the same mono instrument from several places (avoids
       * "time must be greater than previous" errors).
       */
      at(time, fn) { queue.push([time, queue.length, fn]); },
      _flush() { queue.sort((a, b) => a[0] - b[0] || a[1] - b[1]); for (const [t, , fn] of queue) fn(t); queue.length = 0; },
      /** section(name) → {start, end} */
      section: (name) => info.sections.find((s) => s.name === name),
      random: (seed = 7) => { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
    };
    return m;
  }

  function encodeWav(channels, sampleRate) {
    const n = channels[0].length, ch = channels.length;
    const buf = new ArrayBuffer(44 + n * ch * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Uint8Array(buf);
  }
  function toBase64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }

  async function render(sampleRate = 48000) {
    await defined;
    const Tone = window.Tone;
    const info = meta();
    let usedTransport = false;
    const buffer = await Tone.Offline(async () => {
      const m = makeHelpers(Tone, info);
      const tr = Tone.getTransport();
      tr.bpm.value = info.bpm;
      const origStart = tr.start.bind(tr);
      tr.start = (...a) => { usedTransport = true; return origStart(...a); };
      await def.build(m);
      m._flush();
      await Tone.loaded();
      if (!usedTransport) origStart(0);
    }, info.duration + info.tail, 2, sampleRate);
    const channels = buffer.toArray();
    const arr = Array.isArray(channels) ? channels : [channels, channels];
    let peak = 0;
    for (const c of arr) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
    if (peak > 0.93) { const g = 0.92 / peak; for (const c of arr) for (let i = 0; i < c.length; i++) c[i] *= g; peak = 0.92; }
    return { meta: info, peak, wav: toBase64(encodeWav(arr, sampleRate)) };
  }

  window.studio = window.studio || {};
  window.studio.music = (d) => { def = d; resolveDef(d); };
  window.__music = { defined, render, meta: async () => { await defined; return meta(); }, errors };
})();
