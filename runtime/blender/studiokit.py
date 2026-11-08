"""
studiokit — the studio kit for Smashcut Blender scenes. Everything here is re-exported by studio3d, so scenes use it as s3.*:

    s3.studio('white_cyc')                      # a complete, lit studio set in one call (see PRESETS)
    s3.podium('cylinder', radius=0.7, height=0.25)
    phone = s3.phone(screen='media/ui.png', height=1.6, location=(0, 0, 0.25))
    s3.turntable_rig(phone, turns=0.25, ease='inOutSine')
    s3.material('chrome')                      # material library (MATERIALS)
    cam = s3.frame(phone, margin=0.12)          # hero framing for the project aspect (16:9 / 9:16)
    s3.rig_push_focus(...), s3.rig_orbit(...), s3.rig_dolly(...), s3.rig_crane(...)

Conventions: metres, Z up, the floor is z=0 (pass z=… to move it), the subject sits at the origin and faces -Y (the camera side).
Presets write render hints (colour management, EEVEE raytracing, samples) that run.py applies per stage, so `mock` stays cheap.
"""
import bpy, bmesh, math, os, json
from mathutils import Vector, Matrix
import studio3d as s3

__all__ = [
    'studio', 'PRESETS', 'render_hints', 'col', 'mix', 'kelvin', 'env_world', 'hdri_path', 'softbox', 'strip', 'cyclorama',
    'reflective_floor', 'haze', 'window_gobo', 'podium', 'turntable_rig', 'material', 'MATERIALS', 'screen_material',
    'phone', 'tablet', 'laptop', 'child', 'font', 'title', 'logo', 'bounds', 'fit_distance', 'frame', 'rig_orbit',
    'rig_dolly', 'rig_crane', 'rig_push_focus', 'quality', 'bevel', 'rounded_cylinder', 'flag', 'Studio', 'card', 'TOKEN_DEFAULTS',
]

_DEFAULTS = {}  # set by studio(): e.g. a podium material that suits the set
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------- small utils
def quality():
    return s3.CTX.quality if s3.CTX else 'look'

def _mock():
    return quality() == 'mock'

TOKEN_DEFAULTS = {'accent': '#3d6bff', 'accent-2': '#ff5f8f', 'bg': '#0e0f13', 'surface': '#e8e6e1', 'text': '#f4f4f6', 'muted': '#8a8f98'}

def col(c, fallback=None):
    """colour from a design token name ('accent'), a '#hex' (sRGB) or a linear (r,g,b[,a]) tuple → linear RGBA.
    A token the project's design system lacks falls back to `fallback`, else a tasteful default (TOKEN_DEFAULTS)."""
    if c is None: c = fallback if fallback is not None else '#888888'
    if isinstance(c, str):
        if c.startswith('#'): return s3.hexcolor(c)
        fb = fallback if isinstance(fallback, str) and fallback.startswith('#') else TOKEN_DEFAULTS.get(c, '#888888')
        return s3.CTX.color(c, fb) if s3.CTX else s3.hexcolor(fb)
    c = tuple(float(v) for v in c)
    return c if len(c) == 4 else (c[0], c[1], c[2], 1.0)

def _to_srgb(c):
    return [12.92 * v if v <= 0.0031308 else 1.055 * (max(v, 0) ** (1 / 2.4)) - 0.055 for v in c[:3]]

def _to_lin(c):
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c[:3]]

def mix(a, b, t, linear=False):
    """blend two colours (tokens / #hex / tuples); perceptual (sRGB-space, like a design tool) unless linear=True"""
    a, b = col(a), col(b)
    if linear: return tuple(a[i] + (b[i] - a[i]) * t for i in range(3)) + (1.0,)
    sa, sb = _to_srgb(a), _to_srgb(b)
    return tuple(_to_lin([sa[i] + (sb[i] - sa[i]) * t for i in range(3)])) + (1.0,)

def _lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def kelvin(k):
    """approximate linear RGB of a black body at k Kelvin (normalised, for tinting)"""
    t = k / 100.0
    r = 255 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    srgb = [max(0, min(255, v)) / 255 for v in (r, g, b)]
    lin = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb]
    if k != 6500:  # normalised so 6500 K is exactly neutral white
        ref = kelvin(6500); lin = [a / b for a, b in zip(lin, ref)]
    m = max(lin)
    return tuple(v / m for v in lin)

def render_hints(**kw):
    """per-scene render settings run.py applies after build(): view ('AgX'|'Filmic'|'Khronos PBR Neutral'|'Standard'), look
    ('AgX - Medium High Contrast'…), exposure, gamma, raytracing (True | 'final'), fast_gi, samples_look, samples_final,
    soft_shadows (jittered area shadows in final), volumetrics, cycles_samples. Returns the merged dict."""
    sc = bpy.context.scene
    try: h = json.loads(sc.get('s3_hints') or '{}')
    except Exception: h = {}
    h.update({k: v for k, v in kw.items() if v is not None})
    sc['s3_hints'] = json.dumps(h)
    return h

def _link(o):
    bpy.context.scene.collection.objects.link(o)
    return o

def _aim(o, target, up='Y'):
    """rotate o so its -Z looks at target (lights/cameras convention)"""
    t = Vector(target.location if isinstance(target, bpy.types.Object) else target)
    d = t - Vector(o.location)
    if d.length < 1e-6: return o
    o.rotation_mode = 'XYZ'
    o.rotation_euler = d.to_track_quat('-Z', up).to_euler()
    return o

def _nodes(idblock):
    if idblock.node_tree is None: idblock.use_nodes = True
    return idblock.node_tree

def _no_camera(o, glossy=True):
    for a, v in (('visible_camera', False), ('visible_glossy', glossy)):
        if hasattr(o, a): setattr(o, a, v)
    return o

def _mesh_obj(name, bm, materials=(), smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    for m in materials:
        if m is not None: me.materials.append(m)
    return _link(bpy.data.objects.new(name, me))

def _bevel_mod(o, width, segments=3, angle=30, harden=True):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = width; m.segments = max(1, segments if not _mock() else min(segments, 2))
    m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    if hasattr(m, 'harden_normals'): m.harden_normals = harden
    if hasattr(m, 'miter_outer'): m.miter_outer = 'MITER_ARC'
    return m

def bevel(obj, width, segments=3, angle=30):
    """bevel modifier limited by angle (harden normals: flat faces stay flat) — round off the edges of any mesh"""
    return _bevel_mod(obj, width, segments, angle)

def rounded_cylinder(radius=0.3, depth=1.0, round=0.08, location=(0, 0, 0), rotation=(0, 0, 0), material=None, vertices=128):
    """cylinder with softly rounded rims (bottles, cans, pucks, buttons)"""
    o = s3.cylinder(radius, depth, location, rotation, material, 48 if _mock() else vertices)
    _bevel_mod(o, min(round, radius * 0.95, depth * 0.49), 8)
    return o

# ---------------------------------------------------------------- world / HDRI
def hdri_path(name):
    """resolve an HDRI: a path, a project file ('media/x.hdr') or one of Blender's bundled studio lights
    ('studio', 'city', 'courtyard', 'forest', 'interior', 'night', 'sunrise', 'sunset'). None if missing."""
    if not name: return None
    cands = [name]
    if s3.CTX and not os.path.isabs(name): cands.append(s3.CTX.media(name))
    base = ''
    try: base = bpy.utils.system_resource('DATAFILES', path='studiolights/world')
    except Exception: pass
    if not base:
        base = os.path.join(bpy.utils.resource_path('LOCAL'), 'datafiles', 'studiolights', 'world')
    stem = name if name.lower().endswith(('.exr', '.hdr')) else name + '.exr'
    cands.append(os.path.join(base, stem))
    for c in cands:
        if c and os.path.isfile(c): return c
    return None

def env_world(background='#101014', hdri='studio', strength=0.4, rotation=0.0, bg_strength=1.0, gradient=None):
    """World: an HDRI lights the scene and shows in reflections, while the camera sees `background` (a colour), or
    `gradient` = (center, edge[, 'radial'|'vertical']) — a screen-space gradient void. Falls back to a plain colour world
    when the HDRI is missing."""
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    nt = _nodes(w); nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bgc = col(background)
    w.color = bgc[:3]  # Workbench (mock) background
    cam_bg = nt.nodes.new('ShaderNodeBackground'); cam_bg.inputs['Strength'].default_value = bg_strength
    cam_bg.inputs['Color'].default_value = bgc
    if gradient:
        c0, c1 = col(gradient[0]), col(gradient[1])
        kind = gradient[2] if len(gradient) > 2 else 'radial'
        w.color = mix(c0, c1, 0.5)[:3]
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation = 'EASE'
        ramp.color_ramp.elements[0].color = c0; ramp.color_ramp.elements[1].color = c1
        if kind == 'vertical':
            sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(tc.outputs['Window'], sep.inputs[0])
            inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
            nt.links.new(sep.outputs['Y'], inv.inputs[1]); nt.links.new(inv.outputs[0], ramp.inputs['Fac'])
            ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[1].position = 1.0
        else:
            # radial from the frame centre, aspect-corrected
            ax = (s3.CTX.width / s3.CTX.height) if s3.CTX else 16 / 9
            mp.inputs['Location'].default_value = (-0.5 * ax, -0.5, 0)
            mp.inputs['Scale'].default_value = (ax, 1, 1)
            nt.links.new(tc.outputs['Window'], mp.inputs['Vector'])
            ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
            nt.links.new(mp.outputs['Vector'], ln.inputs[0])
            sc = nt.nodes.new('ShaderNodeMath'); sc.operation = 'MULTIPLY'; sc.inputs[1].default_value = 1.0 / max(ax * 0.5, 0.5) if ax < 1 else 1.0
            nt.links.new(ln.outputs['Value'], sc.inputs[0]); nt.links.new(sc.outputs[0], ramp.inputs['Fac'])
            ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[1].position = 0.95
        nt.links.new(ramp.outputs['Color'], cam_bg.inputs['Color'])
    p = hdri_path(hdri) if hdri and not _mock() else None
    if p:
        env = nt.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(p, check_existing=True)
        tc2 = nt.nodes.new('ShaderNodeTexCoord'); mp2 = nt.nodes.new('ShaderNodeMapping')
        mp2.inputs['Rotation'].default_value = (0, 0, math.radians(rotation))
        nt.links.new(tc2.outputs['Generated'], mp2.inputs['Vector']); nt.links.new(mp2.outputs['Vector'], env.inputs['Vector'])
        light_bg = nt.nodes.new('ShaderNodeBackground'); light_bg.inputs['Strength'].default_value = strength
        nt.links.new(env.outputs['Color'], light_bg.inputs['Color'])
        lp = nt.nodes.new('ShaderNodeLightPath')
        mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs['Fac'])
        nt.links.new(light_bg.outputs['Background'], mx.inputs[1])
        nt.links.new(cam_bg.outputs['Background'], mx.inputs[2])
        nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    else:
        nt.links.new(cam_bg.outputs['Background'], out.inputs['Surface'])
    return w

# ---------------------------------------------------------------- lights
def softbox(energy=500, location=(-2.5, -2.5, 3), target=(0, 0, 0.5), size=(1.5, 1.0), kelvin=5600, color=None,
            shape='RECTANGLE', spread=None, name='softbox', jitter=True):
    """rectangular area light aimed at target. size=(w, h) in metres (h runs 'up' the light), energy in W, kelvin = colour
    temperature (color= overrides / tints). spread (degrees, <180) = a honeycomb grid: tighter falloff."""
    ld = bpy.data.lights.new(name, 'AREA')
    ld.energy = energy; ld.shape = shape
    sz = size if isinstance(size, (tuple, list)) else (size, size)
    ld.size = sz[0]
    if shape in ('RECTANGLE', 'ELLIPSE'): ld.size_y = sz[1]
    if color is not None:
        ld.color = col(color)[:3]
    elif kelvin:
        ld.color = globals()['kelvin'](kelvin)  # own curve: 6500 K = neutral (Blender's runs slightly magenta)
    if spread is not None and hasattr(ld, 'spread'): ld.spread = math.radians(spread)
    if hasattr(ld, 'use_shadow_jitter'): ld['s3_jitter'] = bool(jitter)
    lo = _link(bpy.data.objects.new(name, ld)); lo.location = location
    _aim(lo, target)
    _no_camera(lo)
    return lo

def card(location=(0, -4.5, 3.2), target=(0, 0, 0.8), size=(5.0, 2.4), strength=1.5, color='#ffffff', gradient=True, name='card'):
    """reflection card: an emissive board only reflections see (invisible to the camera, no shadows) — gives chrome, gold,
    glass and glossy paint something to mirror, like the white/black boards around a real product set. gradient=True fades
    it from the top edge down (graded highlights instead of a flat slab)."""
    if _mock(): return None
    bpy.ops.mesh.primitive_plane_add(size=1)
    o = bpy.context.active_object; o.name = name
    o.scale = (size[0], size[1], 1); o.location = location
    d = Vector(target) - Vector(location)
    o.rotation_mode = 'XYZ'; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    m = bpy.data.materials.new(name); nt = _nodes(m)
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    c = col(color)
    if gradient:
        tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'EASE'
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1); ramp.color_ramp.elements[1].color = c
        ramp.color_ramp.elements[0].position = 0.05; ramp.color_ramp.elements[1].position = 0.95
        nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    else:
        em.inputs['Color'].default_value = c
    outn = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    nt.links.new(em.outputs[0], outn.inputs['Surface'])
    o.data.materials.append(m)
    for a, v in (('visible_camera', False), ('visible_shadow', False), ('visible_diffuse', False)):
        if hasattr(o, a): setattr(o, a, v)
    return o

def flag(light, *objs):
    """like a black flag/gobo in a real studio: `light` no longer illuminates objs (light linking, EEVEE + Cycles) —
    e.g. keep rim strips off the floor so they only draw edges on the product."""
    if not hasattr(light, 'light_linking'): return light
    coll = light.light_linking.receiver_collection
    if coll is None:
        coll = bpy.data.collections.new(light.name + '_flag'); light.light_linking.receiver_collection = coll
    for o in objs:
        if o is not None and o.name not in coll.objects: coll.objects.link(o)
    for co in coll.collection_objects: co.light_linking.link_state = 'EXCLUDE'
    return light

def _spot(energy, location, target, angle=60, blend=1.0, color=None, kelvin_=None, radius=0.3, name='spot'):
    """soft spot light (halo / pool of light). angle = cone (degrees), blend 0..1 = edge softness"""
    ld = bpy.data.lights.new(name, 'SPOT'); ld.energy = energy
    ld.spot_size = math.radians(angle); ld.spot_blend = blend; ld.shadow_soft_size = radius
    ld.color = col(color)[:3] if color is not None else (kelvin(kelvin_) if kelvin_ else (1, 1, 1))
    lo = _link(bpy.data.objects.new(name, ld)); lo.location = location
    _aim(lo, target)
    return lo

def strip(energy=400, location=(2.5, 2.0, 1.5), target=(0, 0, 0.6), length=2.4, width=0.22, kelvin=6500, color=None, spread=None, name='strip'):
    """strip softbox (long thin area light) — the long specular highlights on glossy/curved products, rims and edges"""
    return softbox(energy, location, target, (width, length), kelvin, color, 'RECTANGLE', spread, name)

# ---------------------------------------------------------------- set pieces
def cyclorama(color='#f2f2f2', floor_rough=0.7, wall_rough=None, wall_color=None, spec=0.5, material=None, depth=4.5, radius=3.0,
              width=60.0, height=24.0, front=30.0, z=0.0, segments=40, name='cyc'):
    """seamless cyc: floor sweeping up into a back wall (wall at y=depth, curve radius `radius`). The material blends
    floor → wall across the sweep (floor_rough → wall_rough, color → wall_color), so a glossy floor never shows a seam.
    material= overrides. UVs: u across, v along the profile."""
    y0 = depth - radius
    prof = [(-front, 0.0)]
    for f in (0.55, 0.85):  # extra floor rows near the sweep keep smooth shading clean
        prof.append((-front + (y0 + front) * f, 0.0))
    prof.append((y0, 0.0)); i_a = len(prof) - 1
    for i in range(1, segments + 1):
        a = (math.pi / 2) * i / segments
        prof.append((y0 + radius * math.sin(a), radius - radius * math.cos(a)))
    i_b = len(prof) - 1
    prof.append((depth, radius + (height - radius) * 0.35)); prof.append((depth, height))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    L = [0.0]
    for i in range(1, len(prof)): L.append(L[-1] + math.dist(prof[i], prof[i - 1]))
    left = [bm.verts.new((-width / 2, y, zz + z)) for y, zz in prof]
    right = [bm.verts.new((width / 2, y, zz + z)) for y, zz in prof]
    for i in range(len(prof) - 1):
        f = bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
        for lp, (u, v) in zip(f.loops, ((0, L[i]), (1, L[i]), (1, L[i + 1]), (0, L[i + 1]))):
            lp[uv].uv = (u, v / L[-1])
    if material is None:
        c0 = col(color); c1 = col(wall_color) if wall_color is not None else c0
        wr = floor_rough if wall_rough is None else wall_rough
        material = globals()['material']('matte', c0, rough=floor_rough, spec=spec, name=name)
        if (wr != floor_rough or c1 != c0) and not _mock():
            nt = material.node_tree; p = nt.nodes.get('Principled BSDF')
            tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(tc.outputs['UV'], sep.inputs[0])
            mr = nt.nodes.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
            mr.inputs['From Min'].default_value = L[i_a] / L[-1]; mr.inputs['From Max'].default_value = (L[i_a] + 0.8 * (L[i_b] - L[i_a])) / L[-1]
            nt.links.new(sep.outputs['Y'], mr.inputs['Value'])
            if wr != floor_rough:
                rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = floor_rough; rr.inputs['To Max'].default_value = wr
                nt.links.new(mr.outputs['Result'], rr.inputs['Value']); nt.links.new(rr.outputs['Result'], p.inputs['Roughness'])
            if c1 != c0:
                mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
                mx.inputs['A'].default_value = c0; mx.inputs['B'].default_value = c1
                nt.links.new(mr.outputs['Result'], mx.inputs['Factor']); nt.links.new(mx.outputs['Result'], p.inputs['Base Color'])
    return _mesh_obj(name, bm, [material])

def material_(kind, color=None, **kw):
    return material(kind, color, **kw)

def reflective_floor(color='#111114', rough=0.12, size=60, z=0.0, probe=True, name='floor'):
    """glossy floor plane + planar reflection probe (EEVEE mirror-quality reflections). rough 0.02 mirror … 0.3 satin"""
    m = material('floor', color, rough=rough)
    p = s3.plane(size, (0, 0, z), material=m); p.name = name
    if probe: _planar_probe(z, size)
    return p

def _planar_probe(z=0.0, size=30):
    if _mock(): return None
    lp = bpy.data.lightprobes.new('floor_probe', 'PLANE')
    o = _link(bpy.data.objects.new('floor_probe', lp))
    o.location = (0, 0, z + 0.0005); o.scale = (size / 2, size / 2, 1)
    return o

def _sphere_probe(center=(0, 0, 1.0), radius=8.0):
    """reflection probe: glossy/chrome objects reflect the actual set (cyc, walls) instead of only the world HDRI"""
    if _mock(): return None
    lp = bpy.data.lightprobes.new('set_probe', 'SPHERE')
    if hasattr(lp, 'influence_distance'): lp.influence_distance = radius
    o = _link(bpy.data.objects.new('set_probe', lp)); o.location = center
    return o

def haze(density=0.02, color=(1, 1, 1), size=(16, 16, 8), center=(0, 0, 3.5), anisotropy=0.35):
    """volumetric haze box (light beams / atmosphere). Skipped in mock (Workbench would draw a solid box)."""
    if _mock() or density <= 0: return None
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.active_object; o.name = 'haze'; o.scale = size
    m = bpy.data.materials.new('haze'); nt = _nodes(m)
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density
    vol.inputs['Color'].default_value = col(color)
    if 'Anisotropy' in vol.inputs: vol.inputs['Anisotropy'].default_value = anisotropy
    outn = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    nt.links.new(vol.outputs[0], outn.inputs['Volume'])
    o.data.materials.append(m)
    for a in ('visible_shadow',):
        if hasattr(o, a): setattr(o, a, False)
    render_hints(volumetrics=True)
    return o

def window_gobo(sun_dir, through=(0, 0, 1.0), distance=5.0, opening=(2.2, 3.0), panes=(2, 3), mullion=0.07, size=40, name='window'):
    """a window-shaped shadow caster ('gobo') between the sun and the set, invisible to the camera: the sun projects a
    window pattern on the floor/wall/subject. sun_dir = direction the light travels (from sun to set)."""
    if _mock(): return None
    d = Vector(sun_dir).normalized()
    W, H = opening; nx, ny = panes; mh = mullion / 2
    xs = sorted(set([-size / 2, size / 2, -W / 2, W / 2] + [(-W / 2 + W * i / nx) + s for i in range(1, nx) for s in (-mh, mh)]))
    ys = sorted(set([-size / 2, size / 2, -H / 2, H / 2] + [(-H / 2 + H * i / ny) + s for i in range(1, ny) for s in (-mh, mh)]))
    bm = bmesh.new()
    V = [[bm.verts.new((x, y, 0)) for x in xs] for y in ys]
    pane_x = [(-W / 2 + W * i / nx + (mh if i else 0), -W / 2 + W * (i + 1) / nx - (mh if i < nx - 1 else 0)) for i in range(nx)]
    pane_y = [(-H / 2 + H * i / ny + (mh if i else 0), -H / 2 + H * (i + 1) / ny - (mh if i < ny - 1 else 0)) for i in range(ny)]
    def open_cell(x0, x1, y0, y1):
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        return any(a - 1e-6 <= cx <= b + 1e-6 for a, b in pane_x) and any(a - 1e-6 <= cy <= b + 1e-6 for a, b in pane_y)
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            if not open_cell(xs[i], xs[i + 1], ys[j], ys[j + 1]):
                bm.faces.new((V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]))
    o = _mesh_obj(name, bm, [], smooth=False)
    o.location = Vector(through) - d * distance
    o.rotation_mode = 'XYZ'; o.rotation_euler = (-d).to_track_quat('Z', 'Y').to_euler()
    _no_camera(o, glossy=False)
    for a in ('visible_diffuse', 'visible_transmission', 'visible_volume_scatter'):
        if hasattr(o, a): setattr(o, a, False)
    return o

def podium(kind='cylinder', radius=0.7, height=0.25, material=None, location=(0, 0, 0), steps=3, bevel=0.015, size=None, name='podium'):
    """display pedestal standing on the floor. kind: 'cylinder' | 'rounded' (rounded box, size=(x,y,z)) | 'stepped'
    (stacked discs) | 'pill' (soft round-edged disc). Returns the object; obj['top'] = world z of its top surface."""
    m = material or (_DEFAULTS['podium']() if _DEFAULTS.get('podium') else material_('matte', '#e6e6e6'))
    x, y, z0 = location
    if kind == 'rounded':
        sx, sy, sz = size or (radius * 2, radius * 2, height)
        o = s3.rounded_box((sx, sy, sz), radius=min(0.06, sz * 0.3), location=(x, y, z0 + sz / 2), material=m)
        top = z0 + sz
    elif kind == 'stepped':
        parts, zz = [], z0
        hstep = height / steps
        for i in range(steps):
            r = radius * (1 - 0.18 * i)
            c = s3.cylinder(r, hstep, (x, y, zz + hstep / 2), material=m, vertices=48 if _mock() else 128)
            _bevel_mod(c, min(bevel, hstep * 0.3), 3); parts.append(c); zz += hstep
        o = parts[0]
        for p in parts[1:]:
            p.parent = o; p.location = (p.location.x - x, p.location.y - y, p.location.z - o.location.z)
        top = zz
    else:
        o = s3.cylinder(radius, height, (x, y, z0 + height / 2), material=m, vertices=48 if _mock() else 128)
        _bevel_mod(o, min(height * 0.45, radius * 0.3) if kind == 'pill' else min(bevel, height * 0.3), 6 if kind == 'pill' else 3)
        top = z0 + height
    o.name = name; o['top'] = top
    return o

def turntable_rig(objs, turns=None, speed=None, t0=0.0, t1=None, ease='linear', axis='z', start=0.0, pivot=None):
    """rotate objects (and e.g. their podium) about a common vertical axis by time. turns (default 1) over t0..t1 or speed in
    deg/s. Parents the objects to a pivot empty at their footprint centre (keeps their world transform). Returns the pivot."""
    objs = objs if isinstance(objs, (list, tuple)) else [objs]
    t1 = (s3.CTX.duration if s3.CTX else 5.0) if t1 is None else t1
    bpy.context.view_layer.update()
    lo, hi = bounds(objs)
    pv = s3.empty(pivot if pivot is not None else ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z), 'turntable')
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = pv; o.matrix_parent_inverse = pv.matrix_world.inverted()
        o.matrix_world = mw
    total = speed * (t1 - t0) if speed is not None else 360.0 * (1.0 if turns is None else turns)
    i = 'xyz'.index(axis)
    r0 = [0.0, 0.0, 0.0]; r0[i] = start
    r1 = list(r0); r1[i] = start + total
    s3.key(pv, 'rotation_euler', t0, r0, ease); s3.key(pv, 'rotation_euler', t1, r1, ease)
    return pv

# ---------------------------------------------------------------- materials
MATERIALS = {
    # name: (default colour, principled settings)
    'glossy_plastic': ('accent', dict(rough=0.14, coat=0.6, coat_rough=0.04, spec=0.5)),
    'matte_plastic': ('surface', dict(rough=0.55, spec=0.4)),
    'matte': ('#e8e8e8', dict(rough=0.65, spec=0.3)),
    'satin': ('surface', dict(rough=0.32, spec=0.5)),
    'ceramic': ('#f4f2ee', dict(rough=0.25, coat=1.0, coat_rough=0.03)),
    'clay': ('#d9cfc3', dict(rough=0.82, spec=0.25)),
    'rubber': ('#1c1c1e', dict(rough=0.72, spec=0.25)),
    'fabric': ('surface', dict(rough=0.95, sheen=0.9, spec=0.15, weave=True)),
    'brushed_metal': ((0.62, 0.63, 0.65, 1), dict(metal=1.0, rough=0.3, brushed=True)),
    'satin_metal': ((0.62, 0.63, 0.65, 1), dict(metal=1.0, rough=0.38)),
    'anodized': ('accent', dict(metal=1.0, rough=0.34)),
    'chrome': ((0.92, 0.93, 0.95, 1), dict(metal=1.0, rough=0.035)),
    'gold': ((1.0, 0.71, 0.29, 1), dict(metal=1.0, rough=0.16)),
    'rose_gold': ((0.97, 0.62, 0.52, 1), dict(metal=1.0, rough=0.2)),
    'glass': ((1, 1, 1, 1), dict(rough=0.0, transmission=1.0, ior=1.5)),
    'frosted_glass': ((1, 1, 1, 1), dict(rough=0.32, transmission=1.0, ior=1.5)),
    'black_glass': ((0.004, 0.004, 0.005, 1), dict(rough=0.04, spec=0.5, coat=0.4, coat_rough=0.02)),
    'emissive': ('accent', dict(rough=0.4, emissive=6.0)),
    'floor': ('#111114', dict(rough=0.12)),
}

def material(kind='glossy_plastic', color=None, name=None, **over):
    """material library: MATERIALS keys (glossy_plastic, matte_plastic, matte, satin, ceramic, clay, rubber, fabric,
    brushed_metal, satin_metal, anodized, chrome, gold, rose_gold, glass, frosted_glass, black_glass, emissive, floor).
    color = token name / '#hex' / linear tuple (default per material). over: rough, metal, coat, coat_rough, spec, sheen,
    transmission, ior, emissive (strength), brushed, weave, alpha."""
    base_col, s = MATERIALS.get(kind, MATERIALS['glossy_plastic'])
    s = dict(s); s.update(over)
    c = col(color if color is not None else base_col)
    m = bpy.data.materials.new(name or kind)
    nt = _nodes(m)
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = c
    p.inputs['Roughness'].default_value = s.get('rough', 0.4)
    p.inputs['Metallic'].default_value = s.get('metal', 0.0)
    if 'spec' in s and 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = s['spec']
    if s.get('coat') and 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = s['coat']; p.inputs['Coat Roughness'].default_value = s.get('coat_rough', 0.03)
    if s.get('sheen') and 'Sheen Weight' in p.inputs:
        p.inputs['Sheen Weight'].default_value = s['sheen']; p.inputs['Sheen Roughness'].default_value = 0.4
        p.inputs['Sheen Tint'].default_value = mix(c, (1, 1, 1, 1), 0.6)
    if s.get('transmission'):
        p.inputs['Transmission Weight'].default_value = s['transmission']
        p.inputs['IOR'].default_value = s.get('ior', 1.5)
        for a, v in (('use_raytrace_refraction', True), ('use_transparent_shadow', True), ('thickness_mode', 'SPHERE')):
            if hasattr(m, a):
                try: setattr(m, a, v)
                except Exception: pass
        render_hints(raytracing=True)
    if s.get('emissive'):
        p.inputs['Emission Color'].default_value = c
        p.inputs['Emission Strength'].default_value = s['emissive']
    if s.get('alpha', 1.0) < 1.0:
        p.inputs['Alpha'].default_value = s['alpha']
    if (s.get('brushed') or s.get('weave')) and not _mock():
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        bump = nt.nodes.new('ShaderNodeBump')
        if s.get('brushed'):
            nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 4.0
            if 'Detail' in nz.inputs: nz.inputs['Detail'].default_value = 8.0
            mp.inputs['Scale'].default_value = (1.0, 260.0, 260.0)  # streaks along X
            nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
            nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
            bump.inputs['Strength'].default_value = 0.08; bump.inputs['Distance'].default_value = 0.002
        else:
            w1 = nt.nodes.new('ShaderNodeTexWave'); w2 = nt.nodes.new('ShaderNodeTexWave')
            for w, ax in ((w1, 'X'), (w2, 'Y')):
                w.wave_type = 'BANDS'; w.bands_direction = ax; w.inputs['Scale'].default_value = 140.0
                nt.links.new(tc.outputs['UV'], w.inputs['Vector'])
            mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
            nt.links.new(w1.outputs['Fac'], mul.inputs[0]); nt.links.new(w2.outputs['Fac'], mul.inputs[1])
            nt.links.new(mul.outputs[0], bump.inputs['Height'])
            bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.004
        nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    m.diffuse_color = c if not s.get('transmission') else (0.8, 0.85, 0.9, 1)
    m.roughness = s.get('rough', 0.4); m.metallic = s.get('metal', 0.0)
    return m

def _screen_gain():
    """emission that shows screen pixels at their own brightness under the studio's exposure"""
    try: e = float(json.loads(bpy.context.scene.get('s3_hints') or '{}').get('exposure', 0.0))
    except Exception: e = 0.0
    return min(4.0, max(0.5, 2 ** (-e)))

def screen_material(source=None, strength=None, aspect=None, start=0.0, colors=None, name='screen'):
    """display material for device screens: an image or a video from the project (e.g. 'media/ui.png', 'media/demo.mp4'),
    cover-fitted to the screen `aspect` (w/h), emitting with a glossy glass layer on top. source=None → a procedural
    gradient wallpaper from `colors` (default design accents). start = scene time (s) at which a video starts.
    strength None = auto: compensates the studio exposure so UI whites stay white."""
    if strength is None: strength = _screen_gain()
    m = bpy.data.materials.new(name); nt = _nodes(m)
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1)
    p.inputs['Roughness'].default_value = 0.06
    if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = 0.45
    p.inputs['Emission Strength'].default_value = strength
    path = None
    if source:
        path = s3.CTX.media(source) if s3.CTX and not os.path.isabs(source) else source
        if not os.path.isfile(path): print('studiokit: screen source not found', path); path = None
    tc = nt.nodes.new('ShaderNodeTexCoord')
    if path:
        img = bpy.data.images.load(path, check_existing=True)
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
        tex.extension = 'EXTEND'
        if path.lower().endswith(('.mp4', '.mov', '.webm', '.mkv', '.m4v')):
            img.source = 'MOVIE'
            iu = tex.image_user
            iu.frame_duration = max(1, img.frame_duration)
            iu.frame_start = s3.CTX.frame(start) if s3.CTX else 1
            iu.use_auto_refresh = True; iu.use_cyclic = True
        w, h = img.size
        ia = (w / h) if h else 1.0
        sa = aspect or ia
        mp = nt.nodes.new('ShaderNodeMapping')
        if ia > sa:  # image wider than the screen: crop the sides
            k = sa / ia; mp.inputs['Scale'].default_value = (k, 1, 1); mp.inputs['Location'].default_value = ((1 - k) / 2, 0, 0)
        else:
            k = ia / sa; mp.inputs['Scale'].default_value = (1, k, 1); mp.inputs['Location'].default_value = (0, (1 - k) / 2, 0)
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], p.inputs['Emission Color'])
        m.diffuse_color = (0.35, 0.38, 0.45, 1)
    else:
        cs = colors or ('accent', 'accent-2', 'bg')
        c0 = col(cs[0]); c1 = col(cs[1] if len(cs) > 1 else cs[0]); c2 = col(cs[2] if len(cs) > 2 else '#0b0b12')
        grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'LINEAR'
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (0, 0, math.radians(-60))
        mp.inputs['Location'].default_value = (-0.2, 0.75, 0)
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'EASE'
        e = ramp.color_ramp.elements
        e[0].position = 0.0; e[0].color = mix(c2, c0, 0.15); e[1].position = 0.55; e[1].color = c0
        e3 = e.new(1.0); e3.color = c1
        nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], p.inputs['Emission Color'])
        m.diffuse_color = mix(c0, c1, 0.5)
    return m

# ---------------------------------------------------------------- devices
def _rrect(w, h, r, seg):
    r = max(1e-4, min(r, w / 2 - 1e-4, h / 2 - 1e-4))
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def _slab_bm(w, h, d, r, seg=12, z0=None):
    """rounded-rect outline in XY extruded along Z from z0 to z0+d (default centred)"""
    z0 = -d / 2 if z0 is None else z0
    pts = _rrect(w, h, r, seg)
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z0 + d)) for x, y in pts]
    bm.faces.new(hi); bm.faces.new(list(reversed(lo)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    return bm

def _flat_bm(w, h, r, seg=12, z=0.0, flip=False):
    """rounded-rect face (UV 0..1 over the w×h box), normal +Z (or -Z when flip)"""
    pts = _rrect(w, h, r, seg)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new((x, y, z)) for x, y in pts]
    f = bm.faces.new(list(reversed(vs)) if flip else vs)
    for lp in f.loops:
        x, y, _ = lp.vert.co
        lp[uv].uv = ((x + w / 2) / w, (y + h / 2) / h) if not flip else ((x + w / 2) / w, (y + h / 2) / h)
    return bm

def _stand_up(bm):
    """lying (front +Z, up +Y) → standing (front -Y, up +Z)"""
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(90), 4, 'X'), verts=bm.verts)
    return bm

def _assign_by_normal(o, front=1, back=2, axis=1, sign=-1):
    for p in o.data.polygons:
        n = p.normal[axis] * sign
        p.material_index = front if n > 0.9 else back if n < -0.9 else 0

def child(root, part):
    """a named part of a device/group: child(phone, 'screen'), child(laptop, 'hinge')"""
    for o in [root] + list(root.children_recursive):
        if o.name.split('.')[0].endswith(part) or o.name.endswith(part): return o
    return None

def _group(name, location, rotation):
    root = s3.empty(location, name)
    root.rotation_euler = [math.radians(a) for a in rotation]
    return root

def _parent(o, root):
    o.parent = root
    return o

def _as_mat(x, default_kind, default_color=None, **kw):
    """Material | MATERIALS name | colour (token/#hex/tuple) | None → Material"""
    if isinstance(x, bpy.types.Material): return x
    if isinstance(x, str) and x in MATERIALS: return material(x)
    if x is None: return material(default_kind, default_color, **kw)
    return material(default_kind if default_kind != 'satin_metal' else 'anodized', x, **kw)

def _device_mats(frame, back, accent_default):
    return _as_mat(frame, 'satin_metal'), _as_mat(back, 'satin', accent_default, rough=0.42)

def phone(screen=None, height=1.6, location=(0, 0, 0), rotation=(0, 0, 0), frame=None, back=None, screen_strength=None, name='phone'):
    """procedural smartphone (front faces -Y, bottom edge at location z). screen = image/video path (project media) or a
    Material or None (gradient wallpaper). frame/back = MATERIALS name, colour or Material. Parts: 'body', 'screen', 'camera'."""
    H = height; W = H * 0.486; D = H * 0.052; R = W * 0.165; bez = W * 0.032
    seg = 6 if _mock() else 16
    x, y, z = location
    root = _group(name, (x, y, z + H / 2), rotation)
    fm, bk = _device_mats(frame, back, mix('surface', '#2a2a2e', 0.3))
    glass = material('black_glass')
    body = _mesh_obj(name + '.body', _stand_up(_slab_bm(W, H, D, R, seg)), [fm, glass, bk])
    _assign_by_normal(body, front=1, back=2)
    _bevel_mod(body, D * 0.32, 5)
    _parent(body, root)
    sm = screen if isinstance(screen, bpy.types.Material) else screen_material(screen, screen_strength, aspect=(W - 2 * bez) / (H - 2 * bez))
    scr = _mesh_obj(name + '.screen', _stand_up(_flat_bm(W - 2 * bez, H - 2 * bez, R - bez, seg, z=D / 2 + H * 0.0006)), [sm], smooth=False)
    _parent(scr, root)
    # camera island on the back (upper left as seen from behind = +x)
    cw = W * 0.42
    isl = _mesh_obj(name + '.camera', _stand_up(_slab_bm(cw, cw, D * 0.18, cw * 0.28, seg, z0=-D / 2 - D * 0.16)), [glass], smooth=True)
    isl.location = (W / 2 - cw / 2 - W * 0.07, 0, H / 2 - cw / 2 - W * 0.07)
    _bevel_mod(isl, D * 0.06, 3); _parent(isl, root)
    for (lx, lz) in ((-0.22, 0.22), (-0.22, -0.22), (0.22, 0.0)):
        ln = s3.cylinder(cw * 0.17, D * 0.22, (isl.location.x + lx * cw, D / 2 + D * 0.27, isl.location.z + lz * cw), (90, 0, 0), fm, vertices=32 if _mock() else 64)
        _bevel_mod(ln, D * 0.04, 2); ln.name = name + '.lens'; _parent(ln, root)
        gl = s3.cylinder(cw * 0.13, D * 0.05, (ln.location.x, D / 2 + D * 0.38, ln.location.z), (90, 0, 0), glass, vertices=32 if _mock() else 64)
        gl.name = name + '.lensglass'; _parent(gl, root)
    return root

def tablet(screen=None, height=1.6, location=(0, 0, 0), rotation=(0, 0, 0), frame=None, back=None, screen_strength=None, landscape=False, name='tablet'):
    """procedural tablet (portrait; landscape=True rotates the body 90° in its plane). Same parts as phone()."""
    H = height; W = H * 0.72; D = H * 0.026; R = W * 0.07; bez = W * 0.04
    if landscape: W, H = H, W
    seg = 6 if _mock() else 16
    x, y, z = location
    root = _group(name, (x, y, z + H / 2), rotation)
    fm, bk = _device_mats(frame, back, (0.5, 0.5, 0.52, 1))
    glass = material('black_glass')
    body = _mesh_obj(name + '.body', _stand_up(_slab_bm(W, H, D, R, seg)), [fm, glass, bk])
    _assign_by_normal(body, front=1, back=2); _bevel_mod(body, D * 0.35, 5); _parent(body, root)
    sm = screen if isinstance(screen, bpy.types.Material) else screen_material(screen, screen_strength, aspect=(W - 2 * bez) / (H - 2 * bez))
    scr = _mesh_obj(name + '.screen', _stand_up(_flat_bm(W - 2 * bez, H - 2 * bez, R - bez * 0.6, seg, z=D / 2 + H * 0.0006)), [sm], smooth=False)
    _parent(scr, root)
    cw = min(W, H) * 0.12
    isl = _mesh_obj(name + '.camera', _stand_up(_slab_bm(cw, cw, D * 0.2, cw * 0.3, seg, z0=-D / 2 - D * 0.18)), [glass])
    isl.location = (W / 2 - cw / 2 - min(W, H) * 0.05, 0, H / 2 - cw / 2 - min(W, H) * 0.05); _parent(isl, root)
    return root

def laptop(screen=None, width=2.0, open=105, location=(0, 0, 0), rotation=(0, 0, 0), frame=None, screen_strength=None, name='laptop'):
    """procedural laptop: base on the floor at location, lid hinged at the back edge, screen facing -Y. open = lid angle (°),
    animate it with s3.key(s3.child(lap, 'hinge'), 'rotation_euler', t, (-angle, 0, 0)). Parts: 'base', 'hinge', 'lid', 'screen'."""
    Wb = width; Db = width * 0.70; Tb = width * 0.035; Tl = width * 0.022; R = width * 0.035
    seg = 6 if _mock() else 14
    root = _group(name, location, rotation)
    fm = _as_mat(frame, 'satin_metal')
    dark = material('rubber', (0.012, 0.012, 0.014, 1), rough=0.5)
    base = _mesh_obj(name + '.base', _slab_bm(Wb, Db, Tb, R, seg, z0=0.0), [fm]); _bevel_mod(base, Tb * 0.3, 4); _parent(base, root)
    # keyboard (brick-texture keys) and trackpad
    kb_m = bpy.data.materials.new('keys'); nt = _nodes(kb_m); p = nt.nodes.get('Principled BSDF')
    br = nt.nodes.new('ShaderNodeTexBrick'); tc = nt.nodes.new('ShaderNodeTexCoord')
    br.offset = 0.0; br.squash = 1.0
    br.inputs['Color1'].default_value = (0.01, 0.01, 0.011, 1); br.inputs['Color2'].default_value = (0.01, 0.01, 0.011, 1)
    br.inputs['Mortar'].default_value = (0.25, 0.25, 0.26, 1) if not isinstance(fm, bpy.types.Material) else fm.diffuse_color
    br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = 0.012
    br.inputs['Brick Width'].default_value = 1 / 14.0; br.inputs['Row Height'].default_value = 1 / 6.0
    nt.links.new(tc.outputs['UV'], br.inputs['Vector']); nt.links.new(br.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.85; kb_m.diffuse_color = (0.05, 0.05, 0.05, 1)
    if 'Specular IOR Level' in p.inputs: p.inputs['Specular IOR Level'].default_value = 0.15
    kw, kd = Wb * 0.86, Db * 0.40
    kb = _mesh_obj(name + '.keys', _flat_bm(kw, kd, Wb * 0.008, 3, z=Tb + 0.0012), [kb_m], smooth=False)
    kb.location = (0, Db * 0.20, 0); _parent(kb, root)
    tp = _mesh_obj(name + '.trackpad', _flat_bm(Wb * 0.38, Db * 0.30, Wb * 0.012, 6, z=Tb + 0.0008), [material('satin_metal', fm.diffuse_color if isinstance(fm, bpy.types.Material) else None, rough=0.25)], smooth=False)
    tp.location = (0, -Db * 0.24, 0); _parent(tp, root)
    hinge = s3.empty((0, Db / 2, Tb), name + '.hinge'); _parent(hinge, root)
    hinge.rotation_euler = (math.radians(-open), 0, 0)
    lid = _mesh_obj(name + '.lid', _slab_bm(Wb, Db, Tl, R, seg, z0=0.0), [fm, dark]); lid.location = (0, -Db / 2, 0)
    for pl in lid.data.polygons: pl.material_index = 1 if pl.normal.z < -0.9 else 0
    _bevel_mod(lid, Tl * 0.3, 4); _parent(lid, hinge)
    sw = Wb * 0.94; sh = sw / 1.6
    sm = screen if isinstance(screen, bpy.types.Material) else screen_material(screen, screen_strength, aspect=sw / sh)
    scr = _mesh_obj(name + '.screen', _flat_bm(sw, sh, Wb * 0.01, 4, z=-0.0012, flip=True), [sm], smooth=False)
    scr.location = (0, -Db + Wb * 0.025 + sh / 2, 0)  # thin top bezel at the lid's free edge, chin at the hinge
    # the lid opens upward: local -Y becomes 'up' on the screen → flip v so the image reads upright
    uvl = scr.data.uv_layers.active
    for d in uvl.data: d.uv = (d.uv[0], 1 - d.uv[1])
    _parent(scr, hinge)
    return root

# ---------------------------------------------------------------- type & logos
def font(family='inter', weight=800, path=None):
    """resolve a font file: an explicit path / project file, else a bundled @fontsource family (inter, manrope,
    space-grotesk, unbounded, bebas-neue, playfair-display, jetbrains-mono) at weight, else Blender's Inter. None = default."""
    for p in (path,):
        if p:
            q = s3.CTX.media(p) if s3.CTX and not os.path.isabs(p) else p
            if os.path.isfile(q): return q
    fam = (family or 'inter').lower().replace(' ', '-')
    d = os.path.join(ROOT, 'node_modules', '@fontsource', fam, 'files')
    for w in (weight, 700, 400):
        for ext in ('woff', 'woff2'):
            q = os.path.join(d, f'{fam}-latin-{w}-normal.{ext}')
            if os.path.isfile(q): return q
    try:
        q = bpy.utils.system_resource('DATAFILES', path='fonts/Inter.woff2')
        if q and os.path.isfile(q): return q
    except Exception: pass
    return None

def title(body, size=0.5, depth=0.08, bevel=0.012, family='inter', weight=800, font_path=None, material=None,
          location=(0, 0, 0), rotation=(90, 0, 0), align='CENTER', tracking=0.0, name='title'):
    """extruded 3D type standing up facing the camera (-Y), centred on location. tracking = extra letter spacing (0.05…)."""
    f = font(family, weight, font_path)
    o = s3.text3d(body, size=size, extrude=depth / 2, bevel=bevel, location=location, rotation=rotation,
                  material=material if material is not None else globals()['material']('satin', 'text'), align=align, font=f)
    o.name = name
    cu = o.data
    cu.bevel_resolution = 1 if _mock() else 4
    cu.resolution_u = 4 if _mock() else 12
    if tracking: cu.space_character = 1.0 + tracking
    cu.align_y = 'CENTER'
    # extrude is symmetric around the text plane; the front face sits at -depth/2 (toward the camera)
    return o

def logo(svg, height=1.0, depth=0.08, bevel=0.008, material=None, location=(0, 0, 0), rotation=(90, 0, 0), name='logo'):
    """extruded logo from an SVG (project path, e.g. 'media/logo.svg'), scaled to `height` (m), centred, standing up facing -Y."""
    import addon_utils
    p = s3.CTX.media(svg) if s3.CTX and not os.path.isabs(svg) else svg
    try: addon_utils.enable('io_curve_svg', default_set=False)
    except Exception: pass
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=p)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']
    if not new: raise ValueError('no curves in ' + p)
    lo = Vector((1e9, 1e9)); hi = Vector((-1e9, -1e9))
    for o in new:
        for c in o.bound_box:
            v = o.matrix_world @ Vector(c); lo.x = min(lo.x, v.x); lo.y = min(lo.y, v.y); hi.x = max(hi.x, v.x); hi.y = max(hi.y, v.y)
    k = height / max(1e-6, hi.y - lo.y)
    root = _group(name, location, rotation)
    m = material if material is not None else globals()['material']('chrome')
    for o in new:
        cu = o.data; cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
        cu.extrude = depth / 2 / k; cu.bevel_depth = bevel / k; cu.bevel_resolution = 1 if _mock() else 3
        cu.materials.clear(); cu.materials.append(m)
        o.parent = root
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.location = (-(lo.x + hi.x) / 2 * k, -(lo.y + hi.y) / 2 * k, 0); o.scale = (k, k, k)
        for coll in list(o.users_collection):
            if coll != bpy.context.scene.collection: coll.objects.unlink(o)
        if o.name not in bpy.context.scene.collection.objects: bpy.context.scene.collection.objects.link(o)
    return root

# ---------------------------------------------------------------- framing & camera rigs
def _objs(x):
    xs = x if isinstance(x, (list, tuple)) else [x]
    out = []
    for o in xs:
        if isinstance(o, bpy.types.Object):
            out.append(o); out.extend(o.children_recursive)
    return out

def bounds(objs):
    """world-space bounding box (min, max) of objects (with children, modifiers & text evaluated)"""
    bpy.context.view_layer.update()
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in _objs(objs):
        if o.type in ('EMPTY', 'LIGHT', 'CAMERA', 'LIGHT_PROBE'): continue
        oe = o.evaluated_get(dg)
        pts = [Vector(c) for c in oe.bound_box]
        if o.type in ('CURVE', 'FONT', 'SURFACE', 'META'):  # their bound_box can be stale → measure the evaluated geometry
            try:
                me = oe.to_mesh()
                if me and len(me.vertices): pts = [v.co.copy() for v in me.vertices]
                oe.to_mesh_clear()
            except Exception: pass
        for c in pts:
            v = oe.matrix_world @ c
            for i in range(3): lo[i] = min(lo[i], v[i]); hi[i] = max(hi[i], v[i])
    if lo.x > hi.x:
        for o in _objs(objs): v = o.matrix_world.translation; lo = Vector(v); hi = Vector(v)
    return lo, hi

def _aspect(aspect):
    if isinstance(aspect, str) and ':' in aspect:
        a, b = aspect.split(':'); return float(a) / float(b)
    if aspect: return float(aspect)
    return (s3.CTX.width / s3.CTX.height) if s3.CTX else 16 / 9

def _tans(lens, aspect, sensor=36.0):
    t = (sensor / 2) / lens
    return (t, t / aspect) if aspect >= 1 else (t * aspect, t)

def fit_distance(objs, lens=50, direction=(0, -1, 0.25), margin=0.12, aspect=None, offset=(0.0, 0.0), fit='box'):
    """(center, distance): camera distance along `direction` (from subject to camera) so objs fill the frame minus
    `margin` (fraction per side) at the given aspect. offset = subject centre position in the frame (-0.5…0.5 of
    width/height, +x right, +y up). fit='sphere' is rotation-invariant (for turntables / orbits)."""
    lo, hi = bounds(objs)
    c = (lo + hi) / 2
    a = _aspect(aspect)
    th, tv = _tans(lens, a)
    dirv = Vector(direction).normalized()
    fwd = -dirv; right = fwd.cross(Vector((0, 0, 1)))
    if right.length < 1e-6: right = Vector((1, 0, 0))
    right.normalize(); up = right.cross(fwd).normalized()
    lim = 1 - 2 * margin
    ox, oy = offset[0] * 2, offset[1] * 2
    if fit == 'sphere':
        r = (hi - lo).length / 2
        s = min(th * (lim - abs(ox)), tv * (lim - abs(oy)))
        return c, r * math.sqrt(1 + s * s) / max(1e-6, s)
    d = 0.0
    for i in range(8):
        p = Vector((hi.x if i & 1 else lo.x, hi.y if i & 2 else lo.y, hi.z if i & 4 else lo.z)) - c
        x, y, z = p.dot(right), p.dot(up), p.dot(fwd)
        ax = th * (lim - ox if x > 0 else lim + ox); ay = tv * (lim - oy if y > 0 else lim + oy)
        if ax > 0: d = max(d, abs(x) / ax - z)
        if ay > 0: d = max(d, abs(y) / ay - z)
    return c, d

def _target_of(cam):
    for cn in cam.constraints:
        if cn.type == 'TRACK_TO' and cn.target: return cn.target
    return None

def frame(objs, cam=None, margin=0.12, direction=(0, -1, 0.25), lens=None, aspect=None, offset=(0.0, 0.0), fit='box', dof=None):
    """hero framing: place (or create) the camera so objs fill the frame for the project aspect (16:9 or 9:16 — or pass
    aspect='9:16'), keeping `margin` free per side; offset=(x, y) puts the subject off-centre (e.g. (-0.2, 0) leaves room for
    copy on the right) via lens shift. Returns the camera (target empty at the subject centre)."""
    lens = lens or (cam.data.lens if cam else 60)
    c, d = fit_distance(objs, lens, direction, margin, aspect, offset, fit)
    loc = c + Vector(direction).normalized() * d
    if cam is None:
        cam = s3.camera(lens=lens, location=tuple(loc), target=tuple(c), dof=dof)
    else:
        cam.data.lens = lens; cam.location = loc
        t = _target_of(cam)
        if t: t.location = c
        else: _aim(cam, c)
    a = _aspect(aspect)
    big = max(a, 1.0);
    cam.data.shift_x = -offset[0] * (a / big)
    cam.data.shift_y = -offset[1] * ((1 / a) / max(1 / a, 1.0))
    cam['frame_center'] = tuple(c); cam['frame_distance'] = d
    return cam

def _dur(t1):
    return (s3.CTX.duration if s3.CTX else 5.0) if t1 is None else t1

def rig_orbit(subject, start=-115, end=-65, t0=0.0, t1=None, lens=55, elevation=12, margin=0.14, ease='inOutSine', dof=None):
    """orbiting hero camera: circles the subject from `start` to `end` degrees around Z (-90 = straight front), at a
    rotation-safe framing distance. Returns the camera."""
    c, d = fit_distance(subject, lens, (0, -1, math.tan(math.radians(elevation))), margin, fit='sphere')
    e = math.radians(elevation)
    cam = s3.camera(lens=lens, location=(0, -d * math.cos(e), d * math.sin(e)), target=tuple(c), dof=dof)
    s3.orbit(cam, radius=d * math.cos(e), height=d * math.sin(e), start=start, end=end, t0=t0, t1=_dur(t1), ease=ease, center=tuple(c))
    return cam

def rig_dolly(subject, push=1.35, t0=0.0, t1=None, lens=55, direction=(0, -1, 0.25), margin=0.12, ease='outCubic', dof=None, offset=(0, 0)):
    """dolly-in: starts `push`× farther than the hero framing and ends exactly on it (push < 1 = dolly-out)."""
    c, d = fit_distance(subject, lens, direction, margin, offset=offset)
    dv = Vector(direction).normalized()
    cam = frame(subject, None, margin, direction, lens, offset=offset, dof=dof)
    end = Vector(cam.location); begin = c + dv * d * push
    s3.move(cam, tuple(begin), tuple(end), t0, _dur(t1), ease)
    return cam

def rig_crane(subject, low=2, high=35, t0=0.0, t1=None, lens=50, margin=0.12, azimuth=-90, ease='inOutSine', dof=None):
    """crane: the camera rises from `low` to `high` elevation (°) on a vertical line, keeping the subject framed."""
    az = math.radians(azimuth)
    dirs = [Vector((math.cos(az) * math.cos(math.radians(e)), math.sin(az) * math.cos(math.radians(e)), math.sin(math.radians(e)))) for e in (low, high)]
    c, d0 = fit_distance(subject, lens, dirs[0], margin, fit='sphere')
    _, d1 = fit_distance(subject, lens, dirs[1], margin, fit='sphere')
    d = max(d0, d1)
    p0 = c + dirs[0] * d
    horiz = (p0 - c).to_2d().length
    p1 = Vector((p0.x, p0.y, c.z + horiz * math.tan(math.radians(high))))
    cam = s3.camera(lens=lens, location=tuple(p0), target=tuple(c), dof=dof)
    s3.move(cam, tuple(p0), tuple(p1), t0, _dur(t1), ease)
    return cam

def rig_push_focus(subject, focus_from, focus_to=None, fstop=2.0, push=1.15, t0=0.0, t1=None, lens=70, direction=(0, -1, 0.2),
                   margin=0.12, focus_t0=None, focus_t1=None, ease='inOutSine'):
    """slow push-in with a focus pull (depth of field): focus travels from `focus_from` to `focus_to` (objects or points;
    default: the subject) between focus_t0..focus_t1 (default: the middle third)."""
    t1 = _dur(t1)
    cam = rig_dolly(subject, push, t0, t1, lens, direction, margin, ease)
    pos = lambda f: tuple(f.matrix_world.translation) if isinstance(f, bpy.types.Object) else tuple(f)
    bpy.context.view_layer.update()
    lo, hi = bounds(subject)
    a = pos(focus_from); b = pos(focus_to) if focus_to is not None else tuple((lo + hi) / 2)
    fe = s3.empty(a, 'focus')
    cam.data.dof.use_dof = True; cam.data.dof.focus_object = fe; cam.data.dof.aperture_fstop = fstop
    ft0 = t0 + (t1 - t0) / 3 if focus_t0 is None else focus_t0
    ft1 = t0 + 2 * (t1 - t0) / 3 if focus_t1 is None else focus_t1
    s3.move(fe, a, b, ft0, ft1, 'inOutCubic')
    return cam

# ---------------------------------------------------------------- presets
class Studio:
    """what studio() built: .kind, .lights {name: obj}, .backdrop, .floor_z, .accent, .accent2, .world, .extras"""
    def __init__(self, kind, z):
        self.kind = kind; self.lights = {}; self.backdrop = None; self.floor_z = z; self.extras = {}
        self.accent = None; self.accent2 = None; self.world = None
    def __getitem__(self, k): return self.lights.get(k) or self.extras.get(k)
    def dim(self, factor):
        """scale every light's energy (quick global brightness)"""
        for l in self.lights.values(): l.data.energy *= factor
        return self

PRESETS = {
    'white_cyc': 'seamless white cyclorama, big softbox key + fill + top, soft contact shadows — clean Apple-style product look',
    'dark_luxe': 'dark seamless with a soft halo on the wall, strong rim/edge strips, subtle reflective floor — premium',
    'product_softbox': 'classic 3-point with big rectangular softboxes + strip rims on a neutral grey sweep — glossy products',
    'neon': 'dark set, two coloured strip lights (accent / accent-2), wet reflective floor, optional haze and neon tubes',
    'sunset_window': 'warm low sun through a window (window-pattern shadows) + sunset HDRI fill — lifestyle',
    'daylight': 'neutral daylight through a window + courtyard HDRI fill, bright room — lifestyle / editorial',
    'abstract_void': 'infinite gradient void (no floor), soft key + coloured rims — floating type and logos',
}

def studio(kind='white_cyc', accent=None, accent2=None, backdrop=None, floor=None, haze_density=None, tubes=False,
           size=1.0, z=0.0, hdri=None, hdri_strength=None, exposure=None, view=None, look=None, key_side='left', void=None,
           cards=True):
    """one call → a complete lit studio (see PRESETS). Subject at the origin on the floor z (about `size` metres tall).
    accent/accent2/backdrop: design tokens ('accent'), '#hex' or linear tuples (default from the design system).
    floor: 'matte' | 'gloss' | 'mirror' | None (preset default). haze_density: volumetric haze (neon default 0.015).
    tubes: visible neon tubes (neon). void: (center, edge[, 'radial'|'vertical']) colours for abstract_void.
    cards: reflection cards (emissive boards only reflections see) so chrome/gold/glossy objects have something to mirror.
    Returns a Studio (s.lights['key'], s.backdrop, s.dim(0.8) …). Tweak afterwards: move/scale lights, swap materials."""
    if kind not in PRESETS: raise ValueError(f'unknown studio preset {kind!r}; one of {", ".join(PRESETS)}')
    s = size; S = Studio(kind, z)
    A = col(accent if accent is not None else 'accent'); B = col(accent2 if accent2 is not None else 'accent-2')
    S.accent, S.accent2 = A, B
    side = -1 if key_side == 'left' else 1
    tgt = (0, 0, z + 0.45 * s)
    E = s * s  # energy scales with set size²
    mock = _mock()
    L = S.lights

    def P(x, y, h): return (x * s, y * s, h * s + z)

    if kind == 'white_cyc':
        bd = col(backdrop if backdrop is not None else '#f4f4f2')
        fr = {'gloss': 0.18, 'mirror': 0.06}.get(floor, 0.7)
        S.backdrop = cyclorama(bd, floor_rough=fr, wall_rough=0.7, depth=4.0 * s, radius=2.6 * s, z=z)
        S.extras['probe'] = _sphere_probe((0, -0.5 * s, z + 1.2 * s), 12 * s)
        L['key'] = (softbox(1150 * E, P(side * 2.6, -2.4, 3.2), tgt, (2.4 * s, 1.6 * s), 6500, name='key'))
        L['fill'] = (softbox(20 * E, P(-side * 3.6, -2.6, 1.6), tgt, (3.2 * s, 2.2 * s), 6500, name='fill'))
        L['top'] = (softbox(60 * E, P(0, -0.2, 4.6), (0, 0, z), (2.4 * s, 2.4 * s), 6500, name='top'))
        # wall wash from high up: its plane never crosses the visible wall (no terminator arcs), grid keeps it off the floor
        L['bg'] = (softbox(1550 * E, P(0, 0.8, 6.5), (0, 4.0 * s, z + 1.8 * s), (6.0 * s, 2.0 * s), 6500, spread=45, name='bg_wash'))
        L['rim'] = flag(strip(240 * E, P(-side * 2.2, 2.2, 2.2), tgt, 2.2 * s, 0.3 * s, 6500, name='rim'), S.backdrop)
        S.world = env_world(bd, hdri or 'studio', 0.15 if hdri_strength is None else hdri_strength)
        # Khronos PBR Neutral: product/brand colours stay true, whites stay white without clipping
        render_hints(view=view or 'Khronos PBR Neutral', look=look or 'None', exposure=-1.4 if exposure is None else exposure,
                     raytracing=True, fast_gi=True, soft_shadows=True)
        _DEFAULTS['podium'] = lambda: material('matte', mix(bd, '#ffffff', 0.3), rough=0.6)

    elif kind == 'dark_luxe':
        bd = col(backdrop) if backdrop is not None else (mix('bg', '#000000', 0.6) if s3.CTX and s3.CTX._colors else col('#060607'))
        if _lum(bd) > 0.012: bd = mix(bd, '#000000', 0.6)
        fr = {'mirror': 0.05, 'matte': 0.6}.get(floor, 0.28)
        S.backdrop = cyclorama(bd, floor_rough=fr, wall_rough=0.55, wall_color=mix(bd, '#000000', 0.3), spec=0.6, depth=5.0 * s, radius=3.0 * s, z=z)
        S.extras['probe'] = _sphere_probe((0, -0.5 * s, z + 1.2 * s), 12 * s)
        L['key'] = (softbox(160 * E, P(side * 1.4, -2.6, 3.4), tgt, (1.8 * s, 1.2 * s), 5600, name='key'))
        L['rim_l'] = flag(strip(1100 * E, P(-2.1, 1.7, 2.3), (0, 0, z + 0.9 * s), 1.8 * s, 0.16 * s, 7500, spread=28, name='rim_l'), S.backdrop)
        L['rim_r'] = flag(strip(950 * E, P(2.1, 1.5, 2.2), (0, 0, z + 0.85 * s), 1.8 * s, 0.16 * s, 4500, spread=28, name='rim_r'), S.backdrop)
        L['halo'] = _spot(900 * E, P(0, 0.4, 3.8), (0, 4.4 * s, z + 0.9 * s), 80, 1.0, mix(A, '#ffffff', 0.55), radius=0.5 * s, name='halo')
        L['top'] = (softbox(70 * E, P(0, 0.3, 4.0), (0, 0, z), (1.0 * s, 2.4 * s), 6500, spread=60, name='top'))
        if cards:
            S.extras['card'] = card(P(0, -3.6, 1.6), (0, 0, z + 0.8 * s), (7.0 * s, 2.8 * s), 2.2, '#ffffff', name='card_front')
            S.extras['card_l'] = card(P(-3.6, -1.0, 1.6), (0, 0, z + 0.7 * s), (1.0 * s, 3.0 * s), 1.2, '#ffffff', name='card_l')
        S.world = env_world(bd, hdri or 'studio', 0.04 if hdri_strength is None else hdri_strength)
        render_hints(view=view or 'AgX', look=look or 'AgX - Medium High Contrast', exposure=0.4 if exposure is None else exposure,
                     raytracing=True, fast_gi=True, soft_shadows=True)
        _DEFAULTS['podium'] = lambda: material('satin', mix(bd, '#2a2a2e', 0.5), rough=0.28)

    elif kind == 'product_softbox':
        bd = col(backdrop if backdrop is not None else '#b4b6ba')
        fr = {'gloss': 0.15, 'mirror': 0.05}.get(floor, 0.62)
        S.backdrop = cyclorama(bd, floor_rough=fr, wall_rough=0.7, depth=4.2 * s, radius=2.6 * s, z=z)
        S.extras['probe'] = _sphere_probe((0, -0.5 * s, z + 1.2 * s), 12 * s)
        L['key'] = (softbox(700 * E, P(side * 2.4, -2.0, 2.8), tgt, (1.6 * s, 2.4 * s), 5800, name='key'))
        L['fill'] = (softbox(110 * E, P(-side * 3.0, -2.8, 1.4), tgt, (2.6 * s, 2.6 * s), 6200, name='fill'))
        L['rim_l'] = flag(strip(560 * E, P(-2.0, 1.5, 2.3), (0, 0, z + 0.7 * s), 2.0 * s, 0.22 * s, 6500, spread=40, name='rim_l'), S.backdrop)
        L['rim_r'] = flag(strip(560 * E, P(2.0, 1.5, 2.3), (0, 0, z + 0.7 * s), 2.0 * s, 0.22 * s, 6500, spread=40, name='rim_r'), S.backdrop)
        L['top'] = (softbox(160 * E, P(0, 0.3, 4.2), (0, 0, z), (1.4 * s, 2.8 * s), 6200, spread=70, name='top'))
        L['bg'] = (softbox(700 * E, P(0, 0.8, 6.0), (0, 4.2 * s, z + 1.6 * s), (5.0 * s, 1.6 * s), 6500, spread=45, name='bg_wash'))
        if cards: S.extras['card'] = card(P(0, -4.2, 3.6), (0, 0, z + 0.6 * s), (6.0 * s, 2.6 * s), 1.6, '#ffffff', name='card_front')
        S.world = env_world(bd, hdri or 'studio', 0.25 if hdri_strength is None else hdri_strength)
        render_hints(view=view or 'Khronos PBR Neutral', look=look or 'None', exposure=-1.0 if exposure is None else exposure,
                     raytracing=True, fast_gi=True, soft_shadows=True)
        _DEFAULTS['podium'] = lambda: material('matte', mix(bd, '#ffffff', 0.45), rough=0.5)

    elif kind == 'neon':
        bd = col(backdrop if backdrop is not None else '#121218')
        fr = {'matte': 0.6, 'mirror': 0.04}.get(floor, 0.1)
        S.backdrop = cyclorama(bd, floor_rough=fr, wall_rough=0.8, wall_color=mix(bd, '#000000', 0.15), spec=0.7, depth=4.5 * s, radius=2.6 * s, z=z)
        S.extras['probe'] = _sphere_probe((0, -0.5 * s, z + 1.2 * s), 12 * s)
        L['a'] = flag(strip(1600 * E, P(-2.1, 0.2, 2.0), (0, 0, z + 0.75 * s), 2.0 * s, 0.18 * s, None, A, spread=50, name='neon_a'), S.backdrop)
        L['b'] = flag(strip(1600 * E, P(2.1, 0.5, 2.0), (0, 0, z + 0.75 * s), 2.0 * s, 0.18 * s, None, B, spread=50, name='neon_b'), S.backdrop)
        # coloured glows on the set (the strips themselves are flagged off it)
        L['glow_a'] = _spot(450 * E, P(-1.0, -0.5, 3.8), (-1.6 * s, 4.5 * s, z + 1.0 * s), 65, 1.0, A, radius=0.6 * s, name='glow_a')
        L['glow_b'] = _spot(450 * E, P(1.0, -0.5, 3.8), (1.6 * s, 4.5 * s, z + 1.0 * s), 65, 1.0, B, radius=0.6 * s, name='glow_b')
        L['top'] = (softbox(35 * E, P(0, -0.6, 4.0), (0, 0, z), (1.2 * s, 1.2 * s), 6500, spread=50, name='top'))
        if tubes:
            for nm, c, x in (('tube_a', A, -1.6), ('tube_b', B, 1.6)):
                t = s3.cylinder(0.03 * s, 2.4 * s, (x * s, 2.2 * s, z + 1.3 * s), material=material('emissive', c, emissive=14.0), vertices=24)
                t.name = nm
                if hasattr(t, 'visible_shadow'): t.visible_shadow = False
                S.extras[nm] = t
        hd = 0.0015 if haze_density is None else haze_density
        S.extras['haze'] = haze(hd, (1, 1, 1), (14 * s, 12 * s, 7 * s), (0, 0.5 * s, z + 3.4 * s))
        if cards:
            S.extras['card_a'] = card(P(-2.6, -3.2, 2.2), (0, 0, z + 0.7 * s), (2.2 * s, 3.0 * s), 1.6, A, name='card_a')
            S.extras['card_b'] = card(P(2.6, -3.2, 2.2), (0, 0, z + 0.7 * s), (2.2 * s, 3.0 * s), 1.6, B, name='card_b')
        S.world = env_world(bd, hdri or 'night', 0.02 if hdri_strength is None else hdri_strength)
        render_hints(view=view or 'AgX', look=look or 'AgX - Punchy', exposure=0.2 if exposure is None else exposure,
                     raytracing=True, fast_gi=True, soft_shadows=True)
        _DEFAULTS['podium'] = lambda: material('satin', mix(bd, '#1a1a20', 0.6), rough=0.25)

    elif kind in ('sunset_window', 'daylight'):
        sunset = kind == 'sunset_window'
        wall = col(backdrop if backdrop is not None else ('#d9c3ab' if sunset else '#e4e1dc'))
        floor_c = mix(wall, (0.18, 0.11, 0.06, 1), 0.55) if floor != 'matte' else wall
        S.backdrop = cyclorama(wall, floor_rough=0.85, depth=3.2 * s, radius=0.25 * s, z=z)  # tight corner = room wall
        fl = s3.plane(40 * s, (0, -10 * s + 3.2 * s - 0.25 * s, z + 0.0004), material=material('satin', floor_c, rough=0.38)); fl.name = 'tabletop'
        fl.scale = (1, 1, 1)
        S.extras['tabletop'] = fl
        el = math.radians(14 if sunset else 38); az = math.radians(-145 if key_side == 'left' else -35)  # where the sun is (front-left / front-right)
        sun_dir = -Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = (7.0 if sunset else 6.5); ld.angle = math.radians(1.2 if sunset else 0.8)
        ld.color = kelvin(3000 if sunset else 5400)
        so = _link(bpy.data.objects.new('sun', ld)); so.rotation_euler = sun_dir.to_track_quat('-Z', 'Y').to_euler()
        L['sun'] = so
        S.extras['window'] = window_gobo(sun_dir, through=(0.25 * s * -side, 1.3 * s, z + 0.9 * s), distance=5.0 * s,
                                         opening=(2.4 * s, 3.0 * s), panes=(2, 3), mullion=0.07 * s)
        L['bounce'] = (softbox(90 * E if sunset else 140 * E, P(-side * 2.8, -3.0, 1.2), tgt, (3.0 * s, 2.0 * s), 4200 if sunset else 6500, name='bounce'))
        L['sky'] = (softbox(70 * E if sunset else 160 * E, P(side * 1.0, -2.0, 4.0), tgt, (3.0 * s, 3.0 * s), 9000 if sunset else 7500, name='skyfill'))
        S.world = env_world(mix(wall, (0, 0, 0, 1), 0.2), hdri or ('sunset' if sunset else 'courtyard'), (0.25 if sunset else 0.45) if hdri_strength is None else hdri_strength, rotation=120)
        _DEFAULTS['podium'] = lambda: material('ceramic', mix(wall, '#ffffff', 0.5))
        render_hints(view=view or 'AgX', look=look or 'AgX - Medium High Contrast',
                     exposure=(0.35 if sunset else 0.1) if exposure is None else exposure, raytracing=True, fast_gi=True, soft_shadows=True)

    elif kind == 'abstract_void':
        bg = col(backdrop if backdrop is not None else 'bg')
        dark = _lum(bg) < 0.2
        vc = void or (mix(mix(bg, '#ffffff', 0.07 if dark else 0.25), A, 0.10), mix(bg, '#000000', 0.45 if dark else 0.08), 'radial')
        _DEFAULTS['podium'] = lambda: material('satin', mix(bg, '#ffffff', 0.15), rough=0.35)
        L['key'] = (softbox(260 * E, P(side * 2.2, -2.6, 2.8), tgt, (2.2 * s, 1.6 * s), 5600, name='key'))
        L['fill'] = (softbox(60 * E, P(-side * 3.0, -2.6, 0.8), tgt, (2.6 * s, 2.6 * s), 6500, name='fill'))
        L['rim_a'] = (strip(500 * E, P(-2.2, 1.6, 1.6), tgt, 2.6 * s, 0.25 * s, None, mix(A, (1, 1, 1, 1), 0.3), name='rim_a'))
        L['rim_b'] = (strip(450 * E, P(2.2, 1.6, 1.2), tgt, 2.6 * s, 0.25 * s, None, mix(B, (1, 1, 1, 1), 0.3), name='rim_b'))
        L['top'] = (softbox(90 * E, P(0, 0.2, 4.0), tgt, (2.0 * s, 2.0 * s), 6000, name='top'))
        S.extras['probe'] = _sphere_probe((0, -0.5 * s, z + 1.0 * s), 12 * s)
        if cards: S.extras['card'] = card(P(0, -4.2, 3.4), (0, 0, z + 0.7 * s), (6.0 * s, 2.6 * s), 1.4, mix(A, '#ffffff', 0.75), name='card_front')
        S.world = env_world(bg, hdri or 'studio', 0.12 if hdri_strength is None else hdri_strength, gradient=vc)
        # PBR Neutral keeps the void and the accent colours true to the design system
        render_hints(view=view or 'Khronos PBR Neutral', look=look or 'None', exposure=0.0 if exposure is None else exposure,
                     raytracing=True, fast_gi=True, soft_shadows=True)
        if floor in ('gloss', 'mirror', 'matte'):
            S.extras['floor'] = reflective_floor(mix(bg, (0, 0, 0, 1), 0.3), 0.05 if floor == 'mirror' else 0.2 if floor == 'gloss' else 0.6, 200 * s, z)
            for k in ('rim_a', 'rim_b', 'top'): flag(L[k], S.extras['floor'])  # no light pools on the stage, only reflections
    return S
