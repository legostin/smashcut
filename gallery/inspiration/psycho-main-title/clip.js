// Bars carry type: grey bars shoot across the frame on straight paths, three slices of one word ride in with them,
// stop out of register, snap together, and later shear apart and leave with the bars. Linear motion only.
const ROWS = 7, PITCH = 180, TOP = -90;             // the frame is ruled into rows; the word fills rows 2-4 (y 270..810)
const ORDER = [3, 0, 5, 2, 6, 1, 4];                // stagger of the bars
const OFF = 44;                                     // how far out of register the slices stop
const WORD_TOP = 270 - 77;                          // capitals span y 270..810
let bars, bands;
const dirOf = (r) => (r % 2 ? -1 : 1);              // even rows travel left→right, odd rows right→left
studio.clip({
  duration: 4,
  setup(root) {
    bars = Array.from({ length: ROWS }, (_, r) => kit.el(root, 'bar', { top: TOP + r * PITCH + 48 + 'px' }));
    bands = [2, 3, 4].map((r) => {
      const band = kit.el(root, 'band', { top: TOP + r * PITCH + 'px' });
      const slide = kit.el(band, 'slide');
      kit.el(slide, 'word', { top: WORD_TOP - (TOP + r * PITCH) + 'px' }, 'TITLE');
      return { r, slide };
    });
  },
  render(t) {
    const P = studio.progress;
    // travel of row r, in frame widths: -1 = waiting off-screen, 0 = across the frame, +1 = gone
    const travel = (r) => {
      const d = ORDER[r] * 0.03;
      return -1 + P(t, 0.08 + d, 0.42) + P(t, 1.3 + d, 0.42) - 2 * P(t, 2.2, 0.001) + P(t, 2.3 + d, 0.42) + P(t, 3.3 + d, 0.42);
    };
    bars.forEach((b, r) => { b.style.transform = `translateX(${(dirOf(r) * travel(r) * 1920).toFixed(1)}px)`; });
    for (const { r, slide } of bands) {
      const d = ORDER[r] * 0.03;
      // ride in with the bar and stop short → snap into register (3 frames) → shear past it → ride out with the bar
      const x = -1920 * (1 - P(t, 0.08 + d, 0.42)) - OFF * (1 - P(t, 0.96, 0.125)) + OFF * P(t, 2.96, 0.125) + 1920 * P(t, 3.3 + d, 0.42);
      slide.style.transform = `translateX(${(dirOf(r) * x).toFixed(1)}px)`;
    }
  },
});
