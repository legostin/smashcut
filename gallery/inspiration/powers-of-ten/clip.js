// Powers of ten: the picture zooms out at a constant rate in log space (x10 every second, never easing).
// Each world is a square 10x wider than the one before and holds it at its exact centre; its outline is the marker:
// it meets the picture edge exactly when a power completes (drawn in the accent colour then), and the exponent ticks.
const V = 880;                                   // picture side, px
const FILL = ['#1b1b22', '#0f0f13'];
const INK = '#f3f2ec', A = '#d4ff3a';
const TONE = ['#6a86ff', '#ff5c38', '#f3f2ec', '#d4ff3a'];
// a few flat shapes per world, in units of the world's side (−0.5…0.5); the middle ±0.05 belongs to the smaller world
const WORLDS = [
  [['c', -0.27, -0.24, 0.11], ['r', 0.12, -0.36, 0.30, 0.09], ['c', 0.30, 0.20, 0.08], ['r', -0.40, 0.22, 0.09, 0.22], ['c', -0.08, 0.33, 0.05],
    ['c', 0.105, -0.085, 0.028], ['r', -0.17, 0.07, 0.07, 0.028], ['c', 0.02, 0.15, 0.022]],
  [['r', -0.40, -0.40, 0.22, 0.10], ['c', 0.28, -0.26, 0.12], ['r', 0.16, 0.24, 0.26, 0.09], ['c', -0.27, 0.22, 0.09], ['c', 0.02, -0.30, 0.045],
    ['c', -0.10, -0.09, 0.03], ['r', 0.08, 0.075, 0.028, 0.075], ['c', -0.13, 0.10, 0.02]],
  [['c', -0.30, 0.00, 0.10], ['r', -0.10, -0.40, 0.09, 0.24], ['r', 0.20, -0.14, 0.22, 0.09], ['c', 0.22, 0.30, 0.11], ['r', -0.36, 0.30, 0.24, 0.08],
    ['c', 0.10, 0.10, 0.03], ['r', -0.03, -0.16, 0.075, 0.028], ['c', -0.14, -0.04, 0.02]],
  [['r', 0.22, -0.40, 0.10, 0.26], ['c', -0.24, -0.28, 0.12], ['c', 0.30, 0.10, 0.06], ['r', -0.42, 0.14, 0.26, 0.09], ['c', -0.02, 0.32, 0.09],
    ['c', -0.095, 0.095, 0.03], ['r', 0.075, -0.13, 0.028, 0.075], ['c', 0.15, 0.03, 0.02]],
];
const mod = (n, m) => ((n % m) + m) % m;
let ctx, digits;
function world(L, t) {
  const s = V * Math.pow(10, L - t);              // on-screen side of world L
  const c = V / 2, x0 = c - s / 2;
  ctx.fillStyle = FILL[mod(L, 2)];
  ctx.fillRect(x0, x0, s, s);
  if (s > 30) {
    ctx.fillStyle = TONE[mod(L, 4)];
    for (const sh of WORLDS[mod(L, 4)]) {
      ctx.beginPath();
      if (sh[0] === 'c') ctx.arc(c + sh[1] * s, c + sh[2] * s, sh[3] * s, 0, Math.PI * 2);
      else ctx.roundRect(c + sh[1] * s, c + sh[2] * s, sh[3] * s, sh[4] * s, Math.min(sh[3], sh[4]) * s * 0.3);
      ctx.fill();
    }
  }
  // the marker square: accent while it is the newest power, then plain; thinner as it shrinks
  const age = t - L;                              // seconds since this square met the picture edge
  if (age < -0.02) return;
  const lw = Math.max(5, Math.min(16, s * 0.05));
  ctx.lineWidth = lw;
  ctx.strokeStyle = age < 1 ? A : INK;
  ctx.globalAlpha = s < 12 ? s / 12 : 1;
  ctx.strokeRect(x0 + lw / 2, x0 + lw / 2, s - lw, s - lw);
  ctx.globalAlpha = 1;
}
studio.clip({
  duration: 4,
  setup(root) {
    const cv = document.createElement('canvas');
    cv.width = V; cv.height = V; cv.className = 'view';
    root.appendChild(cv);
    ctx = cv.getContext('2d');
    kit.el(root, 'frame');
    const count = kit.el(root, 'count');
    kit.el(count, 'base', null, '10');
    const exp = kit.el(count, 'exp');
    digits = [kit.el(exp), kit.el(exp)];
  },
  render(t) {
    ctx.clearRect(0, 0, V, V);
    const k = Math.floor(t);
    for (let L = k + 1; L >= k - 3; L--) world(L, t);
    // exponent: the next number rolls up into place as each power completes
    const roll = studio.ease.outCubic(studio.progress(t - k, 0, 0.28));
    const now = mod(k, 4) + 1, prev = mod(k - 1, 4) + 1;
    digits[0].textContent = prev;
    digits[1].textContent = now;
    digits[0].style.transform = `translateY(${-roll * 230}px)`;
    digits[1].style.transform = `translateY(${(1 - roll) * 230}px)`;
  },
});
