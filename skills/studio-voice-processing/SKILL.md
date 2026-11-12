---
name: studio-voice-processing
description: Processing of a recorded human voice (the author's teleprompter takes, interviews, voice memos, a talking head's sound) — which module fixes what, in which order, with what settings, and how to prove it by measurement — voice_polish chain, trim_silence, declick, denoise, voice_eq, compress, deess, reduce_breaths, voice_isolate, normalize. Use when a recorded voice sounds noisy, quiet, uneven, harsh, boomy or clicky, or before mixing it with music.
---

# Processing a recorded voice

You cannot hear. Work from measurements: every step below returns numbers or can be measured (`voice_polish` report, `normalize`/`compress` loudness, `watch_video` / `analyze_audio` for levels and silences). Never say "sounds cleaner" — say what changed in dB.

Synthetic voice (ElevenLabs) needs none of this: it is already clean and levelled. This skill is for sound that came through a microphone.

## Start here: `voice_polish`

`run_media_tool {op:'voice_polish', params:{media}}` — or, for a teleprompter take, `process_voice_take {takeId, options}` (always starts from the raw recording and swaps the result on the timeline).

It runs the whole chain in the right order and returns a report:

```
before / after: lufs · truePeak · lra · noiseFloor · snr · duration
trimmed {start, end} · steps[] · mode · noiseMeasured
```

Read it and decide:

| Report says | Do |
|---|---|
| `after.lufs` within ±0.5 of the target, `truePeak` ≤ −1 | Level is right. |
| `after.snr` ≥ 35 dB | Clean. Stop. |
| `after.snr` 25–35 dB | Fine under music. For voice-only video try `noise:'strong'`. |
| `after.snr` < 25 dB with `noise:'strong'` | The room is the problem: tell the user (closer to the mic, quieter room) or, with their consent, `noise:'isolate'` (cloud, paid). |
| `before.snr` ≥ 40 dB | Already clean: `noise:'light'` or `'off'` — a denoiser on a clean voice only costs detail. |
| `before.lra` ≤ 4 LU | Already even (or already compressed): `compress:'light'` or `'off'`. |
| `before.lra` ≥ 10 LU | Whispers and shouts: `compress:'strong'`. |
| `mode: 'dynamic'` | The peak ceiling could not be met with plain gain, loudnorm rode the level. Fine for a voice; if it pumps, raise `compress` one step. |
| `noiseMeasured: false` | The take had no pause ≥ 0.7 s, the noise figures are a rough estimate — do not quote them as measured. |
| `trimmed.start` > 2 s | Long lead-in was cut; if captions were timed on the raw file, they shift by `trimmed.start`. |

Targets: **−16 LUFS** for a voice that sits over music in a −14 LUFS video (default), **−14** for voice-only videos, true peak ≤ **−1.5 dBTP**.

## The order, and why

1. **Trim the edges** (`trim_silence`) — the click of the record button and the breath before the first word.
2. **High-pass 80 Hz** (`voice_eq {highpass}`) — rumble first, or it drives the compressor.
3. **Declick** (`declick`) — before anything that raises level.
4. **Noise** (`denoise`, or `voice_isolate`) — before compression: a compressor lifts whatever is quiet, noise included (measured: 3:1 compression costs ~5 dB of SNR).
5. **Breaths** (`reduce_breaths`) — optional, see below.
6. **EQ** (`voice_eq`) — tone.
7. **Compressor** (`compress`) — evenness.
8. **De-esser** (`deess`) — last of the tone tools: compression and the presence boost are what make sibilants stick out.
9. **Loudness** (`normalize`) — always the final step; nothing after it.

Running single modules by hand: keep this order, feed each result into the next, and `normalize` at the end. Don't run a module twice "for more" — change its setting.

## Modules

**`trim_silence {media, padding}`** — edges only; inner pauses stay (they are the reader's rhythm). For jump-cutting pauses out of a talking head use `remove_silence` instead — never on narration that has to match a scene's timing.

**`declick {media, strength}`** — mouth clicks, lip smacks. `normal` by default. `strong` only if clicks are still reported/heard: it starts to dull t/k/p.

**`denoise {media, strength, noiseFloor}`** — steady noise: hiss, fan, hum, room tone. It cannot remove a dog, a keyboard, traffic, reverb — that is `voice_isolate`. Stand-alone it is gentle; inside `voice_polish` the noise stage is the denoiser plus a soft expander in the pauses: `light` ≈ 8 dB, `normal` ≈ 12 dB, `strong` ≈ 20 dB (measured on a voice over room noise: SNR +10 dB at `normal`, +20 dB at `strong`). `strong` on a quiet voice can sound watery — it is for laptop mics and fans.

**`voice_isolate {media}`** — ElevenLabs Voice Isolator: voice out of a bad room, street, music. **Cloud and paid** (≈ 1000 characters of quota per minute; the audio leaves the machine). Only when the user asked or agreed, and say what it will cost first. Needs the ElevenLabs key. In the chain: `voice_polish {noise:'isolate'}`.

**`voice_eq {media, highpass, mud, presence, air}`** — dB, 0 = off, stay within ±4.
- boomy / boxy room → `mud: -3`
- dull laptop or phone mic → `presence: 3.5, air: 2`
- harsh, thin condenser → `presence: 0, air: 0`, then `deess`
- voice disappears under music → `presence: 3` (and `duck` the music) rather than more volume
- deep male voice with thump → `highpass: 100`

**`compress {media, amount, ceiling}`** — `light` 2:1 (already steady reader), `normal` 3:1 (default), `strong` 4.5:1 (ads, energetic delivery, wide LRA). Threshold follows the file's loudness. Returns loudness before/after: LRA should drop; if LRA was already < 4, skip.

**`deess {media, strength, split}`** — only the band above `split` is turned down, and only on sibilants. `normal`; `strong` risks a lisp. `split` 4500 for a low voice, 6500 for a high one.

**`reduce_breaths {media, reduction, sensitivity}`** — an expander, **not** a breath detector: it lowers everything quiet, so soft word endings can go too. Off by default. Use when the user asks or breaths are obviously loud after compression; `reduction` ≤ 12 (removed breaths sound unnatural — lowered ones don't). If words lose their tails, raise `sensitivity`.

**`normalize {media, target}`** — the last step of any hand-made chain.

## Recipes

- **Teleprompter take, decent mic** — defaults: `process_voice_take {takeId}`.
- **Laptop mic, fan in the room** — `{noise:'strong'}`; if `after.snr` is still < 25 → talk to the user about `isolate`.
- **Good studio mic, quiet room** (`before.snr` ≥ 40) — `{noise:'light', declick:true, compress:'light'}`.
- **Energetic ad read** — `{compress:'strong', target:-14}`.
- **User says "too processed / robotic"** — `{noise:'light', compress:'light', deess:false}`; offer `options:false` (raw + nothing) as the reference.
- **User says "I hear breathing"** — `{breaths:true}`; mention that endings may soften.
- **Voice over music** — polish to −16 LUFS, then `duck {music, voice}` (studio-media-toolkit), then check the mix (`music_report {vo:true}`).
- **Interview / talking-head video** — `extract_audio` → `voice_polish` → put the result under the picture (mute the clip's own sound), or `denoise` + `normalize` directly on the video when only light cleaning is needed.

## Don't

- Don't process a take twice (polish on a polished file): start again from the raw (`process_voice_take` does).
- Don't normalise before compressing, or compress after normalising.
- Don't use `remove_silence` on scene narration — it changes the timing the scene was cut to.
- Don't send audio to the cloud isolator without the user's yes.
- Don't report a result without the numbers: LUFS before → after, noise floor before → after, what was trimmed.
