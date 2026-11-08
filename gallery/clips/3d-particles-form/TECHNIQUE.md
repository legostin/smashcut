# 3D Particles Form

Thousands of soft glowing points spiral in from a scattered cloud and converge onto the surface of a word (or a torus knot / sphere), resolving left to right; the shape holds with a gentle shimmer under a slow camera arc, then optionally blows away in a gust. Optional bloom. Three.js, transparent background.

## Use it for
- Revealing a product name, keyword, number or logo-like shape — tech, AI, data, "it all comes together" stories.
- Section transitions: the disperse at the end clears the frame for the next shot.
- Over dark footage or dark backgrounds, where additive glow reads best.

## Avoid when
- Over bright/white footage: additive points disappear into white — use normal blending and darker colours, or a solid 3D title.
- Long text: particle density per letter drops and thin strokes break up — keep to 1 word, ≤ ~8 characters (or raise `count`).
- Body-copy legibility matters more than the effect.

## Anatomy
- `stage(root, { light: 'none', env: 0, fov: 35, bloom: { strength: 0.7, radius: 0.35, threshold: 0.85 } })` — points are unlit; no lights or env needed.
- Target shape = any mesh: `S.text(word, { size: 1, depth: 0.1, bevel: 0, weight: 800, curveSegments: 6 })`, or `TorusKnotGeometry(1.1, 0.34, 240, 24)`, `SphereGeometry(1.4)`.
- `MeshSurfaceSampler(mesh).setRandomGenerator(S.rng(11)).build()` — **seeded** sampling (default uses `Math.random`); N samples, re-centred on the geometry bounds → `target[]`.
- Framing first, then the start cloud: `fitDistance` (58 % width 16:9 / 82 % 9:16), visible frame size `vh = 2 d tan(fov/2)`, `vw = vh × aspect`; `S.particles({ count: N, seed: 5, spread: [1.25 vw, 1.25 vh, min(vh, 6)] })` — `base[]` = start positions just beyond the frame edges.
- Per-particle (seeded, setup only): colour = accent → accent-2 by `x³` (mostly accent) plus 5 % white sparks (`vertexColors`); arrival delay `0.25 + (targetX/width + 0.5) × 0.9 + rand × 0.45` (left → right reading order); exit time and exit direction.
- Material (from `S.particles`, additive): `map` = 64 px canvas radial-gradient dot, `color` scalar 1.5 with bloom (stacked points pass the threshold) / 1.2 without, opacity 0.85, size ∝ shape size.

## Motion
- 0–0.6 s: cloud fades in (opacity 0 → 0.85).
- Per point: 1.7 s `inOutCubic` lerp start → target, then the in-flight point is **rotated around the y axis by (1 − k) × 2.4 rad** — a vortex that unwinds to zero exactly on arrival (no extra state, still a pure function of t).
- Resolve: left letters are complete ≈ 1.3 s, the whole word ≈ 3.3 s.
- Hold: shimmer ±0.012 units (`sin(t·2.3 + i·1.7)`, `cos(t·1.9 + i·2.3)`), scaled by arrival so only landed points breathe.
- Exit (`disperse`): per point at `D − 1.7 + (x/width + 0.5) × 0.55 + rand × 0.25`, offset along a seeded direction (rightwards + up/down + depth) by `inCubic(1.1 s) × 1.6 × width` — a gust from the left; global fade in the last 0.7 s.
- Camera: push-in ×1.12 → ×1 (`outCubic` 0–4 s) on an arc −0.22 → +0.06 rad (`inOutSine` over the clip) — parallax shows the cloud is 3D; text stays readable. Non-text shapes also self-rotate (0.35 rad/s).

## Adapt to the design system
- `accent` → accent, `accent2` → accent-2. The ratio is the `x³` curve — use `x` for 50/50, a constant for one colour.
- Calm brands: no bloom, smaller points, no swirl (`SWIRL = 0`), longer `FLY` (2.4 s). Energetic: swirl 4, `FLY` 1.1 s, more white sparks.
- Font: `S.text` accepts `font:` (a brand .ttf/.otf/.woff) — bold weights sample best.
- 9:16: the fit gives the word 82 % of width; the start cloud is computed from the visible frame, so it fills vertical frames too.

## Variations
- **Logo from SVG**: sample `S.svg(markup)` parts (merge geometries or sample each part ∝ its area).
- **Morph**: sample two targets A and B with the same N; lerp A → B mid-clip (word → number, sphere → logo).
- **Number counter**: one target per digit string, morph between them on beats.
- **Dust field**: skip the target; keep `base` + slow drift as an ambient background layer.
- **Implode reveal**: points converge to the centre first, then explode outward onto the targets (two-stage lerp).

## Pitfalls
- `MeshSurfaceSampler` uses `Math.random` unless you call `setRandomGenerator` — always seed it (and lint checks determinism).
- Additive blending on a transparent canvas: dense areas saturate to white fast — balance `opacity`, `color` scalar and `size` together (too bright → a white blob with a bloom haze over the frame; too dim → grey noise).
- `sizeAttenuation` points swirling close to the camera become big blurry discs; keep the start cloud's depth ≤ the frame height.
- Bloom radius > 0.4 washes a coloured haze over the whole transparent frame — it composites onto footage.
- Never move points by accumulating (`pos += v`); compute from `base`, `target` and `t` every frame (`p.update((i, base, out) => …)`).
- 30k points is fine in preview but each frame updates the whole buffer — keep ≤ ~15k for long clips in software render.

## Reference
Reference implementation: gallery/clips/3d-particles-form/ (clip.js). Key snippet:

```js
const sampler = new MeshSurfaceSampler(mesh).setRandomGenerator(S.rng(11)).build();
for (let i = 0; i < N; i++) { sampler.sample(v); v.sub(centre); target.set([v.x, v.y, v.z], i * 3); }
```

```js
cloud.update((i, base, out) => {
  const k = ease.inOutCubic(range(t, delay[i], delay[i] + FLY));
  const tx = target[i * 3], ty = target[i * 3 + 1], tz = target[i * 3 + 2];
  let x = lerp(base[0], tx, k), y = lerp(base[1], ty, k), z = lerp(base[2], tz, k);
  const ang = (1 - k) * SWIRL, ca = Math.cos(ang), sa = Math.sin(ang);
  [x, z] = [x * ca + z * sa, -x * sa + z * ca];           // vortex that unwinds on arrival
  const sh = 0.012 * k;
  x += Math.sin(t * 2.3 + i * 1.7) * sh; y += Math.cos(t * 1.9 + i * 2.3) * sh;
  const e = p.disperse ? ease.inCubic(range(t, exitAt[i], exitAt[i] + 1.1)) * size.x * 1.6 : 0;
  out[0] = x + dir[i * 3] * e; out[1] = y + dir[i * 3 + 1] * e; out[2] = z + dir[i * 3 + 2] * e;
});
```
