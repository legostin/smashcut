// Push-in through a letter: the camera accelerates into the flat stem of a letter, and as it fills the frame
// the stroke separates into vertical strands of different colours and depths — a curtain of light.
const N = 26;                                       // strands hidden inside the 180 px stem
const HUES = ['#d4ff3a', '#6a86ff', '#f3f2ec', '#d4ff3a', '#ff5c38', '#9fc400', '#6a86ff', '#eaff8f', '#d4ff3a', '#ff5c38', '#f3f2ec', '#b8e010', '#4a64e6'];
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const BASE = hex('#d4ff3a');
let letter, stem, strands;
studio.clip({
  duration: 4,
  setup(root) {
    letter = kit.el(root, 'letter');
    kit.el(letter, 'arm');
    stem = kit.el(letter, 'stem');
    strands = Array.from({ length: N }, (_, j) => ({
      el: kit.el(root, 'strand'),
      u: -90 + (j + 0.5) * (180 / N),               // centre of the strand inside the stem, px from the stem axis
      depth: 0.86 + 0.34 * ((j * 7) % N) / N,        // nearer strands spread faster (parallax)
      rgb: hex(HUES[(j * 5) % HUES.length]),
      thin: 0.3 + 0.42 * ((j * 11) % N) / N,         // final width as a share of its slot: dark shows between strands
    }));
  },
  render(t) {
    const { progress: P, ease, lerp, clamp } = studio;
    const push = ease.inQuad(P(t, 0.5, 1.75)) + 0.15 * P(t, 2.25, 1.75);   // accelerate in, then keep creeping forward
    const S = Math.pow(16, push);                    // camera scale: 1× → 16× → a little further
    const split = ease.inOutQuad(clamp((S - 2.2) / 7));                  // 0 = solid stroke, 1 = separate strands
    const fade = P(t, 0, 0.3) * (1 - P(t, 3.55, 0.4));
    letter.style.transform = `scale(${S.toFixed(4)})`;
    letter.style.opacity = fade.toFixed(3);
    stem.style.opacity = (1 - split).toFixed(3);    // the flat stroke dissolves into its strands; dark shows between them
    const slot = 180 / N;
    for (const s of strands) {
      const d = lerp(1, s.depth, split);
      const w = slot * S * d * lerp(1.04, s.thin, split);
      const x = 960 + s.u * S * d - w / 2;
      const c = s.rgb.map((v, i) => Math.round(lerp(BASE[i], v, split)));
      const shimmer = 0.9 + 0.1 * Math.sin(2 * Math.PI * t * 0.5 + s.u);
      s.el.style.transform = `translateX(${x.toFixed(1)}px) scaleX(${(w / 100).toFixed(4)})`;
      s.el.style.background = `rgb(${c.join(',')})`;
      s.el.style.opacity = (fade * (split > 0 ? lerp(1, shimmer, split) : 0)).toFixed(3);
    }
  },
});
