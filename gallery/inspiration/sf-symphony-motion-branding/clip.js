// Per-letter vertical stretch: every letter of a serif word keeps its width and place on the baseline
// but takes its own height from a wave travelling across the word — type behaving like a level meter.
const WORD = 'SOUND';
const PITCH = 328, BASE = 850;                      // letter spacing and the shared baseline
let letters;
studio.clip({
  duration: 4,
  setup(root) {
    const svg = kit.svg(root, [...WORD].map((ch) => `<text class="ltr">${ch}</text>`).join(''));
    letters = [...svg.querySelectorAll('text')];
  },
  render(t) {
    const w = 2 * Math.PI * t / 4;                   // one loop = one full turn, so every term below closes seamlessly
    letters.forEach((el, i) => {
      const x = 960 + (i - (WORD.length - 1) / 2) * PITCH;
      // a wave running along the word (2 per loop) plus a faster ripple, so no two letters ever match
      const h = 1.2 + 0.62 * Math.sin(2 * w - i * 1.35) + 0.2 * Math.sin(3 * w + i * 2.3);
      el.setAttribute('transform', `translate(${x} ${BASE}) scale(1 ${h.toFixed(4)})`);
    });
  },
});
