---
name: studio-media-toolkit
description: Programmatic media operations on photos, footage and audio (list_media_tools / run_media_tool) — cut out backgrounds, stickers, palettes, image resize/adjust/convert, green-screen keying, ML background removal for video, trim/speed/reverse/reframe/slow-mo/loop/GIF, frame extraction, image & clip morphs, audio extract/normalize/denoise/silence removal/ducking. Use when footage or images need processing before they go on the timeline.
---

# Media toolkit

`list_media_tools` (compact catalog; `{op}` for one full spec) and `run_media_tool {op, params}` (waits, returns outputs).

- **File params are project paths** — `media/photo.png` (a bare `photo.png` means `media/photo.png`). Import the user's files into media/ first (they upload them in the editor).
- **Results are new files in `media/`**, named after the input (`photo.png` → `media/photo.nobg.png`, then `photo.nobg.sticker.png`…). Originals are never modified. Outputs show up in the media library and image results in your feed; **Read image outputs to look at them** (paths are relative to the project folder = your cwd).
- Place results with `timeline_add {kind:'media', ref:'photo.nobg.png', start, duration?, track?}` — `ref` is the file name without `media/`. Transparent results (PNG, WebM alpha) go on a track **above** the footage (the graphics tracks or a second video track); position/scale them with `timeline_update {id, patch:{transform:{x,y,scale}}}`.
- Identical re-runs (same op, params and unchanged input files) return the cached result instantly — don't be afraid to call again.
- json outputs (palette colours, kept segments, loudness) come back inline.
- Every output carries provenance (`.studio/media/<file>.source.json`: op, params, inputs) — you can always tell how a file was made.

## Which op?
| Need | Op | Notes |
|---|---|---|
| Cut a subject out of a photo | `remove_background` | isnet (default, any object) / modnet (people, fast). `trim:true` crops to the subject. First run downloads the model (176 MB / 25 MB). |
| Die-cut sticker look | `sticker` | outline + drop shadow; opaque input is cut out automatically (`autoCut`). |
| Brand colours from an image | `palette` | → `{colors:[{hex,share}]}` + swatch; feed into `set_design`. |
| Resize / crop / rotate / flip a still | `transform` | crop px rect → rotate → flip → resize (fit inside/cover/contain/fill). |
| Colour / blur / sharpen a still | `adjust` | brightness/contrast/saturation −1…1, hue °, blur σ px, sharpen. |
| PNG ↔ JPG ↔ WebP | `convert` | jpg flattens transparency onto `background`. |
| Green/blue screen → transparent | `chroma_key` | `color:auto` samples the border; WebM VP9 alpha (editor) and/or ProRes 4444 `.mov`. Tune `similarity` (more = more keyed), `blend` (soft edge). Also keys a still → PNG. |
| Cut out a person/object from normal footage | `remove_background_video` | ML per frame, **≤ 20 s per run**, output at `fps` (default 12) as WebM alpha. Slow (isnet ≈ 1 s/frame; modnet ≈ 0.15 s/frame, people only). Prefer chroma_key when there is a screen. |
| Shorter piece of a file | `trim` | only needed to feed other ops — on the timeline use the item's `in`/`duration` instead. |
| Faster / reverse / boomerang | `speed` | factor 2 = 2× faster; reverse & boomerang ≤ 30 s. |
| Smooth slow motion | `slowmo` | motion-interpolated (minterpolate mci); ≤ 15 s source — trim first. |
| 16:9 → 9:16 / 1:1 / 4:5 | `reframe` | `crop` around `focusX/focusY` (0…1), `pad`, or `blur` (blurred fill bars). Works on images too. |
| Shots of an edit + its rhythm | `detect_shots` | cut list with timecodes, contact sheet (one numbered frame per shot), avg/median shot length, cuts per minute, pacing, dominant colour per shot, bpm and cuts on the beat. `threshold` 0.2 = sensitive, 0.4 = hard cuts only. |
| One file per shot | `split_shots` | detected cuts or your own `ranges:"0-2.4, 5.1-7"`; `only:"1,3,5-7"`; `handles` trims flash frames. Then `timeline_add` the shots you need. |
| Stills from a video | `extract_frames` | `count`, `every` s, or exact `times:"0.5,2"`; + contact sheet. |
| GIF | `to_gif` | 480 px, 12 fps, ≤ 6 s keeps it small. |
| Repeat / seamless loop | `loop` | `crossfade` > 0 makes the cycle seamless (end dissolves into start). |
| Image A becomes image B | `morph_images` | `morph` (flow/warp, best for similar layouts) or `dissolve`; `hold` before/after. |
| Hide a jump cut / flow shot A into B | `morph_video_cut` | bridge clip from A's last frame to B's first (`morph`) or a moving cross-fade (`dissolve`); `join:true` renders A+bridge+B. |
| Sound of a video as a file | `extract_audio` | wav for further processing. |
| Loudness for delivery | `normalize` | −14 LUFS (social/YouTube), −16 (podcast), −23 (broadcast); video keeps its picture. |
| Hiss / hum / room noise | `denoise` | afftdn; noise floor auto-measured from pauses; `strength` 6–20 dB natural. |
| Remove pauses (jump cuts) | `remove_silence` | audio or video; returns kept `[start,end]` segments (source seconds) for re-timing captions. |
| Music under voice-over | `duck` | sidechain compression → new music file; `voiceStart` = voice offset vs music start. |

## Recipes

**Product photo → sticker on the timeline**
1. `run_media_tool {op:'remove_background', params:{image:'media/shoe.jpg', trim:true}}` → Read `media/shoe.nobg.png`, check the edges (hair/fringe? try `threshold:0.5` or `model:'modnet'` for people).
2. `run_media_tool {op:'sticker', params:{image:'media/shoe.nobg.png', outline:18, shadow:0.4}}` → `media/shoe.nobg.sticker.png`.
3. `timeline_add {kind:'media', ref:'shoe.nobg.sticker.png', start:4, duration:3, track:'g1'}` → `timeline_update {id, patch:{transform:{scale:0.6, x:500, y:-120}, fx:{in:{type:'pop', duration:0.4}}}}` (see `list_fx`) → `render_frame` to check.

**Key a green-screen clip**
1. `chroma_key {video:'media/host.mp4'}` → Read a frame (`extract_frames {video:'media/host.key.webm', times:'1'}`) — green fringe left? raise `similarity` by 0.03; holes in the subject? lower it; hard edge? raise `blend`.
2. Put the background (footage, clip or image) on the video track, the keyed `host.key.webm` on a track above it at the same start.
3. Need it for another NLE? `format:'mov'` (ProRes 4444, large) or `'both'`.

**Morph between two shots**
- Stills: `morph_images {imageA, imageB, duration:1.5, mode:'morph'}` → a short MP4; place between the two stills (or use it alone).
- Clips: `morph_video_cut {videoA:'media/a.mp4', videoB:'media/b.mp4', duration:0.8}` → place `a.morphcut.mp4` right after A ends and start B after it (B's `start` += 0.8). For a talking-head jump cut use `morph`; for unrelated shots `dissolve` usually looks cleaner. Check with `render_frame` mid-bridge.

**Duck music under a voice-over**
1. Find the offset: voice item start − music item start on the timeline (e.g. music at 0, VO at 2.5 → `voiceStart:2.5`).
2. `duck {music:'media/bed.wav', voice:'media/vo.wav', voiceStart:2.5, amount:'medium'}` → `media/bed.ducked.wav`.
3. Swap the music item's source: `timeline_remove` the old music item and `timeline_add {kind:'media', ref:'bed.ducked.wav', start:0, track:'a1'}` (or the music track), volume ~0.8–1. For generated Tone.js music you can instead lower `volume` per section.
4. `normalize` the final voice (−14 LUFS for social) before ducking, so the ducking depth is predictable.

**Talking head clean-up**: `denoise` → `remove_silence {media, minSilence:0.5}` (use the returned segments to re-time captions) → `normalize`. Then `transcribe_media` the result for captions.

**Vertical cut from landscape footage**: `reframe {media, aspect:'9:16', mode:'crop', focusX:0.4}` (Read a frame of the result — subject in frame? adjust focusX) or `mode:'blur'` when the whole frame matters.

## Limits & gotchas
- Long or heavy ops (remove_background_video, slowmo, morph at high res) take seconds to minutes; jobs are queued (2 at a time). Prefer working on the short piece you need (`trim`).
- ML models run locally on CPU; the first call downloads the model (needs internet once), afterwards offline.
- WebM with alpha is the transparent video format for the editor; MP4 never has alpha.
- Ops that take video+audio and only change sound (normalize, denoise) keep the picture untouched (stream copy).
- Errors are explicit (wrong file kind, out-of-range values, too long) — read them and adjust params rather than retrying unchanged.

## Recipe: cut it like the reference

1. The user's reference video is in media (or a reference of kind media): `run_media_tool {op:"detect_shots", params:{video}}` → look at the sheet; read `rhythm` (avg shot, cuts per minute, cuts on beat, colours).
2. Translate it into the edit: scene/shot durations ≈ the reference's median shot (in beats of our music: `beatsPerShot`), cut on beats if the reference does, reuse its colour progression in the design system or grades.
3. To reuse the user's own footage shot by shot: `split_shots` (check with detect_shots first), then place the shots on the timeline at the planned cut points.
4. Never re-upload or re-cut someone else's video into the user's video unless the user owns it — study the rhythm, don't copy the footage.
