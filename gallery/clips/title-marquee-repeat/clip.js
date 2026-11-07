// Repetitive type marquee: every row is the same phrase repeated. Horizontal position is pure math
// of t (x = dir·speed·t + A·sin(2πft + phase·row), wrapped by the unit width), GSAP handles the
// staggered enter / exit and the mid-clip centre-row emphasis.
studio.clip({
  duration: 6,
  async setup(root, p, { tl, duration }) {
    const D = duration, W = studio.width, H = studio.height;
    const N = Math.max(3, Math.round(p.rows) | 0);
    const mid = Math.floor(N / 2);
    const weight = p.font === 'Bebas Neue' ? 400 : p.font === 'Playfair Display' ? 900 : p.font === 'Unbounded' ? 800 : 900;
    const family = `'${p.font}', 'Inter', sans-serif`;
    const text = String(p.text || 'MARQUEE').trim();

    const el = document.createElement('div');
    el.className = 'mq';
    if (p.background) el.style.background = p.bgColor;
    root.appendChild(el);
    // outline via an SVG morphology filter (dilate − original): a clean union outline even for fonts
    // whose glyphs have overlapping contours (-webkit-text-stroke would show the overlaps)
    const fid = 'mqOutline' + Math.round(p.stroke * 10);
    el.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><filter id="${fid}" x="-2%" y="-30%" width="104%" height="160%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceGraphic" operator="dilate" radius="${Math.max(0.5, p.stroke)}" result="d"/>
      <feComposite in="d" in2="SourceAlpha" operator="out"/></filter></svg>`);

    // row pitch: rows tile the full height with a slight bleed off the top and bottom edges
    const pitch = H / (N - 0.6);
    const cv = document.createElement('canvas').getContext('2d');
    try { await document.fonts.load(`${weight} 100px ${family}`, text); } catch (e) {}
    cv.font = `${weight} 100px ${family}`;
    const cap = cv.measureText('HЭ').actualBoundingBoxAscent / 100 || 0.72;
    const fs = (pitch * 0.74) / cap;
    const m = cv.measureText(p.uppercase ? text.toUpperCase() : text);
    const fa = m.fontBoundingBoxAscent / 100, fd = m.fontBoundingBoxDescent / 100;
    // shift so the cap-height band (not the line box) is centred on the row
    const dy = ((fa - fd) / 2 - cap / 2) * fs;

    const pattern = p.pattern;
    const rows = [];
    for (let i = 0; i < N; i++) {
      const row = document.createElement('div');
      const isMid = i === mid;
      let outline = pattern === 'outline' || (pattern === 'alternate' && (i - mid) % 2 !== 0) || (pattern === 'accent-only' && !isMid);
      if (isMid) outline = false;
      row.className = 'row' + (outline ? ' outline' : '');
      if (outline) row.style.filter = `url(#${fid})`;
      const fg = isMid ? p.accent : p.color;
      row.style.cssText += `top:${H / 2 + (i - mid) * pitch}px;color:${fg};--fg:${fg};font-family:${family};font-weight:${weight};font-size:${fs}px;letter-spacing:${p.font === 'Bebas Neue' ? '0.01em' : '-0.03em'}`;
      if (p.uppercase) row.style.textTransform = 'uppercase';
      const strip = document.createElement('div');
      strip.className = 'strip';
      const unit = document.createElement('div');
      unit.className = 'unit';
      unit.innerHTML = '<span></span><i class="dot"></i>';
      unit.querySelector('span').textContent = text;
      strip.appendChild(unit);
      row.appendChild(strip);
      el.appendChild(row);
      rows.push({ row, strip, unit, i, dir: (i - mid) % 2 === 0 ? -1 : 1 });
    }
    // seamless loop: measure one unit, fill the row with enough copies
    const uw = Math.max(40, rows[0].unit.getBoundingClientRect().width);
    const copies = Math.ceil((W + uw * 2) / uw) + 1;
    for (const r of rows) {
      for (let c = 1; c < copies; c++) r.strip.appendChild(r.unit.cloneNode(true));
      r.strip.style.top = (-r.strip.getBoundingClientRect().height / 2 + dy) + 'px';
    }

    // ---- enter: rows rise in from the centre outwards; exit: from the edges in, centre last ----
    const k = Math.min(1, D / 4);
    const order = rows.map((r) => Math.abs(r.i - mid));
    rows.forEach((r, n) => {
      tl.fromTo(r.row, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.9 * Math.max(0.6, k), ease: 'expo.out' }, 0.04 + order[n] * 0.07 * k);
    });
    const exitDur = Math.min(0.5, D * 0.12);
    const exitAt = D - exitDur - (mid * 0.05 * k) - 0.04;
    rows.forEach((r, n) => {
      tl.to(r.row, { opacity: 0, y: -50, duration: exitDur, ease: 'power2.in' }, exitAt + (mid - order[n]) * 0.05 * k);
    });
    // ---- mid-clip emphasis: centre row grows, the rest recede ----
    if (p.emphasis && D >= 3) {
      const at = D * 0.42, len = Math.min(1.1, D * 0.2);
      tl.to(rows[mid].row, { scale: 1.32, duration: len, ease: 'expo.inOut' }, at);
      rows.forEach((r) => { if (r.i !== mid) tl.to(r.row, { opacity: 0.28, duration: len, ease: 'power2.inOut' }, at); });
    }

    const speed = Number(p.speed) || 0, A = Number(p.waveAmplitude) || 0, f = Number(p.waveFrequency) || 0;
    return {
      render(t) {
        for (const r of rows) {
          const x = r.dir * speed * t + A * Math.sin(2 * Math.PI * f * t + r.i * 0.9);
          const off = ((x % uw) + uw) % uw;
          r.strip.style.transform = `translate3d(${(-uw + off).toFixed(2)}px,0,0)`;
        }
      },
    };
  },
});
