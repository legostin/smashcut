# 3D Bar Chart

From a `label:value` list, a base plate draws out and rounded 3D bars rise one after another while value labels count up above them; one bar is in the accent colour, the rest muted, with soft shadows and a gently orbiting camera. Three.js, transparent background.

## Use it for
- KPIs, quarter-over-quarter growth, survey results, "we grew X%" moments in explainer, finance and pitch videos.
- 3–8 categories with one clear winner (the highlight is the story).
- A data beat that should feel more premium than a flat 2D chart.

## Avoid when
- Precise comparison matters (close values, many bars, negative values): perspective distorts heights — use a 2D bar chart (`bar-chart`, `infographic-bar-race`).
- More than ~10 categories (labels get tiny, especially in 9:16).
- Time series with many points — use `line-chart`.

## Anatomy
- `stage(root, { light: 'studio', fov: 30, shadows: true, env: 0.7 })`, `renderer.localClippingEnabled = true`.
- Data: `"Q1:42, Q2:58"` (comma/semicolon/newline) → `[{label, value}]`; decimals of the display = max decimals in the data; `unit` suffix.
- Layout: pitch 1.15, bar 0.72 × 0.72; `Hmax = max(2.2, 0.5 × chartWidth)` in 16:9, `1.15 × chartWidth` in 9:16 (taller bars fill a vertical frame).
- Bars: one `RoundedBoxGeometry(bw, h, bw, 4, 0.07)` **at full height** per bar; material has `clippingPlanes: [Plane(0,1,0, 0)]` + `clipShadows`. The bar *slides up through the floor* instead of scaling — rounded tops never squash.
- Base plate `S.box(chartWidth + 0.5, 0.14, …)` in the `surface` token; `S.ground()` shadow catcher just below.
- Labels: a small helper makes a `PlaneGeometry` + `CanvasTexture` (`MeshBasicMaterial`, `toneMapped: false` so colours are exact). `set(text)` redraws only when the string changes and auto-shrinks to fit. Value labels billboard (copy the camera quaternion); category labels lie flat on the plate in front of each bar (printed look).
- Highlight: `highlight` = 1-based bar index, 0 = the largest value. Accent material with a faint emissive; its value label is 15 % larger and accent-coloured.
- Camera: aimed at 42 % of `Hmax`; `fitDistance(chartWidth + 0.6, Hmax + 1.2, …)` → 66 % width (16:9) / 86 % (9:16).

## Motion
- 0–0.8 s: base plate draws out from the centre (`scale.x`, `outExpo`).
- Bar i: start `0.55 + i × min(0.2, 1.6/N)` s, 1.0 s `outCubic`, y from −h/2 (hidden below the plate) to +h/2.
- Value label: rides the bar top (+0.36), counts `value × k` in lockstep with the bar, fades in 0.1–0.4 s after the bar starts.
- Category label: fades in 0.2 s before its bar (`outCubic` 0.5 s) — the eye reads the label, then the bar answers.
- Camera: orbit arc −0.42 → −0.12 rad (`inOutSine`, whole clip) at height `target + 0.28 d`, plus a push ×1.08 → ×1 (`outCubic`, 0–3 s). Slow enough that values stay readable.

## Adapt to the design system
- `accent` → accent token, `barColor` → muted, `textColor` → text, base plate → surface token (directly via `S.mat({ color: 'surface' })`).
- Number formatting: add thousands separators / currency in `fmt()`; put currency *before* the number for $/€.
- Fonts: canvas labels use `Inter` 700/600 — swap for the design system's body/numeric family (tabular numerals stop counting jitter).
- Corporate: no clearcoat, `rough` 0.6, smaller orbit. Bold: accent bar emissive 0.3 + `bloom`.

## Variations
- **Focus pull**: after the last bar lands, dim non-highlight bars (lerp colour toward the surface) and push the camera toward the highlight.
- **Stacked bars**: two clipped boxes per category sliding up in sequence.
- **Grid of bars (3D histogram)**: a 2D grid of values, camera at a higher orbit.
- **Before/after**: two series side by side, second one in accent, rising 0.6 s later.
- **Number-first**: count the highlight value large in 2D on a layer above while the bars grow.

## Pitfalls
- Anything below a `ShadowMaterial` ground plane is hidden — it writes depth. Put labels on/above the plate, not under it.
- Billboarded labels in front of bars overlap the bar bases from a high camera — lay category labels flat on the plate instead.
- `scale.y` on a rounded box squashes the corners; use the clip-plane slide (or rebuild geometry) for growing bars.
- Clipping needs `renderer.localClippingEnabled = true` and `clipShadows: true`, or the shadow shows the full-height bar from the start.
- Canvas text must not be redrawn every frame unconditionally — cache the last string.
- Label planes are transparent with `depthWrite: false`; keep them clear of geometry or they draw over bars.

## Reference
Reference implementation: gallery/clips/3d-bar-chart/ (clip.js). Key snippet:

```js
S.renderer.localClippingEnabled = true;
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);      // keep y ≥ 0
// per bar: full-height rounded box, clipped at the floor
Object.assign(mat, { clippingPlanes: [floor], clipShadows: true });
const m = new THREE.Mesh(new RoundedBoxGeometry(bw, h, bw, 4, 0.07), mat);
```

```js
bars.forEach((b) => {
  const k = ease.outCubic(range(t, b.delay, b.delay + 1.0));
  b.m.position.y = -b.h / 2 - 0.01 + b.h * k + (k > 0 ? 0.01 : 0);  // slides up through y = 0
  b.m.visible = k > 0;
  b.val.userData.set(fmt(b.d.value * k));                           // counts with the bar
  b.val.position.set(b.m.position.x, b.h * k + 0.36, 0);
  b.val.material.opacity = range(t, b.delay + 0.1, b.delay + 0.4);
});
for (const b of bars) b.val.quaternion.copy(S.camera.quaternion);   // billboard values
```
