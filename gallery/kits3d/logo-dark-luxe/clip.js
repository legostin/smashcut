// Studio kit · logo in dark luxe: the extruded logo (your SVG) floats just above a dark, softly reflective floor,
// turns from a 3/4 view to front while the camera pushes in; strip rim lights trace its edges, a soft halo glows on the
// seamless wall behind and a thin light bar sweeps across the face at the end. Finish: chrome, gold, black gloss, brand.
import { stage, THREE } from 'studio3js';

const FALLBACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><rect width="32" height="100" rx="16" fill="#d4ff3a"/><circle cx="70" cy="25" r="24" fill="#ffffff"/><path d="M62 100A58 58 0 0 1 120 42V100Z" fill="#7a5cff"/></svg>';

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    const S = await stage(root, { fov: 26, studio: { kind: p.studio, backdrop: p.backdrop, size: 2, halo: p.halo } });
    const { ease, range, lerp } = S;
    const M = S.materials;
    const finish = {
      chrome: () => M.chrome({ roughness: 0.06 }),
      gold: () => M.gold({ roughness: 0.14 }),
      black: () => M.glossyPlastic({ color: '#0b0b0d', roughness: 0.18 }),
    }[p.finish];

    // the logo: one mesh per SVG path; brand finish keeps the SVG colours as glossy lacquer
    const logo = await S.svg(p.svg || FALLBACK_SVG, {
      size: 3.2, depth: p.depth, bevel: Math.min(0.05, p.depth * 0.14), curveSegments: 40,
      materialFor: (c) => (finish ? finish() : M.glossyPlastic({ color: c, roughness: 0.2 })),
    });
    const box = new THREE.Box3().setFromObject(logo), size = box.getSize(new THREE.Vector3());
    const lift = 0.18; // floating gap above the floor (the reflection and contact shadow sell it)
    const rig = new THREE.Group();
    rig.add(logo);
    logo.position.y = size.y / 2 + lift;
    S.scene.add(rig);

    // light bar sweeping across the face (a thin RectAreaLight in front of the logo)
    const bar = new THREE.RectAreaLight(0xffffff, 0, 0.12, size.y * 2.6);
    bar.rotation.z = -0.3;
    S.scene.add(bar);

    S.camera.setBase([0, 1.4, 9], [0, size.y / 2 + lift, 0]);
    S.frame(new THREE.Box3(new THREE.Vector3(-size.x / 2, 0, -0.5), new THREE.Vector3(size.x / 2, size.y + lift, 0.5)),
      { margin: portrait ? [0.1, 0.3] : [0.26, 0.2], elevation: 7 });

    return {
      render(t) {
        // fade/rise in, 3/4 → front (inOutCubic 0.2 → 3.6 s)
        const kin = ease.outCubic(range(t, 0, 1.4));
        logo.traverse((m) => { if (m.isMesh) { m.material.transparent = kin < 1; m.material.opacity = kin; } });
        rig.position.y = lerp(-0.25, 0, kin);
        const turn = ease.inOutCubic(range(t, 0.2, 3.6));
        rig.rotation.y = lerp(-0.75, 0, turn);
        // light bar: sweeps left → right 3.6 → 4.9 s, intensity a sine bump
        const ks = range(t, 3.6, 4.9);
        bar.intensity = Math.sin(ks * Math.PI) * 40;
        bar.position.set(lerp(-size.x * 0.9, size.x * 0.9, ease.inOutSine(ks)), size.y / 2 + lift, 1.4);
        bar.lookAt(bar.position.x * 0.4, size.y / 2 + lift, 0);
        bar.rotateZ(-0.3);
        S.camera.move(t, { dolly: { from: 1.18, to: 1, end: D, ease: 'outCubic' }, crane: { from: 6, to: 0, end: 4 } });
        S.render(t);
      },
    };
  },
});
