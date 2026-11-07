---
name: studio-clip-authoring
description: How to write a motion-graphics clip for Agent Video Studio (HTML/CSS/JS + GSAP, pure function of time, params schema, render-and-look loop). Read before creating or editing anything in clips/.
---

# Authoring a clip

A clip is a folder `clips/<id>/` that renders **one moment of time per call**. The editor's player and the
exporter (headless Chromium, frame by frame) both seek it to arbitrary times, forwards and backwards.
If a frame depends on anything except `t`, the export will not match the preview.

## Files
```
clips/<id>/
  manifest.json   {"id","kind":"clip","name","description","category","tags":[],"duration":5}
  params.json     {"schema": { "<key>": {"type":"text|textarea|color|number|select|boolean","label","default", "min","max","step","options"} }}
  index.html      loads /runtime/fonts.css, /runtime/base.css, style.css, /vendor/gsap.min.js, /runtime/studio.js, then clip.js
  style.css
  clip.js
  assets/         images / svg / video used by the clip (local only)
```
Start from `create_clip` (MCP) or copy the skeleton. Keep `index.html` as generated unless you need a GSAP plugin
(`<script src="/vendor/gsap/SplitText.min.js">`, DrawSVGPlugin, MorphSVGPlugin, CustomEase… all free; call `gsap.registerPlugin(...)`).

## The contract
```js
studio.clip({
  duration: 5,                       // default length; the timeline item may override → ctx.duration
  setup(root, p, ctx) {              // build DOM once; p = params (defaults merged with timeline overrides)
    root.innerHTML = `<div class="title"></div>`;
    root.querySelector('.title').textContent = p.title;   // textContent for user text (no HTML injection)
    const { tl, duration } = ctx;    // tl = paused GSAP timeline, the runtime seeks it to t
    tl.from('.title', { yPercent: 110, duration: 0.7, ease: 'expo.out' }, 0.2)
      .to('.title', { opacity: 0, duration: 0.4 }, duration - 0.5);   // exit relative to the real duration
  },
  // optional — for canvas / math-driven work, called on every seek after GSAP & CSS are applied:
  render(t, { params, studio }) {}
});
```
Rules (the linter `lint_clip` checks these):
- Put **every** tween on `ctx.tl` (or `studio.track(myTimeline)`). Free-standing `gsap.to()` will not seek.
- No `Date.now()`, `new Date()`, `requestAnimationFrame` loops, `setTimeout/setInterval`, `fetch`, remote URLs.
- Randomness: `const r = studio.random(42); r()` — seeded, so every render is identical.
- CSS `@keyframes` / WAAPI animations are allowed: the runtime pauses them and sets `currentTime = t`. Use `animation-delay` for timing.
- `<video>` inside a clip: give it `data-start` (clip seconds) and it will be seeked frame-accurately.
- Canvas: draw the whole frame from `t` inside `render(t)` (clear first). Particle systems = deterministic functions of `t` and index.

## Space, layering, transparency
- Design space = project resolution (`studio.width × studio.height`, usually 1920×1080; check `get_project` — vertical 1080×1920 is common). Use px against that space; CSS vars `--w`/`--h` exist.
- Background is **transparent** by default — overlays (lower thirds, captions, callouts, logos) must stay transparent so footage shows through. Full-frame scenes paint their own background.
- Keep important content inside title-safe: 5% margin horizontally, 7% vertically (more for vertical social: avoid bottom 18% and right 12% where platform UI sits).

## Params
Expose every user-facing string, colour and key number in `params.json` so humans can tweak without you.
`type: textarea` for multi-line data (e.g. chart rows `Label: 42`). Use readable labels. Defaults must look great.

## Timing context
- `ctx.duration` / `studio.duration` — actual item length: entrances near 0, exits ending ≤ duration, holds stretch.
- `studio.beats`, `studio.bars`, `studio.sections`, `studio.markers` — project music timing **in clip-local seconds** (negative = before the clip). `studio.beat(n)` = n-th beat at/after clip start. Falls back to a 120 bpm grid.
- `studio.words` — transcript words `[{text,start,end}]` in clip-local seconds (captions, kinetic type).
- Sync hits to beats: `tl.from(el, {...}, studio.beat(4))`.

## Fonts (bundled, offline)
All bundled faces are loaded before `setup()` runs, so measuring text (`getBoundingClientRect`, auto-fit) in setup is safe.
Inter, Manrope, Space Grotesk, JetBrains Mono, Playfair Display, Bebas Neue, Unbounded. Cyrillic: Inter, Manrope, JetBrains Mono, Playfair Display, Unbounded (+ check fonts.css). Bebas Neue / Space Grotesk are Latin-only — don't use them for Russian text.

## The loop (mandatory)
1. Write/edit files.
2. `render_clip {clipId}` → look at the contact sheet. Check: entrance, hold, exit; text not clipped; contrast on likely backgrounds; nothing static that should move; nothing jittering.
3. `render_frame {times:[...]}` for the composite over footage/other layers when the clip is on the timeline.
4. `lint_clip` before finishing.
5. Place/adjust with `timeline_add` / `timeline_update` if asked.

Study the built-in gallery for patterns: `list_templates`, then Read their `clip.js`.
