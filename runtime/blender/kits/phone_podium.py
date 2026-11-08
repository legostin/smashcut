"""Kit · phone mockup turning on a stepped podium (product_softbox studio).

The procedural phone shows a project image or video on its screen (params.screen = 'media/ui.png' / 'media/demo.mp4';
none → a gradient wallpaper in the design accents) and swings from three-quarter to three-quarter.
params: screen, frame ('satin_metal' | 'chrome' | colour), back (colour / material name), preset ('product_softbox'),
        swing (degrees, 40)
"""
import studio3d as s3


def build(ctx):
    p = ctx.params
    s3.studio(p.get('preset', 'product_softbox'))
    pod = s3.podium('stepped', radius=0.85, height=0.3, steps=2)
    phone = s3.phone(screen=p.get('screen'), height=1.5, location=(0, 0, pod['top']), frame=p.get('frame'), back=p.get('back'))
    swing = p.get('swing', 40)
    s3.turntable_rig(phone, turns=2 * swing / 360, start=-swing, ease='inOutSine')
    s3.rig_dolly([pod, phone], push=1.1, lens=55, direction=(0, -1, 0.16), margin=0.09, ease='inOutSine')
