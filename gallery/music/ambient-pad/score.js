studio.music({
  title: 'Ambient Drift',
  bpm: 72,
  beatsPerBar: 4,
  bars: 16,
  tail: 6,
  sections: [
    { name: 'dawn', bar: 0 },
    { name: 'bloom', bar: 4 },
    { name: 'drift', bar: 10 },
    { name: 'fade', bar: 14 },
  ],
  markers: [
    { name: 'bloom', bar: 4 },
    { name: 'peak', bar: 8 },
    { name: 'drift', bar: 10 },
    { name: 'fade', bar: 14 },
  ],
  build(m) {
    const { Tone } = m;
    // safety bus: transparent below 0.6, soft-saturates above, so transients can never clip
    const safe = new Tone.WaveShaper((x) => { const a = Math.abs(x); return a <= 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)); }, 4096).connect(m.out);
    const OUT = new Tone.Gain(1).connect(safe);
    const Q = [];
    const at = (t, fn) => Q.push([t, Q.length, fn]);
    const rnd = m.random(72);
    const END = m.bar(16);

    const space = new Tone.Reverb({ decay: 10, wet: 1 }).connect(OUT);
    const send = new Tone.Gain(0.6).connect(space);
    const master = new Tone.Gain(0).connect(OUT); // global swell in / fade out
    master.connect(send);
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(1, m.bar(3));
    master.gain.setValueAtTime(1, m.bar(14));
    master.gain.linearRampToValueAtTime(0.0, END + 3);

    const prog = ['Fmaj9', 'Cadd9', 'Am9', 'Gsus2'];
    const oct = [3, 3, 3, 3];

    // ---- pad layer A: soft triangles, slow swells (2 bars per chord) ----
    const padAF = new Tone.AutoFilter({ frequency: 0.06, baseFrequency: 350, octaves: 3, depth: 0.8, wet: 1 }).connect(master);
    padAF.start(0);
    const padA = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fattriangle', count: 3, spread: 18 }, envelope: { attack: 3.5, decay: 1, sustain: 0.9, release: 5 } }).connect(padAF);
    padA.volume.value = -13;
    padA.maxPolyphony = 32;
    for (let b = 0; b < 16; b += 2) {
      const i = (b / 2) % 4;
      at(m.bar(b), () => padA.triggerAttackRelease(m.chord(prog[i], oct[i]), m.bar(2) * 1.05, m.bar(b), 0.6));
    }

    // ---- pad layer B: airy saws an octave up, enters at the bloom and breathes with a slow tremolo ----
    const padBF = new Tone.Filter(2400, 'lowpass').connect(master);
    const trem = new Tone.Tremolo({ frequency: 0.18, depth: 0.5 }).connect(padBF);
    trem.start(0);
    const padB = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 40 }, envelope: { attack: 5, decay: 1, sustain: 0.8, release: 6 } }).connect(trem);
    padB.volume.value = -27;
    padB.maxPolyphony = 32;
    for (let b = 4; b < 14; b += 2) {
      const i = (b / 2) % 4;
      const notes = m.chord(prog[i], 4).slice(1, 4);
      at(m.bar(b), () => padB.triggerAttackRelease(notes, m.bar(2) * 1.05, m.bar(b), 0.5));
    }

    // ---- sub drone on the roots ----
    const subG = new Tone.Gain(0).connect(master);
    const sub = new Tone.Oscillator({ frequency: 'F1', type: 'sine' }).connect(subG);
    sub.start(0).stop(END + 4);
    const rootsHz = ['F1', 'C2', 'A1', 'G1'];
    for (let b = 0; b < 16; b += 2) sub.frequency.setValueAtTime(Tone.Frequency(rootsHz[(b / 2) % 4]).toFrequency(), m.bar(b));
    subG.gain.setValueAtTime(0, 0);
    subG.gain.linearRampToValueAtTime(0.09, m.bar(4));
    subG.gain.setValueAtTime(0.09, m.bar(10));
    subG.gain.linearRampToValueAtTime(0.05, m.bar(12));

    // ---- wind: filtered pink noise drifting ----
    const wind = new Tone.Noise('pink');
    const windF = new Tone.AutoFilter({ frequency: 0.045, baseFrequency: 300, octaves: 3.5, depth: 1, wet: 1, filter: { type: 'bandpass', Q: 1.5 } }).connect(master);
    windF.start(0);
    const windG = new Tone.Gain(0.05).connect(windF);
    wind.connect(windG);
    wind.start(0).stop(END + 4);

    // ---- shimmer: sparse bell notes from the pentatonic, denser at the peak ----
    const shDelay = new Tone.FeedbackDelay({ delayTime: m.spb * 1.5, feedback: 0.45, wet: 0.45 }).connect(master);
    const bell = new Tone.PolySynth(Tone.FMSynth, { harmonicity: 4, modulationIndex: 3, oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 2.5, sustain: 0, release: 2.5 }, modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0, release: 0.5 } }).connect(shDelay);
    bell.volume.value = -19;
    const pent = m.scale('C', 'pentatonic', 5, 2);
    for (let t = m.bar(2); t < m.bar(15); ) {
      const dens = t > m.bar(6) && t < m.bar(11) ? 1.6 : 0.8; // notes per bar-ish
      const n = pent[Math.floor(rnd() * pent.length)];
      const v = 0.3 + rnd() * 0.4;
      const tt = t;
      at(tt, () => bell.triggerAttackRelease(n, 2, tt, v));
      t += (m.bar(1) / dens) * (0.5 + rnd());
    }

    // ---- low piano-like swell at the peak ----
    const low = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 1.5, decay: 2, sustain: 0.6, release: 4 } }).connect(master);
    low.volume.value = -16;
    at(m.bar(8), () => low.triggerAttackRelease(['A2', 'E3', 'C4'], m.bar(2), m.bar(8), 0.7));
    at(m.bar(10), () => low.triggerAttackRelease(['G2', 'D3', 'B3'], m.bar(2), m.bar(10), 0.6));

    // final resolve chord into the tail
    at(m.bar(16) - 0.01, () => padA.triggerAttackRelease(m.chord('Fmaj9', 3), 4, m.bar(16) - 0.01, 0.5));

    Q.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach((e) => e[2]());
  },
});
