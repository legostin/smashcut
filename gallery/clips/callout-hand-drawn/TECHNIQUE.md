# Hand-Drawn Annotations

Wobbly marker circles, underlines, boxes, strikes, brackets, highlighter swipes and scribbled arrows that draw on in sequence over footage — the Vox / explainer "someone is marking up the screen" look.

## Use it for
- Explainers that point at words in a screenshot, a region of a map, a number in a chart, a detail in a photo.
- Tutorials and commentary where a human, informal tone is wanted (vs the clean UI look of a spotlight).
- Emphasising 1–4 things in a fixed frame, one after another, synced to the voice-over.

## Avoid when
- The footage under it moves (camera pan, scrolling): the marks are fixed in frame %, they will drift off their target. Track it with `item.transform` keyframes or use a still.
- The brand is strict/corporate and wants geometric precision — use callout-arrow or callout-spotlight-zoom.
- You need more than ~6 marks at once: the frame turns into scribble.

## Anatomy
- One full-frame `<svg viewBox="0 0 W H">` with three layers: `<defs>` (clip paths), a highlighter `<g>` **below** a marks `<g>` (so marker strokes sit on top of the highlighter, like real ink).
- Annotations come from a textarea DSL, one per line: `type: x, y, w, h` in % of frame, optional `#colour` and `@delay`. Types: circle, underline, box, strike, bracket, highlight, arrow (for arrow, `x,y` = tail and `w,h` = vector to the tip). Max 24.
- Stroke width scales with resolution: `strokeWidth * min(W,H) / 1080`.
- Rough geometry is generated with a seeded RNG per mark (`studio.random(seed*1009 + i*97 + v*7919)`), roughjs-style:
  - `roughLine` — a cubic Bézier with jittered, overshooting endpoints (lines extend past the corner like a real marker) and a slight bow.
  - circle — 56 points on an ellipse with a random tilt, low-frequency harmonics (2, 3, 5) for wobble, sweep of ~1.12–1.2 turns and a radius that spirals in, so the overshoot rides **inside** the start like a quick hand loop. Points are smoothed with a Catmull-Rom → Bézier helper.
  - box/underline/strike/bracket — built from `roughLine`s; `passes: 2` adds a second, offset, rougher pass (the "went over it twice" look).
  - arrow — a bent, jittered 15-point shaft plus two short rough wing strokes for the head.
  - highlight — a filled polygon with wobbly top/bottom edges, revealed by a tilted clip polygon moving left → right.
- Paths: `fill:none; stroke-linecap: round; stroke-linejoin: round`; optional `drop-shadow(0 2px 5px rgba(0,0,0,.28))` for legibility.

## Motion
- Everything is computed in `render(t)` (no GSAP tweens): each mark has `start` and draw duration `dd`; progress = `power2.inOut(studio.progress(t, start, dd))`.
- Strokes draw with `stroke-dasharray = len` / `stroke-dashoffset`, and multi-stroke marks distribute progress across segments **in order** (box sides one after another, arrow shaft then wings), so it reads as one continuous hand movement. Segments with no length yet are `visibility:hidden` (hides the round cap dot).
- Default schedule: start at `startDelay` 0.15 s, each mark 0.7 s (highlight ×0.8, arrow ×0.85), 0.3 s gap. If the natural schedule is longer than ~62 % of the clip, timings are compressed (`k`), but draw time never drops under 55 %.
- `@delay` on a line pins that mark to an absolute clip time (use it to sync with a spoken word: take `studio.words` times).
- Exit (`erase`): from `duration - 0.4 - 0.12 - (n-1)*0.06`, marks un-draw in **reverse order** (last drawn leaves first, 0.06 s apart, `power2.in`, 0.4 s). `fade` fades instead; `none` holds to the cut.
- `boil`: 3 seeded variants of every mark, switched every 1/8 s (`Math.floor(t*8) % 3`) — the hand-animated "line boil" that keeps a hold alive.

## Adapt to the design system
- `color` → `accent` token; `highlightColor` → keep a translucent warm colour (or `accent-2`) at 0.5–0.7 opacity. On dark footage, a light marker (white/yellow) reads better than red.
- Stroke weight is the "type weight" of this technique: 6–10 px at 1080p for bold brands, 4–5 px for refined ones. `roughness` 0.4–0.7 = confident hand, 1.5+ = messy kid's marker.
- 9:16: coordinates are % of frame, so re-author them for the vertical layout; keep marks out of the bottom 18 % and right 12 % (platform UI). Stroke width already scales by the short side.
- Short clips (≤3 s): one or two marks, `drawDuration` 0.4–0.5. Long clips: space marks with `@delay` on the VO words rather than stretching draw time over 1 s (slow drawing looks laboured).

## Variations
- **VO-synced**: generate the annotation lines from `studio.words` — find the word, set `@delay` to its `start - 0.1`.
- **Single circle punch**: one circle with `passes` irrelevant, `roughness` 1.3, `boil` on, no exit — a permanent emphasis mark.
- **Strike & replace**: `strike` on the old value, then an `arrow` to the new value with a highlight behind it.
- **Chalkboard**: white strokes, no shadow, roughness 1.5, boil on, over a dark slide.
- **Editorial ink**: thin 3–4 px strokes, `passes: 1`, roughness 0.4, colour = text token.

## Pitfalls
- Coordinates are % of the full frame, not of the footage inside it — if the video is letterboxed or transformed, recompute.
- Marks hug their box with padding (`sw * 0.9`, circle `×1.4`): a circle around text near the frame edge can exit the title-safe area.
- Don't use `Math.random()` for the jitter (even though the runtime seeds it): use `studio.random(seed + index)` so changing one mark doesn't reshuffle all the others.
- Measure `getTotalLength()` once in setup, not per frame (expensive with many paths).
- Red marker on red/orange footage disappears — keep the shadow on or switch colour.
- Too many marks drawing at once looks frantic; keep the gap ≥0.2 s.

## Reference
Reference implementation: gallery/clips/callout-hand-drawn/ (clip.js, style.css). Key snippet:

```js
    const roughLine = (R, x1, y1, x2, y2, k = 1) => {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux;
      const j = (a) => (R() - 0.5) * 2 * a * rough * k;
      const ext1 = j(sw * 0.9) - sw * 0.4 * rough, ext2 = j(sw * 0.9) + sw * 0.6 * rough;
      const a = { x: x1 - ux * ext1 + nx * j(sw * 0.5), y: y1 - uy * ext1 + ny * j(sw * 0.5) };
      const b = { x: x2 + ux * ext2 + nx * j(sw * 0.5), y: y2 + uy * ext2 + ny * j(sw * 0.5) };
      const bow = Math.min(len * 0.018, sw * 2.2);
      const f1 = 0.25 + R() * 0.15, f2 = 0.6 + R() * 0.15;
      const c1 = { x: x1 + (x2 - x1) * f1 + nx * j(bow), y: y1 + (y2 - y1) * f1 + ny * j(bow) };
      const c2 = { x: x1 + (x2 - x1) * f2 + nx * j(bow), y: y1 + (y2 - y1) * f2 + ny * j(bow) };
      return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    };
```

```js
            let rem = prog * v.total;
            v.segs.forEach((s) => {
              const l = Math.max(0, Math.min(s.len, rem));
              rem -= s.len;
              s.path.style.strokeDashoffset = s.len - l;
              s.path.style.visibility = l > 0.5 ? 'visible' : 'hidden';
            });
```
