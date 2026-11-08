"""Kit · floating type in an infinite gradient void (abstract_void).

Words float at different depths, pop in with a stagger and drift; the camera pushes in while the focus pulls from the
first word to the last (depth of field). The void colours come from the design system (bg + accent).
params: words (['DESIGN', 'IN', 'DEPTH']), accent_word (index, 1), family ('inter'), weight (800)
"""
import studio3d as s3


def build(ctx):
    p = ctx.params
    s3.studio(p.get('preset', 'abstract_void'))
    words = p.get('words', ['DESIGN', 'IN', 'DEPTH'])
    hi = p.get('accent_word', 1)
    n = len(words)
    objs = []
    for i, w in enumerate(words):
        mat = s3.material('glossy_plastic', 'accent') if i == hi else s3.material('satin', 'text', rough=0.3)
        z = 1.0 + ((n - 1) / 2 - i) * 0.6
        o = s3.title(w, size=0.5, depth=0.12, family=p.get('family', 'inter'), weight=p.get('weight', 800), material=mat,
                     location=(0, i * 0.55, z))
        o.rotation_euler[2] = -0.12  # a slight turn reads as depth
        objs.append(o)
    cam = s3.rig_push_focus(objs, focus_from=objs[0], focus_to=objs[-1], fstop=2.0, push=1.15, lens=60,
                            direction=(0.22, -1, 0.08), margin=0.12)
    # pop in with a stagger, then drift (keys after framing so the frame matches the settled pose)
    for i, o in enumerate(objs):
        z = o.location.z
        s3.pop(o, 0.15 + i * 0.18, 0.7, 'outBack')
        s3.key(o, 'location', 0.15 + i * 0.18, (o.location.x, o.location.y, z - 0.08), 'inOutSine')
        s3.key(o, 'location', ctx.duration, (o.location.x, o.location.y, z + 0.06))
    return cam
