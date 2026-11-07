# Synthwave Drive 104

80s retro synthwave in A minor at 104 bpm: a resonant 16th saw arpeggio whose filter opens over the intro, chorus-wide pads, pumping octave bass, four-on-the-floor with a big gated-reverb snare, and a soaring portamento lead in the second half.

## Use it for
- Retro, gaming, tech, neon/night-drive edits, outrun aesthetics, "80s" title sequences.
- Pairs with the neon/3D/glitch text techniques and the tech-grid synthwave floor background.
- Montages with a melodic payoff (the lead entering at bar 8).

## Avoid when
- Corporate, natural, calm or emotional content.
- Heavy VO: the arp is constant 16ths from bar 0 and the lead sits at 500–900 Hz.
- 30 fps frame-exact beat cuts: 104 bpm = 17.31 frames per beat (non-integer).

## Arrangement
Instruments: fatsawtooth pad (4 voices, spread 35, -19 dB) → 1.4 kHz lowpass → chorus → duck; saw arp (-10) → resonant lowpass (Q 4) → dotted-8th delay → duck; kick A0 (-7) with sidechain duck (0.4, recovers over 0.8 beat); gated-reverb snare: white noise (-8) + MembraneSynth body E2 (-10) through 1.8 kHz bandpass, dry + 2.5 s reverb behind a gate that opens to 1.6 for 170 ms and closes by 200 ms; hats (9 kHz highpass, -23); toms (-9); saw MonoSynth octave bass (-12) → duck; fatsquare portamento lead (-17) → 5.5 Hz vibrato → 8th delay; highpass noise crash (-21). Hall reverb 4.5 s via 0.3 send.

| Bars | Section | What plays |
|---|---|---|
| 0–3 | intro | pad (Am · F · C · G) + 16th arp, filter sweeping 400 → 3800 Hz by bar 4 |
| 4–7 | drive | crash; + kick 4/4 with duck, gated snare on 2 & 4, offbeat hats, octave bass 8ths |
| 7 beat 3 | fill | 4 toms G2 E2 C2 A1 in 16ths |
| 8–11 | lead | crash; + 4-bar lead melody, + extra 8th hats (skipping the offbeat ones) |
| 12–13 | lead | second phrase, first half only (resolves early) |
| 14–15 | outro | crash; drums & bass stop; lead holds A4 for 1.5 bars; arp filter closes 3800 → 500 Hz to the end |

16 bars = 36.9 s + 2.5 s tail.

## Tempo, key & harmony
- 104 bpm: beat 0.577 s, bar 2.308 s. Drive at 9.23 s, lead at 18.46 s, outro at 32.31 s.
- A minor; i – VI – III – VII (Am – F – C – G), the quintessential synthwave loop. Roots A1 F1 C2 G1.
- Arp: per bar the chord at octave 4 plus root −12 and +12; order `[0,1,2,3,2,1,0,1,2,3,4,3,2,1,2,3]` — up-down contour with the top note once per bar.
- Bass: root on every 8th, the octave on the "and" of each beat (`i % 4 === 2`).

## Sync with picture
- Sections: intro 0 s, drive 9.23 s, lead 18.46 s, outro 32.31 s. Markers: `drums-in` (bar 4), `lead-in` (bar 8), `outro` (bar 14). Crashes on all three.
- Intro = title / atmosphere (filter opening ≈ "sunrise", match it with a slow reveal or grid draw-on); `drums-in` = main montage begins; `lead-in` = the hero shot/logo; `outro` = end card while the arp closes.
- The gated snare (beats 2 & 4) is a great hit for flashes, glitch bursts or camera shakes: `studio.beat(1)`, `studio.beat(3)`, …

## Adapt mood & length
- Length: bars in multiples of 4. For 20 s: 8 bars — intro 2, drive 2, lead 4 (shift `from`/`to`, the fill bar, and the crash bars). For 60 s: 26 bars with a second drive section and two full lead phrases.
- Darker: progression `Am – F – Dm – E` (harmonic minor feel) and lower the arp filter max to 2500 Hz.
- Faster/outrun: 118–124 bpm, 16th bass instead of 8ths.
- VO: arp -16, lead -22, pad -24; or start the arp only at `drums-in`.
- Levels used: pad -19, arp -10 (filtered), kick -7, snare -8 / body -10, hat -23, tom -9, bass -12, lead -17, crash -21.

## Variations
- **Darkwave**: remove the lead, slow to 96 bpm, minor-key arp with phrygian notes.
- **Arp-only intro bed**: bars 0–3 looped with the filter sweep as a 9 s title bed.
- **Half-time drums**: kick on 1, snare on 3 for a slower "cruise".
- **Lead harmony**: duplicate the melody a third above at -23 for the second phrase.
- **Big ending**: replace the A4 hold with an Am chord + crash + kick at bar 15.

## Pitfalls
- Kick, bass, arp and lead are mono synths — all are triggered through the sorted `at()` queue; keep it when adding fills.
- The gate gain is a single `Tone.Gain` automated per snare; if you add a snare fill closer than 200 ms apart, automation segments overlap — keep fills ≥ 16ths and accept a shorter tail.
- Resonant arp filter (Q 4) at high frequencies gets piercing; don't push the sweep past ~4 kHz.
- Duck feeds the reverb send: heavy ducking also pumps the reverb, which is part of the style but muddy at > 0.5 depth.
- `m.bar(1.5)` as a duration means 1.5 bars of time (the lead's outro note) — it's a duration helper, not a position.

## Reference
Reference implementation: gallery/music/synthwave-drive/score.js. Key snippet:

```js
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
```

```js
    m.steps('....x.......x...', { from: 4, to: 14 }, (t) => {
      at(t, () => { snare.triggerAttackRelease('16n', t, 1); snBody.triggerAttackRelease('E2', '16n', t, 0.8); });
      at(t, () => { gate.gain.setValueAtTime(1.6, t); gate.gain.setValueAtTime(1.6, t + 0.17); gate.gain.linearRampToValueAtTime(0, t + 0.2); });
    });
```
