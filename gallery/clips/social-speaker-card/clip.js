// Speaker announcement: editorial bento grid (16:9 and 9:16 composed separately), cells clip-reveal in sequence,
// line-mask name, arch-masked photo with slow push, rotating sticker; cells collapse in reverse at the end.
gsap.registerPlugin(SplitText);
studio.clip({
  duration: 7,
  async setup(root, p, { tl, duration, width, height }) {
    const D = duration, W = width, H = height;
    const u = Math.min(W, H) / 1080;
    const portrait = H / W > 1.2;
    const k = Math.min(1, Math.max(0.5, (D - 1.2) / 3)); // compress the build on short clips
    const T = (x) => x * k;
    const PAL = {
      ink: { bg: '#0d0d0f', cell: '#18181c', fg: '#f4f4f0', accent: '#d4ff3a', ph: '#26262c' },
      paper: { bg: '#e9e2d4', cell: '#f8f4ec', fg: '#141414', accent: '#ff4f1f', ph: '#d8cdb9' },
      cobalt: { bg: '#0a1db0', cell: '#1530d0', fg: '#ffffff', accent: '#ffd23f', ph: '#2742e6' },
    }[p.palette] || {};
    const accent = p.accent && p.accent.toLowerCase() !== '#d4ff3a' ? p.accent : PAL.accent;
    const lum = (hex) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    const onAccent = lum(accent) > 0.6 ? '#0d0d0f' : '#ffffff';

    // ---- grid ----
    const M = (portrait ? 54 : 64) * u, G = 18 * u;
    const X0 = M, Y0 = M, X1 = W - M, Y1 = H - M, TW = X1 - X0, TH = Y1 - Y0;
    const R = {};
    if (!portrait) {
      const pw = Math.min(TH * 0.66, TW * 0.36);
      R.A = { x: X0, y: Y0, w: pw, h: TH };
      const rx = X0 + pw + G, rw = X1 - rx;
      R.B = { x: rx, y: Y0, w: rw, h: TH * 0.53 };
      const y2 = R.B.y + R.B.h + G, h2 = Y1 - y2;
      R.C = { x: rx, y: y2, w: (rw - G) * 0.57, h: h2 };
      R.D = { x: rx + R.C.w + G, y: y2, w: rw - R.C.w - G, h: (h2 - G) * 0.58 };
      R.E = { x: R.D.x, y: R.D.y + R.D.h + G, w: R.D.w, h: h2 - R.D.h - G };
    } else {
      // 9:16 is composed separately: photo + date/event column on top, name and talk full-width below
      const aw = (TW - G) * 0.57, ah = TH * 0.4;
      R.A = { x: X0, y: Y0, w: aw, h: ah };
      R.D = { x: X0 + aw + G, y: Y0, w: TW - aw - G, h: (ah - G) * 0.56 };
      R.E = { x: R.D.x, y: R.D.y + R.D.h + G, w: R.D.w, h: ah - R.D.h - G };
      R.B = { x: X0, y: Y0 + ah + G, w: TW, h: TH * 0.27 };
      R.C = { x: X0, y: R.B.y + R.B.h + G, w: TW, h: Y1 - (R.B.y + R.B.h + G) };
    }

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = 'sk';
    el.style.cssText = `--u:${u};--bg:${PAL.bg};--cell:${PAL.cell};--fg:${PAL.fg};--accent:${accent};--onAccent:${onAccent};--ph:${PAL.ph}`;
    root.appendChild(el);
    const box = (r) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    const ins = 26 * u;
    const ph = { x: ins, y: ins, w: R.A.w - ins * 2, h: R.A.h - ins * 2 };
    const silhouette = `<svg viewBox="0 0 100 ${(100 * ph.h) / ph.w}" preserveAspectRatio="xMidYMax slice">
        <defs><radialGradient id="skg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="${accent}" stop-opacity=".55"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
        <rect width="100" height="400" fill="url(#skg)"/>
        <g fill="${PAL.fg}" opacity=".14" transform="translate(50 ${(100 * ph.h) / ph.w}) scale(1.5) translate(-50 -100)"><circle cx="50" cy="44" r="17"/><path d="M12 100c2-22 18-35 38-35s36 13 38 35z"/></g></svg>`;
    el.innerHTML = `
      <div class="cell A" style="${box(R.A)}">
        <div class="photo" style="left:${ph.x}px;top:${ph.y}px;width:${ph.w}px;height:${ph.h}px"><div class="img"></div></div>
      </div>
      <div class="cell B" style="${box(R.B)}"><div class="inner" style="justify-content:space-between">
        <div><span class="chip line eb"><i></i><span></span></span></div>
        <div><div class="nm"></div><div class="role" style="margin-top:${18 * u}px"></div></div></div></div>
      <div class="cell C" style="${box(R.C)}"><div class="inner" style="justify-content:space-between">
        <div class="lbl tl"></div><div class="ttl"></div></div></div>
      <div class="cell D acc" style="${box(R.D)}"><div class="inner" style="justify-content:space-between">
        <div class="big"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:${14 * u}px"><div class="sm wd" style="opacity:.8"></div><span class="chip line tm"></span></div></div></div>
      <div class="cell E" style="${box(R.E)}"><div class="inner" style="justify-content:center;gap:${10 * u}px;inset:${26 * u}px ${44 * u}px">
        <div class="ev"></div><div class="sm loc"></div></div></div>
      ${p.badge ? `<div class="sticker"><svg viewBox="-100 -100 200 200"><circle r="96" fill="${accent}"/><circle r="64" fill="none" stroke="${onAccent}" stroke-opacity=".35" stroke-width="2"/>
        <path id="skc" d="M0,-78 a78,78 0 1,1 -0.01,0" fill="none"/><text class="stx" font-family="Manrope" font-weight="800" font-size="19" letter-spacing="3" fill="${onAccent}"><textPath href="#skc"></textPath></text>
        <path d="M-14 0h28M0 -14v28" stroke="${onAccent}" stroke-width="5" stroke-linecap="round"/></svg></div>` : ''}`;
    const $ = (s) => el.querySelector(s);
    const img = $('.img');
    if (p.photo) img.style.backgroundImage = `url("${String(p.photo).replace(/"/g, '')}")`;
    else img.innerHTML = silhouette;
    $('.eb span').textContent = p.eyebrow;
    const nameWords = String(p.name || '').trim().split(/\s+/);
    const nm = $('.nm');
    nm.innerHTML = '';
    [nameWords[0] || '', nameWords.slice(1).join(' ')].filter(Boolean).forEach((line) => { const d = document.createElement('div'); d.textContent = line; nm.appendChild(d); });
    $('.role').textContent = p.role;
    $('.tl').textContent = p.talkLabel;
    $('.ttl').textContent = p.talkTitle;
    $('.big').textContent = p.date;
    $('.wd').textContent = p.weekday;
    $('.tm').textContent = p.time;
    $('.ev').textContent = p.event;
    $('.loc').textContent = p.location;
    if (p.badge) {
      const one = String(p.badge).toUpperCase() + '  •  ';
      const reps = Math.max(1, Math.round(490 / (one.length * 13.2)));
      $('.stx textPath').textContent = one.repeat(reps);
      const st = $('.sticker');
      const sd = (portrait ? 230 : 210) * u;
      st.style.width = st.style.height = sd + 'px';
      const sx = portrait ? R.A.x + R.A.w - sd * 0.62 : R.A.x + R.A.w - sd * 0.5;
      const sy = portrait ? R.A.y + R.A.h - sd * 0.62 : R.A.y + R.A.h * 0.64;
      st.style.left = sx - sd / 2 + 'px'; st.style.top = sy - sd / 2 + 'px';
      // auto-fit the ring text to the circumference
      const tx = $('.stx'), len = tx.getComputedTextLength(), C = 2 * Math.PI * 78;
      if (len > 0) tx.setAttribute('font-size', Math.min(22, (19 * C) / len * 0.985));
    }
    // ---- fit text into the cells ----
    const fitW = (node, maxW, base) => { const w = Math.max(...[...node.children].map((c) => c.scrollWidth), node.scrollWidth); if (w > maxW) node.style.fontSize = (base * maxW) / w + 'px'; };
    const innerW = (r) => r.w - 88 * u;
    nm.style.fontSize = (portrait ? 116 : 112) * u + 'px';
    [...nm.children].forEach((c) => (c.style.whiteSpace = 'nowrap'));
    fitW(nm, innerW(R.B), (portrait ? 116 : 112) * u);
    const big = $('.big');
    big.style.whiteSpace = 'nowrap';
    big.style.fontSize = (portrait ? 72 : 80) * u + 'px';
    fitW(big, innerW(R.D), (portrait ? 72 : 80) * u);
    const ttl = $('.ttl'), cInner = $('.C .inner');
    let tfs = (portrait ? 68 : 52) * u;
    ttl.style.fontSize = tfs + 'px';
    const tlab = $('.tl');
    for (let i = 0; i < 10 && tlab.offsetHeight + ttl.offsetHeight + 24 * u > cInner.clientHeight; i++) { tfs *= 0.92; ttl.style.fontSize = tfs + 'px'; }
    const ev = $('.ev');
    fitW(ev, innerW(R.E), 32 * u);

    // ---- timeline ----
    const RR = 30 * u;
    const ci = (a, b, c, d) => `inset(${a}% ${b}% ${c}% ${d}% round ${RR}px)`;
    const cells = ['A', 'B', 'C', 'D', 'E'].map((c) => $('.cell.' + c));
    const from = [ci(100, 0, 0, 0), ci(0, 100, 0, 0), ci(100, 0, 0, 0), ci(0, 0, 0, 100), ci(0, 0, 100, 0)];
    const at = (i) => T(0.1 + i * 0.09);
    cells.forEach((c, i) => tl.fromTo(c, { clipPath: from[i] }, { clipPath: ci(0, 0, 0, 0), duration: 1.0, ease: 'expo.out' }, at(i)));
    tl.fromTo(img, { scale: 1.18 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, at(0));
    const nameSplit = new SplitText(nm.children, { type: 'lines', mask: 'lines' });
    tl.from(nameSplit.lines, { yPercent: 105, duration: 0.95, ease: 'expo.out', stagger: 0.09 }, at(1) + 0.22)
      .from($('.role'), { y: 20 * u, opacity: 0, duration: 0.7, ease: 'power3.out' }, at(1) + 0.45)
      .from($('.eb'), { x: 50 * u, opacity: 0, duration: 0.7, ease: 'expo.out' }, at(1) + 0.3);
    const ttlSplit = new SplitText(ttl, { type: 'lines', mask: 'lines' });
    tl.from($('.tl'), { y: 14 * u, opacity: 0, duration: 0.6, ease: 'power3.out' }, at(2) + 0.25)
      .from(ttlSplit.lines, { yPercent: 105, duration: 0.85, ease: 'expo.out', stagger: 0.07 }, at(2) + 0.28);
    const bigSplit = new SplitText(big, { type: 'lines', mask: 'lines' });
    tl.from(bigSplit.lines, { yPercent: 105, duration: 0.85, ease: 'expo.out' }, at(3) + 0.25)
      .from($('.wd'), { y: 12 * u, opacity: 0, duration: 0.6, ease: 'power3.out' }, at(3) + 0.4)
      .from($('.tm'), { x: 50 * u, opacity: 0, duration: 0.7, ease: 'expo.out' }, at(3) + 0.42)
      .from([$('.ev'), $('.loc')], { x: 40 * u, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07 }, at(4) + 0.3);
    const st = $('.sticker');
    if (st) tl.fromTo(st, { scale: 0, rotate: -40 }, { scale: 1, rotate: 0, duration: 0.8, ease: 'back.out(1.7)' }, at(4) + 0.35);
    // exit: sticker pops off, cells collapse upward in reverse order
    const xo = D - 0.78;
    if (st) tl.to(st, { scale: 0, duration: 0.3, ease: 'back.in(2)' }, xo - 0.05);
    [...cells].reverse().forEach((c, i) => tl.to(c, { clipPath: ci(0, 0, 100, 0), duration: 0.5, ease: 'power3.in' }, xo + i * 0.05));
    const stSvg = st && st.querySelector('svg');

    return {
      render(t) {
        if (stSvg) stSvg.style.transform = `rotate(${t * 14}deg)`;
        // slow push on the photo during the hold
        const hold = studio.progress(t, at(0) + 1.2, Math.max(1, D - at(0) - 2));
        $('.photo').style.transform = `scale(${1 + 0.035 * studio.ease.inOutQuad(hold)})`;
      },
    };
  },
});
