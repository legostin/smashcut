/*
 * Agent Video Studio — clip runtime.
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
  const timelines = new Set();
  let currentT = 0;
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
  }

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
        const res = await fetch('/api/timing', { cache: 'no-store' });
        if (res.ok) timing = { ...timing, ...(await res.json()) };
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

  function applyTime(t) {
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
    await Promise.all([loadParams(), loadTiming(), loadDesign(), Promise.race([fontsP, new Promise((r) => nativeTimeout(r, 5000))])]);
    await runSetup();
    applyTime(Number(input.t || 0));
    isReady = true;
    readyResolve();
    post({ type: 'ready', duration: def.duration || null, schema, errors });
  }

  function post(msg) {
    try { if (parent !== window) parent.postMessage({ __studio: true, ...msg }, '*'); } catch (e) {}
  }

  // editor protocol
  window.addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || !m.__studio) return;
    if (m.type === 'seek') {
      if (isReady) applyTime(m.t);
      // render mode: confirm once this time is fully applied (incl. <video> seeks inside the clip)
      if (m.ack != null) { if (isReady) await seekVideos(m.t); post({ type: 'seeked', ack: m.ack }); }
    }
    if (m.type === 'input') {
      input = { ...input, ...m.input };
      if (!isReady) return;
      await loadParams();
      await runSetup();
      applyTime(currentT);
      post({ type: 'ready', duration: def.duration || null, schema, errors });
    }
  });

  // renderer protocol
  window.__studio = {
    ready,
    seek,
    errors,
    info: () => ({ duration: def && def.duration, schema, params, errors }),
  };

  // safety: if clip never calls studio.clip()
  setTimeout(() => {
    if (!def) { reportError('clip.js never called studio.clip({...}) — syntax error or exception at load?'); def = { duration: 1 }; isReady = true; readyResolve(); post({ type: 'ready', duration: null, schema, errors }); }
  }, 4000);
  void nativeRaf; void nativeNow;
})();
