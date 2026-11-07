# Cinematic Rise

Trailer-style slow build in D minor at 76 bpm: drone + piano ostinato, growing toms and 16th string pulses, a noise riser and accelerating snare roll, one beat of silence, then a huge hit at bar 12 and a resolving tail with a final hit.

## Use it for
- Trailers, reveals, dramatic openers, "the big announcement", launch countdowns.
- Any video structured as tension → reveal: the hit is the reveal (logo, product, title).
- Documentary or game teasers (45–55 s).

## Avoid when
- Short social cuts (< 20 s) unless you rescale the bars — the build needs time.
- Light, friendly or comedic content.
- Under continuous VO in the rise section — toms + strings + riser leave no room; VO should pause for the hit.

## Arrangement
Instruments: fatsawtooth pad (-23 → -15 dB) through a lowpass that opens 350 → 900 → 2600 Hz; sine sub drone on D1 (gain 0.035 → 0.11, cut at the gap, 0.14 on the hit then decays); triangle piano ostinato (-12, velocity grows); sawtooth string pulses (-22) through 1.8 kHz lowpass; MembraneSynth toms (-9); white-noise riser (bandpass 300 → 9000 Hz); NoiseSynth snare roll (-10); hit = MembraneSynth boom A0 (-9) + highpass noise crash (-20) + fatsaw brass (-10) + tom. Hall reverb 7 s via a 0.45 send.

| Bars | Section | What plays |
|---|---|---|
| 0–3 | calm | pad (Dm · Bb · F · C, 2 bars each) + sub fades in + piano 8th ostinato |
| 4–5 | build | + toms on 1 and 3 (`x.......x.......`) |
| 6–8 | build | + string 16th pulses (velocity ramps to the gap), toms `x.....x.x.......` |
| 9–10 | rise | + riser noise from bar 9; toms `x..x..x.x..x.x..` |
| 10–11.75 | rise | + snare roll accelerating 16ths → 16th-triplets → 32nds; bar 11 toms `x.x.x.x.xxxxxxxx` |
| 11 beat 3 | (gap) | **one beat of silence** — everything cut |
| 12 | hit | boom + crash + brass D5-chord + tom; sub hit |
| 13–14 | resolve | pad Bb → C, half-time toms, piano an octave up, 8th strings |
| 15 | final | second hit (0.9) + Dm pad, then 4 s tail |

16 bars = 50.5 s + 4 s tail.

## Tempo, key & harmony
- 76 bpm: beat 0.789 s (23.7 frames), bar 3.158 s. Slow tempo = long, weighty bars; the hit lands at 37.89 s.
- D minor; i – VI – III – VII (Dm – Bb – F – C), the classic epic loop; resolve Bb → C → Dm (VI–VII–i) is a heroic cadence.
- Ostinato per chord: 4-note cells (Dm: D4 A4 F4 A4) cycling in 8ths.

## Sync with picture
- Sections: calm 0 s, build 12.63 s, rise 28.42 s, hit 37.89 s, resolve 41.05 s.
- Markers: `build` (bar 4), `riser` (bar 9), `silence` (bar 11 beat 3 = 37.11 s), `hit` (bar 12), `final` (bar 15 = 47.37 s).
- The **silence** marker is a picture cue too: cut to black or freeze for that beat, then reveal on `hit`. This contrast is what sells the hit.
- Clips: `studio.markers.find(x => x.name === 'hit').time` for the reveal; accelerate cuts during `rise` (every beat → every half beat); the final logo on `final`.
- When the edit already exists: move `HIT`/`GAP` and every bar reference so the hit lands on the key visual (see Adapt).

## Adapt mood & length
- The structure is driven by `HIT = m.bar(12)` and `GAP = m.bar(11, 3)` plus bar literals in loops (`from: 6`, `b < 12`, toms 4–12, resolve 13–15). To shorten, scale them all together; for 30 s keep bpm 76 and use ~10 bars (build at 2, rise at 5, hit at 7).
- More tension: lower the pad volume start (-28) and raise the riser gain; longer gap (a full bar of silence).
- Less aggressive: remove brass and boom, keep crash + pad — a "soft reveal".
- VO: keep narration in `calm`/`build`, pause for `rise`→`hit`, resume in `resolve`.
- Mix levels used: pad -23..-15, piano -12, strings -22, toms -9, snare -10, boom -9, brass -10, crash -20.

## Variations
- **Double hit**: add a second `hitAt` one bar after the first for a "BOOM… BOOM" trailer cadence.
- **Pulse-only build**: drop the piano and use the string pulses from bar 0 for a thriller.
- **Major lift**: resolve to D major (`m.chord('D', 3)`) at the final for a hopeful ending.
- **Riser only**: use bars 9–12 as a standalone 12 s sting before a title.
- **Braam**: replace brass with a detuned low fatsaw at D1–A1 for a modern trailer horn.

## Pitfalls
- The tom (MembraneSynth, mono) is triggered from three places (build loop, `hitAt`, resolve) — it only works because every trigger goes through the sorted `at()` queue. Keep that pattern.
- Anything sustaining past `GAP` kills the silence: pad note lengths are clipped with `Math.min(..., GAP - m.bar(b))`, the sub ramps to 0 at GAP — do the same for new layers.
- Low-end mud: boom (A0), sub (D1) and toms (D1) all hit at once — don't add another bass layer on the hit.
- The hit stacks 4 instruments + reverb; check `peakDbfs` and leave headroom (the safety WaveShaper soft-clips but squashes transients).
- `m.bar(4)` used as a duration (sub stop `HIT + m.bar(4)`) means "4 bars of time", not "bar 4".

## Reference
Reference implementation: gallery/music/cinematic-rise/score.js. Key snippet:

```js
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
```

```js
    const hitAt = (t, chordNotes, v = 1) => {
      at(t, () => boom.triggerAttackRelease('A0', 2.5, t, v));
      at(t, () => crash.triggerAttackRelease(2, t, 0.8 * v));
      at(t, () => brass.triggerAttackRelease(chordNotes, m.bar(1) * 0.9, t, 0.9 * v));
      at(t, () => tom.triggerAttackRelease('D1', '4n', t, v));
    };
    hitAt(HIT, ['D2', 'A2', 'D3', 'F3', 'A3']);
```
