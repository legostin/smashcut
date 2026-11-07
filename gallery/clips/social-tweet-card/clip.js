// Animated social post card (X / Threads / Bluesky / Reddit look): rise-in, word reveal, metric count-up, like pop.
// Entrance/exit on ctx.tl; counters, like burst and idle drift computed in render(t).
studio.clip({
  duration: 6,
  async setup(root, p, { tl, duration, width, height }) {
    const D = duration, W = width, H = height;
    const u = Math.min(W, H) / 1080;
    const E = studio.ease;
    const P = p.platform;
    const k = Math.min(1, Math.max(0.5, (D - 0.7) / 3.6)); // compress the build on short clips
    const T = (x) => x * k;
    const ACC = { x: '#1d9bf0', threads: '#0095f6', bluesky: '#1083fe', reddit: '#ff4500' }[P] || '#1d9bf0';
    const LIKE = { x: '#f91880', threads: '#ff3040', bluesky: '#ec4899', reddit: '#ff4500' }[P] || '#f91880';
    const fg = p.theme === 'light' ? '#0f1419' : '#e7e9ea';

    // ---- icons ----
    const I = {
      reply: '<path d="M4 4.5h16a1.8 1.8 0 0 1 1.8 1.8v9.4a1.8 1.8 0 0 1-1.8 1.8h-9.2L6 21.2v-3.7H4a1.8 1.8 0 0 1-1.8-1.8V6.3A1.8 1.8 0 0 1 4 4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
      repost: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.5l3.5 3.5L17 9.5"/><path d="M20.5 6H8.5a4.5 4.5 0 0 0-4.5 4.5v1"/><path d="M7 21.5L3.5 18 7 14.5"/><path d="M3.5 18h12a4.5 4.5 0 0 0 4.5-4.5v-1"/></g>',
      heart: '<path class="hp" d="M12 20.6s-7.6-4.7-9.3-9.5C1.6 7.9 3.6 4.4 7.1 4.4c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.5 3.5 4.4 6.7-1.7 4.8-9.3 9.5-9.3 9.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
      views: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20v-7M11 20V5M17 20v-10"/></g>',
      share: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M21 3L2.8 10.4l7.3 2.6 2.7 7.4z"/><path d="M21 3l-10.9 10"/></g>',
      up: '<path class="hp" d="M12 3.5l7.5 8.5h-4.6v8.5H9.1V12H4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
      down: '<path d="M12 20.5l7.5-8.5h-4.6V3.5H9.1V12H4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    };
    const svg = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}">${inner}</svg>`;
    const LOGO = {
      x: `<path fill="${fg}" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>`,
      threads: `<text x="12" y="18.5" text-anchor="middle" font-family="Inter" font-weight="800" font-size="21" fill="${fg}">@</text>`,
      bluesky: `<path fill="#1083fe" d="M12 11.1C10.7 8.5 7 3.6 4 2.6 2.5 2.1 2 3.3 2 4.4c0 1 .6 6.1 1 7.1 1.1 3.2 4.5 3.6 7.2 3.1-4.2.8-6.3 3.3-2.9 6 3.4 2.6 5.2-.6 4.7-2.6.5 2 1.3 5.2 4.7 2.6 3.4-2.7 1.3-5.2-2.9-6 2.7.5 6.1.1 7.2-3.1.4-1 1-6.1 1-7.1 0-1.1-.5-2.3-2-1.8-3 1-6.7 5.9-8 8.5z"/>`,
      reddit: `<circle cx="12" cy="12" r="11" fill="#ff4500"/><ellipse cx="12" cy="14" rx="6.4" ry="4.3" fill="#fff"/><circle cx="9.6" cy="13.6" r="1" fill="#ff4500"/><circle cx="14.4" cy="13.6" r="1" fill="#ff4500"/><circle cx="17.2" cy="9.6" r="1.4" fill="#fff"/><circle cx="6.8" cy="9.6" r="1.4" fill="#fff"/><circle cx="15.6" cy="5" r="1.3" fill="#fff"/><path d="M12 9.8l1.1-4.6 2.5.6" stroke="#fff" stroke-width=".9" fill="none"/>`,
    }[P];
    // scalloped verified badge
    let bp = '';
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 9.6 : 11.2; bp += `${i ? 'L' : 'M'}${(12 + r * Math.sin(a)).toFixed(2)} ${(12 - r * Math.cos(a)).toFixed(2)}`; }
    const BADGE = `<path d="${bp}Z" fill="${ACC}" stroke="${ACC}" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`;

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = `tc ${p.theme} ${P}`;
    el.style.cssText = `--u:${u * p.scale};--accent:${ACC}`;
    root.appendChild(el);
    const txt = String(p.text || '');
    const fsBody = txt.length > 220 ? 34 : txt.length > 140 ? 37 : 41;
    const cardW = Math.min(900 * u * p.scale, W * 0.88);
    el.innerHTML = `
      <div class="wrap"><div class="card" style="width:${cardW}px;--fs:${fsBody}">
        <div class="hd">
          <div class="av" style="background:${P === 'reddit' ? '#ff4500' : `linear-gradient(140deg, ${p.avatarColor}, color-mix(in srgb, ${p.avatarColor} 55%, #6b2bff))`}"></div>
          <div class="who"><div class="nmr"><div class="nm"></div>${p.verified ? `<svg class="badge" viewBox="0 0 24 24">${BADGE}</svg>` : ''}</div><div class="hn"></div></div>
          <svg class="logo" viewBox="0 0 24 24">${LOGO}</svg>
        </div>
        <div class="body"></div>
        <div class="ts"></div>
        <div class="mt"></div>
      </div></div>`;
    const $ = (s) => el.querySelector(s);
    const card = $('.card');
    $('.av').textContent = P === 'reddit' ? 'r/' : (p.initials || '').slice(0, 2);
    $('.nm').textContent = p.name;
    $('.hn').textContent = P === 'reddit' ? `${p.handle} · ${p.timestamp}` : p.handle;
    $('.ts').textContent = p.timestamp;
    // body words (#tags / @mentions / links in accent); Reddit: first line is the bold title
    const body = $('.body');
    const words = [];
    txt.split('\n').forEach((line, li, arr) => {
      const blk = document.createElement('div');
      if (P === 'reddit' && li === 0 && arr.length > 1) blk.className = 'ttl';
      if (li > 0) blk.style.marginTop = 0.35 + 'em';
      line.split(/\s+/).filter(Boolean).forEach((w, i, a) => {
        const s = document.createElement('span');
        s.className = 'w' + (/^[#@]\S|^https?:\/\//.test(w) ? ' tag' : '');
        s.style.display = 'inline-block';
        s.textContent = w;
        blk.appendChild(s);
        if (i < a.length - 1) blk.appendChild(document.createTextNode(' '));
        words.push(s);
      });
      body.appendChild(blk);
    });
    // metrics
    const fmt = new Intl.NumberFormat(p.locale === 'ru' ? 'ru-RU' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 });
    const f = (n) => (n < 1000 ? String(Math.round(n)) : fmt.format(n));
    const mt = $('.mt');
    const defs = P === 'reddit'
      ? [{ k: 'likes', icon: 'up', like: true, extra: svg(I.down) }, { k: 'replies', icon: 'reply' }, { k: null, icon: 'share', label: p.locale === 'ru' ? 'Поделиться' : 'Share' }]
      : P === 'threads'
        ? [{ k: 'likes', icon: 'heart', like: true }, { k: 'replies', icon: 'reply' }, { k: 'reposts', icon: 'repost' }, { k: null, icon: 'share', label: '' }]
        : [{ k: 'replies', icon: 'reply' }, { k: 'reposts', icon: 'repost' }, { k: 'likes', icon: 'heart', like: true }, { k: 'views', icon: 'views' }];
    const rnd = studio.random(11);
    const metrics = defs.map((d) => {
      const m = document.createElement('div');
      m.className = 'm' + (d.like ? ' like' : '');
      const parts = d.like ? Array.from({ length: 6 }, (_, i) => `<i class="p" style="background:${i % 2 ? LIKE : ACC}"></i>`).join('') + '<i class="ring"></i>' : '';
      m.innerHTML = `<span class="ic">${svg(I[d.icon])}${parts}</span><span class="v"></span>${d.extra || ''}`;
      if (d.like) m.querySelector('.ring').style.borderColor = LIKE;
      m.querySelector('.v').textContent = d.k ? f(p[d.k]) : d.label;
      mt.appendChild(m);
      return { el: m, v: m.querySelector('.v'), d, target: d.k ? Number(p[d.k]) || 0 : null, ps: [...m.querySelectorAll('.p')].map(() => ({ a: rnd() * Math.PI * 2, r: 30 + rnd() * 22 })) };
    });
    // reserve width for the final value so the row never reflows while counting
    metrics.forEach((m) => { m.v.style.minWidth = m.v.offsetWidth + 'px'; });

    // ---- place & fit ----
    let cw = card.offsetWidth, ch = card.offsetHeight;
    const maxH = H * 0.86;
    const fit = ch > maxH ? maxH / ch : 1;
    const cx = p.position === 'left' ? W * 0.07 + (cw * fit) / 2 : p.position === 'right' ? W * 0.93 - (cw * fit) / 2 : W / 2;
    card.style.left = cx - cw / 2 + 'px';
    card.style.top = H / 2 - ch / 2 + 'px';

    // ---- timeline ----
    const xo = D - 0.5;
    tl.fromTo(card, { y: 60 * u, opacity: 0, scale: 0.96 * fit }, { y: 0, opacity: 1, scale: fit, duration: 0.75, ease: 'expo.out' }, 0.05)
      .from($('.av'), { scale: 0.4, opacity: 0, duration: 0.55, ease: 'back.out(2)' }, 0.18)
      .from([$('.nmr'), $('.hn')], { x: -18 * u, opacity: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, 0.24)
      .from($('.logo'), { scale: 0.5, rotate: -20, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, 0.3)
      .from(words, { opacity: 0, y: 14 * u, filter: 'blur(6px)', duration: 0.45, ease: 'power3.out', stagger: Math.min(0.03, T(1.3) / Math.max(1, words.length)) }, T(0.42))
      .from($('.ts'), { opacity: 0, duration: 0.4 }, T(1.2))
      .from(metrics.map((m) => m.el), { opacity: 0, y: 10 * u, duration: 0.45, ease: 'power3.out', stagger: 0.06 }, T(1.3))
      .to(card, { y: 50 * u, opacity: 0, scale: 0.97 * fit, duration: 0.45, ease: 'power2.in' }, xo);
    const cs = T(1.35), tLike = cs + T(1.25);
    const wrap = $('.wrap');

    return {
      render(t) {
        // count up
        metrics.forEach((m, i) => {
          if (m.target == null) return;
          const q = E.outExpo(studio.progress(t, cs + i * 0.08, 1.2));
          m.v.textContent = f(m.target * q);
        });
        // like pop: heart fills, scales 1→1.4→1, ring + 6 seeded particles burst
        const lm = metrics.find((m) => m.d.like);
        if (lm && p.likePop) {
          const on = t >= tLike;
          const hp = lm.el.querySelector('.hp');
          hp.setAttribute('fill', on ? LIKE : 'none');
          hp.setAttribute('stroke', on ? LIKE : 'currentColor');
          lm.v.style.color = on ? LIKE : '';
          const a = studio.progress(t, tLike, 0.12), b = studio.progress(t, tLike + 0.12, 0.35);
          const s = t < tLike ? 1 : a < 1 ? 1 + 0.4 * E.outQuad(a) : 1.4 - 0.4 * E.outElastic(b);
          lm.el.querySelector('svg').style.transform = `scale(${s})`;
          const ring = lm.el.querySelector('.ring');
          const rq = studio.progress(t, tLike, 0.45);
          ring.style.opacity = on ? (1 - rq) * 0.9 : 0;
          ring.style.transform = `scale(${0.3 + 1.3 * E.outCubic(rq)})`;
          ring.style.borderWidth = `${(1 - rq) * 4 * u * p.scale + 0.5}px`;
          lm.el.querySelectorAll('.p').forEach((pe, i) => {
            const q = studio.progress(t, tLike + 0.04, 0.55);
            const pr = lm.ps[i];
            const d = pr.r * u * p.scale * E.outCubic(q);
            pe.style.opacity = on && q < 1 ? 1 - q * q : 0;
            pe.style.transform = `translate(${Math.cos(pr.a) * d}px, ${Math.sin(pr.a) * d}px) scale(${1 - 0.6 * q})`;
          });
        }
        // idle drift
        const settle = studio.progress(t, 0.8, 1);
        wrap.style.transform = `translateY(${Math.sin(t * 1.1) * 4 * u * settle}px)`;
      },
    };
  },
});
