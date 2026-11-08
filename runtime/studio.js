/*
 * Smashcut — clip runtime.
 * A clip is a pure function of time. This runtime:
 *  - loads params (params.json defaults + overrides from the URL hash),
 *  - virtualises time (Date.now, performance.now, requestAnimationFrame, Math.random are deterministic),
 *  - seeks GSAP timelines, CSS / WAAPI animations, <video> elements and the clip's render(t),
 *  - talks to the editor (postMessage) and to the renderer (window.__studio).
 */
(function () {
  'use strict';
  if (window.studio) return;

  // ---------- deterministic environment ----------
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const nativeNow = performance.now.bind(performance);
  const nativeTimeout = window.setTimeout.bind(window);
  let virtualMs = 0;
  const rafQueue = new Map();
  let rafId = 0;
  window.requestAnimationFrame = (cb) => { const id = ++rafId; rafQueue.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { rafQueue.delete(id); };
  const EPOCH = Date.UTC(2026, 0, 1);
  Date.now = () => EPOCH + virtualMs;
  performance.now = () => virtualMs;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Math.random = mulberry32(1337);

  // GSAP: never let the ticker move things on its own.
  function tameGsap() {
    if (!window.gsap) return;
    try {
      gsap.ticker.lagSmoothing(0);
      gsap.ticker.sleep && gsap.ticker.sleep();
      gsap.config && gsap.config({ autoSleep: 60, nullTargetWarn: false });
    } catch (e) { /* ignore */ }
  }

  // ---------- hash input ----------
  function readHash() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  let input = readHash();

  // ---------- helpers exposed to clips ----------
  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t, outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t, outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutExpo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
    outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outElastic: (t) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
  };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const map = (v, a, b, c, d, clampIt = true) => { let t = (v - a) / (b - a); if (clampIt) t = clamp(t); return c + (d - c) * t; };
  /** progress of t inside [start, start+dur] → 0..1 */
  const progress = (t, start, dur) => clamp((t - start) / dur);
  /** damped spring 0→1 (stateless) */
  const spring = (t, { stiffness = 120, damping = 12, mass = 1 } = {}) => {
    if (t <= 0) return 0;
    const w0 = Math.sqrt(stiffness / mass), zeta = damping / (2 * Math.sqrt(stiffness * mass));
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };

  // ---------- state ----------
  let def = null;
  let params = {};
  let schema = {};
  let timing = { beats: [], bars: [], sections: [], markers: [], words: [], bpm: 120 };
  /** object tracks mapped onto the edit (project time, frame px): { name: [{ itemId, start, end, points:[{t,x,y,w,h,lost}] }] } */
  let tracks = {}, planes = {}, cameras = {};
  /** placement covering project time T, and the two samples around it (+ blend factor) */
  function around(places, T, key) {
    const pl = (places || []).find((p) => T >= p.start - 1e-6 && T <= p.end + 1e-6);
    if (!pl) return null;
    const F = pl[key];
    if (!F || !F.length) return null;
    if (T <= F[0].t) return [F[0], F[0], 0];
    if (T >= F[F.length - 1].t) return [F[F.length - 1], F[F.length - 1], 0];
    let lo = 0, hi = F.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].t <= T) lo = mid; else hi = mid; }
    return [F[lo], F[hi], (T - F[lo].t) / ((F[hi].t - F[lo].t) || 1)];
  }
  /** projective transform taking the rect (0,0)-(w,h) onto quad q (TL,TR,BR,BL) → CSS matrix3d */
  function quadMatrix(q, w, h) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g, hh;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; hh = 0; }
    else {
      const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
      g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    }
    a /= w; d /= w; g /= w; b /= h; e /= h; hh /= h;
    return `matrix3d(${a},${d},0,${g},${b},${e},0,${hh},0,0,1,0,${c},${f},0,1)`;
  }
  function sampleTrack(name, T) {
    const places = tracks[name];
    if (!places || !places.length) return null;
    const pl = places.find((p) => T >= p.start - 1e-6 && T <= p.end + 1e-6) || null;
    if (!pl) return null;
    const P = pl.points;
    if (T <= P[0].t) return P[0];
    if (T >= P[P.length - 1].t) return P[P.length - 1];
    let lo = 0, hi = P.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].t <= T) lo = mid; else hi = mid; }
    const a = P[lo], b = P[hi], k = (T - a.t) / ((b.t - a.t) || 1);
    const L = (u, v) => u + (v - u) * k;
    return { x: L(a.x, b.x), y: L(a.y, b.y), w: L(a.w, b.w), h: L(a.h, b.h), lost: !!(a.lost && b.lost) };
  }
  const timelines = new Set();
  let currentT = 0;
  let lastT = 0;
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  let isReady = false;
  const errors = [];

  function reportError(msg) {
    errors.push(String(msg));
    try { parent !== window && parent.postMessage({ __studio: true, type: 'error', message: String(msg) }, '*'); } catch (e) {}
  }
  window.addEventListener('error', (e) => reportError(e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
  window.addEventListener('unhandledrejection', (e) => reportError('Unhandled rejection: ' + (e.reason && e.reason.message || e.reason)));

  const offset = () => Number(input.offset || 0); // clip start in project time minus trim-in

  function localize(list) {
    const o = offset();
    return list.map((x) => (typeof x === 'number' ? x - o : { ...x, start: x.start - o, end: x.end != null ? x.end - o : undefined, time: x.time != null ? x.time - o : undefined }));
  }

  const studio = {
    version: 1,
    ease, clamp, lerp, map, progress, spring,
    random: (seed = 1) => mulberry32(typeof seed === 'string' ? [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) : seed),
    get params() { return params; },
    get schema() { return schema; },
    get width() { return Number(input.width) || 1920; },
    get height() { return Number(input.height) || 1080; },
    get fps() { return Number(input.fps) || 30; },
    get duration() { return Number(input.duration) || (def && def.duration) || 5; },
    get time() { return currentT; },
    /** beat map in clip-local seconds (from the project's music, or a 120 bpm grid) */
    get beats() { return localize(timing.beats); },
    get bars() { return localize(timing.bars); },
    get sections() { return localize(timing.sections); },
    get markers() { return localize(timing.markers); },
    /** transcript words in clip-local seconds: [{text, start, end}] */
    get words() { return localize(timing.words); },
    get bpm() { return timing.bpm || 120; },
    /**
     * where a tracked object is at clip-local time t (track_object): {x, y, w, h, cx, cy, lost} in frame pixels,
     * already mapped through the video's position on the timeline (start/in, fit, transform). null if not on screen.
     */
    track(name, t = currentT) {
      const r = sampleTrack(name, t + (Number(input.offset) || 0));
      return r ? { ...r, cx: r.x + r.w / 2, cy: r.y + r.h / 2 } : null;
    },
    /** names of the project's tracks */
    get tracks() { return { objects: Object.keys(tracks), planes: Object.keys(planes), cameras: Object.keys(cameras) }; },
    /**
     * a tracked flat surface (planar_track) at clip-local t: { corners: [[x,y]×4] TL,TR,BR,BL in frame px, matrix(w,h) }.
     * Put an element on it: el.style.transformOrigin = '0 0'; el.style.transform = pl.matrix(elWidth, elHeight). null if not on screen.
     */
    plane(name, t = currentT) {
      const r = around(planes[name], t + (Number(input.offset) || 0), 'frames');
      if (!r) return null;
      const [A, B, k] = r;
      const corners = A.corners.map((c, i) => [c[0] + (B.corners[i][0] - c[0]) * k, c[1] + (B.corners[i][1] - c[1]) * k]);
      return { corners, matrix: (w, h) => quadMatrix(corners, w, h) };
    },
    /**
     * camera_track: where the scene point that was at (x, y) — frame px on the first tracked frame — is at clip-local t.
     * Graphics placed with it stay glued to the world while the camera pans/zooms/rolls. null if the shot isn't on screen.
     */
    follow(name, x, y, t = currentT) {
      const r = around(cameras[name], t + (Number(input.offset) || 0), 'frames');
      if (!r) return null;
      const [A, B, k] = r;
      const H = A.H.map((v, i) => v + (B.H[i] - v) * k);
      const w = H[6] * x + H[7] * y + H[8] || 1e-9;
      return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w, scale: Math.hypot(H[0], H[3]) / w };
    },
    /** time (clip-local seconds) of the n-th beat at/after clip start (0-based) */
    beat(n = 0) {
      const b = studio.beats.filter((x) => x >= -1e-6);
      if (b[n] != null) return b[n];
      const spb = 60 / studio.bpm;
      return b.length ? b[b.length - 1] + (n - (b.length - 1)) * spb : n * spb;
    },
    /**
     * loudness 0..1 of the project's music/audio at clip-local time t (default: current time).
     * Uses the analysed mix when available, otherwise a synthetic pulse on the beat grid.
     */
    level(t = currentT) {
      const L = timing.levels, rate = timing.levelsRate || 10;
      if (L && L.length) {
        const x = (t + offset()) * rate, i = Math.floor(x), f = x - i;
        const a = L[Math.max(0, Math.min(L.length - 1, i))] || 0, b = L[Math.max(0, Math.min(L.length - 1, i + 1))] || 0;
        return a + (b - a) * f;
      }
      const spb = 60 / studio.bpm;
      const since = (((t + offset()) % spb) + spb) % spb;
      return 0.35 + 0.55 * Math.exp(-since * 7);
    },
    /**
     * project design system: { colors[], type[], motion[], spacing[] } plus helpers:
     * studio.design.color('accent', '#fff'), studio.design.motion('enter') → {ease, duration}
     */
    get design() {
      return {
        ...design,
        color: (name, fallback) => ((design.colors || []).find((c) => c.name === name) || {}).value || fallback,
        font: (role, fallback) => (design.type || []).find((t) => t.role === role) || fallback,
        motion: (name, fallback = { ease: 'power3.out', duration: 0.6 }) => (design.motion || []).find((m) => m.name === name) || fallback,
      };
    },
    /** paused GSAP timeline that the runtime seeks for you */
    timeline(vars) {
      if (!window.gsap) throw new Error('GSAP not loaded: add <script src="/vendor/gsap.min.js"></script>');
      const tl = gsap.timeline({ ...(vars || {}), paused: true });
      timelines.add(tl);
      return tl;
    },
    /** register an existing GSAP timeline / tween for seeking */
    track(tl) { tl && tl.pause && (tl.pause(), timelines.add(tl)); return tl; },
    clip(d) {
      def = d;
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
      else boot();
    },
  };
  window.studio = studio;

  async function loadParams() {
    try {
      const res = await fetch('params.json', { cache: 'no-store' });
      if (res.ok) {
        const j = await res.json();
        schema = j.schema || {};
      }
    } catch (e) { /* no params */ }
    const defaults = {};
    for (const [k, s] of Object.entries(schema)) defaults[k] = s.default;
    params = { ...defaults, ...(input.params || {}) };
    bindTokens();
  }

  // ---------- universal controls: design-system style binding ----------
  // Colour/font params follow the project's design system unless the user set them explicitly on the item
  // (or chose "own style"). Explicit binding: params.json  "accent": { "type": "color", "token": "accent" }.
  const ROLE_SYNONYMS = {
    accent: ['accent', 'primary', 'brand'],
    'accent-2': ['accent-2', 'accent2', 'secondary'],
    text: ['text', 'fg', 'foreground', 'ink'],
    muted: ['muted', 'text-2', 'subtle', 'secondary-text'],
    bg: ['bg', 'background', 'base'],
    surface: ['surface', 'card', 'panel', 'bg-2', 'plate'],
  };
  const KEY_ROLES = [
    [/^(accent2|color2|c2|colorb|keycolor2|glowcolor2|secondary.*)$/i, 'accent-2'],
    [/^(highlighttext|accenttext|pilltextcolor)$/i, 'bg'],
    [/^(accent|accentcolor|highlight|highlightcolor|color1|c1|colora|keycolor1|pincolor|pillcolor|ripplecolor|glow|glowcolor|linecolor|strokecolor)$/i, 'accent'],
    // a plain `color` is almost always the main text/shape colour, not the accent
    [/^(color|textcolor|cardtext|typecolor|facecolor)$/i, 'text'],
    [/^(barcolor)$/i, 'muted'],
    [/^(labelcolor|sublinecolor|rolecolor)$/i, 'muted'],
    [/^(background|bg|bgcolor|bg1|bgedge|dark|basecolor)$/i, 'bg'],
    [/^(cardcolor|plate|bg2|bgcenter|surface|bar|navy)$/i, 'surface'],
  ];
  let bindings = {};
  function tokenColor(role) {
    const cs = (design && design.colors) || [];
    for (const n of ROLE_SYNONYMS[role] || [role]) { const c = cs.find((x) => x.name === n); if (c) return c; }
    return null;
  }
  function bindTokens() {
    bindings = {};
    if (!design || (!(design.colors || []).length && !(design.type || []).length)) return;
    if (params.__style === 'own') return;
    const explicit = input.params || {};
    for (const [k, sp] of Object.entries(schema)) {
      if (k in explicit) continue; // user's own value wins
      if (sp.type === 'color') {
        let role = sp.token;
        if (!role) for (const [re, r] of KEY_ROLES) if (re.test(k)) { role = r; break; }
        const c = role && tokenColor(role);
        if (c) { params[k] = c.value; bindings[k] = c.name; }
      } else if (/font/i.test(k) && !/size/i.test(k) && (sp.type === 'select' || sp.type === 'text')) {
        const roles = design.type || [];
        const want = sp.token || (/body|sub|caption|role/i.test(k) ? 'body' : 'display');
        const t = roles.find((x) => x.role === want) || roles.find((x) => x.role === 'title') || roles[0];
        if (t) { params[k] = t.family; bindings[k] = t.role; }
      }
    }
  }

  // ---------- universal controls: energy (time remap) ----------
  // e > 1: entrance & exit play faster and the hold stretches; e < 1: calmer. Start and end stay put.
  function remap(t) {
    const e = Number(params.__energy || 1);
    const D = studio.duration;
    if (!(e > 0) || Math.abs(e - 1) < 1e-3 || !(D > 0)) return t;
    const H = Math.min(1.2, D / 3), T = Math.min(1.0, D / 3);
    const h = Math.min(H / e, D / 2), tt = Math.min(T / e, D / 2);
    if (t <= h) return (t / h) * H;
    if (t >= D - tt) return D - T + ((t - (D - tt)) / tt) * T;
    const a = h, b = D - tt, A = H, B = D - T;
    return b > a ? A + ((t - a) / (b - a)) * (B - A) : A;
  }

  /** union box (px) of everything visible on the stage at the current time — for anchoring / gizmos */
  function bbox() {
    const root = document.getElementById('stage') || document.body;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    const els = root.querySelectorAll('*');
    for (let i = 0; i < els.length && i < 4000; i++) {
      const el = els[i];
      if (el.children.length && !(el instanceof HTMLCanvasElement) && !(el instanceof SVGSVGElement) && el.tagName !== 'IMG' && !hasOwnText(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.02) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.width >= studio.width * 0.98 && r.height >= studio.height * 0.98 && !(el instanceof HTMLCanvasElement)) continue;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); n++;
    }
    if (!n) return null;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(studio.width, x1); y1 = Math.min(studio.height, y1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function hasOwnText(el) { for (const c of el.childNodes) if (c.nodeType === 3 && c.textContent.trim()) return true; return false; }

  // design system tokens → CSS custom properties + studio.design
  let design = { colors: [], type: [], motion: [], spacing: [] };
  async function loadDesign() {
    if (input.design === false) return;
    try {
      const res = await fetch('/api/design', { cache: 'no-store' });
      if (!res.ok) return;
      design = await res.json();
      const L = [];
      for (const c of design.colors || []) L.push(`--color-${c.name}:${c.value}`);
      for (const t of design.type || []) { L.push(`--font-${t.role}:'${t.family}',system-ui,sans-serif`, `--weight-${t.role}:${t.weight}`, `--size-${t.role}:${t.size}px`); if (t.tracking != null) L.push(`--tracking-${t.role}:${t.tracking}em`); }
      for (const m of design.motion || []) L.push(`--dur-${m.name}:${m.duration}s`);
      for (const x of design.spacing || []) L.push(`--space-${x.name}:${x.value}px`);
      let el = document.getElementById('studio-design');
      if (!el) { el = document.createElement('style'); el.id = 'studio-design'; document.head.prepend(el); }
      el.textContent = `:root{${L.join(';')}}`;
    } catch (e) { /* standalone */ }
  }

  async function loadTiming() {
    if (input.timing !== false) {
      try {
        const [res, tr] = await Promise.all([fetch('/api/timing', { cache: 'no-store' }), fetch('/api/tracks', { cache: 'no-store' })]);
        if (res.ok) timing = { ...timing, ...(await res.json()) };
        if (tr.ok) { const d = await tr.json(); tracks = d.objects || {}; planes = d.planes || {}; cameras = d.cameras || {}; }
      } catch (e) { /* standalone */ }
    }
    if (!timing.beats.length) {
      const spb = 60 / (timing.bpm || 120);
      timing.beats = Array.from({ length: 512 }, (_, i) => i * spb);
      timing.bars = timing.beats.filter((_, i) => i % 4 === 0);
    }
  }

  async function waitAssets() {
    void document.body.offsetHeight; // force style recalc so used fonts start loading
    try { await document.fonts.ready; } catch (e) {}
    const imgs = [...document.images].filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
    const vids = [...document.querySelectorAll('video')];
    await Promise.all(vids.map((v) => (v.readyState >= 2 ? null : new Promise((r) => { v.addEventListener('loadeddata', r, { once: true }); v.addEventListener('error', r, { once: true }); setTimeout(r, 4000); }))));
    vids.forEach((v) => { v.muted = true; v.pause(); });
  }

  let root = null;
  let setupResult = null;

  async function runSetup() {
    timelines.clear();
    try { if (window.gsap) gsap.globalTimeline.clear(); } catch (e) {}
    root = document.getElementById('stage') || document.body;
    root.innerHTML = '';
    Math.random = mulberry32(1337);
    const ctx = { tl: window.gsap ? studio.timeline() : null, params, studio, width: studio.width, height: studio.height, duration: studio.duration };
    try {
      setupResult = def.setup ? await def.setup(root, params, ctx) : null;
      if (setupResult && typeof setupResult.seek === 'function' && typeof setupResult.pause === 'function') studio.track(setupResult);
    } catch (e) {
      reportError('setup() failed: ' + (e && e.stack || e));
    }
    await waitAssets();
  }

  function applyTime(tIn) {
    const t = remap(tIn);
    currentT = t;
    virtualMs = t * 1000;
    // rAF callbacks get the virtual timestamp
    const q = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb] of q) { try { cb(virtualMs); } catch (e) { reportError(e.message); } }
    for (const tl of timelines) { try { tl.time(t, false); } catch (e) { reportError(e.message); } }
    try {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
    } catch (e) {}
    if (!def) return;
    try {
      if (def.render) def.render(t, { params, studio });
      else if (setupResult && typeof setupResult.render === 'function') setupResult.render(t);
    } catch (e) { reportError('render(t) failed: ' + e.message); }
  }

  async function seekVideos(t) {
    const vids = [...document.querySelectorAll('video')];
    await Promise.all(vids.map((v) => {
      const start = Number(v.dataset.start || 0), rate = Number(v.dataset.rate || 1);
      const target = Math.max(0, (t - start) * rate);
      if (Math.abs(v.currentTime - target) < 0.001) return null;
      return new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = target; setTimeout(r, 2000); });
    }));
  }

  async function seek(t) {
    await ready;
    applyTime(t);
    await seekVideos(t);
    return currentT;
  }

  // CSS transitions run on wall-clock time — never deterministic when seeking. Disable them globally.
  function freezeCss() {
    const st = document.createElement('style');
    st.id = 'studio-freeze';
    st.textContent = '*,*::before,*::after{transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
    document.head.appendChild(st);
  }

  async function boot() {
    tameGsap();
    freezeCss();
    document.documentElement.style.setProperty('--w', studio.width + 'px');
    document.documentElement.style.setProperty('--h', studio.height + 'px');
    // load every bundled face up-front so setup() can measure text with final metrics
    const fontsP = Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    await Promise.all([loadParams(), loadTiming(), loadDesign().then(() => bindTokens()), Promise.race([fontsP, new Promise((r) => nativeTimeout(r, 5000))])]);
    await runSetup();
    applyTime(Number(input.t || 0));
    isReady = true;
    readyResolve();
    post({ type: 'ready', duration: def.duration || null, schema, errors, bindings });
  }

  function post(msg) {
    try { if (parent !== window) parent.postMessage({ __studio: true, ...msg }, '*'); } catch (e) {}
  }

  // editor protocol
  window.addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || !m.__studio) return;
    if (m.type === 'seek') {
      lastT = m.t;
      if (isReady) applyTime(m.t);
      // render mode: confirm once this time is fully applied (incl. <video> seeks inside the clip)
      if (m.ack != null) { if (isReady) await seekVideos(m.t); post({ type: 'seeked', ack: m.ack }); }
    }
    if (m.type === 'input') {
      input = { ...input, ...m.input };
      if (!isReady) return;
      await loadParams();
      await runSetup();
      applyTime(lastT);
      post({ type: 'ready', duration: def.duration || null, schema, errors, bindings });
    }
  });

  // renderer protocol
  window.__studio = {
    ready,
    seek,
    errors,
    info: () => ({ duration: def && def.duration, schema, params, errors, bindings }),
    bbox,
  };

  // safety: if clip never calls studio.clip() (ES-module clips load their imports first, e.g. Three.js: allow more time)
  let bootChecks = 0;
  const bootCheck = () => {
    if (def) return;
    if (bootChecks++ === 0 && document.querySelector('script[type="module"]')) { setTimeout(bootCheck, 16000); return; }
    reportError('clip.js never called studio.clip({...}) — syntax error, failed import or exception at load?'); def = { duration: 1 }; isReady = true; readyResolve(); post({ type: 'ready', duration: null, schema, errors });
  };
  setTimeout(bootCheck, 4000);
  void nativeRaf; void nativeNow;
})();
