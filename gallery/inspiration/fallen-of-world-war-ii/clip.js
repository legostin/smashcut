// Unit pictograms: every tiny figure is one unit, stacked in blocks of twelve. Three columns fill row by row at the
// same speed; two stop early, the third shoots out of the top of the frame — the camera has to climb the whole
// column to find where it ends, then pulls back to show the scale.
const ICON = 72, ROW = 120, PER_ROW = 4, BLOCK_ROWS = 3, GAP = 60, BASE = 960, RATE = 12;   // RATE = rows per second
const BLOCK = BLOCK_ROWS * ROW + GAP;
const COLS = [{ x: 440, blocks: 1, color: '#6a86ff' }, { x: 960, blocks: 7, color: '#ff5c38' }, { x: 1480, blocks: 2, color: '#d4ff3a' }];
const TOP = COLS[1].blocks * BLOCK - GAP;                    // height of the tall column
const tile = (c) => {
  let s = '';
  for (let r = 0; r < BLOCK_ROWS; r++) for (let k = 0; k < PER_ROW; k++) {
    const x = k * ICON, y = GAP + r * ROW;
    s += `<circle cx="${x + 36}" cy="${y + 25}" r="17"/><rect x="${x + 15}" y="${y + 48}" width="42" height="66" rx="17"/>`;
  }
  return 'url("data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON * PER_ROW} ${BLOCK}" fill="${c}">${s}</svg>`) + '")';
};
// constant speed with short eased ends
const travel = (u, r = 0.15) => { const v = 1 / (1 - r); return u < r ? (v * u * u) / (2 * r) : u > 1 - r ? 1 - (v * (1 - u) * (1 - u)) / (2 * r) : v * (u - r / 2); };
let world, base, marks, cols;
studio.clip({
  duration: 4,
  setup(root) {
    world = kit.el(root, 'world');
    marks = [];
    for (let k = 1; k <= 9; k++) marks.push(kit.el(world, 'mark', { top: BASE - k * BLOCK + GAP / 2 + 'px' }));   // a height line between blocks
    cols = COLS.map((c) => kit.el(world, 'col', { left: c.x - (ICON * PER_ROW) / 2 + 'px', width: ICON * PER_ROW + 'px', backgroundImage: tile(c.color), backgroundSize: `${ICON * PER_ROW}px ${BLOCK}px` }));
    base = kit.el(world, 'base');
  },
  render(t) {
    const { clamp, lerp, ease, progress } = studio;
    const filled = Math.floor(clamp(t - 0.1, 0, 9) * RATE + 0.001);       // whole rows only: it stacks, it does not grow
    // camera: rests on the baseline, climbs to the top of the tall column, pulls back, returns as the figures fade
    const climb = (TOP - 820) * travel(progress(t, 0.55, 2.05));
    const back = ease.inOutCubic(progress(t, 2.8, 0.4)) - ease.inOutCubic(progress(t, 3.65, 0.35));
    const s = lerp(1, 0.33, back);
    const ty = t < 3.65 ? lerp(climb, 40, back) : 40 * back;
    world.style.transform = `translateY(${ty}px) scale(${s})`;
    const fade = 1 - progress(t, 3.6, 0.3);
    cols.forEach((el, i) => {
      const rows = Math.min(filled, COLS[i].blocks * BLOCK_ROWS);
      const h = Math.floor(rows / BLOCK_ROWS) * BLOCK + (rows % BLOCK_ROWS) * ROW - (rows && rows % BLOCK_ROWS === 0 ? GAP : 0);
      el.style.top = BASE - h + 'px';
      el.style.height = h + 'px';
      el.style.opacity = fade;
    });
    base.style.height = 14 / s + 'px';                                    // keep lines readable when pulled back
    marks.forEach((m) => { m.style.height = 8 / s + 'px'; });
  },
});
