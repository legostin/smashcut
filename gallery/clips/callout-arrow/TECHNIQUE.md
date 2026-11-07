# Arrow Callout

A transparent overlay that marks a point in the frame with a pulsing target, pops a label card beside it, and draws a curved arrow from the card edge into the target (SVG + GSAP DrawSVGPlugin).

## Use it for
- Pointing at one detail in footage, a UI element in a screen recording, a product feature, a person in a crowd.
- Tutorials and product demos ("New export button here"), explainer annotations.
- Sequences of callouts: several short items one after another on different targets.

## Avoid when
- The target moves — the marker is static (no tracking). Use several short items or keyframe `x/y` in your own clip.
- You need to point at 3+ things at once — clutter; use a spotlight technique or sequence them.
- The label is longer than ~30 characters: the card is `nowrap` and can run off small frames.

## Anatomy
- `.co` full-frame layer; a full-frame `<svg viewBox="0 0 W H">` (with a drop-shadow filter) holds two ripple circles, the target dot (r 11, accent fill, 4 px white stroke), a quadratic-curve `.shaft` path and a two-segment `.head` (open chevron) path. The card is an absolutely positioned HTML `<div>` (radius 18, padding 22/30/24, shadow) with an accent side bar, label (Manrope 700 40 px) and sub-label (Inter 500 26 px, 62 % opacity).
- **Geometry, all computed in setup**:
  - Target `T` from `x/y` percent params. `side: 'auto'` puts the card on the side with more room (left/right if the target is far from centre horizontally, else above/below).
  - Tail anchor `A` = `distance` px away on that side, offset diagonally (`0.45·d` / `0.55·d`) so the arrow curves instead of being straight.
  - The card is placed so `A` sits on its facing edge, then clamped 60 px inside the frame; the tail moves with it.
  - Control point `C` keeps the curve leaving the card perpendicular to its edge, `bend` (0–1) controls how far before turning into the target.
  - The shaft stops 34 px short of the target (`stop`) so it does not cover the marker; the head is built from the end direction ± 0.55 rad, length `26 + 1.5·strokeWidth`.
- Card `transformOrigin` is the edge facing the target, so it scales out from where the arrow starts.

## Motion
- 0.05 s: target dot pops `scale 0 → 1` with `back.out(3)` (strong overshoot — "here!").
- 0.2 s: card scales `0.6 → 1` + fades from its arrow-side edge (`back.out(1.8)`, 0.55 s); 0.35 s: label then sub-label rise 14 px (stagger 0.08, `power3.out`).
- 0.45 s: shaft draws `drawSVG 0% → 100%` (0.6 s `power2.inOut`) from the card toward the target; opacity is held 0 until 0.47 s so a zero-length round cap does not show as a dot.
- 0.98 s: arrowhead draws from its tip outward (`drawSVG '50% 50%' → '0% 100%'`, 0.25 s) — it "lands" right as the shaft arrives.
- From 0.25 s: two ripple rings (in `render(t)`) expand r 16 → 68 over 1.4 s, half a cycle apart, fading out — a deterministic function of `t`.
- Exit at `out = max(1.0, D − 0.78)`: head retracts to its centre (0.2), shaft undraws toward the target (`'100% 100%'`, 0.4), card scales to 0.8 and fades (0.35), dot shrinks with `back.in(2)` last; rings fade over 0.4 s.

## Adapt to the design system
- `accent` → accent token (dot, rings, arrow, card bar); `cardColor` → surface; `cardText` → text (bound by name). In your clip use `var(--color-accent)` etc. and the system radius for the card (18 px default).
- Fonts: label = title role, sub-label = body/caption role.
- Stroke width follows the system's line weight (6 px default; 3–4 for elegant, 8–10 for bold/youtube).
- 9:16: prefer `side: 'above'/'below'` (the frame is narrow); reduce `distance` to ~240 and keep the card within the middle 60 % height. The 60 px clamp margin is smaller than title-safe — raise it for social.
- Short items (2–3 s): the entrance completes at 1.23 s and the exit takes 0.78 s; under 2.5 s cut the ripple and shorten the draw to 0.4 s.

## Variations
- **Hand-drawn**: replace the quadratic shaft with a wobbly path and a marker stroke (see callout-hand-drawn).
- **Multi-target**: sequence N targets in one clip, each with its own draw-on/undraw, card moving between positions with `power2.inOut`.
- **Beat-hit**: put the dot pop on `studio.beat(0)` and the head landing on the next beat.
- **Number badge**: replace the dot with a numbered circle ("1", "2", "3") for step-by-step tutorials.
- **Straight leader**: `bend: 0` + a horizontal tail for a technical/diagram look.

## Pitfalls
- DrawSVGPlugin must be loaded in `index.html` (`/vendor/gsap/DrawSVGPlugin.min.js`) and registered (`gsap.registerPlugin(DrawSVGPlugin)`).
- The SVG must share the project's coordinate space (`viewBox="0 0 W H"` at full size) or the HTML card and SVG arrow will not align.
- Measure the card (`offsetWidth/Height`) after setting its text, before positioning.
- The pulse rings must be computed from `t` (modulo phase), never with CSS `animation: infinite` without a deterministic delay.
- An arrow that ends exactly on the marker hides it; keep the 30–40 px stop.
- Nothing scales with resolution (px constants assume 1080p) — multiply by `min(W,H)/1080` in your version.

## Reference
Reference implementation: gallery/clips/callout-arrow/ (clip.js, style.css). Key snippet:

```js
    // curve: leave the card perpendicular to its edge, bend into the target
    const stop = 34; // stop short of the marker
    const C = horiz ? { x: A2.x + (T.x - A2.x) * p.bend, y: A2.y } : { x: A2.x, y: A2.y + (T.y - A2.y) * p.bend };
    const dirx = T.x - C.x, diry = T.y - C.y, dl = Math.hypot(dirx, diry) || 1;
    const B = { x: T.x - (dirx / dl) * stop, y: T.y - (diry / dl) * stop };
    el.querySelector('.shaft').setAttribute('d', `M${A2.x},${A2.y} Q${C.x},${C.y} ${B.x},${B.y}`);
    const ux = dirx / dl, uy = diry / dl, hl = 26 + p.strokeWidth * 1.5, ang = 0.55;
    const h1 = { x: B.x - hl * (ux * Math.cos(ang) - uy * Math.sin(ang)), y: B.y - hl * (uy * Math.cos(ang) + ux * Math.sin(ang)) };
    const h2 = { x: B.x - hl * (ux * Math.cos(-ang) - uy * Math.sin(-ang)), y: B.y - hl * (uy * Math.cos(-ang) + ux * Math.sin(-ang)) };
    el.querySelector('.head').setAttribute('d', `M${h1.x},${h1.y} L${B.x},${B.y} L${h2.x},${h2.y}`);
```

```js
      .set(shaft, { opacity: 0 }, 0)
      .fromTo(shaft, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.6, ease: 'power2.inOut' }, 0.45)
      .set(shaft, { opacity: 1 }, 0.47)
      .set(head, { opacity: 0 }, 0)
      .set(head, { opacity: 1 }, 1.0)
      .fromTo(head, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 0.25, ease: 'power2.out' }, 0.98)
```
