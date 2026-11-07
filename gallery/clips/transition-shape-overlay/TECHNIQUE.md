# Gooey Wave Cover

1–4 stacked colour layers flood across the frame with an organic, wavy leading edge (every edge point on its own seeded delay), fully cover it at exactly D/2, then drain off the far side — Codrops "shape overlays" style.

## Use it for
- Playful, liquid scene changes in lifestyle, app, education and creator content.
- Brand transitions with a gradient feel: 3–4 layers of the palette stacked like waves.
- Vertical social edits — `direction: up` reads like a swipe.

## Avoid when
- The brand is strictly geometric/corporate — use the diagonal band wipe.
- You need a very fast hit (< 0.6 s): the wavy edge needs time to read; use whip streaks.
- Content must stay visible during the change (it's a full cover, not a reveal).

## The cut contract
- The covering layer (always `color4`, painted last) is complete from `half` to `half + hold`, `half = (D - hold)/2` → the covered window is centred on **D/2**.
- Centre the item on the cut: `start = cutTime - D/2`, on a track above both shots.
- Transparent at both ends: when a layer's lead and trail have both cleared, its path `d` is set to `''`.
- Long clips: `hold = max(min(p.hold, 0.4D), D - 2.4)` — motion stays brisk (≈1.2 s each way max), extra length becomes covered hold.

## Anatomy
- One full-frame `<svg>` with one `<path>` per layer; colours `[color1..color3].slice(0, n-1)` + `color4` so the last colour always covers the cut.
- Each layer is the area between a **leading edge** and a **trailing edge**, each a row of `m` control points (4–16) across the frame's breadth `B`.
- Each edge point has a seeded delay from `profile()`: 55 % random + 45 % a smooth sine across the breadth → the edge is wavy but not jagged.
- Edges are drawn as **Catmull-Rom → cubic Bézier** curves; the path is `lead curve + reversed trail curve + Z`.
- Direction is handled in a local (breadth `b`, along `a`) space and mapped with `toXY` for up/down/left/right — one algorithm, four directions.
- `M` = overshoot margin so bulges clear the frame fully; `pad` extends points 2 % beyond the sides.
- Optional `.label` (Unbounded 800, 110 px × `--u`) rises through a mask during the cover.
- Path `d` is rebuilt every frame in `render(t)` — a pure function of `t`.

## Motion
- Timing: `st = min(stagger, 0.35·half/(n-1))` between layers, `maxDelay = min(0.14, 0.3·half)·waviness`, `move = half - (n-1)·st - maxDelay` per point.
- Layer i's lead starts at `i·st`; its trail starts at `half + hold + (n-1-i)·st` — first in, **last** out, so the covering layer leaves first and the colour layers trail behind it.
- Easing `ez` = cubic in-out (`4x³` / `1-(-2x+2)³/2`): a liquid "pull" — slow start, fast middle, soft landing.
- With defaults (D 1.2, 3 layers, stagger 0.07, hold 0.06, waviness 0.7): half = 0.57, layers start 0 / 0.07 / 0.14, per-point delay up to ~0.12 s.
- Label: rises from `half·0.72` (expo.out), leaves at `half + hold - 0.02` (power3.in).
- What makes it feel good: per-point delays (secondary motion along the edge) + layer stagger (overlap) + symmetric exit.

## Adapt to the design system
- Colours: `color1` → `accent`, `color2` → `accent-2` (by key name); set `color3`/`color4` explicitly — the covering layer should be `bg`/`surface` so the cut frame is calm. In your clip read `studio.design.color('accent', ...)` since colours go into SVG `fill`.
- Type: label → display role.
- Waviness 0.3 for premium/corporate, 0.7–1 for playful. Points 6–9 for big soft waves, 12–16 for a choppy edge.
- 9:16: `up`/`down` sweep the long axis (more travel, more drama); `left`/`right` sweep 1080 px only — feels faster.
- Short (0.8 s): 1–2 layers, waviness ≤ 0.5. Long (2 s+): rely on the auto hold rather than slow motion.

## Variations
- **Single liquid curtain**: `layers: 1`, low waviness — a soft, modern wipe.
- **Gradient flood**: 4 layers from light to dark palette steps with stagger 0.1.
- **Bounce-back**: swap the trail logic so layers retreat the way they came (trail position mirrored).
- **Circular**: same per-point delays but points on a circle radius (polar instead of linear) — an iris made of liquid.
- **Label card**: `hold` 0.8 s + `label` for a chapter name.

## Pitfalls
- Without the overshoot margin `M` the wave bulges leave corner slivers uncovered at D/2.
- Unseeded delays (`Math.random()` without `studio.random`) change the shape between preview and export.
- Too many points + high waviness = jagged, cheap-looking edge.
- If the covering colour is close to the incoming shot's dominant colour, the reveal looks like a glitch; contrast it.
- Don't put the label colour equal to `color4`.

## Reference
Reference implementation: gallery/clips/transition-shape-overlay/ (clip.js, style.css). Key snippet:

```js
const layers = cols.map((c, i) => ({ c, lead: profile(), trail: profile(), s: i * st, e: half + hold + (n - 1 - i) * st }));

// easing: like power2.inOut but slightly front-loaded for a liquid "pull"
const ez = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const along = (t, start, del) => ez(clamp((t - start - del * maxDelay) / move));
```

```js
    const pos = (u) => L + M - (L + 2 * M) * u; // u=0 → beyond the start side, u=1 → beyond the far side
    const pad = B * 0.02;

    return {
      render(t) {
        layers.forEach((l, i) => {
          const lead = [], trail = [];
          let any = false;
          for (let j = 0; j < m; j++) {
            const b = -pad + ((B + 2 * pad) * j) / (m - 1);
            const ul = along(t, l.s, l.lead[j]), ut = along(t, l.e, l.trail[j]);
            if (ul > 0 && ut < 1) any = true;
            lead.push([b, pos(ul)]);
            trail.push([b, pos(ut)]);
          }
          if (!any) { paths[i].setAttribute('d', ''); return; }
          paths[i].setAttribute('d', curve(lead, true) + curve(trail.reverse(), false) + 'Z');
        });
      },
    };
```
