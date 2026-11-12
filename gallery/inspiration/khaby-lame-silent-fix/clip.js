// Two shots. A: someone's over-complicated hack — a shaky close-up of a ball zigzagging down three ramps to reach a box.
// Hard cut. B: a locked-off, symmetrical shot — a figure puts the same ball into the same box in one straight move,
// then opens both arms, palms up. No words anywhere.
const { ease, lerp, progress } = studio;
const CUT = 1.9;
// shot A: the ball's route (centre points) over the ramps and into the box
const ROUTE = [[300, 133], [1100, 235], [1215, 412], [720, 475], [600, 628], [1215, 700], [1500, 893]];
const LEN = [0];
for (let i = 1; i < ROUTE.length; i++) LEN.push(LEN[i - 1] + Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]));
function along(u) {
  const d = u * LEN[LEN.length - 1];
  let i = 1;
  while (i < LEN.length - 1 && LEN[i] < d) i++;
  const k = (d - LEN[i - 1]) / (LEN[i] - LEN[i - 1]);
  return [lerp(ROUTE[i - 1][0], ROUTE[i][0], k), lerp(ROUTE[i - 1][1], ROUTE[i][1], k)];
}
// shot B: arm poses, [elbow, hand] for the screen-left and screen-right arm
const SHOULDER = { l: [800, 440], r: [1120, 440] };
const REST_L = [[670, 610], [640, 770]];
const OPEN = { l: [[590, 600], [380, 440]], r: [[1330, 600], [1540, 440]] };
const BALL_FROM = [1400, 300], BALL_TO = [960, 742];
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

let shotA, shotB, ballA, ballB, head, arms;
studio.clip({
  duration: 4,
  setup(root) {
    shotA = kit.el(root, 'shot a');
    kit.svg(shotA, `
      <g class="ramps">
        <line x1="220" y1="230" x2="1080" y2="340"/>
        <line x1="1560" y1="470" x2="700" y2="580"/>
        <line x1="360" y1="700" x2="1200" y2="800"/>
      </g>
      <circle class="ball" r="78"/>
      <path class="box" d="M1320 800 V1010 H1680 V800"/>`);
    ballA = shotA.querySelector('.ball');

    shotB = kit.el(root, 'shot b');
    kit.svg(shotB, `
      <rect class="body" x="770" y="380" width="380" height="600" rx="150"/>
      <circle class="body head" cx="960" cy="235" r="120"/>
      <rect class="table" x="0" y="850" width="1920" height="230"/>
      <rect class="inside" x="720" y="620" width="480" height="230"/>
      <polyline class="arm edge l"/><polyline class="arm l"/>
      <polyline class="arm edge r"/><polyline class="arm r"/>
      <circle class="ball" r="78"/>
      <path class="box" d="M720 620 V850 H1200 V620"/>`);
    ballB = shotB.querySelector('.ball');
    head = shotB.querySelector('.head');
    arms = { l: shotB.querySelectorAll('.arm.l'), r: shotB.querySelectorAll('.arm.r') };
  },
  render(t) {
    const inA = t < CUT;
    shotA.style.visibility = inA ? 'visible' : 'hidden';
    shotB.style.visibility = inA ? 'hidden' : 'visible';
    if (inA) {
      // handheld: the whole close-up wobbles (sums of sines — no randomness)
      const dx = Math.sin(t * 23) * 16 + Math.sin(t * 41 + 1) * 9;
      const dy = Math.cos(t * 29) * 13 + Math.sin(t * 47 + 2) * 8;
      const rot = Math.sin(t * 19 + 0.5) * 1.4;
      shotA.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1.09)`;
      const [x, y] = along(progress(t, 0.05, 1.6));
      ballA.setAttribute('cx', x); ballA.setAttribute('cy', y);
      return;
    }
    // the fix: one straight move (2.1 → 2.6), then the shrug (2.75 → 3.1) held to the end
    const put = ease.inOutCubic(progress(t, 2.1, 0.5));
    const open = ease.outBack(progress(t, 2.75, 0.35));
    const ball = mix(BALL_FROM, BALL_TO, put);
    ballB.setAttribute('cx', ball[0]); ballB.setAttribute('cy', ball[1]);
    const carryHand = [ball[0] + lerp(30, 80, put), ball[1] + lerp(105, -120, put)];
    const carryElbow = mix([1320, 570], [1270, 560], put);
    const pose = {
      l: [mix(REST_L[0], OPEN.l[0], open), mix(REST_L[1], OPEN.l[1], open)],
      r: [mix(carryElbow, OPEN.r[0], open), mix(carryHand, OPEN.r[1], open)],
    };
    for (const side of ['l', 'r']) {
      const pts = [SHOULDER[side], ...pose[side]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
      arms[side].forEach((a) => a.setAttribute('points', pts));
    }
    head.setAttribute('transform', `rotate(${9 * open} 960 300)`);
  },
});
