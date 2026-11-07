studio.music({
  title: 'Synthwave Drive 104',
  bpm: 104,
  beatsPerBar: 4,
  bars: 16,
  tail: 2.5,
  sections: [
    { name: 'intro', bar: 0 },
    { name: 'drive', bar: 4 },
    { name: 'lead', bar: 8 },
    { name: 'outro', bar: 14 },
  ],
  markers: [
    { name: 'drums-in', bar: 4 },
    { name: 'lead-in', bar: 8 },
    { name: 'outro', bar: 14 },
  ],
  build(m) {
    const { Tone } = m;
    // safety bus: transparent below 0.6, soft-saturates above, so transients can never clip
    const safe = new Tone.WaveShaper((x) => { const a = Math.abs(x); return a <= 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)); }, 4096).connect(m.out);
    const OUT = new Tone.Gain(1).connect(safe);
    const Q = [];
    const at = (t, fn) => Q.push([t, Q.length, fn]);
    const barOf = (t) => Math.floor(t / m.bar(1) + 1e-6);
    const prog = ['Am', 'F', 'C', 'G'];
    const roots = ['A1', 'F1', 'C2', 'G1'];
    const END = m.bar(16);

    const hall = new Tone.Reverb({ decay: 4.5, wet: 1 }).connect(OUT);
    const send = new Tone.Gain(0.3).connect(hall);
    const duck = new Tone.Gain(1).connect(OUT);
    duck.connect(send);

    // ---- pad: wide detuned saws + chorus ----
    const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 4, depth: 0.6, wet: 0.6 }).connect(duck);
    chorus.start();
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 4, spread: 35 }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 1.8 } });
    const padF = new Tone.Filter(1400, 'lowpass').connect(chorus);
    pad.connect(padF);
    pad.volume.value = -19;
    for (let b = 0; b < 16; b++) at(m.bar(b), () => pad.triggerAttackRelease(m.chord(prog[b % 4], 3), m.bar(1) * 0.97, m.bar(b), 0.7));

    // ---- arp: 16ths, filter sweeps open over the intro ----
    const arpDelay = new Tone.FeedbackDelay({ delayTime: m.spb * 0.75, feedback: 0.3, wet: 0.25 }).connect(duck);
    const arpF = new Tone.Filter({ type: 'lowpass', frequency: 500, Q: 4 }).connect(arpDelay);
    const arp = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.12, sustain: 0.2, release: 0.05 } }).connect(arpF);
    arp.volume.value = -10;
    arpF.frequency.setValueAtTime(400, 0);
    arpF.frequency.exponentialRampToValueAtTime(3800, m.bar(4));
    arpF.frequency.setValueAtTime(3800, m.bar(14));
    arpF.frequency.exponentialRampToValueAtTime(500, END);
    const arpOrder = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3];
    m.steps('xxxxxxxxxxxxxxxx', {}, (t, i) => {
      const ch = m.chord(prog[barOf(t) % 4], 4);
      const notes = [Tone.Frequency(ch[0]).transpose(-12).toNote(), ...ch, Tone.Frequency(ch[0]).transpose(12).toNote()];
      at(t, () => arp.triggerAttackRelease(notes[arpOrder[i % 16]], '32n', t, i % 4 === 0 ? 0.9 : 0.6));
    });

    // ---- drums ----
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } }).connect(OUT);
    kick.volume.value = -7;
    // gated reverb snare: big room tail that is chopped shut after ~180 ms
    const gate = new Tone.Gain(0).connect(OUT);
    const snRoom = new Tone.Reverb({ decay: 2.5, wet: 1 }).connect(gate);
    const snF = new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 0.7 });
    snF.connect(snRoom); snF.connect(OUT);
    const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } }).connect(snF);
    snare.volume.value = -8;
    const snBody = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 2, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(snF);
    snBody.volume.value = -10;
    const hatF = new Tone.Filter(9000, 'highpass').connect(OUT);
    const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(hatF);
    hat.volume.value = -23;

    m.steps('x...x...x...x...', { from: 4, to: 14 }, (t) => {
      at(t, () => kick.triggerAttackRelease('A0', '8n', t, 0.95));
      at(t, () => { duck.gain.setValueAtTime(0.4, t); duck.gain.linearRampToValueAtTime(1, t + m.spb * 0.8); });
    });
    m.steps('....x.......x...', { from: 4, to: 14 }, (t) => {
      at(t, () => { snare.triggerAttackRelease('16n', t, 1); snBody.triggerAttackRelease('E2', '16n', t, 0.8); });
      at(t, () => { gate.gain.setValueAtTime(1.6, t); gate.gain.setValueAtTime(1.6, t + 0.17); gate.gain.linearRampToValueAtTime(0, t + 0.2); });
    });
    m.steps('..x...x...x...x.', { from: 4, to: 14 }, (t) => at(t, () => hat.triggerAttackRelease('16n', t, 0.85)));
    m.steps('x.x.x.x.x.x.x.x.', { from: 8, to: 14 }, (t, i) => i % 4 !== 2 && at(t, () => hat.triggerAttackRelease('32n', t, 0.4)));
    // tom fill into the lead
    const tom = new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 3, envelope: { attack: 0.001, decay: 0.4, sustain: 0 } }).connect(OUT);
    tom.connect(send);
    tom.volume.value = -9;
    ['G2', 'E2', 'C2', 'A1'].forEach((n, k) => at(m.bar(7, 3, k), () => tom.triggerAttackRelease(n, '8n', m.bar(7, 3, k), 0.9)));

    // ---- bass: driving octave 8ths ----
    const bass = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { type: 'lowpass', Q: 2 }, filterEnvelope: { attack: 0.002, decay: 0.12, sustain: 0.25, baseFrequency: 110, octaves: 2.8 }, envelope: { attack: 0.003, decay: 0.15, sustain: 0.6, release: 0.06 } }).connect(duck);
    bass.volume.value = -12;
    m.steps('x.x.x.x.x.x.x.x.', { from: 4, to: 14 }, (t, i) => {
      const r = roots[barOf(t) % 4];
      at(t, () => bass.triggerAttackRelease(i % 4 === 2 ? Tone.Frequency(r).transpose(12).toNote() : r, '16n', t, 0.85));
    });

    // ---- lead ----
    const leadVerb = new Tone.FeedbackDelay({ delayTime: m.spb * 0.5, feedback: 0.35, wet: 0.3 }).connect(OUT);
    leadVerb.connect(send);
    const vib = new Tone.Vibrato({ frequency: 5.5, depth: 0.08 }).connect(leadVerb);
    const lead = new Tone.MonoSynth({ oscillator: { type: 'fatsquare', count: 2, spread: 12 }, filter: { type: 'lowpass', Q: 1 }, filterEnvelope: { attack: 0.02, decay: 0.4, sustain: 0.6, baseFrequency: 900, octaves: 2 }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.7, release: 0.4 }, portamento: 0.04 }).connect(vib);
    lead.volume.value = -17;
    const melody = [
      ['E5', 0, 1.5], ['D5', 1.5, 0.5], ['C5', 2, 1], ['A4', 3, 1],
      ['C5', 4, 1.5], ['D5', 5.5, 0.5], ['E5', 6, 1], ['G5', 7, 1],
      ['A5', 8, 2], ['G5', 10, 1], ['E5', 11, 1],
      ['D5', 12, 1.5], ['E5', 13.5, 0.5], ['D5', 14, 1], ['B4', 15, 1],
    ];
    [8, 12].forEach((b0) => melody.forEach(([n, beat, d]) => {
      if (b0 === 12 && beat >= 8) return; // second phrase resolves early into the outro
      const t = m.bar(b0) + beat * m.spb;
      at(t, () => lead.triggerAttackRelease(n, d * m.spb * 0.92, t, 0.85));
    }));
    at(m.bar(14), () => lead.triggerAttackRelease('A4', m.bar(1.5), m.bar(14), 0.8));

    // ---- impacts ----
    const crashF = new Tone.Filter(4500, 'highpass').connect(OUT);
    crashF.connect(send);
    const crash = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 2, sustain: 0 } }).connect(crashF);
    crash.volume.value = -21;
    [4, 8, 14].forEach((b) => at(m.bar(b), () => crash.triggerAttackRelease(1.8, m.bar(b), 0.9)));

    Q.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach((e) => e[2]());
  },
});
