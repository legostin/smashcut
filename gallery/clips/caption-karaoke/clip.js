// Karaoke captions driven by studio.words (clip-local seconds); pure function of t via render().
studio.clip({
  duration: 8,
  async setup(root, p, { duration }) {
    const D = duration;
    // ---- words: transcript or fallback ----
    let words = (studio.words || [])
      .filter((w) => w && w.text && w.end > 0 && w.start < D)
      .map((w) => ({ text: String(w.text).trim(), start: Math.max(0, w.start), end: Math.min(D, w.end != null ? w.end : w.start + 0.3) }))
      .filter((w) => w.text);
    if (!words.length) {
      const toks = String(p.text || '').split(/\s+/).filter(Boolean);
      const a = Math.min(0.2, D * 0.05), b = D - Math.min(0.5, D * 0.08);
      const weights = toks.map((s) => s.length + 3 + (/[.!?…]$/.test(s) ? 4 : /[,;:—]$/.test(s) ? 2 : 0));
      const total = weights.reduce((x, y) => x + y, 0) || 1;
      let t = a;
      words = toks.map((s, i) => { const d = ((b - a) * weights[i]) / total; const w = { text: s, start: t, end: t + d * 0.92 }; t += d; return w; });
    }
    words.sort((x, y) => x.start - y.start);

    // ---- phrases ----
    const chunks = [];
    let cur = null;
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const chars = cur ? cur.words.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length : 0;
      const brk = !cur || cur.words.length >= p.maxWords || chars > p.maxChars || (prev && w.start - prev.end > 0.7) || (prev && /[.!?…]$/.test(prev.text));
      if (brk) { cur = { words: [] }; chunks.push(cur); }
      cur.words.push(w);
    });
    chunks.forEach((c) => { c.start = c.words[0].start; c.end = c.words[c.words.length - 1].end; });
    chunks.forEach((c, i) => {
      const next = chunks[i + 1];
      c.showFrom = Math.max(0, c.start - 0.08);
      c.showTo = next ? Math.min(next.start - 0.08, c.end + 0.7) : Math.min(D - 0.05, c.end + 0.8);
      if (c.showTo <= c.showFrom) c.showTo = c.showFrom + 0.1;
    });

    // ---- DOM ----
    const el = document.createElement('div');
    const boxed = p.style === 'box';
    el.className = `kar ${p.position} ${p.shadow ? 'shadow' : ''} ${p.style === 'underline' ? 'uline' : ''}`;
    const weight = p.font === 'Unbounded' ? 800 : p.font === 'JetBrains Mono' ? 700 : 800;
    el.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.size}px;color:${p.textColor};${p.uppercase ? 'text-transform:uppercase;' : ''}`;
    root.appendChild(el);
    for (const c of chunks) {
      const cap = document.createElement('div');
      cap.className = 'cap';
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.style.background = p.highlight;
      cap.appendChild(pill);
      c.spans = c.words.map((w, i) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.text;
        cap.appendChild(s);
        if (i < c.words.length - 1) cap.appendChild(document.createTextNode(' '));
        return s;
      });
      c.el = cap; c.pill = pill;
      el.appendChild(cap);
    }
    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, words.map((w) => w.text).join(' ')); } catch (e) {}

    const E = studio.ease;
    const rect = (s) => ({ x: s.offsetLeft, y: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight });

    return {
      render(t) {
        for (const c of chunks) {
          const on = t >= c.showFrom && t < c.showTo;
          if (!on) { c.el.style.opacity = 0; continue; }
          // phrase pop-in / fade-out
          const pin = E.outBack(studio.progress(t, c.showFrom, 0.22));
          const pout = studio.progress(t, c.showTo - 0.14, 0.14);
          c.el.style.opacity = Math.min(1, studio.progress(t, c.showFrom, 0.1)) * (1 - pout);
          c.el.style.transform = `translateY(${(1 - pin) * 26 - pout * 10}px) scale(${0.94 + 0.06 * pin})`;

          // active word = last word that has started
          let k = -1;
          c.words.forEach((w, i) => { if (t >= w.start) k = i; });
          const slide = k >= 0 ? E.outCubic(studio.progress(t, c.words[k].start, 0.1)) : 0;
          const boxOn = (i) => boxed && ((i === k && (slide >= 0.5 || k === 0)) || (i === k - 1 && slide < 0.5));
          c.spans.forEach((s, i) => {
            const spoken = i <= k;
            const isCur = i === k;
            s.classList.toggle('on', isCur);
            s.classList.toggle('boxed', boxOn(i));
            s.style.opacity = spoken ? 1 : p.upcomingOpacity;
            let col = p.textColor;
            if (boxOn(i)) col = p.highlightText;
            else if (isCur && p.style !== 'box') col = p.highlight;
            s.style.color = col;
            const pop = isCur ? 1 - E.outCubic(studio.progress(t, c.words[i].start, 0.18)) : 0;
            s.style.transform = `scale(${1 + 0.08 * pop})`;
          });

          // highlight box slides between words
          if (k < 0 || p.style === 'color') { c.pill.style.opacity = 0; continue; }
          const r1 = rect(c.spans[k]);
          const r0 = k > 0 ? rect(c.spans[k - 1]) : r1;
          const m = slide;
          const lerp = (a, b) => a + (b - a) * m;
          let x = lerp(r0.x, r1.x), y = lerp(r0.y, r1.y), w = lerp(r0.w, r1.w), h = r1.h;
          const grow = k === 0 ? E.outBack(studio.progress(t, c.words[0].start, 0.16)) : 1;
          if (p.style === 'underline') { y = y + h * 0.86; h = Math.max(6, p.size * 0.1); }
          else { y += h * 0.04; h *= 0.94; }
          c.pill.style.opacity = 1;
          c.pill.style.width = w + 'px';
          c.pill.style.height = h + 'px';
          c.pill.style.transform = `translate(${x}px, ${y}px) scale(${grow})`;
        }
      },
    };
  },
});
