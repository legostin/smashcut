# Inspiration mini-scenes

Every entry of `gallery/inspiration.json` has a folder here with **our own mini-scene**: a tiny clip that re-creates
the ONE technique we borrow from the piece (`take`), in a neutral look — never the piece itself, its brand, copy or footage.
An entry without a folder here is not listed: the preview is the point of the gallery.

## Add an example

1. Pick a piece that is the best-known example of one concrete technique. Verify the link.
2. Write the entry in `gallery/inspiration.json`:
   - `take` — one line (≤ 90 characters, English), phrased as something you can do. Add its translation to `web/src/locales/ru.json`.
   - `demo` — `{ "loop": 4, "poster": 1.5 }`: seconds of the seamless loop (omit `loop` when what we take is static:
     layout, palette, type) and the time of the frame that shows the technique best.
   - `breakdown` — what the whole piece does and why it works, then how to rebuild the technique.
3. Make the mini-scene: copy `_index.html` to `<id>/index.html`, add `<id>/params.json` with `{ "schema": {} }`
   (a mini-scene has no parameters, but the clip runtime asks for the file), write `<id>/clip.js` and `style.css`.
   It is a normal clip (`studio.clip({ duration, setup, render })`, 1920×1080 stage) with `kit` helpers and the
   shared palette from `_kit.css`.

## Rules for a mini-scene

- **One technique.** If the `take` line does not describe what is on screen, the scene is wrong.
- **It loops.** The last frame flows into the first (`duration` = `demo.loop`).
- **It reads small.** Tiles are ~5× smaller than the stage: few big elements, nothing thinner than 6 px, text ≥ 110 px.
- **Neutral.** Shared palette, no logos, product names, real people or copy from the piece. Words on screen are generic.
- **Deterministic.** Drive everything from `render(t)` or the GSAP timeline `tl` — no timers, no `Math.random()` outside setup.

`npm test` renders every mini-scene and fails if one throws or an entry has none.
