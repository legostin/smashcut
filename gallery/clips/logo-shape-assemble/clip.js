// Geometric shape build: primitives fly in on curved (polar) paths with overshoot, orbit the centre,
// then each morphs (MorphSVG) into one piece of the logo while flying home. Flight positions are a pure
// function of t in render(); morphs, flash ring, mark slide and wordmark reveal live on ctx.tl.
gsap.registerPlugin(MorphSVGPlugin);
studio.clip({
  duration: 5,
  async setup(root, p, { tl, duration }) {
    const D = duration, W = studio.width, H = studio.height;
    const NS = 'http://www.w3.org/2000/svg';
    const palette = String(p.palette || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!palette.length) palette.push('#ff5a36', '#2f5bff', '#ffc21a', '#141414');

    // built-in Bauhaus mark, 3×2 grid of 36 px cells (120×78)
    const DEFAULT = [
      'M0 36V0A36 36 0 0 1 36 36Z',                                   // quarter disc
      'M60 0a18 18 0 1 1 0 36a18 18 0 1 1 0-36Z',                     // circle
      'M92 0h20a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H92a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8Z', // rounded square
      'M0 42L36 78H0Z',                                               // triangle
      'M42 42H78A18 18 0 0 1 42 42Z',                                 // half disc
      'M93 51H111A9 9 0 0 1 111 69H93A9 9 0 0 1 93 51Z',              // pill
    ];
    function parseLogo(src) {
      src = String(src || '').trim();
      if (!src) return DEFAULT;
      if (src.includes('<')) {
        // convert any basic shape to path data via MorphSVG
        const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
        const tmp = document.createElementNS(NS, 'svg');
        document.body.appendChild(tmp);
        const out = [...doc.querySelectorAll('path,circle,rect,ellipse,polygon,polyline')].map((n) => {
          const c = document.createElementNS(NS, n.tagName.toLowerCase());
          for (const a of ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points']) if (n.getAttribute(a) != null) c.setAttribute(a, n.getAttribute(a));
          tmp.appendChild(c);
          const path = c.tagName === 'path' ? c : MorphSVGPlugin.convertToPath(c)[0];
          return path.getAttribute('d');
        });
        tmp.remove();
        return out.filter(Boolean);
      }
      return src.split('\n').map((l) => l.trim()).filter(Boolean);
    }
    const logoPaths = parseLogo(p.logoSvg);
    const decoy = logoPaths.length < 2; // single-path logo → shapes converge, then crossfade to the logo

    const el = document.createElement('div');
    el.className = 'sa';
    if (p.background === 'solid') el.style.background = p.bgColor;
    root.appendChild(el);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'fx');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el.appendChild(svg);
    const mk = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); parent.appendChild(n); return n; };
    const ring = mk('circle', { cx: 0, cy: 0, r: 10, fill: 'none', stroke: p.background === 'solid' ? p.textColor : '#ffffff', 'stroke-width': 6, opacity: 0 }, svg);
    const markG = mk('g', {}, svg);

    // measure the logo
    const probe = mk('g', {}, markG);
    logoPaths.forEach((d) => mk('path', { d }, probe));
    const lb = probe.getBBox();
    probe.remove();
    const s = p.markSize / Math.max(1, lb.height);
    const markW = lb.width * s, markH = lb.height * s;

    // wordmark (HTML) + lockup geometry
    const wm = document.createElement('div');
    wm.className = 'wm';
    wm.innerHTML = '<span class="in"><span class="word"></span><span class="tag"></span></span>';
    el.appendChild(wm);
    const word = wm.querySelector('.word'), tagEl = wm.querySelector('.tag'), wIn = wm.querySelector('.in');
    const weight = p.font === 'Playfair Display' ? 900 : p.font === 'Unbounded' ? 800 : 800;
    word.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.wordSize}px;letter-spacing:${p.font === 'Unbounded' ? '-0.03em' : '-0.04em'};color:${p.textColor}`;
    word.textContent = p.wordmark || '';
    tagEl.textContent = p.tagline || '';
    tagEl.style.color = p.textColor;
    if (!p.tagline) tagEl.style.display = 'none';
    try { await document.fonts.load(`${weight} ${p.wordSize}px '${p.font}'`, p.wordmark || 'x'); } catch (e) {}
    const gap = p.wordmark ? Math.max(40, markH * 0.22) : 0;
    let ww = p.wordmark ? wIn.getBoundingClientRect().width : 0;
    const maxWW = W - 240 - markW - gap;
    if (ww > maxWW) { const k = maxWW / ww; word.style.fontSize = p.wordSize * k + 'px'; ww = wIn.getBoundingClientRect().width; }
    const L = markW + gap + ww;
    const finalCX = W / 2 - L / 2 + markW / 2; // mark centre once the wordmark is out
    wm.style.left = (W / 2 - L / 2 + markW + gap) + 'px';
    if (!p.wordmark) wm.style.display = 'none';

    // pieces
    const piecePaths = decoy ? Array.from({ length: Math.max(4, Math.min(8, p.shapeCount | 0)) }, () => null) : logoPaths;
    const types = ['circle', 'square', 'triangle', 'pill'];
    function prim(type, cx, cy, size) {
      const r = size / 2;
      if (type === 'circle') return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
      if (type === 'triangle') return `M${cx} ${cy - r * 1.05}L${cx + r * 0.95} ${cy + r * 0.7}L${cx - r * 0.95} ${cy + r * 0.7}Z`;
      if (type === 'pill') { const w = size * 1.2, h = size * 0.5, rr = h / 2; return `M${cx - w / 2 + rr} ${cy - rr}H${cx + w / 2 - rr}A${rr} ${rr} 0 0 1 ${cx + w / 2 - rr} ${cy + rr}H${cx - w / 2 + rr}A${rr} ${rr} 0 0 1 ${cx - w / 2 + rr} ${cy - rr}Z`; }
      const q = size * 0.82, c = q * 0.18; // rounded square
      return `M${cx - q / 2 + c} ${cy - q / 2}H${cx + q / 2 - c}Q${cx + q / 2} ${cy - q / 2} ${cx + q / 2} ${cy - q / 2 + c}V${cy + q / 2 - c}Q${cx + q / 2} ${cy + q / 2} ${cx + q / 2 - c} ${cy + q / 2}H${cx - q / 2 + c}Q${cx - q / 2} ${cy + q / 2} ${cx - q / 2} ${cy + q / 2 - c}V${cy - q / 2 + c}Q${cx - q / 2} ${cy - q / 2} ${cx - q / 2 + c} ${cy - q / 2}Z`;
    }
    const logoG = mk('g', {}, markG); // logo-space group: translate + scale applied in render
    const rnd = studio.random(p.wordmark || 'logo');
    const N = piecePaths.length;
    const pieces = piecePaths.map((d, i) => {
      const g = mk('g', {}, logoG);
      let cx, cy, size;
      if (d) {
        const tmp = mk('path', { d }, g); const b = tmp.getBBox(); tmp.remove();
        cx = b.x + b.width / 2; cy = b.y + b.height / 2; size = Math.max(b.width, b.height);
      } else { cx = lb.x + lb.width / 2; cy = lb.y + lb.height / 2; size = Math.max(lb.width, lb.height) * 0.42; }
      const type = types[(i + 1) % types.length];
      const start = prim(type, cx, cy, size * 0.9);
      const path = mk('path', { d: start, fill: palette[i % palette.length] }, g);
      return { g, path, d, cx, cy, size, i,
        theta: -Math.PI / 2 + (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.4,
        spin: (rnd() < 0.5 ? -1 : 1) * (200 + rnd() * 260) };
    });
    let logoFull = null;
    if (decoy) {
      logoFull = mk('g', { opacity: 0 }, logoG);
      logoPaths.forEach((d, i) => mk('path', { d, fill: palette[i % palette.length] }, logoFull));
    }

    // ---- timing ----
    const k = Math.min(1, D / 3.8);
    const enterDur = 0.75 * Math.max(0.6, k);
    const enterSt = 0.06 * k;
    let TL = 1.35 * Math.max(0.55, k);                // landing start
    if (p.syncToBeat) {
      // nearest beat to the nominal landing (the morph lands on it)
      let best = TL, bd = 1e9;
      for (let n = 0; n < 32; n++) { const b = studio.beat(n) - 0.45 * k; if (b > 0.6 * k && Math.abs(b - TL) < bd) { bd = Math.abs(b - TL); best = b; } }
      TL = best;
    }
    const landDur = 0.6 * Math.max(0.6, k);
    const landSt = 0.035;
    const hit = TL + landDur * 0.85 + landSt * (N - 1);
    const orbitR = Math.max(markW, markH) * 0.95 + 60;
    const omega = 2.4;
    const eOutCubic = (x) => 1 - Math.pow(1 - x, 3);
    const eOutBack = (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    const eInOut3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const clamp = (x) => Math.max(0, Math.min(1, x));

    // morphs (on the timeline)
    pieces.forEach((pc) => {
      const at = TL + pc.i * landSt;
      if (pc.d) tl.to(pc.path, { morphSVG: { shape: pc.d, shapeIndex: 'auto' }, duration: landDur, ease: 'power3.inOut' }, at);
      else tl.to(pc.path, { scale: 0, transformOrigin: '50% 50%', duration: landDur, ease: 'power3.in' }, at);
    });
    if (logoFull) tl.fromTo(logoFull, { opacity: 0, scale: 0.6, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, hit - 0.15);
    // flash ring
    const ringR = Math.max(markW, markH) * 0.62;
    tl.fromTo(ring, { attr: { r: ringR * 0.6, 'stroke-width': 14 }, opacity: 0.95 }, { attr: { r: ringR * 2.1, 'stroke-width': 1 }, opacity: 0, duration: 0.75 * Math.max(0.6, k), ease: 'expo.out', immediateRender: false }, hit - 0.04);
    // settle pop + mark slide + wordmark reveal
    const st = { pop: 1, cx: W / 2, push: 1 };
    tl.fromTo(st, { pop: 1 }, { pop: 1.07, duration: 0.12, ease: 'power2.out' }, hit - 0.06)
      .to(st, { pop: 1, duration: 0.55 * Math.max(0.6, k), ease: 'back.out(3)' }, hit + 0.06);
    const slideAt = hit + 0.2 * k;
    const slideDur = 0.85 * Math.max(0.6, k);
    if (p.wordmark) {
      tl.fromTo(st, { cx: W / 2 }, { cx: finalCX, duration: slideDur, ease: 'expo.inOut' }, slideAt)
        .fromTo(wIn, { xPercent: -105 }, { xPercent: 0, duration: slideDur, ease: 'expo.inOut' }, slideAt + 0.04);
    }
    tl.fromTo(st, { push: 1 }, { push: 1.035, duration: D, ease: 'none' }, 0);
    // exit: wordmark slides back behind the mark, mark pieces scale out
    const exitDur = Math.min(0.5, D * 0.13);
    const out = D - exitDur - 0.04;
    if (p.wordmark) tl.to(wIn, { xPercent: -105, duration: exitDur * 0.75, ease: 'power3.in' }, out);
    const exSt = Math.min(0.03, exitDur * 0.2 / N);
    pieces.forEach((pc) => tl.to(pc.path, { scale: 0, transformOrigin: '50% 50%', duration: exitDur * 0.5, ease: 'back.in(2)' }, out + exitDur * 0.25 + (N - 1 - pc.i) * exSt));
    if (logoFull) tl.to(logoFull, { scale: 0, opacity: 0, duration: exitDur * 0.5, ease: 'back.in(2)' }, out + exitDur * 0.3);

    return {
      render(t) {
        const cy0 = H / 2;
        const sc = s * st.pop * st.push;
        const ox = st.cx - (lb.x + lb.width / 2) * sc, oy = cy0 - (lb.y + lb.height / 2) * sc;
        logoG.setAttribute('transform', `translate(${ox} ${oy}) scale(${sc})`);
        ring.setAttribute('cx', st.cx); ring.setAttribute('cy', cy0);
        pieces.forEach((pc) => {
          const t0 = 0.04 + pc.i * enterSt;
          const tLand = TL + pc.i * landSt;
          // polar flight around the stage centre
          let ang, rad, vis = 1;
          if (t < t0) { vis = 0; ang = pc.theta - 1.3; rad = 1150; }
          else if (t < t0 + enterDur) {
            const u = (t - t0) / enterDur;
            ang = pc.theta - 1.3 * (1 - eOutCubic(u));
            rad = orbitR + (1150 - orbitR) * (1 - eOutBack(u));
          } else { ang = pc.theta + omega * (t - t0 - enterDur); rad = orbitR * (1 - 0.18 * clamp((t - t0 - enterDur) / 0.8)); }
          const fx = W / 2 + Math.cos(ang) * rad, fy = cy0 + Math.sin(ang) * rad;
          // home (final) screen position of this piece's centre
          const hx = ox + pc.cx * sc, hy = oy + pc.cy * sc;
          const v = eInOut3(clamp((t - tLand) / landDur));
          const px = fx + (hx - fx) * v, py = fy + (hy - fy) * v;
          const rot = (1 - v) * pc.spin * Math.max(0, t - t0) * 0.6;
          // flying shapes are drawn at mark scale; offset in logo units
          const grow = 1 + 0.5 * (1 - v); // shapes fly a little larger, shrink into place
          pc.g.setAttribute('transform', `translate(${(px - hx) / sc} ${(py - hy) / sc}) rotate(${rot.toFixed(2)} ${pc.cx} ${pc.cy}) translate(${pc.cx} ${pc.cy}) scale(${grow}) translate(${-pc.cx} ${-pc.cy})`);
          pc.g.style.opacity = vis;
        });
      },
    };
  },
});
