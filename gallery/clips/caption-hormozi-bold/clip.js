// Hormozi-style captions: 1–3 heavy words per page, black stroke, active word snaps to the highlight colour.
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
      const a = Math.min(0.15, D * 0.04), b = D - Math.min(0.45, D * 0.1);
      const wt = toks.map((s) => s.length + 3 + (/[.!?…]$/.test(s) ? 5 : /[,;:—]$/.test(s) ? 2 : 0));
      const tot = wt.reduce((x, y) => x + y, 0) || 1;
      let t = a;
      words = toks.map((s, i) => { const d = ((b - a) * wt[i]) / tot; const w = { text: s, start: t, end: t + d * 0.9 }; t += d; return w; });
    }
    words.sort((x, y) => x.start - y.start);

    // ---- pages (1..maxWords words) ----
    const pages = [];
    let cur = null;
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const chars = cur ? cur.words.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length : 0;
      const brk = !cur || cur.words.length >= p.maxWords || chars > p.maxChars ||
        (prev && w.start - prev.end > 0.5) || (prev && /[.!?…,;:]$/.test(prev.text));
      if (brk) { cur = { words: [] }; pages.push(cur); }
      cur.words.push(w);
    });
    pages.forEach((pg, i) => {
      const last = pg.words[pg.words.length - 1];
      const next = pages[i + 1];
      pg.from = pg.words[0].start;
      pg.to = next ? Math.min(next.words[0].start, last.end + 0.45) : Math.min(D - 0.03, last.end + 0.6);
      if (pg.to <= pg.from) pg.to = pg.from + 0.08;
      pg.final = !next;
    });

    // ---- emphasis ----
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}%$€₽]+/gu, '');
    const emph = new Set(String(p.emphasis || '').split(',').map(norm).filter(Boolean));
    const isEmph = (s) => emph.has(norm(s)) || (p.emphasizeNumbers && /\d/.test(s));

    // ---- DOM ----
    const pos = p.position === 'auto' ? (H > W ? 0.64 : 0.76) : { lower: H > W ? 0.7 : 0.8, middle: 0.5, upper: H > W ? 0.3 : 0.22 }[p.position] || 0.76;
    const el = document.createElement('div');
    el.className = 'hz' + (p.shadow ? ' shadow' : '');
    const weight = p.font === 'Manrope' ? 800 : 900;
    const fs = p.size * u;
    el.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};color:${p.textColor};letter-spacing:${p.font === 'Unbounded' ? '0' : '-0.01em'};${p.uppercase ? 'text-transform:uppercase;' : ''}`;
    root.appendChild(el);
    try { await document.fonts.load(`${weight} ${fs}px '${p.font}'`, words.map((w) => w.text).join(' ')); } catch (e) {}
    const rnd = studio.random(77);
    const maxW = W * (H > W ? 0.86 : 0.8);
    for (const pg of pages) {
      const d = document.createElement('div');
      d.className = 'page';
      d.style.top = pos * H + 'px';
      d.style.fontSize = fs + 'px';
      pg.spans = pg.words.map((w) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.text;
        w.emph = isEmph(w.text);
        d.appendChild(s);
        return s;
      });
      el.appendChild(d);
      // fit to the safe width: wrap to two lines if one line would shrink too much, then scale down
      const gap0 = fs * 0.13;
      const lineW = () => pg.spans.reduce((n, s) => n + s.offsetWidth + gap0 * 2, 0);
      let sw = lineW();
      if (sw > maxW && pg.spans.length > 1 && maxW / sw < 0.78) {
        d.classList.add('wrap');
        d.style.width = maxW + 'px';
        d.style.left = (W - maxW) / 2 + 'px';
        sw = Math.max(...pg.spans.map((s) => s.offsetWidth + gap0 * 2));
      }
      pg.fs = sw > maxW ? fs * (maxW / sw) : fs;
      d.style.fontSize = pg.fs + 'px';
      d.style.setProperty('--sw', (p.strokeWidth * 2 * u * (pg.fs / fs)) + 'px');
      d.style.marginTop = -d.offsetHeight / 2 + 'px';
      pg.tilt = p.tilt ? (rnd() * 2 - 1) * 2.2 : 0;
      pg.widths = pg.spans.map((s) => s.offsetWidth);
      pg.gap = pg.fs * 0.13;
      pg.el = d;
    }
    const backOut = (k, c) => 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);

    return {
      render(t) {
        for (const pg of pages) {
          const on = t >= pg.from && t < pg.to;
          pg.el.style.visibility = on ? 'visible' : 'hidden';
          if (!on) continue;
          // snap in: 0.8 → ~1.06 → 1 over 6 frames
          const k = studio.progress(t, pg.from, 0.2);
          let s = 0.8 + 0.2 * backOut(k, 3);
          let o = 1;
          if (pg.final) { const q = E.inCubic(studio.progress(t, pg.to - 0.14, 0.14)); s *= 1 - 0.15 * q; o = 1 - q; }
          pg.el.style.opacity = o;
          pg.el.style.transform = `scale(${s}) rotate(${pg.tilt}deg)`;
          pg.words.forEach((w, i) => {
            const nextStart = i < pg.words.length - 1 ? pg.words[i + 1].start : Infinity;
            const active = t >= w.start && t < nextStart;
            const sp = pg.spans[i];
            const peak = w.emph ? 0.18 : 0.12;
            let ws = 1;
            if (active) ws = 1 + peak * Math.min(1.25, backOut(studio.progress(t, w.start, 0.14), 2.2));
            else if (t >= nextStart) ws = 1 + peak * (1 - E.outCubic(studio.progress(t, nextStart, 0.1)));
            sp.style.transform = `scale(${ws})`;
            sp.style.margin = `0 ${pg.gap + ((ws - 1) * pg.widths[i]) / 2}px`; // neighbours make room for the pop
            sp.style.color = w.emph && t >= w.start ? p.altHighlightColor : active ? p.highlightColor : p.textColor;
          });
        }
      },
    };
  },
});
