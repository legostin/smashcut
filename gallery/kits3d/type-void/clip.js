// Studio kit · floating type in an abstract void: extruded letters rise out of an endless gradient void (no horizon)
// with a stagger, settle and keep a gentle per-letter float; soft key + coloured rims, a few satellite shapes drift
// around them, the camera floats with a slow push-in. Material: glossy, iridescent, chrome, clay or glass.
import { stage, THREE } from 'studio3js';

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    const S = await stage(root, { fov: 30, studio: { kind: p.studio, backdrop: p.backdrop, size: 2, color: p.bg } });
    const { ease, range, lerp } = S;
    const M = S.materials;
    const mk = {
      glossy: () => M.glossyPlastic({ color: p.color }),
      iridescent: () => M.iridescent({ color: p.color }),
      chrome: () => M.chrome({ roughness: 0.08 }),
      clay: () => M.clay({ color: p.color }),
      glass: () => M.glass({ thickness: 0.4, attenuationColor: p.color, attenuationDistance: 0.6 }),
    }[p.material] || (() => M.glossyPlastic({ color: p.color }));
    const material = mk();

    // in 9:16 long words break onto two lines (one word per line)
    const words = String(p.text || 'FLOAT').trim();
    const str = portrait && words.includes(' ') ? words.split(/\s+/).join('\n') : words;
    const type = await S.text(str, { size: 1, depth: 0.32, bevel: 0.03, weight: p.weight, perChar: true, letterSpacing: 0.02, material });
    S.scene.add(type);
    const letters = type.children;
    const rest = letters.map((m) => m.position.clone());

    // satellites: a few seeded primitives in the accent colours, behind and around the word
    const r = S.rng(11);
    const geos = [new THREE.SphereGeometry(0.22, 48, 24), new THREE.TorusGeometry(0.2, 0.07, 24, 64), new THREE.IcosahedronGeometry(0.22, 0)];
    const bb = new THREE.Box3().setFromObject(type), sz = bb.getSize(new THREE.Vector3());
    const sats = Array.from({ length: p.satellites }, (_, i) => {
      const m = new THREE.Mesh(geos[i % 3], i % 2 ? M.glossyPlastic({ color: 'accent2' }) : M.iridescent({ color: '#e8e8f0' }));
      const a = (i / Math.max(1, p.satellites)) * Math.PI * 2 + r() * 0.6;
      m.userData.base = new THREE.Vector3(Math.cos(a) * (sz.x * 0.55 + 0.4), Math.sin(a) * (sz.y * 0.75 + 0.35), -0.6 - r() * 1.4);
      m.userData.phase = r() * Math.PI * 2;
      m.scale.setScalar(0.7 + r() * 0.8);
      S.scene.add(m);
      return m;
    });

    S.camera.setBase([0, 0.3, 9], [0, 0, 0]);
    S.frame(bb, { margin: portrait ? [0.17, 0.3] : [0.2, 0.28], elevation: 3 });

    return {
      render(t) {
        letters.forEach((m, i) => {
          const d = 0.15 + i * 0.07;
          const k = ease.outExpo(range(t, d, d + 1.3));
          const bob = Math.sin(t * 1.3 + i * 0.7) * 0.05 * range(t, d + 0.8, d + 1.8);
          m.position.set(rest[i].x, rest[i].y + lerp(-1.6, 0, k) + bob, rest[i].z + lerp(-1.2, 0, k));
          m.rotation.set(lerp(1.3, 0, k) + Math.sin(t * 0.9 + i) * 0.04, Math.sin(t * 0.7 + i * 1.3) * 0.08, 0);
          m.scale.setScalar(lerp(0.6, 1, k));
          m.visible = t > d;
        });
        sats.forEach((m, i) => {
          const b = m.userData.base, ph = m.userData.phase, k = ease.outCubic(range(t, 0.6 + i * 0.12, 2 + i * 0.12));
          m.position.set(b.x * lerp(1.6, 1, k), b.y * lerp(1.6, 1, k) + Math.sin(t * 0.8 + ph) * 0.12, b.z);
          m.rotation.set(t * 0.4 + ph, t * 0.6 + ph, 0);
          m.visible = k > 0.001;
        });
        S.camera.move(t, { pushIn: { amount: 0.07 }, drift: { amount: 0.02, speed: 0.25 } });
        S.render(t);
      },
    };
  },
});
