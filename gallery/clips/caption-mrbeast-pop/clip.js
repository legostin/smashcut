// Beast-style pop captions: one oversized word at a time, overshoot pop + tilt, stacked-shadow extrude, coloured keywords.
// Pure function of t via render(); reads studio.words, falls back to the Text param timed by word length.
studio.clip({
  duration: 6,
  async setup(root, p, { duration, width, height }) {
    const D = duration, W = width, H = height;
    const u = Math.min(W, H) / 1080;
    const E = studio.ease;

    // ---- words: transcript or fallback ----
    let words = (studio.words || [])
      .filter((w) => w && w.text && w.end > 0 && w.start < D)
      .map((w) => ({ text: String(w.text).trim(), start: Math.max(0, w.start), end: Math.min(D, w.end != null ? w.end : w.start + 0.3) }))
      .filter((w) => w.text);
    if (!words.length) {
      const toks = String(p.text || '').split(/\s+/).filter(Boolean);
      const a = Math.min(0.12, D * 0.04), b = D - Math.min(0.4, D * 0.1);
      const wt = toks.map((s) => s.length + 4 + (/[.!?…]$/.test(s) ? 5 : /[,;:—]$/.test(s) ? 2 : 0));
      const tot = wt.reduce((x, y) => x + y, 0) || 1;
      let t = a;
      words = toks.map((s, i) => { const d = ((b - a) * wt[i]) / tot; const w = { text: s, start: t, end: t + d * 0.9 }; t += d; return w; });
    }
    words.sort((x, y) => x.start - y.start);

    // ---- keywords (single words or multi-word phrases) ----
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}%$€₽]+/gu, '');
    const phrases = String(p.keywords || '').split(',').map((s) => s.trim().split(/\s+/).map(norm).filter(Boolean)).filter((a) => a.length);
    const keyIdx = new Array(words.length).fill(-1);
    let kc = 0;
    for (let i = 0; i < words.length; i++) {
      if (keyIdx[i] >= 0) continue;
      const ph = phrases.find((ph) => ph.every((x, j) => words[i + j] && norm(words[i + j].text) === x));
      if (ph) { ph.forEach((_, j) => (keyIdx[i + j] = kc)); kc++; continue; }
      if (p.autoKeywords && /\d/.test(words[i].text)) keyIdx[i] = kc++;
    }
    const colors = [p.keyColor1, p.keyColor2, p.keyColor3];

    // ---- timing per word ----
    words.forEach((w, i) => {
      const next = words[i + 1];
      w.from = w.start;
      w.to = next ? (next.start - w.end > 0.6 ? w.end + 0.3 : next.start) : Math.min(D - 0.02, w.end + 0.5);
      if (w.to <= w.from) w.to = w.from + 0.06;
      w.final = !next;
    });

    // ---- DOM ----
    const pos = p.position === 'auto' ? (H > W ? 0.6 : 0.62) : { center: 0.5, lower: H > W ? 0.7 : 0.78, upper: H > W ? 0.3 : 0.24 }[p.position] || 0.6;
    const el = document.createElement('div');
    el.className = 'bp';
    const weight = p.font === 'Manrope' ? 800 : 900;
    const fs = p.size * u;
    el.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};letter-spacing:${p.font === 'Unbounded' ? '-0.01em' : '-0.02em'};${p.uppercase ? 'text-transform:uppercase;' : ''}`;
    root.appendChild(el);
    try { await document.fonts.load(`${weight} ${fs}px '${p.font}'`, words.map((w) => w.text).join(' ')); } catch (e) {}
    const maxW = W * (H > W ? 0.84 : 0.78);
    const depth = p.shadowDepth * u;
    const ex = [];
    for (let i = 1; i <= Math.round(depth); i++) ex.push(`${(i * 0.55).toFixed(2)}px ${i}px 0 #000`);
    ex.push(`${(depth * 0.55 + 2 * u).toFixed(1)}px ${(depth + 10 * u).toFixed(1)}px ${(24 * u).toFixed(1)}px rgba(0,0,0,.45)`);
    const rnd = studio.random(p.seed || 7);
    words.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'word';
      d.textContent = w.text;
      d.style.fontSize = fs + 'px';
      d.style.color = keyIdx[i] >= 0 ? colors[keyIdx[i] % 3] : p.textColor;
      el.appendChild(d);
      const sw = d.offsetWidth;
      const k = sw > maxW ? maxW / sw : 1;
      d.style.fontSize = fs * k + 'px';
      d.style.setProperty('--sw', p.strokeWidth * 2 * u * k + 'px');
      d.style.setProperty('--ex', ex.join(','));
      d.style.top = pos * H - d.offsetHeight / 2 + 'px';
      d.style.marginLeft = -d.offsetWidth / 2 + 'px';
      w.el = d;
      w.key = keyIdx[i] >= 0;
      const side = rnd() < 0.5 ? -1 : 1;
      w.rot0 = side * p.rotationRange;
      w.rot1 = (rnd() * 2 - 1) * Math.min(3, p.rotationRange);
      w.ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    });

    return {
      render(t) {
        for (const w of words) {
          const on = t >= w.from && t < w.to;
          w.el.style.visibility = on ? 'visible' : 'hidden';
          if (!on) continue;
          const lt = t - w.from;
          // pop: 0 → popScale over ~3 frames, settle to 1 over ~3 more
          const pd = Math.max(0.05, Math.min(0.1, (w.to - w.from) * 0.3)); // short words pop faster
          const a = studio.progress(lt, 0, pd), b = studio.progress(lt, pd, pd * 1.2);
          let s = lt < pd ? 0.3 + (p.popScale - 0.3) * E.outQuad(a) : p.popScale + (1 - p.popScale) * E.inOutQuad(b);
          s *= 1 + 0.03 * E.outQuad(studio.progress(lt, 0.2, Math.max(0.3, w.to - w.from)));
          const rot = w.rot0 + (w.rot1 - w.rot0) * E.outCubic(studio.progress(lt, 0, 0.22));
          // keyword squash & stretch
          let sy = 1, sx = 1;
          if (w.key) { const q = E.outElastic(studio.progress(lt, pd, 0.45)); sy = 1.15 - 0.15 * q; sx = 0.92 + 0.08 * q; }
          // seeded smooth micro-shake while holding
          let x = 0, y = 0;
          if (p.shake && lt > 0.18) {
            const amp = 2 * u * Math.min(1, (lt - 0.18) / 0.2);
            x = amp * (Math.sin(t * 41 + w.ph[0]) * 0.6 + Math.sin(t * 67 + w.ph[1]) * 0.4);
            y = amp * (Math.sin(t * 53 + w.ph[2]) * 0.6 + Math.sin(t * 29 + w.ph[0]) * 0.4);
          }
          let o = 1;
          if (w.final) { const q = E.inCubic(studio.progress(t, w.to - 0.14, 0.14)); s *= 1 - 0.6 * q; o = 1 - q; }
          w.el.style.opacity = o;
          w.el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s * sx}, ${s * sy})`;
        }
      },
    };
  },
});
