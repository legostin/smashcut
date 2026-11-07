// Progress ring: arc + counter + ticks computed in render(t); framing animated on ctx.tl.
studio.clip({
  duration: 5,
  setup(root, p, { tl, duration }) {
    const S = p.size, R = (S - p.thickness) / 2 - 22, C = 2 * Math.PI * R, cx = S / 2;
    const pct = Math.max(0, Math.min(100, p.percent));
    const NT = 60;
    const el = document.createElement('div');
    el.className = `pr ${p.layout}`;
    el.style.color = p.textColor;
    let ticks = '';
    if (p.ticks) for (let i = 0; i < NT; i++) {
      const a = (i / NT) * Math.PI * 2 - Math.PI / 2, r1 = S / 2 - 6, r2 = S / 2 - (i % 5 === 0 ? 20 : 13);
      ticks += `<line class="tk" x1="${cx + Math.cos(a) * r1}" y1="${cx + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cx + Math.sin(a) * r2}" stroke="${p.track}" stroke-width="${i % 5 === 0 ? 4 : 3}" stroke-linecap="round" stroke-opacity=".18"/>`;
    }
    el.innerHTML = `
      <div class="ring" style="width:${S}px;height:${S}px">
        <svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
          <defs>
            <linearGradient id="prG" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${p.color}"/><stop offset="1" stop-color="${p.color2}"/></linearGradient>
            <filter id="prGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
          </defs>
          <g class="ticks">${ticks}</g>
          <circle class="trk" cx="${cx}" cy="${cx}" r="${R}" fill="none" stroke="${p.track}" stroke-opacity=".1" stroke-width="${p.thickness}"/>
          <g transform="rotate(-90 ${cx} ${cx})">
            <circle class="arcGlow" cx="${cx}" cy="${cx}" r="${R}" fill="none" stroke="url(#prG)" stroke-width="${p.thickness}" stroke-linecap="round" stroke-dasharray="0 ${C}" filter="url(#prGlow)" opacity=".55"/>
            <circle class="arc" cx="${cx}" cy="${cx}" r="${R}" fill="none" stroke="url(#prG)" stroke-width="${p.thickness}" stroke-linecap="round" stroke-dasharray="0 ${C}"/>
          </g>
          <circle class="headdot" r="${p.thickness * 0.28}" fill="#fff"/>
        </svg>
        <div class="center"><div class="num" style="font-size:${Math.round(S * 0.26)}px"><span class="v"></span><small>%</small></div></div>
      </div>
      <div class="txt"><div class="bar" style="background:linear-gradient(90deg, ${p.color}, ${p.color2})"></div><div class="label"></div><div class="sub"></div></div>`;
    root.appendChild(el);
    el.querySelector('.label').textContent = p.label || '';
    el.querySelector('.sub').textContent = p.sublabel || '';
    if (!p.label && !p.sublabel) el.querySelector('.txt').style.display = 'none';

    const ring = el.querySelector('.ring'), txt = el.querySelector('.txt');
    const arc = el.querySelector('.arc'), glow = el.querySelector('.arcGlow'), head = el.querySelector('.headdot');
    const v = el.querySelector('.v'), tks = [...el.querySelectorAll('.tk')];
    const t0 = 0.55, F = Math.min(p.fillTime, Math.max(0.3, duration - t0 - 1.3));
    const out = Math.max(0.9, duration - 0.75);

    tl.fromTo(ring, { scale: 0.6, opacity: 0, rotate: -40 }, { scale: 1, opacity: 1, rotate: 0, duration: 0.8, ease: 'expo.out' }, 0)
      .fromTo(el.querySelector('.trk'), { attr: { 'stroke-opacity': 0 } }, { attr: { 'stroke-opacity': 0.1 }, duration: 0.5 }, 0.1)
      .fromTo(el.querySelector('.num'), { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' }, 0.3)
      .fromTo(el.querySelector('.bar'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, 0.35)
      .fromTo(el.querySelectorAll('.label, .sub'), { y: 30, opacity: 0 }, { y: 0, opacity: (i) => (i ? 0.6 : 1), duration: 0.7, ease: 'expo.out', stagger: 0.1 }, 0.4)
      .fromTo(ring, { scale: 1 }, { scale: 1.035, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' }, t0 + F - 0.05)
      // exit
      .to(txt, { x: p.layout === 'side' ? 40 : 0, y: p.layout === 'side' ? 0 : 30, opacity: 0, duration: 0.45, ease: 'power3.in' }, out)
      .to(ring, { scale: 0.7, opacity: 0, rotate: 30, duration: 0.55, ease: 'power3.in' }, out + 0.15);

    return {
      render(t) {
        const k = 1 - Math.pow(1 - studio.progress(t, t0, F), 3);
        const un = studio.ease.inCubic(studio.progress(t, out, 0.5));
        const frac = (pct / 100) * k * (1 - un);
        const len = Math.max(0.0001, frac * C);
        arc.setAttribute('stroke-dasharray', `${len} ${C}`);
        glow.setAttribute('stroke-dasharray', `${len} ${C}`);
        arc.setAttribute('opacity', frac > 0.001 ? 1 : 0);
        glow.setAttribute('opacity', frac > 0.001 ? 0.55 : 0);
        const a = frac * Math.PI * 2 - Math.PI / 2;
        head.setAttribute('cx', cx + Math.cos(a) * R); head.setAttribute('cy', cx + Math.sin(a) * R);
        head.setAttribute('opacity', frac > 0.01 ? 0.95 : 0);
        v.textContent = (pct * k).toFixed(p.decimals);
        tks.forEach((tk, i) => {
          const on = i / NT < frac - 1e-6;
          tk.setAttribute('stroke', on ? (i / NT < 0.5 ? p.color : p.color2) : p.track);
          tk.setAttribute('stroke-opacity', on ? 0.9 : 0.18);
        });
      },
    };
  },
});
