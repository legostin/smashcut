// Travel route map: dotted/flat world (bundled Natural Earth, equirectangular), dashed arcs drawn leg by leg,
// vehicle riding the tangent, pins, distance chips, following camera. Canvas frame is a pure function of t.
studio.clip({
  duration: 8,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const { k: K, countries, mask } = window.STUDIO_WORLD;
    const U = Math.min(W, H) / 1080;
    const { clamp, ease } = studio;
    const prog = (t, a, d) => clamp((t - a) / Math.max(1e-4, d));
    const inOut = ease.inOutCubic;
    const sine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
    const outBounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
    const X = (lon) => (lon + 180) * K, Y = (lat) => (90 - lat) * K;
    const WW = 360 * K;

    const STY = {
      dots: { bg0: '#101a3a', bg1: '#060915', land: 'rgba(120,145,215,0.36)', landHi: 'rgba(170,195,255,0.9)', plate: 'rgba(10,14,30,0.86)', text: '#fff', sub: 'rgba(255,255,255,0.6)', pinCore: '#0a0f22' },
      dark: { sea: '#0a0e16', land: '#1d2533', border: '#2c3649', plate: 'rgba(10,14,22,0.88)', text: '#fff', sub: 'rgba(255,255,255,0.6)', pinCore: '#0a0e16' },
      light: { sea: '#a9c9d9', land: '#e8e2d6', border: '#cfc6b3', plate: 'rgba(255,255,255,0.96)', text: '#17202a', sub: 'rgba(23,32,42,0.55)', pinCore: '#17202a' },
    };
    const S = STY[p.mapStyle] || STY.dots;

    // ---------- stops ----------
    const parse = (txt) => String(txt || '').split('\n').map((l) => {
      const [name, co] = l.split('|');
      if (!co) return null;
      const [lon, lat] = co.split(/[,;\s]+/).filter(Boolean).map(Number);
      return Number.isFinite(lon) && Number.isFinite(lat) ? { name: name.trim(), lon, lat } : null;
    }).filter(Boolean);
    let stops = parse(p.stops);
    if (stops.length < 2) stops = [{ name: 'London', lon: -0.13, lat: 51.51 }, { name: 'Dubai', lon: 55.27, lat: 25.2 }];
    let prevLon = null;
    const P = stops.map((s) => {
      let lon = s.lon;
      if (prevLon != null) { while (lon - prevLon > 180) lon -= 360; while (lon - prevLon < -180) lon += 360; }
      prevLon = lon;
      return { ...s, x: X(lon), y: Y(s.lat) };
    });
    const hav = (a, b) => {
      const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
      return 2 * 6371 * Math.asin(Math.sqrt(h));
    };
    const legs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) { nx = -nx; ny = -ny; } // bow towards the north
      const c = { x: (a.x + b.x) / 2 + nx * L * p.arcHeight, y: (a.y + b.y) / 2 + ny * L * p.arcHeight };
      legs.push({ a, b, c, km: hav(stops[i], stops[i + 1]) });
    }
    const qp = (l, u) => ({ x: (1 - u) * (1 - u) * l.a.x + 2 * (1 - u) * u * l.c.x + u * u * l.b.x, y: (1 - u) * (1 - u) * l.a.y + 2 * (1 - u) * u * l.c.y + u * u * l.b.y });
    const qt = (l, u) => ({ x: 2 * (1 - u) * (l.c.x - l.a.x) + 2 * u * (l.b.x - l.c.x), y: 2 * (1 - u) * (l.c.y - l.a.y) + 2 * u * (l.b.y - l.c.y) });

    // ---------- camera ----------
    const LAT_T = Y(84), LAT_B = Y(-58);
    const sW = Math.max(W / WW, H / (LAT_B - LAT_T));
    const fit = (pts, fill, minSpan) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const bw = Math.max(minSpan, x1 - x0), bh = Math.max(minSpan * 0.6, y1 - y0);
      const s = clamp(Math.min((W * fill) / bw, (H * fill) / bh), Math.min(sW, (W / WW) * 1.1), sW * 14);
      return { s, x: (x0 + x1) / 2, y: (y0 + y1) / 2 - 18 * U / s };
    };
    const clampCam = (c) => { const hh = H / 2 / c.s; return { ...c, y: 2 * hh >= LAT_B - LAT_T ? (LAT_T + LAT_B) / 2 : clamp(c.y, LAT_T + hh, LAT_B - hh) }; };
    const allPts = legs.flatMap((l) => [l.a, l.b, qp(l, 0.5)]);
    const camAll = clampCam(fit(allPts, 0.62, 18 * K));
    const camWide = clampCam({ ...camAll, s: Math.max(sW, camAll.s * 0.55) });
    const legCam = legs.map((l) => { const c = fit([l.a, l.b, qp(l, 0.5)], 0.5, 24 * K); return clampCam({ ...c, s: Math.min(c.s, camAll.s * 2) }); });

    // ---------- schedule ----------
    const f = clamp(D / 8, 0.32, 1);
    const n = legs.length;
    const tPin0 = 0.12 + 0.15 * f;
    const tA = 0.3 + 0.6 * f;
    const tail = (p.finalOverview ? 1.5 : 0.7) * f + 0.15;
    const tB = Math.max(tA + 0.4 * n, D - tail);
    const slot = (tB - tA) / n, legDraw = slot * 0.8;
    const LS = legs.map((_, i) => tA + i * slot), LE = LS.map((s) => s + legDraw);
    const keys = [[0, camWide], [tA, p.cameraFollow ? legCam[0] : camAll]];
    if (p.cameraFollow) legs.forEach((_, i) => keys.push([LS[i] + legDraw * 0.3, legCam[i]]));
    const tLast = LE[n - 1];
    if (p.finalOverview) keys.push([Math.min(D - 0.1, tLast + 0.25 + 1.1 * f), camAll]);
    keys.sort((a, b) => a[0] - b[0]);
    const lerpCam = (a, b, e) => {
      const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e);
      const w = Math.abs(b.s - a.s) < 1e-6 ? e : (1 / a.s - 1 / s) / (1 / a.s - 1 / b.s);
      return { s, x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
    };
    const tSettle = keys[keys.length - 1][0];
    function cam(t) {
      let c = keys[keys.length - 1][1];
      for (let i = 0; i < keys.length - 1; i++) {
        if (t < keys[i + 1][0]) { c = lerpCam(keys[i][1], keys[i + 1][1], inOut(prog(t, keys[i][0], keys[i + 1][0] - keys[i][0]))); break; }
      }
      const hold = 1 + 0.04 * ease.inOutQuad(prog(t, tSettle, Math.max(0.5, D - tSettle)));
      return { ...c, s: c.s * hold };
    }

    // ---------- DOM ----------
    const wrap = document.createElement('div');
    wrap.className = 'mrf';
    wrap.style.setProperty('--u', U);
    wrap.style.setProperty('--plate', S.plate); wrap.style.setProperty('--text', S.text); wrap.style.setProperty('--sub', S.sub); wrap.style.setProperty('--acc', p.accent);
    root.appendChild(wrap);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    wrap.appendChild(cv);
    const g = cv.getContext('2d');
    const ov = document.createElement('div');
    ov.className = 'ov';
    wrap.appendChild(ov);

    // land
    const landPath = new Path2D(countries.map((c) => c.d).join(''));
    const dots = [];
    if (p.mapStyle === 'dots' || !STY[p.mapStyle]) {
      const step = Math.max(0.5, Number(p.dotSpacing) || 1);
      const bits = Uint8Array.from(atob(mask.b64), (c) => c.charCodeAt(0));
      for (let lat = 84 - step / 2; lat > -58; lat -= step) {
        for (let lon = -180 + step / 2; lon < 180; lon += step) {
          const col = Math.floor((lon + 180) / mask.step), row = Math.floor((90 - lat) / mask.step), i = row * mask.cols + col;
          if (bits[i >> 3] & (1 << (i & 7))) dots.push(X(lon), Y(lat));
        }
      }
      dots.step = step;
    }

    // labels
    const mkChip = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = '<div class="in"></div>'; d.querySelector('.in').textContent = txt; ov.appendChild(d); return d; };
    const cityEls = P.map((s) => mkChip('city', s.name));
    const unit = p.distanceUnit;
    const fmt = (km) => {
      if (unit === 'none') return '';
      const v = unit === 'mi' ? km * 0.621371 : km;
      const r = v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v);
      // legacy Cyrillic "km" option (older projects) keeps Russian formatting; otherwise en-US
      if (unit === '\u043a\u043c') return r.toLocaleString('ru-RU') + '\u00a0\u043a\u043c';
      return r.toLocaleString('en-US') + (unit === 'mi' ? '\u00a0mi' : '\u00a0km');
    };
    const distEls = unit === 'none' ? [] : legs.map((l) => mkChip('dist', fmt(l.km)));
    const pinTimes = P.map((_, i) => (i === 0 ? tPin0 : LE[i - 1]));
    cityEls.forEach((c, i) => {
      const t0 = pinTimes[i] + (i === 0 ? 0.25 : 0.08) * f;
      tl.fromTo(c.querySelector('.in'), { yPercent: 105 }, { yPercent: 0, duration: 0.55 * Math.max(0.6, f), ease: 'expo.out' }, t0);
      tl.fromTo(c, { clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)', duration: 0.5 * Math.max(0.6, f), ease: 'expo.out' }, t0 - 0.02);
    });
    distEls.forEach((c, i) => {
      const t0 = LS[i] + legDraw * 0.55;
      tl.fromTo(c, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.45 * Math.max(0.6, f), ease: 'back.out(2)' }, t0);
    });

    // vehicle glyphs (local coords, nose pointing +x, ~ 60 units long)
    const plane = new Path2D('M30 0C30 -3 27 -4.5 22 -4.5L6 -4.5L-8 -26L-15 -26L-7 -4.5L-20 -4.5L-26 -13L-31 -13L-28 0L-31 13L-26 13L-20 4.5L-7 4.5L-15 26L-8 26L6 4.5L22 4.5C27 4.5 30 3 30 0Z');
    const glyphs = {
      car: new Path2D('M-15 4L-15 -3L-10 -4L-6 -11L7 -11L12 -4L16 -3L16 4ZM-9 4A4 4 0 1 0 -9 4.01ZM10 4A4 4 0 1 0 10 4.01Z'),
      train: new Path2D('M-11 -15L11 -15Q14 -15 14 -12L14 8Q14 11 11 11L-11 11Q-14 11 -14 8L-14 -12Q-14 -15 -11 -15ZM-10 -11L10 -11L10 -2L-10 -2ZM-8 13L-12 18M8 13L12 18'),
      ship: new Path2D('M-17 2L17 2L12 11L-12 11ZM-9 2L-9 -6L7 -6L7 2ZM-3 -6L-3 -13L3 -13L3 -6Z'),
    };

    function legHead(i, t) { return sine(prog(t, LS[i], legDraw)); }

    return {
      render(t) {
        const c = cam(t);
        const sx = (x) => (x - c.x) * c.s + W / 2, sy = (y) => (y - c.y) * c.s + H / 2;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        // background + land (with horizontal world copies so routes over the dateline still sit on land)
        const offs = [-WW, 0, WW].filter((o) => sx(o + WW) > -50 && sx(o) < W + 50);
        if (S.bg0) {
          const bg = g.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.6);
          bg.addColorStop(0, S.bg0); bg.addColorStop(1, S.bg1);
          g.fillStyle = bg; g.fillRect(0, 0, W, H);
          const r = clamp(dots.step * K * c.s * 0.26, 0.9 * U, 5 * U);
          const arrived = P.filter((_, i) => t >= pinTimes[i]).map((q) => [sx(q.x), sy(q.y), prog(t, pinTimes[P.indexOf(q)], 0.8)]);
          const near = [];
          g.fillStyle = S.land;
          g.beginPath();
          for (const o of offs) {
            for (let i = 0; i < dots.length; i += 2) {
              const x = sx(dots[i] + o), y = sy(dots[i + 1]);
              if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
              let hi = 0;
              for (const [ax, ay, pa] of arrived) { const d = Math.hypot(x - ax, y - ay); const R = 230 * U * pa; if (d < R) hi = Math.max(hi, (1 - d / R) ** 1.5); }
              if (hi > 0.05) { near.push(x, y, hi); continue; }
              g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2);
            }
          }
          g.fill();
          for (let i = 0; i < near.length; i += 3) {
            g.globalAlpha = 0.36 + 0.64 * near[i + 2];
            g.fillStyle = near[i + 2] > 0.5 ? S.landHi : S.land;
            g.beginPath(); g.arc(near[i], near[i + 1], r * (1 + 0.25 * near[i + 2]), 0, Math.PI * 2); g.fill();
          }
          g.globalAlpha = 1;
        } else {
          g.fillStyle = S.sea; g.fillRect(0, 0, W, H);
          for (const o of offs) {
            g.setTransform(c.s, 0, 0, c.s, W / 2 - (c.x - o) * c.s, H / 2 - c.y * c.s);
            g.fillStyle = S.land; g.fill(landPath);
            g.lineWidth = (1 * U) / c.s; g.strokeStyle = S.border; g.lineJoin = 'round'; g.stroke(landPath);
          }
          g.setTransform(1, 0, 0, 1, 0, 0);
          const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
          v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, p.mapStyle === 'light' ? 'rgba(20,40,60,0.22)' : 'rgba(0,0,0,0.5)');
          g.fillStyle = v; g.fillRect(0, 0, W, H);
        }

        // routes
        g.lineCap = 'round';
        legs.forEach((l, i) => {
          const h = legHead(i, t);
          if (h <= 0) return;
          const A = { x: sx(l.a.x), y: sy(l.a.y) }, C = { x: sx(l.c.x), y: sy(l.c.y) }, B = { x: sx(l.b.x), y: sy(l.b.y) };
          // split quadratic at h
          const C1 = { x: A.x + (C.x - A.x) * h, y: A.y + (C.y - A.y) * h };
          const E = qp({ a: A, b: B, c: C }, h);
          g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo(C1.x, C1.y, E.x, E.y);
          g.setLineDash([]);
          g.strokeStyle = p.accent; g.globalAlpha = 0.16; g.lineWidth = 12 * U; g.stroke();
          g.globalAlpha = 1; g.lineWidth = 4 * U; g.setLineDash([11 * U, 9 * U]); g.lineDashOffset = -t * 26 * U; g.stroke();
          g.setLineDash([]);
          // head glow while drawing
          if (h < 1) {
            const gl = g.createRadialGradient(E.x, E.y, 0, E.x, E.y, 40 * U);
            gl.addColorStop(0, p.accent); gl.addColorStop(1, 'rgba(0,0,0,0)');
            g.globalAlpha = 0.55; g.fillStyle = gl; g.fillRect(E.x - 40 * U, E.y - 40 * U, 80 * U, 80 * U); g.globalAlpha = 1;
          }
        });

        // pins
        P.forEach((q, i) => {
          const t0 = pinTimes[i];
          if (t < t0) return;
          const x = sx(q.x), y0 = sy(q.y);
          const pd = prog(t, t0, 0.45 * Math.max(0.6, f));
          const y = y0 - (1 - (i === 0 ? outBounce(pd) : ease.outBack(pd))) * (i === 0 ? 46 * U : 0);
          const sc = i === 0 ? 1 : ease.outBack(pd);
          // pulse rings
          for (let k = 0; k < 2; k++) {
            const age = t - t0 - 0.15 - k * 0.6;
            if (age < 0) continue;
            const ph = (age % 1.8) / 1.8;
            g.globalAlpha = (1 - ph) * 0.7; g.strokeStyle = i === P.length - 1 || i === 0 ? p.accent : p.pinColor; g.lineWidth = 2.5 * U;
            g.beginPath(); g.arc(x, y0, 10 * U + ph * 46 * U, 0, Math.PI * 2); g.stroke();
          }
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x, y0 + 3 * U, 11 * U * sc, 4 * U * sc, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = p.pinColor; g.beginPath(); g.arc(x, y, 11 * U * sc, 0, Math.PI * 2); g.fill();
          g.fillStyle = i === 0 || i === P.length - 1 ? p.accent : S.pinCore; g.beginPath(); g.arc(x, y, 5 * U * sc, 0, Math.PI * 2); g.fill();
          // label follows the pin
          const lab = cityEls[i];
          const above = !(i > 0 && legs[i - 1] && sy(legs[i - 1].c.y) < y0 - 10 && i === P.length - 1 && false);
          lab.style.transform = `translate(${x}px, ${y0 + (above ? -24 * U : 24 * U)}px) translate(-50%, ${above ? '-100%' : '0'})`;
        });

        // distance chips at the arc apex
        distEls.forEach((d, i) => {
          const l = legs[i], m = qp(l, 0.5);
          d.style.transform = `translate(${sx(m.x)}px, ${sy(m.y) - 16 * U}px) translate(-50%, -100%)`;
        });

        // vehicles
        if (p.vehicle !== 'none') legs.forEach((l, i) => {
          const u = legHead(i, t);
          const tIn = prog(t, LS[i], 0.25), tOut = prog(t, LE[i] - 0.18 * Math.max(0.5, f), 0.18 * Math.max(0.5, f));
          if (u <= 0 || tOut >= 1) return;
          const pos = qp(l, u), tan = qt(l, u);
          const x = sx(pos.x), y = sy(pos.y), ang = Math.atan2(tan.y, tan.x);
          const sc = U * ease.outBack(tIn) * (1 - ease.inCubic(tOut));
          g.save(); g.translate(x, y);
          if (p.vehicle === 'plane') {
            g.rotate(ang); g.scale(sc * 1.25, sc * 1.25);
            g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 14 * U; g.shadowOffsetY = 8 * U;
            g.fillStyle = '#ffffff'; g.fill(plane);
            g.shadowColor = 'transparent';
            g.fillStyle = p.accent; g.fillRect(-29, -2, 8, 4);
          } else {
            g.scale(sc, sc);
            g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 12 * U; g.shadowOffsetY = 6 * U;
            g.fillStyle = p.accent; g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
            g.shadowColor = 'transparent';
            g.fillStyle = '#10131c'; g.strokeStyle = '#10131c'; g.lineWidth = 2.5; g.fill(glyphs[p.vehicle] || glyphs.car, 'evenodd'); if (p.vehicle === 'train') g.stroke(glyphs.train);
          }
          g.restore();
        });
      },
    };
  },
});
