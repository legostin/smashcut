---
name: studio-author-voice
description: The author voices the video themself — preparing the script for the teleprompter, what happens to a recorded take (processing, word timings, placement on the voice-over track), checking takes, re-timing scenes to the recording, captions from the take, mixing with music. Use when the user records their own voice, mentions the teleprompter / microphone / "my voice", brings a narration file, or a scene has vo.source "mic".
---

# The author's own voice

The user can read the script from the **teleprompter** (Script panel → "Record my voice", or "Record" on a scene) and record the narration with their microphone. You cannot record — you prepare the text before, and take care of the takes after.

**Rule zero:** a scene with `vo.source: "mic"` is voiced by the author. Never replace it with `generate_voiceover` (the tool refuses without `replaceRecorded:true`) unless the user asks for a synthetic voice. The recording is the fixed thing; the picture adapts to it.

## Before recording: text a person can read

The teleprompter shows the scene's **speech** text (`speech`, falling back to `voiceover`), one word highlighted at a time, at the reader's pace.

- Write `speech` for every narrated scene (`update_scene {id, patch:{speech}}`), same markup as for the synthetic voice (studio-voiceover skill): `{2026|две тысячи двадцать шестой}` — the reader sees the words, captions keep the digits; stress marks on words that are easy to misread; `[pause 0.4]` shows as a pause mark.
- Write for the mouth: sentences of 6–14 words, one thought per sentence, no parentheses, no tongue-twisters, no three consonant-heavy words in a row. Read it in your head at speaking speed.
- Budget the length: a calm read is 120–150 words per minute — about **2.2–2.5 words per second of scene**. A 6 s scene holds ~14 words. If the copy is longer, cut the copy or lengthen the scene **before** the user records.
- One scene = one breath-sized passage. A scene with more than ~45 words: split it, a take that long rarely survives.

## After recording: what the studio did, what you check

Each take is saved as `media/rec-scene-<n>-<id>.wav` (raw, never changed), cleaned by the `voice_polish` chain into `….voice.wav`, put on the voice-over track as `VO: <scene title>` at the scene start (replacing the scene's previous voice), and aligned to the script: local Whisper hears the take, the script's words get the take's timings (captions show the script's text, digits included).

`list_voice_takes` — per take:

| Field | Meaning | Act when |
|---|---|---|
| `report.before/after` | loudness, peak, noise, SNR before and after processing | see studio-voice-processing |
| `align.matched / total`, `missed`, `extra` | how many script words were heard; which were not; what was said beyond the script | `missed` ≥ 3 words or > 15% → the author misread or skipped text: tell them which words, suggest a re-take. One short word missed is recognition noise — ignore. `extra` words → an ad-lib: ask whether to update the script copy (captions) to match. |
| `align.status` | `aligning` → wait and call again; `failed` → timings are an even spread by syllables (fine for a rough cut, weak for word-accurate captions) | |
| `overflow` | seconds the take runs past the scene end | > 0 → re-time (below) |
| `wpm` | reading pace of the take | scenes of one video should sit within ~±15% of each other; an outlier sounds rushed/sleepy — mention it |
| `active` | on the timeline now | `use_voice_take {takeId}` switches takes |

Other tools: `process_voice_take {takeId, options}` (re-process from raw), `use_voice_take {sceneId, file}` (attach a narration file the user brought into media/ as that scene's take — it is processed, aligned and placed the same way), `voice_report` (pace per scene; `source` tells mic from tts).

## Re-timing to the take

A human does not read to a stopwatch. When `overflow > 0` (or the take is much shorter than the scene):

1. New scene duration = take duration + 0.3–0.5 s of air (`update_scene {duration}`).
2. Shift every later scene by the difference (`update_scene {start}`), in order, and move their timeline items by the same amount (`timeline_update`) — voice items included: a take sits at its scene's start.
3. Stretch or re-cut the scene's clip to the new duration (clips are functions of time: change the item duration / the clip's timing, don't speed the voice).
4. Music: if it was cut to the old timing, re-render or move section changes to the new scene boundaries.
5. Never time-stretch, speed up or cut words out of the recording to make it fit. If the take is far too long, propose shorter copy and a re-take.

Scenes that are approved or locked: ask before moving them.

## Captions and sync

- `get_timing` → `words` carry the take's timings with the script's display text. Build captions and word-synced motion from them, exactly as with a synthetic voice.
- Until alignment finishes (`align.status: 'aligning'`) the timings are estimates: don't build word-accurate animation on them yet.
- If the user edits the copy after recording, the take no longer matches: tell them, don't silently keep stale captions.

## Mixing

- Voice target −16 LUFS under music (the chain's default), −14 for voice-only.
- Music under a human voice: `duck {music, voice, voiceStart}` per studio-media-toolkit, then `music_report {vo:true}` — the 1–4 kHz band of the music must stay below the voice.
- Mixed videos (some scenes mic, some synthetic) sound patchy. If only a few scenes are recorded, say so and offer: record the rest, or keep synthetic for all.

## Telling the user

Short and concrete: which scenes are recorded, the numbers (`−29.8 → −16.0 LUFS, noise −49 → −46 dB at +14 dB gain`), what was not heard, what you re-timed. No "sounds great" — you did not hear it.
