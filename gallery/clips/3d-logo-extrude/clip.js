// 3D logo extrude: the SVG's parts fly in from depth with a stagger and lock together, the lockup turns from a 3/4 view
// to front-facing, a soft light bar sweeps across the clearcoat, then a calm front hold over a shadow catcher.
import { stage, THREE } from 'studio3js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const FALLBACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><rect width="32" height="100" rx="16" fill="#d4ff3a"/><circle cx="70" cy="25" r="24" fill="#ffffff"/><path d="M62 100A58 58 0 0 1 120 42V100Z" fill="#7a5cff"/></svg>';

/** camera distance so a w×h object fills fillW of the frame width and at most fillH of its height */
function fitDistance(w, h, fov, aspect, fillW, fillH) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return Math.max(h / fillH / (2 * tan), w / fillW / (2 * tan * aspect));
}

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const W = studio.width, H = studio.height, aspect = W / H, portrait = H > W;
    const FOV = 30;
    const S = await stage(root, { light: 'studio', fov: FOV, shadows: !!p.shadow, env: 0.8 });
    const { ease, range, lerp } = S;

    // ---- the logo: one mesh per SVG path; brand mode recolours parts from the design tokens
    const brand = [p.accent, p.color, p.accent2];
    const logo = await S.svg(p.svg || FALLBACK_SVG, {
      size: 4, depth: p.depth, bevel: Math.min(0.05, p.depth * 0.15), curveSegments: 32,
      materialFor: (svgColor, i) => S.mat({
        color: p.colorMode === 'svg' ? svgColor : brand[i % brand.length],
        rough: 0.16, clearcoat: 1, clearcoatRough: 0.06, metal: 0.05,
      }),
    });
    S.shadows(logo);
    const rig = new THREE.Group(); // rig turns the whole lockup; parts animate inside it
    rig.add(logo);
    S.scene.add(rig);
    const box = new THREE.Box3().setFromObject(logo), size = box.getSize(new THREE.Vector3());
    const parts = logo.parts;

    // ---- framing: ~36 % of the width in 16:9, ~66 % in 9:16 (and never more than half the height)
    const dist = fitDistance(size.x, size.y, FOV, aspect, portrait ? 0.66 : 0.4, portrait ? 0.4 : 0.5);
    const camY = size.y * 0.18;
    if (p.shadow) S.ground({ y: -size.y / 2 - size.y * 0.08, opacity: 0.3 });

    // ---- light sweep: a tall soft bar light in front of the logo — its reflection is a band that slides across
    RectAreaLightUniformsLib.init();
    const sweep = new THREE.RectAreaLight(0xffffff, 0, size.x * 0.08, size.y * 3);
    sweep.rotation.z = -0.35;
    S.scene.add(sweep);

    // ---- per-part flight paths (seeded): start pushed out from the centre and deep behind, tumbled
    const r = S.rng(7);
    const N = parts.length;
    const flights = parts.map((m, n) => {
      const u = m.userData;
      const len = Math.hypot(u.x, u.y) || 1;
      const out = 1.4 + r() * 1.2;
      return {
        from: new THREE.Vector3((u.x / len) * out + (r() - 0.5), (u.y / len) * out + (r() - 0.5), -7 - r() * 4),
        rot: new THREE.Euler((r() - 0.5) * 1.8, (n % 2 ? 1 : -1) * (1.2 + r()), (r() - 0.5) * 1.4),
        delay: 0.15 + n * Math.min(0.18, 0.9 / N),
      };
    });

    return {
      render(t) {
        // parts: 1.3 s outExpo flight each, staggered; 0.3 s fade-in at the far end so nothing pops into existence
        parts.forEach((m, n) => {
          const f = flights[n], u = m.userData;
          const k = ease.outExpo(range(t, f.delay, f.delay + 1.3));
          m.position.set(lerp(u.x + f.from.x, u.x, k), lerp(u.y + f.from.y, u.y, k), lerp(u.z + f.from.z, u.z, k));
          m.rotation.set(f.rot.x * (1 - k), f.rot.y * (1 - k), f.rot.z * (1 - k));
          m.scale.setScalar(lerp(0.6, 1, k));
          const op = range(t, f.delay, f.delay + 0.3);
          m.material.opacity = op;
          m.material.transparent = op < 1;
          m.visible = op > 0;
        });
        // lockup: 3/4 view while assembling → front-facing by 3.4 s (inOutCubic), the extrusion reads on the way
        const turn = ease.inOutCubic(range(t, 0.2, 3.4));
        rig.rotation.set(lerp(0.16, 0, turn), lerp(-0.62, 0, turn), 0);
        // light sweep 2.9 → 4.3 s, left → right, intensity a sine bump
        const s = range(t, 2.9, 4.3);
        sweep.position.set(lerp(-size.x * 1.1, size.x * 1.1, ease.inOutCubic(s)), size.y * 0.1, 2.2);
        sweep.lookAt(sweep.position.x * 0.3, 0, 0);
        sweep.intensity = Math.sin(Math.PI * s) * 30;
        // camera: push-in 1.18 → 1.0 (outCubic 0 → 4 s), then a slow 2 % drift through the hold
        const push = lerp(1.18, 1, ease.outCubic(range(t, 0, 4))) - 0.02 * range(t, 4, D);
        S.camera.position.set(0, camY * push, dist * push);
        S.look(0, 0, 0);
        S.render();
      },
    };
  },
});
