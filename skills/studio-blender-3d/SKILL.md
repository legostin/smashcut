---
name: studio-blender-3d
description: 3D scenes with Blender, as code — product shots, logos and type in space, abstract 3D shapes, device mockups. Build scenes3d/<id>/scene.py with the studio3d helpers and render in stages mock → look → final. Use whenever a scene needs depth, real lighting or a camera move in 3D.
---

# 3D with Blender — scenes as code, rendered in stages

A 3D scene is `scenes3d/<id>/scene.py` with a `build(ctx)` function using `studio3d` (runtime/blender/studio3d.py — Read it for the full API). Blender renders it headless; the result becomes a video in media/ and sits on the timeline like footage (with alpha if `transparent: true`, so you can composite HTML clips/captions over or under it).

## Stages — always in this order

| stage | engine | use it for | speed |
|---|---|---|---|
| `mock` | Workbench solid, half-res | blocking: composition, scale, camera path, timing, cut points | ~0.3 s/frame |
| `look` | EEVEE | materials, light, colour from the design system | ~1 s/frame |
| `final` | EEVEE 96 samples + motion blur (or Cycles: `params.engine = 'cycles'`) | the shot that ships | 2–20 s/frame |

1. `create_3d_scene {id, name, duration, transparent?}` then write scene.py (or pass `code`).
2. `render_3d {id, quality:'mock', mode:'stills', times:[start, middle, end]}` → you get a contact sheet. LOOK at it: framing, safe areas (9:16!), readability, scale.
3. Fix → mock stills again. Then `render_3d {quality:'mock', mode:'animation', place:{start, track}}` — the user judges motion and timing in the edit.
4. `look` stills → fix materials/light → `look` animation (replaces the mock on the timeline, same position).
5. `final` animation only when the user approved the look (it takes time). Mark the scene status `review` before that and say what's left.

Keep `mock` cheap: branch on `ctx.quality` (skip high-poly imports, heavy modifiers, particles, bevel segments) — the camera and timing must stay identical across stages.

## Helpers (time is always in seconds)

```python
import studio3d as s3

def build(ctx):                       # ctx.fps, ctx.duration, ctx.width/height, ctx.vertical, ctx.quality, ctx.params
    s3.world(ctx.color('bg'))         # design-system colours: 'bg','surface','text','muted','accent','accent-2'
    s3.light_rig('studio')            # 'studio' | 'soft' | 'dramatic'; or s3.light('AREA', energy, location, target)
    s3.floor(s3.mat(ctx.color('bg'), rough=0.6), z=-0.6)          # shadow_catcher=True (Cycles) for alpha shots
    m = s3.mat(ctx.color('accent'), rough=0.3, metal=0.0)        # emission=…, emission_strength=…, transmission=1 (glass)
    box = s3.rounded_box((0.75, 0.08, 1.55), radius=0.09, material=m)
    ball = s3.sphere(0.4, (1.2, 0, 0), material=m); ring = s3.torus(1.2, 0.05)
    t = s3.text3d('LAUNCH', size=0.4, extrude=0.05, material=s3.mat(ctx.color('text')), font=ctx.media('media/Inter-Bold.ttf'))
    model = s3.import_model('media/phone.glb', scale=1.0)          # .glb/.gltf/.obj/.fbx/.usd(z)/.stl from the project
    screen = s3.image_plane('media/ui.png', height=1.4, location=(0, -0.05, 0))   # UI/screens/posters, also video files
    cam = s3.camera(lens=50, location=(0, -6, 1.5), target=(0, 0, 0), dof=2.8)
    # animation
    s3.pop(t, 0.4, 0.5, 'outBack')                 # scale in
    s3.move(box, (0, 0, -2), (0, 0, 0), 0, 0.8, 'outExpo')
    s3.rotate(box, (0, 0, -20), (0, 0, 15), 0, ctx.duration, 'inOutSine')   # degrees
    s3.turntable(model, turns=0.25, t0=0, t1=ctx.duration)
    s3.dolly(cam, (0.5, -4.5, 1.1), 0, ctx.duration, 'outCubic')
    s3.orbit(cam, radius=6, height=1.5, start=-110, end=-60, t0=0, t1=ctx.duration)
    s3.key(cam, 'data.lens', 0, 35); s3.key(cam, 'data.lens', 2, 70)        # any property
    s3.stagger([a, b, c], lambda o, t: s3.pop(o, t, 0.4), t0=0.2, each=0.08)
```

Easings: linear, in/out/inOut × Sine, Quad, Cubic, Quart, Expo, plus outBack, inOutBack, outElastic, outBounce. The ease belongs to the segment that STARTS at that key.

## Look good, fast

- Units are metres. Hero objects 0.5–2 m, camera 4–8 m away, lens 35–85 mm (product: 50–85; wide drama: 24–35). In 9:16, frame tighter and keep the hero in the middle 60% of the height.
- Light: key + fill + rim (`light_rig('studio')`). A rim light separates dark objects from dark backgrounds. Area lights energy 200–1500 W at these distances.
- Colour comes from `ctx.color(...)` so 3D matches the HTML clips; colours are converted to linear for you. Use one accent; keep backgrounds desaturated.
- Motion: one main move per shot (a slow dolly or orbit with `inOutSine`/`outCubic`) plus object secondary motion. Hold the final pose ≥ 0.5 s for a cut.
- Bevel everything you'd see in real life (`rounded_box`, `text3d(bevel=…)`): sharp CG edges look cheap. Rounded box radius is clamped to half the thinnest side.
- Text in 3D: short (1–3 words); body copy belongs in HTML clips over the render.
- Transparent renders (`transparent: true`) for objects floating over HTML backgrounds; then don't add `world()` colour expectations and avoid a floor (or use a shadow catcher with Cycles).
- Determinism: everything keyframed, no `random` without `random.seed(…)`, no simulations that aren't baked.

## Hands-on polishing

Every render saves `scenes3d/<id>/scene.blend`. The user can open it in Blender (button in the item panel) to explore; scene.py stays the source of truth — when they describe a tweak they made by hand, port it into scene.py.

## Pitfalls

- Forgetting `place` on the first animation render (it lands at 0 s on the first video track).
- Final renders before the look is approved — they are slow; the user can't iterate.
- Camera inside geometry or clipping (lens + location): check stills at the first and last frame.
- Imported models at the wrong scale/orientation: glTF is Y-up → the importer converts; check with a mock still and fix `scale`/`rotation` on the returned root.
