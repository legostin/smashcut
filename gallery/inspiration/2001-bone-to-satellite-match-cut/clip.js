// Graphic match cut: a thrown object tumbles up through a daylight world; at the top of its arc we hard-cut to
// another world where an object of the same shape sits at the same place and angle and drifts on.
// The cut back (the loop point) is matched the same way, so the silhouette never jumps — only the world does.
const { ease, lerp } = studio;
const CUT = 2;
const P0 = { x: 700, y: 640, a: -495 };   // where shot A starts (−495° looks the same as 45° for this shape)
const P1 = { x: 1150, y: 420, a: 25 };    // the cut: top of the throw
const P2 = { x: 700, y: 640, a: 45 };     // where shot B ends = where shot A starts
let worldA, worldB, obj;
studio.clip({
  duration: 4,
  setup(root) {
    worldA = kit.el(root, 'world a');
    kit.el(worldA, 'hill');
    kit.el(worldA, 'ground');
    worldB = kit.el(root, 'world b');
    kit.el(worldB, 'planet');
    [[230, 190], [1640, 170], [1760, 620], [330, 900]].forEach(([x, y]) =>
      kit.el(worldB, 'star', { left: x + 'px', top: y + 'px' }));
    obj = kit.el(root, 'obj');
    kit.el(obj, 'shaft');
    kit.el(obj, 'knob l');
    kit.el(obj, 'knob r');
  },
  render(t) {
    const inA = t < CUT;
    worldA.style.visibility = inA ? 'visible' : 'hidden';
    worldB.style.visibility = inA ? 'hidden' : 'visible';
    obj.classList.toggle('sat', !inA);
    let x, y, a;
    if (inA) {                                   // thrown: fast tumble, slowing toward the top of the arc
      const u = ease.outQuad(t / CUT);
      x = lerp(P0.x, P1.x, u); y = lerp(P0.y, P1.y, u); a = lerp(P0.a, P1.a, u);
    } else {                                     // weightless: a slow, even drift
      const u = (t - CUT) / (4 - CUT);
      x = lerp(P1.x, P2.x, u); y = lerp(P1.y, P2.y, u); a = lerp(P1.a, P2.a, u);
    }
    obj.style.transform = `translate(${x}px, ${y}px) rotate(${a}deg)`;
  },
});
