// Glass-lens thumb: at rest the slider thumb is a small opaque pill. On press it swells (spring, slight overshoot) into a
// clear capsule that works as a lens — what lies under it (the track and the tick marks) is magnified in the middle and
// squeezed toward the rim, so the straight track bulges and the straight ticks bow. On release it snaps back to the pill.
// The refraction is done by redrawing the picture under the capsule in small tiles through a lens map (no filters).
const W = 1920, H = 1080;
const X0 = 130, X1 = 1790, TY = 500, TH = 104;          // track
const REST = [290, 190], LENS = [800, 500];             // thumb size: pill → lens
const MAG = 2.1;                                        // magnification at the lens centre
const INK = '#f3f2ec', A = '#d4ff3a', LINE = '#3a3a47', MUTE = '#70707e', BG = '#0f0f13';
const TILE = 6, TICKS = 16;
let ctx, base, bctx;
function capsule(c, cx, cy, w, h) { c.beginPath(); c.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2); }
function drawBase(x) {
  bctx.fillStyle = BG; bctx.fillRect(0, 0, W, H);
  bctx.fillStyle = LINE; bctx.beginPath(); bctx.roundRect(X0, TY - TH / 2, X1 - X0, TH, TH / 2); bctx.fill();
  bctx.fillStyle = A; bctx.beginPath(); bctx.roundRect(X0, TY - TH / 2, x - X0, TH, TH / 2); bctx.fill();
  for (let i = 0; i <= TICKS; i++) {                     // tick marks under the track
    const tx = X0 + 52 + (i / TICKS) * (X1 - X0 - 104);
    bctx.fillStyle = tx <= x ? INK : MUTE;
    bctx.beginPath(); bctx.roundRect(tx - 12, TY + 92, 24, i % 2 ? 80 : 140, 12); bctx.fill();
  }
}
studio.clip({
  duration: 4,
  setup(root) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H; cv.className = 'glass';
    root.appendChild(cv);
    ctx = cv.getContext('2d');
    base = document.createElement('canvas'); base.width = W; base.height = H;
    bctx = base.getContext('2d');
  },
  render(t) {
    const { ease, progress, lerp, spring, clamp } = studio;
    const half = t < 2 ? t : t - 2;                      // the same gesture twice: there, then back
    const drag = ease.inOutCubic(progress(half, 0.45, 1.15));
    const pos = t < 2 ? drag : 1 - drag;
    const x = lerp(X0 + 0.27 * (X1 - X0), X0 + 0.73 * (X1 - X0), pos);
    // 0 = pill, 1 = lens: springs open on press, eases shut on release
    const s = half < 1.6 ? spring(half - 0.1, { stiffness: 320, damping: 15 }) : 1 - ease.outCubic(progress(half, 1.62, 0.3));
    const w = lerp(REST[0], LENS[0], s), h = lerp(REST[1], LENS[1], s);
    const m = 1 + (MAG - 1) * Math.max(0, s);
    const cy = TY + 36 * clamp(s);                       // the lens sits a little low so the ticks are inside it

    drawBase(x);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);

    // soft shadow under the glass
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 36;
    ctx.fillStyle = BG; capsule(ctx, x, cy, w, h); ctx.fill();
    ctx.restore();

    // the lens: every point inside shows the picture from nearer the centre — by 1/m in the middle, by nothing at the rim
    ctx.save();
    capsule(ctx, x, cy, w, h); ctx.clip();
    ctx.fillStyle = BG; ctx.fillRect(x - w / 2, cy - h / 2, w, h);
    const hw = w / 2, hh = h / 2;
    const k = (dx, dy) => {
      const u = dx / hw, v = dy / hh;
      const rho2 = Math.min(1, Math.sqrt(u * u * u * u + v * v * v * v));
      return 1 / m + (1 - 1 / m) * rho2;
    };
    for (let dy = -hh; dy < hh; dy += TILE) {
      for (let dx = -hw; dx < hw; dx += TILE) {
        const k0 = k(dx, dy), kx = k(dx + TILE, dy), ky = k(dx, dy + TILE);
        const sx0 = dx * k0, sy0 = dy * k0;
        const sw = Math.max(0.5, (dx + TILE) * kx - sx0), sh = Math.max(0.5, (dy + TILE) * ky - sy0);
        ctx.drawImage(base, x + sx0, cy + sy0, sw, sh, x + dx, cy + dy, TILE + 0.6, TILE + 0.6);
      }
    }
    // glass body: a faint milky tint, lighter at the top and the bottom lip
    const tint = ctx.createLinearGradient(0, cy - hh, 0, cy + hh);
    tint.addColorStop(0, 'rgba(255,255,255,.22)'); tint.addColorStop(0.45, 'rgba(255,255,255,.04)'); tint.addColorStop(1, 'rgba(255,255,255,.13)');
    ctx.fillStyle = tint; ctx.fillRect(x - hw, cy - hh, w, h);
    // at rest the thumb is opaque
    ctx.globalAlpha = clamp(1 - s * 1.6);
    ctx.fillStyle = INK; ctx.fillRect(x - hw, cy - hh, w, h);
    ctx.globalAlpha = 1;
    ctx.restore();

    // bright rim + specular arc on the upper-left edge
    const glassy = clamp(s * 1.6);
    ctx.lineWidth = 16;
    ctx.strokeStyle = `rgba(243,242,236,${0.6 + 0.4 * (1 - glassy)})`;
    capsule(ctx, x, cy, w - 16, h - 16); ctx.stroke();
    ctx.globalAlpha = glassy;
    ctx.lineCap = 'round'; ctx.lineWidth = 22; ctx.strokeStyle = '#ffffff';
    const r = h / 2 - 48;
    ctx.beginPath(); ctx.arc(x - w / 2 + h / 2, cy, r, Math.PI * 1.03, Math.PI * 1.5); ctx.lineTo(x - w / 2 + h / 2 + w * 0.2, cy - r); ctx.stroke();
    ctx.globalAlpha = 1;
  },
});
