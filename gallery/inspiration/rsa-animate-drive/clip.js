// Whiteboard draw-on: marker lines ink in one stroke after another (the accent colour last), a pen rides the end of the
// line being drawn, and the view keeps sliding along one long sheet — finished drawings leave on the left while the next
// one is already being drawn on the right, joined by an arrow. The sheet repeats every two drawings, so the loop is exact.
const GAP = 1100;                                   // distance between drawings on the sheet
// [path, start, duration, red?] — times are relative to the drawing's own clock (it is mid-frame at 0.6 s)
const BULB = [
  ['M -72 130 C -84 50 -196 20 -192 -96 C -188 -214 -98 -286 4 -284 C 108 -282 194 -204 190 -92 C 186 22 84 56 74 128', -0.40, 0.55],
  ['M -80 178 Q 0 166 78 172', 0.15, 0.14],
  ['M -62 232 Q 4 222 60 226', 0.29, 0.13],
  ['M -44 118 L -66 -44 L -22 -98 L 2 -36 L 28 -98 L 70 -46 L 46 118', 0.42, 0.38],
  ['M -262 -228 L -340 -284', 0.80, 0.12, 1],
  ['M 2 -356 L -4 -448', 0.92, 0.12, 1],
  ['M 266 -228 L 346 -288', 1.04, 0.12, 1],
  ['M 420 -20 C 530 -92 640 -86 752 -8', 1.16, 0.32],
  ['M 690 -74 L 756 -6 L 672 28', 1.48, 0.14],
];
const CHART = [
  ['M -262 -322 Q -252 -40 -258 252 Q 20 240 318 246', -0.40, 0.45],
  ['M -176 240 L -172 96 L -84 92 L -82 240', 0.05, 0.25],
  ['M -22 240 L -20 -22 L 70 -26 L 72 240', 0.30, 0.25],
  ['M 132 240 L 134 -152 L 222 -156 L 224 240', 0.55, 0.25],
  ['M -200 -60 C -90 -100 60 -200 250 -318', 0.80, 0.25, 1],
  ['M 160 -334 L 256 -322 L 216 -236', 1.05, 0.11, 1],
  ['M 380 -20 C 490 -92 600 -86 712 -8', 1.16, 0.32],
  ['M 650 -74 L 716 -6 L 632 28', 1.48, 0.14],
];
const pan = (t) => 550 * (t - 0.6) - 150 * Math.sin(Math.PI * (t - 0.6));   // always moving, slowest while a drawing is mid-frame
let insts, pen;
studio.clip({
  duration: 4,
  setup(root) {
    kit.el(root, 'paper');
    const svg = kit.svg(root);
    const NS = 'http://www.w3.org/2000/svg';
    insts = [];
    for (let k = -1; k <= 2; k++) {
      const g = document.createElementNS(NS, 'g');
      svg.appendChild(g);
      const def = k % 2 === 0 ? BULB : CHART;
      const strokes = def.map(([d, start, dur, red]) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        if (red) p.setAttribute('class', 'red');
        g.appendChild(p);
        return { p, start, dur, len: p.getTotalLength() };
      });
      insts.push({ k, g, strokes, y: k % 2 === 0 ? 640 : 580 });
    }
    pen = document.createElementNS(NS, 'g');
    pen.setAttribute('class', 'pen');
    pen.innerHTML = '<path class="nib" d="M 14 -14 L 60 -60"/><path d="M 78 -78 L 300 -300"/><path class="cap" d="M 300 -300 L 356 -356"/>';
    svg.appendChild(pen);
  },
  render(t) {
    const shift = pan(t);
    let tip = null, tipAt = -1e9;
    for (const it of insts) {
      const x = 960 + GAP * it.k - shift;
      it.g.setAttribute('transform', `translate(${x} ${it.y})`);
      const tau = t - 2 * it.k;
      for (const s of it.strokes) {
        const p = studio.progress(tau, s.start, s.dur);
        s.p.style.display = p > 0 ? '' : 'none';
        s.p.style.strokeDasharray = `${p * s.len} ${s.len + 60}`;
        // the pen rides the stroke that started most recently
        const began = 2 * it.k + s.start;
        if (p > 0 && began > tipAt) {
          const pt = s.p.getPointAtLength(p * s.len);
          tip = [x + pt.x, it.y + pt.y]; tipAt = began;
        }
      }
    }
    if (tip) pen.setAttribute('transform', `translate(${tip[0]} ${tip[1]})`);
  },
});
