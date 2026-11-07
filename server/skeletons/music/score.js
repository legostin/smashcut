// Music as code: Tone.js rendered offline. Schedule everything at absolute times from the helpers.
studio.music({
  title: 'New score',
  bpm: 100,
  beatsPerBar: 4,
  bars: 8,
  sections: [{ name: 'a', bar: 0 }, { name: 'b', bar: 4 }],
  markers: [],
  build(m) {
    const { Tone } = m;
    const kick = new Tone.MembraneSynth().connect(m.out);
    const pad = new Tone.PolySynth(Tone.Synth, { envelope: { attack: 0.4, release: 1.2 } }).connect(m.out);
    pad.volume.value = -16;
    m.steps('x...x...x...x...', { from: 0, to: m.bars }, (t) => kick.triggerAttackRelease('C1', '8n', t));
    ['Am', 'F', 'C', 'G'].forEach((c, i) => {
      pad.triggerAttackRelease(m.chord(c, 3), m.bar(1), m.bar(i));
      pad.triggerAttackRelease(m.chord(c, 3), m.bar(1), m.bar(i + 4));
    });
  },
});
