// Vox-style country highlight: camera push to a country, border draw-on, fill wipe, pin drop + tag.
// Map = bundled Natural Earth 1:50m outlines (assets/world.js), equirectangular. Camera is a pure function of t.
studio.clip({
  duration: 7,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const { k: K, countries } = window.STUDIO_WORLD;
    const U = Math.min(W, H) / 1080;
    const NS = 'http://www.w3.org/2000/svg';
    const { clamp, ease } = studio;
    const prog = (t, a, d) => clamp((t - a) / Math.max(1e-4, d));
    const inOut = ease.inOutCubic;
    const outExpo = ease.outExpo;
    const outBounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };

    const STY = {
      paper: { sea: '#c3cfc8', land: '#ebe2cd', border: '#b5a88c', grat: 'rgba(70,60,40,0.10)', dim: 'rgba(60,45,20,0.10)', line: '#2b2620', plate: '#1d1a16', plateText: '#f7f1e3', sub: 'rgba(247,241,227,0.7)', paper: 0.5 },
      dark: { sea: '#090d12', land: '#28323e', border: '#3b4857', grat: 'rgba(160,190,220,0.06)', dim: 'rgba(0,0,0,0.25)', line: '#e9eef3', plate: '#f4f1ea', plateText: '#121417', sub: 'rgba(18,20,23,0.6)', paper: 0.12 },
      flat: { sea: '#a7c6d6', land: '#f4f0e7', border: '#cbc2b0', grat: 'rgba(40,70,90,0.08)', dim: 'rgba(20,40,60,0.08)', line: '#1d2a33', plate: '#14202a', plateText: '#ffffff', sub: 'rgba(255,255,255,0.65)', paper: 0.25 },
    }[p.mapStyle] || null;
    const S = STY || { sea: '#c3cfc8' };

    const find = (q) => {
      q = String(q || '').trim(); if (!q) return null;
      const u = q.toUpperCase();
      return countries.find((c) => c.id === u) || countries.find((c) => c.a2 === u)
        || countries.find((c) => c.n.toUpperCase() === u || String(c.ru || '').toUpperCase() === u)
        || countries.find((c) => c.n.toUpperCase().startsWith(u) || String(c.ru || '').toUpperCase().startsWith(u));
    };
    const c1 = find(p.country) || find('KAZ');
    let c2 = find(p.country2);
    if (c2 && c2.id === c1.id) c2 = null;
    const autoName = (c) => (p.lang === 'en' ? c.n : c.ru || c.n);
    const name1 = (p.countryLabel || autoName(c1)).trim();
    const name2 = c2 ? (p.country2Label || autoName(c2)).trim() : '';

    const X = (lon) => (lon + 180) * K, Y = (lat) => (90 - lat) * K;
    const box = (c) => ({ x0: X(c.bb[0]), x1: X(c.bb[2]), y0: Y(c.bb[3]), y1: Y(c.bb[1]) });
    const b1 = box(c1), b2 = c2 ? box(c2) : null;
    let pin = null;
    const ll = String(p.pinLonLat || '').split(/[,;\s]+/).filter(Boolean).map(Number);
    if (ll.length >= 2 && ll.every(Number.isFinite)) pin = { x: X(ll[0]), y: Y(ll[1]) };
    else if (p.pinLabel) pin = { x: X(c1.lx), y: Y(c1.ly) };

    // ---------- camera keyframes ----------
    const LAT_T = Y(84), LAT_B = Y(-58);
    const s0 = Math.max(W / (360 * K), H / (LAT_B - LAT_T));
    const clampCam = (c) => {
      const hw = W / 2 / c.s, hh = H / 2 / c.s;
      return { s: c.s, x: clamp(c.x, hw, 360 * K - hw), y: clamp(c.y, LAT_T + hh, LAT_B - hh) };
    };
    const frame = (b) => {
      const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
      const s = clamp(Math.min((W * p.framing) / bw, (H * p.framing) / bh), s0 * 1.15, s0 * 45);
      return { s, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    };
    const camA = clampCam({ s: s0, x: (b1.x0 + b1.x1) / 2, y: Math.min((b1.y0 + b1.y1) / 2, Y(10)) });
    const camB = frame(b1);
    const camC = b2 ? frame({ x0: Math.min(b1.x0, b2.x0), x1: Math.max(b1.x1, b2.x1), y0: Math.min(b1.y0, b2.y0), y1: Math.max(b1.y1, b2.y1) }) : camB;
    const lerpCam = (a, b, e) => {
      const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e);
      // keep the zoom anchored: centre follows the scale change, not the raw time
      const w = Math.abs(b.s - a.s) < 1e-6 ? e : (1 / a.s - 1 / s) / (1 / a.s - 1 / b.s);
      return { s, x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
    };

    // ---------- schedule (compressed for short clips) ----------
    const f = clamp(D / 7, 0.4, 1);
    const tPush = 0.2 * f, push = Math.min(p.pushDuration * f, D * 0.42);
    const tDraw = tPush + push * 0.6, dDraw = 1.0 * f;
    const tFill = tDraw + 0.4 * f, dFill = 0.75 * f;
    const tPin = tPush + push - 0.05 * f, dPin = 0.55 * f;
    const tName = tPush + push * 0.9;
    const tOut = p.exitAtEnd ? D - 0.45 * Math.max(0.6, f) : D + 1;
    let t2 = Math.max(tPin + dPin + 1.0 * f, D * 0.48);
    const d2 = 1.6 * f;
    const has2 = !!c2 && t2 + d2 + 0.8 * f < tOut;
    if (!has2) t2 = D + 1;
    const tSettled = has2 ? t2 + d2 : tPush + push;
    function cam(t) {
      let c;
      if (t < tPush) c = camA;
      else if (t < tPush + push) c = lerpCam(camA, camB, inOut(prog(t, tPush, push)));
      else if (!has2 || t < t2) c = camB;
      else c = lerpCam(camB, camC, inOut(prog(t, t2, d2)));
      // secondary motion: gentle push during holds
      const pre = 1 + 0.02 * prog(t, 0, Math.max(0.05, tPush));
      const hold = 1 + 0.035 * ease.inOutQuad(prog(t, tSettled, Math.max(0.5, D - tSettled)));
      return { s: c.s * (t < tPush ? pre : 1.02 * hold), x: c.x, y: c.y };
    }
    const toScreen = (c, x, y) => [(x - c.x) * c.s + W / 2, (y - c.y) * c.s + H / 2];

    // ---------- DOM ----------
    const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
    const wrap = document.createElement('div');
    wrap.className = 'mph';
    root.appendChild(wrap);
    const svg = el('svg', { class: 'map', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, wrap);
    const defs = el('defs', {}, svg);
    el('rect', { width: W, height: H, fill: S.sea }, svg);
    const g = el('g', {}, svg);
    let grat = '';
    for (let lon = -180; lon <= 180; lon += 15) grat += `M${X(lon)} 0V${180 * K}`;
    for (let lat = -75; lat <= 75; lat += 15) grat += `M0 ${Y(lat)}H${360 * K}`;
    const gratP = el('path', { d: grat, fill: 'none', stroke: S.grat }, g);
    const land = el('g', { fill: S.land, stroke: S.border, 'stroke-linejoin': 'round' }, g);
    for (const c of countries) el('path', { d: c.d }, land);
    const dim = el('rect', { x: -10, y: -10, width: 360 * K + 20, height: 180 * K + 20, fill: S.dim, opacity: 0 }, g);

    function highlight(c, color, id) {
      const clip = el('clipPath', { id }, defs);
      const poly = el('polygon', { points: '0,0 0,0 0,0' }, clip);
      const fill = el('path', { d: c.d, fill: color, 'clip-path': `url(#${id})` }, g);
      const lines = c.d.split(/(?=M)/).map((d) => {
        const pth = el('path', { d, fill: 'none', stroke: color, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
        const L = pth.getTotalLength();
        pth.style.strokeDasharray = `${L} ${L + 1}`;
        return { pth, L };
      });
      const shade = el('path', { d: c.d, fill: 'none', stroke: 'rgba(0,0,0,0.28)', 'stroke-linejoin': 'round' }, g);
      return { poly, fill, lines, shade, b: box(c) };
    }
    const h1 = highlight(c1, p.accent, 'mphw1');
    const h2 = has2 ? highlight(c2, p.accent2, 'mphw2') : null;

    // paper fibre (static) + grain (seeded per 1/12 s) + vignette
    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.innerHTML = `<svg width="${W}" height="${H}"><filter id="mphpaper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.6" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 -1.1 1.05"/></filter><rect width="100%" height="100%" filter="url(#mphpaper)"/></svg>`;
    paper.style.opacity = S.paper;
    wrap.appendChild(paper);
    const grainCv = document.createElement('canvas');
    grainCv.className = 'grain';
    grainCv.width = Math.ceil(W / 2); grainCv.height = Math.ceil(H / 2);
    grainCv.style.opacity = clamp(p.grain * 3.2, 0, 1);
    wrap.appendChild(grainCv);
    const gg = grainCv.getContext('2d');
    const rnd = studio.random(91);
    const tiles = Array.from({ length: 6 }, () => {
      const c = document.createElement('canvas'); c.width = c.height = 192;
      const x = c.getContext('2d'), im = x.createImageData(192, 192);
      for (let i = 0; i < im.data.length; i += 4) { const v = (rnd() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); return c;
    });
    if (p.vignette) { const v = document.createElement('div'); v.className = 'vig'; wrap.appendChild(v); }

    // screen-space overlay: names, pin, tag
    const ov = document.createElement('div');
    ov.className = 'ov';
    ov.style.setProperty('--u', U);
    wrap.appendChild(ov);
    function nameLabel(text) {
      const n = document.createElement('div');
      n.className = 'cname';
      [...text].forEach((ch) => { const m = document.createElement('span'); m.className = 'ch'; const i = document.createElement('i'); i.textContent = ch === ' ' ? ' ' : ch; m.appendChild(i); n.appendChild(m); });
      ov.appendChild(n);
      return n;
    }
    // fit name to the country's on-screen width at its final framing
    function fitName(n, b, camF) {
      n.style.fontSize = '100px';
      const w = n.getBoundingClientRect().width || 1;
      const target = (b.x1 - b.x0) * camF.s * 0.62;
      const fs = clamp((100 * target) / w, 30 * U, 92 * U);
      n.style.fontSize = fs + 'px';
      return fs;
    }
    const n1 = name1 ? nameLabel(name1) : null;
    const camEnd1 = { ...camB, s: camB.s * 1.02 };
    if (n1) fitName(n1, b1, has2 ? { s: camC.s * 1.02 } : camEnd1);
    const n2 = name2 && has2 ? nameLabel(name2) : null;
    if (n2) fitName(n2, b2, { s: camC.s * 1.02 });

    let pinEl = null, tagEl = null, rings = [];
    if (pin) {
      pinEl = document.createElement('div');
      pinEl.className = 'pin';
      pinEl.innerHTML = `<div class="ring"></div><div class="ring"></div><div class="shadow"></div><svg class="marker" viewBox="0 0 40 52"><path d="M20 51C20 51 3 31.5 3 19.5 3 9.6 10.6 2 20 2s17 7.6 17 17.5C37 31.5 20 51 20 51Z" fill="${S.plate}" stroke="${S.plateText}" stroke-width="2.4"/><circle cx="20" cy="19" r="6.5" fill="${p.accent}"/></svg>`;
      ov.appendChild(pinEl);
      rings = [...pinEl.querySelectorAll('.ring')];
      if (p.pinLabel) {
        tagEl = document.createElement('div');
        tagEl.className = 'tag';
        tagEl.innerHTML = '<div class="plate"><span class="dot"></span><span class="txt"></span></div>';
        tagEl.querySelector('.txt').textContent = p.pinLabel;
        tagEl.style.setProperty('--plate', S.plate); tagEl.style.setProperty('--pt', S.plateText); tagEl.style.setProperty('--acc', p.accent);
        ov.appendChild(tagEl);
      }
    }
    ov.style.setProperty('--line', S.line);

    // ---------- GSAP: label / tag reveals (positions are set per frame in render) ----------
    const chars = (n) => [...n.querySelectorAll('.ch i')];
    if (n1) {
      tl.fromTo(chars(n1), { yPercent: 115 }, { yPercent: 0, duration: 0.7 * Math.max(0.6, f), ease: 'expo.out', stagger: 0.035 * f }, tName);
      if (tOut < D) tl.to(chars(n1), { yPercent: -115, duration: 0.3, ease: 'power2.in', stagger: 0.015 }, tOut - 0.05);
    }
    if (n2) {
      tl.fromTo(chars(n2), { yPercent: 115 }, { yPercent: 0, duration: 0.7 * f, ease: 'expo.out', stagger: 0.035 * f }, t2 + d2 * 0.75);
      if (tOut < D) tl.to(chars(n2), { yPercent: -115, duration: 0.3, ease: 'power2.in', stagger: 0.015 }, tOut - 0.05);
    }
    if (tagEl) {
      const plate = tagEl.querySelector('.plate');
      tl.fromTo(plate, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.55 * Math.max(0.6, f), ease: 'expo.out' }, tPin + dPin * 0.55)
        .fromTo(tagEl.querySelector('.txt'), { x: -24 * U, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 * f, ease: 'power3.out' }, tPin + dPin * 0.7);
      if (tOut < D) tl.to(plate, { clipPath: 'inset(0 0 0 100%)', duration: 0.3, ease: 'expo.in' }, tOut - 0.1);
    }

    // ---------- per-frame ----------
    function drawHighlight(h, c, tDrawS, tFillS) {
      const sw = (2.6 * U) / c.s;
      const pd = prog(tDrawS.t, tDrawS.a, tDrawS.d);
      const e = ease.inOutQuad(pd);
      for (const { pth, L } of h.lines) { pth.style.strokeDashoffset = L * (1 - e); pth.setAttribute('stroke-width', sw); pth.style.opacity = pd > 0 ? 1 : 0; }
      h.shade.setAttribute('stroke-width', (1.2 * U) / c.s);
      const pf = outExpo(prog(tFillS.t, tFillS.a, tFillS.d));
      h.shade.style.opacity = pf * 0.8;
      const { x0, x1, y0, y1 } = h.b, slant = (y1 - y0) * 0.35, pad = (x1 - x0) * 0.15 + slant;
      const xe = x0 - pad + (x1 - x0 + pad * 2 + slant) * pf;
      h.poly.setAttribute('points', `${x0 - pad - slant},${y0 - 200} ${xe + slant},${y0 - 200} ${xe - slant},${y1 + 200} ${x0 - pad - slant},${y1 + 200}`);
      // outside the main bbox (islands etc.): the wide polygon also covers them once pf→1
      if (pf >= 1) h.poly.setAttribute('points', `-99999,-99999 99999,-99999 99999,99999 -99999,99999`);
    }

    return {
      render(t) {
        const c = cam(t);
        g.setAttribute('transform', `translate(${W / 2 - c.x * c.s} ${H / 2 - c.y * c.s}) scale(${c.s})`);
        land.setAttribute('stroke-width', (0.9 * U) / c.s);
        gratP.setAttribute('stroke-width', (1 * U) / c.s);
        dim.setAttribute('opacity', 0.9 * ease.inOutQuad(prog(t, tFill, dFill)));
        drawHighlight(h1, c, { t, a: tDraw, d: dDraw }, { t, a: tFill, d: dFill });
        if (h2) drawHighlight(h2, c, { t, a: t2 + d2 * 0.25, d: dDraw }, { t, a: t2 + d2 * 0.25 + 0.4 * f, d: dFill });

        // grain: new pattern 12×/s
        const fr = Math.floor(t * 12);
        const r = studio.random(1000 + fr);
        gg.clearRect(0, 0, grainCv.width, grainCv.height);
        gg.fillStyle = gg.createPattern(tiles[Math.floor(r() * tiles.length)], 'repeat');
        const ox = Math.floor(r() * 192), oy = Math.floor(r() * 192);
        gg.save(); gg.translate(-ox, -oy); gg.fillRect(0, 0, grainCv.width + 192, grainCv.height + 192); gg.restore();

        // names sit on the country (avoid the pin)
        const place = (n, cc, b) => {
          if (!n) return;
          let [x, y] = toScreen(c, X(cc.lx), Y(cc.ly));
          const hgt = n.offsetHeight;
          if (pin && cc === c1) {
            const [px, py] = toScreen(c, pin.x, pin.y);
            if (Math.abs(py - y) < hgt * 0.9 + 30 * U && Math.abs(px - x) < n.offsetWidth * 0.6) y = py + 34 * U + hgt * 0.5;
          }
          n.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        };
        place(n1, c1, b1);
        place(n2, c2, b2);

        if (pinEl) {
          const [px, py] = toScreen(c, pin.x, pin.y);
          const pd = prog(t, tPin, dPin);
          const drop = (1 - outBounce(pd)) * -90 * U;
          const out = ease.inCubic(prog(t, tOut, 0.3));
          pinEl.style.transform = `translate(${px}px, ${py}px)`;
          const mk = pinEl.querySelector('.marker');
          mk.style.transform = `translate(-50%, -100%) translateY(${drop}px) scale(${(pd > 0 ? 1 : 0) * (1 - out)})`;
          pinEl.querySelector('.shadow').style.opacity = pd > 0 ? (0.25 + 0.35 * outBounce(pd)) * (1 - out) : 0;
          // ripples: one on landing, then every 1.5 s
          const land0 = tPin + dPin * 0.36;
          rings.forEach((rg, i) => {
            const age = t - land0 - i * 0.75;
            const ph = age < 0 ? -1 : (age % 1.5) / 1.5;
            const vis = ph >= 0 && t < tOut + 0.2;
            rg.style.opacity = vis ? (1 - ph) * 0.9 : 0;
            rg.style.transform = `translate(-50%, -50%) scale(${0.2 + ph * 2.4})`;
          });
          if (tagEl) {
            const right = px < W * 0.66;
            tagEl.classList.toggle('left', !right);
            tagEl.style.transform = `translate(${px}px, ${py}px)`;
          }
        }
      },
    };
  },
});
