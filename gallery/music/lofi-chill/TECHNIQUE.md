# Lofi Chill 84

Mellow swung lofi hip-hop at 84 bpm: wobbly FM electric-piano strums over a ii–V–I–vi loop in C, round triangle bass, dusty boom-bap drums, vinyl hiss and seeded crackle, with a 2-bar filtered drum break near the end.

## Use it for
- Vlogs, study/tutorial content, coding streams, calm B-roll, cosy product videos, recipe clips.
- Under VO: the keys are lowpassed (2.2 kHz) and everything sits under a 7 kHz "dusty" filter.
- Relaxed cutting on bars (2.86 s) or every 2 beats.

## Avoid when
- High-energy promos and hype edits.
- Precise frame-locked beat cuts at 30 fps: 84 bpm = 21.43 frames per beat, and the swing shifts off-beats further.
- Corporate/formal brands — the vinyl texture reads as casual.

## Arrangement
Instruments: FM PolySynth keys (-4 dB) → 0.5 Hz vibrato "tape wobble" → 2.2 kHz lowpass; triangle lead (-10) through the same wobble; triangle MonoSynth bass (-9); kick MembraneSynth (-7); pink-noise snare (-9, 1.6 kHz bandpass) + MembraneSynth body G2 (-16); hat (7.5 kHz highpass, -24); vinyl hiss (pink, bandpass 3.5 kHz, -30) and ~300 seeded crackle clicks (-26). A 7 kHz lowpass `warm` bus over everything; 3.5 s reverb via 0.25 send.

| Bars | Section | What plays |
|---|---|---|
| 0–3 | intro | keys: strum on beat 1 + swung strum on the "and" of 3; hiss fades in over 1.2 s; crackle throughout |
| 4–11 | groove | + 2-bar kick pattern, snare on 2 & 4 (+12 ms lazy), swung 8th hats, bass (root, swung ghost, fifth) |
| 5, 9 | groove | lead answer phrase A4 C5 E5 D5 C5 |
| 7, 11 | groove | lead phrase G4 A4 C5 B4 |
| 12–13 | break | drums + bass out; keys filter closes 2200 → 700 Hz; one strum per bar in bar 12; hats return in bar 13's second half + snare pickup on beats 3, 3.5, 3.75 |
| 14–15 | outro | drums and bass back, filter reopened |
| 16 | end | final Dm9 strum into the tail |

16 bars = 45.7 s + 1.5 s default tail.

## Tempo, key & harmony
- 84 bpm: beat 0.714 s, bar 2.857 s. Break at 34.29 s, drums back at 40.0 s.
- C major, jazzy ii–V–I–vi: Dm9 – G7 – Cmaj7 – Am7, one per bar. Roots D2 G1 C2 A1.
- Swing: odd 16ths delayed by `SWING = 0.22` of a 16th (`sw(t, i)`); strums roll notes 18 ms apart plus 0–6 ms seeded jitter — humanised, but deterministic.
- Bass: root on 1 (1.4 beats), swung ghost root on beat 2's last 16th, fifth on the "and" of 3.

## Sync with picture
- Sections: intro 0 s, groove 11.43 s, break 34.29 s, outro 40.0 s. Markers: `drums-in` (bar 4), `break` (bar 12), `drums-back` (bar 14).
- Use `drums-in` to start the main content (after a title/cold open), the `break` for a pause moment (a reflective shot, a quote, a slow-mo), `drums-back` for the final segment/end card.
- Gentle sync: pop list items or b-roll cuts on bars (`studio.bars`) rather than every beat; the snare (beats 2 & 4) is a good accent for small UI pops.

## Adapt mood & length
- Length: `bars` in multiples of 4 (one progression cycle); move the break (bars 12–13 appear in `breakBar`, `drumOn`, the filter automation and the bass loop) to 2 bars before the end section.
- For a 2-minute bed: 40 bars, break at 24–25 and 36–37.
- Warmer/dustier: `warm` lowpass to 5 kHz, more hiss (gain 0.8). Cleaner: remove crackle, raise `warm` to 12 kHz.
- Slower: 72–78 bpm; keep `SWING` 0.2–0.3 (beyond 0.33 it sounds like triplets).
- Levels used: keys -4 (FM is quiet), lead -10, bass -9, kick -7, snare -9, hat -24, hiss -30, crackle -26.

## Variations
- **Rain bed**: replace the crackle with a steady pink-noise layer through a 1 kHz bandpass, keep the hiss.
- **No drums**: keys + bass + vinyl for an even softer study bed.
- **Jazzier**: add 13ths/9ths (`m9`, `maj9` from the chord table) and a lead phrase every 2 bars.
- **Tape stop ending**: ramp all synth `detune` down an octave over the last beat.
- **Half-time**: kick only on 1, snare only on 3 — a slower 42-bpm feel at the same grid.

## Pitfalls
- Bass and lead are mono synths scheduled from several sources (bass: 3 triggers per bar; lead: two phrase loops) — they go through the `at()` queue. The phrase loop adds `0.01 * i` so no two lead notes share an instant.
- Swing must be applied to both the time you queue at and the time you trigger at (`at(sw(t, i), () => ...sw(t, i))`), or sorting and playback disagree.
- `+ six * 0` on the second strum is a no-op leftover — harmless.
- The crackle loop triggers `crack` directly in a single ascending loop; keep it ascending (no second loop on the same NoiseSynth).
- The 7 kHz master-ish filter makes hats dull; if they disappear, raise the hat, don't add more high hats.

## Reference
Reference implementation: gallery/music/lofi-chill/score.js. Key snippet:

```js
    const six = m.spb / 4;
    const SWING = 0.22; // fraction of a 16th that off-beat 16ths are delayed
    const sw = (t, i) => (i % 2 === 1 ? t + six * SWING : t);
    const rnd = m.random(84);
    // monophonic Tone instruments need time-ordered triggers: queue everything, flush sorted at the end
    const Q = [];
    const at = (t, fn) => Q.push([t, Q.length, fn]);
```

```js
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
```
