// Arrow callout: target marker + curved arrow drawn with DrawSVGPlugin from a label card.
gsap.registerPlugin(DrawSVGPlugin);
studio.clip({
  duration: 5,
  setup(root, p, { tl, duration, width, height }) {
    const W = width, H = height;
    const T = { x: (p.x / 100) * W, y: (p.y / 100) * H };
    let side = p.side;
    if (side === 'auto') side = Math.abs(T.x - W / 2) / W >= Math.abs(T.y - H / 2) / H * 0.9 ? (T.x > W / 2 ? 'left' : 'right') : (T.y > H / 2 ? 'above' : 'below');
    const d = p.distance;
    const horiz = side === 'left' || side === 'right';
    const sx = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    const sy = side === 'above' ? -1 : side === 'below' ? 1 : 0;
    // tail anchor (on the card edge) — offset diagonally so the arrow curves
    const vy = T.y > H / 2 ? -1 : 1, vx = T.x > W / 2 ? -1 : 1;
    const A = horiz ? { x: T.x + sx * d, y: T.y + vy * d * 0.45 } : { x: T.x + vx * d * 0.55, y: T.y + sy * d };

    const el = document.createElement('div');
    el.className = 'co';
    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <circle class="ring" cx="${T.x}" cy="${T.y}" r="22" fill="none" stroke="${p.accent}" stroke-width="4"/>
        <circle class="ring2" cx="${T.x}" cy="${T.y}" r="22" fill="none" stroke="${p.accent}" stroke-width="3"/>
        <circle class="dot" cx="${T.x}" cy="${T.y}" r="11" fill="${p.accent}" stroke="#fff" stroke-width="4"/>
        <path class="shaft" fill="none" stroke="${p.accent}" stroke-width="${p.strokeWidth}" stroke-linecap="round"/>
        <path class="head" fill="none" stroke="${p.accent}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="card" style="background:${p.cardColor};color:${p.cardText}"><div class="bar" style="background:${p.accent}"></div><div class="l"></div><div class="s"></div></div>`;
    root.appendChild(el);
    const card = el.querySelector('.card');
    card.querySelector('.l').textContent = p.label;
    card.querySelector('.s').textContent = p.sublabel;
    if (!p.sublabel) card.querySelector('.s').style.display = 'none';

    // place card so the tail point sits on its edge
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let cx, cy, origin;
    if (side === 'left') { cx = A.x - cw; cy = A.y - ch / 2; origin = '100% 50%'; }
    else if (side === 'right') { cx = A.x; cy = A.y - ch / 2; origin = '0% 50%'; }
    else if (side === 'above') { cx = A.x - cw / 2; cy = A.y - ch; origin = '50% 100%'; }
    else { cx = A.x - cw / 2; cy = A.y; origin = '50% 0%'; }
    // keep card on screen; shift the tail with it
    const m = 60;
    const ncx = Math.min(W - m - cw, Math.max(m, cx)), ncy = Math.min(H - m - ch, Math.max(m, cy));
    A.x += ncx - cx; A.y += ncy - cy;
    card.style.left = ncx + 'px'; card.style.top = ncy + 'px';
    const gapA = 14; // small gap between card edge and arrow tail
    const A2 = { x: A.x + sx * gapA, y: A.y + sy * gapA };

    // curve: leave the card perpendicular to its edge, bend into the target
    const stop = 34; // stop short of the marker
    const C = horiz ? { x: A2.x + (T.x - A2.x) * p.bend, y: A2.y } : { x: A2.x, y: A2.y + (T.y - A2.y) * p.bend };
    const dirx = T.x - C.x, diry = T.y - C.y, dl = Math.hypot(dirx, diry) || 1;
    const B = { x: T.x - (dirx / dl) * stop, y: T.y - (diry / dl) * stop };
    el.querySelector('.shaft').setAttribute('d', `M${A2.x},${A2.y} Q${C.x},${C.y} ${B.x},${B.y}`);
    const ux = dirx / dl, uy = diry / dl, hl = 26 + p.strokeWidth * 1.5, ang = 0.55;
    const h1 = { x: B.x - hl * (ux * Math.cos(ang) - uy * Math.sin(ang)), y: B.y - hl * (uy * Math.cos(ang) + ux * Math.sin(ang)) };
    const h2 = { x: B.x - hl * (ux * Math.cos(-ang) - uy * Math.sin(-ang)), y: B.y - hl * (uy * Math.cos(-ang) + ux * Math.sin(-ang)) };
    el.querySelector('.head').setAttribute('d', `M${h1.x},${h1.y} L${B.x},${B.y} L${h2.x},${h2.y}`);

    const dot = el.querySelector('.dot'), shaft = el.querySelector('.shaft'), head = el.querySelector('.head');
    const out = Math.max(1.0, duration - 0.78);
    tl.fromTo(dot, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.5, ease: 'back.out(3)' }, 0.05)
      .fromTo(card, { scale: 0.6, opacity: 0, transformOrigin: origin }, { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.8)' }, 0.2)
      .fromTo(card.querySelectorAll('.l, .s'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'power3.out', stagger: 0.08 }, 0.35)
      .set(shaft, { opacity: 0 }, 0)
      .fromTo(shaft, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.6, ease: 'power2.inOut' }, 0.45)
      .set(shaft, { opacity: 1 }, 0.47)
      .set(head, { opacity: 0 }, 0)
      .set(head, { opacity: 1 }, 1.0)
      .fromTo(head, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 0.25, ease: 'power2.out' }, 0.98)
      // exit
      .to(head, { drawSVG: '50% 50%', duration: 0.2, ease: 'power2.in' }, out)
      .set(head, { opacity: 0 }, out + 0.2)
      .to(shaft, { drawSVG: '100% 100%', duration: 0.4, ease: 'power2.in' }, out + 0.05)
      .set(shaft, { opacity: 0 }, out + 0.45)
      .to(card, { scale: 0.8, opacity: 0, duration: 0.35, ease: 'power2.in' }, out + 0.2)
      .to(dot, { scale: 0, duration: 0.3, ease: 'back.in(2)' }, out + 0.4);

    const rings = [el.querySelector('.ring'), el.querySelector('.ring2')];
    return {
      render(t) {
        // ripples: deterministic function of t, only while the marker is visible
        const alive = t > 0.25 && t < out + 0.45 && p.pulse;
        rings.forEach((r, i) => {
          if (!alive) { r.setAttribute('opacity', 0); return; }
          const ph = (((t - 0.25) / 1.4) + i * 0.5) % 1;
          r.setAttribute('r', 16 + ph * 52);
          r.setAttribute('opacity', (1 - ph) * 0.9 * Math.min(1, (t - 0.25) * 4) * (t > out ? Math.max(0, 1 - (t - out) / 0.4) : 1));
        });
      },
    };
  },
});
