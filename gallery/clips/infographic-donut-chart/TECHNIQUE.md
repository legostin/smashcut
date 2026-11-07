# Donut Breakdown

A donut chart on a card: segments sweep in clockwise from 12 o'clock, a centre number counts up, the legend staggers in and one highlighted segment pops outward while the others dim.

## Use it for
- Shares of a whole: budget split, market share, survey answers, time allocation.
- A "the biggest slice is X" moment — the highlight makes one segment the story.
- 5–8 s explainer beats; works as a full card or as a transparent overlay (`card: false`).

## Avoid when
- More than ~6 segments, or many tiny slices (<3 %): labels become a legend-reading exercise. Group into "Other".
- Values don't sum to a meaningful whole — use a bar chart.
- You need to compare two similar values precisely; angles are hard to compare.

## Anatomy
- `.dn` is a fixed design canvas (1480×820 landscape, 940×1330 vertical) centred with negative margins and scaled with `fitS` to 80/78 % (90/80 % vertical) of the frame — the clip is laid out once in "card space" and fitted, not reflowed.
- **Card**: rounded 36 px panel in `cardColor` with a deep drop shadow and a 1 px inset top highlight; hidden in `nocard` mode (text gets a shadow instead).
- **SVG ring**: a faint track circle (`stroke-opacity .07`) and one `<circle>` per segment in a `<g transform="rotate(-90)">` so angle 0 = 12 o'clock. Each circle has `pathLength="360"`, so dash lengths are in **degrees**; position via `stroke-dashoffset = -startAngle`.
- Gaps: `gapDeg` is subtracted from each segment; with `roundCaps` the cap overhang (`(T/2)/rc` in degrees) is subtracted too, so round ends don't overlap.
- Each segment is wrapped in its own `<g>` that translates 14 px along the segment's mid-angle for the "pop out".
- **Centre stat**: a flex box sized to the inner hole; Manrope 800, 112 px, auto-shrunk if wider than the hole; label = highlighted segment's name (or `centerLabel`, or "Total").
- **Legend**: rows of swatch (18 px, radius 6) + label (ellipsis) + value, separated by 8 % white rules; to the right of the donut (landscape) or below it (vertical); auto-scaled if too tall.
- Values shown as percent of total or raw value with prefix/suffix/decimals.

## Motion
- 0.02 s card fades/scales 0.96→1 (0.7 s `expo.out`); 0.12 s title rises through its mask; 0.22 s subtitle; 0.25 s track scales 0.85→1.
- Sweep: starts at 0.45 s; the whole circle is spread over `sweepSpan = clamp(duration*0.18, 0.5, 1.1)` s, each segment starts when the "sweep head" reaches its start angle and draws over `0.45 + len/360*0.5` s `power3.out` — so segments overlap like one continuous hand drawing around the dial.
- 0.55 s legend rows slide in (x 30→0, 0.08 s stagger), swatches pop with `back.out(3)` slightly later (0.6 s) — secondary motion.
- Centre number counts from 0 with `expo.out` (starts ~0.55 s, ≤1.4 s), its label fades at 0.75 s.
- Highlight at `tHi = sweep end + 0.35 s`: chosen segment pops out (`back.out(2.2)`, 0.55 s) and gains a breathing glow (`sin` of t, drop-shadow); the rest dim to 40 % opacity, legend rows too.
- Exit at `duration - 0.7`: segments unwind in reverse order (0.04 s stagger, `power2.in`), legend slides out, centre/head lift and fade, card scales to 0.97.
- State lives in proxy objects (`{p, pop, dim}`) tweened on `tl`; `render(t)` writes them to SVG attributes. This keeps SVG attribute animation seekable.

## Adapt to the design system
- `cardColor` → `surface`, `textColor` → `text`. Colours list → build from `accent`, `accent-2`, and `muted` for the rest; highlighted segment should be the accent.
- Fonts: Manrope numbers → `var(--font-display)`, Inter labels → `var(--font-body)`. Keep tabular numerals.
- Card radius (36 px) and legend swatch radius follow the radius token; `thickness` (21 % of radius) can go thinner for elegant systems, thicker for bold.
- 9:16: built-in vertical canvas puts the legend under the donut, bigger radius (300). Keep ≤5 rows so the legend stays above the bottom 20 %.
- Short clips (≤4 s): sweepSpan shrinks automatically; consider no highlight. Long: the highlight breathing carries the hold; add a second highlight later instead of a long static hold.

## Variations
- **Pie**: `thickness` 45 and no centre stat for a near-pie look.
- **Highlight tour**: highlight segments one after another (move `tHi` per segment, swap the centre label and number).
- **Gauge / half-donut**: `pathLength` 360 but only 180° of total, rotate the group −180 for a semicircle.
- **Beat sync**: start each segment on `studio.beat(i)` instead of the angle-proportional time.
- **Callout labels**: lines from each mid-angle to outside labels instead of a legend (use the stored `mid`).

## Pitfalls
- SVG circles start at 3 o'clock; without the `rotate(-90)` the sweep starts in the wrong place, and the pop-out direction must use the same rotated angle.
- Gap + round caps: subtract cap degrees or segments overlap; tiny segments may get negative length (clamped to 0 here).
- Dasharray gap must be ≥ the remaining length (`360 - L + 1`), or the dash repeats around the ring.
- The legend separator colour is hard-coded white — on a light card swap it for a dark rgba or a token.
- Count-up numbers widen as they grow: set `min-width` / tabular-nums to stop the layout jumping.

## Reference
Reference implementation: gallery/clips/infographic-donut-chart/ (clip.js, style.css). Key snippet:

```js
    S.forEach((s, i) => {
      const start = sweepT0 + (s.a0 / 360) * sweepSpan;
      tl.to(s.st, { p: 1, duration: 0.45 + (s.len / 360) * 0.5, ease: 'power3.out' }, start);
      if (hasHi) tl.to(s.st, i === hi ? { pop: 1, duration: 0.55, ease: 'back.out(2.2)' } : { dim: 1, duration: 0.5, ease: 'power2.out' }, tHi);
      // exit: unwind in reverse order
      tl.to(s.st, { p: 0, duration: 0.35, ease: 'power2.in' }, out + (S.length - 1 - i) * 0.04);
    });
```

```js
      render(t) {
        S.forEach((s, i) => {
          const L = s.len * s.st.p;
          s.c.setAttribute('stroke-dasharray', `${L.toFixed(3)} ${(360 - L + 1).toFixed(3)}`);
          s.c.setAttribute('stroke-dashoffset', (-s.a0).toFixed(3));
          s.c.style.visibility = L > 0.05 ? 'visible' : 'hidden';
          const d = 14 * s.st.pop;
          // wrap is inside the rotate(-90) group: angle 0 = 12 o'clock maps to +x
          s.wrap.setAttribute('transform', `translate(${(Math.cos(s.mid) * d).toFixed(2)},${(Math.sin(s.mid) * d).toFixed(2)})`);
```
