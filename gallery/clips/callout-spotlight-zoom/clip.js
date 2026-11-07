// Spotlight focus: SVG scrim with a feathered, morphing cutout (proxy object tweened on ctx.tl,
// applied to the SVG in render), outline ring, connector line and a label card per target.
studio.clip({
  duration: 7,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const NS = 'http://www.w3.org/2000/svg';
    const S = Math.min(W, H) / 1080;
    const M = { x: W * 0.05, y: H * 0.07 }; // title-safe

    // ---- parse targets ----
    let targets = String(p.targets || '').split('\n').map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      const nums = (parts[0] || '').split(/[\s,;]+/).map(parseFloat).filter((v) => !isNaN(v));
      if (nums.length < 2) return null;
      const shape = parts.slice(1).some((s) => /^(circle|round)$/i.test(s)) ? 'circle' : parts.slice(1).some((s) => /^rounded$/i.test(s)) ? 'rounded' : p.shape;
      const text = parts.slice(1).filter((s) => !/^(circle|round|rounded)$/i.test(s));
      let x = (nums[0] / 100) * W, y = (nums[1] / 100) * H, w = ((nums[2] ?? 20) / 100) * W, h = ((nums[3] ?? 20) / 100) * H;
      if (shape === 'circle') { const d = Math.max(w, h); x -= (d - w) / 2; y -= (d - h) / 2; w = h = d; }
      return { x, y, w, h, shape, title: text[0] || '', body: text[1] || '' };
    }).filter(Boolean).slice(0, 8);
    if (!targets.length) targets = [{ x: W * 0.4, y: H * 0.4, w: W * 0.2, h: H * 0.2, shape: 'rounded', title: '', body: '' }];
    // keep at least ~1.5 s per stop: very short clips show only the first target(s)
    const fitN = Math.max(1, Math.floor((duration - 0.75) / 1.5));
    targets = targets.slice(0, fitN);
    const N = targets.length;
    const rad = (tg) => (tg.shape === 'circle' ? tg.w / 2 : Math.min(p.radius * S, tg.w / 2, tg.h / 2));

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = 'sp';
    const feather = Math.max(0, p.feather) * S;
    const big = { x: -feather * 3 - 40, y: -feather * 3 - 40, w: W + feather * 6 + 80, h: H + feather * 6 + 80, r: 0 };
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <defs>
          <filter id="spf" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(feather / 2).toFixed(2)}"/></filter>
          <mask id="spm" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
            <rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>
            <rect class="hole" fill="#000" ${feather > 0 ? 'filter="url(#spf)"' : ''}/>
          </mask>
        </defs>
        <rect class="scrim" x="0" y="0" width="${W}" height="${H}" fill="${p.scrimColor}" mask="url(#spm)"/>
        <rect class="glow" fill="none" stroke="${p.accent}" stroke-width="${10 * S}" opacity="0"/>
        <rect class="ring" fill="none" stroke="${p.accent}" stroke-width="${3 * S}" pathLength="1" stroke-linecap="round"/>
        <g class="links"></g>
      </svg>`;
    root.appendChild(el);
    const hole = el.querySelector('.hole'), scrim = el.querySelector('.scrim'), ring = el.querySelector('.ring'), glow = el.querySelector('.glow');
    if (!p.ring) { ring.style.display = 'none'; glow.style.display = 'none'; }
    const links = el.querySelector('.links');

    const cards = targets.map((tg, i) => {
      const c = document.createElement('div');
      c.className = 'card' + (p.cardTheme === 'light' ? ' light' : '');
      c.innerHTML = `${p.stepNumbers ? `<div class="step" style="background:${p.accent}"></div>` : ''}<div class="mask"><div class="t"></div></div><div class="mask"><div class="b"></div></div>`;
      if (p.stepNumbers) c.querySelector('.step').textContent = String(i + 1).padStart(2, '0');
      c.querySelector('.t').textContent = tg.title;
      c.querySelector('.b').textContent = tg.body;
      if (!tg.body) c.querySelector('.b').parentNode.style.display = 'none';
      if (!tg.title) c.querySelector('.t').parentNode.style.display = 'none';
      if (!tg.title && !tg.body && !p.stepNumbers) c.style.display = 'none';
      c.style.transform = `scale(${S})`;
      c.style.transformOrigin = '0 0';
      el.appendChild(c);
      const cw = c.offsetWidth * S, ch = c.offsetHeight * S;
      // side
      const pad = 10 * S, gap = 70 * S;
      const room = { right: W - M.x - (tg.x + tg.w + pad + gap), left: tg.x - pad - gap - M.x, below: H - M.y - (tg.y + tg.h + pad + gap), above: tg.y - pad - gap - M.y };
      let side = p.labelSide;
      if (side === 'auto') {
        side = room.right >= cw ? 'right' : room.left >= cw ? 'left' : room.below >= ch ? 'below' : room.above >= ch ? 'above' : Object.entries(room).sort((a, b) => b[1] - a[1])[0][0];
      }
      const cy0 = tg.y + tg.h / 2, cx0 = tg.x + tg.w / 2;
      let cx, cy;
      if (side === 'right') { cx = tg.x + tg.w + pad + gap; cy = cy0 - ch / 2; }
      else if (side === 'left') { cx = tg.x - pad - gap - cw; cy = cy0 - ch / 2; }
      else if (side === 'below') { cy = tg.y + tg.h + pad + gap; cx = cx0 - cw / 2; }
      else { cy = tg.y - pad - gap - ch; cx = cx0 - cw / 2; }
      cx = Math.min(W - M.x - cw, Math.max(M.x, cx));
      cy = Math.min(H - M.y - ch, Math.max(M.y, cy));
      c.style.left = cx + 'px'; c.style.top = cy + 'px';
      // connector from ring edge to card edge
      const r = rad(tg);
      let a, b;
      if (side === 'right' || side === 'left') {
        const yy = Math.min(tg.y + tg.h - r * 0.6 - 4, Math.max(tg.y + r * 0.6 + 4, Math.min(cy + ch - 30 * S, Math.max(cy + 30 * S, cy0))));
        const yc = Math.min(cy + ch - 30 * S, Math.max(cy + 30 * S, yy));
        a = { x: side === 'right' ? tg.x + tg.w + pad : tg.x - pad, y: yy };
        b = { x: side === 'right' ? cx : cx + cw, y: yc };
      } else {
        const xx = Math.min(tg.x + tg.w - r * 0.6 - 4, Math.max(tg.x + r * 0.6 + 4, Math.min(cx + cw - 30 * S, Math.max(cx + 30 * S, cx0))));
        const xc = Math.min(cx + cw - 30 * S, Math.max(cx + 30 * S, xx));
        a = { x: xx, y: side === 'below' ? tg.y + tg.h + pad : tg.y - pad };
        b = { x: xc, y: side === 'below' ? cy : cy + ch };
      }
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${p.accent}" stroke-width="${3 * S}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>
        <circle cx="${a.x}" cy="${a.y}" r="${7 * S}" fill="${p.accent}" stroke="#fff" stroke-width="${3 * S}"/>`;
      links.appendChild(g);
      const dir = { right: [1, 0], left: [-1, 0], below: [0, 1], above: [0, -1] }[side];
      return { el: c, link: g.querySelector('line'), dot: g.querySelector('circle'), dir };
    });

    // ---- schedule ----
    const tIn = 0.1, morph = 0.8, exitDur = 0.55;
    const outT = Math.max(tIn + morph + 0.6, duration - exitDur - 0.05);
    const avail = outT - tIn;
    const seg = p.holdPerTarget > 0 ? Math.min(p.holdPerTarget + morph, avail / N) : avail / N;
    const st = { x: big.x, y: big.y, w: big.w, h: big.h, r: big.r, dim: 0, ring: 0, glow: 0 };
    tl.to(st, { dim: 1, duration: 0.35, ease: 'power1.out' }, tIn);
    targets.forEach((tg, i) => {
      const s = tIn + i * seg;
      const md = Math.min(morph, seg * 0.42);
      tl.to(st, { x: tg.x, y: tg.y, w: tg.w, h: tg.h, r: rad(tg), duration: md, ease: i === 0 ? 'expo.inOut' : 'power3.inOut' }, s);
      if (i === 0) tl.fromTo(st, { ring: 0 }, { ring: 1, duration: 0.55, ease: 'power2.inOut' }, s + md * 0.7);
      const c = cards[i], cin = s + md * 0.72, cout = i < N - 1 ? tIn + (i + 1) * seg - 0.08 : outT;
      tl.fromTo(c.link, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: 0.35, ease: 'power2.out' }, cin)
        .fromTo(c.dot, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, cin - 0.05)
        .fromTo(c.el, { opacity: 0, x: c.dir[0] * 22 * S, y: c.dir[1] * 22 * S }, { opacity: 1, x: 0, y: 0, duration: 0.6, ease: 'expo.out' }, cin + 0.12)
        .fromTo(c.el.querySelectorAll('.step, .t, .b'), { yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.06 }, cin + 0.18)
        // out
        .to(c.el, { opacity: 0, x: c.dir[0] * 14 * S, y: c.dir[1] * 14 * S, duration: 0.25, ease: 'power2.in' }, cout - 0.25)
        .to(c.link, { attr: { 'stroke-dashoffset': -1 }, duration: 0.25, ease: 'power2.in' }, cout - 0.2)
        .to(c.dot, { scale: 0, duration: 0.2, ease: 'power2.in' }, cout - 0.15);
    });
    tl.to(st, { ring: 0, duration: 0.3, ease: 'power2.in' }, outT)
      .to(st, { x: big.x, y: big.y, w: big.w, h: big.h, r: 0, duration: exitDur, ease: 'power3.in' }, outT + 0.05)
      .to(st, { dim: 0, duration: 0.35, ease: 'power1.in' }, outT + exitDur - 0.3);

    const pad = 10 * S;
    return {
      render(t) {
        const e = feather * 0.75 + pad * 0.5; // feather falls off outside the ring, interior stays clean
        hole.setAttribute('x', st.x - e); hole.setAttribute('y', st.y - e);
        hole.setAttribute('width', Math.max(0, st.w + e * 2)); hole.setAttribute('height', Math.max(0, st.h + e * 2));
        hole.setAttribute('rx', Math.max(0, st.r + e)); hole.setAttribute('ry', Math.max(0, st.r + e));
        scrim.setAttribute('opacity', (st.dim * p.dimOpacity).toFixed(3));
        for (const r of [ring, glow]) {
          r.setAttribute('x', st.x - pad); r.setAttribute('y', st.y - pad);
          r.setAttribute('width', Math.max(0, st.w + pad * 2)); r.setAttribute('height', Math.max(0, st.h + pad * 2));
          r.setAttribute('rx', st.r + pad); r.setAttribute('ry', st.r + pad);
        }
        ring.setAttribute('stroke-dasharray', `${st.ring} 1`);
        ring.setAttribute('opacity', st.ring > 0.001 ? 1 : 0);
        // breathing glow during holds (secondary motion)
        const breathe = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.2);
        glow.setAttribute('opacity', (Math.min(1, st.ring * 1.2) * (0.12 + 0.16 * breathe)).toFixed(3));
      },
    };
  },
});
