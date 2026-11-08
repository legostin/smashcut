// Studio kit · product hero on a white cyclorama: a bevelled podium rises, the product lands on it and turns on a
// turntable under big softboxes (white_cyc preset), soft contact shadow, slow push-in on a gentle orbit arc.
// Built-in product: a glass bottle with tinted liquid, metal cap and a printed label — or your own .glb via `model`.
// Adapt: swap the preset (product_softbox for a graphite look), colours come from the design tokens.
import { stage, THREE } from 'studio3js';

/** smooth lathe profile through key points (x = radius, y = height) */
const smooth = (pts, n = 64) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(n);

function labelTexture(S, name, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#16161a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let px = 150; g.font = `800 ${px}px Inter, sans-serif`;
  px = Math.min(px, (px * 860) / g.measureText(name).width); g.font = `800 ${px}px Inter, sans-serif`;
  g.fillText(name, 512, 230);
  g.font = '600 40px Inter, sans-serif'; g.globalAlpha = 0.6; g.fillText(sub, 512, 360); g.globalAlpha = 1;
  g.fillStyle = '#' + S.color('accent').getHexString(); g.fillRect(452, 410, 120, 10);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function bottle(S, p) {
  const g = new THREE.Group();
  // profile: base fillet, a truly straight wall (the label sits on it), curved shoulder, neck
  const R = 0.46, body = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); body.push(new THREE.Vector2(R - 0.07 + Math.cos(a) * 0.07, 0.07 + Math.sin(a) * 0.07)); }
  body.push(...new THREE.QuadraticBezierCurve(new THREE.Vector2(R, 0.98), new THREE.Vector2(R, 1.27), new THREE.Vector2(0.17, 1.29)).getPoints(24));
  body.push(new THREE.Vector2(0.16, 1.31), new THREE.Vector2(0.16, 1.42), new THREE.Vector2(0, 1.42));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(body, 96), S.materials.glass({ thickness: 0.9, roughness: 0.03, attenuationColor: '#ffffff' }));
  // liquid: opaque glossy, a little smaller — seen through the glass, refracted
  const liq = [[0, 0.07], [0.36, 0.07], [0.4, 0.11], [0.405, 0.2], [0.405, 0.74], [0, 0.74]].map(([x, y]) => new THREE.Vector2(x, y));
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(liq, 96), S.materials.glossyPlastic({ color: p.color, roughness: 0.12 }));
  const capProf = smooth([[0.001, 1.42], [0.2, 1.42], [0.215, 1.45], [0.215, 1.86], [0.2, 1.9], [0.001, 1.9]], 32);
  const capMat = p.cap === 'chrome' ? S.materials.chrome() : p.cap === 'black' ? S.materials.glossyPlastic({ color: '#111114', roughness: 0.3 }) : S.materials.gold();
  const cap = new THREE.Mesh(new THREE.LatheGeometry(capProf, 96), capMat);
  // printed label: front face carries the artwork, the back of the paper is plain (seen through the glass)
  const labelGeo = new THREE.CylinderGeometry(0.463, 0.463, 0.5, 96, 1, true, -0.75, 1.5);
  const label = new THREE.Mesh(labelGeo, new THREE.MeshPhysicalMaterial({ map: labelTexture(S, String(p.label || 'NOVA').toUpperCase(), 'EAU DE PARFUM · 50 ML'), roughness: 0.55 }));
  const backing = new THREE.Mesh(labelGeo, new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.8, side: THREE.BackSide }));
  label.position.y = backing.position.y = 0.6;
  g.add(liquid, glass, cap, label, backing);
  g.scale.setScalar(1.15);
  return g;
}

/** a loaded model scaled to `height`, centred in x/z, standing on y = 0 */
function normalise(obj, height) {
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  obj.scale.setScalar(height / Math.max(s.y, s.x * 0.8, s.z * 0.8, 1e-6));
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -b2.min.y, -c.z);
  const wrap = new THREE.Group(); wrap.add(obj);
  return wrap;
}

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    const S = await stage(root, { fov: 30, studio: { kind: p.studio, backdrop: p.backdrop, size: 2 } });
    const { ease, range, lerp } = S;

    const ped = S.podium({ shape: 'cylinder', radius: 1.05, height: 0.34, bevel: 0.05, material: S.materials.mattePlastic({ color: p.podium, roughness: 0.5 }) });
    S.scene.add(ped);

    let product = null;
    if (String(p.model || '').trim()) {
      try { product = normalise((await S.model(p.model.trim())).scene, 2.1); } catch (e) { console.warn('model failed, using the built-in bottle:', e.message); }
    }
    if (!product) product = bottle(S, p);
    const spinner = new THREE.Group();
    spinner.add(product);
    S.scene.add(spinner);

    // frame podium + product at rest (as a box) for 16:9 or 9:16, three-quarter view from slightly above
    const rest = new THREE.Box3().setFromObject(ped).union(new THREE.Box3().setFromObject(product).translate(new THREE.Vector3(0, ped.top, 0)));
    S.camera.setBase([0, 1.6, 8], [0, 1, 0]);
    S.frame(rest, { margin: portrait ? [0.12, 0.2] : [0.3, 0.1], elevation: 9 });

    return {
      render(t) {
        const kp = ease.outExpo(range(t, 0, 1.0));
        ped.position.y = lerp(-0.4, 0, kp);
        ped.scale.setScalar(lerp(0.9, 1, kp));
        const kd = ease.outCubic(range(t, 0.35, 1.5));
        spinner.position.y = ped.position.y + ped.top + lerp(0.9, 0, kd);
        spinner.scale.setScalar(lerp(0.92, 1, kd));
        spinner.visible = t >= 0.35;
        S.turntable(spinner, t, { speed: p.spin, start: -30 + (1 - kd) * -70, ramp: 0.8 });
        S.camera.move(t, { pushIn: { amount: 0.1 }, orbit: { from: -10, to: 6 }, crane: { from: 3, to: -2 } });
        S.render(t);
      },
    };
  },
});
