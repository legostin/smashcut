// Ink blob transition: noise-edged blots + splatter on a canvas, merged by an SVG "goo" filter
// (blur + alpha threshold). Covered at D/2; then dissolves through growing ink holes or shrinks away.
studio.clip({
  duration: 1.6,
  setup(root, p, { tl, width: W, height: H, duration: D }) {
    const { clamp, ease } = studio;
    const U = Math.min(W, H) / 1080;
    const rnd = studio.random(p.seed | 0);
    const hold = Math.max(Math.min(p.hold, D * 0.4), D - 3.2); // long clips: motion stays brisk, the extra time is covered hold
    const half = (D - hold) / 2;
    const tCover = half, tOut = half + hold;
    const N = clamp(Math.round(p.seeds), 1, 8);
    const TAU = Math.PI * 2;

    const wrap = document.createElement('div');
    wrap.className = 'tib';
    wrap.style.setProperty('--u', U);
    const gooStd = Math.max(0.01, p.goo * U);
    wrap.innerHTML = `<svg class="defs"><filter id="tibgoo" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="${gooStd}" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></svg><canvas></canvas><div class="label"><span class="mask"><span class="in"></span></span></div>`;
    root.appendChild(wrap);
    const cv = wrap.querySelector('canvas');
    cv.width = W; cv.height = H;
    if (p.goo > 0) cv.style.filter = 'url(#tibgoo)';
    let g = cv.getContext('2d'); // drawing helpers target `g`; the out-phase swaps in a scratch layer
    const scratchCv = document.createElement('canvas');
    scratchCv.width = W; scratchCv.height = H;
    const scratch = scratchCv.getContext('2d');
    const label = wrap.querySelector('.label');
    label.style.color = p.labelColor;
    label.querySelector('.in').textContent = p.label || '';
    if (p.label) {
      const inn = label.querySelector('.in');
      tl.fromTo(inn, { yPercent: 110 }, { yPercent: 0, duration: Math.max(0.15, half * 0.5), ease: 'expo.out' }, half * 0.75)
        .to(inn, { yPercent: -110, duration: Math.max(0.12, half * 0.3), ease: 'power3.in' }, tOut - 0.04);
    }

    const corners = [[0, 0], [W, 0], [0, H], [W, H]];
    const farthest = (x, y) => Math.max(...corners.map(([cx, cy]) => Math.hypot(cx - x, cy - y)));
    // drop points spread over a jittered grid so they don't clump
    function makeDrops(count, phaseOffset) {
      const cols = Math.ceil(Math.sqrt(count * (W / H))), rows = Math.ceil(count / cols);
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      return cells.slice(0, count).map(([c, r], i) => {
        const x = ((c + 0.2 + rnd() * 0.6) / cols) * W, y = ((r + 0.2 + rnd() * 0.6) / rows) * H;
        const harm = [2, 3, 5, 7].map((k) => ({ k, a: (0.5 + rnd()) / k, ph: rnd() * TAU, w: (rnd() - 0.5) * 2 }));
        const drops = Array.from({ length: Math.round(p.splatter) }, () => ({ ang: rnd() * TAU, d: 0.12 + rnd() * 0.75, sz: (4 + rnd() ** 2 * 22) * U, lag: 0.45 + rnd() * 0.25 }));
        return { x, y, R: farthest(x, y) * (1.08 + p.edgeNoise), harm, drops, order: i, ph: phaseOffset };
      });
    }
    const blobs = makeDrops(N, 0);
    const holes = makeDrops(Math.max(2, N), 1);

    // stagger: blob i starts at i*st and must be full-size by tCover
    const st = Math.min(0.12, (half * 0.45) / Math.max(1, N - 1));
    const grow = (i, t, start, end) => clamp((t - start - i * st) / Math.max(0.05, end - start - i * st));
    const spread = (u) => (u <= 0 ? 0 : 0.07 * ease.outBack(Math.min(1, u * 5)) + 0.93 * u * u * u);

    function blobPath(b, r, t) {
      if (r <= 0.5) return;
      const steps = 72;
      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * TAU;
        let n = 0;
        for (const h of b.harm) n += h.a * Math.sin(h.k * a + h.ph + h.w * t * 3);
        const rr = r * (1 + p.edgeNoise * 0.55 * n);
        const x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr;
        s ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    }
    function splats(b, r, t) {
      for (const d of b.drops) {
        const dist = d.d * b.R * 0.62;
        const appear = clamp((r - dist * d.lag) / (dist * 0.25 + 1));
        if (appear <= 0 || r > dist + d.sz * 3) continue;
        const sz = d.sz * ease.outBack(appear);
        const x = b.x + Math.cos(d.ang) * dist, y = b.y + Math.sin(d.ang) * dist;
        g.moveTo(x + sz, y); g.arc(x, y, sz, 0, TAU);
        // a tiny satellite droplet trailing the splat
        const s2 = sz * 0.45, d2 = dist + sz * 2.4;
        g.moveTo(b.x + Math.cos(d.ang) * d2 + s2, b.y + Math.sin(d.ang) * d2); g.arc(b.x + Math.cos(d.ang) * d2, b.y + Math.sin(d.ang) * d2, s2, 0, TAU);
      }
    }
    // radius of each blob for the in-phase, shifted by `lead` seconds (two-tone bleed runs ahead)
    function drawIn(t, color, rim) {
      g.fillStyle = color;
      g.beginPath();
      blobs.forEach((b, i) => {
        const u = grow(i, t, 0, tCover);
        const r0 = b.R * spread(u);
        const r = r0 > 0.5 ? r0 + rim * clamp(r0 / (rim * 3 + 1)) : 0;
        blobPath(b, r, t);
        splats(b, r, t);
      });
      g.fill();
    }
    function drawOut(t, color, rim) {
      if (p.outMode === 'shrink') {
        g.fillStyle = color;
        g.beginPath();
        blobs.forEach((b, i) => {
          const j = N - 1 - i; // reverse order
          const u = grow(j, t, tOut, D);
          const r0 = b.R * (1 - ease.inOutCubic(u));
          const r = r0 > 0.5 ? r0 + rim : 0;
          blobPath(b, r, t);
        });
        g.fill();
        return;
      }
      g.fillStyle = color;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      holes.forEach((b, i) => {
        const u = grow(i, t, tOut, D);
        const r0 = b.R * spread(u);
        const r = r0 > 0.5 ? r0 + rim * clamp(r0 / (rim * 3 + 1)) : 0;
        blobPath(b, r, t);
        splats(b, r, t);
      });
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }

    const rim = 26 * U; // two-tone bleed width
    return {
      render(t) {
        g = cv.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, W, H);
        if (t <= 0.0001 || t >= D - 0.0001) return;
        if (t < tOut) {
          if (p.twoTone) drawIn(t, p.color2, rim);
          drawIn(t, p.color1, 0);
        } else if (p.twoTone) {
          // draw on a scratch layer per colour so holes in the main ink reveal the bleed colour first
          scratch.clearRect(0, 0, W, H);
          const keep = g; g = scratch; drawOut(t, p.color2, p.outMode === 'shrink' ? rim : 0); g = keep;
          g.drawImage(scratchCv, 0, 0);
          scratch.clearRect(0, 0, W, H);
          g = scratch; drawOut(t, p.color1, p.outMode === 'shrink' ? 0 : rim); g = keep;
          g.drawImage(scratchCv, 0, 0);
        } else drawOut(t, p.color1, 0);
      },
    };
  },
});
