// Bar chart race — the whole chart is a pure function of t (computed in render):
// values interpolate between periods; rank positions, axis max and tick visibility are smoothed by
// averaging the discrete state over a short trailing window (deterministic temporal filter).
studio.clip({
  duration: 12,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const S = Math.min(W, H) / 1080;
    const vertical = H > W * 1.1;
    const M = { x: Math.round(W * 0.0625), top: Math.round(H * (vertical ? 0.07 : 0.083)) };

    // ---------- data ----------
    const series = String(p.data || '').split('\n').map((l) => {
      const m = /^(.*?)[:=\t]\s*(.+)$/.exec(l.trim());
      if (!m) return null;
      const vals = m[2].split(/[;,\s]+/).map((x) => parseFloat(x.replace(/ /g, ''))).map((v) => (isNaN(v) ? null : v));
      return vals.some((v) => v != null) ? { name: m[1].trim(), vals } : null;
    }).filter(Boolean).slice(0, 40);
    if (!series.length) series.push({ name: '—', vals: [0, 0] });
    const P = Math.max(2, ...series.map((s) => s.vals.length));
    series.forEach((s) => { // fill gaps by carrying values forward/back
      let last = s.vals.find((v) => v != null) ?? 0;
      for (let i = 0; i < P; i++) { if (s.vals[i] == null) s.vals[i] = last; last = s.vals[i]; }
    });
    let periods = String(p.periods || '').split(',').map((x) => x.trim()).filter(Boolean);
    while (periods.length < P) periods.push(String(periods.length + 1));
    const N = series.length;
    const topN = Math.max(1, Math.min(N, Math.round(p.topN) || 10));
    const palette = String(p.colors || '').split(/[,\s]+/).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c)).map((c) => (c[0] === '#' ? c : '#' + c));
    if (!palette.length) palette.push('#3FA7F5');
    const dec = Math.max(0, Math.min(3, Math.round(p.decimals) || 0));
    const fmt = (v) => {
      let s;
      if (p.compact) {
        const a = Math.abs(v), u = a >= 1e9 ? ['B', 1e9] : a >= 1e6 ? ['M', 1e6] : a >= 1e3 ? ['K', 1e3] : ['', 1];
        s = (v / u[1]).toFixed(u[0] ? Math.max(1, dec) : dec) + u[0];
      } else s = v.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (p.prefix || '') + s + (p.suffix || '');
    };
    const initials = (n) => { const w = n.replace(/[^\p{L}\p{N}#+ ]/gu, '').trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : n.replace(/\s/g, '').slice(0, 2)).toUpperCase(); };

    // ---------- timing ----------
    const out = Math.max(1.6, duration - 0.75);
    const intro = Math.min(1.3, duration * 0.18);
    const tR0 = intro, tR1 = Math.max(tR0 + 0.5, out - Math.min(1.2, duration * 0.1));
    const fAt = (t) => (P - 1) * studio.progress(t, tR0, tR1 - tR0);
    const smooth = p.interpolation === 'smooth';
    const valuesAt = (t) => {
      const f = fAt(t), i = Math.min(P - 2, Math.floor(f));
      let u = f - i; if (smooth) u = u * u * (3 - 2 * u);
      return series.map((s) => s.vals[i] + (s.vals[i + 1] - s.vals[i]) * u);
    };
    const ranksOf = (vals) => { const idx = vals.map((v, i) => i).sort((a, b) => vals[b] - vals[a] || a - b); const r = new Array(N); idx.forEach((s, k) => (r[s] = k)); return r; };
    const niceStep = (max) => { const raw = Math.max(1e-9, max) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw); };
    const WIN = 0.42, NS = 14;
    const kernel = Array.from({ length: NS }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (k + 0.5)) / NS));
    const ksum = kernel.reduce((a, b) => a + b, 0);

    // ---------- layout ----------
    const el = document.createElement('div');
    el.className = 'br';
    el.style.background = p.background;
    el.style.color = p.textColor;
    el.innerHTML = `<div class="period"><span></span></div><div class="ticks"></div><div class="rows"></div>
      <div class="head" style="left:${M.x}px;top:${M.top}px;right:${M.x}px"><div class="title"><span></span></div><div class="sub"></div></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.title span').textContent = p.title || '';
    $('.sub').textContent = p.subtitle || '';
    if (!p.subtitle) $('.sub').style.display = 'none';
    const head = $('.head');
    head.style.transformOrigin = '0 0';
    if (S !== 1) { $('.title').style.fontSize = 58 * S * (vertical ? 1.3 : 1) + 'px'; $('.sub').style.fontSize = 26 * S * (vertical ? 1.3 : 1) + 'px'; }
    const headBottom = M.top + head.offsetHeight;

    const rowsEl = $('.rows'), ticksEl = $('.ticks');
    const chartTop = headBottom + 70 * S * (vertical ? 1.6 : 1);
    const chartBottom = H - (vertical ? H * 0.2 : M.top * 0.9);
    const rh = (chartBottom - chartTop) / topN;
    const bh = Math.min(rh * 0.78, 80 * S * (vertical ? 1.3 : 1));
    const fs = Math.max(16, Math.min(30 * S * (vertical ? 1.25 : 1), bh * 0.5));
    // measure names → label column
    const rows = series.map((s, i) => {
      const r = document.createElement('div');
      r.className = 'row';
      const col = palette[i % palette.length];
      r.innerHTML = `<div class="nm"></div><div class="bar" style="background:${col};box-shadow:0 6px 24px ${col}33"></div>${p.icons ? `<div class="ic" style="color:${col}"></div>` : ''}<div class="val"></div>`;
      r.querySelector('.nm').textContent = s.name;
      if (p.icons) r.querySelector('.ic').textContent = initials(s.name);
      rowsEl.appendChild(r);
      const nm = r.querySelector('.nm'), val = r.querySelector('.val');
      nm.style.fontSize = val.style.fontSize = fs + 'px';
      nm.style.lineHeight = val.style.lineHeight = bh + 'px';
      return { el: r, nm, bar: r.querySelector('.bar'), ic: r.querySelector('.ic'), val, col };
    });
    const maxName = Math.max(...rows.map((r) => r.nm.offsetWidth));
    const labelW = Math.min(W * 0.26, maxName);
    if (maxName > labelW) rows.forEach((r) => { r.nm.style.maxWidth = labelW + 'px'; r.nm.style.overflow = 'hidden'; r.nm.style.textOverflow = 'ellipsis'; });
    const x0 = M.x + labelW + 22 * S;
    rows.forEach((r) => { r.val.textContent = fmt(Math.max(...series.flatMap((s) => s.vals))); });
    const valW = Math.max(...rows.map((r) => r.val.offsetWidth)) + 20 * S;
    const maxLen = W - M.x - x0 - valW;
    const icS = Math.min(bh * 0.66, 46 * S);
    rows.forEach((r) => {
      r.el.style.left = x0 + 'px';
      r.bar.style.height = bh + 'px';
      if (r.ic) { r.ic.style.width = r.ic.style.height = icS + 'px'; r.ic.style.marginTop = -icS / 2 + 'px'; r.ic.style.top = bh / 2 + 'px'; r.ic.style.fontSize = icS * 0.4 + 'px'; }
    });

    // period label (behind bars), bottom-right
    const period = $('.period');
    const pfs = (vertical ? 260 : 220) * S;
    period.style.fontSize = pfs + 'px';
    period.style.right = M.x + 'px';
    period.style.bottom = (vertical ? H * 0.2 - pfs * 0.95 - 10 * S : M.top * 0.55) + 'px';
    period.style.minWidth = '4em';
    const periodSpan = $('.period span');

    // ticks: union of every tick value the race will ever need
    const samples = 240, tickVals = new Set();
    const maxAt = (t) => Math.max(...valuesAt(t), 1e-9);
    for (let k = 0; k <= samples; k++) { const t = tR0 + ((tR1 - tR0) * k) / samples; const mx = maxAt(t), st = niceStep(mx); for (let v = 0; v <= mx * 1.0001; v += st) tickVals.add(+v.toPrecision(10)); }
    maxAt(0) && (() => { const mx = maxAt(0), st = niceStep(mx); for (let v = 0; v <= mx; v += st) tickVals.add(+v.toPrecision(10)); })();
    const ticks = [...tickVals].sort((a, b) => a - b).map((v) => {
      const d = document.createElement('div');
      d.className = 'tick';
      d.innerHTML = `<i style="background:${p.textColor}"></i><b></b>`;
      d.querySelector('b').textContent = fmt(v).replace(/\.0+(?=\D*$)/, '');
      d.querySelector('b').style.fontSize = 20 * S * (vertical ? 1.25 : 1) + 'px';
      d.querySelector('i').style.top = '0px';
      d.querySelector('i').style.height = chartBottom - chartTop + 10 * S + 'px';
      d.style.top = chartTop - 6 * S + 'px';
      ticksEl.appendChild(d);
      return { v, d };
    });

    // ---------- GSAP: title, head, exit ----------
    tl.fromTo($('.title span'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out' }, 0.05)
      .fromTo($('.sub'), { y: 14, opacity: 0 }, { y: 0, opacity: 0.55, duration: 0.6, ease: 'expo.out' }, 0.2)
      .fromTo(period, { opacity: 0, y: 30 * S }, { opacity: 0.22, y: 0, duration: 0.9, ease: 'expo.out' }, 0.3)
      .fromTo(ticksEl, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' }, 0.25)
      .to($('.title span'), { yPercent: -110, duration: 0.45, ease: 'power3.in' }, out + 0.1)
      .to([$('.sub'), period, ticksEl], { opacity: 0, duration: 0.4, ease: 'power2.in' }, out + 0.05);

    const eOut = gsap.parseEase('expo.out'), eIn = gsap.parseEase('power3.in');
    return {
      render(t) {
        // smoothed state from a trailing window of discrete states
        const yRank = new Array(N).fill(0), vis = new Array(N).fill(0);
        let mx = 0;
        for (let k = 0; k < NS; k++) {
          const ts = t - WIN * (1 - (k + 0.5) / NS);
          const vals = valuesAt(ts), rk = ranksOf(vals), w = kernel[k] / ksum;
          for (let i = 0; i < N; i++) { yRank[i] += Math.min(rk[i], topN) * w; vis[i] += (rk[i] < topN ? 1 : 0) * w; }
          mx += Math.max(...vals, 1e-9) * w;
        }
        const vals = valuesAt(t), rk = ranksOf(vals);
        const domain = mx / 0.98;
        // ticks (fade with the active step, slide with the domain)
        const st = niceStep(mx);
        ticks.forEach((tk) => {
          const x = x0 + (tk.v / domain) * maxLen;
          const on = Math.abs(tk.v / st - Math.round(tk.v / st)) < 1e-6 && tk.v <= domain * 1.001;
          const a = on ? Math.min(1, (x - x0) / (maxLen * 0.08) + (tk.v === 0 ? 1 : 0)) : 0;
          tk.d.style.transform = `translateX(${x.toFixed(2)}px)`;
          tk.d.style.opacity = Math.max(0, Math.min(1, a)).toFixed(3);
        });
        // bars
        rows.forEach((r, i) => {
          const order = Math.min(rk[i], topN);
          const grow = eOut(studio.progress(t, 0.35 + order * 0.05, 0.9)) * (1 - eIn(studio.progress(t, out + order * 0.025, 0.35)));
          const len = Math.max(0, (vals[i] / domain) * maxLen) * grow;
          const y = chartTop + yRank[i] * rh + (rh - bh) / 2;
          r.el.style.transform = `translateY(${y.toFixed(2)}px)`;
          r.el.style.opacity = vis[i].toFixed(3);
          r.el.style.display = vis[i] < 0.002 ? 'none' : '';
          r.bar.style.width = len.toFixed(2) + 'px';
          if (r.ic) { r.ic.style.left = len - icS - (bh - icS) / 2 + 'px'; r.ic.style.opacity = len > icS + bh * 0.4 ? 1 : 0; }
          r.val.style.left = len + 14 * S + 'px';
          r.val.textContent = fmt(vals[i]);
          r.val.style.opacity = Math.min(1, grow * 1.4).toFixed(3);
          r.nm.style.opacity = Math.min(1, studio.progress(t, 0.3 + order * 0.05, 0.5)) * (1 - studio.progress(t, out + 0.05, 0.35));
        });
        // period label with a short roll when it changes
        const fr = fAt(t), idx = Math.round(fr);
        const tb = tR0 + ((idx - 0.5) / (P - 1)) * (tR1 - tR0);
        const age = idx > 0 ? t - tb : 1;
        periodSpan.textContent = periods[idx];
        periodSpan.style.transform = `translateY(${(age < 0.3 ? (1 - eOut(age / 0.3)) * 60 : 0).toFixed(1)}%)`;
      },
    };
  },
});
