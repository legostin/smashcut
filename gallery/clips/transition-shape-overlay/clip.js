// Gooey wave cover (Codrops "shape overlays" style). Each layer is the area between a wavy leading edge
// and a wavy trailing edge; every edge point has its own seeded delay. Fully covered exactly at D/2.
studio.clip({
  duration: 1.2,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const { clamp } = studio;
    const U = Math.min(W, H) / 1080;
    const n = clamp(Math.round(p.layers), 1, 4);
    const cols = [...[p.color1, p.color2, p.color3].slice(0, n - 1), p.color4]; // the last colour always covers the cut
    const m = clamp(Math.round(p.points), 4, 16);
    const dir = p.direction;
    const vertical = dir === 'up' || dir === 'down';
    const L = vertical ? H : W, B = vertical ? W : H;

    // ---- timing: the covering layer's last point lands at D/2 - hold/2 ----
    const hold = Math.max(Math.min(p.hold, D * 0.4), D - 2.4); // long clips: motion stays brisk, the extra time is covered hold
    const half = (D - hold) / 2;
    const st = Math.min(p.stagger, (half * 0.35) / Math.max(1, n - 1));
    const maxDelay = Math.min(0.14, half * 0.3) * p.waviness;
    const move = Math.max(0.05, half - (n - 1) * st - maxDelay);
    const M = L * 0.04 + B * 0.06 * p.waviness; // overshoot margin so the bulges fully clear the frame

    const rnd = studio.random(p.seed | 0);
    // smooth seeded delay profile per layer (lead and trail get their own profiles)
    const profile = () => {
      const raw = Array.from({ length: m }, () => rnd());
      const ph = rnd() * Math.PI * 2;
      return raw.map((r, j) => clamp(0.55 * r + 0.45 * (0.5 + 0.5 * Math.sin(ph + (j / (m - 1)) * Math.PI * 1.6))));
    };
    const layers = cols.map((c, i) => ({ c, lead: profile(), trail: profile(), s: i * st, e: half + hold + (n - 1 - i) * st }));

    // easing: like power2.inOut but slightly front-loaded for a liquid "pull"
    const ez = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const along = (t, start, del) => ez(clamp((t - start - del * maxDelay) / move));

    const wrap = document.createElement('div');
    wrap.className = 'tso';
    wrap.style.setProperty('--u', U);
    wrap.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${layers.map((l) => `<path fill="${l.c}"/>`).join('')}</svg><div class="label"><span class="mask"><span class="in"></span></span></div>`;
    root.appendChild(wrap);
    const paths = [...wrap.querySelectorAll('path')];
    const label = wrap.querySelector('.label');
    label.style.color = p.labelColor;
    label.querySelector('.in').textContent = p.label || '';
    if (p.label) {
      const inn = label.querySelector('.in');
      tl.fromTo(inn, { yPercent: 110 }, { yPercent: 0, duration: Math.max(0.12, half * 0.45), ease: 'expo.out' }, half * 0.72)
        .to(inn, { yPercent: -110, duration: Math.max(0.1, half * 0.3), ease: 'power3.in' }, half + hold - 0.02);
    }

    const toXY = (b, a) => {
      if (dir === 'up') return [b, a];
      if (dir === 'down') return [b, L - a];
      if (dir === 'left') return [a, b];
      return [L - a, b];
    };
    // Catmull-Rom through points (in local b/a space) → cubic beziers, emitted in screen space
    function curve(pts, first) {
      let d = '';
      const P = [pts[0], ...pts, pts[pts.length - 1]];
      for (let i = 1; i < P.length - 2; i++) {
        const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        if (i === 1) { const [x, y] = toXY(...p1); d += `${first ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`; }
        const a = toXY(...c1), b = toXY(...c2), c = toXY(...p2);
        d += `C${a[0].toFixed(1)} ${a[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
      }
      return d;
    }
    const pos = (u) => L + M - (L + 2 * M) * u; // u=0 → beyond the start side, u=1 → beyond the far side
    const pad = B * 0.02;

    return {
      render(t) {
        layers.forEach((l, i) => {
          const lead = [], trail = [];
          let any = false;
          for (let j = 0; j < m; j++) {
            const b = -pad + ((B + 2 * pad) * j) / (m - 1);
            const ul = along(t, l.s, l.lead[j]), ut = along(t, l.e, l.trail[j]);
            if (ul > 0 && ut < 1) any = true;
            lead.push([b, pos(ul)]);
            trail.push([b, pos(ut)]);
          }
          if (!any) { paths[i].setAttribute('d', ''); return; }
          paths[i].setAttribute('d', curve(lead, true) + curve(trail.reverse(), false) + 'Z');
        });
      },
    };
  },
});
