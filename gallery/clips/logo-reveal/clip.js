// Logo reveal: burst FX → mark pop → wordmark rises letter by letter → tagline.
studio.clip({
  duration: 5,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const el = document.createElement('div');
    el.className = 'lr';
    const NR = 14;
    const rays = Array.from({ length: NR }, (_, i) => `<div class="ray" style="transform:rotate(${(360 / NR) * i + 8}deg)"><i style="background:${i % 2 ? p.accent2 : p.accent}"></i></div>`).join('');
    el.innerHTML = `
      <div class="bg" style="background:radial-gradient(circle at 50% 50%, ${p.bg2} 0%, ${p.bg} 70%)"></div>
      <div class="fx"><div class="ring" style="border:6px solid ${p.accent}"></div><div class="ring r2" style="border:2px solid ${p.accent2}"></div>${rays}</div>
      <div class="group"><div class="row"><div class="mark"></div><div class="word"></div></div><div class="tag"></div></div>`;
    root.appendChild(el);
    const fx = el.querySelector('.fx');

    // particles (deterministic)
    const rnd = studio.random(2024);
    const parts = [];
    for (let i = 0; i < p.particles; i++) {
      const d = document.createElement('div');
      d.className = 'pt';
      const s = 6 + rnd() * 14, kind = Math.floor(rnd() * 3), col = rnd() < 0.5 ? p.accent : p.accent2;
      d.style.width = d.style.height = s + 'px';
      d.style.margin = -s / 2 + 'px';
      if (kind === 0) { d.style.borderRadius = '50%'; d.style.background = col; }
      else if (kind === 1) { d.style.background = col; }
      else { d.style.border = `3px solid ${col}`; d.style.borderRadius = '50%'; }
      fx.appendChild(d);
      const a = rnd() * Math.PI * 2, r = 260 + rnd() * 620;
      parts.push({ d, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75, rot: (rnd() - 0.5) * 540, delay: rnd() * 0.15, dur: 0.9 + rnd() * 0.7 });
    }

    // mark
    const S = Math.round(p.size * 1.25);
    const letter = (p.markLetter || String(p.logo || '?').trim()[0] || '?').slice(0, 2);
    const shapes = {
      circle: `<circle cx="50" cy="50" r="50"/>`,
      square: `<rect x="2" y="2" width="96" height="96" rx="22"/>`,
      diamond: `<rect x="17" y="17" width="66" height="66" rx="10" transform="rotate(45 50 50)"/>`,
      hexagon: `<polygon points="50,0 93.3,25 93.3,75 50,100 6.7,75 6.7,25"/>`,
    };
    const markEl = el.querySelector('.mark');
    const hasMark = p.mark !== 'none';
    if (hasMark) {
      markEl.innerHTML = `<svg width="${S}" height="${S}" viewBox="0 0 100 100"><g class="shape" fill="${p.accent}">${shapes[p.mark]}</g>
        <text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="Unbounded" font-weight="900" font-size="${letter.length > 1 ? 34 : 48}" fill="${p.bg}"></text></svg>`;
      markEl.querySelector('text').textContent = letter.toUpperCase();
    } else markEl.style.display = 'none';

    const word = el.querySelector('.word');
    const weight = p.font === 'Bebas Neue' ? 400 : p.font === 'Playfair Display' ? 700 : p.font === 'Space Grotesk' ? 700 : 800;
    word.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.size}px;color:${p.textColor};letter-spacing:${p.font === 'Bebas Neue' ? '0.04em' : '-0.02em'}`;
    [...String(p.logo || '')].forEach((c) => { const s = document.createElement('span'); s.textContent = c === ' ' ? ' ' : c; word.appendChild(s); });
    const tag = el.querySelector('.tag');
    tag.textContent = p.tagline || '';
    tag.style.color = p.textColor;
    if (!p.tagline) tag.style.display = 'none';

    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, p.logo); await document.fonts.load(`900 48px Unbounded`, letter); } catch (e) {}
    const row = el.querySelector('.row');
    if (row.offsetWidth > 1700) { const k = 1700 / row.offsetWidth; word.style.fontSize = p.size * k + 'px'; }
    // mark starts centred on screen, then slides to its place in the row
    const shift = hasMark ? row.offsetWidth / 2 - S / 2 : 0;

    const group = el.querySelector('.group');
    const letters = [...word.children];
    const tWord = hasMark ? 1.12 : 0.55;
    // burst
    tl.fromTo(el.querySelector('.ring'), { scale: 0, opacity: 1 }, { scale: 1.9, opacity: 0, duration: 1.1, ease: 'expo.out' }, 0.12)
      .fromTo(el.querySelector('.r2'), { scale: 0, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 1.4, ease: 'expo.out' }, 0.2);
    el.querySelectorAll('.ray i').forEach((r, i) => {
      tl.fromTo(r, { x: 70, scaleX: 0 }, { x: 260, scaleX: 1, duration: 0.35, ease: 'power3.out' }, 0.14 + (i % 3) * 0.03)
        .to(r, { x: 520, scaleX: 0, duration: 0.5, ease: 'power3.in' }, 0.49 + (i % 3) * 0.03);
    });
    parts.forEach((q) => {
      tl.fromTo(q.d, { x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }, { x: q.x, y: q.y, scale: 1, rotate: q.rot, duration: q.dur, ease: 'expo.out' }, 0.15 + q.delay)
        .to(q.d, { opacity: 0, scale: 0.2, duration: 0.6, ease: 'power2.in' }, 0.15 + q.delay + q.dur * 0.6);
    });
    // mark
    if (hasMark) {
      tl.fromTo(markEl, { scale: 0, rotate: -120, x: shift }, { scale: 1, rotate: 0, duration: 0.8, ease: 'back.out(1.6)' }, 0.1)
        .to(markEl, { x: 0, duration: 0.8, ease: 'expo.inOut' }, 0.55);
    }
    tl.fromTo(word, { opacity: 0 }, { opacity: 1, duration: 0.01 }, tWord)
      .fromTo(letters, { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.045 }, tWord)
      .fromTo(tag, { opacity: 0, letterSpacing: '1.1em', paddingLeft: '1.1em' }, { opacity: 0.75, letterSpacing: '0.5em', paddingLeft: '0.5em', duration: 1.4, ease: 'expo.out' }, tWord + 0.45)
      // slow push-in during the hold
      .fromTo(group, { scale: 1 }, { scale: 1.05, duration: D, ease: 'none' }, 0)
      .fromTo(el.querySelector('.bg'), { scale: 1.15 }, { scale: 1, duration: D, ease: 'power1.out' }, 0);
    if (p.fadeOut) tl.to(group, { opacity: 0, filter: 'blur(10px)', duration: 0.55, ease: 'power2.in' }, D - 0.62);
  },
});
