// Pill highlight captions: sentence-case pages, one rounded pill glides to the spoken word (measured word boxes).
// Pure function of t via render(); reads studio.words, falls back to the Text param timed by word length.
studio.clip({
  duration: 7,
  async setup(root, p, { duration, width, height }) {
    const D = duration, W = width, H = height;
    const u = Math.min(W, H) / 1080;
    const E = studio.ease;
    const portrait = H > W;

    // ---- words: transcript or fallback ----
    let words = (studio.words || [])
      .filter((w) => w && w.text && w.end > 0 && w.start < D)
      .map((w) => ({ text: String(w.text).trim(), start: Math.max(0, w.start), end: Math.min(D, w.end != null ? w.end : w.start + 0.3) }))
      .filter((w) => w.text);
    if (!words.length) {
      const toks = String(p.text || '').split(/\s+/).filter(Boolean);
      const a = Math.min(0.3, D * 0.06), b = D - Math.min(0.5, D * 0.1);
      const wt = toks.map((s) => s.length + 3 + (/[.!?…]$/.test(s) ? 5 : /[,;:—]$/.test(s) ? 3 : 0));
      const tot = wt.reduce((x, y) => x + y, 0) || 1;
      let t = a;
      words = toks.map((s, i) => { const d = ((b - a) * wt[i]) / tot; const w = { text: s, start: t, end: t + d * 0.9 }; t += d; return w; });
    }
    words.sort((x, y) => x.start - y.start);

    // ---- pages: split into sentences (or pauses), then balance each sentence into pages,
    //      preferring breaks after commas / colons / dashes ----
    const sentences = [];
    let sen = null;
    words.forEach((w, i) => {
      const prev = words[i - 1];
      if (!sen || (prev && w.start - prev.end > 0.7) || (prev && /[.!?…]$/.test(prev.text))) { sen = []; sentences.push(sen); }
      sen.push(w);
    });
    const pages = [];
    const len = (a) => a.reduce((n, x) => n + x.text.length + 1, 0) - 1;
    for (const ws of sentences) {
      let rest = ws.slice();
      while (rest.length) {
        const total = len(rest);
        const n = Math.ceil(total / p.maxChars);
        if (n <= 1) { pages.push({ words: rest }); break; }
        const target = total / n;
        let best = 1, bestScore = Infinity, acc = -1;
        for (let j = 0; j < rest.length - 1; j++) {
          acc += rest[j].text.length + 1;
          if (acc > p.maxChars * 1.1) break;
          if (acc < target * 0.55) continue;
          const score = Math.abs(acc - target) - (/[,;:—–]$/.test(rest[j].text) ? target * 0.4 : 0);
          if (score < bestScore) { bestScore = score; best = j + 1; }
        }
        pages.push({ words: rest.slice(0, best) });
        rest = rest.slice(best);
      }
    }
    pages.forEach((pg, i) => {
      const next = pages[i + 1];
      const last = pg.words[pg.words.length - 1];
      pg.from = Math.max(0, pg.words[0].start - 0.16);
      pg.to = next ? Math.min(Math.max(0, next.words[0].start - 0.16), last.end + 0.8) : Math.min(D - 0.02, last.end + 0.9);
      if (pg.to <= pg.from + 0.1) pg.to = pg.from + 0.1;
    });

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = 'ph';
    const weight = p.font === 'Unbounded' ? 600 : p.font === 'Manrope' ? 700 : 600;
    const fs = p.size * u;
    el.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};color:${p.textColor};`;
    root.appendChild(el);
    try { await document.fonts.load(`${weight} ${fs}px '${p.font}'`, words.map((w) => w.text).join(' ')); } catch (e) {}
    const maxW = portrait ? W * 0.84 : Math.min(W * 0.72, 1400 * u);
    const anchorY = { bottom: portrait ? 0.7 : 0.86, center: 0.5, top: portrait ? 0.22 : 0.14 }[p.position] || 0.86;
    for (const pg of pages) {
      const d = document.createElement('div');
      d.className = 'page' + (p.plate ? ' plate' : '');
      d.style.fontSize = fs + 'px';
      d.style.maxWidth = maxW + 'px';
      d.style.width = 'max-content';
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.style.background = p.pillColor;
      pill.style.borderRadius = p.radius + 'em';
      d.appendChild(pill);
      // short words (prepositions, conjunctions) stay on the line of the following word
      let glue = null;
      pg.spans = pg.words.map((w, i) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.text;
        const short = w.text.replace(/[^\p{L}\p{N}]/gu, '').length <= 2 && !/[.,!?…;:]$/.test(w.text) && i < pg.words.length - 1;
        if (glue) { glue.appendChild(document.createTextNode(' ')); glue.appendChild(s); if (!short) glue = null; }
        else if (short) { glue = document.createElement('span'); glue.className = 'g'; glue.appendChild(s); d.appendChild(glue); }
        else d.appendChild(s);
        if (i < pg.words.length - 1 && !glue) d.appendChild(document.createTextNode(' '));
        return s;
      });
      el.appendChild(d);
      // shrink if the page needs more lines than allowed
      const lineH = () => pg.spans[0].offsetHeight;
      let f = fs;
      for (let n = 0; n < 12; n++) {
        const tops = new Set(pg.spans.map((s) => s.offsetTop));
        if (tops.size <= p.maxLines) break;
        f *= 0.92; d.style.fontSize = f + 'px';
      }
      void lineH;
      pg.fs = f;
      // shrink-wrap the box to the widest balanced line (keeps the plate and centring tight)
      const l = Math.min(...pg.spans.map((s) => s.offsetLeft)), r = Math.max(...pg.spans.map((s) => s.offsetLeft + s.offsetWidth));
      d.style.width = Math.ceil(r - l + 2) + 'px';
      const h = d.offsetHeight, w = d.offsetWidth;
      d.style.marginLeft = -w / 2 + 'px';
      // anchor: bottom/top keep the edge fixed, center keeps the middle
      const top = p.position === 'bottom' ? anchorY * H - h : p.position === 'top' ? anchorY * H : anchorY * H - h / 2;
      d.style.top = top + 'px';
      pg.rects = pg.spans.map((s) => ({ x: s.offsetLeft, y: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight }));
      pg.el = d; pg.pill = pill;
    }

    return {
      render(t) {
        for (const pg of pages) {
          const on = t >= pg.from && t < pg.to;
          pg.el.style.visibility = on ? 'visible' : 'hidden';
          if (!on) continue;
          // page enter (rise 12px + fade + blur) and exit (quick lift + fade)
          const ki = E.outCubic(studio.progress(t, pg.from, 0.2));
          const ko = E.inCubic(studio.progress(t, pg.to - 0.12, 0.12));
          pg.el.style.opacity = ki * (1 - ko);
          pg.el.style.transform = `translateY(${(1 - ki) * 12 * u - ko * 8 * u}px)`;
          pg.el.style.filter = p.blurIn && ki < 1 ? `blur(${(1 - ki) * 4 * u}px)` : 'none';

          // active word = last word that has started
          let k = -1;
          pg.words.forEach((w, i) => { if (t >= w.start) k = i; });
          pg.spans.forEach((s, i) => {
            const isOn = i === k;
            s.classList.toggle('on', isOn);
            s.style.opacity = isOn ? 1 : p.inactiveOpacity;
            s.style.color = isOn ? p.pillTextColor : p.textColor;
          });
          if (k < 0) { pg.pill.style.opacity = 0; continue; }
          const r1 = pg.rects[k];
          const r0 = k > 0 ? pg.rects[k - 1] : r1;
          const sameLine = Math.abs(r0.y - r1.y) < 2;
          const m = E.outCubic(studio.progress(t, pg.words[k].start, 0.14));
          const pad = pg.fs * 0.17;
          let x = r1.x, y = r1.y, w = r1.w, sc = 1;
          if (k > 0 && sameLine) { x = r0.x + (r1.x - r0.x) * m; w = r0.w + (r1.w - r0.w) * m; }
          else sc = 0.82 + 0.18 * E.outBack(studio.progress(t, pg.words[k].start, 0.18));
          x -= pad; w += pad * 2;
          pg.pill.style.opacity = k > 0 && sameLine ? 1 : Math.min(1, studio.progress(t, pg.words[k].start, 0.06));
          pg.pill.style.width = w + 'px';
          pg.pill.style.height = r1.h + 'px';
          pg.pill.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
        }
      },
    };
  },
});
