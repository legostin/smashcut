// Line chart: smooth Catmull-Rom curve revealed by a clip rect; points/labels pop as the head passes.
studio.clip({
  duration: 6,
  setup(root, p, { tl, duration }) {
    const rows = String(p.data || '').split('\n').map((l) => {
      const m = /^(.*?)[:=\t]\s*(-?[\d\s.,]+)\s*$/.exec(l.trim());
      return m ? { label: m[1].trim(), value: parseFloat(m[2].replace(/\s/g, '').replace(',', '.')) || 0 } : null;
    }).filter(Boolean).slice(0, 24);
    while (rows.length < 2) rows.push({ label: '', value: rows.length ? rows[0].value : 0 });
    const n = rows.length;
    const vals = rows.map((r) => r.value);
    const vmax = Math.max(...vals), vmin0 = Math.min(...vals);
    const lo0 = p.zeroBase ? Math.min(0, vmin0) : vmin0;
    const rawStep = (vmax - lo0 || 1) / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= rawStep);
    const lo = Math.floor(lo0 / step) * step, hi = Math.ceil(vmax / step) * step + (vmax % step === 0 ? 0 : 0);
    const fmt = (v) => v.toFixed(p.decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p.unit || '');
    const fmtAxis = (v) => (step < 1 ? v.toFixed(Math.min(3, -Math.floor(Math.log10(step)))) : String(Math.round(v)));

    const X0 = 150, X1 = 1440 - 90, Y0 = 820 - 110, Y1 = 250; // plot box in card coords
    const xs = rows.map((_, i) => X0 + ((X1 - X0) * i) / (n - 1));
    const ys = vals.map((v) => Y0 - ((v - lo) / (hi - lo || 1)) * (Y0 - Y1));
    // Catmull-Rom → Bezier with linear end extrapolation (x stays linear in the segment parameter)
    const P = xs.map((x, i) => ({ x, y: ys[i] }));
    const get = (i) => (i < 0 ? { x: 2 * P[0].x - P[1].x, y: 2 * P[0].y - P[1].y } : i >= n ? { x: 2 * P[n - 1].x - P[n - 2].x, y: 2 * P[n - 1].y - P[n - 2].y } : P[i]);
    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      segs.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
    }
    const d = `M${P[0].x},${P[0].y} ` + segs.map((s) => `C${s[1].x},${s[1].y} ${s[2].x},${s[2].y} ${s[3].x},${s[3].y}`).join(' ');
    const yAt = (x) => {
      const u = Math.max(0, Math.min(n - 1 - 1e-9, ((x - X0) / (X1 - X0)) * (n - 1)));
      const i = Math.floor(u), s = segs[i], t = u - i, mt = 1 - t;
      return mt * mt * mt * s[0].y + 3 * mt * mt * t * s[1].y + 3 * mt * t * t * s[2].y + t * t * t * s[3].y;
    };

    const el = document.createElement('div');
    el.className = 'lc';
    el.style.color = p.textColor;
    let grid = '';
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const y = Y0 - ((v - lo) / (hi - lo || 1)) * (Y0 - Y1);
      grid += `<g class="g"><line x1="${X0}" x2="${X1}" y1="${y}" y2="${y}" stroke="${p.textColor}" stroke-opacity="${v === lo ? 0.35 : 0.1}" stroke-width="2"/><text x="${X0 - 24}" y="${y + 8}" text-anchor="end" font-size="22" fill="${p.textColor}" fill-opacity=".45">${fmtAxis(v)}</text></g>`;
    }
    const cats = rows.map((r, i) => `<text class="cat" x="${xs[i]}" y="${Y0 + 46}" text-anchor="middle" font-size="24" font-weight="500" fill="${p.textColor}" fill-opacity=".65"></text>`).join('');
    const pts = rows.map((r, i) => `<g class="pt" transform="translate(${xs[i]},${ys[i]})"><g class="pi"><circle r="10" fill="${i === n - 1 ? p.accent : p.lineColor}" stroke="${p.card ? p.cardColor : '#000'}" stroke-width="5"/>${p.showValues && i < n - 1 ? `<text y="-26" text-anchor="middle" font-size="24" font-weight="700" fill="${p.textColor}"></text>` : ''}</g></g>`).join('');
    el.innerHTML = `<div class="card"></div><div class="head"><div class="title"></div><div class="sub"></div></div>
      <svg width="1440" height="820" viewBox="0 0 1440 820">
        <defs>
          <linearGradient id="lcA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${p.lineColor}" stop-opacity=".45"/><stop offset="1" stop-color="${p.lineColor}" stop-opacity="0"/></linearGradient>
          <linearGradient id="lcL" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${p.lineColor}"/><stop offset="1" stop-color="${p.accent}"/></linearGradient>
          <clipPath id="lcClip"><rect class="rev" x="${X0 - 20}" y="0" width="0" height="820"/></clipPath>
          <filter id="lcGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
        </defs>
        ${grid}${cats}
        <g clip-path="url(#lcClip)">
          ${p.area ? `<path d="${d} L${X1},${Y0} L${X0},${Y0} Z" fill="url(#lcA)"/>` : ''}
          <path d="${d}" fill="none" stroke="url(#lcL)" stroke-width="12" stroke-opacity=".35" filter="url(#lcGlow)"/>
          <path d="${d}" fill="none" stroke="url(#lcL)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        ${pts}
        <circle class="headdot" r="14" fill="#fff"/><circle class="headglow" r="30" fill="${p.accent}" fill-opacity=".35" filter="url(#lcGlow)"/>
      </svg>
      <div class="badge" style="background:${p.accent};border-top-color:${p.accent}"></div>`;
    root.appendChild(el);
    const card = el.querySelector('.card');
    if (p.card) { card.style.background = p.cardColor; card.style.opacity = p.cardOpacity; } else card.style.display = 'none';
    el.querySelector('.title').textContent = p.title || '';
    el.querySelector('.sub').textContent = p.subtitle || '';
    el.querySelectorAll('.cat').forEach((c, i) => (c.textContent = rows[i].label));
    el.querySelectorAll('.pt').forEach((g, i) => { const t = g.querySelector('text'); if (t) t.textContent = fmt(vals[i]); });
    const badge = el.querySelector('.badge');
    badge.textContent = fmt(vals[n - 1]);
    badge.style.left = xs[n - 1] - badge.offsetWidth / 2 + 'px';
    badge.style.top = ys[n - 1] - badge.offsetHeight - 30 + 'px';

    const rev = el.querySelector('.rev');
    const headDot = el.querySelector('.headdot'), headGlow = el.querySelector('.headglow');
    const ptEls = [...el.querySelectorAll('.pi')];
    const t0 = 0.8, D = Math.min(p.drawTime, Math.max(0.5, duration - t0 - 1.5));
    const out = Math.max(1.0, duration - 0.82);

    if (p.card) tl.fromTo(card, { opacity: 0, scale: 0.96 }, { opacity: p.cardOpacity, scale: 1, duration: 0.6, ease: 'expo.out' }, 0);
    tl.fromTo(el.querySelectorAll('.title, .sub'), { y: 24, opacity: 0 }, { y: 0, opacity: (i) => (i ? 0.55 : 1), duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0.15)
      .fromTo(el.querySelectorAll('.g'), { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out', stagger: 0.05 }, 0.3)
      .fromTo(el.querySelectorAll('.cat'), { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.04 }, 0.5)
      .fromTo(badge, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.2)' }, t0 + D)
      .to(el.querySelectorAll('.head, svg, .badge'), { opacity: 0, y: -20, duration: 0.45, ease: 'power2.in', stagger: 0.05 }, out);
    if (p.card) tl.to(card, { opacity: 0, scale: 0.97, duration: 0.45, ease: 'power2.in' }, out + 0.25);

    return {
      render(t) {
        const k = studio.ease.inOutCubic(studio.progress(t, t0, D));
        const hx = X0 + (X1 - X0) * k;
        rev.setAttribute('width', k > 0 ? hx - (X0 - 20) + 8 : 0);
        const hy = yAt(hx);
        const headOn = t > t0 && t < t0 + D + 0.3;
        const hk = headOn ? Math.min(1, (t - t0) / 0.2) * (1 - studio.progress(t, t0 + D, 0.3)) : 0;
        headDot.setAttribute('cx', hx); headDot.setAttribute('cy', hy); headDot.setAttribute('opacity', hk);
        headGlow.setAttribute('cx', hx); headGlow.setAttribute('cy', hy); headGlow.setAttribute('opacity', hk);
        ptEls.forEach((g, i) => {
          // time at which the head reaches this point (invert the ease numerically)
          const reached = hx >= xs[i] - 1;
          let s = 0;
          if (reached) {
            let a = 0, b = 1; const target = (xs[i] - X0) / (X1 - X0);
            for (let it = 0; it < 24; it++) { const mid = (a + b) / 2; if (studio.ease.inOutCubic(mid) < target) a = mid; else b = mid; }
            s = studio.ease.outBack(studio.progress(t, t0 + a * D, 0.35));
          }
          g.setAttribute('transform', `scale(${Math.max(0, s)})`);
        });
      },
    };
  },
});
