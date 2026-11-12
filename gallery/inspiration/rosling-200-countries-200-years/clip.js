// Animated bubble chart: the axes never move; time is the only variable. A giant year counts up behind the plot
// while every bubble drifts along its own path from lower-left to upper-right (some lag, some dip). Then a fast rewind.
// [startX, startY, endX, endY, radius, colour, lag (1 = steady, >1 = late starter), dip]
const B = [
  [520, 810, 1500, 300, 120, 'a', 1.0, 0], [640, 840, 1720, 440, 100, 'c', 1.1, 0], [420, 800, 1250, 420, 90, 'b', 1.2, 0],
  [600, 760, 1680, 190, 70, 'b', 0.9, 0], [270, 850, 640, 790, 70, 'b', 2.6, 0], [330, 860, 1000, 580, 60, 'c', 1.0, 0],
  [560, 720, 1560, 600, 55, 'b', 1.3, 170], [460, 700, 1380, 540, 50, 'a', 1.4, 0], [300, 750, 840, 650, 45, 'c', 2.2, 0],
  [700, 800, 1800, 300, 45, 'a', 0.8, 0], [380, 880, 1120, 280, 42, 'a', 1.6, 220], [500, 790, 1300, 170, 36, 'c', 1.0, 0],
];
const COLOR = { a: '#d4ff3a', b: '#ff5c38', c: '#6a86ff' };
let year, dots;
studio.clip({
  duration: 4,
  setup(root) {
    year = kit.el(root, 'year');
    dots = B.map((b) => kit.el(root, 'dot', { width: b[4] * 2 + 'px', height: b[4] * 2 + 'px', marginLeft: -b[4] + 'px', marginTop: -b[4] + 'px', background: COLOR[b[5]] }));
    kit.svg(root, `<path d="M 150 60 V 965 H 1870 M 150 280 h 44 M 150 510 h 44 M 150 740 h 44 M 580 965 v -44 M 1010 965 v -44 M 1440 965 v -44"
      fill="none" stroke="#8a8a99" stroke-width="16" stroke-linecap="square"/>`);
  },
  render(t) {
    const { clamp, lerp, ease } = studio;
    // 0 → 1 at constant speed (time feels uniform), then a quick rewind to the first year
    const p = t < 3.3 ? t / 3.3 : 1 - ease.inOutCubic(clamp((t - 3.3) / 0.7));
    year.textContent = String(1800 + Math.round(p * 200));
    B.forEach((b, i) => {
      const q = Math.pow(p, b[6]);
      const dip = b[7] * Math.sin(Math.PI * clamp((p - 0.35) / 0.3));       // a setback: drops, then recovers
      const x = lerp(b[0], b[2], q) + Math.sin(p * 9 + i) * 14 * p;
      const y = lerp(b[1], b[3], q) + dip + Math.cos(p * 7 + i * 2) * 14 * p;
      dots[i].style.transform = `translate(${x}px, ${y}px) scale(${lerp(0.55, 1, q)})`;
    });
  },
});
