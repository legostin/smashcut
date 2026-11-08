// 3D isometric blocks: an orthographic, true-isometric diorama — a base slab draws in, grid tiles pop up in a diagonal
// wave, rounded cubes drop onto seeded stacks (taller towards the centre), then a faceted gem lands above the tallest
// tower and floats. Palette from the design tokens (pastel / brand / mono).
import { stage, THREE } from 'studio3js';

/** outBack with a soft (≈4 %) overshoot */
const outBackSoft = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    // ortho: 10 world units tall to start with — the zoom is fitted to the content below
    const S = await stage(root, { ortho: 10, light: 'studio', shadows: true, env: 0.5 });
    // iso shading: key from the +x side so the two visible faces separate (top light, +x mid, +z dark)
    S.lights.key.position.set(9, 11, 2.5);
    S.lights.key.intensity = 2;
    const { ease, range, lerp } = S;
    const r = S.rng(Math.round(Number(p.seed) || 1) * 7919);
    const G = Math.max(3, Math.min(10, Math.round(Number(p.grid) || 6)));
    const pitch = 1, cube = 0.9;

    // ---- palette: token colours, softened towards white for 'pastel', shades of one hue for 'mono'
    const white = new THREE.Color(1, 1, 1);
    const soft = p.palette === 'pastel' ? 0.32 : p.palette === 'mono' ? 0 : 0.08;
    const tone = (c, k = soft) => S.color(c).clone().lerp(white, k);
    const blockCols = p.palette === 'mono'
      ? [0.15, 0.35, 0.55].map((k) => tone(p.accent2, k))
      : [tone(p.accent), tone(p.accent2), tone('muted', soft * 0.6), tone(p.accent2, Math.min(1, soft + 0.25))];
    const mats = blockCols.map((c) => S.mat({ color: c, rough: 0.5, clearcoat: 0.15 }));
    const tileMat = S.mat({ color: tone('surface', p.palette === 'brand' ? 0.12 : 0.7), rough: 0.7 });
    const baseMat = S.mat({ color: tone('surface', p.palette === 'brand' ? 0.05 : 0.55), rough: 0.7 });

    // ---- layout (seeded): height falls off from the centre, plus noise; ~30 % empty cells keep it airy
    const cells = [];
    const c0 = (G - 1) / 2;
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const d = Math.hypot(i - c0, j - c0) / (G / 2);
      const h = r() < 0.3 ? 0 : Math.max(0, Math.round((1 - d) * 3.2 + r() * 1.6 - 0.4));
      cells.push({ i, j, h, x: (i - c0) * pitch, z: (j - c0) * pitch, mat: mats[Math.floor(r() * mats.length)] });
    }
    const tallest = cells.reduce((a, b) => (b.h > a.h ? b : a));
    if (tallest.h === 0) tallest.h = 1;

    const world = new THREE.Group();
    S.scene.add(world);
    const slab = S.box(G * pitch + 0.5, 0.4, G * pitch + 0.5, 0.12, baseMat);
    slab.position.y = -0.3;
    world.add(S.shadows(slab, true));
    const tileGeo = new THREE.BoxGeometry(cube, 0.1, cube);
    const cubeGeo = S.box(cube, cube, cube, 0.1).geometry; // one shared geometry for every cube
    const tiles = [], cubes = [];
    for (const c of cells) {
      const tile = new THREE.Mesh(tileGeo, tileMat);
      tile.position.set(c.x, -0.05, c.z); tile.receiveShadow = true;
      world.add(tile);
      tiles.push({ m: tile, delay: 0.35 + (c.i + c.j) * 0.035 });
      for (let k = 0; k < c.h; k++) {
        const m = new THREE.Mesh(cubeGeo, c.mat);
        m.castShadow = m.receiveShadow = true;
        world.add(m);
        // diagonal wave across the grid, each layer of a stack 0.14 s after the one below
        cubes.push({ m, x: c.x, z: c.z, y: cube / 2 + k * cube, delay: 0.8 + (c.i + c.j) * 0.05 + k * 0.14 });
      }
    }
    const tLast = Math.max(...cubes.map((q) => q.delay)) + 0.7;

    // hero: a faceted gem hovering above the tallest tower
    let gem = null;
    const gemY = tallest.h * cube + 0.95;
    if (p.hero) {
      gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), S.mat({ color: p.accent, rough: 0.2, clearcoat: 1, flat: true, emissive: p.accent, emissiveIntensity: 0.15 }));
      gem.scale.y = 1.35; gem.castShadow = true;
      world.add(gem);
    }

    // ---- true isometric camera (direction 1,1,1); fit the ortho zoom to the content's projected bounds
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    // points that bound what is really there: the slab corners, every stack's top corners, the gem's top
    const pts = [];
    const e = G / 2 + 0.25;
    for (const y of [-0.5, 0]) for (const [x, z] of [[-e, -e], [e, -e], [-e, e], [e, e]]) pts.push(new THREE.Vector3(x, y, z));
    for (const c of cells) if (c.h) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(new THREE.Vector3(c.x + dx * cube / 2, c.h * cube, c.z + dz * cube / 2));
    if (p.hero) pts.push(new THREE.Vector3(tallest.x, gemY + 0.9, tallest.z));
    const centre = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const cam = S.camera;
    const pose = (yaw) => {
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(40);
      cam.position.copy(centre).add(d); S.look(centre.x, centre.y, centre.z); cam.updateMatrixWorld();
    };
    pose(0);
    let w = 0, h = 0; // projected extents in camera space (ortho: no perspective divide needed)
    for (const q of pts) { const v = q.clone().applyMatrix4(cam.matrixWorldInverse); w = Math.max(w, Math.abs(v.x) * 2); h = Math.max(h, Math.abs(v.y) * 2); }
    const fw = cam.right - cam.left, fh = cam.top - cam.bottom;
    const zoom0 = Math.min((fw * (portrait ? 0.84 : 0.62)) / w, (fh * (portrait ? 0.55 : 0.8)) / h);

    return {
      render(t) {
        // base slab draws in from flat (outExpo 0 → 0.7 s)
        const ks = ease.outExpo(range(t, 0, 0.7));
        slab.scale.set(Math.max(1e-3, ks), Math.max(1e-3, ks), Math.max(1e-3, ks));
        // tiles pop up in a diagonal wave (outBackSoft 0.45 s)
        for (const q of tiles) { const k = outBackSoft(range(t, q.delay, q.delay + 0.45)); q.m.scale.set(Math.max(1e-3, k), Math.max(1e-3, k), Math.max(1e-3, k)); q.m.visible = k > 0; }
        // cubes drop 2.2 units and grow from 0.5 → 1 as they land (outExpo 0.6 s) — snap without bouncing through the stack
        for (const q of cubes) {
          const k = ease.outExpo(range(t, q.delay, q.delay + 0.6));
          q.m.visible = t >= q.delay;
          q.m.position.set(q.x, q.y + (1 - k) * 2.2, q.z);
          q.m.scale.setScalar(lerp(0.5, 1, k));
        }
        if (gem) {
          const k = outBackSoft(range(t, tLast - 0.1, tLast + 0.6));
          gem.visible = k > 0;
          gem.scale.set(k, 1.35 * k, k);
          gem.position.set(tallest.x, gemY + (1 - k) * 1.2 + Math.sin((t - tLast) * 2.4) * 0.08 * range(t, tLast, tLast + 0.6), tallest.z);
          gem.rotation.y = t * 1.1;
        }
        // camera: isometric yaw drifts −6° → +4° (inOutSine over the clip), ortho zoom pushes 4 %
        pose(THREE.MathUtils.degToRad(lerp(-6, 4, ease.inOutSine(range(t, 0, D)))));
        cam.zoom = zoom0 * lerp(0.96, 1, ease.outCubic(range(t, 0, D)));
        cam.updateProjectionMatrix();
        S.render();
      },
    };
  },
});
