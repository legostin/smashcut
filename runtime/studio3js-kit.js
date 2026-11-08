/*
 * Smashcut — studio kit for Three.js clips (re-exported by 'studio3js'; installed on every stage S).
 *
 *   const S = await stage(root, { studio: 'white_cyc' });           // or: await S.studio('white_cyc', { … })
 *   const ped = S.podium({ shape: 'cylinder', radius: 1.1, height: 0.35, material: S.materials.mattePlastic({ color: 'surface' }) });
 *   const phone = await S.device('phone', { screen: '/p/<id>/media/ui.png' });
 *   phone.position.y = ped.top + phone.size.h / 2;
 *   S.frame(group, { margin: 0.14 });                                // fit the camera for 16:9 and 9:16
 *   render(t) { S.turntable(phone, t, { speed: 20 }); S.camera.move(t, { pushIn: { amount: 0.06 }, orbit: { from: -12, to: 8 } }); S.render(); }
 *
 * Everything is a pure function of t: presets are built once, moves/turntables are closed-form, video screens are
 * seeked by the runtime (and the frame is re-drawn on 'seeked'), canvas screens are redrawn from t.
 */
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { color, range, lerp, clamp01, rng } from './studio3js.js';

const DEG = Math.PI / 180;
const studioRt = () => window.studio;
let areaLib = false;
/** RectAreaLight LTC tables + make area lights one-sided (three's are two-sided: a strip behind the subject would also
 *  light the backdrop behind it). Patched only on pages that use the studio kit, so older clips render unchanged. */
const initAreaLights = () => {
  if (areaLib) return;
  RectAreaLightUniformsLib.init();
  const k = 'lights_physical_pars_fragment', src = THREE.ShaderChunk[k];
  const from = 'vec3 lightColor = rectAreaLight.color;';
  if (src.includes(from)) THREE.ShaderChunk[k] = src.replace(from, 'vec3 lightColor = rectAreaLight.color * step( 0.0, dot( position - lightPos, - cross( halfWidth, halfHeight ) ) );');
  areaLib = true;
};
const v3 = (a) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(...a));
const hex = (c) => '#' + color(c).getHexString();

// =====================================================================================================================
// Environment maps: a PMREM of a tiny scene — gradient sky sphere + emissive soft-edged panels (softboxes / strips).
// Reflections then show real rectangular highlights instead of a generic room.
// =====================================================================================================================
const panelMat = (c, soft, flag) => new THREE.ShaderMaterial({
  uniforms: { c: { value: c }, soft: { value: soft } },
  side: THREE.DoubleSide, depthWrite: false, transparent: true, blending: flag ? THREE.NormalBlending : THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 c; uniform float soft; varying vec2 vUv;
    void main(){ vec2 e = min(vUv, 1.0 - vUv); float m = smoothstep(0.0, soft, e.x) * smoothstep(0.0, soft, e.y);
      gl_FragColor = ${flag ? 'vec4(c, m)' : 'vec4(c * m, 1.0)'}; }`,
});

/**
 * Build an environment texture (PMREM) from a gradient + emissive panels.
 * spec: { top, horizon, bottom (CSS/tokens), intensity=1 (sky multiplier),
 *         panels: [{ pos:[x,y,z], w, h, color='#fff', intensity=4, soft=0.15, target=[0,0,0], flag=false (dark card) }], size=256 }
 */
export function envMap(renderer, spec = {}) {
  const scene = new THREE.Scene();
  const k = spec.intensity ?? 1;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: color(spec.top ?? '#808080').multiplyScalar(k) },
      horizon: { value: color(spec.horizon ?? spec.top ?? '#606060').multiplyScalar(k) },
      bottom: { value: color(spec.bottom ?? '#202020').multiplyScalar(k) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, horizon, bottom; varying vec3 vDir;
      void main(){ float y = normalize(vDir).y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.7)) : mix(horizon, bottom, pow(-y, 0.45));
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);
  for (const p of spec.panels || []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w ?? 1, p.h ?? 1), p.flag
      ? panelMat(color(p.color ?? '#050505'), p.soft ?? 0.25, true) // a black flag: negative fill for metals / glass edges
      : panelMat(color(p.color ?? '#ffffff').multiplyScalar(p.intensity ?? 4), p.soft ?? 0.15));
    m.renderOrder = p.flag ? 0 : 1;
    m.position.set(...p.pos);
    m.lookAt(...(p.target || [0, 0, 0]));
    scene.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 100, { size: spec.size ?? 256 });
  pmrem.dispose();
  scene.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); });
  return rt.texture;
}

// =====================================================================================================================
// Backdrops
// =====================================================================================================================
/**
 * Seamless cyclorama: a floor that sweeps up into a back wall through a quarter-circle cove (one smooth surface, no
 * horizon line). Floor top at y = 0 (move the mesh), wall at z = -back. { width, front, back, height, radius, segments }
 */
export function cycloramaGeometry(o = {}) {
  const W = o.width ?? 80, front = o.front ?? 40, back = o.back ?? 6, H = o.height ?? 40, R = o.radius ?? 4;
  const prof = []; // [z, y, nz, ny] along the profile, front → top
  const floorN = 12, arcN = o.segments ?? 32, wallN = 12;
  const cz = -back + R; // cove centre (z), at height R
  for (let i = 0; i <= floorN; i++) { const z = lerp(front, cz, i / floorN); prof.push([z, 0, 0, 1]); }
  for (let i = 1; i <= arcN; i++) {
    const a = (i / arcN) * (Math.PI / 2);
    prof.push([cz - R * Math.sin(a), R - R * Math.cos(a), Math.sin(a), Math.cos(a)]);
  }
  for (let i = 1; i <= wallN; i++) prof.push([-back, lerp(R, H, i / wallN), 1, 0]);
  // arc-length v coordinate
  const vs = [0];
  for (let i = 1; i < prof.length; i++) vs.push(vs[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const total = vs[vs.length - 1];
  const cols = 24, pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= cols; j++) {
    const x = (j / cols - 0.5) * W;
    for (let i = 0; i < prof.length; i++) {
      const [z, y, nz, ny] = prof[i];
      pos.push(x, y, z); nor.push(0, ny, nz); uv.push(j / cols, vs[i] / total);
    }
  }
  const n = prof.length;
  for (let j = 0; j < cols; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = (j + 1) * n + i, c = a + 1, d = b + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** fullscreen gradient (camera independent: an endless void, no horizon). Returns a Mesh to add to the scene. */
export function gradientVoid(S, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: {
      inner: { value: color(o.inner ?? '#2a2a33') }, outer: { value: color(o.outer ?? '#050507') },
      glow: { value: color(o.glow ?? 'accent') }, glowAmount: { value: o.glowAmount ?? 0.18 },
      glowPos: { value: new THREE.Vector2(...(o.glowPos ?? [0.25, 0.3])) }, centre: { value: new THREE.Vector2(...(o.centre ?? [0, 0.08])) },
      spread: { value: o.spread ?? 0.95 }, aspect: { value: S.width / S.height },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `uniform vec3 inner, outer, glow; uniform float glowAmount, spread, aspect; uniform vec2 glowPos, centre; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 p = (vUv - 0.5) * 2.0; p.x *= max(aspect, 1.0); p.y *= max(1.0 / aspect, 1.0);
        float r = length(p - centre) / spread;
        vec3 c = mix(inner, outer, smoothstep(0.0, 1.0, r));
        vec2 gp = glowPos; gp.x *= max(aspect, 1.0); gp.y *= max(1.0 / aspect, 1.0);
        c += glow * glowAmount * exp(-dot(p - gp, p - gp) * 1.6);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 160.0; // dither: no banding in the smooth gradient
      }`,
  }));
  m.frustumCulled = false;
  m.renderOrder = -1000;
  m.userData.noContactShadow = true;
  m.userData.noCast = true;
  return m;
}

/** soft, blurred mirror floor: added on top of the backdrop floor (additive), fading out with distance */
export function reflectiveFloor(S, o = {}) {
  const size = o.size ?? 30, W = S.width, H = S.height, q = o.resolution ?? 0.5;
  const shader = {
    name: 'StudioReflector',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      strength: { value: o.strength ?? 0.3 }, blur: { value: o.blur ?? 2.5 }, fade: { value: o.fade ?? 6 },
      texel: { value: new THREE.Vector2(1 / (W * q), 1 / (H * q)) }, centre: { value: new THREE.Vector3(...(o.centre ?? [0, 0, 0])) },
    },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
      void main(){ vUv = textureMatrix * vec4(position, 1.0); vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform sampler2D tDiffuse; uniform float strength, blur, fade; uniform vec2 texel; uniform vec3 centre;
      varying vec4 vUv; varying vec3 vWorld;
      void main(){
        vec2 uv = vUv.xy / vUv.w;
        // roughness blur: a small kernel on a mip level of the reflection (smooth, no aliasing)
        float lod = blur;
        vec2 st = texel * exp2(lod) * 0.5;
        vec3 acc = vec3(0.0); float ws = 0.0;
        for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
          float w = exp(-float(i * i + j * j) / 4.0);
          acc += textureLod(tDiffuse, uv + vec2(float(i), float(j)) * st, lod).rgb * w; ws += w;
        }
        float d = length(vWorld.xz - centre.xz);
        float f = 1.0 - smoothstep(fade * 0.25, fade, d);
        gl_FragColor = vec4(acc / ws * color * strength * f, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const r = new Reflector(new THREE.PlaneGeometry(size, size), {
    shader, textureWidth: Math.round(W * q), textureHeight: Math.round(H * q), multisample: 0, color: o.tint ?? 0xffffff, clipBias: 0.002,
  });
  Object.assign(r.material, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const rtex = r.getRenderTarget().texture;
  rtex.generateMipmaps = true; rtex.minFilter = THREE.LinearMipmapLinearFilter;
  r.rotation.x = -Math.PI / 2;
  r.renderOrder = 2;
  r.userData.noContactShadow = true;
  r.userData.noCast = true;
  return r;
}

/**
 * Soft contact shadow (depth seen from below the floor, blurred) — the grounded "Apple" shadow, cheap, alpha-friendly.
 * { y=0, size=8, resolution=512, blur=3, darkness=1.2, opacity=0.7, height=size*0.3 } → { mesh, update(), opacity }
 * Updated automatically before every S.render().
 */
export function contactShadow(S, o = {}) {
  const size = o.size ?? 8, res = o.resolution ?? 512, height = o.height ?? size * 0.3;
  const rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType }); rt.texture.generateMipmaps = false;
  const rtBlur = new THREE.WebGLRenderTarget(res, res, { type: THREE.HalfFloatType }); rtBlur.texture.generateMipmaps = false;
  const group = new THREE.Group();
  group.position.y = (o.y ?? 0) + 0.003;
  const geo = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: rt.texture, opacity: o.opacity ?? 0.7, transparent: true, depthWrite: false, toneMapped: false, color: color(o.color ?? '#000000') }));
  mesh.renderOrder = 1;
  mesh.scale.y = -1;
  group.add(mesh);
  const blurPlane = new THREE.Mesh(geo);
  blurPlane.visible = false;
  group.add(blurPlane);
  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height);
  cam.rotation.x = Math.PI / 2;
  group.add(cam);
  group.userData.noContactShadow = true;
  group.userData.noCast = true;
  const darkness = o.darkness ?? 1.2;
  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.darkness = { value: darkness };
  depthMat.onBeforeCompile = (sh) => {
    sh.uniforms.darkness = depthMat.userData.darkness;
    sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace('gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * darkness );');
  };
  depthMat.depthTest = false; depthMat.depthWrite = false; depthMat.side = THREE.DoubleSide;
  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader); hBlur.depthTest = false;
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader); vBlur.depthTest = false;
  const blurAmount = o.blur ?? 3;
  const r = S.renderer, scene = S.scene;
  const blur = (amount) => {
    blurPlane.visible = true;
    blurPlane.material = hBlur; hBlur.uniforms.tDiffuse.value = rt.texture; hBlur.uniforms.h.value = amount / 256;
    r.setRenderTarget(rtBlur); r.render(blurPlane, cam);
    blurPlane.material = vBlur; vBlur.uniforms.tDiffuse.value = rtBlur.texture; vBlur.uniforms.v.value = amount / 256;
    r.setRenderTarget(rt); r.render(blurPlane, cam);
    blurPlane.visible = false;
  };
  const cc = new THREE.Color();
  const handle = {
    mesh: group, plane: mesh, enabled: true,
    get opacity() { return mesh.material.opacity; }, set opacity(v) { mesh.material.opacity = v; },
    set darkness(v) { depthMat.userData.darkness.value = v; },
    update() {
      if (!handle.enabled || !group.visible) return;
      const hidden = [];
      scene.traverse((m) => { if (m.visible && (m.userData.noContactShadow || m.isPoints || m.isSprite)) { hidden.push(m); m.visible = false; } });
      const bg = scene.background, prevRT = r.getRenderTarget(), alpha = r.getClearAlpha();
      r.getClearColor(cc);
      scene.background = null;
      scene.overrideMaterial = depthMat;
      r.setClearColor(0x000000, 0);
      r.setRenderTarget(rt); r.clear();
      group.updateMatrixWorld(true);
      r.render(scene, cam);
      scene.overrideMaterial = null;
      blur(blurAmount); blur(blurAmount * 0.4);
      r.setRenderTarget(prevRT);
      r.setClearColor(cc, alpha);
      scene.background = bg;
      for (const m of hidden) m.visible = true;
    },
    dispose() { rt.dispose(); rtBlur.dispose(); depthMat.dispose(); hBlur.dispose(); vBlur.dispose(); },
  };
  return handle;
}

// =====================================================================================================================
// Studio presets
// =====================================================================================================================
/** descriptions for agents (also in SKILL.md) */
export const STUDIO_PRESETS = {
  white_cyc: 'seamless white cyclorama, big overhead + side softboxes, soft contact shadow — clean Apple-style product look',
  dark_luxe: 'dark seamless set, strip rim lights, soft blurred reflective floor, a halo on the wall — premium / luxury',
  product_softbox: 'graphite seamless, 3-point softboxes + strip rims and a matching softbox environment — long glossy highlights',
  neon: 'black set with two coloured strip lights (accent / accent2), wet reflective floor, optional haze, bloom',
  daylight: 'warm sun + blue sky fill on a warm plaster cyc, window-light gobo shadows — lifestyle',
  abstract_void: 'endless gradient void (no horizon) with soft key/rims — floating type, logos, abstract shapes',
};

function presetSpec(kind, o, s) {
  const acc = o.accent ?? 'accent', acc2 = o.accent2 ?? 'accent2';
  // lights: rect = RectAreaLight softbox / strip (+ matching env panel unless env:false; keep them above the floor —
  // an area light's plane cuts a hard line where it meets a surface), spot = soft pool on the backdrop
  switch (kind) {
    case 'white_cyc': return {
      backdrop: { type: 'cyc', color: o.color ?? '#efefed', rough: 0.95 },
      lights: [
        { name: 'top', pos: [0, 3.4 * s, 0.4 * s], w: 3.2 * s, h: 2.4 * s, intensity: 3.0, target: [0, 0, 0] },
        { name: 'key', pos: [-2.6 * s, 1.7 * s, 2.0 * s], w: 1.6 * s, h: 2.4 * s, intensity: 4.5, target: [0, 0.45 * s, 0] },
        { name: 'fill', pos: [2.8 * s, 1.35 * s, 2.4 * s], w: 1.6 * s, h: 2.2 * s, intensity: 1.8, target: [0, 0.45 * s, 0] },
        { name: 'rimL', pos: [-1.9 * s, 1.5 * s, -1.6 * s], w: 0.25 * s, h: 2.4 * s, intensity: 6, target: [0, 0.5 * s, 0] },
        { name: 'rimR', pos: [1.9 * s, 1.5 * s, -1.6 * s], w: 0.25 * s, h: 2.4 * s, intensity: 6, target: [0, 0.5 * s, 0] },
        { name: 'wall', type: 'spot', pos: [0, 3.6 * s, -0.6 * s], target: [0, 0.8 * s, -5 * s], intensity: 1.1, angle: 1.0 },
      ],
      envPanels: [
        { flag: true, pos: [-5 * s, 0.8 * s, -1.5 * s], w: 2.5 * s, h: 5 * s, color: '#1a1a1c' },
        { flag: true, pos: [5 * s, 0.8 * s, -1.5 * s], w: 2.5 * s, h: 5 * s, color: '#1a1a1c' },
      ],
      hemi: ['#ffffff', '#d8d8d8', 0.35],
      env: { top: '#f2f2f2', horizon: '#d2d2d2', bottom: '#b8b8b8', intensity: 0.9 },
      envIntensity: 0.9, contact: { opacity: 0.62, blur: 3.2, darkness: 1.4 }, tone: 'neutral', exposure: 1.0,
    };
    case 'dark_luxe': return {
      backdrop: { type: 'cyc', color: o.color ?? '#1d1d21', rough: 0.6 },
      reflection: { strength: 0.2, blur: 3, fade: 3.2 * s },
      lights: [
        { name: 'key', pos: [0.6 * s, 2.9 * s, 1.8 * s], w: 1.6 * s, h: 1.2 * s, intensity: 3.6, target: [0, 0.5 * s, 0] },
        { name: 'rimL', pos: [-2.0 * s, 1.9 * s, -1.9 * s], w: 0.16 * s, h: 2.2 * s, intensity: 16, color: o.rim ?? '#fff3e2', target: [0, 0.95 * s, 0] },
        { name: 'rimR', pos: [2.0 * s, 1.9 * s, -1.9 * s], w: 0.16 * s, h: 2.2 * s, intensity: 16, color: o.rim2 ?? o.rim ?? '#e9eeff', target: [0, 0.95 * s, 0] },
        { name: 'fill', pos: [-1.8 * s, 1.3 * s, 3.2 * s], w: 2 * s, h: 1.2 * s, intensity: 0.5, target: [0, 0.5 * s, 0] },
        { name: 'halo', type: 'spot', pos: [0, 0.2 * s, -2.4 * s], target: [0, 1.5 * s, -5 * s], intensity: 5, angle: 0.7, color: o.halo ?? '#ffffff' },
      ],
      envPanels: [
        { pos: [0, 4 * s, -0.5 * s], w: 0.3 * s, h: 3 * s, intensity: 3, soft: 0.1 },
        // a big dim card behind the camera: flat chrome / gloss faces get a soft gradient instead of pure black
        { pos: [0, 0.2 * s, 6 * s], w: 8 * s, h: 3.4 * s, intensity: 0.5, soft: 0.5 },
      ],
      hemi: ['#ffffff', '#000000', 0.05],
      env: { top: '#0a0a0c', horizon: '#060607', bottom: '#020203', intensity: 1 },
      envIntensity: 1, contact: { opacity: 0.85, blur: 2.6, darkness: 1.6 }, tone: 'neutral', exposure: 1.05,
    };
    case 'product_softbox': return {
      backdrop: { type: 'cyc', color: o.color ?? '#3a3d43', rough: 0.85 },
      lights: [
        { name: 'key', pos: [-2.4 * s, 1.75 * s, 1.8 * s], w: 1.4 * s, h: 2.6 * s, intensity: 6, target: [0, 0.5 * s, 0], soft: 0.08 },
        { name: 'fill', pos: [2.6 * s, 1.35 * s, 2.4 * s], w: 2.2 * s, h: 2.2 * s, intensity: 1.6, target: [0, 0.5 * s, 0], soft: 0.2 },
        { name: 'top', pos: [0, 3.2 * s, 0.3 * s], w: 0.5 * s, h: 3 * s, intensity: 7, target: [0, 0, 0], soft: 0.06 },
        { name: 'rimL', pos: [-1.9 * s, 1.6 * s, -1.5 * s], w: 0.22 * s, h: 2.8 * s, intensity: 12, target: [0, 0.5 * s, 0], soft: 0.05 },
        { name: 'rimR', pos: [1.9 * s, 1.6 * s, -1.5 * s], w: 0.22 * s, h: 2.8 * s, intensity: 12, target: [0, 0.5 * s, 0], soft: 0.05 },
        { name: 'wall', type: 'spot', pos: [0, 0.2 * s, -2.4 * s], target: [0, 1.4 * s, -5 * s], intensity: 1.6, angle: 0.85 },
      ],
      envPanels: [
        { pos: [3.5 * s, 1.4 * s, -0.5 * s], w: 0.3 * s, h: 2.6 * s, intensity: 2.5, soft: 0.1 },
        { flag: true, pos: [0, -1 * s, 4 * s], w: 6 * s, h: 2 * s, color: '#050506' },
        { pos: [0, 0.4 * s, 6 * s], w: 7 * s, h: 2.6 * s, intensity: 0.6, soft: 0.5 },
      ],
      hemi: ['#ffffff', '#202024', 0.12],
      env: { top: '#3a3c40', horizon: '#2a2c30', bottom: '#151618', intensity: 0.8 },
      envIntensity: 1, contact: { opacity: 0.75, blur: 3, darkness: 1.5 }, tone: 'neutral', exposure: 1.0,
    };
    case 'neon': return {
      backdrop: { type: 'cyc', color: o.color ?? '#09090c', rough: 0.4 },
      reflection: { strength: 0.6, blur: 1.2, fade: 4.5 * s },
      tubes: o.tubes !== false,
      lights: [
        { name: 'a', pos: [-2.0 * s, 1.5 * s, -1.6 * s], w: 0.12 * s, h: 2.6 * s, intensity: 40, color: acc, target: [0, 0.6 * s, 0.3 * s], tube: true, balance: true },
        { name: 'b', pos: [2.0 * s, 1.5 * s, -1.6 * s], w: 0.12 * s, h: 2.6 * s, intensity: 40, color: acc2, target: [0, 0.6 * s, 0.3 * s], tube: true, balance: true },
        { name: 'topA', pos: [-0.5 * s, 2.9 * s, -0.8 * s], w: 0.1 * s, h: 1.6 * s, intensity: 10, color: acc, target: [0, 0.6 * s, 0], env: true, balance: true },
        { name: 'topB', pos: [0.5 * s, 2.9 * s, -0.8 * s], w: 0.1 * s, h: 1.6 * s, intensity: 10, color: acc2, target: [0, 0.6 * s, 0], env: true, balance: true },
        { name: 'key', pos: [0, 2.8 * s, 2.4 * s], w: 1.4 * s, h: 0.8 * s, intensity: 1.0, target: [0, 0.5 * s, 0] },
        { name: 'washA', type: 'spot', pos: [-1.4 * s, 0.2 * s, -2.4 * s], target: [-1.6 * s, 1.6 * s, -5 * s], intensity: 1.2, angle: 0.7, color: acc, balance: true },
        { name: 'washB', type: 'spot', pos: [1.4 * s, 0.2 * s, -2.4 * s], target: [1.6 * s, 1.6 * s, -5 * s], intensity: 1.2, angle: 0.7, color: acc2, balance: true },
      ],
      hemi: ['#ffffff', '#000000', 0.03],
      env: { top: '#050508', horizon: '#030305', bottom: '#010102', intensity: 1 },
      envIntensity: 1, contact: { opacity: 0.8, blur: 2.5, darkness: 1.5 }, tone: 'neutral', exposure: 1.0,
      bloom: o.bloom ?? { strength: 0.42, radius: 0.45, threshold: 0.95 },
      fog: o.haze === false ? null : { color: o.hazeColor ?? '#0a0a10', density: (o.haze ?? 0.35) * 0.03 / s },
    };
    case 'daylight': return {
      backdrop: { type: 'cyc', color: o.color ?? '#ece2d4', rough: 0.95, receiveShadow: true },
      sun: { dir: o.sunDir ?? [-0.62, 0.55, 0.56], color: o.sunColor ?? '#ffd7a3', intensity: o.sun ?? 2.4, gobo: o.gobo !== false },
      lights: [
        { name: 'bounce', pos: [2.6 * s, 1.1 * s, 2.2 * s], w: 2.2 * s, h: 1.8 * s, intensity: 0.8, color: '#fff1e2', target: [0, 0.5 * s, 0] },
        { name: 'skylight', pos: [0, 3.4 * s, 1.2 * s], w: 3 * s, h: 2 * s, intensity: 0.45, color: '#f4f6ff', target: [0, 0, 0] },
      ],
      envPanels: [{ pos: [-6 * s, 6 * s, 5 * s], w: 1.4 * s, h: 1.4 * s, color: '#fff0d8', intensity: 12, soft: 0.45 }],
      hemi: ['#eef2ff', '#c4a585', 0.35],
      env: { top: '#b4c8ec', horizon: '#efe7dc', bottom: '#a48d76', intensity: 0.9 },
      envIntensity: 0.7, contact: { opacity: 0.4, blur: 2.6, darkness: 1.2 }, tone: 'neutral', exposure: 1.0,
    };
    case 'abstract_void': return {
      backdrop: { type: 'void', inner: o.inner ?? null, outer: o.outer ?? null, glow: o.glow ?? acc2, glowAmount: o.glowAmount ?? 0.14 },
      lights: [
        { name: 'key', pos: [-2.0 * s, 2.0 * s, 2.8 * s], w: 2.2 * s, h: 2.2 * s, intensity: 6, target: [0, 0, 0], soft: 0.25 },
        { name: 'fill', pos: [2.6 * s, -0.2 * s, 2.8 * s], w: 2.2 * s, h: 2.2 * s, intensity: 1.8, target: [0, 0, 0], soft: 0.3 },
        { name: 'rimL', pos: [-2.2 * s, 0.6 * s, -1.8 * s], w: 0.2 * s, h: 2.6 * s, intensity: 9, color: o.rim ?? '#ffffff', target: [0, 0, 0] },
        { name: 'rimR', pos: [2.2 * s, 0.8 * s, -1.8 * s], w: 0.2 * s, h: 2.6 * s, intensity: 7, color: o.rim2 ?? acc, target: [0, 0, 0] },
      ],
      envPanels: [{ pos: [0, 0.3 * s, 6 * s], w: 7 * s, h: 3 * s, intensity: 0.45, soft: 0.5 }],
      hemi: ['#ffffff', '#101014', 0.15],
      env: null, // derived from the void colours below
      envIntensity: 1, contact: null, tone: 'neutral', exposure: 1.0,
    };
    default: throw new Error(`studio: unknown preset "${kind}" — one of ${Object.keys(STUDIO_PRESETS).join(', ')}`);
  }
}

/**
 * S.studio(kind, opts) — lighting + backdrop + environment + tone mapping in one call. Returns a handle:
 *   { kind, lights: { key, rimL, … }, backdrop, floor, reflector, contact, tubes, env, size, sun }
 * opts: size=2 (subject size in world units — all distances scale with it), floor=0 (y of the floor / podium base),
 *   backdrop=true (false = transparent background: only lights + env + contact shadow), color (backdrop colour),
 *   accent / accent2 (neon + void tints, tokens by default), shadow=true | { opacity, blur, darkness, size },
 *   reflection=true | { strength, blur, fade } (dark_luxe / neon), intensity=1 (all lights), env (env intensity),
 *   exposure, tone ('neutral' | 'aces' | 'agx'), haze (neon fog 0…1, false = off), tubes (neon visible tubes),
 *   gobo (daylight window shadows), sunDir, bloom (neon; false = off), rim / halo colours (dark_luxe).
 */
export async function studioPreset(S, kind, o = {}) {
  initAreaLights();
  const s = o.size ?? 2, floor = o.floor ?? 0;
  const P = presetSpec(kind, o, s);
  const scene = S.scene, renderer = S.renderer;
  const handle = { kind, lights: {}, size: s, floor, group: new THREE.Group() };
  handle.group.name = 'studio:' + kind;
  scene.add(handle.group);
  const withBackdrop = o.backdrop !== false;
  const gain = o.intensity ?? 1;

  // ---- tone & exposure
  const tone = o.tone ?? P.tone;
  renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, none: THREE.NoToneMapping }[tone] ?? THREE.NeutralToneMapping;
  renderer.toneMappingExposure = o.exposure ?? P.exposure;

  // ---- backdrop
  let voidColors = null;
  if (withBackdrop && P.backdrop.type === 'cyc') {
    const m = new THREE.MeshStandardMaterial({ color: color(P.backdrop.color), roughness: P.backdrop.rough, metalness: 0, dithering: true, envMapIntensity: 0.6 });
    const cyc = new THREE.Mesh(cycloramaGeometry({ width: 60 * s, front: 30 * s, back: 6 * s, height: 30 * s, radius: 3.6 * s }), m);
    cyc.position.y = floor;
    cyc.receiveShadow = !!P.backdrop.receiveShadow;
    cyc.userData.noContactShadow = true; cyc.userData.noCast = true;
    handle.group.add(cyc);
    handle.backdrop = cyc;
    renderer.setClearColor(color(P.backdrop.color), 1);
  } else if (withBackdrop && P.backdrop.type === 'void') {
    const bg = color(o.color ?? 'bg'), lum = bg.r * 0.2126 + bg.g * 0.7152 + bg.b * 0.0722;
    const light = lum > 0.25;
    const inner = P.backdrop.inner ? color(P.backdrop.inner) : bg.clone().lerp(new THREE.Color(light ? '#ffffff' : '#3a3a48'), light ? 0.55 : 0.35);
    const outer = P.backdrop.outer ? color(P.backdrop.outer) : bg.clone().multiplyScalar(light ? 0.82 : 0.6);
    voidColors = { inner, outer, light };
    const glow = color(P.backdrop.glow).clone().lerp(new THREE.Color('#ffffff'), 0.25);
    const v = gradientVoid(S, { inner, outer, glow, glowAmount: light ? P.backdrop.glowAmount * 0.6 : P.backdrop.glowAmount, glowPos: o.glowPos ?? [0.15, 0.35], centre: o.centre ?? [0, 0.1] });
    handle.group.add(v);
    handle.backdrop = v;
  }

  // ---- lights (RectAreaLights = softboxes / strips) + matching env panels
  const envPanels = [];
  const tubes = [];
  for (const L0 of P.lights) {
    const c = color(L0.color ?? '#ffffff');
    // balance: equalise perceived brightness of coloured lights (a lime strip is ~5× brighter than a violet one)
    const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722, bal = L0.balance ? Math.min(2, Math.max(0.3, 0.3 / Math.max(lum, 1e-3))) : 1;
    const L = { ...L0, intensity: L0.intensity * bal };
    if (L.type === 'spot') {
      const sp = new THREE.SpotLight(c, L.intensity * gain, 0, L.angle ?? 0.8, L.penumbra ?? 1, 0);
      sp.position.set(L.pos[0], L.pos[1] + floor, L.pos[2]);
      sp.target.position.set(L.target[0], L.target[1] + floor, L.target[2]);
      handle.group.add(sp, sp.target);
      handle.lights[L.name] = sp;
      continue;
    }
    const rl = new THREE.RectAreaLight(c, L.intensity * gain, L.w, L.h);
    const pos = new THREE.Vector3(L.pos[0], L.pos[1] + floor, L.pos[2]);
    rl.position.copy(pos);
    rl.lookAt(L.target[0], L.target[1] + floor, L.target[2] + 1e-4);
    handle.group.add(rl);
    handle.lights[L.name] = rl;
    if (L.env !== false) envPanels.push({ pos: [L.pos[0], L.pos[1] - s * 0.4, L.pos[2]], w: L.w, h: L.h, color: L.color ?? '#ffffff', intensity: L.intensity * 0.8, soft: L.soft ?? 0.12, target: [0, 0, 0] });
    if (L.tube && P.tubes && withBackdrop) {
      const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.035 * s, L.h, 8, 24), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(3.2 * Math.sqrt(bal)), toneMapped: true }));
      tube.position.copy(pos);
      tube.userData.noContactShadow = true; tube.userData.noCast = true;
      handle.group.add(tube);
      tubes.push(tube);
    }
  }
  handle.tubes = tubes;
  for (const p of P.envPanels || []) envPanels.push({ ...p, color: p.color ?? (p.flag ? '#050505' : '#ffffff') });
  if (P.hemi) { const h = new THREE.HemisphereLight(color(P.hemi[0]), color(P.hemi[1]), P.hemi[2] * gain); handle.group.add(h); handle.lights.hemi = h; }

  // ---- sun (daylight): shadowed directional light + optional window gobo
  if (P.sun) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const dir = new THREE.Vector3(...P.sun.dir).normalize();
    const sun = new THREE.DirectionalLight(color(P.sun.color), P.sun.intensity * gain);
    const tgt = new THREE.Vector3(0, floor + 0.6 * s, -0.8 * s);
    sun.position.copy(tgt).addScaledVector(dir, 12 * s);
    sun.target.position.copy(tgt);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4; sun.shadow.blurSamples = 12;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -4.5 * s, right: 4.5 * s, top: 4.5 * s, bottom: -4.5 * s, near: 0.5 * s, far: 24 * s });
    handle.group.add(sun, sun.target);
    handle.lights.sun = sun;
    handle.sun = sun;
    if (P.sun.gobo && withBackdrop) {
      // window mullions between the sun and the set: invisible, only their shadow crosses the wall and floor
      const bar = 0.07 * s, span = 9 * s, shapes = [];
      const rect = (x, y, w, h) => { const r = new THREE.Shape(); r.moveTo(x - w / 2, y - h / 2); r.lineTo(x + w / 2, y - h / 2); r.lineTo(x + w / 2, y + h / 2); r.lineTo(x - w / 2, y + h / 2); r.lineTo(x - w / 2, y - h / 2); return r; };
      for (const x of [-0.55, 0.55]) shapes.push(rect(x * s, 0, bar, span));
      shapes.push(rect(0, 0.5 * s, span, bar * 1.4));
      const gobo = new THREE.Mesh(new THREE.ShapeGeometry(shapes), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
      const focus = new THREE.Vector3(0.6 * s, floor + 1.2 * s, -3 * s);
      gobo.position.copy(focus).addScaledVector(dir, 5.5 * s);
      gobo.lookAt(focus);
      gobo.castShadow = true;
      gobo.userData.noContactShadow = true; gobo.userData.noCast = true; gobo.userData.keepCast = true;
      handle.group.add(gobo);
      handle.gobo = gobo;
    }
    S._autoCast = true;
  }

  // ---- environment
  const envSpec = P.env ? { ...P.env } : {
    top: voidColors ? '#' + voidColors.inner.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString() : '#555555',
    horizon: voidColors ? '#' + voidColors.inner.getHexString() : '#333333',
    bottom: voidColors ? '#' + voidColors.outer.getHexString() : '#111111',
    intensity: 1,
  };
  handle.env = envMap(renderer, { ...envSpec, panels: envPanels });
  scene.environment = handle.env;
  scene.environmentIntensity = (o.env ?? P.envIntensity) * 1;

  // ---- floor reflection
  if (withBackdrop && P.reflection && o.reflection !== false) {
    const ro = { ...P.reflection, ...(typeof o.reflection === 'object' ? o.reflection : {}) };
    const r = reflectiveFloor(S, { size: 14 * s, strength: ro.strength, blur: ro.blur, fade: ro.fade });
    r.position.y = floor + 0.006;
    handle.group.add(r);
    handle.reflector = r;
  }

  // ---- contact shadow
  const wantShadow = o.shadow !== false && (P.contact || o.shadow);
  if (wantShadow) {
    const co = { ...(P.contact || { opacity: 0.5, blur: 3, darkness: 1.2 }), ...(typeof o.shadow === 'object' ? o.shadow : {}) };
    const cs = contactShadow(S, { y: floor, size: co.size ?? 4.5 * s, opacity: co.opacity, blur: co.blur, darkness: co.darkness, height: co.height ?? 1.6 * s });
    handle.group.add(cs.mesh);
    handle.contact = cs;
    S._contacts.push(cs);
  }

  // ---- fog / haze, bloom
  if (P.fog && withBackdrop) scene.fog = new THREE.FogExp2(color(P.fog.color), P.fog.density);
  if (P.bloom) S.bloom(P.bloom);
  handle.floor = floor;
  S.studioHandle = handle;
  return handle;
}

// =====================================================================================================================
// Materials library
// =====================================================================================================================
let brushedTex = null;
function brushedTexture() {
  if (brushedTex) return brushedTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d'), r = rng(17);
  g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = r() * 512, v = 110 + r() * 70 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.35})`;
    g.fillRect(r() * 512 - 256, y, 120 + r() * 520, 0.6 + r() * 1.2);
  }
  brushedTex = new THREE.CanvasTexture(c);
  brushedTex.wrapS = brushedTex.wrapT = THREE.RepeatWrapping;
  brushedTex.repeat.set(2, 2);
  return brushedTex;
}
const phys = (base, o) => {
  const { color: c, ...rest } = o;
  const m = new THREE.MeshPhysicalMaterial({ ...base, ...rest });
  m.color = color(c ?? base.color ?? '#ffffff');
  if (o.emissive != null) m.emissive = color(o.emissive);
  if (o.sheenColor != null) m.sheenColor = color(o.sheenColor);
  if (o.attenuationColor != null) m.attenuationColor = color(o.attenuationColor);
  return m;
};
/** S.materials.<name>(opts) — opts override any MeshPhysicalMaterial property; `color` takes tokens */
export const materials = {
  glossyPlastic: (o = {}) => phys({ color: 'accent', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 0.6 }, o),
  mattePlastic: (o = {}) => phys({ color: 'surface', roughness: 0.62, clearcoat: 0, specularIntensity: 0.4 }, o),
  brushedMetal: (o = {}) => phys({ color: '#c9ccd2', metalness: 1, roughness: 0.32, anisotropy: 0.75, anisotropyRotation: 0, roughnessMap: brushedTexture() }, o),
  chrome: (o = {}) => phys({ color: '#ffffff', metalness: 1, roughness: 0.03 }, o),
  gold: (o = {}) => phys({ color: '#f2c46a', metalness: 1, roughness: 0.16 }, o),
  glass: (o = {}) => phys({ color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, thickness: 0.6, ior: 1.5, specularIntensity: 1, dispersion: 0.15, envMapIntensity: 1.2 }, o),
  frostedGlass: (o = {}) => phys({ color: '#f4f6fa', metalness: 0, roughness: 0.42, transmission: 1, thickness: 0.8, ior: 1.45 }, o),
  rubber: (o = {}) => phys({ color: '#1a1a1c', roughness: 0.88, sheen: 0.4, sheenRoughness: 0.8, sheenColor: '#555555', specularIntensity: 0.3 }, o),
  fabric: (o = {}) => phys({ color: 'accent2', roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: '#ffffff', specularIntensity: 0.2 }, o),
  clay: (o = {}) => phys({ color: '#e6e2dc', roughness: 0.92, specularIntensity: 0.25 }, o),
  emissive: (o = {}) => { const m = phys({ color: '#000000', roughness: 0.5 }, { ...o, color: '#000000' }); m.emissive = color(o.color ?? 'accent'); m.emissiveIntensity = o.intensity ?? o.emissiveIntensity ?? 3; return m; },
  iridescent: (o = {}) => phys({ color: '#d8d8e0', metalness: 0.9, roughness: 0.14, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 620], clearcoat: 0.6 }, o),
};

// =====================================================================================================================
// Elements: podiums, devices, turntable
// =====================================================================================================================
function bevelProfile(r, h, b, y0 = 0, seg = 6) {
  b = Math.min(b, r * 0.5, h * 0.5);
  const pts = [new THREE.Vector2(0, y0)];
  for (let i = 0; i <= seg; i++) { const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2); pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, y0 + b + Math.sin(a) * b)); }
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * (Math.PI / 2); pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, y0 + h - b + Math.sin(a) * b)); }
  pts.push(new THREE.Vector2(0, y0 + h));
  return pts;
}
/**
 * Pedestal standing on y = 0 (put it at the floor). Returns a Group with .top (height of the top surface) and .radius.
 * { shape='cylinder' | 'box' | 'stepped', radius=1, height=0.4, bevel=0.03, width, depth (box), steps=3 (stepped),
 *   material (default mattePlastic 'surface'), ring=null | colour (thin glowing ring on the top edge) }
 */
export function podium(o = {}) {
  const shape = o.shape ?? 'cylinder', r = o.radius ?? 1, h = o.height ?? 0.4, b = o.bevel ?? 0.03;
  const material = o.material || materials.mattePlastic({ color: o.color ?? 'surface' });
  const g = new THREE.Group();
  let top = h;
  if (shape === 'box') {
    const w = o.width ?? r * 2, d = o.depth ?? r * 2;
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 6, Math.min(b, h / 2)), material);
    m.position.y = h / 2; g.add(m);
  } else if (shape === 'stepped') {
    const n = o.steps ?? 3, sh = h / n;
    for (let i = 0; i < n; i++) {
      const ri = r * (1 - (i / n) * (o.stepInset ?? 0.32));
      g.add(new THREE.Mesh(new THREE.LatheGeometry(bevelProfile(ri, sh, b, i * sh), 128), material));
    }
  } else {
    g.add(new THREE.Mesh(new THREE.LatheGeometry(bevelProfile(r, h, b), 128), material));
  }
  if (o.ring) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry((shape === 'stepped' ? r * (1 - ((o.steps ?? 3) - 1) / (o.steps ?? 3) * (o.stepInset ?? 0.32)) : r) - b * 0.6, Math.max(0.006, r * 0.008), 8, 160),
      new THREE.MeshBasicMaterial({ color: color(o.ring).multiplyScalar(o.ringIntensity ?? 2.5) }));
    ring.rotation.x = Math.PI / 2; ring.position.y = top - b * 0.25;
    g.add(ring); g.ring = ring;
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.top = top; g.radius = r;
  g.userData.top = top;
  return g;
}

/** rounded rectangle shape centred on the origin */
export function roundedRect(w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
/** flat rounded-rect plane with 0..1 UVs (for screens) */
function screenPlane(w, h, r) {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 16);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}
/** extruded rounded slab, centred, total thickness d with rounded edges of radius e */
function slab(w, h, d, r, e, curve = 24) {
  e = Math.min(e, d / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * e, h - 2 * e, Math.max(0.001, r - e)), {
    depth: d - 2 * e, bevelEnabled: true, bevelThickness: e, bevelSize: e, bevelSegments: 6, curveSegments: curve,
  });
  g.translate(0, 0, -(d - 2 * e) / 2);
  return g;
}

/** built-in screen artwork drawn from the design tokens (deterministic); t animates a subtle progress bar */
function defaultScreen(g, t, w, h, o = {}) {
  const a = hex(o.accent ?? 'accent'), b = hex(o.accent2 ?? 'accent2'), bg = hex(o.bg ?? 'bg');
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, b); gr.addColorStop(1, a);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.9; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
  const u = Math.min(w, h) / 100;
  g.fillStyle = 'rgba(255,255,255,0.94)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${u * 22}px Inter, sans-serif`; g.fillText(o.title ?? '9:41', w / 2, h * 0.24);
  g.font = `500 ${u * 5.5}px Inter, sans-serif`; g.globalAlpha = 0.85; g.fillText(o.subtitle ?? 'Monday, June 12', w / 2, h * 0.24 + u * 17); g.globalAlpha = 1;
  // two cards
  const cw = w * 0.84, cx = (w - cw) / 2;
  for (let i = 0; i < 2; i++) {
    const cy = h * (0.52 + i * 0.17), ch = h * 0.13;
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.roundRect(cx, cy, cw, ch, u * 4); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.roundRect(cx + u * 4, cy + ch * 0.25, ch * 0.5, ch * 0.5, u * 2.5); g.fill();
    g.fillRect(cx + ch * 0.5 + u * 8, cy + ch * 0.3, cw * 0.45, u * 2.6);
    g.globalAlpha = 0.6; g.fillRect(cx + ch * 0.5 + u * 8, cy + ch * 0.58, cw * 0.3, u * 2.2); g.globalAlpha = 1;
  }
  const k = clamp01(t / 4);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx, h * 0.9, cw, u * 1.4);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(cx, h * 0.9, cw * k, u * 1.4);
}

const isVideoUrl = (s) => /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(s);
/**
 * Screen texture source → { texture, update(t), video? }.
 * src: undefined (built-in UI from tokens) | url of an image | url of a video (.mp4/.webm/.mov) | HTMLCanvasElement |
 *      THREE.Texture | function (ctx2d, t, w, h) drawn every frame (deterministic UI animation).
 * The texture is cover-fitted to `aspect` (w/h of the screen).
 */
export async function screenTexture(S, src, aspect, o = {}) {
  const fit = (tex, iw, ih) => {
    if (!iw || !ih || o.fit === 'stretch') return;
    const ia = iw / ih;
    tex.center.set(0.5, 0.5);
    if (o.fit === 'contain') { if (ia > aspect) tex.repeat.set(1, ia / aspect); else tex.repeat.set(aspect / ia, 1); }
    else if (ia > aspect) tex.repeat.set(aspect / ia, 1); else tex.repeat.set(1, ia / aspect);
  };
  const res = o.resolution ?? 1024;
  if (src == null || src === '' || typeof src === 'function') {
    const c = document.createElement('canvas');
    c.width = aspect >= 1 ? res : Math.round(res * aspect); c.height = aspect >= 1 ? Math.round(res / aspect) : res;
    const g = c.getContext('2d');
    const draw = typeof src === 'function' ? src : (gg, t, w, h) => defaultScreen(gg, t, w, h, o);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    let last = null;
    const update = (t) => { const k = Math.round(t * 1000); if (k === last) return; last = k; g.save(); g.clearRect(0, 0, c.width, c.height); draw(g, t, c.width, c.height); g.restore(); tex.needsUpdate = true; };
    update(0);
    return { texture: tex, update, canvas: c };
  }
  if (src instanceof THREE.Texture) return { texture: src, update() {} };
  if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(src); tex.colorSpace = THREE.SRGBColorSpace; fit(tex, src.width, src.height);
    return { texture: tex, update() { tex.needsUpdate = true; } };
  }
  if (typeof src === 'string' && isVideoUrl(src)) {
    // the runtime seeks every <video> in the document to (t - data-start) * data-rate before a frame is captured;
    // we re-upload the frame and redraw on 'seeked' (registered before the runtime's own listener → drawn in time)
    const v = document.createElement('video');
    Object.assign(v, { src, muted: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
    v.dataset.start = String(o.videoStart ?? 0);
    v.dataset.rate = String(o.videoRate ?? 1);
    v.style.cssText = 'position:absolute;left:0;top:0;width:4px;height:4px;opacity:0;pointer-events:none';
    (S.root || document.body).appendChild(v);
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    v.addEventListener('loadedmetadata', () => fit(tex, v.videoWidth, v.videoHeight));
    v.addEventListener('seeked', () => { tex.needsUpdate = true; S._redraw?.(); });
    const update = (t) => {
      // editor preview (no frame-exact seek from the runtime): keep the video in step after the frame is posed
      queueMicrotask(() => {
        const target = Math.max(0, (t - (o.videoStart ?? 0)) * (o.videoRate ?? 1));
        if (!v.seeking && v.readyState >= 1 && Math.abs(v.currentTime - target) > 0.02) v.currentTime = target;
      });
    };
    return { texture: tex, update, video: v };
  }
  const tex = await new THREE.TextureLoader().loadAsync(src);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  fit(tex, tex.image?.width, tex.image?.height);
  return { texture: tex, update() {} };
}

const FINISH = {
  titanium: { color: '#8f8c86', metalness: 1, roughness: 0.34 },
  black: { color: '#2a2b2e', metalness: 0.9, roughness: 0.32 },
  silver: { color: '#d4d6da', metalness: 1, roughness: 0.26 },
  gold: { color: '#e6cfa4', metalness: 1, roughness: 0.25 },
  space: { color: '#4a4c51', metalness: 1, roughness: 0.3 },
};
const frameMat = (o) => {
  const f = FINISH[o.finish] || (o.finish ? { color: o.finish, metalness: 0.85, roughness: 0.3 } : FINISH.titanium);
  return materials.brushedMetal({ color: f.color, metalness: f.metalness, roughness: f.roughness, anisotropy: 0.4 });
};
const glassBlack = () => new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
function displayMat(tex, o) {
  return new THREE.MeshPhysicalMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.brightness ?? 1,
    roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: o.glare ?? 0.6,
  });
}

/**
 * Procedural device mockups. kind: 'phone' | 'tablet' | 'laptop' | 'watch'. Returns a Group (centred; laptop: base on
 * y = 0) with .size {w,h,d}, .screen (display mesh), .setScreen(src) (async), .update(t) (call in render — redraws canvas
 * screens / keeps video in step; S.render() calls it for you), and for laptops .setOpen(0…1) / .lid.
 * opts: { height (phone 1.6, tablet 1.9, watch 0.9, laptop width 2.4), screen (see screenTexture), fit='cover',
 *   finish='titanium' | 'black' | 'silver' | 'gold' | 'space' | css, band (watch strap colour), landscape (tablet),
 *   brightness=1, glare=0.9 (screen reflections), open=1 (laptop), videoStart (clip time the video starts) }
 */
export async function device(S, kind, o = {}) {
  const g = new THREE.Group();
  g.name = 'device:' + kind;
  let screenMesh, scrAspect, update = () => {};
  const setTex = async (src) => {
    const st = await screenTexture(S, src, scrAspect, o);
    screenMesh.material.emissiveMap = st.texture; screenMesh.material.needsUpdate = true;
    update = st.update; g.video = st.video;
    return st;
  };
  if (kind === 'phone' || kind === 'tablet') {
    const tab = kind === 'tablet';
    // proportions (mm): phone 71.5 × 147 × 7.8, r 10.5, bezel 1.9 · tablet 178 × 248 × 6, r 18, bezel 8
    const mm = tab ? [178, 248, 6.2, 18, 8.5] : [71.5, 147, 7.9, 11, 2.2];
    const H = o.height ?? (tab ? 1.9 : 1.6), k = H / mm[1];
    let w = mm[0] * k, h = mm[1] * k; const d = mm[2] * k, r = mm[3] * k, bez = mm[4] * k;
    if (tab && o.landscape) [w, h] = [h, w];
    const body = new THREE.Mesh(slab(w, h, d, r, d * 0.42), frameMat(o));
    g.add(body);
    const front = new THREE.Mesh(screenPlane(w - d * 0.5, h - d * 0.5, r - d * 0.25), glassBlack());
    front.position.z = d / 2 + 0.0008; g.add(front);
    const sw = w - d * 0.5 - bez * 2, sh = h - d * 0.5 - bez * 2;
    scrAspect = sw / sh;
    screenMesh = new THREE.Mesh(screenPlane(sw, sh, Math.max(0.002, r - d * 0.25 - bez)), displayMat(null, o));
    screenMesh.position.z = d / 2 + 0.0016; g.add(screenMesh);
    if (!tab) { // dynamic island
      const isl = new THREE.Mesh(screenPlane(sw * 0.3, sw * 0.088, sw * 0.044), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.2, clearcoat: 1 }));
      isl.position.set(0, sh / 2 - sw * 0.085, d / 2 + 0.0024); g.add(isl);
      const bm = frameMat(o);
      for (const [y, len, side] of [[0.22, 0.13, 1], [0.27, 0.06, -1], [0.17, 0.1, -1], [0.07, 0.1, -1]]) {
        const btn = new THREE.Mesh(new RoundedBoxGeometry(d * 0.25, h * len * 0.6, d * 0.5, 3, d * 0.1), bm);
        btn.position.set(side * (w / 2 + d * 0.05), h * y, 0); g.add(btn);
      }
    }
    // back: glass panel + camera plateau with lenses
    const back = new THREE.Mesh(screenPlane(w - d * 0.5, h - d * 0.5, r - d * 0.25), new THREE.MeshPhysicalMaterial({ color: color(o.backColor ?? (FINISH[o.finish]?.color || '#8f8c86')), roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
    back.position.z = -d / 2 - 0.0008; back.rotation.y = Math.PI; g.add(back);
    const cs = tab ? w * 0.16 : w * 0.43, cam = new THREE.Group();
    const plate = new THREE.Mesh(slab(cs, cs, d * 0.18, cs * 0.26, d * 0.07), new THREE.MeshPhysicalMaterial({ color: color(o.backColor ?? (FINISH[o.finish]?.color || '#8f8c86')), roughness: 0.15, clearcoat: 1 }));
    cam.add(plate);
    const lensR = cs * (tab ? 0.2 : 0.19);
    const lensPos = tab ? [[-0.22, 0.22], [0.22, -0.22]] : [[-0.22, 0.22], [-0.22, -0.22], [0.24, 0]];
    for (const [lx, ly] of lensPos) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(lensR, lensR, d * 0.18, 48), frameMat(o));
      ring.rotation.x = Math.PI / 2; ring.position.set(lx * cs, ly * cs, -d * 0.1); cam.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(lensR * 0.78, 48), new THREE.MeshPhysicalMaterial({ color: 0x07080c, roughness: 0.03, clearcoat: 1, iridescence: 0.6, iridescenceThicknessRange: [200, 500] }));
      lens.position.set(lx * cs, ly * cs, -d * 0.19 - 0.0005); lens.rotation.y = Math.PI; cam.add(lens);
    }
    cam.position.set(-w / 2 + cs / 2 + w * 0.07, h / 2 - cs / 2 - w * 0.07, -d / 2 - d * 0.05);
    g.add(cam);
    g.size = { w, h, d };
  } else if (kind === 'watch') {
    const H = o.height ?? 0.9, k = H / 45; // case 45 × 38 × 10.7 mm
    const w = 38 * k, h = 45 * k, d = 10.7 * k, r = 10.5 * k, bez = 2.4 * k;
    g.add(new THREE.Mesh(slab(w, h, d, r, d * 0.45, 32), frameMat(o)));
    const front = new THREE.Mesh(screenPlane(w - d * 0.5, h - d * 0.5, r - d * 0.25), glassBlack());
    front.position.z = d / 2 + 0.0008; g.add(front);
    const sw = w - d * 0.5 - bez * 2, sh = h - d * 0.5 - bez * 2;
    scrAspect = sw / sh;
    screenMesh = new THREE.Mesh(screenPlane(sw, sh, r - d * 0.25 - bez), displayMat(null, o));
    screenMesh.position.z = d / 2 + 0.0016; g.add(screenMesh);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.28, d * 0.28, d * 0.32, 32), frameMat(o));
    crown.rotation.z = Math.PI / 2; crown.position.set(w / 2 + d * 0.12, h * 0.16, 0); g.add(crown);
    const btn = new THREE.Mesh(new RoundedBoxGeometry(d * 0.2, h * 0.22, d * 0.42, 3, d * 0.08), frameMat(o));
    btn.position.set(w / 2 + d * 0.02, -h * 0.12, 0); g.add(btn);
    // straps: subdivided boxes bent backwards around the wrist
    const bandMat = o.bandMaterial || materials.rubber({ color: o.band ?? 'accent2' });
    const bw = w * 0.8, L = h * 1.5, bt = d * 0.32, R = h * 0.95;
    for (const s of [1, -1]) {
      const geo = new THREE.BoxGeometry(bw, L, bt, 4, 32, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + L / 2, z = p.getZ(i), a = y / R;
        p.setY(i, Math.sin(a) * (R - z)); p.setZ(i, -(R - z) + Math.cos(a) * (R - z) * 1);
        // taper: slightly narrower at the far end
        p.setX(i, p.getX(i) * (1 - 0.12 * (y / L)));
      }
      geo.computeVertexNormals();
      const strap = new THREE.Mesh(geo, bandMat);
      strap.position.set(0, s * (h / 2 - d * 0.1), -d * 0.12);
      if (s < 0) strap.rotation.z = Math.PI;
      g.add(strap);
    }
    g.size = { w, h, d };
  } else if (kind === 'laptop') {
    const W = o.width ?? o.height ?? 2.4, k = W / 312; // 312 × 221 × 15.5 mm
    const D = 221 * k, bt = 8.5 * k, lt = 6 * k, r = 9 * k;
    const metal = frameMat({ finish: o.finish ?? 'space' });
    const base = new THREE.Mesh(slab(W, D, bt, r, bt * 0.4), metal);
    base.rotation.x = -Math.PI / 2; base.position.y = bt / 2; g.add(base);
    // keyboard + trackpad drawn on a canvas (deterministic)
    const kc = document.createElement('canvas'); kc.width = 2048; kc.height = Math.round(2048 * (D / W));
    const kg = kc.getContext('2d'), u = kc.width / 312;
    kg.fillStyle = '#7d8086'; kg.fillRect(0, 0, kc.width, kc.height);
    kg.fillStyle = '#18191b';
    kg.beginPath(); kg.roundRect(26 * u, 18 * u, 260 * u, 104 * u, 3 * u); kg.fill();
    const rows = [14, 14, 13, 12, 11], keyW = 17.1 * u;
    rows.forEach((n, ri) => {
      const y = 21 * u + ri * 19.6 * u, total = 254 * u, gap = 1.4 * u, kw = (total - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) { kg.fillStyle = '#0d0d0e'; kg.beginPath(); kg.roundRect(29 * u + i * (kw + gap), y, kw, 17.6 * u, 2 * u); kg.fill(); }
    });
    void keyW;
    kg.fillStyle = '#727579'; kg.beginPath(); kg.roundRect(98 * u, 132 * u, 116 * u, 76 * u, 5 * u); kg.fill();
    const ktex = new THREE.CanvasTexture(kc); ktex.colorSpace = THREE.SRGBColorSpace; ktex.anisotropy = 8;
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(W - r, D - r), new THREE.MeshPhysicalMaterial({ map: ktex, metalness: 0.6, roughness: 0.4, transparent: false }));
    deck.rotation.x = -Math.PI / 2; deck.position.y = bt + 0.0008;
    g.add(deck);
    // lid pivots at the back edge; local: y = along the lid, display on +z
    const lid = new THREE.Group();
    lid.position.set(0, bt + lt / 2 * 0, -D / 2 + lt * 0.5);
    const shell = new THREE.Mesh(slab(W, D, lt, r, lt * 0.4), metal);
    shell.position.set(0, D / 2, -lt / 2);
    lid.add(shell);
    const bezel = new THREE.Mesh(screenPlane(W - lt * 0.6, D - lt * 0.6, r * 0.8), glassBlack());
    bezel.position.set(0, D / 2, 0.0008); lid.add(bezel);
    const sw = W * 0.94, sh = sw / 1.54;
    scrAspect = sw / sh;
    screenMesh = new THREE.Mesh(screenPlane(sw, sh, r * 0.35), displayMat(null, o));
    screenMesh.position.set(0, D / 2 + (D - lt * 0.6 - sh) / 2 - W * 0.012, 0.0016); lid.add(screenMesh);
    g.add(lid);
    g.lid = lid;
    g.setOpen = (kOpen) => { const th = lerp(0, 108, clamp01(kOpen)) * DEG; lid.rotation.x = Math.PI / 2 - th; };
    g.setOpen(o.open ?? 1);
    g.size = { w: W, h: D, d: D };
  } else throw new Error('device: unknown kind ' + kind);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  g.screen = screenMesh;
  g.setScreen = setTex;
  g.update = (t) => update(t);
  await setTex(o.screen);
  S._devices.push(g);
  return g;
}

/** closed-form turntable: { speed=30 °/s, start=0 °, from=0 (s), ramp=0.6 (s ease-in from rest), axis='y' } → angle (rad) */
export function turntable(obj, t, o = {}) {
  const tt = Math.max(0, t - (o.from ?? 0)), ramp = o.ramp ?? 0.6, sp = (o.speed ?? 30) * DEG;
  const eff = ramp > 0 ? (tt < ramp ? (tt * tt) / (2 * ramp) : tt - ramp / 2) : tt;
  const a = (o.start ?? 0) * DEG + sp * eff;
  obj.rotation[o.axis ?? 'y'] = a;
  return a;
}

// =====================================================================================================================
// Camera: framing + eased, deterministic moves (all derived from a base pose — no state between frames)
// =====================================================================================================================
const easeOf = (S, e, d = 'inOutCubic') => (typeof e === 'function' ? e : S.ease[e ?? d] || S.ease.inOutCubic);
const sph = (dist, az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);

export function installCamera(S) {
  const cam = S.camera;
  const base = { target: S.target.clone(), dist: 10, az: 0, el: 0, roll: 0, zoom: 1 };
  const fromCurrent = () => {
    const rel = cam.position.clone().sub(S.target);
    base.target.copy(S.target); base.dist = rel.length() || 1;
    base.az = Math.atan2(rel.x, rel.z); base.el = Math.asin(THREE.MathUtils.clamp(rel.y / base.dist, -1, 1));
    base.zoom = cam.zoom;
  };
  fromCurrent();
  const apply = (p) => {
    S.target.copy(p.target);
    cam.position.copy(p.target).add(sph(p.dist, p.az, p.el));
    cam.up.set(0, 1, 0);
    cam.lookAt(p.target);
    if (p.pan) cam.rotateY(p.pan);
    if (p.tilt) cam.rotateX(p.tilt);
    if (p.roll) cam.rotateZ(p.roll);
    if (cam.isOrthographicCamera && p.zoom && cam.zoom !== p.zoom) { cam.zoom = p.zoom; cam.updateProjectionMatrix(); }
  };
  const win = (t, m) => {
    const D = studioRt()?.duration || 5;
    return easeOf(S, m.ease, m.defaultEase)(range(t, m.start ?? 0, m.end ?? D));
  };
  Object.assign(cam, {
    base,
    /** remember the current camera position / S.target as the base pose of all moves */
    setBase(position, target) { if (target) S.target.set(...(target.isVector3 ? target.toArray() : target)); if (position) cam.position.set(...(position.isVector3 ? position.toArray() : position)); cam.lookAt(S.target); fromCurrent(); return base; },
    /**
     * compose moves for time t (each { start=0, end=clip duration, ease }):
     *  orbit { from=0, to=30 } degrees around the target · dolly { from=1.2, to=1 } × distance ·
     *  pushIn { amount=0.08 } (inOutSine) · crane { from=-6, to=12 } degrees elevation, lift (world units, target too) ·
     *  whip { at=1, duration=0.45, angle=70, out=false, axis='pan' | 'tilt' } fast pan into (or out of) the shot ·
     *  roll { from, to } degrees · drift { amount=0.02, speed=0.35 } gentle handheld float (deterministic)
     */
    move(t, mv = {}) {
      const p = { target: base.target.clone(), dist: base.dist, az: base.az, el: base.el, roll: base.roll, pan: 0, tilt: 0, zoom: base.zoom };
      if (mv.orbit) { const m = mv.orbit, k = win(t, m); p.az += lerp(m.from ?? 0, m.to ?? 30, k) * DEG; }
      if (mv.dolly) { const m = mv.dolly, k = win(t, m); p.dist *= lerp(m.from ?? 1.2, m.to ?? 1, k); }
      if (mv.pushIn) { const m = { defaultEase: 'inOutSine', ...mv.pushIn }, k = win(t, m); p.dist *= 1 - (m.amount ?? 0.08) * k; }
      if (mv.crane) { const m = mv.crane, k = win(t, m); p.el = THREE.MathUtils.clamp(p.el + lerp(m.from ?? -6, m.to ?? 12, k) * DEG, -1.5, 1.5); if (m.lift) p.target.y += lerp(-m.lift / 2, m.lift / 2, k); }
      if (mv.roll) { const m = mv.roll, k = win(t, m); p.roll += lerp(m.from ?? 0, m.to ?? 0, k) * DEG; }
      if (mv.whip) {
        const m = mv.whip, at = m.at ?? 1, d = m.duration ?? 0.45;
        const k = S.ease.inOutExpo ? S.ease.inOutExpo(range(t, at - d / 2, at + d / 2)) : S.ease.inOutCubic(range(t, at - d / 2, at + d / 2));
        const off = (m.angle ?? 70) * DEG * (m.out ? k : 1 - k);
        if ((m.axis ?? 'pan') === 'tilt') p.tilt += off; else p.pan += off;
      }
      if (mv.drift) {
        const m = mv.drift, a = m.amount ?? 0.02, w = (m.speed ?? 0.35) * Math.PI * 2;
        p.az += a * (Math.sin(t * w * 0.71 + 1.3) + 0.5 * Math.sin(t * w * 1.37 + 0.2));
        p.el += a * 0.6 * (Math.sin(t * w * 0.53 + 2.1) + 0.5 * Math.sin(t * w * 1.11 + 4.0));
        p.roll += a * 0.25 * Math.sin(t * w * 0.42 + 0.7);
      }
      apply(p);
      return p;
    },
    orbit(t, m = {}) { return cam.move(t, { orbit: m }); },
    dolly(t, m = {}) { return cam.move(t, { dolly: m }); },
    pushIn(t, m = {}) { return cam.move(t, { pushIn: m }); },
    crane(t, m = {}) { return cam.move(t, { crane: m }); },
    whip(t, m = {}) { return cam.move(t, { whip: m }); },
    /** depth of field (BokehPass): { focus='target' | distance | Object3D, aperture=0.6 (f-ish, bigger = blurrier), maxblur=0.012 }; false = off */
    dof(m = {}) {
      if (m === false) { if (S._bokeh) S._bokeh.enabled = false; return null; }
      const pass = S._ensureBokeh();
      pass.enabled = true;
      S._dof = { focus: m.focus ?? 'target', aperture: m.aperture ?? 0.6, maxblur: m.maxblur ?? 0.012 };
      return pass;
    },
  });
}

/**
 * Fit the camera to an object (or Box3): the whole bounding box fits inside the frame with `margin` (fraction of the
 * frame on each side; number or [x, y]), keeping the current view direction unless azimuth / elevation (degrees) are
 * given. Works for any aspect (16:9, 9:16, 1:1) — pass `aspect` to frame for another one. Sets the base pose of
 * S.camera.move(). Returns { center, size, distance }.
 */
export function frame(S, obj, o = {}) {
  const cam = S.camera;
  const box = obj.isBox3 ? obj.clone() : new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  if (o.center) center.add(new THREE.Vector3(...o.center));
  const aspect = o.aspect ?? S.width / S.height;
  const [mx, my] = Array.isArray(o.margin) ? o.margin : [o.margin ?? 0.1, o.margin ?? 0.1];
  const az = o.azimuth != null ? o.azimuth * DEG : cam.base.az, el = o.elevation != null ? o.elevation * DEG : cam.base.el;
  const fwd = sph(1, az, el); // target → camera
  const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize(), up = fwd.clone().cross(right).normalize();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).sub(center));
  let dist;
  if (cam.isOrthographicCamera) {
    let hx = 0, hy = 0;
    for (const c of corners) { hx = Math.max(hx, Math.abs(c.dot(right))); hy = Math.max(hy, Math.abs(c.dot(up))); }
    const half = Math.max(hy / (1 - 2 * my), hx / (1 - 2 * mx) / aspect);
    cam.base.zoom = (cam.top - cam.bottom) / 2 / half;
    dist = o.distance ?? Math.max(cam.base.dist, size.length() * 2);
  } else {
    const ty = Math.tan((cam.fov * DEG) / 2) * (1 - 2 * my), tx = Math.tan((cam.fov * DEG) / 2) * aspect * (1 - 2 * mx);
    dist = 0;
    for (const c of corners) {
      const z = c.dot(fwd);
      dist = Math.max(dist, z + Math.abs(c.dot(right)) / tx, z + Math.abs(c.dot(up)) / ty);
    }
    dist *= o.scale ?? 1;
  }
  cam.base.target.copy(center); cam.base.dist = dist; cam.base.az = az; cam.base.el = el;
  cam.near = Math.max(0.01, dist / 100); cam.far = Math.max(cam.far, dist * 40); cam.updateProjectionMatrix();
  if (o.apply !== false) cam.move(0, {});
  return { center, size, distance: dist };
}

// =====================================================================================================================
// install on a stage
// =====================================================================================================================
export function installKit(S) {
  S._contacts = [];
  S._devices = [];
  S.materials = materials;
  S.studio = (kind, opts) => studioPreset(S, kind, opts);
  S.studio.presets = STUDIO_PRESETS;
  S.envMap = (spec) => envMap(S.renderer, spec);
  S.cyclorama = (o = {}) => { const m = new THREE.Mesh(cycloramaGeometry(o), o.material || new THREE.MeshStandardMaterial({ color: color(o.color ?? '#eeeeee'), roughness: 0.9, dithering: true })); m.userData.noContactShadow = true; m.userData.noCast = true; return m; };
  S.contactShadow = (o) => { const c = contactShadow(S, o); S.scene.add(c.mesh); S._contacts.push(c); return c; };
  S.reflectiveFloor = (o) => reflectiveFloor(S, o);
  S.podium = podium;
  S.device = (kind, o) => device(S, kind, o);
  S.screenTexture = (src, aspect, o) => screenTexture(S, src, aspect, o);
  S.turntable = turntable;
  S.frame = (obj, o) => frame(S, obj, o);
  S.roundedRect = roundedRect;
  /** enable / tune bloom later (stage({ bloom }) does the same at creation) */
  S.bloom = (b = {}) => S._ensureBloom(b === true ? {} : b);
  installCamera(S);
  // before each draw: device screens, auto shadow casting (daylight), contact shadows, DOF focus
  S._beforeRender = (t) => {
    for (const d of S._devices) d.update(t);
    if (S._autoCast) S.scene.traverse((m) => { if (m.isMesh && !m.userData.noCast && !m.castShadow) m.castShadow = true; });
    for (const c of S._contacts) c.update();
    if (S._dof && S._bokeh) {
      const f = S._dof.focus;
      const dist = typeof f === 'number' ? f : f?.isObject3D ? S.camera.position.distanceTo(f.getWorldPosition(new THREE.Vector3())) : S.camera.position.distanceTo(S.target);
      S._bokeh.uniforms.focus.value = dist;
      S._bokeh.uniforms.aperture.value = S._dof.aperture * 0.001;
      S._bokeh.uniforms.maxblur.value = S._dof.maxblur;
    }
  };
}

/** composer helpers used by stage(): RenderPass → [Bokeh] → [Bloom] → OutputPass */
export function makeComposer(S) {
  const c = new EffectComposer(S.renderer);
  c.setPixelRatio(1);
  c.setSize(S.width, S.height);
  c.addPass(new RenderPass(S.scene, S.camera));
  c.addPass(new OutputPass());
  return c;
}
export function makeBokeh(S) { return new BokehPass(S.scene, S.camera, { focus: 10, aperture: 0.0006, maxblur: 0.012 }); }
export { v3 as _v3 };
