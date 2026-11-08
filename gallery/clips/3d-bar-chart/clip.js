// 3D bar chart: a base plate draws out, rounded bars rise through it one after another (outCubic) while value labels
// count up above them, the highlighted bar is in the accent colour, and the camera drifts on a gentle orbit arc.
// Bars "grow" by sliding up through a clipping plane at y = 0, so their rounded tops never squash.
import { stage, THREE, RoundedBoxGeometry } from 'studio3js';

function fitDistance(w, h, fov, aspect, fillW, fillH) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return Math.max(h / fillH / (2 * tan), w / fillW / (2 * tan * aspect));
}
/** "Q1:42, Q2:58" (also ; or new lines) → [{ label, value }] */
function parseData(s) {
  return String(s || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.lastIndexOf(':');
    return i < 0 ? { label: '', value: parseFloat(x) || 0 } : { label: x.slice(0, i).trim(), value: parseFloat(x.slice(i + 1)) || 0 };
  });
}

/** a text plane drawn on a canvas; set(text) redraws only when the string changes (cheap per frame) */
function label(S, { height = 0.4, px = 120, weight = 700, color = '#ffffff', aspect = 2.6 }) {
  const c = document.createElement('canvas');
  c.height = Math.round(px * 1.6); c.width = Math.round(c.height * aspect);
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  const css = '#' + S.color(color).getHexString();
  let last = null;
  mesh.userData.set = (txt) => {
    if (txt === last) return;
    last = txt;
    g.clearRect(0, 0, c.width, c.height);
    g.font = `${weight} ${px}px Inter, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = css;
    const w = g.measureText(txt).width, k = Math.min(1, (c.width * 0.96) / (w || 1));
    if (k < 1) g.font = `${weight} ${px * k}px Inter, sans-serif`;
    g.fillText(txt, c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  };
  return mesh;
}

studio.clip({
  duration: 7,
  async setup(root, p, { duration: D }) {
    const W = studio.width, H = studio.height, aspect = W / H, portrait = H > W;
    const FOV = 30;
    const S = await stage(root, { light: 'studio', fov: FOV, shadows: true, env: 0.7 });
    const { ease, range, lerp } = S;
    S.renderer.localClippingEnabled = true;
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // keep y ≥ 0

    const data = parseData(p.data);
    if (!data.length) data.push({ label: '', value: 1 });
    const N = data.length, max = Math.max(...data.map((d) => d.value), 1e-6);
    const decimals = Math.max(0, ...data.map((d) => (String(d.value).split('.')[1] || '').length));
    const hi = Number(p.highlight) > 0 ? Math.min(N, Number(p.highlight)) - 1 : data.findIndex((d) => d.value === max);

    // layout: pitch 1.15, bars 0.72 wide; taller bars in 9:16 so the chart fills the frame
    const pitch = 1.15, bw = 0.72, Wc = N * pitch;
    const Hmax = Math.max(2.2, portrait ? Wc * 1.15 : Wc * 0.5);
    const chart = new THREE.Group();
    S.scene.add(chart);

    const base = S.box(Wc + 0.5, 0.14, bw + 1.1, 0.06, S.mat({ color: 'surface', rough: 0.6 }));
    base.position.y = -0.07; base.receiveShadow = true;
    chart.add(base);
    S.ground({ y: -0.14, opacity: 0.28 });

    const accentMat = S.mat({ color: p.accent, rough: 0.3, clearcoat: 0.8, emissive: p.accent, emissiveIntensity: 0.12 });
    const bars = data.map((d, i) => {
      const h = Math.max(0.05, (d.value / max) * Hmax);
      const mat = (i === hi ? accentMat : S.mat({ color: p.barColor, rough: 0.45, clearcoat: 0.3 })).clone();
      Object.assign(mat, { clippingPlanes: [floor], clipShadows: true });
      const m = new THREE.Mesh(new RoundedBoxGeometry(bw, h, bw, 4, 0.07), mat);
      m.castShadow = true;
      m.position.x = (i - (N - 1) / 2) * pitch;
      chart.add(m);
      const val = label(S, { height: 0.42 * (i === hi ? 1.15 : 1), color: i === hi ? p.accent : p.textColor, aspect: 2.2 });
      const cat = label(S, { height: 0.34, px: 90, weight: 600, color: p.textColor, aspect: pitch / 0.3 * 0.95 });
      cat.userData.set(d.label);
      cat.material.opacity = 0.75;
      // printed flat on the plate in front of its bar (not below the plate: the shadow catcher writes depth)
      cat.rotation.x = -Math.PI / 2;
      cat.position.set(m.position.x, 0.004, bw / 2 + 0.3);
      chart.add(val, cat);
      return { m, h, val, cat, d, delay: 0.55 + i * Math.min(0.2, 1.6 / N) };
    });

    // camera: aim a little above the middle of the bars; orbit arc of ~17° over the whole clip
    const target = new THREE.Vector3(0, Hmax * 0.42, 0);
    const dist = fitDistance(Wc + 0.6, Hmax + 1.2, FOV, aspect, portrait ? 0.86 : 0.66, portrait ? 0.62 : 0.74);
    const fmt = (v) => v.toFixed(decimals) + (p.unit || '');

    return {
      render(t) {
        // base plate draws out from the centre (outExpo 0 → 0.8 s)
        const kb = ease.outExpo(range(t, 0, 0.8));
        base.scale.x = Math.max(1e-3, kb);
        bars.forEach((b) => {
          const k = ease.outCubic(range(t, b.delay, b.delay + 1.0));
          b.m.position.y = -b.h / 2 - 0.01 + b.h * k + (k > 0 ? 0.01 : 0); // slides up through y = 0
          b.m.visible = k > 0;
          // value label rides the top of the bar and counts up with it; it faces the camera (billboard)
          b.val.userData.set(fmt(b.d.value * k));
          b.val.position.set(b.m.position.x, b.h * k + 0.36, 0);
          b.val.material.opacity = range(t, b.delay + 0.1, b.delay + 0.4);
          b.val.visible = b.val.material.opacity > 0;
          b.cat.material.opacity = 0.75 * ease.outCubic(range(t, b.delay - 0.2, b.delay + 0.3));
        });
        const arc = lerp(-0.42, -0.12, ease.inOutSine(range(t, 0, D)));
        const push = lerp(1.08, 1, ease.outCubic(range(t, 0, 3)));
        S.camera.position.set(Math.sin(arc) * dist * push, target.y + dist * 0.28, Math.cos(arc) * dist * push);
        S.look(target.x, target.y, target.z);
        for (const b of bars) b.val.quaternion.copy(S.camera.quaternion);
        S.render();
      },
    };
  },
});
