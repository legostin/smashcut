// Flow-field streaks: an invisible, static vector field is shown only by the fading tails of particles carried along it.
// A streak is longer AND brighter where the field is faster (a meandering jet and one swirl), dim and short where it is slow.
// Deterministic and seamless: every particle's whole path is precomputed in setup from a seeded generator, and its age is
// (t + phase) mod life with life ∈ {1, 4/3, 2, 4} s — so the picture at t = 4 is exactly the picture at t = 0.
const W = 1920, H = 1080, N = 1500;
const STEP = 1 / 48;                 // path sample spacing, s
const TAIL = 0.62;                   // seconds of path kept as a tail
const LIVES = [1, 4 / 3, 2, 2, 4];
const VMAX = 760;                    // px/s that counts as "fast"
const LEVELS = 16;                   // brightness buckets (one canvas path each)
function rng(seed) {                 // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
// stream function (px²/s); velocity = (∂ψ/∂y, −∂ψ/∂x) — divergence-free, so streaks never pile up
function psi(x, y) {
  const yc = 470 + 190 * Math.sin(x / 430 + 0.6);                     // centre line of the jet
  const jet = 86000 * Math.tanh((y - yc) / 125);                      // fast band
  const drift = 70 * y;                                               // slow flow everywhere
  const dx = x - 1380, dy = y - 830;
  const swirl = -150000 * Math.exp(-(dx * dx + dy * dy) / (2 * 210 * 210));
  const ex = x - 330, ey = y - 150;
  const eddy = 60000 * Math.exp(-(ex * ex + ey * ey) / (2 * 170 * 170));
  return jet + drift + swirl + eddy;
}
function vel(x, y) {
  const e = 2;
  return [(psi(x, y + e) - psi(x, y - e)) / (2 * e), -(psi(x + e, y) - psi(x - e, y)) / (2 * e)];
}
let ctx, parts;
studio.clip({
  duration: 4,
  setup(root) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H; cv.className = 'wind';
    root.appendChild(cv);
    ctx = cv.getContext('2d');
    const r = rng(20120328);
    parts = [];
    for (let i = 0; i < N; i++) {
      const life = LIVES[Math.floor(r() * LIVES.length)];
      const n = Math.round(life / STEP) + 1;
      const xs = new Float32Array(n), ys = new Float32Array(n), sp = new Float32Array(n);
      let x = -260 + r() * (W + 420), y = -80 + r() * (H + 160);
      for (let k = 0; k < n; k++) {
        const [vx, vy] = vel(x, y);
        xs[k] = x; ys[k] = y; sp[k] = Math.hypot(vx, vy);
        // midpoint step keeps the swirl closed
        const [mx, my] = vel(x + vx * STEP / 2, y + vy * STEP / 2);
        x += mx * STEP; y += my * STEP;
      }
      parts.push({ life, n, xs, ys, sp, phase: r() * life });
    }
  },
  render(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    const tailN = Math.round(TAIL / STEP);
    for (const p of parts) {
      const age = (t + p.phase) % p.life;
      const head = age / STEP;
      const hi = Math.floor(head), f = head - hi;
      const fadeOut = Math.min(1, (p.life - age) / 0.35);              // the whole streak dims before it is reborn
      // head position (interpolated between samples)
      const hx = p.xs[hi] + (p.xs[Math.min(hi + 1, p.n - 1)] - p.xs[hi]) * f;
      const hy = p.ys[hi] + (p.ys[Math.min(hi + 1, p.n - 1)] - p.ys[hi]) * f;
      let px = hx, py = hy, last = -1;
      for (let j = 0; j < tailN; j++) {
        const k = hi - j;
        if (k < 0) break;
        const x = p.xs[k], y = p.ys[k];
        const speed = Math.min(1, p.sp[k] / VMAX);
        const a = (0.15 + 0.85 * Math.pow(speed, 1.3)) * (1 - (j + f) / tailN) * fadeOut;
        if (a < 0.02) break;
        const lvl = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
        if (lvl !== last) { paths[lvl].moveTo(px, py); last = lvl; }   // one unbroken line per brightness step
        paths[lvl].lineTo(x, y);
        px = x; py = y;
      }
    }
    ctx.strokeStyle = '#f3f2ec';
    for (let l = 0; l < LEVELS; l++) {
      ctx.globalAlpha = (l + 0.5) / LEVELS;
      ctx.lineWidth = 4 + 4 * (l / (LEVELS - 1));
      ctx.stroke(paths[l]);
    }
    ctx.globalAlpha = 1;
  },
});
