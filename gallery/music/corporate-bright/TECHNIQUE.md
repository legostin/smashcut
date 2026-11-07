# Corporate Bright 116

Upbeat, optimistic corporate pop in C major: bouncy triangle plucks over I–V–vi–IV, four-on-the-floor with layered claps, a bell hook in the chorus and a clean "button" ending.

## Use it for
- Product promos, explainers, company presentations, onboarding and feature tours (30 s).
- Videos with a clear structure: intro → explain → payoff → logo end card.
- Bright, friendly brands (fintech, edtech, SaaS, HR).

## Avoid when
- Edgy, luxury, dramatic or dark brands — it is unambiguously cheerful.
- Long talking-head VO without ducking: plucks and bell live in the 1–4 kHz range.
- You need a frame-perfect grid at 30 fps (116 bpm = 15.52 frames per beat — not integer; cuts drift by up to half a frame).

## Arrangement
Instruments: triangle PolySynth pluck (-6 dB) → dotted-8th feedback delay; fatsawtooth pad (-21) → 1.8 kHz lowpass → duck; MembraneSynth kick (-6); 3-burst layered clap (white noise, 1.4 kHz bandpass, -9); hat (8 kHz highpass, -22); shaker (6 kHz bandpass, -27); square MonoSynth bass (-14) → duck; FM bell (-14) → delay; highpass noise crash (-22). Room reverb 2.2 s via a 0.22 send.

| Bars | Section | What plays |
|---|---|---|
| 0–1 | intro | plucks (8th broken chords) + pad |
| 2–3 | intro | + teaser claps on 2 & 4 |
| 4–7 | verse | + kick (sidechain duck 0.45), layered claps, offbeat hats, bass `x.xxx.xxx.xxx.xx` with octave pop on step 14 |
| 7 (beats 2–3.75) | fill | 5-hit clap fill with rising velocity |
| 8–13 | chorus | + crash at bar 8, 16th shaker, bell hook (8-beat phrase at bars 8, 10, 12) |
| 14 | outro | drums & bass stop; plucks + pad ring |
| 15 | end | final hit: kick + crash + C chord pluck + pad + bell C6 + bass C2, rings out |

16 bars = 33.1 s (+1.5 s default tail).

## Tempo, key & harmony
- 116 bpm: beat 0.517 s, bar 2.069 s. Chorus at 16.55 s, outro 28.97 s, end hit 31.03 s.
- C major; I–V–vi–IV (C – G – Am – F), one chord per bar — the most "positive" pop loop.
- Pluck pattern indexes chord tones `[0,2,1,2,0,2,1,3]` (3 = root an octave up) — a bouncing broken chord.
- Bell hook: E5 G5 C6 · B5 G5 · A5 G5 E5 · D5 E5 · C5, 8 beats, call-and-answer feel.

## Sync with picture
- Sections: intro 0, verse 8.28 s, chorus 16.55 s, outro 28.97 s.
- Markers: `kick-in` (bar 4), `chorus` (bar 8), `outro` (bar 14), `end` (bar 15).
- Map: intro = title/hook; verse = problem/features; `chorus` = the payoff (product hero, key stat); `end` = logo sting — the final hit at bar 15 is designed for a logo pop.
- Clips: `studio.markers.find(x => x.name === 'end').time` for the logo; bell hook notes fall on beats 0, 0.5, 1, 2… of bars 8/10/12 — good for staggered feature icons.

## Adapt mood & length
- Length: shift the `END` bar and every `to: 14` together. For 15 s: 8 bars (intro 2, verse 2, chorus 3, end at 7). For 60 s: verse 8 bars and a second chorus.
- Calmer: drop the shaker and claps, `bpm: 100`. Brighter: raise the bell, add the bell hook in the verse at -20.
- Key change for a lift: transpose `prog`/`roots`/hook up a whole tone at the last chorus.
- VO: pad -26, pluck -12, bell -20 and item volume ~0.4; or lowpass the delay bus at 2.5 kHz.
- Duck amount: `duck.gain` 0.45 → 0.6 for less pumping.

## Variations
- **Acoustic-ish**: pluck oscillator `sine` + shorter delay, no pad — lighter "ukulele" vibe.
- **Tech corporate**: swap the pluck for a 16th saw arp through a lowpass (see synthwave-drive).
- **Build-up**: add a white-noise riser over bar 7 into the chorus crash.
- **No ending**: remove the bar-15 hit and let bars 14–15 loop for a bed that can be trimmed anywhere.
- **Half-time verse**: kick on 1 and 3 only in the verse for more contrast into the chorus.

## Pitfalls
- Kick, bass and the pad duck are all scheduled via the local `at()` queue; keep it that way when adding hits — the bass and kick are mono synths and will throw on out-of-order triggers.
- The ending stacks 6 voices at the same instant — check peaks after making any layer louder.
- The shaker and hat both at high frequencies: raise both and it gets harsh; keep hats ≤ -20 dB.
- `m.every(0.5, ...)` without `from/to` runs over all bars; the `t >= END` guard is what stops plucks after bar 15.

## Reference
Reference implementation: gallery/music/corporate-bright/score.js. Key snippet:

```js
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
```

```js
    m.steps('x...x...x...x...', { from: 4, to: 14 }, (t) => {
      at(t, () => kick.triggerAttackRelease('C1', '8n', t, 0.95));
      at(t, () => { duck.gain.setValueAtTime(0.45, t); duck.gain.linearRampToValueAtTime(1, t + m.spb * 0.7); });
    });
    // layered clap = three quick bursts
    m.steps('....x.......x...', { from: 4, to: 14 }, (t) => [0, 0.011, 0.023].forEach((o, k) => at(t + o, () => clap.triggerAttackRelease(0.02 + (k === 2 ? 0.06 : 0), t + o, k === 2 ? 1 : 0.6))));
```
