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

## Studio kit — start every shot from a preset

Don't light from scratch. `s3.studio(kind)` builds a complete, tuned set (backdrop, lights in W with colour temperatures, reflection probe/cards, world HDRI from Blender's bundled studio lights, colour management, EEVEE raytracing hints) in one call. Subject at the origin standing on the floor (z = 0), about 1–1.5 m tall, facing −Y (the camera side).

| preset | look | use it for |
|---|---|---|
| `white_cyc` | seamless white cyclorama, big softbox key + top + wall wash, soft contact shadows (PBR Neutral: whites white, brand colours true) | clean Apple-style packshots, devices, anything "premium-minimal" |
| `dark_luxe` | near-black seamless, halo on the wall (accent-tinted), flagged rim strips, satin reflective floor, front reflection card (AgX) | logo/word reveals in chrome/gold, luxury products, dark brands |
| `product_softbox` | classic 3-point: big softbox key, fill, two strip rims, grey sweep (PBR Neutral) | glossy/curved products — long strip highlights; neutral e-commerce look |
| `neon` | dark set, two coloured strips (`accent` / `accent-2`), coloured glows, wet floor; `tubes=True` visible neon tubes, `haze_density` volumetric haze (AgX Punchy) | tech/gaming/night energy, chrome objects |
| `sunset_window` | warm low sun through a window (window-pattern shadows on wall + floor), sunset HDRI fill | lifestyle: desk, mug, laptop, cosmetics |
| `daylight` | neutral high sun through a window, courtyard HDRI fill | editorial / lifestyle, brighter |
| `abstract_void` | infinite radial gradient void from `bg` + a touch of `accent`, soft key + accent-tinted rims (PBR Neutral); `floor='gloss'` adds a reflective stage | floating type, logos, abstract objects that must sit on the HTML clips' background colour |

```python
st = s3.studio('white_cyc', accent='accent', accent2='accent-2', backdrop=None,  # tokens / '#hex' / linear tuples
               floor=None,             # 'matte' | 'gloss' | 'mirror' (preset default otherwise)
               size=1.0, z=0.0,        # scale the whole set (lights, energies) for bigger subjects; floor height
               exposure=None, view=None, look=None,   # override colour management (else preset)
               hdri=None, hdri_strength=None, key_side='left', cards=True,
               haze_density=None, tubes=False, void=None)   # neon / abstract_void extras
st.lights['key'].data.energy *= 1.2     # names: key, fill, top, bg, rim, rim_l, rim_r, halo, a, b, glow_a, glow_b, sun, bounce, sky, rim_a, rim_b
st.dim(0.8); st.backdrop; st.extras['probe']
```
Then adjust, don't rebuild: move a light, change its energy, swap a material. `s3.flag(light, obj)` keeps a light off an object (light linking — the black flag of a real studio; presets already flag rims off the floor so there are no light pools). `s3.card(location, target, size, strength, color)` adds a reflection board (only reflections see it) when chrome/gold looks black. `s3.render_hints(exposure=…, view='AgX', look='AgX - Punchy', raytracing=True, samples_look=48…)` changes the per-stage render settings; params `view` / `look` / `exposure` in the scene manifest override at render time.

### Elements

```python
pod = s3.podium('cylinder' | 'rounded' | 'stepped' | 'pill', radius=0.7, height=0.25, material=None)  # pod['top'] = z of its top; material follows the preset
s3.turntable_rig([obj, pod], turns=0.25 | speed=30 (deg/s), t0=0, t1=None, start=-20, ease='inOutSine')  # → pivot empty
s3.reflective_floor(color, rough=0.12)                           # glossy plane + planar probe (cyc presets: floor='gloss' instead)
s3.rounded_cylinder(r, depth, round, location, material=…)      # bottles, cans, pucks;  s3.bevel(obj, width) rounds any mesh
phone = s3.phone(screen='media/ui.png' | 'media/demo.mp4' | None, height=1.6, location=(0, 0, pod['top']), frame='satin_metal', back='#2a2a2e')
s3.tablet(screen=…, height=1.6, landscape=False);  lap = s3.laptop(screen=…, width=2.0, open=105)
s3.key(s3.child(lap, 'hinge'), 'rotation_euler', t, (-angle, 0, 0))   # open the lid; parts: 'screen', 'body', 'camera', 'hinge', 'lid'
s3.screen_material(source, aspect=w/h)                           # cover-fit image/video, glossy glass on top; None → gradient wallpaper in accents
t = s3.title('LAUNCH', size=0.5, depth=0.12, family='inter', weight=800, material=s3.material('chrome'), tracking=0.04)
s3.logo('media/logo.svg', height=0.6, depth=0.08, material=s3.material('gold'))
m = s3.material('glossy_plastic', 'accent')   # glossy_plastic matte_plastic matte satin ceramic clay rubber fabric brushed_metal
                                              # satin_metal anodized chrome gold rose_gold glass frosted_glass black_glass emissive floor
                                              # overrides: rough, metal, coat, spec, sheen, transmission, ior, emissive=strength
```
Fonts: `family` = bundled inter, manrope, space-grotesk, unbounded, bebas-neue, playfair-display, jetbrains-mono (any weight that exists), or `font_path='media/Brand.otf'`.

### Framing & camera rigs (16:9 and 9:16 from the same code)

```python
cam = s3.frame([pod, phone], margin=0.1, direction=(0, -1, 0.25), lens=60, offset=(-0.2, 0))  # hero framing for the project aspect; offset = room for copy
s3.rig_dolly(subject, push=1.25, lens=60, direction=(0, -1, 0.25), margin=0.1)     # dolly-in that ENDS on hero framing (push<1 = out)
s3.rig_orbit(subject, start=-115, end=-65, lens=55, elevation=12)                   # rotation-safe distance
s3.rig_crane(subject, low=2, high=35)                                               # rises, keeps the subject framed
s3.rig_push_focus(subject, focus_from=a, focus_to=b, fstop=2.0)                     # slow push + focus pull (DOF)
s3.fit_distance(objs, lens, direction, margin) / s3.bounds(objs)                   # the maths, if you need it
```
Frame the FINAL pose, then add the animation keys (the kits do it that way). Framing reads the aspect from the project, so a vertical project gets a width-fitted camera automatically.

### Kit scenes — copy one and edit

`create_3d_scene {id, kit:'<name>', params:{…}}` writes `runtime/blender/kits/<name>.py` into scenes3d/<id>/scene.py — a lit, framed, animated shot to tune (params) or edit.

| kit | preset | shot | params |
|---|---|---|---|
| `product_hero` | white_cyc | glossy product (stand-in bottle — swap in `s3.import_model`) on a podium, slow turn + dolly-in | preset, color, label, turns, podium |
| `logo_reveal` | dark_luxe | chrome/gold word or SVG logo rises and turns in, rims sweep up, push-in | text, svg, material, family, weight |
| `phone_podium` | product_softbox | phone on a stepped podium swinging ±40°, screen = project image/video | screen, frame, back, swing, preset |
| `floating_type` | abstract_void | words at different depths pop in and drift, push-in with a focus pull | words, accent_word, family, weight |
| `neon_object` | neon | chrome ring + orb between neon tubes, wet floor, haze, orbit | tubes, haze, ring, orb |
| `lifestyle_window` | sunset_window | laptop opens on a desk next to a mug and books in window light | preset ('daylight'), screen, mug |

### Rules
- Start from a preset (or a kit), then adjust. Never stack extra lights to "fix" a preset — change energies/positions, or switch preset.
- Colours come from tokens: `accent`, `accent-2`, `bg`, `surface`, `text` (missing tokens fall back to neutral defaults). For a shot that must sit on the HTML background, use `abstract_void` (its void is built from `bg`).
- Keep `mock` cheap: presets/devices already skip HDRI, probes, cards, haze, the window gobo and bevel segments in mock; do the same with your own heavy stuff (`if ctx.quality == 'mock'`). Camera & timing stay identical across stages.
- Look renders ≈ 1.5–2 s per 1080p frame; final ≈ 3–8 s (EEVEE raytracing + jittered soft shadows).
- Chrome/gold look black → it reflects a dark world: add `s3.card(...)` in front, or use dark_luxe/neon which have cards.
- EEVEE ignores light `spread`; use `s3.flag` to keep light off surfaces. Cycles (`params.engine='cycles'`) works with every preset; the first Cycles render on a machine compiles GPU kernels (minutes) — after that it's fast.

## Helpers (time is always in seconds)

```python
import studio3d as s3

def build(ctx):                       # ctx.fps, ctx.duration, ctx.width/height, ctx.vertical, ctx.quality, ctx.params
    s3.world(ctx.color('bg'))         # design-system colours: 'bg','surface','text','muted','accent','accent-2'
    s3.light_rig('studio')            # basic rigs ('studio' | 'soft' | 'dramatic') — prefer s3.studio(...) above
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
- Light: start from `s3.studio(...)`. A rim light separates dark objects from dark backgrounds. Area lights 200–1500 W at these distances; `s3.softbox` / `s3.strip` (kelvin=…) for extra sources.
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
