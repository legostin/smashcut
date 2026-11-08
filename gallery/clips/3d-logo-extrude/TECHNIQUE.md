# 3D Logo Extrude — Assemble

A Three.js logo sting: an SVG logo is extruded into glossy 3D, its parts fly in from deep behind the frame with a stagger and lock together while the lockup turns from a 3/4 view to front-facing, a light bar sweeps a glint across it, and it holds over a soft floor shadow. Transparent background.

## Use it for
- Brand intros/outros and logo hits over footage or a gradient background.
- Any logo that is (or can be) an SVG with 2–8 separate shapes — the separate parts are what make the "assemble" read.
- Premium/tech brands: clearcoat + glint feels like a product, not a cartoon.

## Avoid when
- The logo is one compound path (nothing to assemble) — use a single-mesh rotate-in with the same glint, or split the SVG first.
- Fine hairline or text-heavy logos: thin strokes extrude into slivers and small type gets mushy at 1080p. Simplify the mark or keep the wordmark 2D on a layer above.
- You need an exact flat brand colour: lighting shades the faces (use `colorMode: 'svg'` and check; or switch to a 2D logo technique).

## Anatomy
- `stage(root, { light: 'studio', fov: 30, shadows, env: 0.8 })` — transparent; studio key/fill/rim, one shadow-casting key.
- `S.svg(markup, { size: 4, depth, bevel: min(0.05, depth×0.15), curveSegments: 32, materialFor })` — **one mesh per SVG path** (`logo.parts`), each pivoting on its own centre, resting position in `userData.{x,y,z}`; later paths are stacked slightly forward (`layer`) so overlapping details don't z-fight.
- Materials per part: `S.mat({ rough: 0.16, clearcoat: 1, clearcoatRough: 0.06, metal: 0.05 })`. `colorMode: 'brand'` → parts cycle accent / text / accent-2 tokens; `'svg'` → the SVG's own fills.
- `rig` group wraps the logo: the whole lockup turns, parts animate inside it (two independent transforms = no maths).
- Framing: `fitDistance(w, h, fov, aspect, fillW, fillH)` — camera distance so the logo fills 40 % of the width in 16:9, 66 % in 9:16, never more than 50 % / 40 % of the height. Camera sits slightly above (`y = 0.18 × logo height`).
- Shadow catcher: `S.ground({ y: bottom − 8 % of height, opacity: 0.3 })` — the logo floats just above its shadow.
- **Glint**: a `RectAreaLight` (needs `RectAreaLightUniformsLib.init()`), a tall thin bar (`0.08 × width` by `3 × height`, tilted −0.35 rad) at z = 2.2 in front of the logo. Its mirror reflection on the flat front faces is a crisp band.
- Default SVG: a Bauhaus 3-part mark (pill, circle, quarter disc) in a 120×100 viewBox — no assets needed.

## Motion
- Parts (n = 0…N−1): start `0.15 + n × min(0.18, 0.9/N)` s, 1.3 s `outExpo` from a seeded start (pushed outward from the logo centre by 1.4–2.6 units, z −7…−11, tumbled ±0.9 rad x, ±1.2–2.2 rad y alternating sign, ±0.7 rad z), scale 0.6 → 1. Each part fades in over its first 0.3 s (far away, so it never pops).
- Lockup: rotation y −0.62 → 0 and x 0.16 → 0 over 0.2–3.4 s, `inOutCubic` — the extrusion depth is visible while the parts arrive, then it settles square to camera.
- Glint: 2.9–4.3 s, light x from −1.1 w to +1.1 w (`inOutCubic`), intensity `sin(π·s) × 30` (bump, no hard on/off).
- Camera: distance ×1.18 → ×1.0, `outCubic` 0–4 s, then −2 % linear drift to the end — the hold never freezes.
- Hold: ≈ 4.3 s → end, front-facing, readable; hand-off ready.

## Adapt to the design system
- Colour params bind to tokens: `accent` → accent, `color` → text, `accent2` → accent-2. For a real logo with its own colours use `colorMode: 'svg'`.
- Finish: rounded/soft brands → `rough` 0.3, no clearcoat; luxury → `metal: 1, rough: 0.2` on one part only; playful → `outBack` on the part flights.
- Motion tokens: if the design system has an "enter" duration, scale the 1.3 s flight and 0.18 s stagger with it.
- 9:16: handled by `fitDistance` (fills 66 % of width); a wide wordmark logo becomes small — stack mark over wordmark in the SVG for vertical.
- Over light footage the shadow catcher reads well; over dark footage turn `shadow` off and rely on the rim light.

## Variations
- **Explode out**: reverse the flight for an outro (`k` from 1 → 0 with `inCubic` in the last second).
- **Depth slice**: no xy offset, only z — parts slide forward from behind each other like a layered card.
- **Chrome**: `metal: 1, rough: 0.12`, `env: 1.2`; the glint then also reflects on curved bevels.
- **Turntable logo**: after assembly, rotate the rig a full 360° with `inOutCubic` instead of holding.
- **Beat assemble**: set each part's delay to a beat (`studio.beats[n]`) so they lock in on the music.

## Pitfalls
- `RectAreaLight` does **not** affect clearcoat — the band comes from the base layer, so keep base `rough` ≤ 0.2 or the glint turns into a vague brightening.
- A RectAreaLight emits along its −z: aim it with `lookAt` at the logo, or it lights nothing.
- `S.svg` skips `fill="none"` paths; stroked-only logos produce nothing — convert strokes to outlines first.
- Large circles need `curveSegments: 32` or the silhouette shows facets at 9:16 size.
- Per-part opacity needs one material per part (`materialFor` creates them); toggle `transparent` only while fading or sorting artifacts appear in the hold.
- SVG viewBox with transforms/`<use>` may not parse cleanly — flatten in the export.

## Reference
Reference implementation: gallery/clips/3d-logo-extrude/ (clip.js). Key snippet:

```js
parts.forEach((m, n) => {
  const f = flights[n], u = m.userData;
  const k = ease.outExpo(range(t, f.delay, f.delay + 1.3));
  m.position.set(lerp(u.x + f.from.x, u.x, k), lerp(u.y + f.from.y, u.y, k), lerp(u.z + f.from.z, u.z, k));
  m.rotation.set(f.rot.x * (1 - k), f.rot.y * (1 - k), f.rot.z * (1 - k));
  m.scale.setScalar(lerp(0.6, 1, k));
  const op = range(t, f.delay, f.delay + 0.3);
  m.material.opacity = op; m.material.transparent = op < 1; m.visible = op > 0;
});
const turn = ease.inOutCubic(range(t, 0.2, 3.4));
rig.rotation.set(lerp(0.16, 0, turn), lerp(-0.62, 0, turn), 0);
const s = range(t, 2.9, 4.3);                                   // glint
sweep.position.set(lerp(-size.x * 1.1, size.x * 1.1, ease.inOutCubic(s)), size.y * 0.1, 2.2);
sweep.lookAt(sweep.position.x * 0.3, 0, 0);
sweep.intensity = Math.sin(Math.PI * s) * 30;
```
