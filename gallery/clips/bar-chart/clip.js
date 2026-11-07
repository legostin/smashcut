// Bar chart: layout in setup, bar heights + counting values computed in render(t).
studio.clip({
  duration: 6,
  setup(root, p, { tl, duration }) {
    const rows = String(p.data || '').split('\n').map((l) => {
      const m = /^(.*?)[:=\t]\s*(-?[\d\s.,]+)\s*$/.exec(l.trim());
      return m ? { label: m[1].trim(), value: parseFloat(m[2].replace(/\s/g, '').replace(',', '.')) || 0 } : null;
    }).filter(Boolean).slice(0, 16);
    if (!rows.length) rows.push({ label: '—', value: 0 });
    const maxV = Math.max(...rows.map((r) => r.value), 0);
    // nice axis
    const rawStep = (maxV || 1) / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= rawStep);
    const top = Math.ceil((maxV || 1) / step) * step;
    const fmtAxis = (v) => (step < 1 ? v.toFixed(Math.min(3, -Math.floor(Math.log10(step)))) : String(Math.round(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const fmt = (v) => v.toFixed(p.decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p.unit || '');
    const hi = p.highlight === 'max' ? rows.findIndex((r) => r.value === maxV) : p.highlight === 'last' ? rows.length - 1 : -1;

    const el = document.createElement('div');
    el.className = 'bc';
    el.style.color = p.textColor;
    el.innerHTML = `<div class="card"></div><div class="head"><div class="title"></div><div class="sub"></div></div><div class="plot"></div>`;
    root.appendChild(el);
    const card = el.querySelector('.card');
    if (p.card) { card.style.background = p.cardColor; card.style.opacity = p.cardOpacity; } else card.style.display = 'none';
    el.querySelector('.title').textContent = p.title || '';
    el.querySelector('.sub').textContent = p.subtitle || '';
    const plot = el.querySelector('.plot');
    const PH = 820 - 230 - 110, PW = 1440 - 140 - 72;

    const grids = [];
    for (let v = 0; v <= top + 1e-9; v += step) {
      const g = document.createElement('div');
      g.className = 'grid' + (v === 0 ? ' base' : '');
      g.style.bottom = (v / top) * PH - 1 + 'px';
      g.innerHTML = `<div class="gl" style="background:${p.textColor}"></div><div class="gv"></div>`;
      g.querySelector('.gv').textContent = fmtAxis(v);
      plot.appendChild(g);
      grids.push(g);
    }
    const n = rows.length;
    const slot = PW / n, bw = Math.min(140, slot * 0.58);
    const cols = rows.map((r, i) => {
      const c = document.createElement('div');
      c.className = 'col';
      c.style.left = slot * i + (slot - bw) / 2 + 'px';
      c.style.width = bw + 'px';
      c.innerHTML = `<div class="bar"></div><div class="val"></div><div class="cat"></div>`;
      const isHi = i === hi;
      c.querySelector('.bar').style.background = isHi ? p.accent : p.barColor;
      if (isHi) c.querySelector('.bar').style.boxShadow = `0 0 40px ${p.accent}55`;
      c.querySelector('.val').style.color = isHi ? p.accent : p.textColor;
      c.querySelector('.cat').textContent = r.label;
      plot.appendChild(c);
      return { el: c, bar: c.querySelector('.bar'), val: c.querySelector('.val'), h: (Math.max(0, r.value) / top) * PH, v: r.value, start: 0.75 + i * p.stagger };
    });

    const out = Math.max(1.0, duration - 0.82);
    if (p.card) tl.fromTo(card, { opacity: 0, scale: 0.96 }, { opacity: p.cardOpacity, scale: 1, duration: 0.6, ease: 'expo.out' }, 0);
    tl.fromTo(el.querySelectorAll('.title, .sub'), { y: 24, opacity: 0 }, { y: 0, opacity: (i) => (i ? 0.55 : 1), duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0.15)
      .fromTo(el.querySelectorAll('.gl'), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'expo.inOut', stagger: 0.05 }, 0.3)
      .fromTo(el.querySelectorAll('.gv'), { opacity: 0 }, { opacity: 0.45, duration: 0.4, stagger: 0.05 }, 0.5)
      .fromTo(el.querySelectorAll('.cat'), { y: 16, opacity: 0 }, { y: 0, opacity: 0.7, duration: 0.5, ease: 'power3.out', stagger: p.stagger }, 0.6)
      .to(el.querySelectorAll('.head, .grid, .cat'), { opacity: 0, duration: 0.4, ease: 'power2.in' }, out + 0.15);
    if (p.card) tl.to(card, { opacity: 0, scale: 0.97, duration: 0.45, ease: 'power2.in' }, out + 0.3);

    return {
      render(t) {
        cols.forEach((c, i) => {
          const g = studio.ease.outCubic(studio.progress(t, c.start, 0.9));
          const shrink = studio.ease.inCubic(studio.progress(t, out + (n - 1 - i) * 0.03, 0.35));
          const k = g * (1 - shrink);
          c.bar.style.height = c.h + 'px';
          c.bar.style.transform = `scaleY(${k})`;
          c.val.style.bottom = c.h * k + 14 + 'px';
          c.val.style.opacity = Math.min(1, studio.progress(t, c.start + 0.1, 0.3)) * (1 - shrink);
          c.val.textContent = fmt(c.v * studio.ease.outCubic(studio.progress(t, c.start, 0.9)));
        });
      },
    };
  },
});
