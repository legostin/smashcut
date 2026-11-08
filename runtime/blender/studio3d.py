"""
studio3d — helpers for Smashcut 3D scenes (Blender, run headless).

A scene is scenes3d/<id>/scene.py with:

    import studio3d as s3

    def build(ctx):
        s3.world(ctx.color('bg'))
        s3.light_rig('studio')
        phone = s3.rounded_box((0.75, 0.08, 1.55), radius=0.09, material=s3.mat(ctx.color('surface'), rough=0.35))
        s3.turntable(phone, turns=0.25, t0=0, t1=ctx.duration, ease='inOutSine')
        cam = s3.camera(lens=60, location=(0, -6, 0.6), target=(0, 0, 0))
        s3.dolly(cam, to=(0, -4.6, 0.4), t0=0, t1=ctx.duration, ease='outCubic')

Time is in SECONDS everywhere (converted to frames for you). Everything is keyframed → deterministic renders.
Stages (ctx.quality): 'mock' (Workbench solid, half-res — composition, camera, timing),
'look' (EEVEE, materials & light), 'final' (EEVEE high samples + motion blur, or Cycles via ctx.params.engine='cycles').
Branch on ctx.quality to keep mocks fast (e.g. skip heavy modifiers / particles in 'mock').
"""
import bpy, math, os, json
from mathutils import Vector

# ---------------------------------------------------------------- context
class Ctx:
    def __init__(self, job):
        self.job = job
        self.fps = job['fps']; self.duration = job['duration']
        self.width = job['width']; self.height = job['height']
        self.quality = job.get('quality', 'look')
        self.params = job.get('params', {})
        self.project = job.get('projectDir', '')
        self._colors = {c['name']: c['value'] for c in job.get('design', {}).get('colors', [])}
        self.vertical = self.height > self.width

    def frame(self, t):
        return 1 + round(t * self.fps)

    def color(self, name, fallback='#888888'):
        """design-system colour by token name (accent, bg, text, surface, muted, accent-2…) as linear RGBA"""
        syn = {'bg': ['bg', 'background', 'base'], 'text': ['text', 'fg', 'ink'], 'surface': ['surface', 'card', 'panel', 'bg-2'],
               'accent': ['accent', 'primary', 'brand'], 'accent-2': ['accent-2', 'secondary'], 'muted': ['muted', 'text-2', 'subtle']}
        for n in syn.get(name, [name]):
            if n in self._colors: return hexcolor(self._colors[n])
        return hexcolor(fallback if fallback.startswith('#') else '#888888')

    def media(self, rel):
        """absolute path of a project file (e.g. 'media/phone.glb')"""
        return os.path.join(self.project, rel)

CTX = None

def hexcolor(h, alpha=1.0):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), alpha)

# ---------------------------------------------------------------- scene basics
def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def world(color=(0.02, 0.02, 0.025, 1), strength=1.0, hdri=None):
    """background colour (and optional .hdr/.exr environment from the project, e.g. 'media/studio.hdr')"""
    w = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes.get('Background') or nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.get('World Output') or nt.nodes.new('ShaderNodeOutputWorld')
    bg.inputs['Color'].default_value = color
    bg.inputs['Strength'].default_value = strength
    w.color = color[:3]  # Workbench (mock) background
    if hdri:
        env = nt.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(CTX.media(hdri) if CTX else hdri)
        nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return w

def mat(color=(0.8, 0.8, 0.8, 1), rough=0.4, metal=0.0, emission=None, emission_strength=0.0, alpha=1.0, name=None, transmission=0.0, ior=1.45):
    """Principled material; colour also drives the Workbench mock colour"""
    m = bpy.data.materials.new(name or 'mat')
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if 'Transmission Weight' in p.inputs: p.inputs['Transmission Weight'].default_value = transmission
    if 'IOR' in p.inputs: p.inputs['IOR'].default_value = ior
    if emission is not None:
        p.inputs['Emission Color'].default_value = emission
        p.inputs['Emission Strength'].default_value = emission_strength
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    m.diffuse_color = color  # Workbench / viewport
    return m

def _link(obj, material=None, location=(0, 0, 0), rotation=(0, 0, 0)):
    obj.location = location
    obj.rotation_euler = [math.radians(a) for a in rotation]
    if material is not None:
        if obj.data and hasattr(obj.data, 'materials'):
            obj.data.materials.clear(); obj.data.materials.append(material)
    return obj

def cube(size=1.0, location=(0, 0, 0), rotation=(0, 0, 0), material=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.scale = (size, size, size) if isinstance(size, (int, float)) else size
    bpy.ops.object.transform_apply(scale=True)
    if bevel: _bevel(o, bevel)
    return _link(o, material, location, rotation)

def rounded_box(dims=(1, 1, 1), radius=0.1, location=(0, 0, 0), rotation=(0, 0, 0), material=None, segments=6):
    o = cube(dims, location, rotation, material)
    # a bevel wider than half the thinnest side collapses the mesh
    _bevel(o, min(radius, min(dims) * 0.49), segments)
    return o

def _bevel(o, width, segments=4):
    m = o.modifiers.new('bevel', 'BEVEL'); m.width = width; m.segments = segments; m.limit_method = 'ANGLE'
    bpy.ops.object.shade_smooth() if bpy.context.active_object == o else None

def sphere(radius=0.5, location=(0, 0, 0), material=None, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=segments, ring_count=segments // 2)
    o = bpy.context.active_object; bpy.ops.object.shade_smooth()
    return _link(o, material, location)

def cylinder(radius=0.5, depth=1.0, location=(0, 0, 0), rotation=(0, 0, 0), material=None, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=vertices)
    o = bpy.context.active_object; bpy.ops.object.shade_smooth()
    return _link(o, material, location, rotation)

def torus(major=1.0, minor=0.25, location=(0, 0, 0), rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=96, minor_segments=32)
    o = bpy.context.active_object; bpy.ops.object.shade_smooth()
    return _link(o, material, location, rotation)

def plane(size=10, location=(0, 0, 0), rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_plane_add(size=size)
    return _link(bpy.context.active_object, material, location, rotation)

def floor(material=None, size=40, z=0.0, shadow_catcher=False):
    """ground plane; shadow_catcher=True keeps only shadows (Cycles) for compositing over video"""
    p = plane(size, (0, 0, z), material=material or mat((0.5, 0.5, 0.5, 1), 0.6))
    if shadow_catcher: p.is_shadow_catcher = True
    return p

def text3d(body, size=1.0, extrude=0.1, bevel=0.01, location=(0, 0, 0), rotation=(90, 0, 0), material=None, align='CENTER', font=None):
    """3D text; font = path to a .ttf/.otf (e.g. ctx.media('media/Inter-Bold.ttf'))"""
    bpy.ops.object.text_add()
    o = bpy.context.active_object
    o.data.body = body; o.data.size = size; o.data.extrude = extrude; o.data.bevel_depth = bevel
    o.data.align_x = align; o.data.align_y = 'CENTER'
    if font and os.path.exists(font): o.data.font = bpy.data.fonts.load(font)
    return _link(o, material, location, rotation)

def import_model(path, location=(0, 0, 0), rotation=(0, 0, 0), scale=1.0):
    """import .glb/.gltf/.obj/.fbx/.usd(z)/.stl from the project (e.g. 'media/phone.glb'); returns a parent empty"""
    p = CTX.media(path) if CTX and not os.path.isabs(path) else path
    before = set(bpy.data.objects)
    ext = os.path.splitext(p)[1].lower()
    if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=p)
    elif ext == '.obj': bpy.ops.wm.obj_import(filepath=p)
    elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=p)
    elif ext in ('.usd', '.usda', '.usdc', '.usdz'): bpy.ops.wm.usd_import(filepath=p)
    elif ext == '.stl': bpy.ops.wm.stl_import(filepath=p)
    else: raise ValueError('unsupported model: ' + ext)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new('model', None); bpy.context.scene.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
    root.location = location; root.rotation_euler = [math.radians(a) for a in rotation]; root.scale = (scale,) * 3
    return root

def image_plane(path, height=1.0, location=(0, 0, 0), rotation=(90, 0, 0), emission=True):
    """a project image/video frame on a plane (screens, posters, UI cards)"""
    p = CTX.media(path) if CTX and not os.path.isabs(path) else path
    img = bpy.data.images.load(p)
    w, h = img.size; aspect = (w / h) if h else 1
    pl = plane(1, location, rotation)
    pl.scale = (height * aspect, height, 1)
    m = bpy.data.materials.new('img'); m.use_nodes = True
    nt = m.node_tree; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    if p.lower().endswith(('.mp4', '.mov', '.webm')): img.source = 'MOVIE'; tex.image_user.use_auto_refresh = True; tex.image_user.frame_duration = 100000
    bsdf = nt.nodes.get('Principled BSDF')
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if emission:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color']); bsdf.inputs['Emission Strength'].default_value = 1.0
    pl.data.materials.append(m)
    return pl

# ---------------------------------------------------------------- camera & light
def camera(lens=50, location=(0, -6, 1.5), target=(0, 0, 0), dof=None):
    """active camera aimed at target (an (x,y,z) or an object). dof = f-stop to enable depth of field"""
    cd = bpy.data.cameras.new('cam'); cd.lens = lens
    cam = bpy.data.objects.new('cam', cd); bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    tgt = target if isinstance(target, bpy.types.Object) else empty(target, 'cam_target')
    c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    if dof:
        cd.dof.use_dof = True; cd.dof.focus_object = tgt; cd.dof.aperture_fstop = dof
    bpy.context.scene.camera = cam
    cam['target'] = tgt.name
    return cam

def empty(location=(0, 0, 0), name='empty'):
    e = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(e); e.location = location
    return e

def light(kind='AREA', energy=500, location=(3, -3, 4), target=(0, 0, 0), color=(1, 1, 1), size=3.0):
    ld = bpy.data.lights.new('light', kind); ld.energy = energy; ld.color = color[:3]
    if kind == 'AREA': ld.size = size
    lo = bpy.data.objects.new('light', ld); bpy.context.scene.collection.objects.link(lo); lo.location = location
    c = lo.constraints.new('TRACK_TO'); c.target = empty(target, 'light_target'); c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return lo

def light_rig(style='studio', scale=1.0):
    """'studio' (key+fill+rim, soft), 'dramatic' (strong key, deep shadows, rim), 'soft' (big overhead + fill)"""
    if style == 'dramatic':
        light('AREA', 1200 * scale, (4, -2.5, 3.5), size=1.2); light('AREA', 900 * scale, (-3, 3, 2.5), size=2); light('AREA', 80 * scale, (-4, -3, 1), size=4)
    elif style == 'soft':
        light('AREA', 700 * scale, (0, -1, 6), size=8); light('AREA', 250 * scale, (-5, -4, 2), size=6)
    else:
        light('AREA', 650 * scale, (3.5, -3.5, 4), size=3); light('AREA', 220 * scale, (-4, -3, 2), size=5); light('AREA', 500 * scale, (0, 4, 3), size=2)

# ---------------------------------------------------------------- animation (time in seconds)
EASE = {
    'linear': ('LINEAR', 'AUTO'),
    'inSine': ('SINE', 'EASE_IN'), 'outSine': ('SINE', 'EASE_OUT'), 'inOutSine': ('SINE', 'EASE_IN_OUT'),
    'inQuad': ('QUAD', 'EASE_IN'), 'outQuad': ('QUAD', 'EASE_OUT'), 'inOutQuad': ('QUAD', 'EASE_IN_OUT'),
    'inCubic': ('CUBIC', 'EASE_IN'), 'outCubic': ('CUBIC', 'EASE_OUT'), 'inOutCubic': ('CUBIC', 'EASE_IN_OUT'),
    'inQuart': ('QUART', 'EASE_IN'), 'outQuart': ('QUART', 'EASE_OUT'), 'inOutQuart': ('QUART', 'EASE_IN_OUT'),
    'inExpo': ('EXPO', 'EASE_IN'), 'outExpo': ('EXPO', 'EASE_OUT'), 'inOutExpo': ('EXPO', 'EASE_IN_OUT'),
    'outBack': ('BACK', 'EASE_OUT'), 'inOutBack': ('BACK', 'EASE_IN_OUT'), 'outElastic': ('ELASTIC', 'EASE_OUT'), 'outBounce': ('BOUNCE', 'EASE_OUT'),
}

def key(obj, path, t, value, ease='inOutCubic', index=-1):
    """keyframe obj.<path> = value at t seconds; the segment STARTING at this key uses `ease`.
    path: 'location' | 'rotation_euler' (degrees) | 'scale' | any animatable property ('data.lens', 'data.energy'…)"""
    target, prop = obj, path
    if '.' in path:
        head, prop = path.rsplit('.', 1)
        for part in head.split('.'): target = getattr(target, part)
    if prop == 'rotation_euler' and value is not None:
        value = [math.radians(v) for v in value]
    if value is not None: setattr(target, prop, value)
    f = CTX.frame(t) if CTX else 1 + round(t * bpy.context.scene.render.fps)
    target.keyframe_insert(data_path=prop, frame=f, index=index)
    ad = (target.id_data if hasattr(target, 'id_data') else target).animation_data
    if ad and ad.action:
        interp, easing = EASE.get(ease, EASE['inOutCubic'])
        for fc in _fcurves(ad.action):
            for kp in fc.keyframe_points:
                if abs(kp.co[0] - f) < 0.01:
                    kp.interpolation = interp
                    if interp != 'LINEAR': kp.easing = easing
    return obj

def _fcurves(action):
    # Blender 4.4+ layered actions keep fcurves in channelbags; older ones on the action
    if hasattr(action, 'fcurves') and len(getattr(action, 'fcurves', [])):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                out.extend(bag.fcurves)
    return out

def move(obj, frm, to, t0, t1, ease='inOutCubic'):
    key(obj, 'location', t0, frm, ease); key(obj, 'location', t1, to, ease)

def rotate(obj, frm, to, t0, t1, ease='inOutCubic'):
    key(obj, 'rotation_euler', t0, frm, ease); key(obj, 'rotation_euler', t1, to, ease)

def pop(obj, t0, dur=0.5, ease='outBack', to=1.0):
    """scale in from 0"""
    s = to if isinstance(to, (tuple, list)) else (to, to, to)
    key(obj, 'scale', t0, (0.001,) * 3, ease); key(obj, 'scale', t0 + dur, s, ease)

def turntable(obj, turns=1.0, t0=0, t1=5, ease='linear', axis='z'):
    i = 'xyz'.index(axis)
    r0 = [math.degrees(a) for a in obj.rotation_euler]; r1 = list(r0); r1[i] += 360 * turns
    rotate(obj, r0, r1, t0, t1, ease)

def dolly(cam, to, t0, t1, ease='inOutCubic'):
    move(cam, tuple(cam.location), to, t0, t1, ease)

def orbit(cam, radius=6, height=1.5, start=-90, end=-30, t0=0, t1=5, ease='inOutSine', center=(0, 0, 0)):
    """camera orbit around center (degrees around Z; -90 = front, looking +Y)"""
    pivot = empty(center, 'orbit')
    cam.parent = pivot
    cam.location = (0, -radius, height)
    rotate(pivot, (0, 0, start + 90), (0, 0, end + 90), t0, t1, ease)
    return pivot

def stagger(objs, fn, t0, each=0.08):
    """call fn(obj, t) for each object with a stagger"""
    for i, o in enumerate(objs): fn(o, t0 + i * each)

# ---------------------------------------------------------------- studio kit (presets, set pieces, devices, materials, rigs)
# s3.studio('white_cyc' | 'dark_luxe' | 'product_softbox' | 'neon' | 'sunset_window' | 'daylight' | 'abstract_void'), s3.podium,
# s3.turntable_rig, s3.material('chrome'…), s3.phone / tablet / laptop, s3.title, s3.logo, s3.frame, s3.rig_* — see studiokit.py
from studiokit import *  # noqa: E402,F401,F403
