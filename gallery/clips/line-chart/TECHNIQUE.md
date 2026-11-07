# Animated Line Chart

A smooth line chart on a card: gridlines slide in, the Catmull-Rom curve and its gradient area are revealed left to right behind a glowing head, points pop as the head passes them and the last value is called out in a badge.

## Use it for
- Growth stories, trends, time series (users per month, revenue, temperature, followers).
- "It went up and to the right" moments where the shape of the line is the message, with the final number as the payoff.
- 5–8 s data beats in explainers, pitch videos and reports.

## Avoid when
- More than ~12 points — value labels collide; drop `showValues` or aggregate.
- Several series need comparing — this draws one line (extend per the variations).
- Categories are not ordered (use a bar chart).

## Anatomy
- `.lc` is a fixed 1440×820 card centred in the frame (`left/top: 50%` + negative margins) — not fitted to the frame size.
- **Card**: `cardColor` at `cardOpacity` (0.92), radius 32, big soft shadow; hidden with `card: false`.
- Head: title (Manrope 700, 52 px) + subtitle (Inter, 55 %).
- **SVG** in card coordinates, plot box `X0=150..X1=1350`, `Y0=710..Y1=250`:
  - "nice" axis step (1, 2, 2.5, 5, 10 × 10^n, ~5 gridlines), optional zero base; baseline at 35 % opacity, other gridlines 10 %, axis labels 45 %.
  - Category labels under the plot (65 %).
  - The curve: Catmull-Rom converted to cubic Béziers (control points `p1 + (p2 - p0)/6`) with linear end extrapolation, so the line passes through every data point.
  - Inside a `clipPath` rect (the reveal): gradient area (`lineColor` 45 % → 0 vertically), a blurred 12 px glow copy of the line and the crisp 6 px line, both stroked with a horizontal gradient `lineColor → accent`.
  - Points: 10 px circles with a 5 px stroke in the card colour (a "cut-out" ring), value labels above; the last point uses `accent` and gets no label.
  - Head: white dot + blurred accent glow following the reveal edge.
- **Badge**: HTML pill in `accent` with a CSS triangle (`::after` border trick inheriting `border-top-color`) above the last point.

## Motion
- 0 s card fades/scales 0.96→1 (0.6 s `expo.out`); 0.15 s title and subtitle rise 24 px (0.08 s stagger); 0.3 s gridlines slide in from x −30 (0.05 s stagger, `power3.out`); 0.5 s category labels fade (0.04 s stagger).
- Draw from `t0 = 0.8` s over `D = min(drawTime, duration - t0 - 1.5)` (default 2.2 s) with `inOutCubic`; the clip rect width follows the head x, and the head y is evaluated on the Bézier at that x (`yAt`) so dot and line edge stay glued.
- Head fades in over 0.2 s and out 0.3 s after the draw ends.
- Each point pops with `outBack` (0.35 s) exactly when the head reaches it: the code inverts the `inOutCubic` ease by bisection to find that time — so pops stay in sync even with an eased head.
- At `t0 + D`: badge pops `back.out(2.2)` — the payoff.
- Exit at `duration - 0.82`: head, svg and badge lift 20 px and fade (0.05 s stagger), card fades/scales out 0.25 s later.

## Adapt to the design system
- `lineColor` → `accent`, `accent` → `accent-2` (last point, badge, line gradient end), `textColor` → `text`, `cardColor` → `surface` (bound by key names).
- Fonts: Manrope title → `var(--font-title)`, Inter SVG text → `var(--font-body)`; keep tabular numerals on values.
- Card radius 32 → radius token; stroke width 6 is the "weight" of the system (4 for thin/elegant, 8–10 for bold).
- 9:16: the 1440 px card is wider than a 1080 px frame and will be cut off — in an original clip size the plot box from `studio.width` (e.g. 940×1100 card, fewer points, larger labels) or scale the card with a fit factor.
- Short clips: `D` shrinks automatically (min 0.5 s). Long clips: raise `drawTime` (up to 8 s) to make the draw the story, or keep it short and add an annotation during the hold.

## Variations
- **Multi-series**: several paths with their own clip rects started 0.2 s apart; label the line ends instead of points.
- **Annotated event**: a vertical marker line + label that appears when the head passes a given x ("launch", "price change").
- **Beat-drawn**: segment-by-segment reveal where each data point is reached on `studio.beat(i)`.
- **Sparkline**: no card, no grid, only line + last-value badge, as an overlay next to a talking head.
- **Negative zone**: colour the area below zero with a second gradient (clip by y).

## Pitfalls
- Reveal with a clip rect (or `stroke-dasharray`) — not by rebuilding the path per frame.
- If the head runs on an eased `k`, point pops must use the same mapping (invert it) or they fire early/late.
- The last point's label is replaced by the badge; if you also show it, they overlap.
- Unbounded Catmull-Rom can overshoot below the baseline on sharp drops; clamp values or use monotone interpolation for data that must not dip below zero.
- Axis labels built with `String(Math.round(v))` lose decimals when the step is ≥1 but values are fractional — check your data.
- SVG `id`s (`lcA`, `lcClip`) are document-global; give them unique names if you put two charts in one clip.

## Reference
Reference implementation: gallery/clips/line-chart/ (clip.js, style.css). Key snippet:

```js
    // Catmull-Rom → Bezier with linear end extrapolation (x stays linear in the segment parameter)
    const P = xs.map((x, i) => ({ x, y: ys[i] }));
    const get = (i) => (i < 0 ? { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y } : i >= n ? { x: 2 * P[n - 1].x - P[n - 2].x, y: 2 * P[n - 1].y - P[n - 2].y } : P[i]);
    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      segs.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
    }
```

```js
      render(t) {
        const k = studio.ease.inOutCubic(studio.progress(t, t0, D));
        const hx = X0 + (X1 - X0) * k;
        rev.setAttribute('width', k > 0 ? hx - (X0 - 20) + 8 : 0);
        const hy = yAt(hx);
        const headOn = t > t0 && t < t0 + D + 0.3;
        const hk = headOn ? Math.min(1, (t - t0) / 0.2) * (1 - studio.progress(t, t0 + D, 0.3)) : 0;
        headDot.setAttribute('cx', hx); headDot.setAttribute('cy', hy); headDot.setAttribute('opacity', hk);
        headGlow.setAttribute('cx', hx); headGlow.setAttribute('cy', hy); headGlow.setAttribute('opacity', hk);
        ptEls.forEach((g, i) => {
          // time at which the head reaches this point (invert the ease numerically)
          const reached = hx >= xs[i] - 1;
          let s = 0;
          if (reached) {
            let a = 0, b = 1; const target = (xs[i] - X0) / (X1 - X0);
            for (let it = 0; it < 24; it++) { const mid = (a + b) / 2; if (studio.ease.inOutCubic(mid) < target) a = mid; else b = mid; }
            s = studio.ease.outBack(studio.progress(t, t0 + a * D, 0.35));
          }
          g.setAttribute('transform', `scale(${Math.max(0, s)})`);
        });
      },
```
