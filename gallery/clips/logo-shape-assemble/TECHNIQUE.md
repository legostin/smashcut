# Geometric Shape Logo Build

A playful logo build: flat primitives (circle, square, triangle, pill) fly in on curved polar paths with overshoot, orbit the centre, then each one morphs into a piece of the mark while flying home; a flash ring and a settle-pop mark the lock, and the wordmark slides out from behind the mark.

## Use it for
- Agency, design-tool, kids/edu and product brands with geometric, multi-piece marks.
- Intros/outros where the logo should feel "constructed" — a metaphor for building, assembling, teamwork.
- Music-led stings: the lock can land on a beat (`syncToBeat`).

## Avoid when
- The logo is one complex path (it still works via the decoy mode, but the morph-into-pieces payoff is lost).
- Serious/corporate finance or news contexts — orbiting confetti shapes read as playful.
- Under ~2.5 s: the flight + orbit + lock needs time to read.

## Anatomy
- `.sa` full-frame (`solid` paints `bgColor`, `transparent` leaves it clear). One full-frame `svg.fx` in screen coordinates (`viewBox 0 0 W H`).
- **Logo measurement**: logo paths are added to a probe group, `getBBox()` gives the logo box `lb`, scale `s = markSize / lb.height`.
- **Pieces**: one `<g>` per logo path, each with a single `<path>` whose initial `d` is a generated primitive (`prim(type, cx, cy, size)`) centred on that piece's own bbox centre. Colours cycle through `palette`. Each piece gets a seeded start angle `theta` (evenly spread + jitter) and spin (±200–460).
- **Decoy mode**: if the logo has < 2 paths, `shapeCount` primitives are generated at the logo centre; they shrink to 0 while the real logo (`logoFull`) pops in with `back.out(2)`.
- `logoSvg` with `<svg>` markup → basic shapes are converted to path data with `MorphSVGPlugin.convertToPath` (morphing needs paths).
- **Ring**: one SVG circle (stroke = `textColor` on solid, white on transparent) for the flash.
- **Wordmark**: HTML `.wm` with `overflow:hidden`, positioned right of the final mark; `.in` slides `xPercent −105 → 0` so it appears from behind the mark. Fit to `W − 240 − markW − gap`.
- **Hybrid driving** (the key idea): GSAP tweens a plain state object `st = { pop, cx, push }` plus the morphs; `render(t)` reads `st` and computes every piece's position analytically. Flight is a pure function of `t`.

## Motion
- Timing scale `k = min(1, D/3.8)`; `enterDur = 0.75`, `enterSt = 0.06k`, landing start `TL = 1.35 × max(0.55, k)`, `landDur = 0.6`, `landSt = 0.035`.
- 0.04 s + i × enterSt: each shape flies in from radius 1150 px to `orbitR` with an out-back radius curve (`c1 = 1.5`, overshoots inside the orbit) while its angle unwinds 1.3 rad (out-cubic) — a curved, swooping entry.
- After entering: orbit at `omega = 2.4 rad/s`, radius tightening 18 % over 0.8 s (spiral in = anticipation of the lock); each piece spins (`spin × elapsed × 0.6`, fading to 0 as it lands) and flies 1.5× larger.
- TL + i × 0.035 s: morph `morphSVG { shape, shapeIndex: 'auto' }` (0.6 s `power3.inOut`) while position blends from orbit to home with in-out-cubic and scale shrinks 1.5 → 1.
- `hit = TL + landDur×0.85 + landSt×(N−1)`: flash ring expands `r 0.6R → 2.1R`, stroke 14 → 1, fading (0.75 s `expo.out`); mark pops to 1.07 in 0.12 s, then settles with `back.out(3)` — the punctuation.
- hit + 0.2k: mark centre slides from `W/2` to its lockup position while the wordmark slides out from behind it (both `expo.inOut`, 0.85 s, word 0.04 s later).
- Whole clip: `push` 1 → 1.035 linear.
- Exit (`min(0.5, D×0.13)`): wordmark slides back behind the mark (`power3.in`), pieces scale out in reverse order with `back.in(2)` (anticipation dip before vanishing).
- `syncToBeat`: TL is moved to the nearest `studio.beat(n) − 0.45k` (n < 32, > 0.6k) to the nominal TL, so the landing phase is aligned to the beat grid.

## Adapt to the design system
- `palette` should be built from tokens: `accent, accent-2, text, muted` (it is a free-text list; the runtime does not bind it). `bgColor` → bg, `textColor` → text.
- `font` → display role; tagline uses Manrope 600 — switch to the body/caption role.
- Primitive corner radius (rounded square `c = q × 0.18`, pill) should follow the radius token: sharp systems → `c = 0`.
- 9:16: the lockup is horizontal; for vertical, place the wordmark under the mark (slide down instead of sideways), reduce `orbitR` / the 1150 px start radius (they assume 1920 wide), `markSize` ~260.
- Short (3 s): k compresses entrance/landing (min factors 0.55–0.6). Long (8 s+): timings cap at k = 1, the rest is hold with the slow push — add a tagline beat.

## Variations
- **Beat lock**: `syncToBeat` + a music marker; add a second pop on the next bar.
- **No orbit**: shapes fly straight home (skip the orbit phase, land at ~0.9 s) for a tighter 2.5 s sting.
- **Explode outro**: reverse the build — pieces morph back to primitives and fly out on the orbit.
- **Transparent watermark**: `background: transparent`, small mark, corner position.
- **Grid assemble**: replace the polar flight with pieces sliding in from the four frame edges on a grid (same morph + pop).

## Pitfalls
- MorphSVG needs `<script src="/vendor/gsap/MorphSVGPlugin.min.js">` and `gsap.registerPlugin(MorphSVGPlugin)`; morph targets must be path `d` strings.
- Positions in `render(t)` must be closed-form functions of `t` (as here) — never accumulate velocity between frames, the player seeks backwards.
- Tweened state objects (`st`) are fine because GSAP sets them on seek before `render` runs; don't read DOM positions in `render`.
- Too many pieces (> 8) make the orbit a blur and the morph unreadable.
- The flash ring colour is fixed (text colour or white) — on a light transparent overlay a white ring disappears.
- `syncToBeat` aligns the landing phase, not exactly the `hit` (the pop lands ~0.2 s after the beat with 6 pieces); compute `TL` from the hit if the pop must be on the beat.

## Reference
Reference implementation: gallery/clips/logo-shape-assemble/ (clip.js, style.css). Key snippet:

```js
pieces.forEach((pc) => {
  const t0 = 0.04 + pc.i * enterSt;
  const tLand = TL + pc.i * landSt;
  // polar flight around the stage centre
  let ang, rad, vis = 1;
  if (t < t0) { vis = 0; ang = pc.theta - 1.3; rad = 1150; }
  else if (t < t0 + enterDur) {
    const u = (t - t0) / enterDur;
    ang = pc.theta - 1.3 * (1 - eOutCubic(u));
    rad = orbitR + (1150 - orbitR) * (1 - eOutBack(u));
  } else { ang = pc.theta + omega * (t - t0 - enterDur); rad = orbitR * (1 - 0.18 * clamp((t - t0 - enterDur) / 0.8)); }
  const fx = W / 2 + Math.cos(ang) * rad, fy = cy0 + Math.sin(ang) * rad;
  // home (final) screen position of this piece's centre
  const hx = ox + pc.cx * sc, hy = oy + pc.cy * sc;
  const v = eInOut3(clamp((t - tLand) / landDur));
  const px = fx + (hx - fx) * v, py = fy + (hy - fy) * v;
  const rot = (1 - v) * pc.spin * Math.max(0, t - t0) * 0.6;
```

```js
// morphs (on the timeline)
pieces.forEach((pc) => {
  const at = TL + pc.i * landSt;
  if (pc.d) tl.to(pc.path, { morphSVG: { shape: pc.d, shapeIndex: 'auto' }, duration: landDur, ease: 'power3.inOut' }, at);
  else tl.to(pc.path, { scale: 0, transformOrigin: '50% 50%', duration: landDur, ease: 'power3.in' }, at);
});
```
