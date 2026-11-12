// One second per day: four unrelated little shots, each exactly 1.0 s, hard cuts only, and a date stamp
// in the corner that advances by one day on every cut. Each shot drifts a little so it reads as footage, not a slide.
const DAYS = ['MAR 14', 'MAR 15', 'MAR 16', 'MAR 17'];
let shots, stamp, sun, ball, passer, wave;
studio.clip({
  duration: 4,
  setup(root) {
    shots = [0, 1, 2, 3].map((i) => kit.el(root, 'shot s' + i));
    sun = kit.el(shots[0], 'sun');                      // day 1: a sun coming up behind a hill
    kit.el(shots[0], 'hill');
    kit.el(shots[1], 'floor');                          // day 2: a ball bouncing
    ball = kit.el(shots[1], 'ball');
    const win = kit.el(shots[2], 'window');             // day 3: somebody passing a lit window
    passer = kit.el(win, 'passer');
    kit.el(win, 'bar v');
    kit.el(win, 'bar h');
    let d = 'M -600 0';                                 // day 4: waves rolling by
    for (let x = -600; x <= 3200; x += 240) d += ' q 120 190 240 0';
    const svg = kit.svg(shots[3], `<g class="roll">
      <path d="${d}" fill="none" stroke="#6a86ff" stroke-width="64" stroke-linecap="round" transform="translate(0 380)"/>
      <path d="${d} L 3440 1300 L -600 1300 Z" fill="#0f0f13" transform="translate(-120 690)"/></g>`);
    wave = svg.querySelector('.roll');
    stamp = kit.el(root, 'stamp');
  },
  render(t) {
    const day = Math.min(3, Math.floor(t));              // a cut exactly every 1.0 s
    const u = t - day;                                   // 0..1 inside the shot
    shots.forEach((s, i) => { s.style.visibility = i === day ? 'visible' : 'hidden'; });
    stamp.textContent = DAYS[day];
    sun.style.transform = `translateY(${-u * 190}px)`;
    ball.style.transform = `translate(${u * 260}px, ${-Math.abs(Math.sin(Math.PI * (u + 0.15))) * 470}px)`;
    passer.style.transform = `translateX(${u * 560}px)`;
    wave.style.transform = `translateX(${-u * 480}px)`;
  },
});
