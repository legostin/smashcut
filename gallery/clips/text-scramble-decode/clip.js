// Scramble / decode: own seeded implementation (stock ScrambleText is not frame-deterministic).
// Every char slot is a pure function of the frame index: glyph = charset[hash(frame>>1, i)],
// resolve time = start + rank(i)·spread + seeded jitter. Slots have fixed widths (= final glyph),
// so proportional fonts don't jitter while scrambling.
studio.clip({
  duration: 4,
  async setup(root, p, { tl, duration }) {
    const D = duration, FPS = studio.fps || 30;
    const seed = (p.seed | 0) || 1;
    const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 1274126177 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const glyphs = [...(String(p.charset || '') || '01<>/#')];
    const weight = p.font === 'JetBrains Mono' ? 700 : p.font === 'Unbounded' ? 800 : 800;
    const family = `'${p.font}', 'JetBrains Mono', monospace`;

    const el = document.createElement('div');
    el.className = `sd ${p.align}`;
    el.style.setProperty('--sc', p.scrambleColor);
    root.appendChild(el);
    const mk = (cls, txt) => { const d = document.createElement('div'); d.className = cls; el.appendChild(d); return d; };
    const tagEl = p.label ? mk('tag') : null;
    const head = mk('head');
    head.style.cssText = `font-family:${family};font-weight:${weight};font-size:${p.size}px;letter-spacing:${p.font === 'JetBrains Mono' ? '-0.02em' : '-0.03em'}`;
    const subEl = p.subtitle ? mk('sub') : null;
    if (subEl) subEl.style.fontFamily = `'JetBrains Mono', monospace`;
    const bar = mk('bar');

    const lines = [];
    function build(host, text, start, dur, weightOf) {
      const chars = [...text];
      const spans = chars.map((c) => { const s = document.createElement('span'); s.className = 'c'; s.textContent = c; host.appendChild(s); return s; });
      return { host, chars, spans, start, dur, ranks: null };
    }
    try { await document.fonts.load(`${weight} ${p.size}px ${family}`, p.text); await document.fonts.load(`500 32px 'JetBrains Mono'`, p.subtitle || 'x'); } catch (e) {}

    const k = Math.min(1, D / 3.2);
    const dec = Math.max(0.3, Math.min(p.decode, D * 0.38));
    const t0 = 0.03;
    if (tagEl) lines.push(build(tagEl, p.label, t0, dec * 0.45));
    lines.push(build(head, String(p.text || ''), t0 + 0.08, dec));
    if (subEl) lines.push(build(subEl, p.subtitle, t0 + 0.08 + 0.3 * k, dec * 0.9));

    // fit headline into the safe width
    const maxW = studio.width - 280;
    if (head.scrollWidth > maxW) head.style.fontSize = Math.floor(p.size * maxW / head.scrollWidth) + 'px';
    if (subEl && subEl.scrollWidth > maxW) subEl.style.fontSize = Math.floor(32 * maxW / subEl.scrollWidth) + 'px';
    // lock each slot to its final glyph width
    for (const L of lines) {
      L.spans.forEach((s) => { const w = s.getBoundingClientRect().width; s.style.width = w + 'px'; });
      const n = L.chars.length;
      // resolve order
      L.ranks = L.chars.map((_, i) => {
        if (p.direction === 'random') return hash(i, 77);
        if (p.direction === 'center-out') return Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
        return n > 1 ? i / (n - 1) : 0;
      });
      const appearSpread = Math.min(0.35, L.dur * 0.35);
      L.appear = L.ranks.map((r) => L.start + r * appearSpread);
      L.resolve = L.ranks.map((r, i) => L.start + 0.2 * k + r * L.dur + (hash(i, 31) - 0.5) * 0.08);
    }
    const exitDur = Math.min(0.6, D * 0.16);
    const exitAt = D - exitDur - 0.03;
    // bar under the block: draws in with the headline, retracts on exit
    tl.fromTo(bar, { width: 0 }, { width: Math.min(maxW, head.scrollWidth) * 0.5, duration: dec + 0.3, ease: 'expo.out' }, t0 + 0.1)
      .to(bar, { width: 0, opacity: 0, duration: exitDur * 0.7, ease: 'power2.in' }, exitAt);

    // idle glitch windows during the hold (single char re-scrambles for a few frames)
    const glitches = [];
    { const r = studio.random(seed * 17 + 3); let t = t0 + dec + 0.7; while (t < exitAt - 0.3) { glitches.push({ at: t, len: 2 + Math.floor(r() * 3), line: Math.floor(r() * lines.length), idx: r() }); t += 0.45 + r() * 0.8; } }

    const sc = p.scrambleColor, fc = p.finalColor;
    const glowS = p.glow ? `0 0 18px ${sc}88, 0 0 2px ${sc}` : 'none';
    const glowF = p.glow ? '0 0 24px rgba(0,0,0,.45), 0 0 1px rgba(255,255,255,.2)' : '0 4px 24px rgba(0,0,0,.4)';
    const rnd = (f, i, li) => glyphs[Math.floor(hash(f >> 1, i, li + 5) * glyphs.length)];

    return {
      render(t) {
        const f = Math.floor(t * FPS + 1e-6);
        lines.forEach((L, li) => {
          const n = L.chars.length;
          const isTag = L.host === tagEl;
          const g = glitches.find((x) => x.line === li && f >= Math.round(x.at * FPS) && f < Math.round(x.at * FPS) + x.len);
          const gIdx = g ? Math.floor(g.idx * n) : -1;
          let head = -1;
          for (let i = 0; i < n; i++) {
            const s = L.spans[i], ch = L.chars[i];
            // exit: per char re-scramble then vanish (scramble = left→right, reverse = right→left)
            const er = p.exit === 'reverse' ? 1 - L.ranks[i] : L.ranks[i];
            const eStart = exitAt + er * exitDur * 0.55 + (li * 0.04);
            const eEnd = eStart + exitDur * 0.35;
            let state;
            if (t < L.appear[i]) state = 'off';
            else if (t < L.resolve[i]) state = 'scr';
            else if (t < eStart) state = i === gIdx ? 'scr' : 'fin';
            else if (t < eEnd) state = 'scr';
            else state = 'off';
            if (ch === ' ') { s.textContent = ' '; s.style.opacity = 1; continue; }
            if (state === 'off') { s.style.opacity = 0; s.textContent = ch; s.classList.remove('cur'); continue; }
            s.style.opacity = 1;
            if (state === 'scr') {
              s.textContent = rnd(f, i, li);
              s.style.color = sc; s.style.opacity = 0.6 + 0.4 * hash(f, i, 9);
              s.style.textShadow = glowS;
              if (L.resolve[i] > t) head = Math.max(head, i);
            } else {
              s.textContent = ch;
              // freshly resolved chars flash white-hot for ~3 frames, then settle
              const age = t - L.resolve[i];
              s.style.color = age < 3 / FPS ? '#ffffff' : isTag ? sc : fc;
              s.style.opacity = isTag ? 0.85 : 1;
              s.style.textShadow = age < 3 / FPS ? glowS : glowF;
            }
            s.classList.remove('cur');
          }
          // block cursor riding the decode front (ltr only, headline only)
          if (p.direction === 'ltr' && L.host !== tagEl && head >= 0 && t < L.resolve[n - 1] + 0.05) {
            const nxt = L.chars.findIndex((c, i) => c !== ' ' && t >= L.appear[i] && t < L.resolve[i]);
            if (nxt >= 0) { L.spans[nxt].classList.add('cur'); L.spans[nxt].style.color = '#000'; L.spans[nxt].style.textShadow = 'none'; }
          }
        });
      },
    };
  },
});
