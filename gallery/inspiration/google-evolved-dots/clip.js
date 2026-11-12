// Logo states: a word collapses into four dots, the dots stretch into voice-level bars, then everything folds back.
// No fades — every shape turns into the next one.
const WORD = 'MOTION';
const COLORS = ['#d4ff3a', '#ff5c38', '#6a86ff', '#f3f2ec'];
const TO_DOT = [0, 1, 1, 2, 2, 3];                  // which dot each letter falls into
const SIZE = 200, GAP = 130, CY = 540;
const dotX = (i) => 960 + (i - 1.5) * (SIZE + GAP);
let letters, dots;
studio.clip({
  duration: 4,
  setup(root) {
    const word = kit.el(root, 'word');
    letters = [...WORD].map((ch, i) => kit.el(word, 'ltr', { color: COLORS[TO_DOT[i]] }, ch));
    dots = COLORS.map((c) => kit.el(root, 'dot', { background: c }));
  },
  render(t) {
    const { progress: P, ease, lerp } = studio;
    // 0 = word, 1 = dots: collapse at 0.55 s, expand again at 3.45 s (mirror image, so the loop closes on the word)
    const k = ease.inOutCubic(P(t, 0.55, 0.45)) - ease.inOutCubic(P(t, 3.45, 0.45));
    letters.forEach((el, i) => {
      const cx = el.offsetLeft + el.offsetWidth / 2;
      const dx = (dotX(TO_DOT[i]) - cx) * k;
      const arc = -110 * Math.sin(Math.PI * k) * (i % 2 ? 1 : -1);   // short arcs, alternating over and under
      el.style.transform = `translate(${dx.toFixed(1)}px, ${arc.toFixed(1)}px) scale(${Math.max(0, 1 - 1.25 * k).toFixed(3)})`;
    });
    // bars: 0 = dot, 1 = level meter (1.5 s → 3.2 s)
    const m = ease.outCubic(P(t, 1.5, 0.25)) - ease.inOutCubic(P(t, 3.05, 0.3));
    dots.forEach((el, i) => {
      const grow = studio.clamp((k - 0.45) / 0.55);                  // the dot swells as the letters pour in
      const wave = Math.max(0, Math.sin(2 * Math.PI * (t - 1.0) / 0.5 - i * 1.1)) * 90 * (P(t, 0.95, 0.1) - P(t, 1.45, 0.1));
      const level = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t - 1.5) * [2.1, 3.2, 2.6, 3.7][i] + [0.4, 2.2, 4.1, 1.3][i]);
      const h = SIZE + m * (100 + 600 * level);
      const s = ease.outBack(grow);
      el.style.width = SIZE + 'px';
      el.style.height = h.toFixed(1) + 'px';
      el.style.transform = `translate(${(dotX(i) - SIZE / 2).toFixed(1)}px, ${(CY - h / 2 - wave).toFixed(1)}px) scale(${s.toFixed(3)})`;
    });
  },
});
