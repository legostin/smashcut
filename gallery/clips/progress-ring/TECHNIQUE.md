# Progress Ring

A circular gauge that fills to a percentage with a gradient arc, a white head dot, a blurred glow copy, 60 tick marks that light up as the arc passes and a counting number in the centre, with a label/sub-label beside or below it.

## Use it for
- A single percentage KPI: completion rate, satisfaction score, uptime, goal progress, battery/loading metaphors.
- "We hit 87 %" payoff moments in pitches, reports and product videos.
- Overlays next to a talking head (it is transparent — no background).

## Avoid when
- Values over 100 % or without a natural maximum — use a counter technique.
- Several percentages need comparing (use bars or a donut).
- The number is tiny (<5 %): the arc is a dot and the gauge undersells it.

## Anatomy
- `.pr` is a full-frame flex container centring a `.ring` and a `.txt` block; `side` layout puts them in a row (110 px gap), `stacked` in a column (50 px gap, centred text, accent bar hidden).
- **SVG ring** (`size` px square, radius `R = (size - thickness)/2 - 22`):
  - 60 tick lines just inside the outer edge, every 5th longer/thicker, `track` colour at 18 %.
  - Track circle in `track` colour at 10 % opacity.
  - Arc = a `<circle>` with `stroke-dasharray: len C` (C = circumference), `stroke-linecap: round`, stroked with a diagonal linear gradient `color → color2`; inside `rotate(-90)` so it starts at 12 o'clock.
  - A duplicate arc with `feGaussianBlur(10)` at 55 % opacity underneath = the glow.
  - A white head dot (`0.28 × thickness`) placed at the arc end by trigonometry.
- **Centre number**: Inter 800, `size × 0.26` px, −0.045em tracking, tabular-nums, with a smaller `%` (0.45em, 80 % opacity).
- **Text**: short gradient accent bar (90×8 px, side layout only), label (Manrope 700, 64 px; 52 px stacked), sub-label (Inter 30 px, 60 %).

## Motion
- 0 s ring enters from `scale 0.6, rotate −40°` (0.8 s `expo.out`) — the spin-in gives the gauge mechanical character.
- 0.1 s track fades in (GSAP `attr` tween on `stroke-opacity`); 0.3 s number pops (`back.out(2)`); 0.35 s accent bar wipes in; 0.4 s label and sub-label rise 30 px (0.1 s stagger).
- Fill from `t0 = 0.55` s over `F = min(fillTime, duration - t0 - 1.3)` (default 2 s) with a cubic ease-out computed in `render` (`1 - (1-p)^3`); number, arc, glow, head dot and ticks all derive from the same `frac`, so they cannot drift apart.
- Ticks switch from 18 % track colour to 90 % arc colour (`color` for the first half, `color2` for the second) as the arc passes.
- On completion (`t0 + F - 0.05`): the ring does a 1.035× yoyo punch (0.14 s) — a small "landed" accent.
- Exit at `duration - 0.75`: text slides out (`x 40` side / `y 30` stacked, `power3.in`), the arc unwinds (`inCubic` over 0.5 s), and the ring scales to 0.7 and spins +30° out 0.15 s later. The number does not count down on exit.

## Adapt to the design system
- `color` → `accent`, `color2` → `accent-2`, `textColor` → `text`; `track` is free (keep it the text colour at low opacity).
- Fonts: number Inter → `var(--font-display)` (keep tabular-nums), label Manrope → `var(--font-title)`, sub-label → body.
- `thickness` is the system's visual weight (12–20 px elegant, 34 default, 60+ bold/playful). Round caps fit soft systems; use `butt` for technical/brutalist looks.
- Energy: `fillTime` is the main dial — 1 s for punchy, 3–4 s for suspense.
- 9:16: `side` layout is ~1430 px wide and overflows a 1080 px frame — use `stacked` (or compute ring size from `studio.width`), and keep the stack in the middle 60 % height.
- Long clips: the hold is static after the punch; add a slow ring rotation of the ticks or a subtle glow breathing (`sin(t)`) in an original clip.

## Variations
- **Segmented gauge**: draw only the ticks (no arc), light them one by one with a tiny scale pop — a "loading bar" look.
- **Half gauge / speedometer**: 240° arc from −120°, a needle instead of the head dot, a colour zone track.
- **Multi-ring (Activity rings)**: 2–3 concentric rings with staggered fills (0.2 s) and their own colours and labels.
- **Beat fill**: fill in steps, one step per `studio.beat(n)`, with the punch on each beat.
- **Before → after**: fill to an old value, hold, then continue to the new value with a second punch and a "+12 %" chip.

## Pitfalls
- Without `rotate(-90)` the arc starts at 3 o'clock; the head dot angle must use the same −π/2 offset.
- `stroke-dasharray` with a zero length still draws a round cap dot — the code hides the arc below `frac 0.001` and uses a tiny minimum length.
- Gradient on a circle stroke is not angular: `linearGradient` gives a diagonal blend, not a true sweep. For a conic look, use many short segments or a CSS `conic-gradient` masked into a ring.
- The SVG ids `prG` / `prGlow` are document-global — rename if you put two rings in one clip.
- Number width changes while counting: tabular-nums is required, and long labels need `max-width` (760 px here) to avoid pushing the ring off-centre.

## Reference
Reference implementation: gallery/clips/progress-ring/ (clip.js, style.css). Key snippet:

```js
      render(t) {
        const k = 1 - Math.pow(1 - studio.progress(t, t0, F), 3);
        const un = studio.ease.inCubic(studio.progress(t, out, 0.5));
        const frac = (pct / 100) * k * (1 - un);
        const len = Math.max(0.0001, frac * C);
        arc.setAttribute('stroke-dasharray', `${len} ${C}`);
        glow.setAttribute('stroke-dasharray', `${len} ${C}`);
        arc.setAttribute('opacity', frac > 0.001 ? 1 : 0);
        glow.setAttribute('opacity', frac > 0.001 ? 0.55 : 0);
        const a = frac * Math.PI * 2 - Math.PI / 2;
        head.setAttribute('cx', cx + Math.cos(a) * R); head.setAttribute('cy', cx + Math.sin(a) * R);
        head.setAttribute('opacity', frac > 0.01 ? 0.95 : 0);
        v.textContent = (pct * k).toFixed(p.decimals);
        tks.forEach((tk, i) => {
          const on = i / NT < frac - 1e-6;
          tk.setAttribute('stroke', on ? (i / NT < 0.5 ? p.color : p.color2) : p.track);
          tk.setAttribute('stroke-opacity', on ? 0.9 : 0.18);
        });
      },
```
