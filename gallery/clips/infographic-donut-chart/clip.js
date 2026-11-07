// Donut breakdown: SVG circle segments (pathLength = 360°) sweep in clockwise from 12 o'clock.
// Per-segment state lives in proxy objects tweened on ctx.tl and is applied to the SVG in render(t).
studio.clip({
  duration: 6,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const vertical = H > W * 1.1;
    const segs = String(p.data || '').split('\n').map((l) => {
      const m = /^(.*?)[:=\t]\s*(-?[\d\s.,]+)\s*$/.exec(l.trim());
      return m ? { label: m[1].trim(), value: Math.max(0, parseFloat(m[2].replace(/\s/g, '').replace(',', '.')) || 0) } : null;
    }).filter(Boolean).slice(0, 10);
    if (!segs.length) segs.push({ label: '—', value: 1 });
    const total = segs.reduce((a, s) => a + s.value, 0) || 1;
    const palette = String(p.colors || '').split(/[,\s]+/).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c)).map((c) => (c[0] === '#' ? c : '#' + c));
    if (!palette.length) palette.push('#7C5CFF');
    const hi = Math.round(p.highlightIndex) - 1;
    const hasHi = hi >= 0 && hi < segs.length;
    const dec = Math.max(0, Math.min(2, Math.round(p.decimals) || 0));
    const fmtNum = (v) => v.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const fmt = (s, k = 1) => (p.valueFormat === 'value' ? `${p.prefix || ''}${fmtNum(s.value * k)}${p.suffix || ''}` : `${fmtNum((s.value / total) * 100 * k)}%`);

    // ---------- geometry ----------
    const CW = vertical ? 940 : 1480, CH = vertical ? 1330 : 820;
    const fitS = Math.min((W * (vertical ? 0.9 : 0.8)) / CW, (H * (vertical ? 0.8 : 0.78)) / CH);
    const Ro = vertical ? 300 : 250;
    const T = Math.max(6, (Ro * Math.max(8, Math.min(45, p.thickness))) / 100);
    const rc = Ro - T / 2;
    const cx = vertical ? CW / 2 : 80 + Ro + 20, cy = vertical ? 300 + Ro : CH / 2 + 55;
    const legend = p.showLegend !== false;

    const el = document.createElement('div');
    el.className = 'dn' + (p.card ? '' : ' nocard');
    el.style.width = CW + 'px'; el.style.height = CH + 'px';
    el.style.margin = `${-CH / 2}px 0 0 ${-CW / 2}px`;
    el.style.transform = `scale(${fitS})`;
    el.style.color = p.textColor;
    const pad = 30;
    el.innerHTML = `
      <div class="card" style="background:${p.cardColor}"></div>
      <div class="head" style="left:80px;top:64px;right:80px;${vertical ? 'text-align:center' : ''}"><div class="title"><span></span></div><div class="sub"></div></div>
      <svg width="${2 * (Ro + pad)}" height="${2 * (Ro + pad)}" viewBox="${-Ro - pad} ${-Ro - pad} ${2 * (Ro + pad)} ${2 * (Ro + pad)}" style="left:${cx - Ro - pad}px;top:${cy - Ro - pad}px">
        <circle class="track" r="${rc}" fill="none" stroke="${p.textColor}" stroke-opacity=".07" stroke-width="${T}"/>
        <g class="segs" transform="rotate(-90)"></g>
      </svg>
      <div class="center" style="left:${cx - rc}px;top:${cy - rc}px;width:${rc * 2}px;height:${rc * 2}px"><div class="num"></div><div class="lab"></div></div>
      <div class="legend"></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    if (!p.card) $('.card').style.display = 'none';
    $('.title span').textContent = p.title || '';
    $('.sub').textContent = p.subtitle || '';
    if (!p.subtitle) $('.sub').style.display = 'none';
    const g = $('.segs');
    const NS = 'http://www.w3.org/2000/svg';
    const gapDeg = segs.length > 1 ? Math.max(0, p.gapDeg) : 0;
    const capDeg = p.roundCaps ? ((T / 2) / rc) * (180 / Math.PI) : 0;
    let acc = 0;
    const S = segs.map((s, i) => {
      const deg = (s.value / total) * 360, a0 = acc; acc += deg;
      const c = document.createElementNS(NS, 'circle');
      const col = palette[i % palette.length];
      c.setAttribute('r', rc); c.setAttribute('fill', 'none'); c.setAttribute('stroke', col);
      c.setAttribute('stroke-width', T); c.setAttribute('pathLength', 360);
      c.setAttribute('stroke-linecap', p.roundCaps ? 'round' : 'butt');
      const wrap = document.createElementNS(NS, 'g');
      wrap.appendChild(c); g.appendChild(wrap);
      const mid = ((a0 + deg / 2) * Math.PI) / 180;
      return { c, wrap, col, a0: a0 + gapDeg / 2 + capDeg, len: Math.max(0, deg - gapDeg - 2 * capDeg), mid, st: { p: 0, pop: 0, dim: 0 } };
    });

    // legend
    const lgEl = $('.legend');
    const rows = segs.map((s, i) => {
      const r = document.createElement('div');
      r.className = 'lg';
      r.innerHTML = `<i style="background:${S[i].col}"></i><div class="l"></div><div class="v"></div>`;
      r.querySelector('.l').textContent = s.label;
      r.querySelector('.v').textContent = fmt(s);
      lgEl.appendChild(r);
      return r;
    });
    if (vertical) { lgEl.style.left = '110px'; lgEl.style.right = '110px'; lgEl.style.top = cy + Ro + 70 + 'px'; }
    else { lgEl.style.left = cx + Ro + 120 + 'px'; lgEl.style.right = '90px'; lgEl.style.top = cy - lgEl.offsetHeight / 2 + 'px'; }
    if (!legend) lgEl.style.display = 'none';
    // auto-fit rows if many segments
    if (!vertical && lgEl.offsetHeight > CH - 230) { const k = (CH - 230) / lgEl.offsetHeight; lgEl.style.transformOrigin = '0 50%'; lgEl.style.transform = `scale(${k})`; lgEl.style.right = 90 - (1 / k - 1) * 600 + 'px'; }

    // centre stat
    const num = $('.center .num'), lab = $('.center .lab');
    const target = hasHi ? segs[hi] : { label: 'Total', value: total };
    lab.textContent = p.centerLabel || target.label;
    const centerVal = (k) => (hasHi ? fmt(target, k) : p.valueFormat === 'value' ? `${p.prefix || ''}${fmtNum(total * k)}${p.suffix || ''}` : `${fmtNum(100 * k)}%`);
    num.textContent = centerVal(1);
    const maxNumW = 2 * (Ro - T) - 70;
    if (num.scrollWidth > maxNumW) num.style.fontSize = (112 * maxNumW) / num.scrollWidth + 'px';
    num.style.minWidth = Math.min(maxNumW, num.scrollWidth) + 'px';

    // ---------- timeline ----------
    const out = Math.max(1.4, duration - 0.7);
    const sweepT0 = 0.45, sweepSpan = Math.min(1.1, Math.max(0.5, duration * 0.18));
    const tHi = sweepT0 + sweepSpan + 0.35;
    tl.fromTo($('.card'), { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out' }, 0.02)
      .fromTo($('.title span'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out' }, 0.12)
      .fromTo($('.sub'), { y: 14, opacity: 0 }, { y: 0, opacity: 0.55, duration: 0.6, ease: 'expo.out' }, 0.22)
      .fromTo($('.track'), { opacity: 0, scale: 0.85, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out' }, 0.25)
      .fromTo(rows, { x: vertical ? 0 : 30, y: vertical ? 20 : 0, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0.55)
      .fromTo(rows.map((r) => r.querySelector('i')), { scale: 0 }, { scale: 1, duration: 0.45, ease: 'back.out(3)', stagger: 0.08 }, 0.6)
      .fromTo($('.center .lab'), { y: 12, opacity: 0 }, { y: 0, opacity: 0.65, duration: 0.6, ease: 'expo.out' }, 0.75);
    S.forEach((s, i) => {
      const start = sweepT0 + (s.a0 / 360) * sweepSpan;
      tl.to(s.st, { p: 1, duration: 0.45 + (s.len / 360) * 0.5, ease: 'power3.out' }, start);
      if (hasHi) tl.to(s.st, i === hi ? { pop: 1, duration: 0.55, ease: 'back.out(2.2)' } : { dim: 1, duration: 0.5, ease: 'power2.out' }, tHi);
      // exit: unwind in reverse order
      tl.to(s.st, { p: 0, duration: 0.35, ease: 'power2.in' }, out + (S.length - 1 - i) * 0.04);
    });
    if (hasHi) tl.to(rows.filter((_, i) => i !== hi), { opacity: 0.4, duration: 0.5, ease: 'power2.out' }, tHi);
    tl.to(rows, { x: vertical ? 0 : 20, opacity: 0, duration: 0.3, ease: 'power2.in', stagger: 0.04 }, out)
      .to([$('.center'), $('.head')], { opacity: 0, y: -10, duration: 0.35, ease: 'power2.in' }, out + 0.05)
      .to($('.track'), { opacity: 0, duration: 0.3, ease: 'power2.in' }, out + 0.2)
      .to($('.card'), { opacity: 0, scale: 0.97, duration: 0.4, ease: 'power2.in' }, out + 0.2);

    const countT0 = sweepT0 + 0.1, countD = Math.min(1.4, Math.max(0.6, tHi - countT0 + 0.3));
    const eExpo = gsap.parseEase('expo.out');
    return {
      render(t) {
        S.forEach((s, i) => {
          const L = s.len * s.st.p;
          s.c.setAttribute('stroke-dasharray', `${L.toFixed(3)} ${(360 - L + 1).toFixed(3)}`);
          s.c.setAttribute('stroke-dashoffset', (-s.a0).toFixed(3));
          s.c.style.visibility = L > 0.05 ? 'visible' : 'hidden';
          const d = 14 * s.st.pop;
          // wrap is inside the rotate(-90) group: angle 0 = 12 o'clock maps to +x
          s.wrap.setAttribute('transform', `translate(${(Math.cos(s.mid) * d).toFixed(2)},${(Math.sin(s.mid) * d).toFixed(2)})`);
          s.c.setAttribute('opacity', (1 - 0.6 * s.st.dim).toFixed(3));
          if (hasHi && i === hi) {
            const br = 0.5 + 0.5 * Math.sin((t - tHi) * 2.4);
            s.c.style.filter = s.st.pop > 0.01 ? `drop-shadow(0 0 ${(10 + 10 * br) * s.st.pop}px ${s.col}88)` : 'none';
          }
        });
        num.textContent = centerVal(eExpo(studio.progress(t, countT0, countD)));
        num.style.opacity = Math.min(1, studio.progress(t, countT0 - 0.1, 0.3));
      },
    };
  },
});
