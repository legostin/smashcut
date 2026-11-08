// Studio kit · neon object: a glossy object hovers and turns above a small pedestal on a black set lit by two coloured
// strip lights (accent / accent2 from the design tokens) — visible neon tubes with bloom, coloured washes on the
// seamless wall, a wet reflective floor and light haze (S.studio neon). The camera arcs slowly around it.
// Object: knot, ring, blob (displaced sphere), capsule stack, or your text / SVG logo.
import { stage, THREE } from 'studio3js';

function blob(S) {
  const geo = new THREE.IcosahedronGeometry(0.75, 48), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = Math.sin(v.x * 3.1 + 1.3) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 3.3 + 2.1);
    v.multiplyScalar(0.75 * (1 + 0.16 * n));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    const S = await stage(root, { fov: 30, studio: { kind: p.studio, backdrop: p.backdrop, size: 2, haze: p.haze, accent: p.accent, accent2: p.accent2 } });
    const { ease, range, lerp } = S;
    const M = S.materials;
    const material = { black: () => M.glossyPlastic({ color: '#0a0a0c', roughness: 0.12 }), chrome: () => M.chrome({ roughness: 0.05 }),
      iridescent: () => M.iridescent(), glass: () => M.glass({ thickness: 1 }) }[p.material]?.() || M.glossyPlastic({ color: '#0a0a0c' });

    let obj;
    if (p.object === 'text' || p.object === 'logo') {
      obj = p.object === 'text'
        ? await S.text(String(p.text || 'NEON'), { size: 0.9, depth: 0.3, bevel: 0.03, weight: 800, material })
        : await S.svg(p.svg, { size: 2.2, depth: 0.35, bevel: 0.03, curveSegments: 32, material });
    } else {
      const geo = { knot: () => new THREE.TorusKnotGeometry(0.55, 0.19, 260, 40, 2, 3), ring: () => new THREE.TorusGeometry(0.7, 0.24, 64, 160),
        blob: () => blob(S), capsules: () => null }[p.object]?.();
      if (geo) obj = new THREE.Mesh(geo, material);
      else { // a stack of three capsules
        obj = new THREE.Group();
        [-0.5, 0, 0.5].forEach((x, i) => { const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 16, 48), material); c.position.set(x, (i - 1) * 0.12, 0); c.rotation.z = 0.35; obj.add(c); });
      }
    }
    const box = new THREE.Box3().setFromObject(obj), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    obj.position.sub(c);
    const hover = new THREE.Group();
    hover.add(obj);
    S.scene.add(hover);
    const ped = S.podium({ shape: 'cylinder', radius: 0.7, height: 0.18, bevel: 0.03, ring: p.accent, ringIntensity: 3, material: M.glossyPlastic({ color: '#0d0d10', roughness: 0.3 }) });
    S.scene.add(ped);
    const baseY = ped.top + 0.35 + sz.y / 2;

    S.camera.setBase([0, 1.2, 9], [0, baseY * 0.85, 0]);
    S.frame(new THREE.Box3(new THREE.Vector3(-Math.max(sz.x, 1.4) / 2, 0, -0.7), new THREE.Vector3(Math.max(sz.x, 1.4) / 2, baseY + sz.y / 2, 0.7)),
      { margin: portrait ? [0.14, 0.24] : [0.33, 0.14], elevation: 6 });

    // the preset's neon tubes + their strip lights, to strike them on
    const H = S.studioHandle || { tubes: [], lights: {} };
    const tubes = H.tubes || [], tubeCol = tubes.map((m) => m.material.color.clone());
    const strips = ['a', 'b'].filter((k) => H.lights[k]).map((k) => [H.lights[k], H.lights[k].intensity]);

    return {
      render(t) {
        const kin = ease.outExpo(range(t, 0.1, 1.6));
        hover.position.y = baseY + lerp(-0.8, 0, kin) + Math.sin(t * 1.4) * 0.06 * range(t, 1, 2);
        hover.scale.setScalar(lerp(0.4, 1, kin));
        // shapes turn continuously; text and logos sway (they must stay readable)
        const flat = p.object === 'text' || p.object === 'logo';
        const yaw = flat ? Math.sin(t * 0.8) * THREE.MathUtils.degToRad(Math.min(28, p.spin)) * range(t, 0.8, 2) : t * THREE.MathUtils.degToRad(p.spin);
        hover.rotation.set(Math.sin(t * 0.6) * (flat ? 0.05 : 0.12), lerp(flat ? -1.2 : -2.2, 0, kin) + yaw, 0);
        // tubes and ring flicker on (deterministic), like real neon striking
        const on = (a) => (t < a ? 0 : t < a + 0.1 ? 0.35 : t < a + 0.2 ? 0.04 : 1);
        tubes.forEach((m, i) => { const k = on(0.1 + i * 0.2); m.visible = k > 0.04; m.material.color.copy(tubeCol[i]).multiplyScalar(k); });
        strips.forEach(([l, base], i) => { l.intensity = base * on(0.1 + i * 0.2); });
        ped.ring.visible = on(0.55) > 0.04;
        S.camera.move(t, { orbit: { from: -9, to: 9, ease: 'inOutSine' }, pushIn: { amount: 0.06 } });
        S.render(t);
      },
    };
  },
});
