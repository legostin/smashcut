"""Kit · lifestyle desk in warm window light (sunset_window — or 'daylight').

A laptop opens on a table next to a ceramic mug and a couple of books while low sun throws window-shaped shadows across
the wall. The laptop screen shows a project image / video (params.screen) or a gradient wallpaper.
params: preset ('sunset_window' | 'daylight'), screen, mug (colour, 'accent')
"""
import studio3d as s3


def build(ctx):
    p = ctx.params
    s3.studio(p.get('preset', 'sunset_window'))
    lap = s3.laptop(screen=p.get('screen'), width=1.5, open=108, location=(0.1, 0.1, 0), rotation=(0, 0, 12))
    hinge = s3.child(lap, 'hinge')
    mug = s3.rounded_cylinder(0.17, 0.36, 0.03, (-1.05, -0.35, 0.18), material=s3.material('ceramic', p.get('mug', 'accent')))
    s3.torus(0.1, 0.025, (-1.24, -0.35, 0.2), (90, 0, 0), material=s3.material('ceramic', p.get('mug', 'accent')))
    b1 = s3.rounded_box((0.85, 0.6, 0.07), 0.015, (1.15, -0.45, 0.035), (0, 0, -18), material=s3.material('matte', '#2f3a4a'))
    b2 = s3.rounded_box((0.8, 0.56, 0.06), 0.015, (1.15, -0.45, 0.1), (0, 0, -9), material=s3.material('matte', '#c9b79a'))
    # frame the open pose, then animate the lid opening
    cam = s3.rig_dolly([lap, mug, b1, b2], push=1.12, lens=50, direction=(0.1, -1, 0.42), margin=0.08, ease='inOutSine')
    s3.key(hinge, 'rotation_euler', 0.0, (-8, 0, 0), 'inOutCubic'); s3.key(hinge, 'rotation_euler', 1.8, (-108, 0, 0))
    return cam
