---
name: studio-threejs
description: 3D as a Three.js clip — logos and type extruded in space, product turntables, abstract shapes, 3D charts, particles, glow. The default way to make 3D in Smashcut (instant preview, live params, transparent over footage, frame-exact export). Create with create_clip {template:'3d'}, build with the studio3js helpers, check with render_frame. Use Blender (studio-blender-3d) only for physics, cloth/fluids, photoreal Cycles light or heavy geometry.
---

# 3D with Three.js — a clip, not a render job

A 3D clip is an ordinary clip whose `clip.js` is an ES module using Three.js. Time is virtual, `Math.random` is seeded, so the
preview and the export match frame for frame — no render stage, no waiting: change code or params → the preview updates.

## Three.js or Blender?

| Three.js clip (default) | Blender scene (studio-blender-3d) |
|---|---|
| Logo / wordmark extruded and revealed in 3D | Physics: things falling, colliding, breaking |
| 3D titles, per-letter flips, type on a camera move | Cloth, fluids, smoke, hair |
| Product turntable from a GLB model | Photoreal product shot with caustics, Cycles GI |
| Abstract shapes, blobs, grids, isometric scenes | Heavy geometry (millions of polys), sculpted detail |
| 3D bar/pie charts, globes, data in space | Long, complex camera choreography through a set |
| Particle fields that form a shape, glow, neon | The user explicitly wants Blender |
| Anything that will be revised many times | |

Rule of thumb: if you can describe it as "shapes, type, a model, light, camera, particles" → Three.js. If it needs a simulation
or truly physical light → Blender. You can combine: a Blender render on a video track, Three.js type over it.

## Start

```
create_clip { id: 'logo3d', name: '3D logo', duration: 5, template: '3d' }
```
This writes `index.html` with an import map (`three`, `three/addons/`, `studio3js`, `opentype`) and `clip.js` as a module:

```js
import { stage } from 'studio3js';

studio.clip({
  duration: 5,
  async setup(root, p, { duration }) {
    const S = await stage(root, { light: 'studio', camera: [0, 0.4, 9], shadows: true });
    const logo = await S.svg('/p/<project>/media/logo.svg', { size: 3, depth: 0.4 });   // or S.text(...), S.model(...)
    S.scene.add(S.shadows(logo));
    S.ground({ y: -1.6 });
    return {
      render(t) {                       // pure function of t — pose everything, then draw
        logo.rotation.y = (1 - S.ease.outCubic(S.range(t, 0, 1.4))) * -Math.PI;
        S.render();
      },
    };
  },
});
```
`setup` runs again whenever params change (the helper disposes the old WebGL context for you). Everything that moves must be
set in `render(t)` from `t` alone — never accumulate state between frames (`x += …` breaks seeking and export).

## The helper (`/runtime/studio3js.js` — Read it for every option)

Study the built-in 3D techniques first (`get_technique`, category 3d): `3d-logo-extrude`, `3d-title-flythrough`, `3d-product-turntable`, `3d-particles-form`, `3d-bar-chart`, `3d-isometric-blocks` — learn the approach, then write an original clip in the project's style.

- `stage(root, { fov, camera, target, background, light, env, exposure, tone, shadows, bloom, fog })` → `S`
  - `background`: omit = transparent (composites over footage and other layers); a token (`'bg'`) or CSS colour = opaque.
  - `light`: `'studio'` (key + fill + rim, the safe default), `'soft'`, `'rim'` (accent-coloured back light, dramatic), `'neon'` (two coloured point lights, dark), `'none'` (bring your own).
  - `env`: strength of studio reflections (0.7 default) — PBR materials need it to look like anything.
  - `tone`: `'neutral'` (default — keeps brand colours exact), `'aces'`/`'agx'` (filmic, desaturates highlights).
  - `ortho: n`: an OrthographicCamera n world units tall (isometric / technical looks; zoom with `camera.zoom` + `updateProjectionMatrix()`).
  - `bloom`: `true` or `{ strength, radius, threshold=1 }` — only things brighter than lit white glow: give glowing parts `emissive` + `emissiveIntensity` 2–6. Alpha is preserved.
- `S.mat({ color, metal, rough, clearcoat, emissive, emissiveIntensity, glass, opacity, flat })` — colours take design tokens (`'accent'`, `'text'`, `'bg'`…) or CSS colours.
- `await S.text(str, { size, depth, bevel, weight, font, letterSpacing, lineHeight, align, perChar, material })` — real font outlines (Inter by default, any .ttf/.otf/.woff via `font`; not .woff2). `perChar: true` → a Group of letters, each pivoting on its own baseline centre, for staggered flips/drops. Latin + Cyrillic.
- `await S.svg(urlOrMarkup, { size, depth, bevel, layer, material | materialFor(svgColor, i) })` — a logo in 3D: one mesh per SVG path in `group.parts` (pivot = part centre, resting position in `userData.{x,y,z}`); later paths sit `layer` in front so details don't z-fight. Big circles: raise `curveSegments` (default 16) to 32. Animate parts back to `userData` positions.
- `await S.model(url)` → `{ scene, animations, at(t, name?) }` — GLB/GLTF; `at(t)` poses its animation deterministically.
- `S.particles({ count, radius | spread, size, color, seed, additive })` → `{ points, base, update((i, base, out) => …) }` — deterministic positions; move them in `render(t)` from `base`.
- `S.orbit(t, { radius, height, turns, start })`, `S.look(x,y,z)`, `S.ground({ y, opacity })` (shadow catcher, needs `shadows: true`), `S.shadows(obj)`, `S.box(w,h,d,r,mat)`.
- Pure helpers: `S.range(t, a, b)` (0→1 progress), `S.lerp`, `S.clamp01`, `S.rng(seed)`, `S.ease.*` (studio eases: `outCubic`, `outBack`, `outExpo`, `inOutCubic`…).
- Everything from Three.js is available: `import * as THREE from 'three'`, addons via `three/addons/...` (e.g. `RoundedBoxGeometry`, `LineMaterial`, `MarchingCubes`, postprocessing passes).

## Craft for 3D motion design

- **Composition first, at the first frame you'll show.** Set the camera so the hero fills ~40–60 % of the frame width (9:16: 70–80 %), inside the safe area. Check 16:9 *and* the project's real format.
- **One move at a time.** Object rotates *or* camera orbits, not both at full speed. A slow drift (`turns: 0.01–0.03`) keeps a hold alive.
- **Ease like a camera operator.** Reveals: `outExpo`/`outCubic` 0.8–1.4 s; overshoot (`outBack`) only for playful brands and small objects. Never linear on position.
- **Light tells shape.** A rim light separates dark objects from dark backgrounds; a key from above-front reads type. Avoid flat front light.
- **Materials**: brand colour = base `color` + `rough` 0.25–0.45; premium = `clearcoat` 0.5–1; metal only on secondary parts; glass sparingly (expensive, needs something behind it).
- **Depth cues**: shadow catcher (`ground`), fog for long scenes, particles/dust with additive blending, a slight camera push-in.
- **Type in 3D** must still be readable: max ~25° off-axis when it's meant to be read, `depth` ≈ 0.2–0.4 × size, bevel 0.02–0.04.
- **Hand-off to 2D**: end on a clean, front-facing hold (≥ 0.6 s) so the next scene or a title can take over.
- **Transparent background** is the default: put the 3D clip on a graphics track above footage; captions above it.

## Your workshop: npm packages

Install anything you need in the project root (`npm i <pkg>`; node_modules is git-ignored) and map it in the clip's import map:
```html
"imports": { …, "postprocessing": "../../node_modules/postprocessing/build/index.js" }
```
For packages that aren't browser ES modules, bundle: `npx esbuild src/scene.js --bundle --format=esm --outfile=clips/<id>/scene.bundle.js`
and import the bundle from `clip.js`. Keep everything inside the project folder.

## Check before you call it done

1. `render_frame` at the start, middle, end of the clip (and the exact cut points) — look at framing, colour, readability.
2. `render_clip` contact sheet for the motion arc; for 9:16 check the safe area.
3. Lint: no `Date.now()`/`performance.now()` math outside `t`, no state accumulated between frames, no unseeded randomness (use `S.rng(seed)` or the seeded `Math.random`).
4. Performance: export renders WebGL in software — keep it reasonable (≤ ~300k triangles, shadows on one light, bloom only when it matters).
