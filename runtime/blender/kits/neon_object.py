"""Kit · neon object shot: a black glossy ring and a chrome orb between two coloured neon strips (accent / accent-2),
wet reflective floor, visible neon tubes and a touch of haze. Slow turn + orbit.
params: tubes (true), haze (0.0015), ring ('chrome' | 'black_glass' | any MATERIALS name), orb (colour, 'text')
"""
import studio3d as s3


def build(ctx):
    p = ctx.params
    s3.studio('neon', tubes=p.get('tubes', True), haze_density=p.get('haze'))
    pod = s3.podium('pill', radius=0.55, height=0.16)
    top = pod['top']
    ring = s3.torus(0.62, 0.13, (0, 0, top + 0.78), (90, 0, 0), material=s3.material(p.get('ring', 'chrome')))
    orb = s3.sphere(0.28, (0, 0, top + 0.78), material=s3.material('glossy_plastic', p.get('orb', 'text')))
    s3.turntable_rig([ring], turns=0.12, start=-25, ease='inOutSine')
    s3.key(orb, 'location', 0, (0, 0, top + 0.72), 'inOutSine'); s3.key(orb, 'location', ctx.duration, (0, 0, top + 0.84))
    s3.rig_orbit([pod, ring], start=-108, end=-72, lens=55, elevation=10, margin=0.16)
