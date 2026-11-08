/*
 * Smashcut — Three.js helper for 3D clips (ES module, import from 'studio3js').
 *
 * A 3D clip is an ordinary clip: clip.js is a module, setup() builds the scene once, render(t) poses it for time t
 * and calls S.render(). Time is virtual (studio.js), Math.random is seeded, so preview and export match frame for frame.
 *
 *   import { stage } from 'studio3js';
 *   studio.clip({
 *     duration: 6,
 *     async setup(root, params) {
 *       const S = await stage(root, { light: 'studio', camera: [0, 0.4, 9] });
 *       const word = await S.text(params.text, { size: 1.3, depth: 0.3, material: S.mat({ color: 'accent', rough: 0.3 }) });
 *       S.scene.add(word);
 *       return { render(t) { word.rotation.y = (1 - S.ease.outCubic(S.range(t, 0, 1.2))) * -1.2; S.render(); } };
 *     },
 *   });
 *
 * Background is transparent by default (the clip composites over footage / other layers).
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import opentype from 'opentype';
import { installKit, studioPreset, makeComposer, makeBokeh } from './studio3js-kit.js';

export { THREE, SVGLoader, GLTFLoader, RoundedBoxGeometry, BufferGeometryUtils };
// studio kit: presets (S.studio), materials, podiums, devices, camera moves, framing — see studio3js-kit.js
export { STUDIO_PRESETS, materials, podium, device, screenTexture, turntable, frame, envMap, cycloramaGeometry, gradientVoid, reflectiveFloor, contactShadow, roundedRect } from './studio3js-kit.js';

const studio = () => window.studio;

// ---------------- small math helpers (pure functions of t) ----------------
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** 0→1 progress of t through [a, b] (clamped) */
export const range = (t, a, b) => clamp01((t - a) / (b - a || 1e-9));
export const lerp = (a, b, k) => a + (b - a) * k;
/** deterministic random generator (independent of Math.random calls elsewhere) */
export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const easeFallback = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

// ---------------- colours from the design system ----------------
/** used when the project has no design token of that name yet */
const ROLE_DEFAULTS = { accent: '#d4ff3a', accent2: '#7a5cff', text: '#ffffff', muted: '#9a9aa3', bg: '#0a0a0b', surface: '#18181b' };
/** a design token name ('accent', 'text', 'bg'…) or any CSS colour → THREE.Color (colour-managed) */
export function color(c, fallback = '#ffffff') {
  if (c instanceof THREE.Color) return c;
  if (typeof c === 'number') return new THREE.Color(c);
  let v = c || fallback;
  if (typeof v === 'string' && !/^#|^rgb|^hsl/i.test(v)) {
    // 'accent2' and 'accent-2' are the same role (design tokens use the hyphenated name)
    const names = v === 'accent2' || v === 'accent-2' ? ['accent-2', 'accent2'] : [v];
    let tok = null, css = '';
    for (const n of names) {
      tok = tok || studio()?.design?.color?.(n);
      css = css || getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();
    }
    v = tok || css || ROLE_DEFAULTS[v] || ROLE_DEFAULTS.accent2 && v === 'accent-2' && ROLE_DEFAULTS.accent2 || fallback;
  }
  try { return new THREE.Color(v); } catch { return new THREE.Color(fallback); }
}

/** physical material: { color, metal, rough, emissive, emissiveIntensity, clearcoat, glass, opacity, side, flat } */
export function mat(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: color(o.color ?? '#ffffff'),
    metalness: o.metal ?? 0,
    roughness: o.rough ?? 0.4,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRough ?? 0.15,
    emissive: o.emissive ? color(o.emissive) : new THREE.Color(0),
    emissiveIntensity: o.emissiveIntensity ?? (o.emissive ? 1 : 0),
    side: o.side ?? THREE.FrontSide,
    flatShading: !!o.flat,
    envMapIntensity: o.env ?? 1,
  });
  if (o.glass) Object.assign(m, { transmission: 1, thickness: o.thickness ?? 0.6, roughness: o.rough ?? 0.05, ior: o.ior ?? 1.5, metalness: 0 });
  if (o.opacity != null && o.opacity < 1) Object.assign(m, { transparent: true, opacity: o.opacity });
  return m;
}

// ---------------- fonts → 3D text ----------------
const fontCache = new Map();
async function loadFont(url) {
  if (!fontCache.has(url)) fontCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('font ' + url + ': ' + r.status); return r.arrayBuffer(); }).then((b) => opentype.parse(b)));
  return fontCache.get(url);
}
/** default font stack: the bundled Inter (latin, latin-ext, cyrillic subsets) at a weight */
function interStack(weight) {
  const w = [100, 200, 300, 400, 500, 600, 700, 800, 900].reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), 700);
  return ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek'].map((s) => `/fonts/inter/files/inter-${s}-${w}-normal.woff`);
}

function glyphShapes(path) {
  const sp = new THREE.ShapePath();
  for (const c of path.commands) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  return SVGLoader.createShapes(sp);
}

/**
 * Extruded 3D text in a real font (default: Inter of the design system weight; pass font: url or [urls] for others —
 * .ttf/.otf/.woff, not .woff2). Returns a Mesh, or with perChar: a Group of per-glyph meshes (for staggered animation;
 * each child has userData.char / index). Centred on the origin; size = cap height-ish in world units.
 * { size=1, depth=0.25, bevel=0.02, weight=700, letterSpacing=0 (em), lineHeight=1.15, align='center', curveSegments=10, material, perChar }
 */
export async function text(str, o = {}) {
  const urls = o.font ? [].concat(o.font) : interStack(o.weight ?? 700);
  const fonts = (await Promise.all(urls.map((u) => loadFont(u).catch(() => null)))).filter(Boolean);
  if (!fonts.length) throw new Error('studio3js.text: no font could be loaded');
  const size = o.size ?? 1, depth = o.depth ?? 0.25, bevel = o.bevel ?? 0.02;
  const ls = (o.letterSpacing ?? 0) * size, lh = (o.lineHeight ?? 1.15) * size;
  const material = o.material || mat({ color: o.color ?? 'text', rough: 0.35 });
  const ext = { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: o.curveSegments ?? 10 };
  const lines = String(str).split('\n');
  const glyphs = [];
  lines.forEach((line, li) => {
    let x = 0;
    const row = [];
    for (const ch of line) {
      const font = fonts.find((f) => f.charToGlyphIndex(ch) > 0) || fonts[0];
      const g = font.charToGlyph(ch);
      const scale = size / font.unitsPerEm;
      const shapes = ch.trim() ? glyphShapes(g.getPath(0, 0, size)) : [];
      row.push({ ch, x, shapes });
      x += g.advanceWidth * scale + ls;
    }
    const width = x - ls;
    const dx = o.align === 'left' ? 0 : o.align === 'right' ? -width : -width / 2;
    for (const r of row) glyphs.push({ ...r, x: r.x + dx, y: -li * lh });
  });
  if (o.perChar) {
    const group = new THREE.Group();
    glyphs.filter((g) => g.shapes.length).forEach((g, i) => {
      const geo = new THREE.ExtrudeGeometry(g.shapes, ext);
      geo.computeBoundingBox();
      const bb = geo.boundingBox, cx = (bb.min.x + bb.max.x) / 2;
      geo.translate(-cx, 0, -depth / 2); // pivot: the glyph's centre on the baseline → natural per-letter flips
      const m = new THREE.Mesh(geo, material);
      m.position.set(g.x + cx, g.y, 0);
      m.userData = { char: g.ch, index: i };
      group.add(m);
    });
    // centre the block (keeps each letter's own pivot)
    const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
    for (const m of group.children) { m.position.x -= c.x; m.position.y -= c.y; }
    return group;
  }
  const geos = glyphs.filter((g) => g.shapes.length).map((g) => new THREE.ExtrudeGeometry(g.shapes, ext).translate(g.x, g.y, 0));
  const geo = geos.length ? BufferGeometryUtils.mergeGeometries(geos) : new THREE.BufferGeometry();
  geo.computeBoundingBox();
  if (geo.boundingBox) geo.translate(0, -(geo.boundingBox.min.y + geo.boundingBox.max.y) / 2, -depth / 2);
  return new THREE.Mesh(geo, material);
}

// ---------------- SVG → 3D (logos) ----------------
/**
 * Extrude an SVG (URL relative to the clip, '/p/…' project path, or raw '<svg…>' markup) into 3D, one mesh per SVG
 * path — the parts stay separate so you can animate them (group.parts[i], each pivoting on its own centre; its
 * resting position is userData.{x,y,z} in world units — later SVG paths are stacked `layer` in front of earlier ones).
 * Returned group is centred on the origin and `size` units wide (world units for depth/bevel/layer too).
 * { size=4, depth=0.3, bevel=0.02, layer=depth*0.3, curveSegments=16, material | materialFor(svgColor, i) }
 */
export async function svg(src, o = {}) {
  const markup = /^\s*</.test(src) ? src : await fetch(src).then((r) => r.text());
  const data = new SVGLoader().parse(markup);
  const parts = [];
  data.paths.forEach((p, i) => {
    if (p.userData?.style?.fill === 'none') return;
    const shapes = SVGLoader.createShapes(p);
    if (shapes.length) parts.push({ p, i, shapes });
  });
  // bounds in SVG units → scale k; depth/bevel/layer are given in world units, so extrude by value / k
  const all = new THREE.Box2();
  for (const { shapes } of parts) for (const sh of shapes) for (const pt of sh.getPoints(8)) all.expandByPoint(pt);
  const c = all.getCenter(new THREE.Vector2()), w = all.max.x - all.min.x || 1, k = (o.size ?? 4) / w;
  const depth = (o.depth ?? 0.3) / k, bevel = (o.bevel ?? 0.02) / k;
  // later SVG paths sit on top of earlier ones: stack them in z so they don't z-fight (world units per layer)
  const layer = (o.layer ?? (o.depth ?? 0.3) * 0.3) / k;
  const group = new THREE.Group();
  const meshes = parts.map(({ p, i, shapes }, n) => {
    const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: o.curveSegments ?? 16 });
    // to world units, y up (SVG y points down); a mirror reverses the triangle winding, so restore it
    geo.translate(-c.x, -c.y, -depth / 2).scale(k, -k, k);
    flipWinding(geo);
    geo.computeBoundingBox();
    const pc = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-pc.x, -pc.y, 0); // each part pivots on its own centre
    const material = o.materialFor ? o.materialFor(p.color, i) : o.material || mat({ color: p.color, rough: 0.35 });
    const m = new THREE.Mesh(geo, material);
    const z = n * layer * k;
    m.position.set(pc.x, pc.y, z);
    m.userData = { index: i, color: '#' + p.color.getHexString(), x: pc.x, y: pc.y, z };
    group.add(m);
    return m;
  });
  group.parts = meshes;
  return group;
}

function flipWinding(geo) {
  if (geo.index) { const a = geo.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } geo.index.needsUpdate = true; return; }
  for (const name of Object.keys(geo.attributes)) {
    const at = geo.attributes[name], n = at.itemSize, a = at.array;
    for (let v = 0; v < at.count; v += 3) for (let c = 0; c < n; c++) { const i1 = (v + 1) * n + c, i2 = (v + 2) * n + c; const t = a[i1]; a[i1] = a[i2]; a[i2] = t; }
    at.needsUpdate = true;
  }
}

// ---------------- models ----------------
/** load a .glb/.gltf (e.g. '/p/<id>/media/x.glb' or relative). Returns { scene, animations, at(t, name?) } — at() poses the
 *  model's animation clip deterministically for time t. */
export async function model(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const actions = new Map();
  const at = (t, name) => {
    const clip = name ? gltf.animations.find((a) => a.name === name) : gltf.animations[0];
    if (!clip) return;
    if (!actions.has(clip)) { const a = mixer.clipAction(clip); a.play(); actions.set(clip, a); }
    mixer.setTime(t);
  };
  return { scene: gltf.scene, animations: gltf.animations, at };
}

// ---------------- particles ----------------
/**
 * count points with deterministic base positions; call update(fn) in render(t) to move them:
 *   p.update((i, base, out) => { out[0] = base[0]; out[1] = base[1] + Math.sin(t + i); out[2] = base[2]; })
 * { count=2000, size=0.04, color='accent', seed=1, spread=[6,4,6] | radius (sphere), opacity=1, additive=true }
 */
export function particles(o = {}) {
  // (colour defaults to the design accent)
  const n = o.count ?? 2000, r = rng(o.seed ?? 1);
  const base = new Float32Array(n * 3);
  const sp = o.spread || [6, 4, 6];
  for (let i = 0; i < n; i++) {
    if (o.radius) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = o.radius * Math.cbrt(r());
      const s = Math.sqrt(1 - u * u);
      base.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], i * 3);
    } else base.set([(r() - 0.5) * sp[0], (r() - 0.5) * sp[1], (r() - 0.5) * sp[2]], i * 3);
  }
  const pos = new Float32Array(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const material = new THREE.PointsMaterial({
    color: color(o.color ?? 'accent'), size: o.size ?? 0.04, sizeAttenuation: true, transparent: true, opacity: o.opacity ?? 1,
    depthWrite: false, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  const out = [0, 0, 0];
  return {
    points, base, count: n,
    update(fn) {
      for (let i = 0; i < n; i++) {
        out[0] = base[i * 3]; out[1] = base[i * 3 + 1]; out[2] = base[i * 3 + 2];
        fn(i, base.subarray(i * 3, i * 3 + 3), out);
        pos[i * 3] = out[0]; pos[i * 3 + 1] = out[1]; pos[i * 3 + 2] = out[2];
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ---------------- the stage ----------------
let current = null;

/**
 * Create the renderer/scene/camera inside root (the clip's #stage). Options:
 *  fov=35, camera=[0,0,10], target=[0,0,0], ortho=null | n (OrthographicCamera, n world units tall — zoom via camera.zoom),
 *  background=null (transparent) | token | css colour,
 *  light='studio' | 'rim' | 'neon' | 'soft' | 'none', env=1 (environment reflections intensity, 0 = off),
 *  exposure=1, tone='neutral' | 'aces' | 'agx' | 'none', shadows=false,
 *  bloom=null | true | { strength=0.5, radius=0.4, threshold=1 } (glow for emissive parts; alpha is kept), fog=null | { color, near, far },
 *  studio=null | 'white_cyc' | 'dark_luxe' | 'product_softbox' | 'neon' | 'daylight' | 'abstract_void' | { kind, …opts }
 *    (a complete studio set: lights + backdrop + environment + tone — see S.studio(); replaces light/env defaults;
 *     options in studioOptions or inline in the object form; the handle is S.studioHandle)
 */
export async function stage(root, o = {}) {
  const st = studio();
  const W = st?.width || 1920, H = st?.height || 1080;
  // the runtime re-runs setup() on every parameter change: release the previous WebGL context first
  if (current) { try { current.dispose(); } catch { /* ignore */ } current = null; }

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  root.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral (Khronos PBR Neutral) keeps brand colours true; 'aces' / 'agx' for a filmic look
  renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, none: THREE.NoToneMapping }[o.tone] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.shadowMap.enabled = !!o.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  if (o.background) scene.background = color(o.background);
  else renderer.setClearColor(0x000000, 0);
  if (o.fog) scene.fog = new THREE.Fog(color(o.fog.color ?? o.background ?? '#000000'), o.fog.near ?? 8, o.fog.far ?? 30);

  // ortho: n → an OrthographicCamera showing n world units vertically (isometric / technical looks); else perspective
  const camera = o.ortho
    ? new THREE.OrthographicCamera((-o.ortho / 2) * (W / H), (o.ortho / 2) * (W / H), o.ortho / 2, -o.ortho / 2, o.near ?? 0.1, o.far ?? 200)
    : new THREE.PerspectiveCamera(o.fov ?? 35, W / H, o.near ?? 0.1, o.far ?? 200);
  const target = new THREE.Vector3(...(o.target || [0, 0, 0]));
  camera.position.set(...(o.camera || [0, 0, 10]));
  camera.lookAt(target);

  // image-based lighting (soft studio reflections) — cheap and makes PBR materials read
  const preset = o.studio ? (typeof o.studio === 'string' ? { kind: o.studio, ...(o.studioOptions || {}) } : { ...o.studio }) : null;
  const envIntensity = preset ? 0 : o.env ?? ({ neon: 0.2, rim: 0.35 }[o.light] ?? 0.7);
  let pmrem = null;
  if (envIntensity > 0) {
    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = envIntensity;
  }
  const lights = lightRig(scene, preset ? (o.light ?? 'none') : o.light ?? 'studio', !!o.shadows);

  let composer = null;
  const S = {
    THREE, scene, camera, renderer, lights, target, root, width: W, height: H,
    ease: { ...easeFallback, ...(st?.ease || {}) },
    range, lerp, clamp01, rng, color, mat, text, svg, model, particles,
    /** draw the frame — call at the end of render(t) (t defaults to the runtime's current time) */
    render(t = st?.time ?? 0) {
      S._lastT = t;
      S._beforeRender?.(t);
      if (composer) composer.render(); else renderer.render(scene, camera);
    },
    /** redraw the last posed frame (video screens call this once their frame is decoded) */
    _redraw() { S.render(S._lastT ?? st?.time ?? 0); },
    _ensureBloom(b = {}) {
      if (!composer) composer = makeComposer(S);
      if (!S._bloomPass) {
        // threshold 1: only what is brighter than lit white glows — give glowing parts emissive + emissiveIntensity 2…6
        S._bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), b.strength ?? 0.5, b.radius ?? 0.4, b.threshold ?? 1);
        composer.insertPass(S._bloomPass, composer.passes.length - 1);
      } else Object.assign(S._bloomPass, { strength: b.strength ?? S._bloomPass.strength, radius: b.radius ?? S._bloomPass.radius, threshold: b.threshold ?? S._bloomPass.threshold });
      return S._bloomPass;
    },
    _ensureBokeh() {
      if (!composer) composer = makeComposer(S);
      if (!S._bokeh) { S._bokeh = makeBokeh(S); composer.insertPass(S._bokeh, 1); }
      return S._bokeh;
    },
    /** point the camera: lookAt(target) after you move it */
    look(x = target.x, y = target.y, z = target.z) { target.set(x, y, z); camera.lookAt(target); },
    /** camera on a circle around the target: { radius=10, height=1.5, turns=0.15 per second, start=0 (radians) } */
    orbit(t, p = {}) {
      const a = (p.start ?? 0) + (p.turns ?? 0.15) * Math.PI * 2 * t, r = p.radius ?? 10;
      camera.position.set(target.x + Math.sin(a) * r, target.y + (p.height ?? 1.5), target.z + Math.cos(a) * r);
      camera.lookAt(target);
    },
    /** catch-shadow floor (transparent except for the shadow): { y=-1.2, opacity=0.35, size=40 } — needs shadows: true */
    ground(p = {}) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(p.size ?? 40, p.size ?? 40), p.material || new THREE.ShadowMaterial({ opacity: p.opacity ?? 0.35 }));
      g.rotation.x = -Math.PI / 2; g.position.y = p.y ?? -1.2; g.receiveShadow = true;
      scene.add(g);
      return g;
    },
    /** rounded box helper: (w, h, d, radius, material) */
    box(w = 1, h = 1, d = 1, radius = 0.08, material = mat()) { return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), material); },
    /** make every mesh under obj cast (and optionally receive) shadows */
    shadows(obj, receive = false) { obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = receive; } }); return obj; },
    dispose() {
      for (const c of S._contacts || []) c.dispose();
      scene.traverse((m) => { m.geometry?.dispose?.(); [].concat(m.material || []).forEach((x) => x.dispose?.()); m.dispose?.(); });
      scene.environment?.dispose?.();
      pmrem?.dispose(); composer?.dispose?.();
      renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    },
  };
  installKit(S);
  if (o.bloom) S._ensureBloom(o.bloom === true ? {} : o.bloom);
  current = S;
  if (preset) await studioPreset(S, preset.kind, preset);
  return S;
}

function lightRig(scene, kind, shadows) {
  const L = {};
  const add = (name, l) => { L[name] = l; scene.add(l); if (l.target) scene.add(l.target); return l; };
  if (kind === 'none') return L;
  if (kind === 'studio' || kind === 'soft') {
    const key = add('key', new THREE.DirectionalLight(0xffffff, kind === 'soft' ? 1.0 : 1.6));
    key.position.set(5, 8, 6);
    add('fill', new THREE.HemisphereLight(0xffffff, 0x222233, kind === 'soft' ? 0.6 : 0.3));
    const rim = add('rim', new THREE.DirectionalLight(0xffffff, kind === 'soft' ? 0.5 : 1.2));
    rim.position.set(-6, 3, -6);
    if (shadows) Object.assign(key, { castShadow: true }), Object.assign(key.shadow.mapSize, { width: 2048, height: 2048 }), Object.assign(key.shadow, { radius: 6, bias: -0.0004 }), Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  } else if (kind === 'rim') {
    add('key', new THREE.DirectionalLight(0xffffff, 0.7)).position.set(3, 4, 8);
    add('rimL', new THREE.DirectionalLight(color('accent'), 2.2)).position.set(-7, 2, -5);
    add('rimR', new THREE.DirectionalLight(0xffffff, 1.6)).position.set(7, 3, -5);
  } else if (kind === 'neon') {
    add('a', new THREE.PointLight(color('accent'), 60, 30, 2)).position.set(-4, 2, 4);
    add('b', new THREE.PointLight(color('accent2', '#7a5cff'), 60, 30, 2)).position.set(4, -1, 3);
    add('fill', new THREE.AmbientLight(0xffffff, 0.08));
  }
  return L;
}
