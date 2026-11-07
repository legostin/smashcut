// Retro 3D extrude: each letter is a face with an outline stroke plus a stack of offset text-shadows
// (the extrusion), rebuilt every frame from per-letter state tweened on the timeline (drop, depth,
// scale) and the sway angle computed from t.
studio.clip({
  duration: 4,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const PAL = {
      retro: ['#fff1d6', '#e8432d', '#1d2b4f'],
      candy: ['#ffffff', '#ff5fa2', '#5b2bd9'],
      mint: ['#f4fff2', '#17c3a0', '#0b3b3d'],
      sunset: ['#fff4c7', '#ff8a1f', '#3a1450'],
    };
    const [face, extr, outl] = PAL[p.palette] || [p.faceColor, p.extrudeColor, p.outlineColor];
    const rgb = (hex) => { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const mix = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
    const E = rgb(extr), O = rgb(outl);
    const weight = p.font === 'Playfair Display' ? 900 : 900;
    const family = `'${p.font}', sans-serif`;

    const el = document.createElement('div');
    el.className = 'ex';
    const blk = document.createElement('div');
    blk.className = 'blk';
    blk.style.cssText = `font-family:${family};font-weight:${weight};font-size:${p.size}px;letter-spacing:${p.font === 'Unbounded' ? '-0.02em' : '-0.03em'};color:${face}`;
    el.appendChild(blk);
    root.appendChild(el);
    const rows = String(p.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const letters = [];
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'row';
      [...r].forEach((c) => {
        const s = document.createElement('span');
        s.className = 'ch';
        s.textContent = c;
        row.appendChild(s);
        if (c.trim()) letters.push({ s, y: -260, o: 0, d: 0, sc: 1, r: 0 });
      });
      blk.appendChild(row);
    });
    try { await document.fonts.load(`${weight} ${p.size}px ${family}`, rows.join('')); } catch (e) {}
    // fit (leave room for the extrusion + shadow)
    let fs = p.size;
    const maxW = studio.width - 360, maxH = studio.height - 300;
    const k0 = Math.min(1, maxW / blk.scrollWidth, maxH / blk.scrollHeight);
    if (k0 < 1) { fs = Math.floor(p.size * k0); blk.style.fontSize = fs + 'px'; }
    const stroke = Math.max(3, fs * 0.034);
    letters.forEach((L) => { L.s.style.webkitTextStroke = `${stroke * 2}px ${outl}`; });
    const step = Math.max(1, fs / 120);
    const N = Math.max(1, Math.round(p.depth));
    el.style.transform = `translate(-50%, -50%) rotate(${p.tilt}deg)`;
    el.style.marginTop = -(N * step) / 2 + 'px';

    // ---- timeline: per-letter state objects ----
    const k = Math.min(1, D / 3.2);
    const st = Math.min(0.045, 0.5 / letters.length) * Math.max(0.6, k);
    const drop = 0.85 * Math.max(0.65, k);
    letters.forEach((L, i) => {
      const at = 0.04 + i * st;
      tl.fromTo(L, { y: -240, r: -10 + (i % 3) * 7 }, { y: 0, r: 0, duration: drop, ease: 'bounce.out' }, at)
        .fromTo(L, { o: 0 }, { o: 1, duration: 0.12, ease: 'none' }, at)
        .fromTo(L, { d: 0 }, { d: 1, duration: 0.42 * Math.max(0.6, k), ease: 'back.out(2)' }, at + drop * 0.45);
    });
    const exitDur = Math.min(0.55, D * 0.16);
    const exSt = Math.min(0.025, exitDur * 0.5 / letters.length);
    const out = D - exitDur - exSt * letters.length - 0.04;
    letters.forEach((L, i) => {
      const at = out + i * exSt;
      tl.to(L, { d: 0, duration: exitDur * 0.45, ease: 'power2.in' }, at)
        .to(L, { sc: 0, duration: exitDur * 0.5, ease: 'back.in(2.2)' }, at + exitDur * 0.4);
    });
    const breathe = { s: 1 };
    tl.fromTo(breathe, { s: 1 }, { s: 1.03, duration: D, ease: 'sine.inOut' }, 0);

    const base = (p.angle * Math.PI) / 180;
    return {
      render(t) {
        const sway = p.sway ? (10 * Math.PI / 180) * Math.sin(t * 1.9) * Math.min(1, t / 1.2) : 0;
        const a = base + sway;
        const ux = Math.cos(a) * step, uy = Math.sin(a) * step;
        blk.style.transform = `scale(${breathe.s})`;
        letters.forEach((L) => {
          const n = L.d * N;
          const parts = [];
          const whole = Math.floor(n);
          for (let j = 1; j <= whole; j++) parts.push(`${(ux * j).toFixed(2)}px ${(uy * j).toFixed(2)}px 0 ${mix(E, [0, 0, 0], 0.08 + 0.3 * (j / N))}`);
          if (n > 0.05) {
            // dark back edge so the extrusion has an outline too
            const ex = n + stroke / step;
            parts.push(`${(ux * ex).toFixed(2)}px ${(uy * ex).toFixed(2)}px 0 ${outl}`);
            if (p.longShadow) parts.push(`${(ux * (n + 6)).toFixed(1)}px ${(uy * (n + 6) + 10).toFixed(1)}px ${24 + n}px rgba(0,0,0,${(0.35 * L.d).toFixed(2)})`);
          }
          L.s.style.textShadow = parts.length ? parts.join(',') : 'none';
          // as the letter pops out it moves up-left by the depth so it rises off the page
          const lift = -n * 0.5;
          L.s.style.transform = `translate(${(ux * lift).toFixed(2)}px, ${(L.y + uy * lift).toFixed(2)}px) rotate(${L.r}deg) scale(${L.sc})`;
          L.s.style.opacity = L.o;
        });
      },
    };
  },
});
