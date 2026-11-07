// Gradient sweep / shine headline. Each word is its own background-clip:text span, but the gradient
// is laid out in headline space (background-position offset by the word's position), so it reads as
// one continuous fill across words and lines. The sweep is a seamless tile (last stop = first stop).
studio.clip({
  duration: 5,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const stops = String(p.gradientStops || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (stops.length < 2) stops.push('#7f5af0', '#2cb1ff');
    const weights = { Inter: 800, Manrope: 800, Unbounded: 800, 'Playfair Display': 700 };
    const weight = weights[p.font] || 800;
    const tracking = p.font === 'Playfair Display' ? '-0.02em' : p.font === 'Unbounded' ? '-0.035em' : '-0.045em';

    const el = document.createElement('div');
    el.className = 'gs';
    el.style.setProperty('--grad', `linear-gradient(90deg, ${stops.join(', ')})`);
    el.style.setProperty('--c0', stops[0]);
    root.appendChild(el);
    let badge = null;
    if (p.badge) {
      badge = document.createElement('div');
      badge.className = 'badge';
      badge.innerHTML = '<i></i><span></span>';
      badge.querySelector('span').textContent = p.badge;
      el.appendChild(badge);
      el.appendChild(document.createElement('br'));
    }
    const hwrap = document.createElement('div');
    hwrap.className = 'hwrap';
    el.appendChild(hwrap);
    const head = document.createElement('div');
    head.className = 'head';
    head.style.cssText = `font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.size}px;letter-spacing:${tracking}`;
    const rows = String(p.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'row';
      r.split(/\s+/).forEach((w, i, a) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w;
        row.appendChild(s);
        if (i < a.length - 1) row.appendChild(document.createTextNode(' '));
      });
      head.appendChild(row);
    });
    hwrap.appendChild(head);
    let sub = null;
    if (p.subline) {
      sub = document.createElement('div');
      sub.className = 'sub';
      sub.style.color = p.sublineColor;
      sub.textContent = p.subline;
      el.appendChild(sub);
    }
    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, rows.join(' ')); } catch (e) {}
    const maxW = studio.width - 280;
    if (head.scrollWidth > maxW) head.style.fontSize = Math.floor(p.size * maxW / head.scrollWidth) + 'px';

    // glow layer = clone of the headline, blurred, behind it (sweep mode only)
    let glowHead = null;
    if (p.glow && p.mode === 'sweep') {
      glowHead = head.cloneNode(true);
      glowHead.classList.add('glowl');
      hwrap.insertBefore(glowHead, head);
    }
    const words = [...head.querySelectorAll('.w')];
    const gWords = glowHead ? [...glowHead.querySelectorAll('.w')] : [];
    const HW = head.offsetWidth, HH = head.offsetHeight;
    const pos = words.map((w) => ({ x: w.offsetLeft, y: w.offsetTop }));
    const tile = Math.max(HW, 600);
    const sweepImg = `linear-gradient(90deg, ${[...stops, stops[0]].join(', ')})`;
    const shineImg = `linear-gradient(${p.angle}deg, ${p.baseColor} 0%, ${p.baseColor} 38%, #ffffff 48%, #ffffff 52%, ${p.baseColor} 62%, ${p.baseColor} 100%)`;
    const all = [...words, ...gWords];
    all.forEach((w) => {
      if (p.mode === 'shine') { w.style.backgroundImage = shineImg; w.style.backgroundSize = `${HW * 3}px ${HH}px`; w.style.backgroundRepeat = 'no-repeat'; }
      else { w.style.backgroundImage = sweepImg; w.style.backgroundSize = `${tile}px ${HH}px`; }
    });

    // ---- timeline ----
    const k = Math.min(1, D / 4);
    const t0 = 0.05;
    const st = Math.min(0.06, 0.6 / Math.max(1, words.length)) * Math.max(0.6, k);
    const tWords = badge ? t0 + 0.12 * k : t0;
    if (badge) tl.fromTo(badge, { opacity: 0, y: 16, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.7 * Math.max(0.6, k), ease: 'expo.out' }, t0);
    const inArgs = (stg) => ({ opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.95 * Math.max(0.6, k), ease: 'expo.out', stagger: stg });
    tl.fromTo(words, { opacity: 0, y: 30, filter: 'blur(8px)' }, inArgs(st), tWords);
    if (gWords.length) tl.fromTo(gWords, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.4 * Math.max(0.6, k), ease: 'expo.out', stagger: st }, tWords + 0.1);
    const tSub = tWords + st * words.length + 0.15 * k;
    if (sub) tl.fromTo(sub, { opacity: 0, y: 20, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8 * Math.max(0.6, k), ease: 'expo.out' }, tSub);
    // slow push for life
    tl.fromTo(hwrap, { scale: 1 }, { scale: 1.025, duration: D, ease: 'none' }, 0);
    // exit
    const exitDur = Math.min(0.45, D * 0.12);
    const out = D - exitDur - 0.12;
    const exSt = Math.min(0.03, 0.12 / Math.max(1, words.length));
    tl.to(words, { opacity: 0, y: -18, filter: 'blur(8px)', duration: exitDur, ease: 'power2.in', stagger: exSt }, out);
    if (gWords.length) tl.to(gWords, { opacity: 0, duration: exitDur, ease: 'power2.in' }, out);
    if (sub) tl.to(sub, { opacity: 0, y: -10, filter: 'blur(6px)', duration: exitDur, ease: 'power2.in' }, out + 0.04);
    if (badge) tl.to(badge, { opacity: 0, y: -10, duration: exitDur, ease: 'power2.in' }, out);

    // shine passes: first after the words land, then every ~3.5 s while time allows
    const shines = [];
    for (let s = tWords + 0.6 * Math.max(0.6, k) + st * words.length * 0.5; s + 1.0 < out + 0.2; s += 3.5) shines.push(s);
    const shineLen = 1.1;
    const inOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

    return {
      render(t) {
        if (p.mode === 'shine') {
          // band centre = bx + 1.5·HW: parked off the right edge when idle (bx 0), a pass runs bx −2·HW → 0
          let u = 0;
          for (const s of shines) if (t >= s) u = Math.min(1, (t - s) / shineLen);
          const active = shines.some((s) => t >= s && t < s + shineLen);
          const bx = active ? -(1 - inOut(u)) * 2 * HW : 0; // band travels left → right
          words.forEach((w, i) => { w.style.backgroundPosition = `${bx - pos[i].x}px ${-pos[i].y}px`; });
        } else {
          // eased start, then constant drift
          const shift = (t < 1 ? 0.5 * t * t : t - 0.5) * p.speed * tile;
          const px = (x) => ((((shift - x) % tile) + tile) % tile);
          words.forEach((w, i) => { w.style.backgroundPosition = `${px(pos[i].x)}px ${-pos[i].y}px`; });
          gWords.forEach((w, i) => { w.style.backgroundPosition = `${px(pos[i].x)}px ${-pos[i].y}px`; });
        }
      },
    };
  },
});
