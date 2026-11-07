// YouTube end screen: headline, video / playlist slots, drawn subscribe ring, optional transparent holes.
// Background + entrance on ctx.tl; slots (frame + mask hole) and idle float are computed in render(t).
gsap.registerPlugin(SplitText, DrawSVGPlugin);
studio.clip({
  duration: 10,
  async setup(root, p, { tl, duration, width, height }) {
    const D = duration, W = width, H = height;
    const u = Math.min(W, H) / 1080;
    const portrait = H / W > 1.2;
    const E = studio.ease;
    const holes = p.holes && p.background !== 'transparent';
    const mode = p.layout.startsWith('1') ? 'one' : p.layout.startsWith('video') ? 'playlist' : 'two';
    const k = Math.min(1, Math.max(0.55, (D - 0.8) / 2.6)); // compress the entrance on short clips
    const T = (x) => x * k;

    // ---- layout (px in project space) ----
    const slots = [];
    let sub; // { cx, cy, d, labelSide: 'right' | 'below' }
    let headY;
    if (!portrait) {
      headY = H * 0.105;
      if (mode === 'one') {
        const sw = Math.min(W * 0.47, 900 * u), sh = (sw * 9) / 16;
        slots.push({ x: W * 0.09, y: H * 0.29, w: sw, h: sh, label: p.label1 });
        sub = { cx: W * 0.09 + sw + (W * 0.91 - (W * 0.09 + sw)) / 2, cy: H * 0.29 + sh / 2 - 30 * u, d: 250 * u, side: 'below' };
      } else {
        const sw = Math.min(W * 0.335, 640 * u), sh = (sw * 9) / 16, gap = W * 0.045;
        slots.push({ x: W / 2 - gap / 2 - sw, y: H * 0.26, w: sw, h: sh, label: p.label1 });
        slots.push({ x: W / 2 + gap / 2, y: H * 0.26, w: sw, h: sh, label: p.label2, playlist: mode === 'playlist' });
        sub = { cx: W / 2, cy: H * 0.805, d: 190 * u, side: 'right' };
      }
    } else {
      headY = H * 0.12;
      const sw = W * 0.8, sh = (sw * 9) / 16;
      if (mode === 'one') {
        slots.push({ x: (W - sw) / 2, y: H * 0.27, w: sw, h: sh, label: p.label1 });
        sub = { cx: W / 2, cy: H * 0.27 + sh + 330 * u, d: 260 * u, side: 'below' };
      } else {
        slots.push({ x: (W - sw) / 2, y: H * 0.22, w: sw, h: sh, label: p.label1 });
        slots.push({ x: (W - sw) / 2, y: H * 0.22 + sh + 130 * u, w: sw, h: sh, label: p.label2, playlist: mode === 'playlist' });
        sub = { cx: W / 2 - 150 * u, cy: H * 0.22 + 2 * sh + 130 * u + 250 * u, d: 210 * u, side: "right" };
      }
    }

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = 'es';
    el.style.cssText = `--u:${u};--accent:${p.accent}`;
    root.appendChild(el);

    // background (svg so the slot holes can be masked out of it)
    let bg = null;
    if (p.background !== 'transparent') {
      const grad = p.background === 'gradient'
        ? `<linearGradient id="esg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient>`
        : `<radialGradient id="esg" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="${p.bg1}" stop-opacity="1"/><stop offset="1" stop-color="#000"/></radialGradient>`;
      const holeEls = holes ? slots.map((s, i) => `<rect class="hole" data-i="${i}" fill="#000" rx="${20 * u}"/>`).join('') + `<circle class="hole-c" fill="#000" cx="${sub.cx}" cy="${sub.cy}" r="0"/>` : '';
      bg = document.createElement('div');
      bg.className = 'bg';
      bg.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
        <defs>${grad}
          <filter id="esblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${110 * u}"/></filter>
          <filter id="esgrain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
          <mask id="esm" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${holeEls}</mask>
        </defs>
        <g mask="url(#esm)">
          <rect width="${W}" height="${H}" fill="url(#esg)"/>
          ${p.background === 'gradient' ? `<circle class="blob b1" r="${420 * u}" fill="${p.accent}" opacity=".38" filter="url(#esblur)"/><circle class="blob b2" r="${480 * u}" fill="${p.glow}" opacity=".42" filter="url(#esblur)"/>` : ''}
          <rect width="${W}" height="${H}" filter="url(#esgrain)" opacity="${p.grain}" style="mix-blend-mode:overlay"/>
        </g></svg>`;
      el.appendChild(bg);
    }

    // headline
    const head = document.createElement('div');
    head.className = 'head';
    head.innerHTML = `${p.subline ? '<div class="sub"></div>' : ''}<div class="hl"></div>`;
    if (p.subline) head.querySelector('.sub').textContent = p.subline;
    head.querySelector('.hl').textContent = p.headline;
    head.style.top = headY + 'px';
    el.appendChild(head);
    const hl = head.querySelector('.hl');
    const maxHW = W * 0.86;
    if (hl.scrollWidth > maxHW) hl.style.fontSize = (88 * u * maxHW) / hl.scrollWidth + 'px';

    // slots
    const PLAY = '<svg viewBox="0 0 24 24"><path d="M6 4.5v15a1 1 0 0 0 1.5.86l12.6-7.5a1 1 0 0 0 0-1.72L7.5 3.64A1 1 0 0 0 6 4.5z" fill="#fff"/></svg>';
    const LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M3 6h13M3 11h13M3 16h8"/><path d="M16 14.5v6l5-3z" fill="#fff" stroke="none"/></svg>';
    slots.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slot' + (holes ? '' : ' fill');
      d.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
      let inner = '';
      if (s.playlist) inner += `<div class="ghost g2"></div><div class="ghost g1"></div>`;
      inner += `<div class="frame"></div>`;
      if (!holes) inner += s.playlist ? `<div class="plist">${LIST}<span>Playlist</span></div>` : `<div class="play">${PLAY}</div>`;
      inner += `<div class="lab"><i></i><span></span></div>`;
      d.innerHTML = inner;
      d.querySelector('.lab span').textContent = s.label;
      if (s.playlist) {
        d.querySelector('.g1').style.transform = `translate(${14 * u}px, ${-14 * u}px)`;
        d.querySelector('.g2').style.transform = `translate(${28 * u}px, ${-28 * u}px)`;
        d.querySelector('.g2').style.opacity = 0.5;
      }
      el.appendChild(d);
      s.el = d;
      s.hole = bg && bg.querySelector(`.hole[data-i="${i}"]`);
    });

    // subscribe ring + channel
    const sw = document.createElement('div');
    sw.className = 'subwrap';
    const R = sub.d / 2;
    sw.style.cssText = `left:${sub.cx - R}px;top:${sub.cy - R}px;width:${sub.d}px;height:${sub.d}px`;
    sw.innerHTML = `
      ${holes ? '' : `<div class="avatar" style="inset:${10 * u}px;background:linear-gradient(140deg, ${p.accent}, ${p.glow})"></div>`}
      <svg class="ring" viewBox="0 0 ${sub.d} ${sub.d}">
        <circle class="r0" cx="${R}" cy="${R}" r="${R + 2 * u}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="${2 * u}"/>
        <circle class="r1" cx="${R}" cy="${R}" r="${R + 2 * u}" fill="none" stroke="${p.accent}" stroke-width="${7 * u}" stroke-linecap="round" transform="rotate(-90 ${R} ${R})"/>
      </svg>
      <div class="chan"><div class="nm"></div><div class="btn"></div></div>`;
    el.appendChild(sw);
    if (!holes) sw.querySelector('.avatar').textContent = (p.initials || '').slice(0, 3);
    const chan = sw.querySelector('.chan');
    chan.querySelector('.nm').textContent = p.channel;
    chan.querySelector('.btn').textContent = p.subscribe;
    if (sub.side === 'right') {
      chan.style.cssText = `left:100%;top:50%;transform:translateY(-50%);margin:0 0 0 ${40 * u}px;flex-direction:column;align-items:flex-start;gap:${16 * u}px`;
      // centre the ring + label group horizontally
      const gw = sub.d + 40 * u + chan.offsetWidth;
      if (!portrait || mode !== 'one') { const x0 = W / 2 - gw / 2; sw.style.left = x0 + 'px'; sub.cx = x0 + R; }
    } else {
      chan.style.flexDirection = 'column';
      chan.style.gap = 16 * u + 'px';
    }
    const holeC = bg && bg.querySelector('.hole-c');
    if (holeC) holeC.setAttribute('cx', sub.cx);

    // ---- timeline ----
    const xo = D - 0.62; // exit start
    if (bg) {
      const rMax = Math.hypot(Math.max(sub.cx, W - sub.cx), Math.max(sub.cy, H - sub.cy)) + 20;
      tl.fromTo(bg, { clipPath: `circle(0px at ${sub.cx}px ${sub.cy}px)` }, { clipPath: `circle(${rMax}px at ${sub.cx}px ${sub.cy}px)`, duration: T(0.6), ease: 'power3.inOut' }, 0)
        .to(bg, { clipPath: `circle(0px at ${sub.cx}px ${sub.cy}px)`, duration: 0.45, ease: 'power3.in' }, D - 0.47);
    }
    const sl = head.querySelector('.sub');
    if (sl) {
      const s1 = new SplitText(sl, { type: 'chars' });
      tl.from(s1.chars, { opacity: 0, y: 14 * u, duration: 0.5, ease: 'power3.out', stagger: 0.012 }, T(0.25))
        .to(s1.chars, { opacity: 0, y: -10 * u, duration: 0.25, ease: 'power2.in', stagger: 0.004 }, xo);
    }
    const s2 = new SplitText(hl, { type: 'chars,lines', mask: 'lines' });
    tl.from(s2.chars, { yPercent: 115, duration: 0.8, ease: 'expo.out', stagger: 0.02 }, T(0.32))
      .to(s2.chars, { yPercent: -115, duration: 0.35, ease: 'power2.in', stagger: 0.01 }, xo + 0.02);
    // ring + avatar + channel
    const av = sw.querySelector('.avatar');
    if (av) tl.fromTo(av, { scale: 0 }, { scale: 1, duration: 0.6, ease: 'back.out(1.8)' }, T(0.75)).to(av, { scale: 0, duration: 0.3, ease: 'back.in(1.6)' }, xo + 0.08);
    tl.fromTo(sw.querySelector('.r0'), { opacity: 0 }, { opacity: 1, duration: 0.4 }, T(0.7))
      .fromTo(sw.querySelector('.r1'), { drawSVG: '0%' }, { drawSVG: '100%', duration: T(1.1), ease: 'power2.inOut' }, T(0.8))
      .to(sw.querySelector('.r1'), { drawSVG: '100% 100%', duration: 0.4, ease: 'power2.in' }, xo)
      .to(sw.querySelector('.r0'), { opacity: 0, duration: 0.25 }, xo + 0.1)
      .from(chan.children, { opacity: 0, x: sub.side === 'right' ? -24 * u : 0, y: sub.side === 'right' ? 0 : 16 * u, duration: 0.6, ease: 'power3.out', stagger: 0.08 }, T(1.1))
      .to(chan.children, { opacity: 0, x: sub.side === 'right' ? -16 * u : 0, duration: 0.25, ease: 'power2.in', stagger: 0.04 }, xo);
    const labs = slots.map((s) => s.el.querySelector('.lab'));
    tl.from(labs, { opacity: 0, y: 12 * u, duration: 0.5, ease: 'power3.out', stagger: 0.1 }, T(0.9))
      .to(labs, { opacity: 0, duration: 0.2 }, xo);
    const btn = chan.querySelector('.btn');

    return {
      render(t) {
        slots.forEach((s, i) => {
          const a = T(0.3) + i * T(0.27);
          const ki = E.outExpo(studio.progress(t, a, 0.85));
          const ko = E.inCubic(studio.progress(t, xo + 0.05 + (slots.length - 1 - i) * 0.06, 0.34));
          const sc = (0.9 + 0.1 * ki) * (1 - 0.06 * ko);
          const settle = studio.progress(t, a + 0.6, 1.2);
          const fy = 4 * u * Math.sin((t / 3.4) * Math.PI * 2 + i * 1.7) * settle;
          const o = Math.min(1, ki * 1.4) * (1 - ko);
          s.el.style.transform = `translateY(${fy}px) scale(${sc})`;
          s.el.style.opacity = o;
          if (s.hole) {
            const hs = sc * Math.min(1, ki * 1.15) * (1 - ko);
            const w = s.w * hs, h = s.h * hs;
            s.hole.setAttribute('x', s.x + (s.w - w) / 2);
            s.hole.setAttribute('y', s.y + fy + (s.h - h) / 2);
            s.hole.setAttribute('width', Math.max(0, w));
            s.hole.setAttribute('height', Math.max(0, h));
          }
        });
        if (holeC) {
          const ki = E.outBack(studio.progress(t, T(0.75), 0.6));
          const ko = E.inCubic(studio.progress(t, xo + 0.08, 0.3));
          holeC.setAttribute('r', Math.max(0, (R - 10 * u) * ki * (1 - ko)));
        }
        // idle: blobs drift, button breathes
        if (bg) {
          const b1 = bg.querySelector('.b1'), b2 = bg.querySelector('.b2');
          if (b1) { b1.setAttribute('cx', W * (0.2 + 0.06 * Math.sin(t * 0.45))); b1.setAttribute('cy', H * (0.25 + 0.08 * Math.cos(t * 0.38))); }
          if (b2) { b2.setAttribute('cx', W * (0.82 + 0.05 * Math.cos(t * 0.33))); b2.setAttribute('cy', H * (0.78 + 0.07 * Math.sin(t * 0.41))); }
        }
        const pulse = studio.progress(t, T(1.8), 0.5) * (1 - studio.progress(t, xo - 0.3, 0.3));
        btn.style.transform = `scale(${1 + 0.035 * pulse * Math.max(0, Math.sin(t * Math.PI * 0.9)) ** 2})`;
      },
    };
  },
});
