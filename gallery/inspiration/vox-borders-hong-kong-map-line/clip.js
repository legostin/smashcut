// Map explainer: on a paper map a red line draws itself along the border, then a label lands on each side of it
// and a date callout stamps in. The overlays fade and the bare map starts again.
const BORDER = 'M 420 600 C 560 640, 640 520, 820 560 S 1040 600, 1160 550 S 1380 470, 1500 520';
let map, line, north, south, date, leader, over;
studio.clip({
  duration: 4,
  setup(root) {
    root.classList.add('light');
    map = kit.el(root, 'map');
    const svg = kit.svg(map, `
      <rect x="-100" y="-100" width="2120" height="1280" fill="#b7d0d6"/>
      <path d="M -50 -50 L 1970 -50 L 1970 360 C 1850 380, 1800 480, 1700 460 C 1620 445, 1560 480, 1500 520 L 1400 640 L 520 700 L 420 600
               C 330 560, 280 470, 180 500 C 100 525, 60 440, -50 460 Z" fill="#efe8d4" stroke="#b9ab86" stroke-width="8"/>
      <path d="${BORDER} C 1640 640, 1580 820, 1420 900 C 1300 960, 1250 1130, 1100 1130 L 700 1130
               C 620 1000, 480 1000, 400 880 C 330 780, 340 680, 420 600 Z" fill="#d8c79f" stroke="#b9ab86" stroke-width="8"/>
      <path d="M 640 -50 V 1130 M 1280 -50 V 1130 M -50 540 H 1970" stroke="#000" stroke-opacity="0.07" stroke-width="8" fill="none"/>
      <path class="border" d="${BORDER}" pathLength="1" fill="none" stroke="#e5311d" stroke-width="38" stroke-linecap="round" stroke-dasharray="1 2"/>
      <g class="leader"><path d="M 1500 330 L 1415 462" stroke="#15151a" stroke-width="12" stroke-linecap="round"/><circle cx="1410" cy="470" r="24" fill="#15151a"/></g>
    `);
    line = svg.querySelector('.border');
    leader = svg.querySelector('.leader');
    over = kit.el(map, 'over');
    north = kit.el(over, 'tag north', null, 'NORTH');
    south = kit.el(over, 'tag south', null, 'SOUTH');
    date = kit.el(over, 'tag date', null, '1960');
  },
  render(t) {
    const { clamp, progress, ease } = studio;
    const out = 1 - progress(t, 3.55, 0.4);                      // everything drawn on the map fades before the loop
    map.style.transform = `scale(${1 + 0.05 * Math.sin((Math.PI * t) / 4)})`;   // slow push-in that breathes back

    const draw = ease.inOutQuad(progress(t, 0.25, 1.2));
    line.style.strokeDashoffset = 1 - draw;
    line.style.opacity = draw > 0 ? out : 0;

    const pop = (el, at) => {
      const p = progress(t, at, 0.28);
      el.style.opacity = p > 0 ? out : 0;
      el.style.transform = `translate(-50%, -50%) scale(${0.5 + 0.5 * ease.outBack(p)})`;
    };
    pop(north, 1.6);
    pop(south, 1.9);

    const s = progress(t, 2.35, 0.22);                           // the date stamps in from above the paper
    date.style.opacity = s > 0 ? out * clamp(s * 3) : 0;
    date.style.transform = `translate(-50%, -50%) scale(${1.7 - 0.7 * ease.outCubic(s)})`;
    leader.style.opacity = out * progress(t, 2.5, 0.15);
  },
});
