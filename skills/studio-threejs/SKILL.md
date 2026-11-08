---
name: studio-threejs
description: 3D as a Three.js clip — logos and type extruded in space, product shots in ready-made studio sets (white cyclorama, dark luxe, softbox, neon, daylight, gradient void), device mockups (phone / laptop / tablet / watch with your screen), podiums, camera moves, turntables, abstract shapes, 3D charts, particles, glow. The default way to make 3D in Smashcut (instant preview, live params, transparent over footage, frame-exact export). Create with create_clip {template:'3d'}, build with the studio3js helpers, check with render_frame. Use Blender (studio-blender-3d) only for physics, cloth/fluids, photoreal Cycles light or heavy geometry.
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

- `stage(root, { fov, camera, target, background, light, env, exposure, tone, shadows, bloom, fog, studio })` → `S`
  - `studio`: a complete studio set (`'white_cyc'`, `'dark_luxe'`, `'product_softbox'`, `'neon'`, `'daylight'`, `'abstract_void'` or `{ kind, …options }`) — see **Studio kit** below; replaces `light`/`env`.
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

## Studio kit — start from a professional set (`S.studio`, materials, devices, camera moves)

Don't light a product shot from scratch. One call builds a complete studio — lights, seamless backdrop, a matching
reflection environment (PMREM of softbox panels), contact shadow, tone mapping — scaled to your subject:

```js
const S = await stage(root, { fov: 30, studio: { kind: 'white_cyc', size: 2 } });   // or: await S.studio('white_cyc', { … })
const ped = S.podium({ shape: 'cylinder', radius: 1, height: 0.34, material: S.materials.mattePlastic({ color: 'surface' }) });
const phone = await S.device('phone', { height: 1.9, screen: '/p/<id>/media/app.png' });   // or .mp4, or (ctx, t, w, h) => draw
phone.position.y = ped.top + phone.size.h / 2;
S.scene.add(ped, phone);
S.frame(new THREE.Box3().setFromObject(ped).expandByObject(phone), { margin: portrait ? [0.12, 0.18] : [0.3, 0.1] });
// render(t): S.turntable(phone, t, { speed: 20 }); S.camera.move(t, { pushIn: { amount: 0.08 }, orbit: { from: -8, to: 6 } }); S.render(t);
```
The floor is at `floor` (default y = 0): stand things **on** it (podium base at 0, product on `ped.top`). `size` ≈ the
subject's size in world units (default 2) — every light, the backdrop and the shadow scale with it.

| preset | look | use for |
|---|---|---|
| `white_cyc` | seamless white cyclorama (floor sweeps into the wall, no horizon), big overhead + side softboxes, strip rims, soft contact shadow | Apple-style product heroes, tech, cosmetics, clean e-commerce |
| `dark_luxe` | dark seamless, warm/cool strip rims, soft blurred reflective floor, halo on the wall, dim front card for chrome gradients | logos / idents, watches, jewellery, premium launches |
| `product_softbox` | graphite seamless, 3-point softboxes + strip rims and a matching softbox env map → long specular highlights | glossy products, devices, cans/bottles, anything with glass or clearcoat |
| `neon` | black set, two coloured strip lights (accent / accent-2, brightness-balanced), visible tubes + bloom, coloured washes, wet floor, haze | gaming, music, night, tech promos |
| `daylight` | warm sun with soft shadows through window mullions (gobo), sky fill, warm plaster cyc | lifestyle, home, food, friendly SaaS |
| `abstract_void` | endless dithered gradient void from the `bg` token with a soft accent-2 glow, soft key + rims | floating type, logos, abstract shapes, statements |

Options (all optional): `size`, `floor`, `backdrop: false` (**transparent**: keeps lights + env + contact shadow only — for
compositing over footage), `color` (backdrop / void colour), `accent`, `accent2`, `shadow` (`false` or `{ opacity, blur, darkness, size }`),
`reflection` (`false` or `{ strength, blur, fade }`, dark_luxe/neon), `intensity` (all lights ×), `env`, `exposure`, `tone`,
`haze` (neon 0…1), `tubes` (neon), `bloom` (neon), `gobo` / `sunDir` (daylight), `rim`, `rim2`, `halo` (dark_luxe), `glowPos` (void).
The handle (`S.studioHandle`) exposes `lights.{key, fill, top, rimL, rimR, …}` (RectAreaLights you can retint / dim / animate),
`backdrop`, `reflector`, `contact`, `tubes`, `sun`. Area lights in the kit are one-sided like real softboxes.

**Materials** — `S.materials.<name>(opts)` → MeshPhysicalMaterial; `color` takes tokens, any other key overrides a property:
`glossyPlastic` (clearcoat, default accent), `mattePlastic`, `brushedMetal` (anisotropic, streaked roughness), `chrome`, `gold`,
`glass` (transmission + dispersion), `frostedGlass`, `rubber`, `fabric` (sheen), `clay`, `emissive` (`{ color, intensity }` — for bloom),
`iridescent` (thin-film). Glass costs an extra pass — one or two glass objects per shot.

**Elements**
- `S.podium({ shape: 'cylinder' | 'box' | 'stepped', radius, height, bevel, width, depth, steps, material, ring })` → Group standing on y = 0, `.top` = height of its top; `ring: 'accent'` adds a thin glowing edge ring (`.ring`).
- `await S.device(kind, opts)` — procedural `'phone' | 'tablet' | 'laptop' | 'watch'` with a glossy glass display. `screen`: image URL,
  video URL (`.mp4/.webm/.mov` — seeked to `(t − videoStart) × videoRate`, frame-exact in export), a canvas, a THREE.Texture, or a
  function `(ctx, t, w, h) => …` redrawn every frame (animate UI from `t` alone), empty = built-in UI in your tokens.
  Also `height` (laptop: `width`), `finish` (`titanium | black | silver | gold | space` | css), `band` (watch), `landscape` (tablet),
  `brightness`, `glare`, `fit` (`cover | contain | stretch`). Returns a Group (centred; laptop base on y = 0) with `.size {w,h,d}`,
  `.screen`, `await .setScreen(src)`, laptop `.setOpen(0…1)` / `.lid`.
- `S.turntable(obj, t, { speed: °/s, start: °, from: s, ramp: s })` — closed-form spin with an ease-in from rest.
- `S.contactShadow({ y, size, blur, opacity, darkness })`, `S.reflectiveFloor({ size, strength, blur, fade })`, `S.cyclorama({ … })`,
  `S.envMap({ top, horizon, bottom, panels: [{ pos, w, h, intensity, flag }] })` — the building blocks, if you assemble your own set.

**Camera** — `S.frame(objectOrBox3, { margin: n | [x, y], aspect, azimuth, elevation })` fits the camera so the whole box is in
frame with that margin (fraction of the frame per side) for the *current* format — compute margins with `portrait` in mind
(9:16: small x margin, bigger y margin). It sets the **base pose** for the moves, which are pure functions of `t`:
`S.camera.move(t, { orbit: { from: −10, to: 10 } (°), dolly: { from: 1.2, to: 1 } (× distance), pushIn: { amount: 0.08 },
crane: { from: −6, to: 12 } (° elevation, `lift` world units), whip: { at, duration: 0.45, angle: 70, out, axis: 'pan' | 'tilt' },
roll: { from, to }, drift: { amount: 0.02, speed } })` — each with `start`, `end` (default: whole clip) and `ease` (a studio
ease name or function). Shorthands: `S.camera.orbit / dolly / pushIn / crane / whip(t, opts)`. `S.camera.setBase(pos, target)`
sets a base pose by hand. Depth of field: `S.camera.dof({ focus: 'target' | distance | object, aperture, maxblur })` (BokehPass,
opaque backgrounds only, ~+0.3 s/frame). Whip pans read best with the export's motion blur on.

**Kit clips** (`gallery/kits3d/`, category `3d-kit`) — complete starters to copy and adapt:
`product-hero-white` (bottle or your .glb on a podium, white cyc) · `phone-podium` (phone mockup with your screen image/video or an animated app UI) ·
`logo-dark-luxe` (SVG logo in chrome/gold over a reflective floor, light sweep) · `type-void` (floating 3D type + satellites in a gradient void) ·
`neon-object` (object/text/logo between neon tubes that strike on) · `laptop-ui-reveal` (laptop opens, dashboard builds on screen, daylight).
Every one has a `studio` param (swap the preset) and `backdrop` (off = transparent).

**Rules for the kit**
1. Start from the preset that matches the brief, then adapt it to the design system: backdrop `color`, `accent`/`accent2`, podium
   and material colours from tokens; retint or dim `S.studioHandle.lights` rather than adding random lights.
2. Never copy a reference or a kit clip 1:1 — change the object, the move, the timing and the palette to the project.
3. One hero, one move: turntable *or* orbit at speed, a slow push-in for life; let the light do the work.
4. Frame with `S.frame` for the project's real format and check both 16:9 and 9:16 with `render_frame`.
5. Budget (software WebGL in export): a preset scene renders in ≈0.3–1.5 s per 1080p frame; reflections, glass and DOF each add a pass —
   keep to one reflective floor, ≤2 glass objects, DOF only when it tells the story.

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
