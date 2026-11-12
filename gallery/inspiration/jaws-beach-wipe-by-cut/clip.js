// Wipe-by cut: the watcher never moves. Each time a passer-by crosses close to the lens and covers him,
// the shot behind the silhouette is swapped for a tighter one (wide → medium → close). The loop point is hidden the same way.
const CUTS = [0, 4 / 3, 8 / 3];          // a cut every 1.33 s, each one under a passer-by
const SCALE = [0.27, 0.56, 1];           // framing of the watcher in the three shots
const CROSS = 0.62;                      // seconds a passer-by needs to cross the frame
let watcher, passers;
studio.clip({
  duration: 4,
  setup(root) {
    kit.el(root, 'sea');
    kit.el(root, 'sand');
    watcher = kit.el(root, 'watcher');
    kit.el(watcher, 'w-body');
    kit.el(watcher, 'w-head');
    passers = CUTS.map(() => {
      const p = kit.el(root, 'passer');
      kit.el(p, 'p-body');
      kit.el(p, 'p-head');
      return p;
    });
  },
  render(t) {
    const shot = t < CUTS[1] ? 0 : t < CUTS[2] ? 1 : 2;
    watcher.style.transform = `scale(${SCALE[shot]})`;
    passers.forEach((p, i) => {
      let d = t - CUTS[i];                               // time since this passer-by's cut
      if (d > 2) d -= 4;                                 // the one at the loop point straddles t = 4 → 0
      const u = d / CROSS + 0.5;                         // 0 → 1 across the frame, 0.5 exactly on the cut
      const dir = i % 2 ? -1 : 1;
      const x = 960 + dir * (u - 0.5) * 3500;
      p.style.transform = `translateX(${x}px)`;
      p.style.visibility = u > -0.02 && u < 1.02 ? 'visible' : 'hidden';
    });
  },
});
