"""Kit · logo / word reveal in the dark_luxe studio.

Chrome type (or an SVG logo) rises and turns into place over a glossy black floor while the rim strips sweep up;
a slow push-in ends on the hero frame.
params: text ('LAUNCH'), svg (e.g. 'media/logo.svg' — used instead of text), material ('chrome' | 'gold' | 'satin_metal' …),
        family ('inter'), weight (800)
"""
import studio3d as s3


def build(ctx):
    p = ctx.params
    st = s3.studio(p.get('preset', 'dark_luxe'))
    mat = s3.material(p.get('material', 'chrome'))
    if p.get('svg'):
        mark = s3.logo(p['svg'], height=0.6, depth=0.1, material=mat, location=(0, 0, 0.8))
    else:
        mark = s3.title(p.get('text', 'LAUNCH'), size=0.55, depth=0.14, bevel=0.014, family=p.get('family', 'inter'),
                        weight=p.get('weight', 800), material=mat, location=(0, 0, 0.8), tracking=0.04)
    # frame the final pose first, then animate into it
    cam = s3.rig_dolly(mark, push=1.18, lens=70, direction=(0, -1, 0.12), margin=0.14, ease='outCubic')
    s3.key(mark, 'location', 0.0, (0, 0, 0.45), 'outExpo'); s3.key(mark, 'location', 1.6, (0, 0, 0.8))
    s3.key(mark, 'rotation_euler', 0.0, (90, 0, -32), 'outCubic'); s3.key(mark, 'rotation_euler', 2.0, (90, 0, 0))
    for name in ('rim_l', 'rim_r'):
        lo = st.lights.get(name)
        if lo:
            e = lo.data.energy
            s3.key(lo, 'data.energy', 0.0, e * 0.05, 'inOutSine'); s3.key(lo, 'data.energy', 1.4, e)
    return cam
