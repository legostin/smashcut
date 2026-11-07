# Year-in-Review Bento

A Spotify-Wrapped-style recap: a CSS-grid bento of saturated tiles flips in one by one with ultra-heavy counting numbers, decorative stars and rotating stickers — or, in `sequence` mode, one full-frame stat per step with hard colour-block wipes.

## Use it for
- Year-in-review, personal or channel stats, milestone recaps, "by the numbers" segments.
- 3–5 headline stats that should feel celebratory and shareable.
- Bento mode for an overview frame (thumbnail-worthy); sequence mode for fast-cut Shorts/Reels.

## Avoid when
- The data needs comparison or trends (use a chart technique) — tiles show independent facts.
- The brand is sober/corporate: saturated blocks, stickers and Unbounded 900 are loud by design (tone it down per the variations).
- More than 5 stats — the code caps at 5; a longer list belongs in sequence mode across several clips.

## Anatomy
- `.wb` full frame with `background`; on top a **seeded grain** layer: a 192×192 noise canvas from `studio.random(5)` → data URL, `mix-blend-mode: overlay` at 8 % opacity, its `background-position` jumped to a seeded offset 12×/s.
- **Bento grid**: `display:grid` with `grid-template-areas` chosen from layout templates per stat count (`TPL_H` for 16:9, `TPL_V` for 9:16), e.g. 5 stats: `'t t b c' / 't t d c' / 'e f f f'`. Tile `t` = title tile (2×2 or larger).
- **Title tile**: eyebrow pill (inverted colours), multi-line title (Unbounded 900, 0.9 line-height, −0.055em tracking, each line in an `overflow:hidden` mask), avatar circle (image or initial) + handle.
- **Stat tiles**: index `01` (JetBrains Mono, 55 %), a faint 8-point star `.deco` (13 % opacity) peeking from the top-right corner, the number (Unbounded 900, up to 150 px) and label (Manrope 600). Text-only values (e.g. "Indie pop") in wide tiles get a fake equaliser of 7 bars.
- Colours: palette list (first = title tile); text colour per tile chosen automatically by relative luminance (`ink(bg)`: dark ink above 0.35, else white).
- Font sizes are fitted to each tile's measured rect (grid laid out first, then `getBoundingClientRect`).
- **Stickers**: a 12-point star burst with text, placed overlapping the title tile's top-right corner, plus a rotated pill near the last tile (only with >3 tiles).
- Number parsing keeps prefix/suffix, thousands separator (`,` or space) and decimal comma, so "1,248 h" counts as 1,248 with the " h" suffix.

## Motion
- Bento: tiles enter at `0.08 + i * per` (`per` 0.06–0.13 s): from `scale 0.55, rotation ±7°, rotateX 55°` (perspective 1600) to rest, 0.62 s `back.out(1.35)` — a flip-and-land with a little overshoot, alternating tilt direction.
- Per stat tile: number counts with `expo.out` over 1.2 s from tile start + 0.15 s (in `render`); label rises at +0.25 s; index fades to 0.55 at +0.3 s; text values rise from `yPercent 60`.
- Title lines rise through masks at 0.25 s (0.8 s, 0.07 s stagger); eyebrow and handle at 0.35 s.
- After the last tile: sticker spins in (`scale 0 → 1, rotation −40 → −10`, `back.out(2.6)`), pill 0.15 s later. During the hold the stars rotate continuously (18–22°/s, decos ±9°/s) and the equaliser bars bob from sines — constant secondary motion keeps the static grid alive.
- Exit at `duration - 0.6`: stickers `back.in(2)` out, tiles collapse in reverse order (`scale 0.8`, ±4°, 0.035 s stagger, `power3.in`).
- Sequence mode: `per = (duration - 0.25) / (stats + 1)`; each panel wipes up over the previous one with `clipPath inset(100% 0 0 0) → inset(0)` (0.38 s `power4.inOut`, starting 0.2 s before its slot); number pops `back.out(1.6)`, label rises, sticker pops; a final wipe to the background colour ends the clip. Slots are even divisions of the duration — not `studio.beats`; for real beat sync compute `ts` from `studio.beat(n)`.

## Adapt to the design system
- `background` → `bg`. The palette string is not token-bound: in an original clip build it from `accent`, `accent-2`, `surface`, `text` and one or two brand tints; keep the luminance-based ink so text always contrasts.
- Fonts: Unbounded 900 → `var(--font-display)` at its heaviest weight; Manrope → body; JetBrains Mono index → caption/mono role.
- Radius: tiles 38 px, pills 23/32 px → radius token (a sharp system wants 0–8 px and no stickers).
- 9:16 uses `TPL_V` (two columns, title on top) and reserves the bottom 8 % of the grid height; sequence mode moves the sticker up to 20 % from the bottom.
- Short clips (≤5 s): sequence mode gets ~0.8 s per stat — too fast; use bento or fewer stats. Long (10 s+): bento hold is fine thanks to spinning stickers; sequence mode reads best at 1.2–2 s per stat.

## Variations
- **Calm bento**: muted surfaces, one accent tile, no stickers/rotation, `power3.out` instead of `back.out` — a premium "by the numbers" page.
- **Beat sequence**: wipes on `studio.beat(i * 2)`; number pop on the beat, label on the off-beat.
- **Photo tile**: put the avatar/cover image as a full tile background with a gradient for text.
- **Reveal the top stat**: build the grid, then zoom the camera into one tile (scale the grid around that tile's centre) for the finale.
- **Wipe direction per panel**: alternate `inset` sides (top, left, bottom) in sequence mode for a more graphic rhythm.

## Pitfalls
- Measure tile rects after the grid is in the DOM and **before** entrance tweens scale them (the code snapshots `rects` for sticker placement).
- Counting numbers change width: `white-space: nowrap`, tabular-nums and fit to the final formatted value, not the starting one.
- Light tiles (cream `#F4F1EA`, lime) need dark ink; never hard-code white text across a palette.
- Grain must be seeded (`studio.random`) — `Math.random` noise per frame would differ between preview and export (the runtime seeds it, but be explicit).
- Too many concurrent rotations (stars + decos + stickers) become noise; keep speeds slow and opacities low.

## Reference
Reference implementation: gallery/clips/infographic-wrapped-bento/ (clip.js, style.css). Key snippet:

```js
      const per = Math.min(0.13, Math.max(0.06, (duration * 0.25) / tiles.length));
      tiles.forEach((d, i) => {
        const t0 = 0.08 + i * per;
        tl.fromTo(d, { scale: 0.55, rotation: i % 2 ? 7 : -7, rotateX: 55, opacity: 0, transformPerspective: 1600 }, { scale: 1, rotation: 0, rotateX: 0, opacity: 1, duration: 0.62, ease: 'back.out(1.35)' }, t0);
        const s = stats[i - 1];
        if (s) {
          const c = counters.find((x) => x.stat === s);
          if (c) c.t0 = t0 + 0.15;
          tl.fromTo(d.querySelector('.lab'), { y: 20 * S, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, t0 + 0.25)
            .fromTo(d.querySelector('.idx'), { opacity: 0 }, { opacity: 0.55, duration: 0.4 }, t0 + 0.3);
          if (s.text != null) tl.fromTo(d.querySelector('.num'), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }, t0 + 0.15);
          spinners.push({ el: d.querySelector('.deco'), speed: i % 2 ? -9 : 9, t0: 0 });
        }
      });
```

```js
      render(t) {
        counters.forEach((c) => { c.el.textContent = fmt(c.stat, eExpo(studio.progress(t, c.t0, 1.2))); });
        spinners.forEach((s) => { s.el.style.transform = `rotate(${((t - s.t0) * s.speed).toFixed(2)}deg)`; });
        eqs.forEach((e) => e.bars.forEach((b, k) => {
          const h = 0.25 + 0.75 * Math.abs(Math.sin(t * (2.1 + k * 0.37) + k * 1.7)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.9 + k)));
          b.style.transform = `scaleY(${h.toFixed(3)})`;
        }));
        const f = Math.floor(t * 12), r = studio.random(f + 9);
        grain.style.backgroundPosition = `${Math.floor(r() * 192)}px ${Math.floor(r() * 192)}px`;
      },
```
