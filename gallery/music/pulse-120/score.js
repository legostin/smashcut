studio.music({
  title: 'Pulse 120',
  bpm: 120,
  beatsPerBar: 4,
  bars: 16,
  sections: [
    { name: 'intro', bar: 0 },
    { name: 'build', bar: 4 },
    { name: 'drop', bar: 8 },
    { name: 'outro', bar: 14 },
  ],
  markers: [{ name: 'impact', bar: 8 }],
  build(m) {
    const { Tone } = m;
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } }).connect(m.out);
    kick.volume.value = -4;
    const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } });
    const hatFilter = new Tone.Filter(8000, 'highpass').connect(m.out);
    hat.connect(hatFilter); hat.volume.value = -22;
    const clap = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.18, sustain: 0 } });
    const clapFilter = new Tone.Filter(1800, 'bandpass').connect(m.out);
    clap.connect(clapFilter); clap.volume.value = -12;

    const duck = new Tone.Gain(1).connect(m.out);
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.35 }).connect(duck);
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 30 }, envelope: { attack: 0.6, decay: 0.3, sustain: 0.7, release: 1.5 } }).connect(reverb);
    pad.volume.value = -20;
    const arp = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.1, release: 0.1 } });
    const arpDelay = new Tone.FeedbackDelay('8n.', 0.3).connect(reverb);
    arp.connect(arpDelay); arp.volume.value = -18;
    const bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass' }, filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.2, baseFrequency: 80, octaves: 2.5 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.1 } }).connect(duck);
    bass.volume.value = -10;

    const prog = ['Am7', 'Fmaj7', 'C', 'G'];
    // pad: one chord per bar throughout
    for (let b = 0; b < m.bars; b++) pad.triggerAttackRelease(m.chord(prog[b % 4], 3), m.bar(1) * 0.95, m.bar(b));

    // kick: from bar 4 (build: quarter notes), full drop from 8, stop at 14
    m.steps('x...x...x...x...', { from: 4, to: 14 }, (t) => {
      kick.triggerAttackRelease('C1', '8n', t);
      duck.gain.setValueAtTime(0.35, t); duck.gain.linearRampToValueAtTime(1, t + 0.22);
    });
    m.steps('..x...x...x...x.', { from: 2, to: 14 }, (t, i, v) => hat.triggerAttackRelease('32n', t, v));
    m.steps('....x.......x...', { from: 8, to: 14 }, (t) => clap.triggerAttackRelease('16n', t));

    // bass on the drop: root of the chord in 8ths
    const roots = ['A1', 'F1', 'C2', 'G1'];
    m.steps('x.xxx.xxx.xxx.x.', { from: 8, to: 14 }, (t, i) => {
      const bar = Math.floor(t / m.bar(1));
      bass.triggerAttackRelease(roots[bar % 4], '16n', t);
    });

    // arpeggio from build
    const arpNotes = m.scale('A', 'minorPentatonic', 4, 2);
    const rnd = m.random(42);
    m.steps('x.x.x.x.x.x.x.x.', { from: 4, to: 16 }, (t, i) => arp.triggerAttackRelease(arpNotes[Math.floor(rnd() * arpNotes.length)], '16n', t));

    // riser into the drop
    const riser = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: m.bar(2), decay: 0.01, sustain: 1, release: 0.05 } });
    const rf = new Tone.Filter(400, 'bandpass').connect(m.out);
    riser.connect(rf); riser.volume.value = -24;
    riser.triggerAttackRelease(m.bar(2), m.bar(6));
    rf.frequency.setValueAtTime(400, m.bar(6)); rf.frequency.exponentialRampToValueAtTime(9000, m.bar(8));
  },
});
