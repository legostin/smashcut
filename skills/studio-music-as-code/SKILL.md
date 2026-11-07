---
name: studio-music-as-code
description: Write music as Tone.js code for Smashcut (score API, helpers, mixing, sections/markers that drive motion sync, render_music verification). Read before creating or editing music/<id>/score.js.
---

# Music as code

`music/<id>/score.js` is rendered **offline** (Tone.Offline in headless Chromium) into a WAV. It is deterministic,
so the beat map you declare is exactly what the visuals sync to. You cannot hear — you verify with `render_music`
(levels, loudness over time, accents, spectrogram image).

## Score API
```js
studio.music({
  title: 'Promo bed', bpm: 120, beatsPerBar: 4, bars: 16,        // or duration (s)
  tail: 1.5,                                                      // seconds of reverb tail after the last bar
  sections: [{ name: 'intro', bar: 0 }, { name: 'drop', bar: 8 }],// become timeline bands + studio.sections in clips
  markers: [{ name: 'impact', bar: 8, beat: 0 }],                 // hit points for graphics
  build(m) {
    const { Tone } = m;
    const kick = new Tone.MembraneSynth().connect(m.out);         // ALWAYS connect to m.out (bus → limiter → master)
    m.steps('x...x...x...x...', { from: 0, to: 16 }, (t, i, vel) => kick.triggerAttackRelease('C1', '8n', t, vel));
    m.chord('Am7', 3);  m.scale('A', 'minor', 3);  m.bar(8)  /* → seconds */;  m.beat(3);  m.sixteenth(5);
    m.every(1, (t, n) => {}, { from: 4, to: 8 });                 // every N beats
    m.at(t, (time) => lead.triggerAttackRelease('A4', '8n', time)); // queued, run sorted by time after build()
    const r = m.random(7);                                         // seeded randomness
  },
});
```
- Mono synths (Synth, MonoSynth, MembraneSynth, NoiseSynth) throw if triggered out of time order or twice at the same instant — when one instrument is scheduled from several loops, go through `m.at()`.
- Master chain: bus → limiter → soft clip; overs are normalised to −0.3 dBFS on render, but aim for headroom anyway.
- Schedule with **absolute times** (`triggerAttackRelease(note, dur, time)`), computed from the helpers. `Tone.Transport` / `Tone.Part` also work (the runtime starts the transport).
- Step patterns: `x` hit (vel 0.75), `X` accent (vel 1), `.`/`-` rest; `div: 16` (16ths per bar) by default, pattern loops.
- Sidechain feel: automate a `Tone.Gain` on each kick: `g.gain.setValueAtTime(0.35, t); g.gain.linearRampToValueAtTime(1, t + 0.22)`.
- Samples: put files in `music/<id>/samples/` and load with relative URLs (`new Tone.Sampler({ urls: {C4: 'samples/piano-c4.wav'}, baseUrl: '/p/music/<id>/' })`).

## Mixing targets
- Peak −1 … −3 dBFS (limiter on master). Kick and bass dominant, pads −16 … −22 dB, hats −20 … −26 dB.
- Leave space for voice-over if the video has speech: cut 1–4 kHz on pads (EQ3 / filter) and keep music 6–10 dB under VO (item volume 0.3–0.5).
- Arrangement: something changes every 4 or 8 bars (add/remove a layer, filter sweep, fill).

## Sync with picture
- Choose bpm so cuts land well: at 30 fps, 120 bpm = 15 frames per beat (clean). 100 bpm = 18 frames.
- Declare sections/markers for every musical event you want graphics to hit; clips read them as `studio.sections/markers/beat(n)`.
- When the edit already exists: get_timing / get_project → size the score (bars) to the video duration and put the drop on the key visual moment.

## Verify
`render_music {musicId}` → check: peakDbfs between −3 and −0.5; loudness sparkline shows the intended arc (quiet intro → full drop); no silent gaps; spectrogram not mud (lots of energy < 200 Hz from many instruments) and not harsh. Iterate.
