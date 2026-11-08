# Music for video — composition & production reference

The long form behind `SKILL.md`: tables to go from a brief to a score, rules with numbers, the QA thresholds of `music_report`, six complete recipes, and sources. The numbers are starting points; `music_report` is the final word.

Contents: 1 Brief → genre/tempo/key · 2 Arrangement for video · 3 Harmony · 4 Melody · 5 Rhythm · 6 Sound choice · 7 Mixing · 8 Beds under voice-over · 9 Why generated music sounds amateur · 10 `music_report` checks · 11 Recipes · 12 Sources

---

## 1. Brief → genre, tempo, key

Read the brief and the edit first: the story beat map (`get_script`), the cut rhythm (`get_timing`, `run_media_tool detect_shots`), the VO windows (`get_timing` words). Then pick the music.

| Brief / mood | Genre (groove) | bpm | Mode & key | `m.progression` mood | Core sounds |
|---|---|---|---|---|---|
| SaaS / product / "we make it easy" | corporate | 110–124 (116) | major — G, D, C | `corporate`, `uplifting` | marimba/bell pluck, piano, warm pad, plucked bass, claps + shaker |
| Inspiring / motivational / charity | pop / corporate | 100–124 | major — C, D | `uplifting`, `hopeful` | piano, staccato strings, airy pad, synth bass, big kick + clap |
| Explainer under voice-over | ambient / corporate (sparse) | 80–100 | major / lydian — D, F | `calm`, `dreamy` | pad, sparse piano/bell, soft sub, *no* busy lead |
| Study / cosy / lifestyle / food | lofi | 70–88 (80) | major 7th colours — F, Eb | `chill`, `jazz` | rhodes, upright/sub bass, lofi drums with swing, vinyl |
| Trailer / reveal / sport hype | cinematic | 85–100 (94) | minor — D, C, E | `epic`, `triumphant` | ensemble + staccato strings, choir, toms, sub, risers/impacts |
| Tension / mystery / problem statement | cinematic / dark | 70–100 (or 140 half-time) | minor, phrygian — E, C | `tense`, `dark` | low drone pad, pulses, sub drops, reverse cymbals |
| Street / fashion / gaming / energy | trap (half-time) | 130–150 (140) | minor — C, F | `dark` | 808 glides, hat rolls, bell pluck, dark pad |
| Fashion / tech launch / club energy | house | 120–128 (124) | minor or major — A, F | `uplifting`, `chill` | 909 kit, organ/e-piano stabs, synth bass, sidechained pad |
| Techy / futuristic / dark montage | techno | 125–135 | minor — A, F# | `dark`, `tense` | 909 kit, rim pattern, synth bass, saw lead (filtered) |
| Urban / storytelling / interviews | hiphop (boom-bap) | 84–96 (90) | minor — A, D | `melancholic`, `jazz` | lofi/acoustic kit, rhodes, sub/upright |
| Speed / extreme / gaming | dnb | 165–178 (174) | minor — F | `tense` | breaks, sub/synth bass, dark pad |
| Travel / summer / warm brand | afro / latin | 100–124 / 88–100 | major or dorian | `playful`, `uplifting` | rim clave, congas/perc, marimba, plucked bass |
| Kids / playful / quirky | pop | 100–128 | major — C, F | `playful` | pizzicato strings, marimba, bell, light drums |

- Tempo moves emotion more than mode: in conflicting cues listeners follow tempo, fast reads as happy and slow as sad (Gagnon & Peretz 2003).
- Mode brightness from bright to dark: lydian, major, mixolydian, dorian, minor, phrygian, locrian. Lydian (♯4) floats ("dreamy"), dorian is minor with a hopeful 6th, phrygian (♭2) is dark and tense.
- **Fit the picture:** choose a bpm so cuts land on beats.
  - `musicTheory.bpmFor(cutTimes, { min, max })` returns the bpm with the smallest mean error.
  - `musicTheory.fitBpm(30, { min: 100, max: 128 })` returns a bpm where 30 s is an exact multiple of 4 bars (e.g. 128 bpm → 16 bars).
  - At 30 fps, 120 bpm = 15 frames/beat, 100 bpm = 18, 90 bpm = 20.
- Pick keys with a usable bass register. Roots between E and A put the bass fundamental at 41–55 Hz (octave 1) or 82–110 Hz (octave 2). Avoid keys that force the bass below E1.

## 2. Arrangement for video

**The energy curve follows the story, not a song form.** Write the curve first, one energy value (0–1) per section. Then let `m.arrange()` decide which layers play and where the risers, impacts, fills and downlifters go. Risers go only into sections with energy ≥ 0.6: 1 bar for a +0.25 step and 2 bars for +0.4 or more, at a level relative to the section they rise from. Reverse cymbals go into energy ≥ 0.7, impacts into ≥ 0.75, a sub drop into ≥ 0.85 after a +0.35 jump, and a downlifter when energy falls 0.3 from ≥ 0.6. Use `fx: false` for soft genres, `fx: { riser: false }` to skip one effect, and `fxLevel: 0.7` to make them quieter.

| Video | Curve (energy per section) |
|---|---|
| 15 s social | hook 0.6 (2 bars) → drop 0.95 (4 bars) → button/end 0.3 (1 bar) |
| 30 s promo | intro 0.25 (2–4) → verse 0.5 (4) → build 0.7 (2–4) → drop 0.95 (8) → end 0.3 (1–2) |
| 60 s product | intro 0.2 (4) → A 0.45 (8) → build 0.65 (4) → B 0.9 (8) → break 0.35 (4) → final 1.0 (8) → end 0.25 (2) |
| Trailer | intro 0.15 → tension 0.45 → build 0.65 → (silence ≤ 1 beat) → drop 1.0 → end 0.2; there may be a false ending at 30 s |
| Explainer bed under VO | 0.3 → 0.4 → 0.45 → 0.5 → 0.3 (small steps; the voice carries the story) |

- **Intro 2–4 bars**, and something audible from frame 0. A bar of silence at the start reads as a bug.
- **Change something every 4 or 8 bars**: add or remove a layer, a fill on bar 8, a filter opening, a bass-style switch, a new melody variation. Electronic sections run in 8/16/32 bars. Fills, risers and impacts go in the last 1–4 bars before a section change, and you can drop elements just before the new section.
- **The drop lands on the reveal**: put the high-energy section's downbeat on the key visual. Use `m.cuts([revealTime])`, or size the intro so `bar(N)` equals the reveal time.
- **Build tools:** a riser over the last 2 bars, a snare roll or fill in the last bar, a reverse cymbal ending on the downbeat, a low-pass sweep opening (`plan.automate(filter.frequency, …)`), the kick removed for the last 1–2 beats. **Drop tools:** an impact plus a crash on beat 1, a sub drop, and every layer in.
- **Edit points** (production-library practice): hits, 4/8-bar drum breaks, short stops. No key or tempo changes inside a cue, because they make it impossible to edit.
- **Endings are composed, never faded.** End on the tonic on a downbeat, with a final hit and a 2–3 s tail (`tail: 3`). Use `progression(…, { cadence: 'V I' })` or `{ cadence: true }`.
- **Cut-downs** (60/30/15 s) are separate arcs, not the first 30 s with a fade. Re-run `m.arrange` with a shorter curve.

## 3. Harmony

### Proven progressions (built into `m.progression(mood)`; `variant: n` picks an alternative)

| Mood | Default | Alternatives | Auto colour (`ext: 'auto'`) |
|---|---|---|---|
| uplifting | I V vi IV | vi IV I V · I IV vi V · IV I V vi | I/IV add9, vi m7, V sus4 |
| corporate | I V vi IV | IV I V vi · vi IV I V · I IV vi V | I/IV add9, vi m7 |
| epic | i VI III VII | i VII VI VII · VI VII i i · i iv VI V | triads (big and open) |
| triumphant | I ♭VI ♭VII I | I IV V I · I V IV V · IV V I I | V sus4 |
| melancholic | i VI III VII | i iv VI V · VI VII i i · i VII VI v | i m7, VI/III maj7, iv m7 |
| tense | i ♭VI i V | i ♭II i ♭II · i iv ♭VI V · i i ♭VI ♭VII | — |
| dark | i VI iv V | i ♭II ♭VII i · i v VI iv · i iv i v | i madd9 |
| chill / lofi | ii V I vi | I vi ii V · IV iii ii I · vi ii V I | maj9 / m9 / 9 / m7 |
| dreamy | I II IV I | I iii IV iv · IV V iii vi · I IV I IV | maj7, II add9, iv m6 |
| playful | I vi IV V | I IV I V · I iii IV V · I V I IV | I6, V7 |
| hopeful | IV I V vi | I V vi IV · vi IV I V | add9 / maj7 |
| calm | I IV vi IV | IV I IV I · I iii vi IV | maj7 / m7 |
| jazz | ii V I vi | I vi ii V · iii vi ii V | full 7ths |

- I–V–vi–IV is the "axis" progression; vi–IV–I–V and IV–I–V–vi are rotations of it. i–VI–III–VII stays in natural minor and swings between dark and bright. ii–V–I is the jazz staple. i–♭VII–♭VI–V is the Andalusian cadence (flamenco or Phrygian colour).
- **Romans:** case gives the quality (V major, vi minor). `°`, `ø` and `+` give dim, half-dim and aug. The suffix can be `7 maj7 9 add9 sus2 sus4 6 5`. `b`/`#` move the root relative to the parallel major (so `bVII` in C is B♭). Numerals without accidentals are relative to the key's own mode: in A minor `VI` = F. Chord names also work (`'Am F C G'`).
- **Harmonic rhythm:** 1 chord per bar for pop and corporate. Use 2 bars per chord (`chordsPerBar: 0.5`) for cinematic, ambient and VO beds. 2 per bar adds drive, and `'I*2'` holds a chord for two slots.
- **Register and voicing (avoiding mud):**
  - Keep chord voicings between C3 and C5 (`m.voiceLead(chords, { range: ['C3','C5'] })`). Below E3 use only 5ths and octaves; seconds below A3 are mud.
  - The bass alone owns the area below ~150 Hz. Pads and keys high-pass at 150–250 Hz.
  - Don't double the 3rd. Don't stack two instruments playing the same chord in the same octave; split them (pad low and wide, piano mid, pluck high).
  - `m.voiceLead` minimises total voice movement, penalises parallel 5ths and octaves (hardest on the top voice), keeps gaps ≤ an octave and starts in root position.
- **Extensions by mood:** add9 and sus2 sound open and modern (corporate, uplifting). maj7/m7/9 sound warm and jazzy (lofi, chill). Plain triads and power chords sound epic and strong. Avoid extensions in heavy distortion and in the low register.

## 4. Melody

- **Motif first:** 1–2 bars, 3–7 notes, one rhythmic idea.
- **Form:** state it, repeat it (varied), contrast, then return and resolve. `m.melody()` uses the form `"A A' B A''"`, where primes are variations: a new ending, then a rhythmic split, then a sequence up a step.
- **Repeat more than you think.** Hooks repeat; random walks don't. A' changes one or two notes, never everything.
- **Contour:** mostly steps (2nds) and skips (3rds). Leaps of a 4th or more are for emphasis and are followed by a step back the other way (gap-fill). One high point per phrase, placed about 2/3 through. Contours: `arch` (default), `rise` (builds/trailers), `fall` (calm/outros), `wave`, `valley`.
- **Strong beats land on chord tones**, and passing tones go on the weak 8ths/16ths. `m.melody` snaps beat 1 and 3 notes and long notes to the chord under them.
- **Cadences:** end a 4-unit phrase on the tonic (long note). End mid-phrase on the 2nd or 5th degree (a half cadence: a question waiting for its answer).
- **Call and response:** the lead plays bars 1–2 and another instrument (arp, piano fill, the bass) answers in bars 3–4. Under VO, the voice is the call and the music answers in the gaps (`m.avoid(melody, voWindows)`).
- **Range:** about an octave to a 10th for a hook (the default range is a 5th below the tonic to a 3rd above the upper tonic). Leads usually sit in octaves 4–5. Under VO, use octave 3–4 sparse notes or no lead at all.
- **Rhythm cells:**

  | `rhythm` | Use |
  |---|---|
  | `straight` | default |
  | `hook` | pop chorus |
  | `syncopated` | lofi, house, afro |
  | `driving` | 16ths, techno, dnb |
  | `sparse` | long notes; VO beds and trailers |

  `density: 0.6` thins out the weak notes.
- Use `scale: 'pentatonic'` for melodies that cannot clash (lofi, ambient, kids).

## 5. Rhythm

### Grooves in `m.groove(genre)`

Each pattern is 16 steps = 1 bar. 32 steps is a 2-bar cycle, written here as A | B. Symbols: `X` accent, `x` hit, `o` ghost, `r` 32nd roll, `t` triplet roll.

| Genre | Kick | Snare/clap | Hats | Default swing |
|---|---|---|---|---|
| house | `X...X...X...X...` | clap `....X.......X...` | open `..X...X...X...X.`, closed `.o.o.o.o…` | 0.12 (≈52%) |
| techno | `X...X...X...X...` | clap on 2 & 4 (low) | `..X...X...X...X.` + rim syncopation | 0 |
| trap (half-time) | `X......x..X.....` \| `X.....x...X..x..` | clap `........X.......` (beat 3) | 8ths + rolls `xtx.rrrr` | 0 |
| hiphop (boom-bap) | `X.........X.....` \| `X......X..X...x.` | `....X.......X...` + ghosts | 8ths | 0.4 (≈57%) |
| lofi | `X.....x...X.....` | 2 & 4, ghost at the end | `x.ox.ox.…` | 0.55 (≈59%) |
| pop | `X.......X.x.....` | snare + clap 2 & 4 | `x.o.x.o.…` | 0 |
| rock | `X.......X.X.....` | 2 & 4 | accented 8ths | 0 |
| cinematic (half-time) | 1 & 3 | snare on 3 | toms `X..x..x.x..x.x..` | 0 |
| corporate | four on the floor | clap 2 & 4 | offbeat `..x.` + 16th shaker | 0 |
| dnb | `X.........X.....` (two-step) | 2 & 4 + ghosts | 8ths | 0 |
| afro | four on the floor | rim 3-2 clave `x..x..x...x.x...` | 16ths, congas | 0.3 |
| latin (dembow) | four on the floor | `...x..x....x..x.` | 8ths | 0 |
| ambient | one soft kick per bar | perc on 3 | soft offbeats | 0 |

- **Variants by energy:**
  - `intro` (< 0.3): hats/perc only.
  - `minimal` (< 0.55): kick + hat.
  - `full`.
  - `peak` (≥ 0.82): adds the ride, open hat and perc.
  - `half`: a half-time breakdown.
- **Fills:** `fills: 8` puts a big fill in bar 8 (the second half of the bar), small fills (the last beat) every 8 bars offset by 4, and a crash on the next downbeat. `plan.groove()` also fills into every rising section.
- **Swing:** `m.swing(amount, '16n')` takes 0 (straight) to 1 (triplet), or MPC percentages (`m.swing(58)`). Roger Linn's guide: 50% straight, 54% just loosens, 58–62% hip-hop and lofi, 66% full triplet. Keep the kick on the grid and swing the hats, ghost notes and keys.
- **Velocity:**
  - Never use one velocity for repeated hits; that is the "machine-gun" effect.
  - Hats alternate strong and weak (1.0/0.6), ghosts sit at 0.3–0.45, and backbeats are steady.
  - Melodies lean on downbeats.
  - `m.velocity(evs, 'accent'|'crescendo'|'arch')` and `m.humanize(evs, { timing: 8, vel: 0.06 })`: ±4–8 ms for electronic, 10–20 ms for lofi/live feel. Humanize the kick less (grooves use 4 ms).
- **Ghost notes** (snare `o` at 0.4) give hip-hop, lofi and dnb their roll. Trap hat rolls go only in the bar before a snare or at the end of a 4-bar phrase.

## 6. Sound choice

| Mood | Use | Avoid |
|---|---|---|
| Uplifting / corporate | piano, marimba or bell pluck, staccato strings, warm/airy pad, plucked bass, claps, shaker | detuned saws, distorted leads, long reverbs on drums |
| Lofi / chill | rhodes, upright or sub bass, lofi kit, vinyl, filtered pad | bright 909 hats, wide supersaws |
| Cinematic | ensemble + staccato strings, choir, toms/taiko, sub, impacts, risers, reverse cymbals | busy hats outside the climax, pop claps |
| Trap / dark | 808 with glide, crisp hats with rolls, bell/pluck, dark pad | live-feel swing, bright major pads |
| House | 909 kit, organ/e-piano stabs, synth bass, saw lead (filtered), sidechained pad | acoustic drums |
| VO bed / explainer | airy/glass pad, sparse piano or bell, soft sub | square/saw leads, dense arps in 1–4 kHz |

- **Raw oscillators sound amateur.** Use `m.inst.*` (sampled or designed) instead of bare `Tone.Synth` square/saw waves. If you must synthesise, filter it: low-pass a saw at 2–5 kHz and give it an envelope.
- **Fewer, better layers:** 4–6 parts at a time. Rotate layers through the arrangement instead of stacking everything.

## 7. Mixing

### Frequency slots

| Range | What lives there | Problem when crowded |
|---|---|---|
| 20–60 Hz sub | kick fundamental, 808/sub | headroom eaten, rumble; invisible on phones |
| 60–250 Hz low | bass body, kick punch (kick ~50–100, bass ~70–150: give one of them the bottom) | boom; masking between kick and bass |
| 250–500 Hz low-mid | body of pads, keys, guitars | **mud** (200–500), boxiness (300–600) |
| 500 Hz–2 kHz mid | chords, melody fundamentals, snare body | honk |
| 2–6 kHz presence | attack, consonants of the voice, leads | **harshness** (2.5–5k); masks voice-over |
| 6–16 kHz air | hats, cymbals, breath, reverb shimmer | fizz, sibilance (5–8k) |

- **High-pass everything that isn't kick or bass:** pads/keys at 150–250 Hz, leads at 200–300, hats at 300–500, and reverb returns at 200–300 Hz (`mix.js` does this by default). Low-pass the reverb return at 6–10 kHz.
- **Keep the low end mono below ~100–150 Hz.** Kick, bass and 808 go at pan 0 with no width on bass. `m.master()` also monos the region below ~120 Hz.
- **Gain staging:** build the mix so the kick peaks around −6 dBFS and the bus stays well below 0, then let `m.master({ lufs: -14 })` normalise. Never push the bus into the limiter to get loudness.
- **Starting levels relative to the kick** (no published standard exists; these are practice values to check with `music_report`):

  | Element | Level vs kick |
  |---|---|
  | snare / clap | −1 … −3 dB |
  | bass / 808 | −2 … −5 dB (kick and bass together own the bottom) |
  | hats | −10 … −16 dB |
  | perc / shaker | −12 … −18 dB |
  | lead / hook | −4 … −8 dB |
  | piano / keys | −6 … −10 dB |
  | pads / strings bed | −12 … −18 dB |
  | arp / pluck | −10 … −14 dB |
  | risers / whooshes | −8 … −14 dB |
  | impacts | −2 … −6 dB |

- **Panning:**
  - Center: kick, snare, bass, lead and VO.
  - Hats ±0.2, perc and shaker ±0.3–0.5, double-tracked parts L/R.
  - Pads wide (width 0.6–0.8) but high-passed.
  - Arps and plucks ±0.2–0.4, opposite to the keys.
- **Sends, not inserts:** one shared reverb and one delay (`sends: { reverb, delay }`), with 4–5 reverb uses per mix at most. Drums get little or no reverb (a clap/snare 0.1–0.2). Pads 0.3–0.5, leads 0.15–0.3, plucks use delay 0.15–0.3. Pre-delay of 20–60 ms keeps leads clear.
- **Sidechain** (house, pop, lofi pump): `m.sidechain([pad, bass], groove, { depth: -6, release: 0.15–0.25 })`. Use −2 … −4 dB for subtle glue and −6 … −10 dB for the obvious EDM pump. A release around a kick's length (~200 ms) is natural.
- **Loudness delivery:**

  | Platform | Integrated loudness | True peak |
  |---|---|---|
  | social / streaming (YouTube, Spotify, Tidal, Amazon) | −14 LUFS | ≤ −1 dBTP |
  | Apple Music | −16 LUFS | ≤ −1 dBTP |
  | broadcast EBU R128 | −23 LUFS ±0.5 | −1 dBTP |
  | broadcast ATSC A/85 | −24 LKFS | −2 dBTP |

  A typical modern pop master has PLR ≈ 9, a crest factor of 8–12 dB, and LRA 4–10 LU.
- **Spectral balance:** pink noise is flat per octave (−3 dB/oct on an FFT display). Finished mixes fall about 3–6 dB/oct faster above ~150 Hz. `music_report` measures per-octave levels relative to 500 Hz–2 kHz. Mastered references measured: sub +2…+8, low +4…+9, low-mid ≈ +5, presence −1…−13, air −7…−24 dB.

## 8. Beds under voice-over

- **The voice owns 1–4 kHz:** consonants sit at 2–4 kHz and vowels at 350 Hz–2 kHz. Under VO:
  - Keep melodies out of the VO lines (`m.avoid(melody, voWindows)`).
  - Use `rhythm: 'sparse'` and long notes.
  - Put leads an octave lower or drop them entirely.
  - Low-pass pads and keys at 2.5–3 kHz (`m.inst.pad('airy', { mix: { lowpass: 3000 } })`).
  - Check with `music_report { vo: true }`.
- **Level:** the bed sits 10–20 dB under the voice (dialogue around −12…−6 dB, music −18…−24 dB in an editor). In Smashcut, set the item volume to 0.3–0.5, or use the `duck` op (12–18 dB, attack 30–80 ms, release 250–700 ms).
- **Words come from `get_timing`.** Group words into VO windows (`[{start, end}]`, merging gaps < 0.6 s). Then let the music answer in the gaps: a fill, a pluck phrase, or a riser into the next line.
- **No lyrics, no hooks fighting the message.** Keep harmonic rhythm slow (`chordsPerBar: 0.5`) and dynamics in small steps.

## 9. Why generated music sounds amateur — and the fix

| Symptom | Why it sounds bad | Fix (API) |
|---|---|---|
| The same 2–4-bar loop for the whole piece | no story, the ear stops listening | `m.arrange` energy curve; `music_report` flags `static` |
| One velocity everywhere | machine-gun hats, lifeless chords | grooves have accents and ghosts; `m.velocity`, `m.humanize` |
| No dynamics between sections | the drop doesn't land, the intro is as loud as the climax | energy 0.2 → 0.95; `plan.filter` scales velocities; aim for 4–8 LU between sections |
| Everything in the same register (C3–C4) | mud, masking | `voiceLead` range C3–C5, lead in octave 4–5, bass in 1–2, pads high-passed |
| Raw square/saw oscillators | buzzy and cheap | `m.inst.*`; filter and envelope any synth |
| Too many layers at once | masking, mud, no focus | 4–6 parts; rotate layers by energy |
| No transitions | sections just switch | riser/fill/reverse cymbal before, impact + crash on the downbeat (automatic in `m.arrange`) |
| Random-walk melodies | no hook, nothing to remember | `m.melody` motif form `A A' B A''`, strong beats on chord tones |
| Unresolved / faded ending | feels cut off | `cadence: 'V I'`, final hit on a downbeat, `tail: 2–3` |
| Wrong tempo for the cut rhythm | cuts fight the beat | `musicTheory.bpmFor(cuts)`, `m.cuts(times)` |
| Busy midrange melody under VO | voice unintelligible | `m.avoid`, sparse rhythm, low-pass the bed, `music_report { vo: true }` |
| Kick and bass on top of each other, wide sub | boomy, weak on phones | sidechain the bass, mono low end, one owner per range |
| Peaky raw drum synths | low LUFS with a 0 dBFS peak | `m.inst.drums(kit, { mix: { comp: { threshold: -20, ratio: 4 } } })`, `m.master({ preset: 'punchy' })` |

## 10. `music_report` — checks and thresholds

`music_report { musicId, genre?, vo?, targetLufs? }` uses the rendered WAV and the score's sections and bpm. Fixes are phrased in the score API.

| Flag | Measure | Threshold | Severity |
|---|---|---|---|
| `too-quiet` / `too-loud` | integrated LUFS (EBU R128, ffmpeg `ebur128`) | target −14 ± 2 LU (± 5 → P0) | P1/P0 |
| `true-peak` | true peak (dBTP) | > −1 | P1 |
| `clipping` | runs of ≥ 3 samples at ≥ 0.999 FS | any | P0 |
| `peaky` / `squashed` | crest factor = sample peak − RMS | > 19 dB (lofi 20, cinematic/ambient 22) / < 6 dB (ambient 5) | P1 / P2 |
| `mud` | 250–500 Hz per-octave level vs 500 Hz–2 kHz | > +8 dB (house/techno/trap/dnb +7.5, lofi/cinematic/ambient +9) | P1 |
| `boomy` | 60–250 Hz | > +11…+14 by genre | P1 |
| `no-sub` / `sub-heavy` | 20–60 Hz | below the genre minimum (not checked for ambient) / above the maximum | P1 / P2 |
| `harsh` / `muffled` | 2–6 kHz | > −1…−3 / < −11…−16 by genre | P1 / P2 |
| `dull` / `fizzy` | 6–16 kHz | < −20…−30 / > −6…−9 by genre | P2 |
| `vo-band` (with `vo: true`) | 1–4 kHz vs 250 Hz–1 kHz per octave | > −2 dB | P1 |
| `low-not-mono` | side/mid energy below 120 Hz | > −12 dB | P1 |
| `mono-mix` | side/mid, whole band | < −30 dB | P2 |
| `no-dynamics` | short-term (momentary) loudness per score section | spread < 3 LU (cinematic 5, ambient 2) | P1 |
| `static` | correlation of consecutive 4-bar log-band spectrograms | ≥ 0.97 over more than 8 bars | P1 |
| `silent-gap` | momentary loudness < −50 LUFS | ≥ 1 s inside the piece | P0 |
| `late-start` | first audible momentary loudness (> −45 LUFS) | > 0.6 s | P1 |
| `hard-end` | RMS of the last 50 ms | > −40 dBFS | P1 |

Genre band targets (dB per octave relative to 500 Hz–2 kHz; pink noise = 0):

| genre | sub | low | low-mid | presence | air |
|---|---|---|---|---|---|
| pop | −6…9 | 1…12 | −2…8 | −11…−1 | −21…−6 |
| corporate | −8…8 | 0…11 | −2…8 | −11…−1 | −20…−6 |
| house / techno | −2…12 | 2…13 | −3…7.5 | −12…−2 | −21…−4 |
| trap | 2…16 | 2…14 | −4…7.5 | −13…−2 | −22…−4 |
| hiphop | −2…14 | 2…13 | −3…8 | −13…−2 | −23…−7 |
| dnb | −2…13 | 1…12 | −3…7.5 | −12…−2 | −21…−4 |
| lofi | −8…10 | 0…12 | −2…9 | −15…−3 | −30…−9 |
| cinematic | −6…14 | −1…12 | −3…9 | −14…−1 | −24…−6 |
| ambient (and every `vo: true` bed) | −12…10 | −3…12 | −3…9 | −16…−3 | −26…−7 |

The report also returns per-section LUFS, onset rate and band profile, `blockSimilarity` (how much changes every 4 bars), stereo width, PLR, LRA and the detected bpm.

**Loop:** write → `render_music` → `music_report` → fix P0, then P1 → repeat (at most 3 passes) → report what's left.

---

## 11. Recipes

These are complete `score.js` files. Copy one and adapt the key, curve, bars and seeds. They use the theory helpers plus `m.inst` / `m.fx` / `m.channel` / `m.master`, all feature-detected (`if (m.fx) …`). Channel overrides go in `{ mix: { pan, highpass, lowpass, eq, sends, vol } }`. The instruments come with balanced levels, so the recipes override only filters, pans and sends.

### Recipe 1 — Corporate uplifting (116 bpm, G major, 24 bars ≈ 50 s)

```js
// recipe: corporate
studio.music({
  title: 'Corporate Uplift 116', bpm: 116, beatsPerBar: 4, bars: 24, tail: 3,
  sections: [{ name: 'intro', bar: 0 }, { name: 'verse', bar: 4 }, { name: 'build', bar: 12 }, { name: 'chorus', bar: 16 }, { name: 'end', bar: 23 }],
  markers: [{ name: 'drop', bar: 16 }, { name: 'end', bar: 23 }],
  build(m) {
    const plan = m.arrange({ intro: 0.2, verse: 0.5, build: 0.68, chorus: 0.95, end: 0.25 });
    const chords = m.voiceLead(m.progression('corporate', 'G major', { bars: 24, cadence: 'I' }), { range: ['G3', 'D5'] });

    const pad = m.inst.pad('warm', { mix: { highpass: 200, sends: { reverb: 0.3 } } });
    const piano = m.inst.piano({ mix: { highpass: 150, pan: -0.15, sends: { reverb: 0.2 } } });
    const bass = m.inst.bass('pluck');
    const pluck = m.inst.pluck('marimba', { mix: { pan: 0.25, highpass: 300, sends: { delay: 0.2, reverb: 0.15 } } });
    const lead = m.inst.lead('soft', { mix: { highpass: 250, lowpass: 7000, sends: { reverb: 0.25, delay: 0.12 } } });
    const kit = m.inst.drums('909');

    m.perform(pad, plan.filter(chords, 'pad'), { vel: 0.55 });
    m.perform(piano, plan.filter(m.comp(chords, 'x..x..x...x.x...'), 'keys'), { vel: 0.7 });
    m.perform(bass, plan.filter(m.bassline(chords, 'syncopated'), 'bass'));
    m.perform(pluck, plan.filter(m.arp(chords, 'updown', '8n', { octaves: 2 }), 'arp'), { transpose: 12, vel: 0.6 });
    const hook = m.melody(chords.key, { chords, from: 16, bars: 7, rhythm: 'hook', contour: 'arch', seed: 3 });
    m.perform(lead, m.humanize(hook, { timing: 6 }));

    const drums = plan.groove('corporate', { fills: 8 });
    drums.perform(kit, { vel: { shaker: 0.7, hat: 0.85 } });
    m.sidechain([pad, bass], drums, { depth: -5, release: 0.2 });
    m.at(m.bar(23), (t) => { kit.kick(t, 1); kit.crash(t, 0.9); }); // final hit on the last downbeat
    m.master({ preset: 'warm', lufs: -14 });
  },
});
```

### Recipe 2 — Lo-fi (80 bpm, F major, swing, 17 bars ≈ 51 s)

```js
// recipe: lofi
studio.music({
  title: 'Lofi Study 80', bpm: 80, beatsPerBar: 4, bars: 17, tail: 3,
  sections: [{ name: 'intro', bar: 0 }, { name: 'groove', bar: 2 }, { name: 'melody', bar: 6 }, { name: 'break', bar: 10 }, { name: 'return', bar: 12 }, { name: 'end', bar: 16 }],
  build(m) {
    // lo-fi: no risers/impacts (fx: false) — transitions come from the drums (fills) and layers dropping out
    const plan = m.arrange({ intro: 0.2, groove: 0.5, melody: 0.7, break: 0.35, return: 0.8, end: 0.15 },
      { layers: { keys: 0, pad: 0.3, bass: 0.35, drums: 0.45, lead: 0.65, arp: 0.78 }, fx: false });
    const chords = m.voiceLead(m.progression('chill', 'F major', { bars: 17, cadence: 'I' }), { range: ['E3', 'G5'] });
    const keys = m.inst.keys('rhodes', { mix: { highpass: 140, lowpass: 5000, pan: -0.2, sends: { reverb: 0.25 } } });
    const pad = m.inst.pad('warm', { mix: { highpass: 250, lowpass: 3000, sends: { reverb: 0.35 } } });
    const bass = m.inst.bass('upright', { mix: { lowpass: 1500 } });
    const bell = m.inst.pluck('bell', { mix: { pan: 0.25, highpass: 300, lowpass: 6000, sends: { delay: 0.25, reverb: 0.3 } } });
    const kit = m.inst.drums('lofi');
    const sw = m.swing(0.5, '16n'); // ≈ MPC 58%
    m.perform(keys, plan.filter(m.humanize(sw.events(m.comp(chords, 'X.....x...x.....')), { timing: 12 }), 'keys'), { vel: 0.6 });
    m.perform(pad, plan.filter(chords, 'pad'), { vel: 0.4 });
    m.perform(bass, plan.filter(m.humanize(sw.events(m.bassline(chords, 'root', { groove: 'x.....x...x.....' })), { timing: 10 }), 'bass'));
    const a = m.melody(chords.key, { chords, from: 6, bars: 4, rhythm: 'syncopated', scale: 'pentatonic', contour: 'wave', seed: 8, density: 0.7 });
    const b = m.melody(chords.key, { chords, from: 12, bars: 4, rhythm: 'syncopated', scale: 'pentatonic', contour: 'arch', seed: 8, density: 0.85 });
    m.perform(bell, m.humanize(sw.events([...a, ...b]), { timing: 15 }), { transpose: 12 });
    const drums = plan.groove('lofi');
    drums.perform(kit, { vel: { hat: 0.8 } });
    m.sidechain([keys, pad], drums, { depth: -4, release: 0.25 });
    if (m.fx) m.fx.vinyl(true, { level: -34 }); // crackle well under the music
    m.master({ preset: 'warm', lufs: -14 });
  },
});
```

### Recipe 3 — Cinematic trailer (94 bpm, D minor, risers/impacts, 24 bars ≈ 61 s)

```js
// recipe: cinematic
studio.music({
  title: 'Trailer Rise 94', bpm: 94, beatsPerBar: 4, bars: 24, tail: 4,
  sections: [{ name: 'intro', bar: 0 }, { name: 'tension', bar: 4 }, { name: 'build', bar: 12 }, { name: 'drop', bar: 16 }, { name: 'end', bar: 22 }],
  markers: [{ name: 'impact', bar: 16 }, { name: 'end', bar: 22 }],
  build(m) {
    // risers into build/drop, reverse cymbal + impact + sub drop on the drop happen automatically (m.fx)
    const plan = m.arrange({ intro: 0.15, tension: 0.45, build: 0.65, drop: 1, end: 0.2 },
      { layers: { pad: 0, bass: 0.4, arp: 0.4, drums: 0.4, choir: 0.6, lead: 0.9 } });
    const chords = m.voiceLead(m.progression('epic', 'D minor', { bars: 24, chordsPerBar: 0.5, cadence: 'i' }), { range: ['A2', 'A4'] });
    const strings = m.inst.strings('ensemble', { mix: { highpass: 120, sends: { reverb: 0.35 } } });
    const stacc = m.inst.strings('staccato', { mix: { highpass: 200, pan: 0.2, sends: { reverb: 0.25 } } });
    const choir = m.inst.choir({ mix: { highpass: 250, sends: { reverb: 0.5 } } });
    const sub = m.inst.bass('sub');
    const brass = m.inst.lead('saw', { mix: { highpass: 200, lowpass: 4500, sends: { reverb: 0.4 } } });
    const kit = m.inst.drums('acoustic');
    m.perform(strings, plan.filter(chords, 'pad'), { vel: 0.6 });
    m.perform(stacc, plan.filter(m.velocity(m.arp(chords, 'pattern', '8n', { octaves: 2 }), 'accent'), 'arp'), { vel: 0.8 });
    m.perform(stacc, plan.filter(m.arp(chords, 'updown', '16n', { from: 12, to: 16 }), 'arp'), { vel: 0.55, transpose: 12 }); // the build doubles the pulse
    m.perform(choir, plan.filter(chords, 'choir'), { vel: 0.6, transpose: 12 });
    m.perform(sub, plan.filter(m.bassline(chords, 'root'), 'bass'));
    m.perform(brass, m.melody(chords.key, { chords, from: 16, bars: 6, rhythm: 'sparse', contour: 'rise', seed: 12, form: "A A' A''" }), { vel: 0.85 });
    plan.groove('cinematic', { fills: 4 }).perform(kit);
    const END = m.bar(22);
    m.at(END, (t) => { kit.kick(t, 1); kit.tom(t, 1); kit.crash(t, 0.8); });
    if (m.fx) m.fx.impact(END, 1);
    m.master({ preset: 'punchy', lufs: -14 });
  },
});
```

### Recipe 4 — Trap (140 bpm half-time, C minor, 808 glides, 16 bars ≈ 27 s)

```js
// recipe: trap
studio.music({
  title: 'Trap Night 140', bpm: 140, beatsPerBar: 4, bars: 16, tail: 2.5,
  sections: [{ name: 'intro', bar: 0 }, { name: 'drop', bar: 4 }, { name: 'switch', bar: 12 }, { name: 'end', bar: 15 }],
  markers: [{ name: 'drop', bar: 4 }],
  build(m) {
    const plan = m.arrange({ intro: 0.3, drop: 0.95, switch: 0.8, end: 0.2 }, { layers: { pad: 0, top: 0.25, bass: 0.6, drums: 0.3, lead: 0.7 } });
    const chords = m.voiceLead(m.progression('dark', 'C minor', { bars: 16, chordsPerBar: 0.5 }), { range: ['C3', 'C5'] });
    const pad = m.inst.pad('dark', { mix: { highpass: 250, sends: { reverb: 0.4 } } });
    const bell = m.inst.pluck('bell', { mix: { highpass: 400, pan: 0.15, sends: { delay: 0.25, reverb: 0.2 } } });
    const b808 = m.inst.bass('808');
    const kit = m.inst.drums('trap');
    m.perform(pad, plan.filter(chords, 'pad'), { vel: 0.5 });
    // bell motif in the intro and drop, answered by silence in the switch
    const motif = m.melody(chords.key, { chords, from: 0, bars: 12, motifBars: 2, rhythm: 'syncopated', scale: 'pentatonic', seed: 21, density: 0.75 });
    m.perform(bell, plan.filter(motif, 'top'), { transpose: 12 });
    const drums = plan.groove('trap', { fills: 4 });            // half-time clap on 3, hat rolls, fills every 4
    drums.perform(kit, { vel: { hat: 0.8, openHat: 0.8 } });
    // 808 follows the kick pattern, gliding up an octave at the end of chords
    m.perform(b808, plan.filter(m.bassline(chords, '808-glide', { groove: 'X......x..X.....' + 'X.....x...X..s..' }), 'bass'));
    m.sidechain(pad, drums, { depth: -4, release: 0.2 });
    if (m.fx) { m.fx.subDrop(m.bar(4)); m.fx.reverseCymbal(m.bar(12)); }
    m.at(m.bar(15), (t) => { kit.kick(t, 1); kit.crash(t, 0.7); });
    m.master({ preset: 'punchy', lufs: -14 });
  },
});
```

### Recipe 5 — House (124 bpm, A minor, sidechain pump, filter build, 32 bars ≈ 62 s)

```js
// recipe: house
studio.music({
  title: 'House Lift 124', bpm: 124, beatsPerBar: 4, bars: 32, tail: 3,
  sections: [{ name: 'intro', bar: 0 }, { name: 'groove', bar: 8 }, { name: 'build', bar: 16 }, { name: 'drop', bar: 20 }, { name: 'end', bar: 31 }],
  markers: [{ name: 'drop', bar: 20 }],
  build(m) {
    const plan = m.arrange({ intro: 0.35, groove: 0.6, build: 0.7, drop: 1, end: 0.3 }, { layers: { drums: 0.3, bass: 0.55, keys: 0.6, pad: 0.35, lead: 0.9 } });
    // numerals are read in the given key: vi IV I V in C major = Am F C G (A-minor feel, major key signature)
    const chords = m.voiceLead(m.progression('vi IV I V', 'C major', { bars: 32, cadence: 'vi' }), { range: ['A3', 'E5'] });
    const organ = m.inst.keys('organ', { mix: { highpass: 250, sends: { reverb: 0.15, delay: 0.1 } } });
    const pad = m.inst.pad('warm', { mix: { highpass: 220, sends: { reverb: 0.3 } } });
    const bass = m.inst.bass('synth');
    const lead = m.inst.lead('saw', { mix: { highpass: 300, lowpass: 6000, sends: { delay: 0.2, reverb: 0.2 } } });
    const kit = m.inst.drums('909');
    // offbeat organ stabs (the classic house push), pad in the breakdowns
    m.perform(organ, plan.filter(m.comp(chords, '..x...x...x...x.', { gate: 0.5 }), 'keys'));
    m.perform(pad, plan.filter(chords, 'pad'), { vel: 0.5 });
    m.perform(bass, plan.filter(m.bassline(chords, 'syncopated', { groove: '..x...x.x.x...x.' }), 'bass'));
    m.perform(lead, m.melody(chords.key, { chords, from: 20, bars: 11, rhythm: 'syncopated', contour: 'wave', seed: 5 }));
    const drums = plan.groove('house', { fills: 8 });
    drums.perform(kit);
    m.sidechain([pad, bass, organ], drums, { depth: -8, release: 0.16 }); // audible pump
    // low-pass sweep through the build: energy → cut-off (400 Hz at 0 … 12 kHz at 1), ramps across the 'build' section
    const lp = organ.filter || (organ.channel && organ.channel.lowpass);
    if (lp && lp.frequency) plan.automate(lp.frequency, { lo: 400, hi: 12000 });
    m.master({ preset: 'punchy', lufs: -14 });
  },
});
```

### Recipe 6 — Explainer bed under voice-over (90 bpm, D major, sparse, VO-aware, 16 bars ≈ 43 s)

```js
// recipe: bed
studio.music({
  title: 'Explainer Bed 90', bpm: 90, beatsPerBar: 4, bars: 16, tail: 3,
  sections: [{ name: 'intro', bar: 0 }, { name: 'a', bar: 2 }, { name: 'b', bar: 8 }, { name: 'end', bar: 15 }],
  build(m) {
    // VO windows (seconds) from get_timing words — the melody stays out of them and answers in the gaps
    const vo = [[1.2, 6.4], [7.4, 13.0], [14.2, 21.5], [22.6, 30.1], [31.2, 38.0]];
    const plan = m.arrange({ intro: 0.3, a: 0.4, b: 0.5, end: 0.25 }, { layers: { pad: 0, keys: 0.3, bass: 0.35, drums: 0.4, arp: 0.45 }, fx: { impact: false, subDrop: false } });
    const chords = m.voiceLead(m.progression('calm', 'D major', { bars: 16, chordsPerBar: 0.5, cadence: 'I' }), { range: ['D3', 'A4'] });
    const pad = m.inst.pad('airy', { mix: { highpass: 200, lowpass: 3000, sends: { reverb: 0.4 } } }); // keep 1–4 kHz for the voice
    const piano = m.inst.piano({ mix: { highpass: 180, lowpass: 3500, sends: { reverb: 0.3 } } });
    const bell = m.inst.pluck('bell', { mix: { highpass: 400, lowpass: 4000, sends: { delay: 0.3, reverb: 0.3 } } });
    const sub = m.inst.bass('sub');
    const kit = m.inst.drums('lofi');
    m.perform(pad, plan.filter(chords, 'pad'), { vel: 0.5 });
    m.perform(piano, plan.filter(m.comp(chords, 'x.......x.......'), 'keys'), { vel: 0.45 });
    m.perform(sub, plan.filter(m.bassline(chords, 'root', { octave: 2 }), 'bass'), { vel: 0.42 }); // octave 2: warm, audible on phones, no sub build-up
    const answers = m.melody(chords.key, { chords, from: 2, bars: 12, rhythm: 'sparse', scale: 'pentatonic', seed: 4, avoid: vo });
    m.perform(bell, answers, { vel: 0.5 });
    plan.groove('ambient', { fills: 0 }).perform(kit, { vel: { kick: 0.6, hat: 0.35, perc: 0.4 } });
    m.master({ preset: 'clean', lufs: -14 }); // the timeline item volume (0.3–0.5) or the duck op puts it under the voice
  },
});
```

### Snippet — hitting video cuts and fitting a length

```js
const cutTimes = [2.0, 4.1, 6.0, 9.9, 12.0];                      // from detect_shots / get_timing, relative to the music start
const fit = musicTheory.bpmFor(cutTimes, { min: 100, max: 130 }); // → { bpm: 120, meanErrorMs: 20 }
const bars = musicTheory.barsFor(15, fit.bpm);                     // bars to cover 15 s
studio.music({
  bpm: fit.bpm, bars, sections: [{ name: 'a', bar: 0 }],
  build(m) {
    const hits = m.cuts(cutTimes, { grid: 'beat', hit: 'impact' }); // snapped to the beat when within 120 ms, else exactly on the cut
    const reveal = m.snap(9.9, 'bar');                              // nearest bar line → start the drop there
    void hits; void reveal;
  },
});
```

---

## 12. Sources

- iZotope, *Mastering for streaming platforms* (platform loudness, true-peak headroom): https://www.izotope.com/en/learn/mastering-for-streaming-platforms.html
- Spotify for Artists, *Loudness normalization* (−14 LUFS, true-peak advice): https://artists.spotify.com/help/article/loudness-normalization
- EBU R128 (−23 LUFS, −1 dBTP) and EBU Tech 3342 (LRA): https://tech.ebu.ch/loudness · https://tech.ebu.ch/docs/tech/tech3342.pdf · https://en.wikipedia.org/wiki/EBU_R_128
- ATSC A/85 summary: https://www.forasoft.com/learn/audio-for-video/articles-audio/loudness-normalization-ebu-r128-bs1770-atsc-a85
- Auphonic, LRA of speech vs music: https://auphonic.com/blog/2019/08/19/dynamic-range-processing/
- Production Advice, PLR: https://productionadvice.co.uk/plr/ · iZotope, crest factor: https://www.izotope.com/en/learn/what-is-crest-factor
- LANDR, frequency masking and register map: https://blog.landr.com/frequency-masking
- iZotope, EQ for bass: https://www.izotope.com/en/learn/how-to-eq-bass.html · *Taming a bright mix*: https://www.izotope.com/en/learn/6-ways-to-tame-a-bright-mix.html
- iZotope, *10 beginner mixing mistakes*: https://www.izotope.com/en/learn/10-beginner-mistakes-to-avoid-when-mixing-music
- Sound on Sound, pink noise as a mix reference: https://www.soundonsound.com/techniques/mixing-pink-noise-reference · reverb treatments: https://www.soundonsound.com/techniques/how-optimise-your-reverb-treatments
- Pestana, Ma & Reiss, *Spectral characteristics of popular commercial recordings 1950–2010* (AES 135): https://www.aes.org/e-lib/browse.cfm?elib=17010
- iZotope, Tonal Balance Control: https://www.izotope.com/en/learn/comparing-tonal-balance-in-popular-music.html
- MusicRadar, sidechain bass and drums: https://musicradar.com/how-to/sidechain-bass-and-drums · stereo bass: https://www.musicradar.com/how-to/how-to-break-the-rules-and-work-with-stereo-bass
- Storyblocks, music under voice (levels, ducking): https://www.storyblocks.com/resources/tutorials/how-to-adjust-music-behind-a-voice-track-in-premiere-pro
- PremiumBeat, audio levels for video: https://www.premiumbeat.com/blog/how-to-set-audio-levels-for-video/
- Audio Network, music for voice-over-heavy video: https://blog.audionetwork.com/the-edit/music/how-to-choose-music-for-a-voiceover-heavy-video/
- Live Design, speech intelligibility bands: https://www.livedesignonline.com/sound/corporate-audio-101
- Sound on Sound, *Library music* (edit points, cut-downs, stings, trailer form, no fades, mono-safe): https://www.soundonsound.com/techniques/library-work
- Hypebot, production library submission tips: https://www.hypebot.com/want-to-submit-to-a-production-music-library-6-essential-tips
- Ableton Learning Music, tempo and genre: https://learningmusic.ableton.com/make-beats/tempo-and-genre.html
- Native Instruments, trap beat and boom-bap: https://www.native-instruments.com/blogs/blog/how-to-make-a-trap-beat · https://www.native-instruments.com/blogs/blog/what-is-boom-bap
- Attack Magazine, Roger Linn on swing: https://www.attackmagazine.com/features/interview/roger-linn-swing-groove-magic-mpc-timing/ · boom-bap dissected: https://www.attackmagazine.com/technique/beat-dissected/90s-boom-bap-hip-hop/
- EDMProd, drum & bass and lo-fi: https://www.edmprod.com/what-is-drum-and-bass/ · https://www.edmprod.com/lofi-hip-hop/
- Wikipedia: four on the floor https://en.wikipedia.org/wiki/Four_on_the_floor_(music) · I–V–vi–IV https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression · ii–V–I https://en.wikipedia.org/wiki/Ii%E2%80%93V%E2%80%93I_progression · Andalusian cadence https://en.wikipedia.org/wiki/Andalusian_cadence · call and response https://en.wikipedia.org/wiki/Call_and_response_(music)
- Gagnon & Peretz (2003), mode and tempo in happy/sad judgements: https://informahealthcare.com/doi/abs/10.1080/02699930302279
- Berklee Online, motif and repetition: https://online.berklee.edu/takenote/?p=3077
- Gap-fill / regression to the mean (von Hippel & Huron): https://mutor-2.github.io/ScienceOfMusic/units/10
- iZotope, humanizing drums: https://www.izotope.com/en/learn/how-to-humanize-and-dehumanize-drums · Loopcloud, drum programming tips: https://www.loopcloud.com/cloud/blog/5254-7-Drum-Programming-Tips-to-Improve-Any-Groove
- Beat Kitchen, from loop to track: https://beatkitchen.io/guides/electronic-music/10-from-loop-to-track/
- Musical U, the moods of the modes: https://www.musical-u.com/learn/the-many-moods-of-musical-modes

Calibration note: the `music_report` band targets were checked against pink noise (reads 0 dB in every band) and against mastered full mixes (cinematic electronic, synth-pop, rock/metal). Those measured sub +2…+8, low +4…+9, low-mid ≈ +5, presence −1…−13 and air −7…−24 dB relative to 500 Hz–2 kHz.
