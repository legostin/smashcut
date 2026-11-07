// Quote card: glyph lands, words resolve from blur, rule draws, author fades in.
studio.clip({
  duration: 7,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const el = document.createElement('div');
    el.className = `qc ${p.align}`;
    el.style.color = p.textColor;
    el.innerHTML = `
      <div class="bg" style="background:radial-gradient(ellipse 70% 80% at 30% 40%, ${p.bg2} 0%, ${p.bg} 70%)"></div>
      <div class="glyph" style="color:${p.accent}">&rdquo;</div>
      <div class="wrap">
        <div class="mark" style="color:${p.accent}">&ldquo;</div>
        <div class="q"></div>
        <div class="rule" style="background:${p.accent}"></div>
        <div class="author"></div><div class="role"></div>
      </div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const raw = String(p.quote || '');
    const plain = raw.replace(/\*/g, '');
    const L = plain.length;
    const auto = L < 50 ? 112 : L < 90 ? 90 : L < 160 ? 70 : L < 260 ? 54 : 44;
    const size = p.size > 0 ? p.size : auto;
    const weight = p.font === 'Playfair Display' ? 400 : p.font === 'Unbounded' ? 600 : 600;
    const q = $('.q');
    q.style.cssText = `font-family:'${p.font}',serif;font-weight:${weight};font-size:${size}px`;
    // tokens; *phrase* spans several words → each word marked accent
    let hl = false;
    const words = [];
    raw.split(/(\s+)/).forEach((tok) => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { q.appendChild(document.createTextNode(' ')); return; }
      const start = tok.startsWith('*'), end = tok.replace(/[.,!?;:…»"]+$/, '').endsWith('*');
      if (start) hl = true;
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = tok.replace(/\*/g, '');
      if (hl) { s.style.color = p.accent; if (p.font === 'Playfair Display') s.style.fontWeight = 700; }
      if (end) hl = false;
      q.appendChild(s);
      words.push(s);
    });
    $('.author').textContent = p.author || '';
    $('.role').textContent = p.role || '';
    if (!p.author) $('.author').style.display = 'none';
    if (!p.role) $('.role').style.display = 'none';
    try { await document.fonts.load(`${weight} ${size}px '${p.font}'`, plain); } catch (e) {}
    // fit vertically
    const wrap = $('.wrap');
    if (wrap.offsetHeight > 960) q.style.fontSize = Math.floor(size * Math.sqrt(900 / wrap.offsetHeight)) + 'px';

    const glyph = $('.glyph');
    glyph.style.right = '80px'; glyph.style.bottom = '-420px';
    const st = Math.min(p.wordStagger, (D * 0.35) / Math.max(1, words.length));
    const tW = 0.55, tEnd = tW + words.length * st + 0.5;
    const out = Math.max(0.8, D - 0.8);
    tl.fromTo($('.bg'), { scale: 1.12 }, { scale: 1, duration: D, ease: 'power1.out' }, 0)
      .fromTo(glyph, { y: 120, rotate: 8, opacity: 0 }, { y: 0, rotate: 0, opacity: 0.06, duration: D, ease: 'power2.out' }, 0)
      .fromTo($('.mark'), { y: 60, scale: 0.6, opacity: 0, transformOrigin: p.align === 'center' ? '50% 50%' : '0% 50%' }, { y: 0, scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.8)' }, 0.1)
      .fromTo(words, { y: 26, opacity: 0, filter: 'blur(10px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', stagger: st }, tW)
      .fromTo($('.rule'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.inOut' }, tEnd - 0.3)
      .fromTo([$('.author'), $('.role')], { y: 20, opacity: 0 }, { y: 0, opacity: (i) => (i ? 0.6 : 1), duration: 0.6, ease: 'power3.out', stagger: 0.1 }, tEnd)
      // exit: content lifts away, background stays
      .to([$('.mark'), q, $('.rule'), $('.author'), $('.role')], { y: -30, opacity: 0, duration: 0.5, ease: 'power2.in', stagger: 0.05 }, out);
  },
});
