// Liquid-glass name plate: a frosted blob stretches into the plate with an elastic, liquid overshoot,
// a sheen sweeps once, text fades up; at the end the plate melts back into the blob.
// Glass is faked (gradients + edge highlight + chromatic fringe + grain) because an overlay cannot refract the video.
studio.clip({
  duration: 6,
  async setup(root, p, { tl, duration, width, height }) {
    const D = duration, W = width, H = height;
    const portrait = H / W > 1.2;
    const u0 = Math.min(W, H) / 1080, u = u0 * p.scale;
    const k = Math.min(1, Math.max(0.55, (D - 0.9) / 2.4)); // compress the intro on short clips
    const T = (x) => x * k;
    const grainURI = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='5' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

    const el = document.createElement('div');
    el.className = 'lg';
    el.style.cssText = `--u:${u};--tint:${p.tint};--frost:${(0.12 + 0.4 * p.frost).toFixed(3)};--accent:${p.accentColor}`;
    el.innerHTML = `
      <div class="glass"><div class="grain"></div><div class="spec"></div><div class="sheen"></div></div>
      <div class="content">${p.showAccent ? '<div class="dot"></div>' : ''}<div class="tx"><div class="nm"></div>${p.title ? '<div class="tt"></div>' : ''}</div></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.grain').style.backgroundImage = grainURI;
    $('.grain').style.opacity = p.grain;
    $('.nm').textContent = p.name;
    if (p.title) $('.tt').textContent = p.title;
    const glass = $('.glass'), content = $('.content'), dot = $('.dot');
    try { await document.fonts.load(`800 ${54 * u}px 'Manrope'`, p.name + p.title); } catch (e) {}

    // ---- measure ----
    const padL = (p.showAccent ? 36 : 46) * u, padR = 52 * u, padT = 30 * u, padB = 32 * u;
    content.style.padding = `${padT}px ${padR}px ${padB}px ${padL}px`;
    let pw = content.offsetWidth, ph = content.offsetHeight;
    const maxW = W * (portrait ? 0.88 : 0.7);
    if (pw > maxW) { // shrink type to fit long names
      const f = maxW / pw;
      $('.nm').style.fontSize = 54 * u * f + 'px';
      if (p.title) $('.tt').style.fontSize = 28 * u * Math.max(0.8, f) + 'px';
      pw = content.offsetWidth; ph = content.offsetHeight;
    }
    const R = 30 * u;
    const blob = ph * 0.62;
    // ---- place ----
    const mx = (portrait ? 60 : 110) * u0;
    const cy = portrait ? H * 0.8 - ph / 2 : H - 108 * u0 - ph / 2;
    el.style.top = cy + 'px';
    const pos = p.position;
    if (pos === 'right') { el.style.right = mx + 'px'; glass.style.right = content.style.right = 0; }
    else if (pos === 'center') { el.style.left = W / 2 + 'px'; }
    else { el.style.left = mx + 'px'; glass.style.left = content.style.left = 0; }
    const xP = pos === 'center' ? -50 : 0;
    // the blob is born where the accent dot sits (or the middle for centred plates)
    const blobInset = pos === 'center' ? 0 : padL - blob / 2 + 9 * u;
    if (pos === 'left') glass.style.left = 0;
    gsap.set([glass, content], { yPercent: -50, xPercent: xP });
    content.style.width = pw + 'px';

    // ---- timeline ----
    const xo = D - 0.78;
    const side = pos === 'right' ? 'right' : 'left';
    const g0 = { width: blob, height: blob, borderRadius: blob / 2 };
    if (pos !== 'center') g0[side] = Math.max(0, blobInset);
    tl.set(glass, g0, 0)
      .fromTo(glass, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' }, 0.05)
      .to(glass, { height: ph, duration: T(0.95), ease: 'elastic.out(1, 0.72)' }, T(0.28))
      .to(glass, { width: pw, duration: T(1.15), ease: 'elastic.out(1, 0.55)' }, T(0.32))
      .to(glass, { borderRadius: R, duration: T(0.55), ease: 'power3.out' }, T(0.3));
    if (pos !== 'center') tl.to(glass, { [side]: 0, duration: T(0.6), ease: 'power3.out' }, T(0.32));
    tl.fromTo($('.sheen'), { x: -0.5 * pw }, { x: 1.3 * pw, duration: 1.1, ease: 'power2.inOut' }, T(0.75));
    if (dot) tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' }, T(0.5));
    const lines = [$('.nm'), $('.tt')].filter(Boolean);
    tl.fromTo(lines, { y: 10 * u, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out', stagger: 0.08 }, T(0.55))
      // exit: text drops, plate melts back into the blob, blob pops
      .to(lines, { y: -6 * u, opacity: 0, filter: 'blur(6px)', duration: 0.26, ease: 'power2.in', stagger: 0.04 }, xo);
    if (dot) tl.to(dot, { scale: 0, duration: 0.25, ease: 'back.in(2)' }, xo + 0.05);
    tl.to(glass, { width: blob, duration: 0.42, ease: 'power3.in' }, xo + 0.1)
      .to(glass, { height: blob, borderRadius: blob / 2, duration: 0.38, ease: 'power3.in' }, xo + 0.16);
    if (pos !== 'center') tl.to(glass, { [side]: Math.max(0, blobInset), duration: 0.42, ease: 'power3.in' }, xo + 0.1);
    tl.to(glass, { scale: 0.2, opacity: 0, duration: 0.22, ease: 'power2.in' }, xo + 0.54);
    const spec = $('.spec');

    return {
      render(t) {
        // liquid secondary motion: the specular highlight drifts, the accent dot breathes
        spec.style.left = `${-10 + 45 * (0.5 + 0.5 * Math.sin(t * 0.7))}%`;
        if (dot) {
          const g = 0.5 + 0.5 * Math.sin(t * 2.6);
          dot.style.boxShadow = `0 0 ${(10 + 10 * g) * u}px ${(2 + 3 * g) * u}px color-mix(in srgb, ${p.accentColor} ${45 + 25 * g}%, transparent)`;
        }
      },
    };
  },
});
