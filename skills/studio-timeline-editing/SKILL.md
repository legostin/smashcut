---
name: studio-timeline-editing
description: Editing the timeline of an Agent Video Studio project (project.json model, tracks/items/params, MCP timeline tools, syncing to beats/transcripts, captions, export). Use for any task that places, times or arranges things.
---

# Timeline editing

`project.json`: `{ width, height, fps, duration, background, tracks[], items[], markers[] }`.
- `tracks[0]` is the **top** visual layer. Kinds: `graphics`, `video`, `audio`, `music`.
- item: `{ id, track, kind: clip|media|music, ref, start, duration, in, params?, opacity?, volume?, transform? }`
  - `start` project seconds, `duration` length on the timeline, `in` trim into the source (clip-local time = t − start + in).
  - clip items pass `params` overrides to the clip and get `duration + in` as `studio.duration`.
  - media `transform: {fit:'contain'|'cover', scale, x, y}`.

Prefer the MCP tools over editing project.json by hand (they validate and broadcast to the UI):
`get_project`, `timeline_add`, `timeline_update {id, patch}`, `timeline_remove`, `set_project`, `use_template {place}`.
If you do edit project.json directly, keep it valid JSON and keep ids stable.

## Recipes
- **Overlay on footage:** graphics track above the video track, transparent clip, `start` at the moment, `duration` = hold + motion.
- **On the beat:** `get_timing` → choose bar/beat times for starts; cut lengths in whole bars (`60/bpm*4*n`).
- **Captions from speech:** `transcribe_media {file}` → put a captions clip (e.g. builtin `caption-karaoke`) over the speech range; it reads `studio.words`.
- **Music bed:** create/use a score, `timeline_add {kind:'music', ref, start:0}`, set `volume` 0.3–0.6 under voice.
- **Check the cut:** `render_frame {times:[...]}` at boundaries (item starts/ends, section changes).

Export is done by the user from the UI (or POST /api/export); you can't watch video — verify with frames.
