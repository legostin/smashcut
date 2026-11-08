// 3D particles form: a scattered cloud of glowing points spirals in and converges onto the surface of a word (or a
// knot / sphere), holds with a gentle shimmer, then optionally blows away. Targets are sampled on the mesh surface
// with a seeded MeshSurfaceSampler, so every render is identical.
import { stage, THREE } from 'studio3js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

function fitDistance(w, h, fov, aspect, fillW, fillH) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  return Math.max(h / fillH / (2 * tan), w / fillW / (2 * tan * aspect));
}
/** soft round sprite (radial gradient) so points read as glowing dots, not squares */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const W = studio.width, H = studio.height, aspect = W / H, portrait = H > W;
    const FOV = 35;
    const S = await stage(root, {
      light: 'none', env: 0, fov: FOV,
      bloom: p.bloom ? { strength: 0.7, radius: 0.35, threshold: 0.85 } : null,
    });
    const { ease, range, lerp } = S;
    const N = Math.max(500, Math.min(30000, Math.round(Number(p.count) || 8000)));

    // ---- target shape: any mesh; its surface is sampled (seeded) for N target points
    let mesh;
    if (p.shape === 'knot') mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1.1, 0.34, 240, 24));
    else if (p.shape === 'sphere') mesh = new THREE.Mesh(new THREE.SphereGeometry(1.4, 96, 48));
    else mesh = await S.text(String(p.text || 'FORM'), { size: 1, depth: 0.1, bevel: 0, weight: 800, letterSpacing: 0.02, curveSegments: 6 });
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox, size = bb.getSize(new THREE.Vector3()), centre = bb.getCenter(new THREE.Vector3());
    const sampler = new MeshSurfaceSampler(mesh).setRandomGenerator(S.rng(11)).build();
    const target = new Float32Array(N * 3), v = new THREE.Vector3();
    for (let i = 0; i < N; i++) { sampler.sample(v); v.sub(centre); target.set([v.x, v.y, v.z], i * 3); }

    // ---- framing, then the scattered start cloud a bit larger than the visible frame
    const dist = fitDistance(size.x, size.y, FOV, aspect, portrait ? 0.82 : 0.58, portrait ? 0.45 : 0.55);
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV) / 2), vw = vh * aspect;
    const cloud = S.particles({ count: N, seed: 5, spread: [vw * 1.25, vh * 1.25, Math.min(vh, 6)], size: 0.05 * Math.max(size.x, size.y * 2) / 4, color: '#ffffff' });
    S.scene.add(cloud.points);

    // per-particle colour (mostly accent, some accent 2, a few white sparks), delays and exit directions — all seeded
    const r = S.rng(23);
    const cols = new Float32Array(N * 3), delay = new Float32Array(N), exitAt = new Float32Array(N), dir = new Float32Array(N * 3);
    const a = S.color(p.accent), b = S.color(p.accent2), white = new THREE.Color(1, 1, 1), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const x = r();
      c.copy(a).lerp(b, x * x * x); if (r() < 0.05) c.copy(white);
      cols.set([c.r, c.g, c.b], i * 3);
      // left → right sweep across the target (x) plus jitter: the word resolves in reading order
      delay[i] = 0.25 + ((target[i * 3] / size.x) + 0.5) * 0.9 + r() * 0.45;
      // exit: a gust from the left — leftmost points leave first, blown right and up with seeded spread
      exitAt[i] = D - 1.7 + ((target[i * 3] / size.x) + 0.5) * 0.55 + r() * 0.25;
      dir.set([0.5 + r() * 1.5, (r() - 0.25) * 1.3, (r() - 0.5) * 2.4], i * 3);
    }
    cloud.points.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = cloud.points.material;
    Object.assign(m, { vertexColors: true, map: dotTexture() });
    m.color.setScalar(p.bloom ? 1.5 : 1.2); // where points stack up (additive) they pass the bloom threshold // > 1 → over the bloom threshold where points stack up
    m.needsUpdate = true;

    const FLY = 1.7, SWIRL = 2.4;
    return {
      render(t) {
        cloud.update((i, base, out) => {
          const k = ease.inOutCubic(range(t, delay[i], delay[i] + FLY));
          const tx = target[i * 3], ty = target[i * 3 + 1], tz = target[i * 3 + 2];
          // straight lerp start → target, then rotate the in-flight point around the y axis: a vortex that unwinds to 0
          let x = lerp(base[0], tx, k), y = lerp(base[1], ty, k), z = lerp(base[2], tz, k);
          const ang = (1 - k) * SWIRL, ca = Math.cos(ang), sa = Math.sin(ang);
          [x, z] = [x * ca + z * sa, -x * sa + z * ca];
          // hold: a tiny shimmer so the shape breathes; exit: blow out along a seeded direction, drifting up
          const sh = 0.012 * k;
          x += Math.sin(t * 2.3 + i * 1.7) * sh; y += Math.cos(t * 1.9 + i * 2.3) * sh;
          const e = p.disperse ? ease.inCubic(range(t, exitAt[i], exitAt[i] + 1.1)) * size.x * 1.6 : 0;
          out[0] = x + dir[i * 3] * e; out[1] = y + dir[i * 3 + 1] * e; out[2] = z + dir[i * 3 + 2] * e;
        });
        cloud.points.rotation.y = p.shape === 'text' ? 0 : t * 0.35; // volumes turn so they read as 3D; words stay readable
        m.opacity = 0.85 * range(t, 0, 0.6) * (1 - (p.disperse ? ease.inCubic(range(t, D - 0.7, D)) : 0));
        // camera: 12 % push-in (outCubic, 0 → 4 s) and a small parallax arc; the shape itself stays readable
        const push = lerp(1.12, 1, ease.outCubic(range(t, 0, 4)));
        const arc = lerp(-0.22, 0.06, ease.inOutSine(range(t, 0, D)));
        S.camera.position.set(Math.sin(arc) * dist * push, dist * 0.04, Math.cos(arc) * dist * push);
        S.look(0, 0, 0);
        S.render();
      },
    };
  },
});
