// Whip-pan streaks: seeded bands slam across with expo-in, glide while covering (D/2), then expo-out away.
// Each band = smeared front + solid body + long fading tail, drawn in render(t) (pure function of t).
studio.clip({
  duration: 0.6,
  setup(root, p, { width: W, height: H, duration: D }) {
    const { clamp } = studio;
    const cv = document.createElement('canvas');
    cv.className = 'tws';
    cv.width = W; cv.height = H;
    root.appendChild(cv);
    const g = cv.getContext('2d');

    const dir = p.direction;
    const vertical = dir === 'down' || dir === 'up';
    const L = vertical ? H : W, B = vertical ? W : H;
    const xf = { right: [1, 0, 0, 1, 0, 0], left: [-1, 0, 0, 1, W, 0], down: [0, 1, 1, 0, 0, 0], up: [0, -1, 1, 0, 0, H] }[dir] || [1, 0, 0, 1, 0, 0];
    const U = Math.min(W, H) / 1080;

    const rnd = studio.random(p.seed | 0);
    const N = clamp(Math.round(p.bandCount), 4, 32);
    // the whip itself stays snappy (≤ 0.9 s of motion); any extra length becomes covered hold around the cut
    const Dm = Math.min(D, 0.9);
    const fr = Dm / 18; // one "design frame" (the spec is 18 frames long)
    const hold = Math.max(Math.min(p.hold, D * 0.5), D - Dm);
    const mid = D / 2;
    const pal = [p.color1, p.color2, p.color3];

    // band heights: seeded weights normalised to the frame
    const wts = Array.from({ length: N }, () => 0.35 + rnd() ** 2 * 1.6);
    const sum = wts.reduce((a, b) => a + b, 0);
    let acc = 0;
    const Lc = L * 1.04, gl = L * 0.06;
    const body = Lc + gl + L * 0.03, tail = L * 0.75;
    const Lend = L + body + tail + 10;
    const bands = wts.map((w) => {
      const h = (w / sum) * B, y = acc;
      acc += h;
      const s = rnd() * p.spread * fr;
      const inEnd = mid - hold / 2 - rnd() * 1.2 * fr;
      const outS = mid + hold / 2 + rnd() * 1.2 * fr;
      const outE = D - rnd() * p.spread * fr;
      const col = rnd() < 0.5 ? p.baseColor : pal[Math.floor(rnd() * 3)];
      return { y, h, s, inEnd: Math.max(s + 2 * fr, inEnd), outS, outE: Math.max(outS + 2 * fr, outE), col };
    });
    const lines = Array.from({ length: p.speedLines ? Math.round(N * 1.4) : 0 }, () => ({
      y: rnd() * B, th: (1.5 + rnd() * 4.5) * U, len: L * (0.25 + rnd() * 0.5),
      t0: rnd() * D * 0.75, dur: D * (0.18 + rnd() * 0.16), a: 0.35 + rnd() * 0.5, col: rnd() < 0.7 ? p.color1 : pal[1 + Math.floor(rnd() * 2)],
    }));

    // quint-ish curves: fast like expo, but the streak stays visible over more of the window
    const expoIn = (u) => (u <= 0 ? 0 : Math.pow(u, 4.2));
    const expoOut = (u) => (u >= 1 ? 1 : 1 - Math.pow(1 - u, 4.2));
    function lead(b, t) {
      if (t <= b.s) return 0;
      if (t < b.inEnd) return Lc * clamp(expoIn((t - b.s) / (b.inEnd - b.s)), 0, 1);
      if (t < b.outS) return Lc + gl * ((t - b.inEnd) / Math.max(1e-4, b.outS - b.inEnd));
      return Lc + gl + (Lend - Lc - gl) * expoOut(clamp((t - b.outS) / (b.outE - b.outS)));
    }
    const hexA = (hex, a) => { const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; };

    return {
      render(t) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, W, H);
        if (t <= 0 || t >= D) return;
        g.setTransform(...xf);
        for (const b of bands) {
          const x = lead(b, t);
          if (x <= 0 || x - body - tail >= L) continue;
          const v = Math.abs(lead(b, t + 0.004) - lead(b, t - 0.004)) / 0.008;
          const smear = clamp(v * 0.006, 2, L * 0.3);
          const x0 = x - body - tail, x1 = x + smear, span = x1 - x0;
          const gr = g.createLinearGradient(x0, 0, x1, 0);
          gr.addColorStop(0, hexA(b.col, 0));
          gr.addColorStop(tail / span, hexA(b.col, 1));
          gr.addColorStop((tail + body) / span, hexA(b.col, 1));
          gr.addColorStop(1, hexA(b.col, 0));
          g.fillStyle = gr;
          const a = Math.max(0, x0), e = Math.min(L, x1);
          g.fillRect(a, b.y - 0.75, e - a, b.h + 1.5);
        }
        // speed lines (soft-ended)
        for (const l of lines) {
          const u = (t - l.t0) / l.dur;
          if (u <= 0 || u >= 1) continue;
          const head = -l.len + (L + 2 * l.len) * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
          const gr = g.createLinearGradient(head - l.len, 0, head, 0);
          gr.addColorStop(0, hexA(l.col, 0)); gr.addColorStop(0.8, hexA(l.col, l.a)); gr.addColorStop(1, hexA(l.col, 0));
          g.fillStyle = gr;
          g.fillRect(head - l.len, l.y - l.th / 2, l.len, l.th);
        }
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (p.flashAtCut) {
          const f = clamp(1 - Math.abs(t - mid) / (1.6 * fr));
          if (f > 0) { g.fillStyle = `rgba(255,255,255,${(0.85 * f * f).toFixed(3)})`; g.fillRect(0, 0, W, H); }
        }
      },
    };
  },
});
