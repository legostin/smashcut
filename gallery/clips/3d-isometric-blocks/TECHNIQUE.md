# 3D Isometric Blocks

A true-isometric diorama shot with an OrthographicCamera: a base slab draws in, grid tiles pop up in a diagonal wave, rounded cubes drop onto seeded stacks that rise towards the centre, then a faceted accent gem lands above the tallest tower and floats. Soft shadows, pastel / brand / mono palettes from the design tokens. Three.js, transparent background.

## Use it for
- "Building / growth / platform / ecosystem" metaphors in tech and SaaS explainers.
- Section openers and a calm visual under a 2D headline (there is headroom above the diorama).
- Playful, clean brand worlds — the iso look is friendly and diagrammatic.

## Avoid when
- You need real perspective drama (depth, camera fly-throughs) — orthographic flattens distance.
- Specific data must be readable from the heights (use `3d-bar-chart`).
- The brand is gritty/photographic; flat pastel blocks will feel off.

## Anatomy
- `stage(root, { ortho: 10, light: 'studio', shadows: true, env: 0.5 })` — the helper's `ortho` option makes an `OrthographicCamera` 10 units tall (zoom fitted later). The key light is moved to (9, 11, 2.5), intensity 2: the two visible faces separate into the classic iso **light top / mid +x face / dark +z face**.
- Layout (seeded with `S.rng(seed × 7919)`): G × G cells (pitch 1); 30 % empty; height = `round((1 − d) × 3.2 + rand × 1.6 − 0.4)` where d = distance from centre / (G/2) — a skyline that peaks in the middle. Tallest cell carries the hero.
- Geometry: one slab `S.box(G + 0.5, 0.4, G + 0.5, 0.12)`, thin tiles per cell (`BoxGeometry(0.9, 0.1, 0.9)`), cubes `0.9³` with radius 0.1 — **one shared geometry** for every cube (cheap). Cube stacks cast + receive shadows.
- Palette: block colours = [accent, accent-2, muted, lighter accent-2] lerped toward white by 0.32 (`pastel`), 0.08 (`brand`), or shades of accent-2 (`mono`); tiles/slab from the `surface` token lightened (light plinth in pastel/mono, dark in brand).
- Hero: `OctahedronGeometry(0.55)` stretched 1.35 in y, flat-shaded accent with a faint emissive, 0.95 above the tallest stack.
- **Fit**: camera on direction (1,1,1) (true isometric, 35.26° elevation, 45° yaw). Project the points that bound what's really there — slab corners and every stack's top corners, plus the gem — into camera space (`applyMatrix4(camera.matrixWorldInverse)`; no perspective divide in ortho) and set `zoom = min(frustumW × fillW / w, frustumH × fillH / h)` (62 %/80 % in 16:9, 84 %/55 % in 9:16).

## Motion
- 0–0.7 s: slab scales up from nothing (`outExpo`).
- Tiles: start `0.35 + (i + j) × 0.035` s, scale pop 0.45 s with a soft `outBack` — a diagonal wave from the back corner.
- Cubes: start `0.8 + (i + j) × 0.05 + layer × 0.14` s; fall 2.2 units with `outExpo` (0.6 s) while scaling 0.5 → 1 — a snap that lands without bouncing through the cube below. Each stack builds bottom-up.
- Gem: after the last cube (`tLast`), drops 1.2 and scales in with soft `outBack` (0.7 s), then bobs ±0.08 (`sin(2.4 t)`) and spins 1.1 rad/s.
- Camera: isometric yaw drifts −6° → +4° over the clip (`inOutSine`), ortho zoom 0.96 → 1 (`outCubic`) — alive but still "iso".

## Adapt to the design system
- `accent` → accent (gem + some blocks), `accent2` → accent-2; muted/surface tokens are read directly with `S.color('muted' | 'surface')`.
- `palette`: `pastel` for friendly/consumer, `brand` for saturated product palettes, `mono` for a calm one-hue world with only the hero in accent.
- Radius: cube corner radius 0.1 ≈ "rounded" systems; sharp systems → `BoxGeometry` and `flat: true` materials.
- Composition: in 16:9 the diorama sits centre with space for a headline left/right; in 9:16 it fills the width with space above — put the title there.

## Variations
- **Data skyline**: heights from data instead of noise (one row per series) — a playful 3D chart.
- **City**: tall thin boxes, windows as emissive canvas textures, `bloom` for a night city.
- **Path**: a row of accent tiles lights up cell by cell (a journey/flow), the gem travels along it.
- **Loop**: blocks sink back in reverse order at the end for a seamless loop.
- **Exploded layers**: three slabs (layers of a platform) separating in y with labels on planes.

## Pitfalls
- The helper's `S.render()` closes over the camera made in `stage()` — to use an orthographic camera pass `ortho` to `stage` rather than swapping `S.camera`.
- OrthographicCamera ignores distance for size — zoom it (`camera.zoom` + `updateProjectionMatrix()`), don't dolly it.
- Fitting to the full grid bounding box at tower height leaves the diorama tiny: fit the real points (stack tops), not a box.
- Default studio key from the front lights both visible faces equally — iso then looks flat. Light from one side.
- Scaling a mesh to exactly 0 breaks shadow maps/normals — clamp to 1e-3 and hide with `visible`.
- Shadow camera of the studio rig covers ±8 units; grids beyond ~10 × 10 need wider bounds (`S.lights.key.shadow.camera`).

## Reference
Reference implementation: gallery/clips/3d-isometric-blocks/ (clip.js). Key snippet:

```js
const S = await stage(root, { ortho: 10, light: 'studio', shadows: true, env: 0.5 });
S.lights.key.position.set(9, 11, 2.5);      // iso shading: top light, +x mid, +z dark
const dir = new THREE.Vector3(1, 1, 1).normalize();
const pose = (yaw) => {
  const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(40);
  cam.position.copy(centre).add(d); S.look(centre.x, centre.y, centre.z); cam.updateMatrixWorld();
};
pose(0);
let w = 0, h = 0;                            // projected extents (ortho: no perspective divide)
for (const q of pts) { const v = q.clone().applyMatrix4(cam.matrixWorldInverse); w = Math.max(w, Math.abs(v.x) * 2); h = Math.max(h, Math.abs(v.y) * 2); }
const zoom0 = Math.min((fw * (portrait ? 0.84 : 0.62)) / w, (fh * (portrait ? 0.55 : 0.8)) / h);
```

```js
for (const q of cubes) {                     // drop + grow, wave over (i + j), layers 0.14 s apart
  const k = ease.outExpo(range(t, q.delay, q.delay + 0.6));
  q.m.visible = t >= q.delay;
  q.m.position.set(q.x, q.y + (1 - k) * 2.2, q.z);
  q.m.scale.setScalar(lerp(0.5, 1, k));
}
```
