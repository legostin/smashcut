// Social handle cycler: disc pops, pill grows out of it, then the disc flips (rotateX) to the next platform
// while the handle slides up and the pill re-measures its width. Everything on ctx.tl.
studio.clip({
  duration: 7,
  setup(root, p, { tl, duration, width, height }) {
    const D = duration, W = width, H = height;
    const portrait = H / W > 1.2;
    const u = (Math.min(W, H) / 1080) * p.scale;
    const dark = p.theme !== 'light';
    const PL = {
      youtube: { bg: '#ff0033', icon: '<rect x="1.5" y="4.5" width="21" height="15" rx="4.6" fill="#fff"/><path d="M10 8.8v6.4l5.6-3.2z" fill="#ff0033"/>' },
      instagram: { bg: 'radial-gradient(circle at 30% 105%, #ffd776 0%, #f9873b 25%, #e1306c 55%, #a133c8 80%, #5851db 100%)', icon: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" fill="none" stroke="#fff" stroke-width="2.1"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="#fff" stroke-width="2.1"/><circle cx="17.3" cy="6.7" r="1.25" fill="#fff"/>' },
      tiktok: { bg: '#111111', icon: '<g transform="translate(.6 .4)"><path d="M14 2.5h3.2c.3 2.3 1.8 3.8 4.1 4v3.3c-1.6 0-3-.5-4.2-1.3v6.6a6.4 6.4 0 1 1-6.4-6.4h.6v3.4h-.5a3 3 0 1 0 3.2 3z" fill="#25f4ee" transform="translate(-.9 -.6)"/><path d="M14 2.5h3.2c.3 2.3 1.8 3.8 4.1 4v3.3c-1.6 0-3-.5-4.2-1.3v6.6a6.4 6.4 0 1 1-6.4-6.4h.6v3.4h-.5a3 3 0 1 0 3.2 3z" fill="#fe2c55" transform="translate(.9 .6)"/><path d="M14 2.5h3.2c.3 2.3 1.8 3.8 4.1 4v3.3c-1.6 0-3-.5-4.2-1.3v6.6a6.4 6.4 0 1 1-6.4-6.4h.6v3.4h-.5a3 3 0 1 0 3.2 3z" fill="#fff"/></g>' },
      x: { bg: '#000000', icon: '<path fill="#fff" transform="translate(1.5 1.5) scale(.875)" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>' },
      telegram: { bg: '#229ed9', icon: '<path d="M2.6 11.3l17.6-6.9c.8-.3 1.6.4 1.4 1.3l-3 14.2c-.2.9-1.2 1.2-1.9.7l-4.6-3.4-2.3 2.2c-.3.3-.8.1-.8-.3l.1-3.3 8.1-7.4c.3-.3-.1-.6-.4-.4L7 13.9l-4.3-1.3c-.9-.3-.9-1.1-.1-1.3z" fill="#fff"/>' },
      twitch: { bg: '#9146ff', icon: '<path d="M4.8 2.5L3 7v13h4.6v2.5h2.6L12.7 20h3.7L21 15.4V2.5zm14.3 12l-2.7 2.7h-4.2l-2.4 2.4v-2.4H6.3V4.4h12.8z" fill="#fff"/><path d="M11 7.5v5M15.4 7.5v5" stroke="#fff" stroke-width="2"/>' },
      linkedin: { bg: '#0a66c2', icon: '<text x="12" y="18.2" text-anchor="middle" font-family="Inter" font-weight="800" font-size="17" fill="#fff" letter-spacing="-.5">in</text>' },
      facebook: { bg: '#1877f2', icon: '<path d="M13.4 21.5v-8h2.7l.4-3.2h-3.1V8.3c0-.9.3-1.6 1.6-1.6h1.7V3.9c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4v3.2h2.7v8z" fill="#fff"/>' },
      vk: { bg: '#0077ff', icon: '<text x="12" y="16.6" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12.5" fill="#fff" letter-spacing="-.3">VK</text>' },
      threads: { bg: '#000000', icon: '<text x="12" y="18.4" text-anchor="middle" font-family="Inter" font-weight="800" font-size="20" fill="#fff">@</text>' },
      web: { bg: '#3d5afe', icon: '<g fill="none" stroke="#fff" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></g>' },
    };
    const alias = { yt: 'youtube', ig: 'instagram', insta: 'instagram', tg: 'telegram', twitter: 'x', fb: 'facebook', vkontakte: 'vk', site: 'web', website: 'web', www: 'web' };
    const list = String(p.handles || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^([a-zA-Z]+)\s*:\s*(.+)$/);
      let plat = m ? m[1].toLowerCase() : 'web';
      plat = alias[plat] || plat;
      if (!PL[plat]) plat = 'web';
      const [hn, fl] = (m ? m[2] : l).split('|').map((s) => s.trim());
      return { plat, hn, fl: p.showFollowers ? fl || '' : '' };
    });
    if (!list.length) list.push({ plat: 'youtube', hn: '@channel', fl: '' });

    // ---- DOM ----
    const right = p.position.endsWith('right'), top = p.position.startsWith('top');
    const h = 84 * u;
    const el = document.createElement('div');
    el.className = 'sh' + (right ? ' right' : '');
    el.style.cssText = `--u:${u};--h:${h}px;--plate:${dark ? 'rgba(16,16,20,.94)' : 'rgba(255,255,255,.97)'};--edge:${dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.06)'};--fg:${dark ? '#fff' : '#111'};--muted:${dark ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.55)'}`;
    const mx = (portrait ? 64 : 96) * (u / p.scale), my = portrait ? H * 0.2 : 92 * (u / p.scale);
    el.style[right ? 'right' : 'left'] = mx + 'px';
    el.style[top ? 'top' : 'bottom'] = (top ? (portrait ? H * 0.1 : 80 * (u / p.scale)) : my) + 'px';
    el.style.height = h + 'px';
    el.style.width = '1px';
    el.innerHTML = `<div class="pill"></div><div class="txt"></div>
      <div class="disc"><div class="face">${list.map((x) => `<div class="bgl" style="background:${PL[x.plat].bg}"></div>`).join('')}</div>${list.map((x) => `<svg viewBox="0 0 24 24">${PL[x.plat].icon}</svg>`).join('')}</div>`;
    root.appendChild(el);
    const pill = el.querySelector('.pill'), txt = el.querySelector('.txt'), disc = el.querySelector('.disc');
    const bgs = [...el.querySelectorAll('.bgl')], icons = [...disc.querySelectorAll('svg')];
    const side = right ? 'right' : 'left';
    pill.style[side] = 0; disc.style[side] = 0;
    const padL = h + 20 * u, padR = 34 * u;
    txt.style[side] = padL + 'px';
    const items = list.map((x) => {
      const it = document.createElement('div');
      it.className = 'item';
      it.innerHTML = `<div class="hn"></div>${x.fl ? '<div class="fl"></div>' : ''}`;
      it.querySelector('.hn').textContent = x.hn;
      if (x.fl) it.querySelector('.fl').textContent = x.fl;
      txt.appendChild(it);
      return it;
    });
    const tw = items.map((it) => it.offsetWidth);
    txt.style.width = Math.max(...tw) + 'px';
    const pw = tw.map((w) => padL + w + padR);

    // ---- schedule ----
    const n = list.length;
    const tIn = 0.1, xo = D - 0.75;
    const last = xo - 0.55; // latest moment a switch may start
    // first switch after the intro has read; pulled earlier on short clips so every handle gets shown
    const first = Math.min(tIn + 1.1 + Math.max(0, p.cycleDuration - 1.1), Math.max(0.95, last - (n - 1) * 0.9));
    const cyc = n > 1 ? Math.max(0.9, Math.min(p.cycleDuration, (last - first) / (n - 1) || p.cycleDuration)) : Infinity;
    const switches = [];
    if (n > 1) for (let c = first, i = 1; c <= last + 1e-6; c += cyc, i++) switches.push({ t: c, i: i % n });

    // ---- timeline ----
    tl.set(items, { yPercent: 110 }, 0)
      .set([...bgs, ...icons], { opacity: 0 }, 0)
      .set([bgs[0], icons[0]], { opacity: 1 }, 0)
      .set(pill, { width: h }, 0)
      .fromTo(disc, { scale: 0, rotate: right ? 90 : -90 }, { scale: 1, rotate: 0, duration: 0.55, ease: 'back.out(2.2)' }, tIn)
      .fromTo(pill, { opacity: 0 }, { opacity: 1, duration: 0.15 }, tIn + 0.2)
      .to(pill, { width: pw[0], duration: 0.75, ease: 'expo.out' }, tIn + 0.25)
      .to(items[0], { yPercent: 0, duration: 0.65, ease: 'expo.out' }, tIn + 0.38);
    const fl0 = items[0].querySelector('.fl');
    if (fl0) tl.from(fl0, { opacity: 0, x: (right ? 10 : -10) * u, duration: 0.5, ease: 'power3.out' }, tIn + 0.55);
    let cur = 0;
    for (const s of switches) {
      const c = s.t, nx = s.i;
      tl.to(disc, { rotationX: 90, duration: 0.17, ease: 'power2.in' }, c)
        .set([bgs[cur], icons[cur]], { opacity: 0 }, c + 0.17)
        .set([bgs[nx], icons[nx]], { opacity: 1 }, c + 0.17)
        .fromTo(disc, { rotationX: -90 }, { rotationX: 0, duration: 0.42, ease: 'back.out(1.8)', immediateRender: false }, c + 0.17)
        .to(items[cur], { yPercent: -110, duration: 0.32, ease: 'power3.in' }, c)
        .fromTo(items[nx], { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'expo.out', immediateRender: false }, c + 0.2)
        .to(pill, { width: pw[nx], duration: 0.6, ease: 'power3.inOut' }, c + 0.06);
      cur = nx;
    }
    // exit: text out, pill collapses into the disc, disc pops away
    tl.to(items[cur], { yPercent: -110, duration: 0.3, ease: 'power2.in' }, xo)
      .to(pill, { width: h, duration: 0.42, ease: 'power3.in' }, xo + 0.1)
      .to(pill, { opacity: 0, duration: 0.1 }, xo + 0.45)
      .to(disc, { scale: 0, rotate: right ? -90 : 90, duration: 0.3, ease: 'back.in(2)' }, xo + 0.42);
  },
});
