# Bar Chart Race

A full-frame horizontal bar chart race: values interpolate between periods, bars re-rank with smooth position swaps, the axis rescales to the leader and a huge period label rolls in the corner.

## Use it for
- Data stories about how a ranking changes over time (languages, brands, countries, revenue by product).
- 8–20 s "history in one shot" segments where the motion itself is the insight (overtakes, a newcomer rising).
- Social data content where the viewer watches the leader change.

## Avoid when
- There is only one period: use a static bar chart technique (bar-chart) instead.
- Fewer than ~4 series or values that never cross — the race has no drama; a line chart reads better.
- The clip is shorter than ~6 s: periods fly past faster than numbers can be read.

## Anatomy
- Everything lives in `.br` (`inset: 0`, paints `background`, text in `textColor`). Layout is computed in px from `width/height` with `S = min(W,H)/1080` and a `vertical` flag (`H > W * 1.1`).
- **Data parsing**: textarea `Name: v1, v2, …` per line (also `=` or tab), up to 40 series; gaps filled by carrying values forward; `periods` comma list padded with numbers if short.
- **Head**: title (Manrope 800, 58 px, inside an `overflow:hidden` mask) + subtitle at 55 % opacity, top-left at margins `W*0.0625` / `H*0.083`.
- **Rows**: one absolutely positioned `.row` per series (all series exist, only top N are visible) with name label (right-aligned in a column to the left of `x0`), the bar (`border-radius: 4px 10px 10px 4px`, coloured `box-shadow`, a `::after` top highlight gradient), an optional initials badge `.ic` riding at the bar end, and the value label after the bar.
- **Label column width** is measured (`offsetWidth` of the longest name), capped at 26 % of width with ellipsis; value column width is measured from the formatted maximum value.
- **Ticks**: precomputed union of every "nice" tick value the race will need (sampled at 240 points), each a 1.5 px line at 12 % opacity + label; in render they slide with the domain and fade in/out with the active step.
- **Period label**: Inter 300, 220 px (260 vertical), 22 % opacity, bottom-right *behind* the bars, in an `overflow:hidden` 1.02em box so the number can roll.
- Number formatting: thousands separators, `decimals`, `prefix`/`suffix`, optional `compact` (K/M/B).

## Motion
- The chart is a **pure function of t in `render(t)`** — no tweens on bars. Only title/subtitle/ticks/period entrance and exit are GSAP.
- 0.05 s: title rises `yPercent 110→0` (0.8 s `expo.out`); 0.2 s subtitle fades up to 0.55; 0.25 s ticks fade in; 0.3 s period label rises to 0.22 opacity (0.9 s `expo.out`).
- Bars grow from zero per rank: `expo.out` over 0.9 s starting at `0.35 + order * 0.05` (top bar first); names fade in from `0.3 + order * 0.05`.
- Race window: from `intro = min(1.3, duration*0.18)` to `out - min(1.2, duration*0.1)`; periods are spread evenly; between periods values are linear or smoothstep (`interpolation: smooth`). The pause at the end (~1 s) is the hold on the final ranking.
- **Smoothing trick**: rank position, visibility and axis max are averaged over a trailing 0.42 s window (14 samples, raised-cosine kernel). Discrete rank swaps become smooth slides and the axis rescale eases, yet it stays deterministic and seekable.
- Period label rolls up (60 % → 0, `expo.out`, 0.3 s) at the midpoint between periods.
- Exit at `out = duration - 0.75`: bars shrink `power3.in` with a 0.025 s per-rank stagger, title leaves upward, the rest fades (0.4 s).

## Adapt to the design system
- `background` → `bg`, `textColor` → `text` token. The bar `colors` list is free text: in an original clip build the palette from `accent`, `accent-2` and tints of them, or one accent for the subject series and neutrals (`muted`) for the rest — far more legible than 12 hues.
- Fonts: replace Manrope/Inter with `var(--font-title)` / `var(--font-body)`; keep `font-variant-numeric: tabular-nums` on values, ticks and period, or numbers jitter as they count.
- Radius: bar end radius should follow the system's radius token.
- 9:16: the clip already switches — larger type (×1.25–1.3), chart bottom at 80 % height (above platform UI), period label above that. Use `topN` 6–8 vertically so bars stay thick.
- Long durations (20 s+): more periods, not slower ones (~0.8–1.5 s per period reads well). Short: cut periods or use `smooth` interpolation.

## Variations
- **Highlight one series**: colour one series in the accent, everything else `muted` — tells the viewer whom to follow.
- **Markers/beats**: place a period change on every bar (`studio.bars`) by building `fAt(t)` from bar times instead of an even split.
- **Event annotations**: add a caption that appears when `fAt(t)` crosses a period index (e.g. "2020: pandemic").
- **Images instead of initials**: replace `.ic` with logos/flags (`<img>` from `assets/`).
- **Vertical race**: swap axes (columns growing up, ranks left→right) for 9:16 hero formats with ≤6 series.

## Pitfalls
- Don't animate rank swaps with `tl.to` per period — overlapping tweens fight. Compute state from `t` (as here) or smooth discrete state with a window.
- A trailing window samples `t - 0.42`: before the race starts this is clamped by `progress`, but if you write your own, guard negative times.
- Long names: measure and cap the label column, otherwise bars get no room.
- Axis max must include a little headroom (`domain = mx / 0.98`) and the value label width must be reserved, or the leader's value runs off the frame.
- 12 bright colours on a dark bg fight for attention; keep saturation consistent.
- Setting `textContent` every frame is fine; creating elements in `render` is not.

## Reference
Reference implementation: gallery/clips/infographic-bar-race/ (clip.js, style.css). Key snippet:

```js
      render(t) {
        // smoothed state from a trailing window of discrete states
        const yRank = new Array(N).fill(0), vis = new Array(N).fill(0);
        let mx = 0;
        for (let k = 0; k < NS; k++) {
          const ts = t - WIN * (1 - (k + 0.5) / NS);
          const vals = valuesAt(ts), rk = ranksOf(vals), w = kernel[k] / ksum;
          for (let i = 0; i < N; i++) { yRank[i] += Math.min(rk[i], topN) * w; vis[i] += (rk[i] < topN ? 1 : 0) * w; }
          mx += Math.max(...vals, 1e-9) * w;
        }
        const vals = valuesAt(t), rk = ranksOf(vals);
        const domain = mx / 0.98;
```

```js
        rows.forEach((r, i) => {
          const order = Math.min(rk[i], topN);
          const grow = eOut(studio.progress(t, 0.35 + order * 0.05, 0.9)) * (1 - eIn(studio.progress(t, out + order * 0.025, 0.35)));
          const len = Math.max(0, (vals[i] / domain) * maxLen) * grow;
          const y = chartTop + yRank[i] * rh + (rh - bh) / 2;
          r.el.style.transform = `translateY(${y.toFixed(2)}px)`;
          r.el.style.opacity = vis[i].toFixed(3);
          r.el.style.display = vis[i] < 0.002 ? 'none' : '';
          r.bar.style.width = len.toFixed(2) + 'px';
```
