# Pulse 120

Minimal driving electronic bed at 120 bpm in A minor: offbeat hats, a pumping (sidechained) pad, random plucky square arp, riser into a drop at bar 8 with clap and bass.

## Use it for
- Tech/SaaS promos, app launches, fast product montages, social ads (16–32 s).
- Edits with frequent cuts: 120 bpm = exactly 15 frames per beat at 30 fps — every beat is a clean cut point.
- Any video with one "impact" moment (logo, price, feature reveal) — the drop at bar 8.

## Avoid when
- Under dialogue-heavy VO without ducking: the square arp and fatsaw pad sit in the voice range.
- Emotional, cinematic or calm content.
- You need a proper ending: the score just stops arranging (no final hit); there is only the default 1.5 s tail.

## Arrangement
Instruments: MembraneSynth kick (-4 dB), white-noise hat through 8 kHz highpass (-22), pink-noise clap through 1.8 kHz bandpass (-12), fatsawtooth PolySynth pad (-20) → reverb (4 s, wet 0.35) → duck gain, square arp (-18) → dotted-8th feedback delay → reverb, saw MonoSynth bass (-10) → duck, white-noise riser (-24) through a sweeping bandpass.

| Bars | Section | What plays |
|---|---|---|
| 0–1 | intro | pad only (Am7 · Fmaj7 · C · G, one chord per bar) |
| 2–3 | intro | + offbeat hats (`..x...x...x...x.`) |
| 4–5 | build | + four-on-the-floor kick with sidechain duck, + 8th-note arp |
| 6–7 | build | + riser: 4 s attack noise, bandpass 400 → 9000 Hz |
| 8–13 | drop | + clap on 2 & 4, + bass roots `x.xxx.xxx.xxx.x.` (16ths) |
| 14–15 | outro | kick/hats/clap/bass stop; pad + arp continue to the end |

Total: 16 bars = 32.0 s (+1.5 s default tail).

## Tempo, key & harmony
- 120 bpm, 4/4: beat = 0.5 s = 15 frames, bar = 2 s = 60 frames. The cleanest possible grid for 30/60 fps.
- A minor; progression Am7 – Fmaj7 – C – G (i–VI–III–VII), a loop that never resolves — good for "keeps going" energy.
- Arp notes: random picks from A minor pentatonic, 2 octaves from A4, seeded `m.random(42)`.
- Bass roots A1 F1 C2 G1.

## Sync with picture
- Sections: intro 0 s, build 8 s, drop 16 s, outro 28 s. Marker `impact` at bar 8 = 16.0 s.
- Put the hero reveal on `impact`; the riser (12–16 s) is the anticipation — use it for a zoom/push or a countdown.
- In clips: `studio.markers.find(m => m.name === 'impact').time`, `studio.beat(n)` for kicks, `studio.bars` for scene changes every 2 s.
- Cut scenes on bars (every 2 s) in the drop; on beats for a frantic montage.

## Adapt mood & length
- Length: `bars` drives duration (bars × 2 s). For 15 s use 8 bars and move the drop to bar 4 (shift every `from`/`to` and the riser by −4 bars). For 60 s use 32 bars: repeat the drop block and add a breakdown (drop kick/bass for 4 bars at 16–20).
- Tempo: changing `bpm` keeps everything in bars; 128 for hype, 110 for relaxed (but frame alignment gets uneven).
- Key: change `prog`, `roots`, and the arp `m.scale(...)` root together.
- VO: lower `pad` to -26 and `arp` to -24, or set item volume 0.3–0.5; a lowpass on the arp delay helps.
- Darker: replace the pentatonic arp with `m.scale('A','phrygian',3,2)`.

## Variations
- **Real build**: make the kick in bars 4–7 half-time (`x.......x.......`) so the drop actually doubles in energy (now the same 4/4 pattern runs 4–14).
- **Ending**: add a final kick + pad chord at bar 16 and `tail: 3` for a button ending.
- **Fill**: a snare/clap roll in bar 7 (16ths with rising velocity) under the riser.
- **Second drop**: a 2-bar breakdown at 12–13 then return — gives a second impact marker.
- **Arp melody**: replace the random arp with a fixed 16-step note array for a memorable hook.

## Pitfalls
- This score triggers instruments directly (no `m.at` queue). It works because each mono synth (kick, bass, arp) is scheduled from one loop in time order; if you add a second loop for the same synth (e.g. a kick fill), route both through `m.at`.
- Kick at -4 dB plus pad and bass is close to the limiter — check `peakDbfs` with `render_music` after adding layers.
- `Math.floor(t / m.bar(1))` without an epsilon (bass line) can land on the previous bar due to float error; other scores use `+ 1e-6`.
- The pad is retriggered every bar with release 1.5 s — longer releases overlap and get muddy under the reverb.

## Reference
Reference implementation: gallery/music/pulse-120/score.js. Key snippet:

```js
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
```
