# Gradient Shine Headline

A keynote/SaaS-style hero headline whose words blur-rise in, filled with one continuous multi-stop gradient that slowly sweeps across all words and lines (or a solid fill with a light shine band passing over), with a gradient-bordered badge above and a subline below.

## Use it for
- Product launches, feature intros, "Introducing X" moments, modern tech titles.
- Hero statements on dark backgrounds where colour itself is the brand.
- Openers that need to feel polished and calm rather than punchy.

## Avoid when
- Over bright or busy footage: gradient text has no outline and loses contrast quickly.
- The brand has a single flat colour and no gradient language — use a solid-fill title with a mask reveal.
- Very short clips (< 2 s): the sweep is too slow to be noticed and the shine may never fire.

## Anatomy
- `.gs` centred block between `left/right: 140px` → optional `.badge` → `.hwrap` (push target) → `.head` → one `.row` per line → each word a `.w` span.
- **Continuous gradient across words**: every word is its own `background-clip: text` span (`color: transparent`), but its `background-position` is offset by the word's own `offsetLeft/offsetTop` inside the headline, and `background-size` is the headline's size (or a tile ≥ 600 px). So the gradient is laid out in headline space and reads as one fill — while each word can still animate independently.
- **Seamless sweep**: the tile gradient repeats the first stop at the end (`[...stops, stops[0]]`), and the shift is wrapped with a positive modulo, so the loop has no seam.
- **Shine mode**: a `p.angle`° gradient `base 38% → white 48–52% → base 62%`, background 3× headline width, no-repeat; the band is parked off to the right and runs across during a pass.
- **Glow** (sweep mode): a clone of the headline inserted behind it, `filter: blur(38px); opacity: .5` — the gradient glows its own colours.
- **Badge**: pill with a translucent dark fill and a 1.5 px gradient border made with the mask-composite trick (`::before` with `padding`, `mask: content-box, border-box; mask-composite: exclude`), plus a gradient dot.
- Masks: each word has `padding/negative margin` (0.04em / 0.12em) so the clip-text doesn't cut descenders. Fit shrinks the headline to `studio.width - 280`.

## Motion
- Timing scale `k = min(1, D/4)`; word stagger `st = min(0.06, 0.6/words) * max(0.6, k)`.
- 0.05 s: badge fades/rises `y 16 → 0`, `scale 0.94 → 1`, ~0.7 s `expo.out`.
- Words from `tWords` (badge ? +0.12k): `opacity 0, y 30, blur(8px) → sharp`, 0.95 s `expo.out` — blur-rise is the signature "keynote" entrance. The glow clone follows 0.1 s later over 1.4 s (light arrives after the type).
- Subline after the last word +0.15k: same blur-rise, 0.8 s.
- Whole duration: `.hwrap` scales 1 → 1.025 linearly (slow push).
- Sweep: shift `= (t < 1 ? 0.5t² : t - 0.5) * speed * tile` — eased start, then constant drift (`speed` in tile cycles per second, default 0.16).
- Shine: first pass right after the words land, then every 3.5 s while there's time; each pass is 1.1 s `inOutQuad`.
- Exit: `exitDur = min(0.45, D*0.12)` ending 0.12 s before the end; words blur-rise out `y -18` (`power2.in`, tiny stagger), subline and badge follow.

## Adapt to the design system
- `gradientStops` ← `accent, accent-2` (+ a third tone); keep at least one light stop for contrast on dark. Shine mode `baseColor` ← muted/text.
- `sublineColor` ← muted. Font ← display role (800 weight; Playfair 700); tracking from the design (`-0.045em` Inter, `-0.035em` Unbounded here).
- Badge radius is a pill; use the design radius for squarer systems.
- 9:16: replace the hard 140 px side margins with `studio.width * 0.08`; 2–3 words per row, size ~110–130 px at 1080 wide; the subline at 34–40 px.
- Short clips: sweep only (shines may not fit); long clips (8 s+): shines repeat every 3.5 s — consider spacing them to `studio.bars` instead.

## Variations
- **Beat shines**: schedule shine passes on `studio.bars` (downbeats) instead of every 3.5 s.
- **Single word gradient**: only the key word gets the gradient, the rest solid text colour.
- **Vertical sweep**: rotate the gradient to 180deg and offset `background-position-y` for a top-to-bottom flow.
- **Glass badge + CTA**: add a second pill below the subline ("Available today") with the same border trick.
- **Mask reveal entrance**: swap the blur-rise for a line mask (`yPercent 105`) for a sharper, editorial feel.

## Pitfalls
- Each word's background must be offset by its own position; otherwise every word restarts the gradient and the fill looks patchy.
- Measure positions after font load and after the fit (the clip does both) — a later font-size change invalidates `pos`.
- Animating `filter: blur` on many words is costly; keep it to the entrance/exit.
- Tile < headline width shows repetition; the code uses `max(HW, 600)`.
- Low-contrast stops (two mid-tone colours) look muddy at small sizes; check frame stills, not just the motion.

## Reference
Reference implementation: gallery/clips/text-gradient-shine/ (clip.js, style.css). Key snippet:

```js
render(t) {
  if (p.mode === 'shine') {
    // band centre = bx + 1.5·HW: parked off the right edge when idle (bx 0), a pass runs bx −2·HW → 0
    let u = 0;
    for (const s of shines) if (t >= s) u = Math.min(1, (t - s) / shineLen);
    const active = shines.some((s) => t >= s && t < s + shineLen);
    const bx = active ? -(1 - inOut(u)) * 2 * HW : 0; // band travels left → right
    words.forEach((w, i) => { w.style.backgroundPosition = `${bx - pos[i].x}px ${-pos[i].y}px`; });
  } else {
    // eased start, then constant drift
    const shift = (t < 1 ? 0.5 * t * t : t - 0.5) * p.speed * tile;
    const px = (x) => ((((shift - x) % tile) + tile) % tile);
    words.forEach((w, i) => { w.style.backgroundPosition = `${px(pos[i].x)}px ${-pos[i].y}px`; });
    gWords.forEach((w, i) => { w.style.backgroundPosition = `${px(pos[i].x)}px ${-pos[i].y}px`; });
  }
},
```

```css
.gs .badge::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; background: var(--grad); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
```

```css
.gs .w { display: inline-block; color: transparent; -webkit-background-clip: text; background-clip: text; background-repeat: repeat; padding: 0.04em 0.02em 0.12em; margin: -0.04em -0.02em -0.12em; will-change: transform, filter; }
```
