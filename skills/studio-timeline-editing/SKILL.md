---
name: studio-timeline-editing
description: Editing the timeline of an Smashcut project (project.json model, tracks/items/params, MCP timeline tools, syncing to beats/transcripts, captions, export). Use for any task that places, times or arranges things.
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

## Transitions, effects, masks (item.fx)
`list_fx` gives the catalog. Set `fx` on any visual item via `timeline_update {id, patch:{fx:{...}}}` (whole object):
```json
{ "in":  { "type": "dip-white", "duration": 0.4 },
  "out": { "type": "whip-left", "duration": 0.35 },
  "effects": [ { "type": "look", "params": { "preset": "teal-orange", "amount": 0.8 } },
               { "type": "vignette", "params": { "amount": 0.5, "size": 0.6 } },
               { "type": "ken-burns", "params": { "from": 1, "to": 1.12, "x": -3, "y": -2 } } ],
  "mask": { "shape": "rounded", "x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8, "radius": 0.05, "feather": 0 },
  "blend": "screen" }
```
- Cut between two shots: `out` on A + `in` on B with the same type/duration; for a dissolve make B start `duration` seconds before A ends (overlap on another track or the same track).
- Fades/dips also fade the item's audio. Ken Burns brings stills to life; `look` presets: teal-orange, film, noir, warm, cool, vivid, fade, cyber.
- Rhythm: transitions 0.25–0.6 s; land them on beats (`get_timing`). Don't stack many different transition types in one video — pick 1–2 that fit the style.
- Verify with `render_frame` mid-transition (it uses the same renderer as export).

## Placement & rhythm of clips
- Move/scale/rotate any visual item: `timeline_update {id, patch:{transform:{x, y, scale, rotate, ox, oy}}}` (x/y in project px, ox/oy pivot in % of the frame — use the content centre).
- Faster or calmer animation without touching code: `patch:{params:{__energy: 1.6}}` (1 = as authored).
- `params.__style: "own"` stops a clip following the design system; omit it to follow tokens.

## Recording footage (web pages, apps)
- `record_web {url, actions?, seconds?, fps?, autoZoom?, device?, zoom?, dark?, session?, place?}` — product/website demos, rendered frame by frame (perfectly smooth, page animations/videos at true speed, crisp native-resolution text). Write actions like a director: wait → click the thing you'll talk about → `wait {text:"…"}` for the result (not a guessed `ms`) → `scroll {screens:1}` → `highlight` the key element. Prefer `text` targets (visible labels; for `type` use `target` = the field's label/placeholder) over brittle selectors; off-screen targets are scrolled to smoothly. For promo footage: `fps:60`, `autoZoom:true` (camera eases into clicks/typing and back out — then skip separate zoom callouts) or explicit `{type:"zoom", text, level:2}` … `{type:"zoom", level:1}`. Navigations are crossfaded; a long wait can be cut with `wait {text, cut:true}`. `zoom` 1.5 (default) = readable UI at 1080p; `device:"mobile"` for 9:16 (touch dots, flick scrolls, `swipe`). Cookie banners/chat widgets are hidden by default.
- Logged-in pages: call `web_login {url}` — a visible window opens for the USER to log in (never type passwords yourself); ask them to close it when done, then `record_web {…, session:"<name>"}`. `web_login {}` lists saved sessions.
- `record_app {app, seconds, script?, padding?}` (macOS) — records an app's window; AppleScript `script` can drive simple interactions. Needs the Screen Recording permission.
- Then cut it: place with `place:{start}` or `timeline_add`, trim with `in`/`duration`, frame it with `transform` + mask "rounded" + shadow effect for a polished "device card" look, and add callouts (callout-spotlight-zoom, callout-hand-drawn) over the key moments.
