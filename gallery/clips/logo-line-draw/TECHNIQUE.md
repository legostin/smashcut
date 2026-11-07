# Line-Draw Logo Sting

An elegant logo sting: each shape of the mark draws its outline on (DrawSVG, overlapping), the fills cross-fade in as the glowing strokes fade out, a masked shine sweeps the settled mark and the wordmark tracks in from wide letter-spacing.

## Use it for
- Calm, premium intros/outros: studios, architecture, fashion, consultancies, documentaries.
- A brand watermark moment at the end of a video (transparent background, sits over footage or a gradient).
- Any mark that reads well as outlines (monoline icons, geometric marks, letterforms).

## Avoid when
- The logo is a raster image or a complex illustration with dozens of tiny paths: drawing 40 outlines looks like noise and DrawSVG needs vector geometry.
- The brand is loud/playful — this is slow and refined; use a burst or shape-assemble technique instead.
- The sting must be under ~1.5 s; even the `sting` variant needs ~2.2 s to read.

## Anatomy
- `.ld` flex lockup centred with `translate(-50%,-50%)`; `stacked` (column) or `horizontal` (row, 56 px gap, text left-aligned).
- **SVG mark** built with `createElementNS` from `logoSvg` (full `<svg>` markup → `path, circle, rect, ellipse, polygon, polyline, line` with geometry attributes copied; or one path `d` per line; empty → built-in compass "N" mark).
- Every shape exists **three times**: in `gFill` (filled, colours cycled from `fillColors`), in `gStroke` (`fill:none`, `stroke-linecap/linejoin: round`, `drop-shadow` glow in the stroke colour), and in a `<clipPath>` used to mask the shine.
- **viewBox from geometry**: `gStroke.getBBox()` + 4 % pad, then the SVG is sized so its longest side = `markSize`. Stroke width is divided by that scale so `strokeWidth` stays in screen px for any logo.
- **Shine**: a tall rect (3× height, rotated 18°) filled with a `linearGradient` that is transparent except a narrow white band (stops 0.45/0.5/0.55, peak opacity 0.85), inside the clip-path group so it only lights the mark.
- **Wordmark**: HTML text (weight 800; 700 for Playfair, 600 for Unbounded), auto-fit to `studio.width - 300` (minus mark width in horizontal). The `.txt` column width is locked to the final measured width so the letter-spacing animation never re-centres the lockup.
- Tagline: Inter 500, 26 px, uppercase, tracking 0.42em, opacity 0.7 (stacked adds `padding-left: .42em` to optically centre tracked text).

## Motion
- Timing scale `k = min(1, D / 3.6)` (`/2.2` for `sting`) compresses everything for short clips; draw duration per path `dd = drawDuration × k` (sting caps it at 0.5 s).
- 0.05 s + i × (dd × 0.4): each outline draws `drawSVG 0% → 100%`, `power2.inOut` — 60 % overlap between paths so it reads as one gesture.
- `drawEnd − 0.15k`: fills fade in (0.4 s, `power1.inOut`, stagger 0.06k); 0.1k later the stroke group fades out (0.45 s, `power1.in`) — a cross-fade, never both at full.
- Mark scale: 0.96 → 1.02 over the drawing (`power1.inOut`), then settles back to 1 with `expo.out` when the fills land — a subtle "breath in, settle" overshoot.
- `fillAt + 0.35k`: shine sweeps left → right in 0.9 s `power2.inOut` (optional).
- `drawEnd − 0.35k`: wordmark tracks in — `letterSpacing 0.5em → 0.05em` with `marginRight -0.45em → 0` (compensates trailing tracking), opacity 0→1, 1.3 s `expo.out`. Tagline rises 10 px to opacity 0.7, 0.35k later.
- Whole clip: lockup scales 1 → 1.03 linearly (hold life).
- Exit: `exitDur = min(0.5, D×0.13)`, starts at `D − exitDur − 0.05`: wordmark fades while tracking opens to 0.18em, tagline lifts 6 px, mark fades to scale 0.92 (`power2.in`).
- No beat sync; to land it, put the fill moment (`fillAt`) on `studio.beat(n)` by solving for `t0`.

## Adapt to the design system
- `strokeColor` → `accent`; `textColor` → `text`; `fillColors` is a text list — in your own clip derive it from tokens (`text, text, accent`) or the real brand colours.
- `font` → display role; in an original clip use `var(--font-display)` and the system's tracking as the final value (tracking-in should end on the token, not on 0.05em).
- Motion: the draw ease `power2.inOut` is deliberately not the system's `enter` ease; use `studio.design.motion('enter')` for the wordmark and `motion('exit')` for the exit.
- 9:16: use `stacked`, `markSize` ~300–360, `wordSize` ≤ 90 so long wordmarks fit `studio.width − 300` (the fit already uses `studio.width`).
- Short (2–3 s): `variant: 'sting'`. Long (6 s+): the timing scale caps at k = 1, so the extra time becomes hold — fine for an end card; otherwise add a tagline or URL beat.

## Variations
- **Single continuous line**: one path, long `drawDuration` (1.5–2 s), no fill — signature/monoline look.
- **Stroke-only**: skip the fill cross-fade; keep the glowing strokes and let the shine pass over them (neon blueprint).
- **Watermark**: tiny `markSize`, horizontal layout, positioned in a corner via the item transform, long hold.
- **Reverse outro**: run the draw backwards (`drawSVG 100% → 0%`) as the exit instead of a fade.
- **Beat build**: one path per beat (`studio.beat(i)` instead of `i * gap`) for a music-led sting.

## Pitfalls
- DrawSVG needs `<script src="/vendor/gsap/DrawSVGPlugin.min.js">` in index.html and `gsap.registerPlugin(DrawSVGPlugin)`.
- `getBBox()` only works once elements are in the DOM — append before measuring.
- Strokes must be scaled into viewBox units (`strokeWidth / scale`), or a big logo gets hairlines and a small one gets blobs.
- Evenodd shapes (rings) need `fill-rule` copied to the fill and `clip-rule` on the clip-path copy, or the hole fills in.
- Tracking animations shift centred text; lock the text box width first (as here) or the lockup drifts.
- Shine on a white fill over a white background is invisible — check contrast of the fills against the real backdrop.

## Reference
Reference implementation: gallery/clips/logo-line-draw/ (clip.js, style.css). Key snippet:

```js
const sting = p.variant === 'sting';
const k = Math.min(1, D / (sting ? 2.2 : 3.6));
const dd = (sting ? Math.min(0.5, p.drawDuration) : p.drawDuration) * k;
const gap = dd * 0.4; // 60 % overlap
const t0 = 0.05;
const n = strokeEls.length;
strokeEls.forEach((s, i) => {
  tl.fromTo(s, { drawSVG: '0%' }, { drawSVG: '100%', duration: dd, ease: 'power2.inOut' }, t0 + i * gap);
});
const drawEnd = t0 + (n - 1) * gap + dd;
const fillAt = drawEnd - 0.15 * k;
tl.fromTo(fillEls, { opacity: 0 }, { opacity: 1, duration: 0.4 * Math.max(0.6, k), ease: 'power1.inOut', stagger: 0.06 * k }, fillAt)
  .to(gStroke, { opacity: 0, duration: 0.45 * Math.max(0.6, k), ease: 'power1.in' }, fillAt + 0.1 * k)
  .fromTo(svg, { scale: 0.96, transformOrigin: '50% 50%' }, { scale: 1.02, duration: drawEnd, ease: 'power1.inOut' }, 0)
  .to(svg, { scale: 1, duration: 0.7 * Math.max(0.6, k), ease: 'expo.out' }, fillAt + 0.15 * k);
if (p.shine) tl.fromTo(shine, { attr: { x: vb[0] - bw - vb[2] * 0.3 } }, { attr: { x: vb[0] + vb[2] * 1.3 }, duration: 0.9 * Math.max(0.6, k), ease: 'power2.inOut' }, fillAt + 0.35 * k);
const wAt = drawEnd - 0.35 * k;
tl.fromTo(word, { opacity: 0, letterSpacing: '0.5em', marginRight: '-0.45em' }, { opacity: 1, letterSpacing: '0.05em', marginRight: '0em', duration: 1.3 * Math.max(0.6, k), ease: 'expo.out' }, wAt)
```

```js
// viewBox from the geometry
const bb = gStroke.getBBox();
const pad = Math.max(bb.width, bb.height) * 0.04;
const vb = [bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2];
svg.setAttribute('viewBox', vb.join(' '));
const scale = p.markSize / Math.max(vb[2], vb[3]);
svg.setAttribute('width', vb[2] * scale);
svg.setAttribute('height', vb[3] * scale);
gStroke.setAttribute('stroke-width', p.strokeWidth / scale);
```
