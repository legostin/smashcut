---
name: studio-music-as-code
description: Compose production music for video as Tone.js code in Smashcut — brief → genre/tempo/key, energy-curve arrangement, harmony/melody/groove helpers (m.progression, m.voiceLead, m.melody, m.groove, m.arrange…), sampled instruments + mixing (m.inst, m.channel, m.master), sync to cuts, and the objective QA loop (render_music → music_report → fix). Read before creating or editing music/<id>/score.js. Tables, mix numbers, QA thresholds and 6 complete genre recipes in REFERENCE.md.
---

# Music as code — composing for video

`music/<id>/score.js` is rendered **offline** in headless Chromium (Tone.Offline), producing a deterministic WAV. The beat map you declare is exactly what the visuals sync to. **You cannot hear.** You compose with proven structures (helpers below) and verify with measurements: `render_music` gives levels, a loudness sparkline and a spectrogram, and `music_report` gives LUFS, spectrum vs genre, dynamics, static loops and a list of fixes.

## Workflow (every score)
1. **Brief.** Write one line: mood, where the drop/reveal is, whether there is voice-over, the target length.
   - Read `get_script`/`get_timing` for the scene beats, the VO word windows and the cut times.
2. **Choose** genre, bpm, key and mood from the table in REFERENCE.md §1.
   - Fit the bpm to the picture: `musicTheory.bpmFor(cuts)` or `musicTheory.fitBpm(seconds)`.
3. **Write the energy curve.** Give one value 0–1 per section (§2): intro 2–4 bars, a change every 4/8 bars, the drop on the reveal, a composed ending.
4. **Compose with the helpers:**
   - `progression` → `voiceLead` → `bassline` / `arp` / `comp` → `melody` (motif form) → `groove`.
   - `m.arrange` decides which layers play per section and adds the transitions.
5. **Sound and mix:**
   - `m.inst.*` instruments, each with channel options (vol/pan/highpass/sends).
   - `m.sidechain` for pumping layers, and `m.master({ lufs: -14 })` on the master.
6. **Verify:** `render_music {musicId}`, then `music_report {musicId, genre, vo?}`.
   - Fix every P0, then P1, and re-render. At most **3 passes**, then report the remaining flags honestly.
7. In the final message, give the curve and sections, the key/bpm, and the report verdict with numbers (LUFS, dBTP, section spread). Say it was measured, not heard.

## Score API
```js
studio.music({
  title: 'Promo bed', bpm: 120, beatsPerBar: 4, bars: 16,        // or duration (s)
  tail: 2,                                                        // seconds rendered after the last bar (reverb/ending)
  sections: [{ name: 'intro', bar: 0 }, { name: 'drop', bar: 8 }],// timeline bands + studio.sections in clips
  markers: [{ name: 'impact', bar: 8, beat: 0 }],                 // hit points for graphics
  build(m) { /* schedule everything at absolute times */ },
});
```
**Core `m`** (runtime/music.js):
- Context: `m.Tone`, `m.out` (music bus → limiter → master), `m.bpm`, `m.spb`, `m.bars`, `m.beatsPerBar`, `m.duration`, `m.sections` (`[{name, start, end}]`, seconds), `m.markers`.
- Time: `m.bar(b, beat?, six?)` → seconds, `m.beat(n)`, `m.sixteenth(n)`.
- Notes: `m.chord('Am7', 3)`, `m.scale('A', 'minor', 3)`, `m.midiToNote`.
- Patterns: `m.steps('x..x', { from, to, div: 16 }, (t, i, vel) => …)` (`x` 0.75, `X` 1) and `m.every(beats, (t, n) => …, { from, to })`.
- `m.at(t, fn)` queues a trigger; the queue runs sorted after `build()`. Mono synths throw when triggered out of order, so route shared synths through `m.at` (`m.perform` already does).
- `m.random(seed)` is seeded randomness. Use samples by relative URL (`baseUrl: '/p/music/<id>/'`, files in `music/<id>/samples/`).

**Mix** (runtime/music-ext/mix.js):
- `m.channel(name, { vol, pan, eq: { low, mid, midFreq, high }, highpass, lowpass, comp: { threshold, ratio }, sends: { reverb, delay }, width })` returns a Tone node; connect a synth to it.
- `m.reverb`, `m.delay` are shared buses (`m.reverbSetup({ decay, predelay, lowpass })`, `m.delaySetup({ time })`).
- `m.sidechain(targets, kickTimes | groove, { depth: -6, release: 0.18 })`.
- `m.master({ preset: 'clean'|'warm'|'punchy', lufs: -14 })` runs offline loudness normalisation with a −1 dBTP true-peak limiter.

**Instruments & FX** (runtime/music-ext/instruments.js; sampled where samples exist, designed synths otherwise; balanced default levels):
- Drums: `m.inst.drums('808'|'909'|'acoustic'|'lofi'|'trap')` → `.kick/.snare/.clap/.hat/.openHat/.rim/.crash/.ride/.perc/.shaker(t, vel)`, `.tom(t, vel, 0|1|2)`, `.kickTimes`, `.strip(piece)`.
- Melodic: `m.inst.piano()`, `keys('rhodes'|'epiano'|'wurli'|'organ')`, `strings('ensemble'|'pizz'|'staccato')`, `pad('warm'|'airy'|'dark'|'glass')`, `bass('sub'|'808'|'pluck'|'synth'|'upright')`, `pluck('bell'|'marimba'|'synth')`, `lead('saw'|'square'|'soft')`, `choir()`, `brass()`.
- Each has `.play(noteOrNotes, dur, time, vel, { strum })`, `.channel` and `.volume` (dB param). Mono basses and leads glide when notes overlap.
- Channel overrides go in `mix`: `m.inst.pad('warm', { mix: { highpass: 200, lowpass: 3000, pan: -0.2, sends: { reverb: 0.4 } } })`. These replace the default per key, so leave `vol` alone unless you mean it; nudge with `pad.volume.value -= 3`.
- FX: `m.fx.riser(t0, t1, { vel })`, `downlifter(t, dur, { vel })`, `impact(t, vel)`, `whoosh(t, dur, { vel })`, `reverseCymbal(tEnd, dur, { vel })`, `snareRoll(t0, t1)`, `vinyl(on, { level: -34 })`, `subDrop(t, { vel })`. `m.arrange` places most of these for you, sized to the energy jumps.
- Feature-detect anything optional (`if (m.fx) …`).

## Composition helpers (runtime/music-ext/theory.js)
All helpers are deterministic (`seed` options) and return plain data you can filter, combine and inspect. Event = `{ note | notes, time (s), dur (s), vel 0–1 }`.

| Helper | What it gives you |
|---|---|
| `m.key('A minor')` / `m.key('F', 'lydian')` | `{ root, mode, pcs, degree(n, oct), scale(oct), pentatonic(oct), chord('V7'), snap(note), relative() }` |
| `m.progression(moodOrRomans, key?, { bars, chordsPerBar=1, from, ext:'auto'\|'none'\|'rich', variant, cadence:'V I'\|true })` | chords `[{ name, roman, notes, bass, pcs, time, dur, bar }]` + `.chordAt(t)`, `.key`. Moods: uplifting, corporate, epic, triumphant, melancholic, tense, dark, chill, dreamy, playful, hopeful, calm, jazz (+ aliases sad, happy, lofi, trailer…). Romans: `'vi IV I V'`, `'ii7 V7 Imaj7'`, `'i bVI bVII'`, `'I*2'` (two slots); chord names also work. |
| `m.voiceLead(chords, { range:['C3','C5'], voices:4 })` | smooth voicings: minimal movement, no parallel 5ths/8ves, no low mud, root position at the start |
| `m.comp(chords, 'x..x..x.', { gate })` | rhythmic chord stabs/comping events |
| `m.bassline(chords, 'root'\|'octave'\|'walking'\|'syncopated'\|'808-glide', { octave:1, groove:'x..x…', seed })` | bass events (E1–D♯2 register by default; `s` in a groove = slide; 808 events carry `slide`) |
| `m.arp(chordsOrChord, 'up'\|'down'\|'updown'\|'converge'\|'random'\|'pattern', '16n', { octaves, from, to, order })` | arpeggio that follows the progression; restarts on chord changes |
| `m.melody(key, { chords, from, bars, motifBars:2, form:"A A' B A''", rhythm:'straight'\|'hook'\|'syncopated'\|'driving'\|'sparse', contour:'arch'\|'rise'\|'fall'\|'wave', range, scale:'pentatonic', density, avoid, seed })` | motif-based melody: state → vary → contrast → resolve on the tonic; strong beats on chord tones |
| `m.groove(genre, { from, to, energy \| variant:'intro'\|'minimal'\|'full'\|'peak'\|'half', fills:8, swing, humanize })` | drum parts `{ kick:[{time,vel}], … }` with ghosts, rolls, fills, crash after fills; `.perform(kit)`, `.kickTimes`. Genres: house, techno, trap, hiphop, lofi, pop, rock, cinematic, corporate, dnb, afro, latin, ambient |
| `m.swing(0.5 \| 58, '16n')` | time-mapping fn (`.events(evs)`); 0 straight … 1 triplet, or an MPC % |
| `m.humanize(t \| evs, { timing:8 ms, vel:0.06, seed })` / `m.velocity(evs, 'accent'\|'crescendo'\|'decrescendo'\|'arch'\|'random')` | life: timing jitter, velocity curves |
| `m.arrange({ intro:0.2, drop:0.95, … } \| [{ name, bars, energy, add, mute }], { layers, fx, dynamics })` | plan: `.filter(evs, layer)` (layer gating + energy-scaled velocity), `.groove(genre)` (variant per section, fills into rises), `.automate(param, { lo, hi })` (filter sweeps), `.spans/each/has/sectionAt`, `.transitions` (automatic with `m.fx`, sized to the jump: riser into energy ≥ 0.6, reverse cymbal ≥ 0.7, impact ≥ 0.75, sub drop ≥ 0.85, downlifter on breakdowns; `fx: false` / `fxLevel` to tame) |
| `m.perform(inst, events, { vel, transpose, gate, offset })` | schedules events on `m.inst.*`, a Tone instrument, a drum kit (groove) or a function |
| `m.snap(t, 'beat'\|'bar'\|'8n')`, `m.barAt(t)`, `m.cuts(cutTimes, { grid, tolerance:0.12, hit:'impact' })`, `m.avoid(evs, voWindows)` | video sync: snap to the grid, hit cuts, keep parts out of VO lines |
| `musicTheory.bpmFor(cuts, { min, max })`, `musicTheory.fitBpm(seconds)`, `musicTheory.barsFor(s, bpm)`, `musicTheory.brief('lofi')` | pure helpers for the top of score.js (before `studio.music`) |

Default layer thresholds in `m.arrange`: pad 0, keys 0.2, perc 0.3, bass 0.35, kick/drums 0.45, hats 0.55, arp 0.6, lead 0.75, top 0.85. Override them with `{ layers: { … } }`.

## Minimal shape of a good score
```js
build(m) {
  const plan = m.arrange({ intro: 0.2, verse: 0.5, build: 0.7, chorus: 0.95, end: 0.25 });
  const chords = m.voiceLead(m.progression('uplifting', 'C major', { cadence: 'I' }), { range: ['C3', 'C5'] });
  const pad = m.inst.pad('warm', { mix: { highpass: 200, sends: { reverb: 0.3 } } }), bass = m.inst.bass('synth');
  const lead = m.inst.lead('soft', { mix: { lowpass: 7000 } }), kit = m.inst.drums('909');
  m.perform(pad, plan.filter(chords, 'pad'));
  m.perform(bass, plan.filter(m.bassline(chords, 'syncopated'), 'bass'));
  m.perform(lead, plan.filter(m.melody(chords.key, { chords, rhythm: 'hook' }), 'lead'));
  const drums = plan.groove('pop'); drums.perform(kit);
  m.sidechain([pad, bass], drums, { depth: -5 });
  m.master({ preset: 'warm', lufs: -14 });
}
```
For complete genre recipes see REFERENCE.md §11: corporate 116, lo-fi 80, cinematic trailer 94, trap 140, house 124, explainer bed 90.

## Rules with numbers (details and sources in REFERENCE.md)
- **Arrangement:**
  - Intro 2–4 bars, and something sounds from frame 0.
  - Change something every 4/8 bars (layer, fill, filter, bass style, melody variation).
  - The drop's downbeat lands on the reveal. End on the tonic on a downbeat with a final hit and `tail: 2–3`. Never end by fading out or stopping mid-loop.
- **Dynamics:**
  - Sections should differ by 4–8 LU (`music_report` flags under 3).
  - Intro and breakdown about 0.2–0.4 energy, drop 0.9–1.
- **Harmony:**
  - One chord per bar (pop/corporate). Two bars per chord for cinematic, ambient and VO beds.
  - Voicings between C3 and C5. Only the bass below 150 Hz. Don't stack two parts on the same chord in the same octave.
- **Melody:**
  - A 1–2-bar motif, repeated with variation (`A A' B A''`).
  - Steps and skips; leaps of a 4th or more are followed by a step back.
  - Range of about an octave to a 10th. Phrases end on the tonic; mid-phrase on the 2nd or 5th.
- **Rhythm:**
  - Never one velocity for repeated hits; use accents and ghosts at 0.3–0.45.
  - Humanize 4–8 ms for electronic, 10–20 ms for lofi.
  - Swing hats and keys, not the kick (lofi ≈ 0.5–0.6, hip-hop ≈ 0.4).
- **Sound:**
  - Sampled or designed `m.inst.*`, never raw square/saw.
  - 4–6 parts at a time; rotate layers instead of stacking them.
- **Mix starting points:**

  | Element | Level vs kick |
  |---|---|
  | snare/clap | −1…−3 dB |
  | bass | −2…−5 dB |
  | lead | −4…−8 dB |
  | keys | −6…−10 dB |
  | pads | −12…−18 dB |
  | hats | −10…−16 dB |

  - High-pass everything except kick and bass (pads 150–250 Hz). Mono below 120 Hz.
  - Reverb/delay via sends; drums nearly dry.
  - `m.master({ lufs: -14 })` → −14 LUFS, ≤ −1 dBTP.
- **Under voice-over:**
  - The voice owns 1–4 kHz. No busy melody there while VO speaks (`m.avoid(melody, voWindows)`, `rhythm: 'sparse'`).
  - Low-pass pads at about 3 kHz.
  - Put the bed 10–20 dB under the voice (item volume 0.3–0.5 or the `duck` op).
  - Check with `music_report { vo: true }`.

## Sync with picture
- Choose the bpm so cuts land on beats: `musicTheory.bpmFor(cuts)`. At 30 fps, 120 bpm = 15 frames per beat, 100 bpm = 18, 90 bpm = 20.
- Declare a section or marker for every musical event graphics should hit. Clips read them as `studio.sections/markers/beat(n)`.
- When the edit already exists:
  - Size the score to the video (`musicTheory.barsFor(duration, bpm)`).
  - Put the drop on the key visual: `m.snap(revealTime, 'bar')`.
  - Hit cuts with `m.cuts(cutTimes, { hit: 'impact' })`.

## Verify (objective, because you cannot listen)
- `render_music {musicId}` shows peak, loudness sparkline (the intended arc?), accents and the spectrogram.
- `music_report {musicId, genre, vo?}` returns a one-line verdict and flags with fixes:

| Group | Flags |
|---|---|
| Level | too quiet/loud (−14 ± 2 LU), true peak > −1 dBTP, clipping, peaky (crest > 19 dB) / squashed |
| Spectrum (vs genre) | mud (250–500 Hz), boomy (60–250 Hz), no sub / sub-heavy, harsh (2–6 kHz), muffled, dull/fizzy (6–16 kHz), busy VO band (1–4 kHz) |
| Stereo | low end not mono (< 120 Hz), mono mix |
| Arrangement | no dynamics between sections (< 3 LU), static (4-bar blocks ≥ 0.97 similar for > 8 bars) |
| Time | silent gap ≥ 1 s, late start, hard ending |

- Fix the worst first, re-render, re-report; at most 3 passes. Thresholds and genre band targets are in REFERENCE.md §10.
