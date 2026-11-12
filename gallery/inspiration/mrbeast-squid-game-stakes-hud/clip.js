// Stakes HUD: a state light (top-left), a countdown clock (top-right) and an "N REMAINING" tally (bottom-left)
// stay pinned while the footage underneath moves, freezes, loses players and even cuts to a closer shot.
const COLS = 6, ROWS = 2;
const OUT = { 0: 1.3, 8: 1.3, 11: 1.3, 2: 3.4, 9: 3.4 };   // player index → the moment it is eliminated
let world, players, light, clock, tally, shot;
studio.clip({
  duration: 4,
  setup(root) {
    shot = kit.el(root, 'shot');
    world = kit.el(shot, 'world');
    players = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      players.push({ el: kit.el(world, 'player'), x: 310 + c * 260, y: 430 + r * 260, ph: (c * 1.7 + r * 2.9) % 6.28 });
    }
    light = kit.el(root, 'hud light');
    clock = kit.el(root, 'hud clock');
    tally = kit.el(root, 'hud tally');
  },
  render(t) {
    const { clamp, progress, ease } = studio;
    const close = t >= 2;                                   // the footage cuts to a closer shot — the HUD does not move
    const green = t < 0.9 || (t >= 2.3 && t < 3.2);
    const moved = clamp(t, 0, 0.9) + clamp(t - 2.3, 0, 0.9); // players only move on green

    shot.style.background = close ? '#6a86ff' : '#1b1b22';
    world.style.transform = close ? 'scale(1.6)' : 'none';
    let left = 0;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const x = p.x + moved * 70, y = p.y + Math.sin(moved * 11 + p.ph) * 18;
      const gone = OUT[i] === undefined ? 0 : progress(t, OUT[i], 0.4);
      const hit = OUT[i] !== undefined && t >= OUT[i] - 0.25;
      if (gone < 1) left++;
      p.el.style.transform = `translate(${x}px, ${y}px) scale(${1 - ease.inCubic(gone)})`;
      p.el.style.background = hit ? '#ff5c38' : close ? '#0f0f13' : '#6a86ff';
    }
    if (t >= 1.3 && left > 9) left = 9;                     // the tally drops the instant the players are hit
    if (t >= 3.4 && left > 7) left = 7;

    const flip = t < 0.9 ? t : t < 2.3 ? t - 0.9 : t < 3.2 ? t - 2.3 : t - 3.2;
    light.style.background = green ? '#d4ff3a' : '#ff5c38';
    light.style.transform = `scale(${1 + 0.22 * (1 - ease.outCubic(clamp(flip / 0.3)))})`;

    const secs = 8 - Math.floor(t * 2);                    // a tick every half second
    clock.textContent = '00:0' + clamp(secs, 1, 8);

    const since = t >= 3.4 ? t - 3.4 : t >= 1.3 ? t - 1.3 : 9;
    const punch = 1 - ease.outCubic(clamp(since / 0.4));
    tally.textContent = left + ' REMAINING';
    tally.style.transform = `scale(${1 + 0.22 * punch})`;
    tally.style.background = punch > 0.35 ? '#ff5c38' : '#f3f2ec';
  },
});
