// Cursor click walkthrough. A schedule (moves / clicks / typing / camera zooms) is built once in setup;
// render(t) evaluates it as a pure function of t. Entrance / exit of the window live on ctx.tl.
studio.clip({
  duration: 8,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const mode = p.mode === 'image' && !String(p.image || '').trim() ? 'mockup' : p.mode;
    const overlay = mode === 'overlay';
    const SW = overlay ? W : 1920, SH = overlay ? H : 1080; // screen design space
    const fit = overlay ? 1 : Math.min(W / SW, H / SH);
    const offX = (W - SW * fit) / 2, offY = (H - SH * fit) / 2;
    const accent = p.accent;
    const pe = (n) => gsap.parseEase(n);
    const eIO = pe('power2.inOut'), eOut = pe('power3.out'), eExpo = pe('expo.out'), eZoom = pe('power3.inOut');

    // ---------- DOM ----------
    const el = document.createElement('div');
    el.className = 'cd';
    el.innerHTML = `
      ${overlay ? '' : `<div class="bg" style="background:${p.background}">
        <div class="glow g1" style="width:900px;height:900px;left:-200px;top:-300px;background:${accent}"></div>
        <div class="glow g2" style="width:800px;height:800px;right:-260px;bottom:-360px;background:#2a7fff"></div>
        <div class="dots"></div></div>`}
      <div class="screen"><div class="push"><div class="cam">
        ${overlay ? '' : `<div class="win ${p.theme === 'light' ? 'light' : 'dark'}" style="--accent:${accent}">
          <div class="bar"><div class="tl"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><div class="ttl"></div></div>
          ${mode === 'image' ? `<img class="shot" alt="">` : MOCKUP()}
        </div>`}
        <div class="fx"></div>
      </div></div></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const screen = $('.screen'), cam = $('.cam'), fx = $('.fx'), push = $('.push');
    if (!overlay) {
      $('.ttl').textContent = `${p.appName || 'App'} — Dashboard`;
      if (mode === 'image') $('.shot').src = String(p.image).trim();
      else $('.logo span').textContent = p.appName || 'App';
    }

    function MOCKUP() {
      const nav = ['Overview', 'Reports', 'Customers', 'Integrations', 'Settings'];
      const kpis = [['Revenue', '+12.4%'], ['Active users', '+8.1%'], ['Avg. order', '+3.2%']];
      const rows = [['Organic search', '#7C5CFF', 34], ['Paid social', '#2a7fff', 24], ['Email', '#2fd38b', 16], ['Referrals', '#f7b267', 12], ['Direct', '#f25c54', 8], ['Affiliates', '#3fc5f0', 6]];
      return `
        <div class="side">
          <div class="logo"><b style="background:linear-gradient(135deg,${accent},#2a7fff)"></b><span></span></div>
          ${nav.map((n, i) => `<div class="nav${i === 0 ? ' on' : ''}"><i></i>${n}</div>`).join('')}
          <div class="usr"><b></b><div>Maya Chen<span>Growth team</span></div></div>
        </div>
        <div class="search hit" data-fx="input"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span class="ph">Search reports…</span><span class="val"></span><span class="caret" style="background:${accent}"></span></div>
        ${['Last 7 days', 'Last 30 days', 'Last 90 days'].map((c, i) => `<div class="chip hit" data-fx="chip" data-i="${i}" style="left:${772 + i * 168}px">${c}</div>`).join('')}
        <div class="export hit" data-fx="export"><span class="spin"></span><span class="lbl">Export</span></div>
        ${kpis.map((k, i) => `<div class="kpi" style="left:${304 + i * 425}px"><div class="l">${k[0]}</div><div class="v"></div><div class="d">${k[1]}</div></div>`).join('')}
        <div class="panel" style="left:304px;width:800px"><h4>Revenue over time</h4><div class="sub">Gross revenue, all channels</div>
          <svg class="chart" width="744" height="360" viewBox="0 0 744 360">
            <defs><linearGradient id="cdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".45"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>
            ${[0, 1, 2, 3].map((g) => `<line x1="0" x2="744" y1="${20 + g * 100}" y2="${20 + g * 100}" stroke="currentColor" stroke-opacity=".08" stroke-dasharray="4 6"/>`).join('')}
            <path class="area" fill="url(#cdg)"/><path class="line" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle class="pt" r="8" fill="${accent}" stroke="#fff" stroke-width="3"/>
          </svg>
          <div class="xl">${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map((m) => `<span>${m}</span>`).join('')}</div></div>
        <div class="panel" style="left:1128px;width:432px"><h4>Top channels</h4><div class="sub">Share of revenue</div>
          ${rows.map((r) => `<div class="row"><div class="sw" style="background:${r[1]}33;box-shadow:inset 0 0 0 2px ${r[1]}"></div><div class="nm">${r[0]}<div class="tr"><b style="width:${r[2] * 2.6}%;background:${r[1]}"></b></div></div><div class="pc">${r[2]}%</div></div>`).join('')}
        </div>
        <div class="toast"><div class="ok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0b1a12" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><div>Report exported<span>q3-revenue.pdf · 2.4 MB</span></div></div>`;
    }

    // ---------- hit targets (measured before the screen is scaled) ----------
    const sr = screen.getBoundingClientRect();
    const hits = [...el.querySelectorAll('.hit')].map((h) => {
      const r = h.getBoundingClientRect();
      return { el: h, fx: h.dataset.fx, i: Number(h.dataset.i || 0), x0: r.left - sr.left, y0: r.top - sr.top, x1: r.right - sr.left, y1: r.bottom - sr.top };
    });
    const hitAt = (x, y) => hits.find((h) => x >= h.x0 - 12 && x <= h.x1 + 12 && y >= h.y0 - 12 && y <= h.y1 + 12) || null;
    screen.style.transform = `translate(${offX}px, ${offY}px) scale(${fit})`;
    if (overlay) { screen.style.width = W + 'px'; screen.style.height = H + 'px'; }

    // ---------- parse steps ----------
    const steps = String(p.steps || '').split('\n').map((line) => {
      const m = /^\s*(move|click|type|wait)\s*[:\s]\s*(.*)$/i.exec(line);
      if (!m) return null;
      const [coords, ...rest] = m[2].split('|');
      const n = coords.split(/[\s,;]+/).map(parseFloat).filter((v) => !isNaN(v));
      const action = m[1].toLowerCase();
      if (action === 'wait') return { action, secs: n[0] || 0.5 };
      if (n.length < 2) return null;
      return { action, x: (n[0] / 100) * SW, y: (n[1] / 100) * SH, zoom: n[2] > 1 ? Math.min(3, n[2]) : 0, text: rest.join('|').trim() };
    }).filter(Boolean).slice(0, 20);

    // ---------- schedule (natural timing, then fit to the clip) ----------
    const tStart = overlay ? 0.25 : 0.85;
    const exitDur = 0.5;
    const outT = Math.max(tStart + 0.8, duration - exitDur - 0.15);
    let pos = { x: SW * 0.58, y: SH * 0.8 };
    const plan = [];
    steps.forEach((s) => {
      if (s.action === 'wait') { plan.push({ kind: 'dwell', d: s.secs, fixed: true }); return; }
      const dist = Math.hypot(s.x - pos.x, s.y - pos.y);
      const tr = dist < 4 ? 0 : Math.min(1.0, Math.max(0.6, 0.5 + (dist / SW) * 0.7));
      plan.push({ kind: 'move', d: tr, a: { ...pos }, b: { x: s.x, y: s.y }, step: s });
      if (s.action !== 'move') {
        plan.push({ kind: 'hover', d: s.zoom ? 0.25 : 0.12 });
        plan.push({ kind: 'click', d: 0.35, step: s });
        if (s.action === 'type' && s.text) plan.push({ kind: 'type', d: s.text.length * 0.06 + 0.15, step: s });
      }
      plan.push({ kind: 'dwell', d: 0.35 + (s.text && s.action === 'click' ? 0.4 : 0) + (s.zoom ? 0.9 : 0), zoomed: !!s.zoom });
      pos = { x: s.x, y: s.y };
    });
    const natural = plan.reduce((a, q) => a + q.d, 0);
    const avail = Math.max(0.5, outT - 0.25 - tStart);
    if (natural > avail) { const f = avail / natural; plan.forEach((q) => (q.d *= f)); }
    else {
      const dw = plan.filter((q) => q.kind === 'dwell' && !q.fixed);
      let extra = avail - natural;
      const each = dw.length ? Math.min(1.4, extra / dw.length) : 0;
      dw.forEach((q) => { q.d += each; extra -= each; });
    }
    // lay out in time
    const moves = [], clicks = [], types = [], zooms = [], tips = [];
    let t = tStart, last = null;
    plan.forEach((q, qi) => {
      const t0 = t; t += q.d;
      if (q.kind === 'move') {
        const dx = q.b.x - q.a.x, dy = q.b.y - q.a.y, len = Math.hypot(dx, dy) || 1;
        const side = dx >= 0 ? -1 : 1; // arc bows "up" like a wrist movement
        const c = { x: (q.a.x + q.b.x) / 2 + (-dy / len) * len * 0.1 * side, y: (q.a.y + q.b.y) / 2 + (dx / len) * len * 0.1 * side };
        moves.push({ t0, t1: t, a: q.a, b: q.b, c });
        const s = q.step;
        if (s.zoom) zooms.push({ t0: t0 - 0.05, z: s.zoom, ox: s.x, oy: s.y, step: s });
        if (s.text && s.action === 'click') tips.push({ t0: t - 0.15, text: s.text, x: s.x, y: s.y, hit: hitAt(s.x, s.y), step: s });
        last = { t0, step: s };
      } else if (q.kind === 'click') {
        const s = q.step;
        clicks.push({ t: t0 + 0.04, x: s.x, y: s.y, hit: hitAt(s.x, s.y), step: s });
      } else if (q.kind === 'type') {
        const s = q.step;
        types.push({ t0, t1: t - 0.1, text: s.text, x: s.x, y: s.y, hit: hitAt(s.x, s.y) });
      }
    });
    // close zooms / tips: end when the next move starts (or at the exit)
    const nextMoveAfter = (tt) => { const m = moves.find((mv) => mv.t0 > tt + 0.01); return m ? m.t0 : outT - 0.1; };
    zooms.forEach((z) => {
      const clk = clicks.find((c) => c.step === z.step);
      const ct = clk ? clk.t : z.t0 + 1;
      z.in1 = Math.min(z.t0 + 0.95, ct);
      z.out0 = Math.max(ct + 0.5, Math.min(nextMoveAfter(z.t0) - 0.1, ct + 1.3));
      z.out1 = Math.min(outT - 0.05, z.out0 + 0.85);
      if (z.out1 - z.out0 < 0.3) z.out0 = z.out1 - 0.3;
    });
    tips.forEach((tp) => { tp.t1 = nextMoveAfter(tp.t0); });

    // ---------- fx layer ----------
    const ripples = clicks.map(() => { const r = document.createElement('div'); r.className = 'ripple'; r.style.borderColor = p.rippleColor; fx.appendChild(r); return r; });
    const ripples2 = clicks.map(() => { const r = document.createElement('div'); r.className = 'ripple'; r.style.borderColor = p.rippleColor; fx.appendChild(r); return r; });
    const tipEls = tips.map((tp) => {
      const d = document.createElement('div');
      d.className = 'tip';
      d.textContent = tp.text;
      fx.appendChild(d);
      const top = tp.hit ? tp.hit.y0 : tp.y - 30, bottom = tp.hit ? tp.hit.y1 : tp.y + 30;
      const up = top - d.offsetHeight - 22 > 20;
      d.classList.add(up ? 'up' : 'down');
      const x = Math.min(SW - d.offsetWidth - 20, Math.max(20, tp.x - d.offsetWidth / 2));
      d.style.left = x + 'px';
      d.style.top = (up ? top - d.offsetHeight - 18 : bottom + 18) + 'px';
      d.style.transformOrigin = up ? '50% 100%' : '50% 0%';
      return { d, dir: up ? 1 : -1 };
    });
    const typedEls = types.filter((ty) => !(ty.hit && ty.hit.fx === 'input')).map((ty) => {
      const d = document.createElement('div');
      d.className = 'typed';
      d.style.color = p.typeColor;
      d.style.left = ty.x + 'px'; d.style.top = ty.y - 14 + 'px';
      fx.appendChild(d);
      return { ty, d };
    });
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    const dark = p.cursorStyle === 'dark';
    cursor.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40"><path d="M7 3.5 L7 32 L14.2 25.3 L19 35.8 L24 33.6 L19.3 23.4 L29 23.4 Z" fill="${dark ? '#111' : '#fff'}" stroke="${dark ? '#fff' : '#111'}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
    fx.appendChild(cursor);
    const CS = Math.max(0.5, p.cursorSize) * (overlay ? Math.min(W, H) / 1080 : 1);

    // ---------- mockup state ----------
    const M = overlay || mode === 'image' ? null : {
      search: $('.search'), val: $('.search .val'), ph: $('.search .ph'), caret: $('.search .caret'),
      chips: [...el.querySelectorAll('.chip')], exp: $('.export'), lbl: $('.export .lbl'), spin: $('.export .spin'),
      kv: [...el.querySelectorAll('.kpi .v')], toast: $('.toast'), line: $('.chart .line'), area: $('.chart .area'), pt: $('.chart .pt'),
    };
    const SETS = [
      { pts: [38, 44, 41, 52, 49, 58, 55, 63, 61], k: [182.4, 12840, 64.2] },
      { pts: [30, 42, 47, 45, 58, 62, 60, 71, 76], k: [326.9, 24310, 68.9] },
      { pts: [22, 31, 38, 50, 47, 63, 72, 81, 94], k: [482.3, 38210, 73.5] },
    ];
    const chipClicks = clicks.filter((c) => c.hit && c.hit.fx === 'chip');
    const exportClick = clicks.find((c) => c.hit && c.hit.fx === 'export');
    const inputClick = clicks.find((c) => c.hit && c.hit.fx === 'input');
    const inputType = types.find((ty) => ty.hit && ty.hit.fx === 'input');
    const fmtK = [(v) => `$${v.toFixed(1)}k`, (v) => Math.round(v).toLocaleString('en-US'), (v) => `$${v.toFixed(2)}`];
    const chartPath = (vals, grow) => {
      const n = vals.length, xs = (i) => (i / (n - 1)) * 744, ys = (v) => 340 - (v / 100) * 320 * grow;
      const P = vals.map((v, i) => ({ x: xs(i), y: ys(v) }));
      let d = `M${P[0].x},${P[0].y}`;
      for (let i = 0; i < n - 1; i++) {
        const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
        d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
      }
      return { d, last: P[n - 1] };
    };

    // ---------- entrance / exit (GSAP) ----------
    const win = $('.win');
    if (win) {
      gsap.set(win, { transformPerspective: 2000 });
      tl.fromTo(win, { y: 60, scale: 0.92, rotateX: 10, opacity: 0 }, { y: 0, scale: 1, rotateX: 0, opacity: 1, duration: 1.0, ease: 'expo.out' }, 0.05)
        .to(win, { y: -24, scale: 0.97, opacity: 0, duration: 0.45, ease: 'power2.in' }, outT + 0.1);
      if (M) tl.fromTo(el.querySelectorAll('.kpi, .panel'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.06 }, 0.35);
      tl.fromTo(el.querySelectorAll('.bg .glow'), { opacity: 0 }, { opacity: 0.55, duration: 1.2, ease: 'power2.out' }, 0);
    }
    const st = { cur: 0 };
    tl.fromTo(st, { cur: 0 }, { cur: 1, duration: 0.35, ease: 'power2.out' }, tStart - 0.35)
      .to(st, { cur: 0, duration: 0.25, ease: 'power2.in' }, outT);

    const glows = [...el.querySelectorAll('.bg .glow')];
    return {
      render(t) {
        // background drift (secondary motion)
        glows.forEach((g, i) => { g.style.transform = `translate(${Math.sin(t * 0.35 + i * 2) * 60}px, ${Math.cos(t * 0.3 + i) * 40}px)`; });

        // cursor position
        let cx = SW * 0.58, cy = SH * 0.8;
        if (moves.length) { cx = moves[0].a.x; cy = moves[0].a.y; }
        for (const mv of moves) {
          if (t >= mv.t1) { cx = mv.b.x; cy = mv.b.y; continue; }
          if (t >= mv.t0) {
            const u = eIO((t - mv.t0) / (mv.t1 - mv.t0)), v = 1 - u;
            cx = v * v * mv.a.x + 2 * v * u * mv.c.x + u * u * mv.b.x;
            cy = v * v * mv.a.y + 2 * v * u * mv.c.y + u * u * mv.b.y;
          }
          break;
        }
        // press feedback
        let press = 1;
        const bump = new Map();
        clicks.forEach((c, i) => {
          const age = t - c.t;
          if (age >= 0 && age < 0.1) press = Math.min(press, 1 - 0.15 * (age / 0.1));
          else if (age >= 0.1 && age < 0.28) press = Math.min(press, 0.85 + 0.15 * eOut((age - 0.1) / 0.18));
          [ripples[i], ripples2[i]].forEach((r, k) => {
            const a2 = age - k * 0.09;
            if (a2 < 0 || a2 > 0.6) { r.style.opacity = 0; return; }
            const q = a2 / 0.6;
            r.style.left = c.x + 'px'; r.style.top = c.y + 'px';
            r.style.transform = `scale(${0.15 + eExpo(q) * (k ? 0.75 : 1)})`;
            r.style.opacity = ((1 - q) * (k ? 0.5 : 0.95)).toFixed(3);
          });
          if (c.hit && age >= 0 && age < 0.32) bump.set(c.hit.el, 1 + 0.03 * Math.sin(Math.PI * (age / 0.32)));
        });
        hits.forEach((h) => { const b = bump.get(h.el); h.el.style.transform = b ? `scale(${b.toFixed(4)})` : ''; });
        cursor.style.opacity = st.cur;
        cursor.style.transform = `translate(${cx - 7 * CS}px, ${cy - 3.5 * CS}px) scale(${CS * press * (0.85 + 0.15 * st.cur)})`;
        cursor.style.transformOrigin = '7px 3.5px';

        // camera zoom
        let z = 1, ox = SW / 2, oy = SH / 2;
        if (!overlay) zooms.forEach((zz) => {
          if (t < zz.t0) return;
          const kIn = eZoom(studio.progress(t, zz.t0, Math.max(0.2, zz.in1 - zz.t0)));
          const kOut = eZoom(studio.progress(t, zz.out0, Math.max(0.2, zz.out1 - zz.out0)));
          const k = kIn * (1 - kOut);
          if (k > 0) { z = 1 + (zz.z - 1) * k; ox = zz.ox; oy = zz.oy; }
        });
        if (!overlay) push.style.transform = `scale(${(1 + 0.03 * studio.ease.inOutQuad(studio.progress(t, 0, duration))).toFixed(5)})`;
        cam.style.transformOrigin = `${ox}px ${oy}px`;
        cam.style.transform = z === 1 ? 'none' : `scale(${z.toFixed(4)})`;

        // tooltips
        tips.forEach((tp, i) => {
          const a = eExpo(studio.progress(t, tp.t0, 0.45)), o = studio.progress(t, tp.t1 - 0.2, 0.2);
          const v = a * (1 - o);
          tipEls[i].d.style.opacity = v.toFixed(3);
          tipEls[i].d.style.transform = `translateY(${(1 - a) * 12 * tipEls[i].dir + o * 6 * tipEls[i].dir}px) scale(${0.92 + 0.08 * a})`;
        });
        // typed text on image / overlay
        typedEls.forEach(({ ty, d }) => {
          const n = Math.floor(studio.progress(t, ty.t0, ty.t1 - ty.t0) * ty.text.length + 1e-6);
          d.textContent = t >= ty.t0 ? ty.text.slice(0, n) + (t < outT && Math.floor(t * 2) % 2 === 0 ? '|' : '') : '';
          d.style.opacity = 1 - studio.progress(t, outT, 0.3);
        });

        if (!M) return;
        // search field
        const focusT = inputClick ? inputClick.t : Infinity;
        const blurT = inputClick ? nextMoveAfter(inputClick.t) : Infinity;
        const focused = t >= focusT && t < blurT;
        M.search.classList.toggle('on', focused);
        let txt = '';
        if (inputType && t >= inputType.t0) txt = inputType.text.slice(0, Math.floor(studio.progress(t, inputType.t0, inputType.t1 - inputType.t0) * inputType.text.length + 1e-6));
        M.val.textContent = txt;
        M.ph.style.display = txt ? 'none' : '';
        const typing = inputType && t >= inputType.t0 && t <= inputType.t1 + 0.05;
        M.caret.style.opacity = focused && (typing || Math.floor((t - focusT) / 0.5) % 2 === 0) ? 1 : 0;
        // chips → dataset morph
        let from = 0, to = 0, k = 1;
        chipClicks.forEach((c) => { if (t >= c.t) { from = to; to = c.hit.i; k = eZoom(studio.progress(t, c.t + 0.05, 0.8)); } });
        M.chips.forEach((c, i) => c.classList.toggle('on', i === to));
        const A = SETS[from % 3], B = SETS[to % 3];
        const grow = eExpo(studio.progress(t, 0.55, 1.2));
        const vals = A.pts.map((v, i) => v + (B.pts[i] - v) * k);
        const cp = chartPath(vals, grow);
        M.line.setAttribute('d', cp.d);
        M.area.setAttribute('d', `${cp.d} L744,340 L0,340 Z`);
        M.pt.setAttribute('cx', cp.last.x); M.pt.setAttribute('cy', cp.last.y);
        M.kv.forEach((kv, i) => { kv.textContent = fmtK[i]((A.k[i] + (B.k[i] - A.k[i]) * k) * (0.6 + 0.4 * grow)); });
        // export button + toast
        if (exportClick) {
          const a = t - exportClick.t;
          const busy = a >= 0.08 && a < 0.95, done = a >= 0.95;
          M.spin.style.display = busy ? 'block' : 'none';
          M.spin.style.transform = `rotate(${(a * 540) % 360}deg)`;
          M.lbl.textContent = done ? '✓ Exported' : busy ? 'Exporting' : 'Export';
          const ta = eExpo(studio.progress(t, exportClick.t + 1.0, 0.7));
          M.toast.style.opacity = ta;
          M.toast.style.transform = `translateY(${(1 - ta) * 30}px) scale(${0.96 + 0.04 * ta})`;
        } else M.toast.style.opacity = 0;
      },
    };
  },
});
