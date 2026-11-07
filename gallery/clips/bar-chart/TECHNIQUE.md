# Animated Bar Chart

A vertical bar chart on an optional dark card: title and subtitle rise, gridlines draw on, bars grow left to right with counting value labels, and one bar (the max or the last) is highlighted in the accent colour.

## Use it for
- A simple data series of 3–12 values: monthly revenue, survey answers, before/after by category.
- "The number went up" moments in explainers and reports — the highlight tells the viewer where to look.
- Over footage (card on) or on a designed background (card off).

## Avoid when
- Values change over time and ranks matter (use infographic-bar-race).
- Shares of a whole (use infographic-donut-chart) or a continuous trend with many points (use line-chart).
- Labels are long (> 10 chars) — category labels are single-line and ellipsised.
- There are negative values — bars are clamped at 0.

## Anatomy
- Data: textarea `Label: value` per line (also `=` or tab; spaces and a decimal comma are accepted), max 16 rows.
- **Nice axis**: step = first of `[1, 2, 2.5, 5, 10] × 10^n` that is ≥ max/5; top = max rounded up to a step. Axis labels get thousands separators.
- Fixed 1440×820 box centred in the frame (`.bc`): `.card` (32 px radius, big soft shadow, `cardColor` at `cardOpacity`), `.head` (Manrope 700 52 px title, Inter 28 px subtitle at 0.55), `.plot` (inset left 140 / right 72 / top 230 / bottom 110).
- Gridlines: 2 px rows positioned by `bottom = v/top × PH`; line opacity 0.12 (baseline 0.35); axis values to the left at 0.45 opacity, `tabular-nums`.
- Columns: slot = plot width / n, bar width = `min(140, slot × 0.58)`. Each column holds `.bar` (radius `12px 12px 3px 3px`, `transform-origin: bottom`), `.val` (Inter 700 32 px, rides on top of the bar) and `.cat` label below.
- Highlight bar: accent fill + `box-shadow: 0 0 40px accent55` glow, accent value label; others in a muted `barColor`.
- Split of work: static/opacity tweens on `ctx.tl`; bar heights and counting numbers computed in `render(t)`.

## Motion
- 0 s: card fades/scales in `0.96 → 1` (0.6 s `expo.out`).
- 0.15 s: title and subtitle rise 24 px (0.6 s `expo.out`, stagger 0.08; subtitle lands at 0.55 opacity).
- 0.3 s: gridlines draw left → right (`scaleX 0 → 1`, 0.7 s `expo.inOut`, stagger 0.05); axis numbers fade in from 0.5 s.
- 0.6 s: category labels rise 16 px (0.5 s `power3.out`, stagger = bar stagger) — labels arrive just before their bars (anticipation: the viewer knows what's coming).
- 0.75 s + i × 0.1 s: bar `i` grows `scaleY 0 → 1` over 0.9 s (`outCubic`); its value counts with the same curve, so number and height always agree; value label fades in 0.1 s after the bar starts.
- Exit at `duration − 0.82`: bars shrink in **reverse order** (last first, 0.03 s apart, 0.35 s `inCubic`), head/grid/labels fade (0.4 s), card scales to 0.97 and fades.
- Not beat-synced; to sync, set each column's `start` to `studio.beat(i)`.

## Adapt to the design system
- `accent` → `accent`, `textColor` → `text`, `cardColor` → `surface` (by key name). `barColor` binds to the accent pattern too (`bar|barcolor` → accent), which would remove the contrast with the highlight — in your own clip use a muted token (`muted` or a mix of `text` at low opacity) for the non-highlighted bars.
- Type: title → `title` role, values/axis → a tabular-number face (Inter, JetBrains Mono). Card radius and bar top radius → design radius.
- 9:16: the box is a fixed 1440 px wide and will overflow a 1080-wide frame — in an original clip size the box from `studio.width/height` (e.g. 90 % width, 55 % height), use ≤ 6 bars or switch to horizontal bars.
- Short clips (≤ 4 s): stagger 0.05, grow 0.6 s. Long clips: keep the entrance, add a slow push or pulse the highlight bar during the hold rather than slowing growth beyond ~1 s per bar.

## Variations
- **Horizontal bars**: swap axes (`scaleX`, origin left) for long category names.
- **Delta callout**: after growth, draw an arrow/label between first and last bar (“+148 %”).
- **Stacked/grouped**: two bars per slot with two colours (this year vs last year), the current series highlighted.
- **Pop highlight**: highlighted bar grows last with `back.out` overshoot and a value chip instead of plain text.
- **Transparent overlay**: `card: false`, white text with shadow over B-roll.

## Pitfalls
- Counting numbers must use `tabular-nums` or labels jitter sideways while counting.
- Value labels above a 100 % bar can collide with the head if `PH` changes — keep headroom for `.val` (14 px + font).
- Don't animate `height` in GSAP and also set it in render; the clip sets height once and animates `scaleY` (bar corners stretch a little during growth — accept or animate height instead).
- Too many bars (> 12) makes labels ellipsise into "Ja…" — reduce data or rotate labels.
- The highlight `max` picks the first maximum if values tie.

## Reference
Reference implementation: gallery/clips/bar-chart/ (clip.js, style.css). Key snippet:

```js
    const rawStep = (maxV || 1) / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= rawStep);
    const top = Math.ceil((maxV || 1) / step) * step;
```

```js
      render(t) {
        cols.forEach((c, i) => {
          const g = studio.ease.outCubic(studio.progress(t, c.start, 0.9));
          const shrink = studio.ease.inCubic(studio.progress(t, out + (n - 1 - i) * 0.03, 0.35));
          const k = g * (1 - shrink);
          c.bar.style.height = c.h + 'px';
          c.bar.style.transform = `scaleY(${k})`;
          c.val.style.bottom = c.h * k + 14 + 'px';
          c.val.style.opacity = Math.min(1, studio.progress(t, c.start + 0.1, 0.3)) * (1 - shrink);
          c.val.textContent = fmt(c.v * studio.ease.outCubic(studio.progress(t, c.start, 0.9)));
        });
      },
```
