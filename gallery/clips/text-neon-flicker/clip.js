// Neon sign: per-letter intensity is a pure function of t (frame-quantised, seeded hash), mapped to
// a white-hot core colour + layered text-shadow glow. Power-on flicker → steady breathing glow with
// a faulty letter → hard cut-off with a cooling afterglow.
studio.clip({
  duration: 5,
  async setup(root, p, { duration }) {
    const D = duration, FPS = studio.fps || 30;
    const seed = (p.seed | 0) || 1;
    const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 1274126177 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const rgb = (hex) => { const h = String(hex).replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
    const weight = p.font === 'Unbounded' ? 400 : p.font === 'Playfair Display' ? 400 : 500;
    const family = `'${p.font}', sans-serif`;

    const el = document.createElement('div');
    el.className = 'nf';
    el.innerHTML = '<div class="bloom"></div><div class="frame"></div><div class="l1"></div><div class="l2"></div>';
    root.appendChild(el);
    const bloom = el.querySelector('.bloom'), frame = el.querySelector('.frame');
    const l1 = el.querySelector('.l1'), l2 = el.querySelector('.l2');
    l1.style.cssText += `font-family:${family};font-weight:${weight};font-size:${p.size}px`;
    l2.style.cssText += `font-family:${family};font-weight:${weight};font-size:${Math.round(p.size * 0.32)}px`;
    if (!p.showBacking) frame.style.display = 'none';
    const letters = [];
    const add = (host, text, col, group) => [...String(text || '')].forEach((c) => {
      const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; host.appendChild(s);
      if (c.trim()) letters.push({ s, col: rgb(col), group });
    });
    add(l1, p.text, p.color, 0);
    if (p.subtitle) add(l2, p.subtitle, p.color2, 1); else l2.style.display = 'none';
    try { await document.fonts.load(`${weight} ${p.size}px ${family}`, (p.text || '') + (p.subtitle || '')); } catch (e) {}
    const maxW = studio.width - 220 - 220;
    if (l1.scrollWidth > maxW) { const k = maxW / l1.scrollWidth; l1.style.fontSize = p.size * k + 'px'; l2.style.fontSize = p.size * 0.32 * k + 'px'; }

    const n = letters.length;
    const P = Math.max(0.3, Math.min(p.powerOnDuration, D * 0.35));
    const t0 = 0.12;
    const fi = p.flickerIntensity;
    const faulty = p.faultyLetterIndex >= 0 && p.faultyLetterIndex < n ? p.faultyLetterIndex : -1;
    // per letter: onset inside the power-on window (sub line comes on a beat later)
    letters.forEach((L, i) => {
      const r = hash(i, 3);
      L.onset = t0 + (L.group ? P * 0.45 : 0) + r * P * 0.35;
      L.settle = L.onset + P * (0.35 + 0.3 * fi * hash(i, 4));
    });
    const offAt = D - Math.min(0.55, D * 0.14);
    const frameOn = t0 + P * 0.25;
    // faulty-letter dropouts during the hold (seeded windows)
    const drops = [];
    { const r = studio.random(seed * 7 + 1); let t = t0 + P + 0.6 + r() * 0.5; while (t < offAt - 0.3) { drops.push([t, t + (2 + Math.floor(r() * 5)) / FPS]); t += 0.7 + r() * 1.4; } }

    function intensity(i, L, t, f) {
      if (t >= offAt) return 0;
      if (t < L.onset) return 0;
      if (t < L.settle) {
        // flicker: frame-quantised on/off with the chance of "on" growing through the window,
        // with classic dead spots around 20 % and 55 % of the sequence
        const u = (t - L.onset) / (L.settle - L.onset);
        if ((u > 0.18 && u < 0.24) || (u > 0.53 && u < 0.58)) return 0.08 * (1 - fi);
        const on = hash(f, i, 21) < 0.25 + u * 0.9 - fi * 0.15;
        return on ? 0.75 + 0.35 * hash(f, i, 5) : 0.06;
      }
      let v = 1 + 0.05 * Math.sin(t * 2.6 + i * 0.35) - 0.025 * hash(f, 0, 9) * fi; // breathing + mains hum
      if (i === faulty) for (const [a, b] of drops) if (t >= a && t < b) v = hash(f, i, 33) < 0.5 ? 0.05 : 0.45;
      return v;
    }
    const white = [255, 255, 255];
    const G = p.glow;
    const c1 = rgb(p.color);

    return {
      render(t) {
        const f = Math.floor(t * FPS + 1e-6);
        // unlit tubes fade in at the start; everything fades away after the afterglow
        const pre = p.showOffTubes ? Math.min(1, t / 0.25) : 0;
        const endFade = Math.max(0, Math.min(1, (D - 0.04 - t) / 0.2));
        const cool = t >= offAt ? Math.max(0, 1 - (t - offAt) / 0.4) : 0; // afterglow 1 → 0
        let sum = 0;
        letters.forEach((L, i) => {
          const I = Math.max(0, Math.min(1.15, intensity(i, L, t, f)));
          sum += Math.min(1, I);
          const off = mix(L.col, [40, 40, 46], 0.72);
          const core = mix(L.col, white, 0.78);
          let colr, a;
          if (I > 0.02) { colr = mix(off, core, Math.min(1, I)); a = 1; }
          else if (cool > 0) { colr = mix(off, mix(L.col, [255, 190, 150], 0.5), cool * 0.8); a = Math.max(pre * 0.55, cool); }
          else { colr = off; a = (L.onset > t || t >= offAt ? pre * 0.55 : 0.55) * endFade; }
          L.s.style.color = css(colr, a);
          const k = Math.min(1, I) * G;
          L.s.style.textShadow = I > 0.02
            ? `0 0 2px ${css(white, 0.8 * k)}, 0 0 7px ${css(L.col, 0.95 * k)}, 0 0 16px ${css(L.col, 0.9 * k)}, 0 0 34px ${css(L.col, 0.75 * k)}, 0 0 70px ${css(L.col, 0.5 * k)}, 0 0 120px ${css(L.col, 0.3 * k)}`
            : cool > 0 ? `0 0 10px ${css(L.col, 0.25 * cool)}` : 'none';
        });
        const avg = n ? sum / n : 0;
        bloom.style.background = `radial-gradient(ellipse 45% 42% at 50% 50%, ${css(c1, 0.2 * avg * G)}, ${css(c1, 0.07 * avg * G)} 55%, transparent 75%)`;
        // tube frame: lights up just before the letters, own flicker, same cut-off
        if (p.showBacking) {
          let Fi = 0;
          if (t >= frameOn && t < offAt) {
            const u = (t - frameOn) / (P * 0.5);
            Fi = u < 1 ? (hash(f, 999, 2) < 0.3 + u ? 0.9 : 0.05) : 0.92 + 0.04 * Math.sin(t * 2.1);
          }
          const c2 = rgb(p.color2);
          const offC = mix(c2, [40, 40, 46], 0.72);
          frame.style.borderColor = Fi > 0.1 ? css(mix(c2, white, 0.55), 1) : css(offC, (cool > 0 ? Math.max(0.55 * pre, cool * 0.7) : 0.55 * pre) * endFade);
          const k = Fi * G;
          frame.style.boxShadow = Fi > 0.1 ? `0 0 6px ${css(c2, 0.9 * k)}, 0 0 22px ${css(c2, 0.6 * k)}, 0 0 60px ${css(c2, 0.3 * k)}, inset 0 0 6px ${css(c2, 0.9 * k)}, inset 0 0 26px ${css(c2, 0.45 * k)}` : 'none';
        }
      },
    };
  },
});
