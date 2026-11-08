"""
Headless entry point: blender -b --factory-startup --python run.py -- <job.json>

job = { scene: abs path to scene.py, outDir, mode: 'animation'|'stills'|'save', quality: 'mock'|'look'|'final',
        fps, duration, width, height, transparent, times: [s…] (stills), params, design, projectDir, blend: path to save }
Prints 'STUDIO3D progress <done>/<total>' lines and 'STUDIO3D done'.
"""
import bpy, sys, os, json, importlib.util, traceback

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
job = json.load(open(argv[0]))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio3d as s3

def say(*a):
    print('STUDIO3D', *a, flush=True)

def engine(name):
    sc = bpy.context.scene
    sc.render.engine = name

def hints(sc):
    """render settings a scene asked for via s3.render_hints() / s3.studio() (colour management, raytracing, samples…)"""
    try: return json.loads(sc.get('s3_hints') or '{}')
    except Exception: return {}

def preset(ctx, sc):
    q = ctx.quality
    r = sc.render
    r.resolution_x, r.resolution_y = ctx.width, ctx.height
    r.fps = ctx.fps
    r.film_transparent = bool(job.get('transparent'))
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA' if r.film_transparent else 'RGB'
    if q == 'mock':
        engine('BLENDER_WORKBENCH')
        r.resolution_percentage = 50
        sh = sc.display.shading
        sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'
        if hasattr(sh, 'background_type'): sh.background_type = 'WORLD'
        sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.show_shadows = True
        sc.display.render_aa = '8'
    elif q == 'final' and (ctx.params.get('engine') == 'cycles'):
        engine('CYCLES')
        r.resolution_percentage = 100
        sc.cycles.samples = int(ctx.params.get('samples', 128))
        sc.cycles.use_denoising = True
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'METAL'; prefs.get_devices()
            for d in prefs.devices: d.use = True
            sc.cycles.device = 'GPU'
        except Exception:
            pass
        r.use_motion_blur = True
    else:
        engine('BLENDER_EEVEE')
        r.resolution_percentage = 100
        ee = sc.eevee
        ee.taa_render_samples = 96 if q == 'final' else 24
        for attr, val in (('use_raytracing', q == 'final'), ('use_shadows', True)):
            if hasattr(ee, attr): setattr(ee, attr, val)
        r.use_motion_blur = q == 'final'
    h = hints(sc)
    if q != 'mock' and sc.render.engine == 'BLENDER_EEVEE':
        ee = sc.eevee
        rt = h.get('raytracing')
        if rt is True or rt == q or (isinstance(rt, list) and q in rt):
            ee.use_raytracing = True
            if hasattr(ee, 'ray_tracing_options'):
                o = ee.ray_tracing_options
                o.resolution_scale = '1' if q == 'final' else '2'
                o.screen_trace_quality = 0.5 if q == 'final' else 0.25
        if h.get('fast_gi') and hasattr(ee, 'use_fast_gi'):
            ee.use_fast_gi = True; ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
            ee.fast_gi_resolution = '2' if q == 'final' else '4'
        if h.get('samples_' + q): ee.taa_render_samples = int(h['samples_' + q])
        if hasattr(ee, 'shadow_ray_count'):
            ee.shadow_ray_count = 2 if q == 'final' else 1
            ee.shadow_step_count = 10 if q == 'final' else 6
        if h.get('volumetrics') and hasattr(ee, 'volumetric_tile_size'):
            ee.volumetric_tile_size = '4' if q == 'final' else '8'
            ee.volumetric_samples = 96 if q == 'final' else 48
            if hasattr(ee, 'use_volumetric_shadows'): ee.use_volumetric_shadows = True
        if h.get('soft_shadows') and q == 'final':
            for ld in bpy.data.lights:
                if hasattr(ld, 'use_shadow_jitter') and ld.get('s3_jitter', True): ld.use_shadow_jitter = True
    if sc.render.engine == 'CYCLES' and h.get('cycles_samples') and 'samples' not in ctx.params:
        sc.cycles.samples = int(h['cycles_samples'])
    vs = sc.view_settings
    # the enum list is empty in background mode — set by name and fall back
    for vt in [v for v in (ctx.params.get('view'), h.get('view')) if v] + ['AgX', 'Filmic']:
        try: vs.view_transform = vt; break
        except Exception: pass
    lk = (ctx.params.get('look') or h.get('look') or 'None') if q != 'mock' else 'None'
    try: vs.look = lk
    except Exception: vs.look = 'None'
    if q != 'mock': vs.exposure = float(ctx.params.get('exposure', h.get('exposure', 0.0)))
    if 'gamma' in h: vs.gamma = float(h['gamma'])

try:
    s3.clear()
    ctx = s3.Ctx(job)
    s3.CTX = ctx
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = max(1, round(ctx.duration * ctx.fps))
    spec = importlib.util.spec_from_file_location('scene', job['scene'])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.build(ctx)
    sc = bpy.context.scene
    if not sc.camera:
        s3.camera()
    preset(ctx, sc)
    if job.get('blend'):
        bpy.ops.wm.save_as_mainfile(filepath=job['blend'], compress=True)
    out = job['outDir']
    os.makedirs(out, exist_ok=True)
    if job['mode'] == 'stills':
        times = job.get('times') or [ctx.duration / 2]
        for i, t in enumerate(times):
            sc.frame_set(ctx.frame(min(t, ctx.duration - 1 / ctx.fps)))
            sc.render.filepath = os.path.join(out, f'still-{i:02d}.png')
            bpy.ops.render.render(write_still=True)
            say('progress', f'{i + 1}/{len(times)}')
    elif job['mode'] == 'animation':
        sc.render.filepath = os.path.join(out, '')
        total = sc.frame_end - sc.frame_start + 1
        done = {'n': 0}
        def post(scene, *_):
            done['n'] += 1
            say('progress', f"{done['n']}/{total}")
        bpy.app.handlers.render_post.append(post)
        bpy.ops.render.render(animation=True)
    say('done')
except Exception:
    traceback.print_exc()
    say('error', traceback.format_exc().strip().splitlines()[-1])
    sys.exit(1)
