// One unbroken take: the presenter never moves and nothing is cut. The set is three flats that are physically
// swapped behind him: flat A is hoisted up, flat C closes in from both sides like sliding doors, flat A drops back down.
const { ease, progress } = studio;
let flatA, cL, cR;
studio.clip({
  duration: 4,
  setup(root) {
    kit.el(root, 'floor');
    const frame = kit.el(root, 'frame');               // the opening the flats live in
    const b = kit.el(frame, 'flat b');                 // set B: sea and sun (always there, at the back)
    kit.el(b, 'sun');
    kit.el(b, 'water');
    cL = kit.el(frame, 'door l');                      // set C: two sliding halves of one flat
    kit.el(kit.el(cL, 'flat c'), 'moon');
    cR = kit.el(frame, 'door r');
    kit.el(kit.el(cR, 'flat c'), 'moon');
    flatA = kit.el(frame, 'flat a');                   // set A: tiled wall, hung from above
    const who = kit.el(root, 'who');                   // the presenter: on top of everything, never touched in render()
    kit.el(who, 'body');
    kit.el(who, 'head');
  },
  render(t) {
    // A: down at t = 0, hoisted away 0.5 → 1.3, dropped back 3.2 → 4.0
    const up = ease.inOutCubic(progress(t, 0.5, 0.8)) - ease.inOutCubic(progress(t, 3.2, 0.8));
    flatA.style.transform = `translateY(${-940 * up}px)`;
    // C: the two halves meet behind the presenter 1.85 → 2.65; they reset out of sight once A is down again
    const shut = ease.inOutCubic(progress(t, 1.85, 0.8));
    cL.style.transform = `translateX(${-800 * (1 - shut)}px)`;
    cR.style.transform = `translateX(${800 * (1 - shut)}px)`;
  },
});
