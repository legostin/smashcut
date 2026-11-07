// Kinetic words title: each word rises through its own mask; *wrapped* words get a highlight block.
studio.clip({
  duration: 4,
  async setup(root, p, { tl, duration }) {
    const el = document.createElement('div');
    el.className = `kt ${p.align} font-${p.font} ${p.uppercase ? 'upper' : ''} ${p.shadow ? 'shadow' : ''}`;
    el.style.cssText = `--color:${p.color};--accent:${p.accent};--accentText:${p.accentText}`;
    root.appendChild(el);

    if (p.eyebrow) {
      const eb = document.createElement('div');
      eb.className = 'eyebrow';
      eb.innerHTML = '<i></i><span></span>';
      eb.querySelector('span').textContent = p.eyebrow;
      el.appendChild(eb);
    }
    const lines = document.createElement('div');
    lines.className = 'lines';
    lines.style.fontFamily = `'${p.font}', sans-serif`;
    lines.style.fontSize = p.size + 'px';
    el.appendChild(lines);

    const rows = String(p.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'line';
      // tokens: *highlight groups* stay together as one word
      const tokens = row.match(/\*[^*]+\*|\S+/g) || [];
      tokens.forEach((tok, i) => {
        const hl = /^\*.*\*$/.test(tok);
        const w = document.createElement('span');
        w.className = 'w' + (hl ? ' hl' : '');
        if (hl) w.appendChild(Object.assign(document.createElement('span'), { className: 'bg' }));
        const wi = document.createElement('span');
        wi.className = 'wi';
        wi.textContent = hl ? tok.slice(1, -1) : tok;
        w.appendChild(wi);
        line.appendChild(w);
        if (i < tokens.length - 1) line.appendChild(Object.assign(document.createElement('span'), { className: 'gap' }));
      });
      lines.appendChild(line);
    }

    // fit: shrink so the widest line fits the safe area
    try { await document.fonts.load(`900 ${p.size}px '${p.font}'`, rows.join(' ')); } catch (e) {}
    const maxW = 1920 - 280;
    const widest = Math.max(1, ...[...lines.children].map((l) => l.scrollWidth));
    if (widest > maxW) lines.style.fontSize = Math.floor(p.size * maxW / widest) + 'px';

    const words = [...el.querySelectorAll('.w')];
    const st = p.stagger;
    const t0 = 0.15;
    if (p.eyebrow) {
      tl.from(el.querySelector('.eyebrow i'), { scaleX: 0, duration: 0.5, ease: 'expo.out' }, 0.05)
        .from(el.querySelector('.eyebrow span'), { yPercent: 120, duration: 0.6, ease: 'expo.out' }, 0.12);
    }
    words.forEach((w, i) => {
      const at = t0 + i * st;
      const inner = w.querySelector('.wi');
      tl.fromTo(inner, { yPercent: 115, rotate: 5, transformOrigin: '0% 100%' }, { yPercent: 0, rotate: 0, duration: 0.75, ease: 'expo.out' }, at);
      const bg = w.querySelector('.bg');
      if (bg) {
        tl.fromTo(bg, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: 'expo.inOut' }, at - 0.08);
        tl.fromTo(inner, { color: p.color }, { color: p.accentText, duration: 0.2, ease: 'none' }, at + 0.2);
      }
    });
    // slow push for life during the hold
    tl.fromTo(lines, { scale: 0.985, transformOrigin: p.align === 'center' ? '50% 50%' : '0% 50%' }, { scale: 1.015, duration, ease: 'none' }, 0);

    // exit: words leave upward through the same masks, ending at the clip end
    const exitDur = Math.min(0.8, duration * 0.2);
    const exitSt = Math.min(0.04, (exitDur * 0.5) / Math.max(1, words.length));
    const out = Math.max(0.5, duration - exitDur - 0.05);
    words.forEach((w, i) => {
      tl.to(w.querySelector('.wi'), { yPercent: -115, duration: exitDur * 0.55, ease: 'power3.in' }, out + i * exitSt);
      const bg = w.querySelector('.bg');
      if (bg) tl.to(bg, { scaleX: 0, transformOrigin: 'right center', duration: exitDur * 0.5, ease: 'power3.in' }, out + i * exitSt);
    });
    if (p.eyebrow) {
      tl.to(el.querySelector('.eyebrow span'), { yPercent: -120, duration: 0.4, ease: 'power3.in' }, out)
        .to(el.querySelector('.eyebrow i'), { scaleX: 0, transformOrigin: 'right', duration: 0.4, ease: 'power3.in' }, out + 0.05);
    }
  },
});
