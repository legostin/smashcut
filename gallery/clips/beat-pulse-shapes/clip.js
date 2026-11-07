// Beat-pulse geometric background: canvas drawn in render(t) from studio.beats / studio.bars.
studio.clip({
  duration: 8,
  setup(root, p, { width: W, height: H }) {
    const cv = document.createElement('canvas');
    cv.className = 'bps';
    cv.width = W; cv.height = H;
    root.appendChild(cv);
    const g = cv.getContext('2d');

    // ---- beat grid (clip-local seconds); fallback: steady grid at studio.bpm ----
    const spb = 60 / (studio.bpm || 120);
    let beats = (studio.beats || []).slice().sort((a, b) => a - b);
    if (!beats.length) beats = Array.from({ length: Math.ceil(studio.duration / spb) + 64 }, (_, i) => (i - 32) * spb);
    let bars = (studio.bars || []).slice().sort((a, b) => a - b);
    if (!bars.length) bars = beats.filter((b) => Math.round(b / spb) % p.beatsPerBar === 0);
    const lastBefore = (arr, t) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
    const env = (arr, t, decay) => { const i = lastBefore(arr, t); return i < 0 ? 0 : Math.exp(-(t - arr[i]) * decay); };

    // ---- shapes ----
    const rnd = studio.random(p.seed | 0);
    const cell = p.density;
    const cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / cell) + 2;
    const pal = [p.c1, p.c2, p.c3];
    const shapes = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (rnd() < 0.18) continue; // gaps keep it airy
      shapes.push({
        x: (c - 0.5) * cell + (r % 2 ? cell / 2 : 0), y: (r - 0.5) * cell,
        kind: Math.floor(rnd() * 4), col: pal[Math.floor(rnd() * 3)],
        size: cell * (0.16 + rnd() * 0.14), rot: rnd() * Math.PI, spin: (rnd() - 0.5) * 0.6,
        filled: rnd() < 0.22, ph: rnd() * Math.PI * 2,
      });
    }
    const cx = W / 2, cy = H / 2, maxD = Math.hypot(cx, cy);

    function shape(s, size) {
      g.beginPath();
      if (s.kind === 0) g.arc(0, 0, size, 0, Math.PI * 2);
      else if (s.kind === 1) g.rect(-size, -size, size * 2, size * 2);
      else if (s.kind === 2) { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3; i ? g.lineTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2) : g.moveTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2); } g.closePath(); }
      else { const k = size * 0.32; g.moveTo(-size, -k); g.lineTo(-k, -k); g.lineTo(-k, -size); g.lineTo(k, -size); g.lineTo(k, -k); g.lineTo(size, -k); g.lineTo(size, k); g.lineTo(k, k); g.lineTo(k, size); g.lineTo(-k, size); g.lineTo(-k, k); g.lineTo(-size, k); g.closePath(); }
    }

    return {
      render(t) {
        const I = p.intensity;
        const eb = env(beats, t, p.decay);
        const ebar = env(bars, t, 2.5);
        // background
        const bgGrad = g.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, p.bg1); bgGrad.addColorStop(1, p.bg2);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);
        // centre glow breathes with the beat
        const glow = g.createRadialGradient(cx, cy, 0, cx, cy, maxD * 0.8);
        glow.addColorStop(0, p.c1); glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.12 + 0.16 * eb * I; g.fillStyle = glow; g.fillRect(0, 0, W, H);

        // shapes: the pulse ripples outward from the centre
        g.lineWidth = Math.max(2, cell * 0.022);
        g.lineJoin = 'round';
        const drift = t * p.drift;
        for (const s of shapes) {
          const d = Math.hypot(s.x - cx, s.y - cy);
          const e = env(beats, t - (d / maxD) * 0.22, p.decay);
          const bob = Math.sin(drift * 0.9 + s.ph) * cell * 0.08;
          const x = s.x + Math.cos(drift * 0.3 + s.ph) * cell * 0.06, y = s.y + bob - drift * 14;
          const period = rows * cell;
          const sc = 1 + 0.55 * e * I;
          g.save();
          g.translate(x, ((((y + cell) % period) + period) % period) - cell);
          g.rotate(s.rot + drift * s.spin + e * 0.4 * I * (s.spin > 0 ? 1 : -1));
          g.globalAlpha = 0.28 + 0.6 * e * I * (1 - d / maxD * 0.5);
          shape(s, s.size * sc);
          if (s.filled) { g.fillStyle = s.col; g.fill(); } else { g.strokeStyle = s.col; g.stroke(); }
          g.restore();
        }

        // bar shockwaves
        if (p.rings) {
          const i = lastBefore(bars, t);
          for (let k = Math.max(0, i - 1); k <= i; k++) {
            const age = t - bars[k];
            if (age < 0 || age > 2.2) continue;
            const r = 60 + age * 1100;
            g.globalAlpha = Math.max(0, 1 - age / 2.2) * 0.7 * Math.min(1, I);
            g.strokeStyle = k % 2 ? p.c2 : p.c3;
            g.lineWidth = 10 * (1 - age / 2.2) + 2;
            g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
          }
        }
        // central hexagon "speaker"
        g.save();
        g.translate(cx, cy);
        g.rotate(t * 0.25 * p.drift);
        const R = Math.min(W, H) * (0.16 + 0.05 * eb * I + 0.03 * ebar);
        g.globalAlpha = 0.85;
        g.lineWidth = 6;
        g.strokeStyle = p.c2;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; k ? g.lineTo(Math.cos(a) * R, Math.sin(a) * R) : g.moveTo(Math.cos(a) * R, Math.sin(a) * R); }
        g.closePath(); g.stroke();
        g.rotate(-t * 0.5 * p.drift);
        g.globalAlpha = 0.5 + 0.4 * eb;
        g.strokeStyle = p.c1;
        g.lineWidth = 3;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; const rr = R * 0.72; k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        g.closePath(); g.stroke();
        g.restore();
        // vignette
        const v = g.createRadialGradient(cx, cy, maxD * 0.45, cx, cy, maxD);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
        g.globalAlpha = 1; g.fillStyle = v; g.fillRect(0, 0, W, H);
      },
    };
  },
});
