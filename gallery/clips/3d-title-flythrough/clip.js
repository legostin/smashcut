// 3D title flythrough: per-letter extruded type flips and drops into place with a stagger while the camera pushes in
// from a high, offset angle; an accent rule draws under it, an optional second line rises, then a front-facing hold.
import { stage, THREE } from 'studio3js';

function fitDistance(w, h, fov, aspect, fillW, fillH) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return Math.max(h / fillH / (2 * tan), w / fillW / (2 * tan * aspect));
}
/** outBack with a gentle overshoot (≈4 %) — reads as a settle, not a bounce */
const outBackSoft = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

const FINISH = {
  satin: { rough: 0.38, clearcoat: 0.3 },
  gloss: { rough: 0.2, clearcoat: 1, clearcoatRough: 0.05 },
  chrome: { metal: 1, rough: 0.14 },
};

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const W = studio.width, H = studio.height, aspect = W / H, portrait = H > W;
    const FOV = 32;
    const S = await stage(root, { light: 'studio', fov: FOV, env: p.finish === 'chrome' ? 1.2 : 0.8 });
    const { ease, range, lerp } = S;

    // 9:16: a two-word title breaks onto two lines at the space nearest the middle
    let title = String(p.text || 'Title');
    if (portrait && !title.includes('\n') && title.includes(' ')) {
      const mid = title.length / 2;
      const spaces = [...title].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i >= 0);
      const at = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
      title = title.slice(0, at) + '\n' + title.slice(at + 1);
    }

    const lockup = new THREE.Group();
    S.scene.add(lockup);
    const main = await S.text(title, {
      size: 1, depth: 0.32, bevel: 0.03, weight: Number(p.weight) || 800, letterSpacing: 0.035, perChar: true,
      material: S.mat({ color: p.color, ...(FINISH[p.finish] || FINISH.gloss) }),
    });
    // one material per letter, so each can fade in on its own
    main.children.forEach((m) => { m.material = m.material.clone(); });
    lockup.add(main);
    const mb = new THREE.Box3().setFromObject(main), ms = mb.getSize(new THREE.Vector3());

    // accent rule + optional second line under the title
    const rule = S.box(Math.min(ms.x * 0.22, 2.2), 0.06, 0.06, 0.03, S.mat({ color: p.accent, rough: 0.3, emissive: p.accent, emissiveIntensity: 0.25 }));
    rule.position.y = mb.min.y - 0.32;
    lockup.add(rule);
    let sub = null;
    if (String(p.subtitle || '').trim()) {
      sub = await S.text(p.subtitle, { size: 0.3, depth: 0.05, bevel: 0.006, weight: 500, letterSpacing: 0.06, perChar: true, material: S.mat({ color: p.color, rough: 0.45 }) });
      sub.children.forEach((m) => { m.material = m.material.clone(); });
      const sb = new THREE.Box3().setFromObject(sub);
      const subScale = Math.min(1, (ms.x * 0.95) / (sb.max.x - sb.min.x)); // never wider than the title
      sub.scale.setScalar(subScale);
      sub.position.y = rule.position.y - 0.32 - (sb.max.y * subScale);
      lockup.add(sub);
    }
    // centre the whole lockup vertically
    const lb = new THREE.Box3().setFromObject(lockup), ls = lb.getSize(new THREE.Vector3());
    lockup.position.y = -(lb.min.y + lb.max.y) / 2;

    const dist = fitDistance(ls.x, ls.y, FOV, aspect, portrait ? 0.74 : 0.64, portrait ? 0.5 : 0.6);
    const letters = main.children, N = letters.length;
    const rest = letters.map((m) => m.position.clone());
    const stagger = Math.min(0.07, 1.1 / N);
    const subLetters = sub ? sub.children : [];
    const subRest = subLetters.map((m) => m.position.clone());

    return {
      render(t) {
        // letters: drop from above + behind, flip forward over x, settle with a soft overshoot (1.1 s each)
        letters.forEach((m, i) => {
          const d = 0.2 + i * stagger;
          const kp = ease.outCubic(range(t, d, d + 1.1));
          const kr = outBackSoft(range(t, d, d + 1.1));
          const r = rest[i];
          m.position.set(r.x, r.y + (1 - kp) * 1.6, r.z - (1 - kp) * 2.4);
          m.rotation.x = (1 - kr) * -Math.PI * 0.85;
          const op = range(t, d, d + 0.25);
          m.material.opacity = op; m.material.transparent = op < 1; m.visible = op > 0;
        });
        const tLand = 0.2 + (N - 1) * stagger + 0.6; // ≈ when the last letter has mostly landed
        // rule: draws from the centre (outExpo 0.8 s)
        const kr = ease.outExpo(range(t, tLand - 0.2, tLand + 0.6));
        rule.scale.x = Math.max(1e-3, kr); rule.visible = kr > 0.001;
        // second line: letters rise 0.25 and fade in, 0.02 s stagger, outCubic 0.7 s
        subLetters.forEach((m, i) => {
          const d = tLand + i * 0.02;
          const k = ease.outCubic(range(t, d, d + 0.7));
          m.position.set(subRest[i].x, subRest[i].y - (1 - k) * 0.25, subRest[i].z);
          m.material.opacity = k; m.material.transparent = k < 1; m.visible = k > 0;
        });
        // camera: high, left-offset and far → front and close (outCubic 0 → 3.8 s), then a 2 % drift through the hold
        const k = ease.outCubic(range(t, 0, 3.8));
        const z = dist * (lerp(1.75, 1, k) - 0.02 * range(t, 3.8, D));
        S.camera.position.set(lerp(-dist * 0.32, 0, k), lerp(dist * 0.22, dist * 0.02, k), z);
        S.look(0, 0, 0);
        S.render();
      },
    };
  },
});
