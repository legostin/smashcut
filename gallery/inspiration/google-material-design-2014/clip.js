// Circular reveal: a touch lands on the surface and a hard-edged circle of the next colour scheme grows from exactly
// that point until it covers the whole card. The card never moves — only what is painted on it changes.
// Two reveals per loop from two different touch points, the second one returns to the starting scheme.
const P1 = [1110, 590], P2 = [210, 190];       // touch points (card coordinates) — the round buttons
const R = 1300;                                 // reaches the farthest corner from either point
const fastOutSlowIn = (p) => {                  // cubic-bezier(0.4, 0, 0.2, 1), solved by bisection
  let lo = 0, hi = 1, u = p;
  for (let i = 0; i < 24; i++) {
    u = (lo + hi) / 2;
    const x = 3 * u * (1 - u) * (1 - u) * 0.4 + 3 * u * u * (1 - u) * 0.2 + u * u * u;
    if (x < p) lo = u; else hi = u;
  }
  return 3 * u * u * (1 - u) + u * u * u;
};
let y, x2, touch;
function layer(card, cls) {
  const l = kit.el(card, 'layer ' + cls);
  kit.el(l, 'bar one'); kit.el(l, 'bar two'); kit.el(l, 'fab');
  return l;
}
studio.clip({
  duration: 4,
  setup(root) {
    const card = kit.el(root, 'card');
    layer(card, 'x');
    y = layer(card, 'y');
    x2 = layer(card, 'x');
    touch = kit.el(card, 'touch');
  },
  render(t) {
    const g1 = fastOutSlowIn(studio.progress(t, 0.4, 1.2));
    const g2 = fastOutSlowIn(studio.progress(t, 2.4, 1.2));
    y.style.clipPath = `circle(${g1 * R}px at ${P1[0]}px ${P1[1]}px)`;
    x2.style.clipPath = `circle(${g2 * R}px at ${P2[0]}px ${P2[1]}px)`;
    // the touch: a dark dot presses in just before each reveal and fades as the circle leaves it
    const second = t >= 2;
    const lt = second ? t - 2 : t;
    const [px, py] = second ? P2 : P1;
    const inP = studio.ease.outCubic(studio.progress(lt, 0.1, 0.25));
    const out = studio.progress(lt, 0.5, 0.4);
    touch.style.left = px + 'px';
    touch.style.top = py + 'px';
    touch.style.opacity = inP * (1 - out);
    touch.style.transform = `scale(${studio.lerp(1.7, 1, inP)})`;
  },
});
