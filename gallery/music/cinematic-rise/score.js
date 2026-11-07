studio.music({
  title: 'Cinematic Rise',
  bpm: 76,
  beatsPerBar: 4,
  bars: 16,
  tail: 4,
  sections: [
    { name: 'calm', bar: 0 },
    { name: 'build', bar: 4 },
    { name: 'rise', bar: 9 },
    { name: 'hit', bar: 12 },
    { name: 'resolve', bar: 13 },
  ],
  markers: [
    { name: 'build', bar: 4 },
    { name: 'riser', bar: 9 },
    { name: 'silence', bar: 11, beat: 3 },
    { name: 'hit', bar: 12 },
    { name: 'final', bar: 15 },
  ],
  build(m) {
    const { Tone } = m;
    // safety bus: transparent below 0.6, soft-saturates above, so transients can never clip
    const safe = new Tone.WaveShaper((x) => { const a = Math.abs(x); return a <= 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)); }, 4096).connect(m.out);
    const OUT = new Tone.Gain(1).connect(safe);
    const Q = [];
    const at = (t, fn) => Q.push([t, Q.length, fn]);
    const HIT = m.bar(12);
    const GAP = m.bar(11, 3); // a beat of silence before the hit

    const hall = new Tone.Reverb({ decay: 7, wet: 1 }).connect(OUT);
    const send = new Tone.Gain(0.45).connect(hall);

    // ---- drone + pad (filter opens through the build) ----
    const padF = new Tone.Filter(400, 'lowpass').connect(OUT);
    padF.connect(send);
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 24 }, envelope: { attack: 2.5, decay: 1, sustain: 0.8, release: 3 } }).connect(padF);
    pad.volume.value = -23;
    pad.volume.setValueAtTime(-23, 0);
    pad.volume.linearRampToValueAtTime(-15, GAP);
    padF.frequency.setValueAtTime(350, 0);
    padF.frequency.exponentialRampToValueAtTime(900, m.bar(8));
    padF.frequency.exponentialRampToValueAtTime(2600, GAP);
    const prog = ['Dm', 'Bb', 'F', 'C'];
    const progOct = [3, 2, 3, 3];
    for (let b = 0; b < 12; b += 2) {
      const i = (b / 2) % 4;
      const dur = Math.min(m.bar(2) * 0.98, GAP - m.bar(b));
      at(m.bar(b), () => pad.triggerAttackRelease(m.chord(prog[i], progOct[i]), dur, m.bar(b), 0.7));
    }
    const dG = new Tone.Gain(0).connect(OUT);
    const sub = new Tone.Oscillator({ frequency: 'D1', type: 'sine' }).connect(dG);
    sub.start(0).stop(HIT + m.bar(4));
    dG.gain.setValueAtTime(0, 0); dG.gain.linearRampToValueAtTime(0.035, m.bar(2));
    dG.gain.linearRampToValueAtTime(0.11, GAP - 0.05); dG.gain.linearRampToValueAtTime(0, GAP);
    dG.gain.setValueAtTime(0.14, HIT); dG.gain.exponentialRampToValueAtTime(0.001, HIT + m.bar(3));

    // ---- piano ostinato ----
    const piano = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.004, decay: 1.2, sustain: 0.05, release: 1.2 } }).connect(OUT);
    piano.connect(send);
    piano.volume.value = -12;
    const ost = { Dm: ['D4', 'A4', 'F4', 'A4'], Bb: ['D4', 'Bb4', 'F4', 'Bb4'], F: ['C4', 'A4', 'F4', 'A4'], C: ['C4', 'G4', 'E4', 'G4'] };
    m.every(0.5, (t, n) => {
      if (t >= GAP) return;
      const bar = Math.floor(t / m.bar(1) + 1e-6);
      const notes = ost[prog[Math.floor(bar / 2) % 4]];
      const v = 0.35 + 0.35 * Math.min(1, t / m.bar(10));
      at(t, () => piano.triggerAttackRelease(notes[n % 4], m.spb * 0.6, t, v));
    }, { from: 0, to: 12 });

    // ---- string pulses (16ths) from bar 6 ----
    const strF = new Tone.Filter(1800, 'lowpass').connect(OUT);
    strF.connect(send);
    const str = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.12, sustain: 0.3, release: 0.08 } }).connect(strF);
    str.volume.value = -22;
    m.steps('xxxxxxxxxxxxxxxx', { from: 6, to: 12 }, (t, i) => {
      if (t >= GAP) return;
      const bar = Math.floor(t / m.bar(1) + 1e-6);
      const ch = m.chord(prog[Math.floor(bar / 2) % 4], 3).slice(0, 2);
      const v = 0.3 + 0.6 * ((t - m.bar(6)) / (GAP - m.bar(6))) * (i % 4 === 0 ? 1 : 0.7);
      at(t, () => str.triggerAttackRelease(ch, m.spb / 4 * 0.8, t, v));
    });

    // ---- toms: density grows ----
    const tom = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.002, decay: 0.8, sustain: 0 } }).connect(OUT);
    tom.connect(send);
    tom.volume.value = -9;
    const tomPat = (b) => (b < 6 ? 'x.......x.......' : b < 9 ? 'x.....x.x.......' : b < 11 ? 'x..x..x.x..x.x..' : 'x.x.x.x.xxxxxxxx');
    for (let b = 4; b < 12; b++) {
      const pat = tomPat(b);
      for (let i = 0; i < 16; i++) {
        if (pat[i] !== 'x') continue;
        const t = m.bar(b, 0, i);
        if (t >= GAP) continue;
        const v = 0.5 + 0.5 * ((b - 4) / 8);
        at(t, () => tom.triggerAttackRelease(i % 8 === 0 ? 'D1' : 'A1', '8n', t, v));
      }
    }

    // ---- riser + snare roll into the gap ----
    const riser = new Tone.Noise('white');
    const rF = new Tone.Filter({ type: 'bandpass', frequency: 300, Q: 2 }).connect(OUT);
    rF.connect(send);
    const rG = new Tone.Gain(0).connect(rF);
    riser.connect(rG);
    riser.start(m.bar(9)).stop(GAP);
    rG.gain.setValueAtTime(0, m.bar(9)); rG.gain.linearRampToValueAtTime(0.2, GAP - 0.02); rG.gain.linearRampToValueAtTime(0, GAP);
    rF.frequency.setValueAtTime(300, m.bar(9)); rF.frequency.exponentialRampToValueAtTime(9000, GAP);
    const snF = new Tone.Filter(2500, 'bandpass').connect(OUT);
    snF.connect(send);
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0 } }).connect(snF);
    snare.volume.value = -10;
    for (let t = m.bar(10), k = 0; t < GAP - 1e-6; k++) {
      const p = (t - m.bar(10)) / (GAP - m.bar(10));
      at(t, () => snare.triggerAttackRelease(0.05, t, 0.2 + 0.8 * p));
      t += p < 0.5 ? m.spb / 4 : p < 0.8 ? m.spb / 6 : m.spb / 8;
    }

    // ---- THE HIT ----
    const boom = new Tone.MembraneSynth({ pitchDecay: 0.25, octaves: 6, envelope: { attack: 0.001, decay: 3, sustain: 0 } }).connect(OUT);
    boom.volume.value = -9;
    const crashF = new Tone.Filter(3000, 'highpass').connect(hall);
    const crash = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 2.5, sustain: 0 } }).connect(crashF);
    crash.connect(OUT);
    crash.volume.value = -20;
    const brass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 18 }, envelope: { attack: 0.03, decay: 1.5, sustain: 0.5, release: 2.5 } });
    const brassF = new Tone.Filter(1400, 'lowpass').connect(OUT);
    brassF.connect(send);
    brass.connect(brassF);
    brass.volume.value = -10;
    const hitAt = (t, chordNotes, v = 1) => {
      at(t, () => boom.triggerAttackRelease('A0', 2.5, t, v));
      at(t, () => crash.triggerAttackRelease(2, t, 0.8 * v));
      at(t, () => brass.triggerAttackRelease(chordNotes, m.bar(1) * 0.9, t, 0.9 * v));
      at(t, () => tom.triggerAttackRelease('D1', '4n', t, v));
    };
    hitAt(HIT, ['D2', 'A2', 'D3', 'F3', 'A3']);

    // ---- resolve: wide pad, half-time toms, final hit ----
    [[13, 'Bb', 2], [14, 'C', 3]].forEach(([b, c, o]) => at(m.bar(b), () => pad.triggerAttackRelease(m.chord(c, o), m.bar(1) * 0.98, m.bar(b), 0.8)));
    padF.frequency.setValueAtTime(2600, HIT);
    m.steps('x.......x.......', { from: 13, to: 15 }, (t) => at(t, () => tom.triggerAttackRelease('D1', '8n', t, 0.6)));
    const resProg = { 13: 'Bb', 14: 'C' };
    m.every(0.5, (t, n) => {
      const bar = Math.floor(t / m.bar(1) + 1e-6);
      const c = resProg[bar] || 'Dm';
      at(t, () => piano.triggerAttackRelease(ost[c][n % 4].replace('4', '5'), m.spb * 0.6, t, 0.45));
    }, { from: 12.5, to: 15 });
    m.steps('x.x.x.x.x.x.x.x.', { from: 13, to: 15 }, (t) => {
      const bar = Math.floor(t / m.bar(1) + 1e-6);
      at(t, () => str.triggerAttackRelease(m.chord(resProg[bar] || 'Dm', 3).slice(0, 3), m.spb / 2 * 0.8, t, 0.6));
    });
    hitAt(m.bar(15), ['D2', 'A2', 'D3', 'F3', 'A3', 'D4'], 0.9);
    at(m.bar(15), () => pad.triggerAttackRelease(m.chord('Dm', 3), m.bar(1), m.bar(15), 0.7));

    Q.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach((e) => e[2]());
  },
});
