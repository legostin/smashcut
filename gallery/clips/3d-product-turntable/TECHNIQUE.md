# 3D Product Turntable

A podium rises, a product drops onto it and turns at a constant speed under a shadowed key light and two rim lights (one in the brand accent), with a glowing accent ring on the podium edge and a soft floor shadow. Built-in procedural products (a drinks can with a canvas-drawn label, or a phone with a lit screen) or any `.glb` via the `model` param. Three.js, transparent background.

## Use it for
- Product reveals, e-commerce promos, "now available" end cards, launch videos.
- A real product when you have a GLB (from the client, a 3D scan, or generated in Blender); the procedural can/phone as a stand-in or for generic "app/drink" stories.
- A packshot under a 2D headline/price on a layer above.

## Avoid when
- Photoreal product rendering is required (caustics, true GI, liquid) — render in Blender (studio-blender-3d) and composite.
- The product is very wide or flat (a laptop, a rug): a vertical turntable framing wastes the frame — use a tilted hero angle with a slow orbit instead.
- Heavy scanned models (> ~300k triangles): export renders WebGL in software — decimate first.

## Anatomy
- `stage(root, { light: 'none', fov: 28, shadows: true, env: 0.45 })` + **own light rig** (the craft is in the light):
  - key `DirectionalLight` 1.5 at (3, 6, 5), the only shadow caster (1024² map, radius 5, tight shadow camera ±2.5);
  - rim A: accent-coloured `DirectionalLight` 3.2 from back-left (−5, 2.5, −4); rim B: white 2.2 from back-right (5, 3, −4);
  - `HemisphereLight` 0.35 cool fill.
- Podium: two cylinders (top r 1.05 × 0.3, base r 1.3 × 0.16) in the `podium` (surface) colour, receive shadows; a `TorusGeometry(1.05, 0.012)` on the top edge, emissive accent 1.6 — the "light ring".
- `S.ground({ y: −0.46 })` shadow catcher under the podium.
- **Can**: `LatheGeometry` from a 14-point profile (domed base, wall, necked shoulder, rolled rim), aluminium `metal 1, rough 0.22`; an open `CylinderGeometry` sleeve (r 0.503) with a `CanvasTexture` label. Canvas aspect = circumference : height (2πr : h) so the art isn't stretched; the name runs **vertically**, twice around (it reads fully on a curved surface at any angle); ink colour picked from the accent's luminance.
- **Phone**: `S.box` body (metal), a rounded-rect `ShapeGeometry` screen (UVs normalised to 0–1) with a gradient + "9:41" canvas as `emissiveMap`, camera bump + lenses on the back.
- **GLB**: `S.model(url)` → `normalise()` scales to 2.4 units on its largest relevant axis, centres x/z, stands it on y = 0; on load failure it falls back to the procedural product.
- `spinner` group turns; the product inside keeps its own orientation/pivot.
- Framing: `fitDistance(2.7, 2.9, …)` — 36 % of width / 68 % of height in 16:9, 72 % / 50 % in 9:16; aimed at y = 1.0 (mid product).

## Motion
- 0–1.0 s: podium rises from y −0.5 and scales 0.85 → 1 (`outExpo`); the ring glows up 0.5–1.4 s (`outCubic`).
- 0.35–1.45 s: product drops 0.8 units onto the podium, scale 0.9 → 1 (`outCubic`), with an extra −1.2 rad of spin that unwinds as it lands.
- Whole clip: constant spin `spin` °/s (default 40) — linear on purpose: a turntable is a machine, easing would read as a wobble.
- Camera: slightly high three-quarter (y + 0.2 d), push-in 5 % over the clip with `inOutSine` (no visible start/stop). One move at a time: the product turns, the camera barely moves.

## Adapt to the design system
- `accent` → accent token (label, accent rim light, ring); `accent2` → accent-2 (phone screen gradient); `podium` → surface token.
- Dark brands: keep a dark podium and let the rim lights carve the silhouette. Light brands: podium in a light surface colour, rim lights weaker (1.5), key stronger.
- Label typography: the canvas uses the loaded `Inter` — in an original clip draw with the design system's display family (`studio.design.font('display')`) once fonts are loaded.
- 9:16 is handled by the fit; place the 2D headline above the product (there's ~25 % headroom).

## Variations
- **Hero orbit**: spin 0, orbit the camera 30° instead (`S.orbit(t, { turns: 0.02 })`) — for products with a "front".
- **Exploded view**: for a GLB with named parts, offset children along their normals mid-clip and bring them back.
- **Colorways**: three cans on three podiums, staggered drops, the centre one in the accent.
- **Floating**: no podium; the product bobs (`sin(t)`) with a ground shadow that scales inversely to height.
- **Beat spin**: add 45° snaps on `studio.beats` (eased 0.3 s) on top of a slow base spin.

## Pitfalls
- `S.model` URLs must be local (project media `/p/<project>/media/x.glb` or a file in the clip folder) — remote URLs fail the lint and the export.
- GLB scale/up-axis varies wildly: always normalise from the bounding box, and wrap it in a group so your animation doesn't fight its own transforms.
- Dark metal + low env looks like a black hole: give metallic parts a mid-grey base (`#7d808a`), not near-black.
- The emissive ring is not bloom — without `bloom` it is just bright; keep it thin.
- Canvas textures must be drawn in setup after fonts are ready (the runtime awaits bundled fonts before setup); never redraw per frame unless the content changes.
- Shadow camera bounds: tight (±2.5) = sharp shadow; if you scale the scene up, widen them or the shadow is cut.

## Reference
Reference implementation: gallery/clips/3d-product-turntable/ (clip.js). Key snippet:

```js
const kp = ease.outExpo(range(t, 0, 1));                 // podium rises
podium.position.y = lerp(-0.5, 0, kp);
podium.scale.setScalar(lerp(0.85, 1, kp));
ring.material.emissiveIntensity = 1.6 * ease.outCubic(range(t, 0.5, 1.4));
const kd = ease.outCubic(range(t, 0.35, 1.45));          // product lands
spinner.position.y = podium.position.y + lerp(0.8, 0, kd);
spinner.scale.setScalar(lerp(0.9, 1, kd));
spinner.visible = t >= 0.35;
spinner.rotation.y = -0.5 + spin * t + (1 - kd) * -1.2;  // constant turn + unwinding landing spin
const push = lerp(1.05, 1, ease.inOutSine(range(t, 0, D)));
S.camera.position.set(0, look.y + dist * 0.2 * push, dist * push);
S.look(look.x, look.y, look.z);
```

```js
// GLB → a product that stands on y = 0, centred, a known height
function normalise(obj, height) {
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  obj.scale.setScalar(height / Math.max(s.y, s.x * 0.8, s.z * 0.8, 1e-6));
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -b2.min.y, -c.z);
  const wrap = new THREE.Group(); wrap.add(obj); return wrap;
}
```
