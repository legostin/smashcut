"""Kit · product hero on a white cyclorama — the clean Apple-style packshot.

A glossy product (a stand-in bottle — swap it for s3.import_model('media/product.glb')) on a podium, a slow turntable and a
dolly-in that ends on hero framing (works in 16:9 and 9:16).
params: preset ('white_cyc' | 'product_softbox' | 'dark_luxe' …), color (token / #hex, default 'accent'), label ('surface'),
        turns (0.12), podium ('cylinder' | 'stepped' | 'rounded' | 'pill')
"""
import studio3d as s3


def build(ctx):
    p = ctx.params
    s3.studio(p.get('preset', 'white_cyc'))
    pod = s3.podium(p.get('podium', 'cylinder'), radius=0.75, height=0.18)
    top = pod['top']

    # --- the product (replace with your model; keep its base on z = top) -------------------------------
    body = s3.rounded_cylinder(0.3, 1.15, 0.14, (0, 0, top + 0.575), material=s3.material('glossy_plastic', p.get('color', 'accent')))
    label = s3.cylinder(0.304, 0.26, (0, 0, top + 0.55), material=s3.material('satin', p.get('label', 'surface'), rough=0.45),
                        vertices=48 if ctx.quality == 'mock' else 128)
    cap = s3.rounded_cylinder(0.17, 0.26, 0.04, (0, 0, top + 1.27), material=s3.material('brushed_metal'))
    product = [body, label, cap]

    # --- motion: slow turn + dolly-in to the hero frame -------------------------------------------------
    s3.turntable_rig(product, turns=p.get('turns', 0.12), start=-20, ease='inOutSine')
    s3.rig_dolly([pod] + product, push=1.22, lens=70, direction=(0, -1, 0.26), margin=0.07, ease='outCubic')
