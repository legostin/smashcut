// Browser window reveal: window tilts up, URL types, load bar + skeleton shimmer, page crossfades in,
// then the long page auto-scrolls between stops. Scroll / typing / shimmer are computed in render(t).
studio.clip({
  duration: 9,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const A = p.accent;
    const WW = 1500, WH = 880, VIEW_H = WH - 102;
    const fit = Math.min((W * 0.86) / WW, (H * 0.84) / WH);
    const shot = String(p.screenshot || '').trim();
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const icon = (d, c = 'currentColor', s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const site = () => `
      <div class="site">
        <div class="nv an"><div class="lg"><i style="background:linear-gradient(135deg,${A},#ff6fb5)"></i>${esc(p.brand || 'Acme')}</div>
          <div class="lk"><span>Product</span><span>Templates</span><span>Pricing</span><span>Customers</span><span>Docs</span></div><div class="sp"></div>
          <span style="font:600 16px/1 Inter;color:#4a5065;margin-right:8px">Sign in</span><span class="btn" style="background:${A}">Start free</span></div>
        <div class="hero">
          <div class="an"><span class="badge"><b style="background:${A}">New</b>v2.0 is live — meet the AI co-pilot →</span></div>
          <h1 class="an">${esc(p.headline || '')}</h1>
          <p class="an">${esc(p.subhead || '')}</p>
          <div class="ctas an"><span class="btn" style="background:${A}">Get started — it’s free</span><span class="btn gh">▶&nbsp; Watch demo</span></div>
          <div class="shot an" style="background:linear-gradient(180deg,${A}33,${A}08)"><div class="ed">
            <div class="pv" style="background:radial-gradient(circle at 75% 30%,#ff8fc7,transparent 55%),linear-gradient(135deg,${A},#12162b)"><b>Launch day ✦</b></div>
            <div class="pn"><i style="width:60%"></i><i></i><i style="width:80%"></i><i style="width:45%"></i><i></i><i style="width:70%"></i></div>
            <div class="trk" style="top:376px;background:#1a1d29"><div style="position:absolute;left:4%;width:38%;top:5px;bottom:5px;border-radius:6px;background:${A}"></div><div style="position:absolute;left:46%;width:30%;top:5px;bottom:5px;border-radius:6px;background:${A}aa"></div></div>
            <div class="trk" style="top:420px;background:#1a1d29"><div style="position:absolute;left:12%;width:52%;top:5px;bottom:5px;border-radius:6px;background:#ff8fc7"></div></div>
            <div class="trk" style="top:464px;background:#1a1d29"><div style="position:absolute;left:0%;width:84%;top:5px;bottom:5px;border-radius:6px;background:#2fd38b88"></div></div>
            <div class="ph"></div></div></div>
        </div>
        <div class="logos"><small>Trusted by 40,000+ teams</small><div><span>Northwind</span><span>Globex</span><span>Initech</span><span>Umbrella</span><span>Hooli</span><span>Vandelay</span></div></div>
        <div class="feat"><h2>Everything you need to ship</h2><div class="sub2">From first draft to final render, in one place.</div>
          <div class="cards">${[
            ['AI scripting', 'Turn a prompt or a blog post into a shot-by-shot script in seconds.', '<path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z"/>'],
            ['Brand kits', 'Fonts, colours and logos applied automatically to every scene.', '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M4 12h16"/>'],
            ['One-click render', 'Export 4K, vertical and square cuts at the same time.', '<path d="M5 12l5 5 9-10"/>'],
          ].map((c, i) => `<div class="cd"><i style="background:${A}18">${icon(c[2], A, 26)}</i><h3>${c[0]}</h3><p>${c[1]}</p><div class="mini">${i === 0 ? '<div style="position:absolute;left:18px;top:18px;right:40%;height:12px;border-radius:6px;background:#dfe2ea"></div><div style="position:absolute;left:18px;top:42px;right:20%;height:12px;border-radius:6px;background:#dfe2ea"></div><div style="position:absolute;left:18px;top:66px;right:52%;height:12px;border-radius:6px;background:' + A + '55"></div>' : i === 1 ? ['#0f1220', A, '#ff8fc7', '#2fd38b'].map((col, k) => `<div style="position:absolute;top:44px;left:${22 + k * 78}px;width:60px;height:60px;border-radius:50%;background:${col}"></div>`).join('') : `<div style="position:absolute;left:18px;right:18px;top:62px;height:24px;border-radius:12px;background:#dfe2ea"><div style="width:72%;height:100%;border-radius:12px;background:${A}"></div></div>`}</div></div>`).join('')}</div></div>
        <div class="stats"><div><b>12M+</b><span>videos rendered</span></div><div><b style="color:${A}">4.9/5</b><span>average rating</span></div><div><b>38%</b><span>faster delivery</span></div></div>
        <div class="cta" style="background:radial-gradient(circle at 85% 20%,#ff8fc7aa,transparent 45%),linear-gradient(135deg,${A},#1b1e3a)"><h2>Start creating today</h2><p>Free for 14 days. No credit card required.</p><span class="btn">Create your first video →</span></div>
        <div class="ft"><span>© 2026 ${esc(p.brand || 'Acme')} Inc.</span><span class="sp"></span><span>Privacy</span><span>Terms</span><span>Status</span></div>
      </div>`;

    const el = document.createElement('div');
    el.className = 'bw';
    el.innerHTML = `
      ${p.showBackground ? `<div class="bg" style="background:${p.background}"><div class="glow" style="width:${W * 0.6}px;height:${W * 0.6}px;left:${W * 0.2}px;top:${H * 0.25}px;background:${A};opacity:.28"></div><div class="grid"></div></div>` : ''}
      <div class="persp" style="left:${(W - WW * fit) / 2}px;top:${(H - WH * fit) / 2 + (H > W ? 0 : H * 0.015)}px;width:${WW * fit}px;height:${WH * fit}px">
        <div class="scaler" style="position:absolute;left:0;top:0;transform:scale(${fit});transform-origin:0 0;width:${WW}px;height:${WH}px">
          <div class="win ${p.theme === 'dark' ? 'dark' : 'light'}">
            <div class="tabs"><div class="tl"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div>
              <div class="tab"><span class="fav" style="background:linear-gradient(135deg,${A},#ff6fb5)"></span><span class="tt"></span><span class="x">×</span></div><div class="tab2">+</div></div>
            <div class="toolbar"><div class="nav">${icon('<path d="M15 18l-6-6 6-6"/>')}${icon('<path d="M9 18l6-6-6-6"/>')}${icon('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>')}</div>
              <div class="addr"><span class="lock">${icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 'currentColor', 16)}</span><span class="ph">Search or enter website</span><span class="val"></span><span class="caret" style="background:${A}"></span></div>
              <div class="menu">${icon('<path d="M12 5v14M5 12h14"/>')}${icon('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>')}</div></div>
            <div class="load" style="background:${A}"></div>
            <div class="view"><div class="page">${shot ? `<img src="${esc(shot)}" alt="">` : site()}</div>
              <div class="skel"><b style="height:44px;width:100%;margin-bottom:60px"></b><b style="height:28px;width:22%;margin:0 auto 26px"></b><b style="height:84px;width:64%;margin:0 auto 22px"></b><b style="height:24px;width:46%;margin:0 auto 40px"></b><b style="height:340px;width:80%;margin:0 auto"></b></div>
            </div>
          </div>
        </div>
      </div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.tab .tt').textContent = p.tabTitle || p.url || '';
    const win = $('.win'), page = $('.page'), skel = $('.skel'), load = $('.load');
    const val = $('.addr .val'), ph = $('.addr .ph'), caret = $('.addr .caret');
    const skelBars = [...skel.querySelectorAll('b')];
    const playhead = $('.site .ph');

    // ---------- schedule ----------
    const out = Math.max(1.6, duration - 0.62);
    const k = Math.max(0.45, Math.min(1, (duration - 0.8) / 6.2)); // compress the intro on short clips
    const url = String(p.url || '');
    const tType0 = 0.5 * k, tType1 = tType0 + Math.min(1.0, url.length * 0.05) * k;
    const tEnter = tType1 + 0.15 * k;
    const tLoad1 = tEnter + 0.9 * k;
    const tPage = tEnter + 0.7 * k;
    const tScroll0 = tPage + 1.0 * k;
    const stops = String(p.scrollStops || '0').split(/[,;\s]+/).map(parseFloat).filter((v) => !isNaN(v)).map((v) => Math.max(0, Math.min(100, v)) / 100);
    if (!stops.length || stops[0] !== 0) stops.unshift(0);
    if (!shot) {
      // built-in site: snap intermediate stops to the nearest section top so pauses frame whole sections
      const maxS = Math.max(1, page.offsetHeight - VIEW_H);
      const secs = [...page.querySelectorAll('.logos, .feat, .stats, .cta')].map((s) => Math.min(1, (s.offsetTop - 24) / maxS));
      for (let i = 1; i < stops.length; i++) if (stops[i] > 0 && stops[i] < 1) stops[i] = secs.reduce((b, v) => (Math.abs(v - stops[i]) < Math.abs(b - stops[i]) ? v : b), secs[0]);
    }
    const moves = [];
    const availS = out - 0.35 - tScroll0;
    if (stops.length > 1 && availS > 0.6) {
      const dists = stops.slice(1).map((s, i) => Math.abs(s - stops[i]));
      const wts = dists.map((d) => 0.6 + Math.sqrt(d) * 1.6);
      const sumW = wts.reduce((a, b) => a + b, 0);
      const moveTotal = Math.min(availS * 0.62, wts.reduce((a, w) => a + Math.min(2.4, w * 1.2), 0));
      const pauseEach = (availS - moveTotal) / Math.max(1, stops.length - 1);
      let tt = tScroll0;
      dists.forEach((d, i) => {
        const md = (moveTotal * wts[i]) / sumW;
        moves.push({ t0: tt, t1: tt + md, a: stops[i], b: stops[i + 1] });
        tt += md + pauseEach;
      });
    }

    // ---------- GSAP: window entrance / exit, page content ----------
    gsap.set(win, { transformPerspective: 2200 });
    tl.fromTo(win, { y: 70, scale: 0.9, rotateX: p.tilt ? 16 : 0, opacity: 0 }, { y: 0, scale: 1, rotateX: 0, opacity: 1, duration: 1.1 * Math.max(0.7, k), ease: 'expo.out' }, 0.05)
      .fromTo(el.querySelectorAll('.bg .glow'), { opacity: 0, scale: 0.6 }, { opacity: 0.28, scale: 1, duration: 1.6, ease: 'power2.out' }, 0)
      .fromTo(skel, { opacity: 1 }, { opacity: 0, duration: 0.4, ease: 'power1.inOut' }, tPage)
      .fromTo(page, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, tPage);
    const an = el.querySelectorAll('.site .an');
    if (an.length) tl.fromTo(an, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.07 }, tPage + 0.05);
    tl.to(win, { y: -30, scale: 0.96, opacity: 0, duration: 0.5, ease: 'power2.in' }, out)
      .to(el.querySelectorAll('.bg .glow'), { opacity: 0, duration: 0.5, ease: 'power1.in' }, out + 0.05);

    const eIO = gsap.parseEase('sine.inOut'), eOut = gsap.parseEase('power2.out');
    const persp = $('.persp');
    return {
      render(t) {
        // URL typing + caret
        const n = Math.floor(studio.progress(t, tType0, Math.max(0.01, tType1 - tType0)) * url.length + 1e-6);
        val.textContent = url.slice(0, n);
        ph.style.display = n > 0 || t >= tType0 ? 'none' : '';
        const typing = t >= tType0 - 0.3 && t < tEnter + 0.05;
        caret.style.opacity = typing && (t < tType1 || Math.floor(t * 3) % 2 === 0) ? 1 : 0;
        // load bar
        const lq = studio.progress(t, tEnter, tLoad1 - tEnter);
        load.style.transform = `scaleX(${eOut(lq).toFixed(4)})`;
        load.style.opacity = t < tEnter ? 0 : 1 - studio.progress(t, tLoad1 - 0.1, 0.25);
        // skeleton shimmer
        skel.style.display = t > tPage + 0.45 ? 'none' : '';
        skelBars.forEach((b) => (b.style.opacity = studio.progress(t, tEnter, 0.25)));
        skelBars.forEach((b) => b.style.setProperty('--sh', `${(((t * 1.1) % 1) * 300 - 100).toFixed(1)}%`));
        // auto-scroll
        const maxScroll = Math.max(0, page.offsetHeight - VIEW_H);
        let s = 0;
        for (const m of moves) { if (t >= m.t1) { s = m.b; continue; } if (t >= m.t0) s = m.a + (m.b - m.a) * eIO((t - m.t0) / (m.t1 - m.t0)); else s = m.a; break; }
        page.style.transform = `translateY(${(-s * maxScroll).toFixed(2)}px)`;
        // hero playhead + gentle push (secondary motion)
        if (playhead) playhead.style.left = `${24 + (((t * 0.12) % 1) * 1100).toFixed(1)}px`;
        persp.style.transform = `scale(${(1 + 0.025 * studio.ease.inOutQuad(studio.progress(t, 0, duration))).toFixed(5)})`;
      },
    };
  },
});
