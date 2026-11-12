// Split-screen match cut: two different shots share one frame, and the motion of the left half continues in the right.
// Both halves cut to new "footage" every second (new colours, solid vs outline), yet the body crossing the seam never breaks.
const SHOTS = {
  l: [['#ff5c38', '#f3f2ec'], ['#1b1b22', '#d4ff3a'], ['#6a86ff', '#0f0f13'], ['#f3f2ec', '#ff5c38']],
  r: [['#1b1b22', '#d4ff3a'], ['#f3f2ec', '#6a86ff'], ['#d4ff3a', '#0f0f13'], ['#0f0f13', '#f3f2ec']],
};
let parts;
studio.clip({
  duration: 4,
  setup(root) {
    parts = ['l', 'r'].map((side) => {
      const half = kit.el(root, 'half ' + side);
      const world = kit.el(half, 'world');
      return { side, half, bar: kit.el(world, 'bar'), ball: kit.el(world, 'ball') };
    });
    kit.el(root, 'seam');
  },
  render(t) {
    const shot = Math.min(3, Math.floor(t));           // a cut every second, on both halves at once
    const y = Math.sin(Math.PI * t) * 190;            // one continuous move across all cuts
    const rot = t * 90;
    for (const p of parts) {
      const [bg, fg] = SHOTS[p.side][shot];
      p.half.style.background = bg;
      p.ball.style.background = fg;
      p.ball.style.borderColor = fg;
      p.ball.style.transform = `translateY(${y}px)`;
      p.bar.style.background = fg;
      p.bar.style.transform = `translateY(${y}px) rotate(${rot}deg)`;
    }
  },
});
