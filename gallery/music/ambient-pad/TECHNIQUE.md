# Ambient Drift

Beat-free evolving ambient bed at a nominal 72 bpm: two layers of slowly blooming pads over Fmaj9 – Cadd9 – Am9 – Gsus2, a sub drone on the roots, filtered pink-noise wind and sparse seeded FM bell shimmer, with a global swell in and fade out.

## Use it for
- Narration, meditation/wellness, nature, slow product beauty shots, architecture, "about us" stories.
- Under talking heads and interviews (no drums, nothing rhythmic competes with speech).
- Long holds and slow camera moves; calm intros and outros.

## Avoid when
- The edit is rhythmic or fast-cut — there is no pulse to cut to.
- You need an impact moment (no hits; use cinematic-rise).
- Very short videos (< 15 s): the swell-in takes 3 bars (10 s).

## Arrangement
Instruments: pad A — fattriangle PolySynth (-13 dB, 3.5 s attack, 5 s release) through an AutoFilter (0.06 Hz, base 350 Hz, 3 oct); pad B — fatsawtooth an octave up (-27 dB, 5 s attack) through a 0.18 Hz tremolo and 2.4 kHz lowpass; sine sub drone (gain 0 → 0.09 → 0.05); pink-noise wind (gain 0.05) through a bandpass AutoFilter (0.045 Hz); FM bell PolySynth (-19 dB) through a 1.5-beat feedback delay; low sine "piano" swell (-16 dB). Everything goes into `master` (gain 0 → 1 over bars 0–3, 1 → 0 from bar 14 to END+3), which also feeds a 10 s reverb via a 0.6 send.

| Bars | Section | What plays |
|---|---|---|
| 0–3 | dawn | pad A chords (2 bars each), wind, sub swelling in, master fading in to bar 3; bells start at bar 2 (sparse) |
| 4–9 | bloom | + pad B (upper chord tones), sub at full 0.09 |
| 6–11 | (peak) | bell density 1.6/bar instead of 0.8 |
| 8, 10 | peak / drift | low swell chords Am (A2 E3 C4) at bar 8, G (G2 D3 B3) at bar 10 |
| 10–13 | drift | sub eases to 0.05, pad B ends at bar 14 |
| 14–15 | fade | master fades from bar 14 to 3 s past the end |
| 16 | tail | final Fmaj9 resolve chord into the 6 s tail |

16 bars = 53.3 s + 6 s tail.

## Tempo, key & harmony
- 72 bpm: beat = 0.833 s = **exactly 25 frames at 30 fps**, bar = 3.333 s = 100 frames — the bpm only sets the bar grid; nothing is rhythmic.
- C major / F lydian colour: Fmaj9 – Cadd9 – Am9 – Gsus2 (IV – I – vi – V sus), 2 bars per chord. Extended and suspended chords avoid strong resolution — "floating".
- Bells from C major pentatonic (2 octaves from C5) — any note fits any chord.
- Bell timing: seeded `m.random(72)` walk, interval `(bar / density) × (0.5..1.5)`.

## Sync with picture
- Sections: dawn 0 s, bloom 13.33 s, drift 33.33 s, fade 46.67 s. Markers: `bloom` (bar 4), `peak` (bar 8 = 26.67 s), `drift` (bar 10), `fade` (bar 14).
- Sync gently: crossfades and slow title fades on chord changes (every 2 bars = 6.67 s), the main reveal on `peak` (the low swell).
- Visual pulses should use `studio.level()` (it follows the swell) rather than `studio.beat()`.

## Adapt mood & length
- Length: change `bars` in multiples of 2 (chords are 2 bars) and move the `master` fade points and `END`. For 90 s: 28 bars, bloom at 4, peak at 14, fade at 24.
- Brighter: raise pad B (-22), add bells an octave up. Darker: progression `Dm9 – Bb – Fmaj7 – C` and pentatonic from A.
- Under VO: it's already VO-friendly; drop pad B (2.4 kHz content) and lower bells to -24 if the voice is soft.
- Levels used: pad A -13, pad B -27, bells -19, low swell -16, sub gain 0.09, wind gain 0.05.

## Variations
- **Pulse bed**: add a soft 8th-note filtered pluck from bar 4 to give gentle forward motion.
- **Drone-only**: sub + wind + pad A with one chord (Fmaj9) for a tense, static bed.
- **Shimmer heavy**: density 2.5 and delay feedback 0.6 for a "starfield" look.
- **Loopable**: remove the master fade in/out and the final resolve to get a seamless 16-bar loop.
- **Short sting**: bars 0–4 only with a faster master swell (1 bar) as a 13 s intro bed.

## Pitfalls
- Pad A is retriggered every 2 bars with `m.bar(2) * 1.05` duration + 5 s release + 10 s reverb — with `maxPolyphony` too low notes drop; it's set to 32 for that reason.
- Very slow attacks (3.5–5 s) mean notes triggered late in the piece never reach full level before the fade — don't add pad notes after bar 14.
- Sub (sine at 44–65 Hz) is invisible on laptop speakers but heavy on headphones; keep its gain ≤ 0.1.
- Wind noise is continuous: if the master fade is removed, the piece ends with a hard noise cut.
- The local `at()`/`Q` queue duplicates `m.at`; either is fine, but don't mix both for the same synth (two separate queues are not sorted together).

## Reference
Reference implementation: gallery/music/ambient-pad/score.js. Key snippet:

```js
    const space = new Tone.Reverb({ decay: 10, wet: 1 }).connect(OUT);
    const send = new Tone.Gain(0.6).connect(space);
    const master = new Tone.Gain(0).connect(OUT); // global swell in / fade out
    master.connect(send);
    master.gain.setValueAtTime(0, 0);
    master.gain.linearRampToValueAtTime(1, m.bar(3));
    master.gain.setValueAtTime(1, m.bar(14));
    master.gain.linearRampToValueAtTime(0.0, END + 3);
```

```js
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
```
