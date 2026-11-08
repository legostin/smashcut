// 3D product turntable: a product (procedural can / phone, or your .glb) drops onto a podium and turns slowly under a
// key light with two rim lights (one in the brand accent) and a glowing ring on the podium edge; soft floor shadow.
import { stage, THREE } from 'studio3js';

function fitDistance(w, h, fov, aspect, fillW, fillH) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return Math.max(h / fillH / (2 * tan), w / fillW / (2 * tan * aspect));
}
/** dark or light ink for text printed on colour c */
const inkOn = (c) => (c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 > 0.35 ? '#0b0b0d' : '#ffffff');

/** label artwork for the can: drawn once on a canvas (deterministic), wrapped around the label cylinder.
 *  Canvas aspect = circumference : height (2πr : h), so the artwork isn't stretched. The name runs vertically —
 *  it reads in full on a curved surface at any turn angle (a horizontal word would wrap out of view). */
function labelTexture(S, name, accent, aspect) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = Math.round(2048 / aspect);
  const g = c.getContext('2d');
  const col = S.color(accent), ink = inkOn(col);
  g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.globalAlpha = 0.1;
  for (let i = 0; i < 16; i++) g.fillRect(i * 128 + 20, 0, 18, c.height); // fine pinstripes
  g.globalAlpha = 1;
  g.textBaseline = 'middle'; g.textAlign = 'center';
  for (const x of [512, 1536]) { // twice around: one name faces the camera every half turn
    g.save(); g.translate(x, c.height / 2); g.rotate(-Math.PI / 2);
    let px = 230; g.font = `900 ${px}px Inter, sans-serif`;
    px = Math.min(px, (px * c.height * 0.86) / g.measureText(name).width);
    g.font = `900 ${px}px Inter, sans-serif`; g.fillText(name, 0, 0);
    g.restore();
    g.font = '600 30px Inter, sans-serif'; g.globalAlpha = 0.8;
    g.save(); g.translate(x + 170, c.height / 2); g.rotate(-Math.PI / 2); g.fillText('SPARKLING  ·  330 ML', 0, 0); g.restore();
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function screenTexture(S, accent, accent2) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 512, 1024);
  gr.addColorStop(0, '#' + S.color(accent2).getHexString()); gr.addColorStop(1, '#' + S.color(accent).getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 512, 1024);
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.textAlign = 'center';
  g.font = '700 150px Inter, sans-serif'; g.fillText('9:41', 256, 330);
  g.font = '500 40px Inter, sans-serif'; g.fillText('Monday, June 12', 256, 400);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCan(S, p) {
  const g = new THREE.Group();
  // lathe profile (x = radius, y = height): domed base, straight wall, necked shoulder, rolled rim
  const pts = [[0, 0.06], [0.3, 0.02], [0.4, 0], [0.46, 0.04], [0.5, 0.14], [0.5, 1.5], [0.48, 1.6], [0.42, 1.7], [0.385, 1.76], [0.385, 1.8], [0.395, 1.815], [0.38, 1.83], [0.34, 1.82], [0, 1.8]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), S.mat({ color: '#d9dde3', metal: 1, rough: 0.22 }));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.503, 0.503, 1.3, 72, 1, true),
    S.mat({ color: '#ffffff', rough: 0.3, clearcoat: 0.7 }));
  label.material.map = labelTexture(S, String(p.label || 'NOVA').toUpperCase(), p.accent, (2 * Math.PI * 0.503) / 1.3);
  label.position.y = 0.16 + 1.3 / 2 + 0.02;
  g.add(body, label);
  g.scale.setScalar(1.3); // ≈ 2.4 units tall
  return g;
}

function buildPhone(S, p) {
  const g = new THREE.Group();
  const w = 0.92, h = 1.9, d = 0.09;
  g.add(S.box(w, h, d, 0.12, S.mat({ color: '#7d808a', metal: 0.9, rough: 0.3 })));
  // screen: rounded rect in front of the body, the canvas as an emissive map so it reads like a lit display
  const sh = new THREE.Shape(), sw = w - 0.07, shh = h - 0.07, r = 0.09;
  sh.moveTo(-sw / 2 + r, -shh / 2); sh.lineTo(sw / 2 - r, -shh / 2); sh.quadraticCurveTo(sw / 2, -shh / 2, sw / 2, -shh / 2 + r);
  sh.lineTo(sw / 2, shh / 2 - r); sh.quadraticCurveTo(sw / 2, shh / 2, sw / 2 - r, shh / 2); sh.lineTo(-sw / 2 + r, shh / 2);
  sh.quadraticCurveTo(-sw / 2, shh / 2, -sw / 2, shh / 2 - r); sh.lineTo(-sw / 2, -shh / 2 + r); sh.quadraticCurveTo(-sw / 2, -shh / 2, -sw / 2 + r, -shh / 2);
  const sg = new THREE.ShapeGeometry(sh, 8);
  // ShapeGeometry UVs are in shape units → normalise to 0..1
  const uv = sg.attributes.uv, pos = sg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / sw + 0.5, pos.getY(i) / shh + 0.5);
  const tex = screenTexture(S, p.accent, p.accent2);
  const screen = new THREE.Mesh(sg, new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.08, clearcoat: 1 }));
  screen.position.z = d / 2 + 0.002;
  // camera bump on the back
  const bump = S.box(0.34, 0.34, 0.03, 0.07, S.mat({ color: '#9a9da6', metal: 0.9, rough: 0.22 }));
  bump.position.set(-w / 2 + 0.25, h / 2 - 0.25, -d / 2 - 0.012);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 32), S.mat({ color: '#050506', rough: 0.05, clearcoat: 1 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(bump.position.x - 0.07, bump.position.y + 0.07, -d / 2 - 0.03);
  const lens2 = lens.clone(); lens2.position.set(bump.position.x + 0.07, bump.position.y - 0.07, lens.position.z);
  g.add(screen, bump, lens, lens2);
  g.position.y = h / 2;
  g.scale.setScalar(1.25);
  g.position.y *= 1.25;
  const wrap = new THREE.Group(); wrap.add(g); // pivot at the bottom centre like the can
  return wrap;
}

/** a loaded model, scaled to `height` units, centred in x/z, standing on y = 0 */
function normalise(obj, height) {
  const b = new THREE.Box3().setFromObject(obj), s = b.getSize(new THREE.Vector3());
  const k = height / Math.max(s.y, s.x * 0.8, s.z * 0.8, 1e-6);
  obj.scale.setScalar(k);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.set(-c.x, -b2.min.y, -c.z);
  const wrap = new THREE.Group(); wrap.add(obj);
  return wrap;
}

studio.clip({
  duration: 7,
  async setup(root, p, { duration: D }) {
    const W = studio.width, H = studio.height, aspect = W / H, portrait = H > W;
    const FOV = 28;
    // light: 'none' → our own rig: shadowed key, cool fill, two rims (accent left, white right)
    const S = await stage(root, { light: 'none', fov: FOV, shadows: true, env: 0.45 });
    const { ease, range, lerp } = S;
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(3, 6, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 5; key.shadow.bias = -0.0005;
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3.5, bottom: -2, near: 1, far: 20 });
    const rimA = new THREE.DirectionalLight(S.color(p.accent), 3.2); rimA.position.set(-5, 2.5, -4);
    const rimB = new THREE.DirectionalLight(0xffffff, 2.2); rimB.position.set(5, 3, -4);
    S.scene.add(key, rimA, rimB, new THREE.HemisphereLight(0xdfe6ff, 0x202024, 0.35));

    // podium: two tiers + a thin glowing accent ring on the top edge
    const podium = new THREE.Group();
    const pm = S.mat({ color: p.podium, rough: 0.55, clearcoat: 0.2 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 96), pm);
    top.position.y = -0.15;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.34, 0.16, 96), pm);
    base.position.y = -0.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.012, 8, 128), S.mat({ color: p.accent, emissive: p.accent, emissiveIntensity: 1.6 }));
    ring.rotation.x = Math.PI / 2;
    podium.add(top, base, ring);
    S.shadows(podium, true);
    S.scene.add(podium);
    S.ground({ y: -0.46, opacity: 0.35 });

    // product: a .glb when `model` is set (falls back to the procedural one if it can't load)
    let product = null;
    if (String(p.model || '').trim()) {
      try { product = normalise((await S.model(p.model.trim())).scene, 2.4); } catch (e) { console.warn('model failed, using procedural product:', e.message); }
    }
    if (!product) product = p.product === 'phone' ? buildPhone(S, p) : buildCan(S, p);
    S.shadows(product);
    const spinner = new THREE.Group(); // spinner turns, product inside keeps its own orientation
    spinner.add(product);
    S.scene.add(spinner);

    // framing: podium + product ≈ 2.7 × 2.9 units; aim at the product's middle
    const dist = fitDistance(2.7, 2.9, FOV, aspect, portrait ? 0.72 : 0.36, portrait ? 0.5 : 0.68);
    const look = new THREE.Vector3(0, 1.0, 0);
    const spin = THREE.MathUtils.degToRad(Number(p.spin) || 0);

    return {
      render(t) {
        // podium rises in (outExpo 0 → 1 s)
        const kp = ease.outExpo(range(t, 0, 1));
        podium.position.y = lerp(-0.5, 0, kp);
        podium.scale.setScalar(lerp(0.85, 1, kp));
        ring.material.emissiveIntensity = 1.6 * ease.outCubic(range(t, 0.5, 1.4));
        // product drops onto it (outCubic 0.35 → 1.45 s) and turns at a constant speed the whole clip
        const kd = ease.outCubic(range(t, 0.35, 1.45));
        spinner.position.y = podium.position.y + lerp(0.8, 0, kd);
        spinner.scale.setScalar(lerp(0.9, 1, kd));
        spinner.visible = t >= 0.35;
        spinner.rotation.y = -0.5 + spin * t + (1 - kd) * -1.2; // extra quarter turn while it lands
        // camera: slightly high three-quarter, 5 % push-in over the clip (inOutSine — no visible start/stop)
        const push = lerp(1.05, 1, ease.inOutSine(range(t, 0, D)));
        S.camera.position.set(0, look.y + dist * 0.2 * push, dist * push);
        S.look(look.x, look.y, look.z);
        S.render();
      },
    };
  },
});
