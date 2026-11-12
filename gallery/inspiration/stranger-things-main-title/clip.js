// Macro letterform assembly: hollow glowing outlines drift through the frame in extreme close-up,
// each letter on its own depth and sideways offset, while one constant pull-back locks them into a single word.
const WORD = 'TITLE';
const ZOOM = 4.3;                                   // how close the close-up starts
const DEPTH = [1.0, 1.22, 0.84, 1.16, 0.9];         // each letter recedes at its own rate (parallax)
const SIDE = [-60, 150, 330, 560, 820];             // extra sideways offset from the final place, in word px
const RISE = [0, 70, -60, 50, -40];
let glow, letters;
studio.clip({
  duration: 4,
  setup(root) {
    glow = kit.el(root, 'glow');
    const word = kit.el(glow, 'word');
    letters = [...WORD].map((ch) => kit.el(word, 'ltr', null, ch));
  },
  render(t) {
    const p = studio.progress(t, 0, 2.6);            // constant-speed pull-back, no easing
    const k = 1 - p;
    const cam = -520 * k;                            // the frame starts on the first letter and slides to the centre
    letters.forEach((el, i) => {
      const s = Math.pow(ZOOM, DEPTH[i] * k);
      const cx = el.offsetLeft + el.offsetWidth / 2 - 960;
      const x = (cx - cam) * s - cx + SIDE[i] * k * s;
      const y = RISE[i] * k * s;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
    });
    // locked: a short surge of the glow, then a slow fade to black; fade in again on the first fragments
    const lock = studio.progress(t, 2.6, 0.3);
    const surge = lock > 0 && lock < 1 ? 1 + 0.7 * Math.sin(Math.PI * lock) : 1;
    const fade = studio.progress(t, 0, 0.25) * (1 - studio.progress(t, 3.6, 0.38));
    glow.style.opacity = fade.toFixed(3);
    glow.style.filter = `drop-shadow(0 0 ${(12 * surge).toFixed(1)}px #d4ff3a) drop-shadow(0 0 ${(44 * surge).toFixed(1)}px rgba(212,255,58,${Math.min(1, 0.6 * surge).toFixed(2)}))`;
  },
});
