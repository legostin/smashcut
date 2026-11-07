studio.music({
  title: 'Lofi Chill 84',
  bpm: 84,
  beatsPerBar: 4,
  bars: 16,
  sections: [
    { name: 'intro', bar: 0 },
    { name: 'groove', bar: 4 },
    { name: 'break', bar: 12 },
    { name: 'outro', bar: 14 },
  ],
  markers: [
    { name: 'drums-in', bar: 4 },
    { name: 'break', bar: 12 },
    { name: 'drums-back', bar: 14 },
  ],
  build(m) {
    const { Tone } = m;
    // safety bus: transparent below 0.6, soft-saturates above, so transients can never clip
    const safe = new Tone.WaveShaper((x) => { const a = Math.abs(x); return a <= 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)); }, 4096).connect(m.out);
    const OUT = new Tone.Gain(1).connect(safe);
    const six = m.spb / 4;
    const SWING = 0.22; // fraction of a 16th that off-beat 16ths are delayed
    const sw = (t, i) => (i % 2 === 1 ? t + six * SWING : t);
    const rnd = m.random(84);
    // monophonic Tone instruments need time-ordered triggers: queue everything, flush sorted at the end
    const Q = [];
    const at = (t, fn) => Q.push([t, Q.length, fn]);

    // ---- buses ----
    const warm = new Tone.Filter(7000, 'lowpass').connect(OUT); // dusty top end on everything
    const verb = new Tone.Reverb({ decay: 3.5, wet: 1 }).connect(warm);
    const verbSend = new Tone.Gain(0.25).connect(verb);

    // ---- keys: soft e-piano with tape wobble ----
    const keysOut = new Tone.Gain(1).connect(warm);
    const keysFilter = new Tone.Filter(2200, 'lowpass').connect(keysOut);
    keysFilter.connect(verbSend);
    const wobble = new Tone.Vibrato({ frequency: 0.5, depth: 0.12 }).connect(keysFilter);
    const keys = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2, modulationIndex: 1.6,
      oscillator: { type: 'sine' }, modulation: { type: 'sine' },
      envelope: { attack: 0.005, decay: 1.6, sustain: 0.25, release: 1.4 },
      modulationEnvelope: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.5 },
    }).connect(wobble);
    keys.volume.value = -4;
    keys.maxPolyphony = 24;

    const prog = ['Dm9', 'G7', 'Cmaj7', 'Am7'];
    const roots = ['D2', 'G1', 'C2', 'A1'];
    const strum = (name, t, vel, oct = 3) => m.chord(name, oct).forEach((n, k) => { const tt = t + k * 0.018 + rnd() * 0.006; at(tt, () => keys.triggerAttackRelease(n, m.spb * 2.2, tt, vel)); });
    for (let b = 0; b < m.bars; b++) {
      const c = prog[b % 4];
      const breakBar = b >= 12 && b < 14;
      strum(c, m.bar(b), 0.7 + rnd() * 0.1);
      if (!breakBar || b === 13) strum(c, sw(m.bar(b, 2, 2), 1) + six * 0, 0.5 + rnd() * 0.1, 3);
    }
    // filter closes during the break, re-opens for the outro
    keysFilter.frequency.setValueAtTime(2200, m.bar(12));
    keysFilter.frequency.linearRampToValueAtTime(700, m.bar(12, 2));
    keysFilter.frequency.setValueAtTime(700, m.bar(13, 3));
    keysFilter.frequency.linearRampToValueAtTime(2200, m.bar(14));

    // little melodic answer phrases on the top in the groove section
    const lead = new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 0.6 } }).connect(wobble);
    lead.volume.value = -10;
    const phrase = [['A4', 0, 0.5], ['C5', 0.5, 0.5], ['E5', 1, 1], ['D5', 2.5, 0.5], ['C5', 3, 1]];
    [5, 9].forEach((b) => phrase.forEach(([n, beat, d], i) => { const tt = sw(m.bar(b, beat), Math.round(beat * 4) % 2 ? 1 : 0) + 0.01 * i; at(tt, () => lead.triggerAttackRelease(n, d * m.spb, tt, 0.6)); }));
    [7, 11].forEach((b) => [['G4', 0, 0.5], ['A4', 0.5, 0.5], ['C5', 1, 1.5], ['B4', 3, 1]].forEach(([n, beat, d]) => { const tt = m.bar(b, beat); at(tt, () => lead.triggerAttackRelease(n, d * m.spb, tt, 0.55)); }));

    // ---- bass ----
    const bass = new Tone.MonoSynth({ oscillator: { type: 'triangle' }, filter: { type: 'lowpass', Q: 1 }, filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, baseFrequency: 180, octaves: 1.5 }, envelope: { attack: 0.01, decay: 0.4, sustain: 0.7, release: 0.3 } }).connect(warm);
    bass.volume.value = -9;
    for (let b = 4; b < 16; b++) {
      if (b === 12 || b === 13) continue;
      const r = roots[b % 4];
      at(m.bar(b), () => bass.triggerAttackRelease(r, m.spb * 1.4, m.bar(b), 0.9));
      at(sw(m.bar(b, 1, 3), 1), () => bass.triggerAttackRelease(r, m.spb * 0.4, sw(m.bar(b, 1, 3), 1), 0.6));
      at(m.bar(b, 2, 2), () => bass.triggerAttackRelease(Tone.Frequency(r).transpose(7).toNote(), m.spb * 0.9, m.bar(b, 2, 2), 0.7));
    }

    // ---- drums ----
    const drums = new Tone.Gain(1).connect(warm);
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 5, envelope: { attack: 0.002, decay: 0.45, sustain: 0 } }).connect(drums);
    kick.volume.value = -7;
    const snF = new Tone.Filter(1600, 'bandpass').connect(drums);
    snF.connect(verbSend);
    const snare = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.2, sustain: 0 } }).connect(snF);
    snare.volume.value = -9;
    const snBody = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).connect(drums);
    snBody.volume.value = -16;
    const hhF = new Tone.Filter(7500, 'highpass').connect(drums);
    const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.04, sustain: 0 } }).connect(hhF);
    hat.volume.value = -24;

    const drumOn = (b) => b >= 4 && !(b === 12 || b === 13);
    m.steps('x.........x.....|x.......x.x.....', { from: 4, to: 16 }, (t, i) => { const b = Math.floor(t / m.bar(1) + 1e-6); if (drumOn(b)) at(sw(t, i), () => kick.triggerAttackRelease('C1', '8n', sw(t, i), 0.9)); });
    m.steps('....x.......x...', { from: 4, to: 16 }, (t, i) => { const b = Math.floor(t / m.bar(1) + 1e-6); if (drumOn(b)) at(t + 0.012, () => { snare.triggerAttackRelease('16n', t + 0.012, 0.9); snBody.triggerAttackRelease('G2', '32n', t + 0.012, 0.6); }); });
    m.steps('x.x.x.x.x.x.x.xx', { from: 4, to: 16 }, (t, i) => { const b = Math.floor(t / m.bar(1) + 1e-6); if (drumOn(b) || (b === 13 && i % 16 >= 8)) { const v = (i % 4 === 0 ? 0.9 : 0.55) + rnd() * 0.15; at(sw(t, i), () => hat.triggerAttackRelease('32n', sw(t, i), v)); } });
    // break: just a lazy hat + snare roll lead-in
    [3, 3.5, 3.75].forEach((beat) => at(m.bar(13, beat), () => snare.triggerAttackRelease('32n', m.bar(13, beat), 0.4)));

    // ---- vinyl layer: hiss + deterministic crackle ----
    const hiss = new Tone.Noise('pink');
    const hissF = new Tone.Filter({ type: 'bandpass', frequency: 3500, Q: 0.6 }).connect(OUT);
    const hissG = new Tone.Gain(0.0).connect(hissF);
    hiss.connect(hissG);
    hiss.volume.value = -30;
    hiss.start(0).stop(m.duration + 1);
    hissG.gain.setValueAtTime(0, 0);
    hissG.gain.linearRampToValueAtTime(0.5, 1.2);
    hissG.gain.setValueAtTime(0.5, m.duration - 1);
    hissG.gain.linearRampToValueAtTime(0, m.duration + 1);
    const crackF = new Tone.Filter(2500, 'highpass').connect(OUT);
    const crack = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.0005, decay: 0.006, sustain: 0 } }).connect(crackF);
    crack.volume.value = -26;
    for (let t = 0.05; t < m.duration; t += 0.03 + rnd() * 0.22) { const v = 0.2 + rnd() * 0.8; crack.triggerAttackRelease(0.004, t, v); }

    // final chord ring-out
    strum('Dm9', m.bar(16) - 0.001, 0.6);

    Q.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach((e) => e[2]());
  },
});
