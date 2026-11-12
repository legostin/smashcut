// Rostrum-camera move on a still: nothing inside the photograph moves. The camera drifts across it at a constant
// rate and pushes in until one face fills the frame, then dissolves back to the wide framing (the loop point).
const { lerp, progress } = studio;
const PEOPLE = [                                   // x, head-centre y, hat
  [300, 400, 1], [625, 365, 0], [950, 395, 1], [1275, 350, 0], [1600, 385, 1],
];
const FROM = { x: 960, y: 540, s: 0.8 };          // wide: the whole print, edges and all
const TO = { x: 1275, y: 356, s: 7.5 };           // tight: the fourth face
const MOVE = 4.4, FADE = 0.4;                     // one move lasts 4.4 s; the last 0.4 s overlaps the next one
let layers;

function photo(parent) {
  const ph = kit.el(parent, 'photo');
  kit.el(ph, 'sky');
  kit.el(ph, 'ground');
  for (const [x, y, hat] of PEOPLE) {
    const f = kit.el(ph, 'fig', { left: x + 'px', top: y + 'px' });
    kit.el(f, 'torso');
    if (hat) kit.el(f, 'hat');
    const face = kit.el(f, 'face');
    kit.el(face, 'eye l');
    kit.el(face, 'eye r');
  }
  kit.el(ph, 'vignette');
  kit.el(ph, 'edge');
  return ph;
}
function camera(ph, tau) {                         // tau: seconds into this layer's move
  const p = tau / MOVE;
  const s = FROM.s * Math.pow(TO.s / FROM.s, p);   // constant zoom rate, no easing
  const x = lerp(FROM.x, TO.x, p), y = lerp(FROM.y, TO.y, p);
  ph.style.transform = `translate(${960 - x * s}px, ${540 - y * s}px) scale(${s})`;
}
studio.clip({
  duration: 4,
  setup(root) {
    layers = [photo(kit.el(root, 'fill')), photo(kit.el(root, 'fill'))];
  },
  render(t) {
    camera(layers[0], t + FADE);                   // the move we are watching
    const next = layers[1];                        // the next move, dissolving in on top during the last 0.4 s
    const o = progress(t, 4 - FADE, FADE);
    next.parentNode.style.opacity = o;
    next.parentNode.style.visibility = o > 0 ? 'visible' : 'hidden';
    camera(next, t - (4 - FADE));
  },
});
