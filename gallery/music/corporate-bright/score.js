studio.music({
  title: 'Corporate Bright 116',
  bpm: 116,
  beatsPerBar: 4,
  bars: 16,
  sections: [
    { name: 'intro', bar: 0 },
    { name: 'verse', bar: 4 },
    { name: 'chorus', bar: 8 },
    { name: 'outro', bar: 14 },
  ],
  markers: [
    { name: 'kick-in', bar: 4 },
    { name: 'chorus', bar: 8 },
    { name: 'outro', bar: 14 },
    { name: 'end', bar: 15 },
  ],
  build(m) {
    const { Tone } = m;
    // safety bus: transparent below 0.6, soft-saturates above, so transients can never clip
    const safe = new Tone.WaveShaper((x) => { const a = Math.abs(x); return a <= 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4)); }, 4096).connect(m.out);
    const OUT = new Tone.Gain(1).connect(safe);
    const Q = [];
    const at = (t, fn) => Q.push([t, Q.length, fn]);
    const barOf = (t) => Math.floor(t / m.bar(1) + 1e-6);
    const room = new Tone.Reverb({ decay: 2.2, wet: 1 }).connect(OUT);
    const send = new Tone.Gain(0.22).connect(room);
    const duck = new Tone.Gain(1).connect(OUT); // sidechain-style pump for pad/bass
    duck.connect(send);

    const prog = ['C', 'G', 'Am', 'F'];
    const roots = ['C2', 'G1', 'A1', 'F1'];
    const END = m.bar(15); // last chord rings out over bar 15

    // ---- plucks: 8th-note broken chords with a dotted-8th delay ----
    const delay = new Tone.FeedbackDelay({ delayTime: m.spb * 0.75, feedback: 0.25, wet: 0.22 }).connect(OUT);
    delay.connect(send);
    const pluck = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.22, sustain: 0.05, release: 0.2 } }).connect(delay);
    pluck.volume.value = -6;
    const pat = [0, 2, 1, 2, 0, 2, 1, 3];
    m.every(0.5, (t, n) => {
      if (t >= END) return;
      const notes = m.chord(prog[barOf(t) % 4], 4);
      notes.push(Tone.Frequency(notes[0]).transpose(12).toNote());
      at(t, () => pluck.triggerAttackRelease(notes[pat[n % 8]], '16n', t, n % 2 ? 0.55 : 0.8));
    });

    // ---- pad ----
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 20 }, envelope: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 1.2 } });
    const padF = new Tone.Filter(1800, 'lowpass').connect(duck);
    pad.connect(padF);
    pad.volume.value = -21;
    for (let b = 0; b < 15; b++) at(m.bar(b), () => pad.triggerAttackRelease(m.chord(prog[b % 4], 3), m.bar(1) * 0.96, m.bar(b), 0.6));

    // ---- drums ----
    const kick = new Tone.MembraneSynth({ pitchDecay: 0.035, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } }).connect(OUT);
    kick.volume.value = -6;
    const clapF = new Tone.Filter({ type: 'bandpass', frequency: 1400, Q: 0.9 }).connect(OUT);
    clapF.connect(send);
    const clap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.07, sustain: 0 } }).connect(clapF);
    clap.volume.value = -9;
    const hatF = new Tone.Filter(8000, 'highpass').connect(OUT);
    const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 } }).connect(hatF);
    hat.volume.value = -22;
    const shakerF = new Tone.Filter(6000, 'bandpass').connect(OUT);
    const shaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.004, decay: 0.03, sustain: 0 } }).connect(shakerF);
    shaker.volume.value = -27;

    m.steps('x...x...x...x...', { from: 4, to: 14 }, (t) => {
      at(t, () => kick.triggerAttackRelease('C1', '8n', t, 0.95));
      at(t, () => { duck.gain.setValueAtTime(0.45, t); duck.gain.linearRampToValueAtTime(1, t + m.spb * 0.7); });
    });
    // layered clap = three quick bursts
    m.steps('....x.......x...', { from: 4, to: 14 }, (t) => [0, 0.011, 0.023].forEach((o, k) => at(t + o, () => clap.triggerAttackRelease(0.02 + (k === 2 ? 0.06 : 0), t + o, k === 2 ? 1 : 0.6))));
    m.steps('..x...x...x...x.', { from: 4, to: 14 }, (t) => at(t, () => hat.triggerAttackRelease('32n', t, 0.8)));
    m.steps('xxxxxxxxxxxxxxxx', { from: 8, to: 14 }, (t, i) => at(t, () => shaker.triggerAttackRelease('32n', t, i % 2 ? 0.9 : 0.5)));
    // little fill into the chorus
    [2, 2.5, 3.25, 3.5, 3.75].forEach((beat, k) => at(m.bar(7, beat), () => clap.triggerAttackRelease(0.03, m.bar(7, beat), 0.4 + k * 0.1)));
    // intro: claps on 2 & 4 only in bars 2-3 to tease
    m.steps('....x.......x...', { from: 2, to: 4 }, (t) => at(t, () => clap.triggerAttackRelease(0.04, t, 0.5)));

    // ---- bass ----
    const bass = new Tone.MonoSynth({ oscillator: { type: 'square' }, filter: { type: 'lowpass', Q: 1 }, filterEnvelope: { attack: 0.003, decay: 0.12, sustain: 0.2, baseFrequency: 120, octaves: 2.6 }, envelope: { attack: 0.003, decay: 0.15, sustain: 0.5, release: 0.08 } }).connect(duck);
    bass.volume.value = -14;
    m.steps('x.xxx.xxx.xxx.xx', { from: 4, to: 14 }, (t, i) => {
      const r = roots[barOf(t) % 4];
      const note = i % 16 === 14 ? Tone.Frequency(r).transpose(12).toNote() : r;
      at(t, () => bass.triggerAttackRelease(note, '16n', t, 0.8));
    });

    // ---- chorus bell hook ----
    const bell = new Tone.FMSynth({ harmonicity: 3.01, modulationIndex: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.2 }, modulationEnvelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 } }).connect(delay);
    bell.volume.value = -14;
    const hook = [['E5', 0], ['G5', 0.5], ['C6', 1], ['B5', 2], ['G5', 2.5], ['A5', 3.5], ['G5', 4], ['E5', 4.5], ['D5', 5.5], ['E5', 6], ['C5', 7]];
    [8, 10, 12].forEach((b0) => hook.forEach(([n, beat]) => at(m.bar(b0, beat), () => bell.triggerAttackRelease(n, '8n', m.bar(b0, beat), 0.8))));

    // ---- ending: big final chord + kick + crash ----
    const crashF = new Tone.Filter(5000, 'highpass').connect(OUT);
    crashF.connect(send);
    const crash = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 1.6, sustain: 0 } }).connect(crashF);
    crash.volume.value = -22;
    at(m.bar(8), () => crash.triggerAttackRelease(1.4, m.bar(8), 0.8));
    at(END, () => kick.triggerAttackRelease('C1', '8n', END, 0.8));
    at(END, () => crash.triggerAttackRelease(1.6, END, 0.9));
    at(END, () => pluck.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '8n', END, 0.9));
    at(END, () => pad.triggerAttackRelease(m.chord('C', 3), m.bar(1) * 0.9, END, 0.7));
    at(END, () => bell.triggerAttackRelease('C6', '4n', END, 0.8));
    at(END, () => bass.triggerAttackRelease('C2', '4n', END, 0.7));

    Q.sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach((e) => e[2]());
  },
});
