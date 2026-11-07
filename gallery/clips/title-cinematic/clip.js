// Cinematic title: blurred letters resolve while letter-spacing breathes in over the whole clip.
studio.clip({
  duration: 6,
  async setup(root, p, { tl, duration }) {
    const el = document.createElement('div');
    el.className = 'cin';
    el.style.color = p.textColor;
    el.innerHTML = `
      <div class="bg" style="background:radial-gradient(ellipse 75% 85% at 50% 48%, ${p.bgCenter} 0%, ${p.bgEdge} 100%)"></div>
      <div class="leak" style="background:radial-gradient(ellipse at center, ${p.accent} 0%, transparent 70%)"></div>
      <div class="vignette"></div>
      <div class="content">
        <div class="kicker"></div>
        <div class="title" style="font-size:${p.size}px;font-weight:${p.weight}"></div>
        <div class="line" style="background:linear-gradient(90deg, transparent, ${p.accent}, transparent)"></div>
        <div class="sub"></div>
      </div>
      <div class="grain"></div>
      <div class="black"></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.kicker').textContent = p.kicker || '';
    $('.sub').textContent = p.subtitle || '';
    if (!p.kicker) $('.kicker').style.display = 'none';
    if (!p.subtitle) $('.sub').style.display = 'none';
    const title = $('.title');
    const chars = [...String(p.title || '')];
    chars.forEach((c) => { const s = document.createElement('span'); s.textContent = c; title.appendChild(s); });

    // fit widest state (max breathe) into the frame
    try { await document.fonts.load(`${p.weight} ${p.size}px 'Playfair Display'`, p.title); } catch (e) {}
    title.style.setProperty('--ls', (0.05 + p.breathe) + 'em');
    const maxW = 1700;
    if (title.scrollWidth > maxW) title.style.fontSize = Math.floor(p.size * maxW / title.scrollWidth) + 'px';

    // deterministic grain: a few pre-baked noise tiles, swapped per frame
    const tiles = [];
    if (p.grain > 0) {
      const rnd = studio.random(99);
      for (let k = 0; k < 4; k++) {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d'), img = g.createImageData(256, 256);
        for (let i = 0; i < img.data.length; i += 4) { const v = rnd() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        g.putImageData(img, 0, 0);
        tiles.push(c.toDataURL());
      }
      $('.grain').style.opacity = p.grain * 0.5;
    }

    const D = duration;
    const out = Math.max(D * 0.6, D - 1.4);
    // background / black fades
    if (p.fadeBlack) {
      tl.fromTo($('.black'), { opacity: 1 }, { opacity: 0, duration: Math.min(1.2, D * 0.2), ease: 'power1.inOut' }, 0);
      tl.to($('.black'), { opacity: 1, duration: Math.min(0.9, D * 0.15), ease: 'power1.in' }, D - Math.min(0.9, D * 0.15));
    } else {
      tl.set($('.black'), { opacity: 0 }, 0);
    }
    tl.fromTo($('.leak'), { xPercent: -18, yPercent: 6, scale: 0.9 }, { xPercent: 14, yPercent: -4, scale: 1.1, duration: D, ease: 'none' }, 0);

    // letter-spacing breathes in over the whole clip
    tl.fromTo(title, { '--ls': (0.05 + p.breathe) + 'em' }, { '--ls': '0.05em', duration: D, ease: 'sine.out' }, 0);
    tl.fromTo(title, { scale: 1.04 }, { scale: 1, duration: D, ease: 'power1.out' }, 0);

    // letters resolve from blur in a shuffled (deterministic) order
    const order = chars.map((_, i) => i);
    const rnd = studio.random(5);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const spans = [...title.children];
    const spread = Math.min(1.2, D * 0.22);
    order.forEach((idx, k) => {
      tl.fromTo(spans[idx], { opacity: 0, filter: 'blur(18px)', y: 10 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 1.3, ease: 'power2.out' }, 0.4 + (k / Math.max(1, order.length - 1)) * spread);
    });
    tl.fromTo($('.kicker'), { opacity: 0, y: -12 }, { opacity: 0.8, y: 0, duration: 1.2, ease: 'power2.out' }, 0.3);
    tl.fromTo($('.line'), { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 0.9, duration: 1.6, ease: 'expo.inOut' }, 0.9);
    tl.fromTo($('.sub'), { opacity: 0, y: 12 }, { opacity: 0.65, y: 0, duration: 1.2, ease: 'power2.out' }, 1.4);

    // exit: everything dissolves into blur
    tl.to(spans, { opacity: 0, filter: 'blur(14px)', duration: 1.0, ease: 'power2.in', stagger: { each: 0.02, from: 'edges' } }, out);
    tl.to([$('.kicker'), $('.sub'), $('.line')], { opacity: 0, duration: 0.8, ease: 'power2.in' }, out);

    const grainEl = $('.grain');
    return {
      render(t) {
        if (!tiles.length) return;
        const f = Math.floor(t * 24);
        grainEl.style.backgroundImage = `url(${tiles[f % tiles.length]})`;
        grainEl.style.backgroundPosition = `${(f * 73) % 128}px ${(f * 37) % 128}px`;
      },
    };
  },
});
