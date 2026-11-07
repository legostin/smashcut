// Radial music visualizer. A pseudo-spectrum is derived from studio.level(t) (bass bins follow the smoothed
// loudness, upper bins add deterministic shimmer); particles ride ∫level dt so they rush outward on kicks.
studio.clip({
  duration: 10,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const { clamp, ease } = studio;
    const inBack = (x) => { const c1 = 1.70158; return (c1 + 1) * x * x * x - c1 * x * x; };
    const U = Math.min(W, H) / 1080;
    const M0 = Math.min(W, H);
    const vertical = H > W * 1.1;
    const cx = W / 2, cy = vertical ? H * 0.42 : H * 0.44;
    const RA = M0 * 0.15;            // artwork radius
    const R0 = RA * 1.2;             // ring inner radius
    const LEN = M0 * 0.14;           // max bar length
    const N = clamp(Math.round(p.barCount / 2) * 2, 24, 256), M = N / 2;
    const TAU = Math.PI * 2;

    root.innerHTML = `<div class="arv"><canvas></canvas><div class="meta"><span class="m"><span class="i t"></span></span><span class="m"><span class="i a"></span></span></div></div>`;
    const wrap = root.querySelector('.arv');
    wrap.style.setProperty('--u', U);
    const cv = wrap.querySelector('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const meta = wrap.querySelector('.meta');
    meta.style.top = (cy + R0 + LEN * 0.95 + 26 * U) + 'px';
    wrap.querySelector('.t').textContent = p.title || '';
    wrap.querySelector('.a').textContent = p.artist || '';
    let img = null;
    if (p.artwork) { img = document.createElement('img'); img.src = p.artwork; img.style.display = 'none'; wrap.appendChild(img); }

    tl.fromTo(wrap.querySelectorAll('.meta .i'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.1 }, 0.45)
      .to(wrap.querySelectorAll('.meta .i'), { yPercent: -110, duration: 0.35, ease: 'power2.in', stagger: 0.05 }, Math.max(1.2, D - 0.5));

    const fr = 1 / 30;
    const lv = (t) => clamp(studio.level(t));
    const smooth = (t) => { let m = 0; for (let i = 0; i < 9; i++) m = Math.max(m, lv(t - i * fr) * Math.exp(-i / 5)); return m; };
    // ∫ level² dt from 0 (sampled at 30 Hz) → particle "kick" travel
    const energy = (t) => { let e = 0; const n = Math.floor(Math.max(0, t) / fr); for (let i = 0; i < n; i++) { const l = lv(i * fr); e += l * l * fr; } const l = lv(n * fr); return e + l * l * (Math.max(0, t) - n * fr); };

    const rnd = studio.random(p.seed | 0);
    const span = Math.hypot(W, H) / 2 - R0;
    const parts = Array.from({ length: p.particles ? 150 : 0 }, () => ({
      a: rnd() * TAU, ph: rnd(), s: (14 + rnd() * 40) * U, k: (180 + rnd() * 420) * U, sz: (1.2 + rnd() ** 2 * 3.6) * U, c: rnd(), tw: rnd() * TAU,
    }));
    const hex = (h) => { h = h.replace('#', ''); const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const C1 = hex(p.color1), C2 = hex(p.color2), C3 = hex(p.color3);
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const mix = (a, b, u) => a.map((x, i) => Math.round(x + (b[i] - x) * u));

    function drawVinyl(t, r) {
      g.save();
      g.translate(cx, cy);
      // disc
      const disc = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
      disc.addColorStop(0, '#16141c'); disc.addColorStop(1, '#09080c');
      g.fillStyle = disc; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      g.lineWidth = Math.max(1, 1.2 * U);
      for (let i = 0; i < 22; i++) { const rr = r * (0.42 + (i / 22) * 0.55); g.strokeStyle = `rgba(255,255,255,${0.025 + (i % 3 === 0 ? 0.03 : 0)})`; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke(); }
      // fixed light sheen (the record turns under it)
      if (g.createConicGradient) {
        const sh = g.createConicGradient(-0.6, 0, 0);
        sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.08, 'rgba(255,255,255,0.13)'); sh.addColorStop(0.16, 'rgba(255,255,255,0)');
        sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(0.58, 'rgba(255,255,255,0.1)'); sh.addColorStop(0.66, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sh; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      }
      // label (rotates at ~33 rpm)
      g.rotate(t * TAU * 0.55);
      const lr = r * 0.36;
      const lab = g.createLinearGradient(-lr, -lr, lr, lr);
      lab.addColorStop(0, p.color2); lab.addColorStop(1, p.color3);
      g.fillStyle = lab; g.beginPath(); g.arc(0, 0, lr, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3 * U; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, lr * 0.7, -0.5, 0.6); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(lr * 0.45, -lr * 0.25, 4 * U, 0, TAU); g.fill();
      g.fillStyle = '#09080c'; g.beginPath(); g.arc(0, 0, r * 0.035, 0, TAU); g.fill();
      g.restore();
    }

    return {
      render(t) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.clearRect(0, 0, W, H);
        const L = smooth(t);
        const ringIn = ease.outCubic(clamp((t - 0.1) / 0.9)) * (1 - ease.inCubic(clamp((t - (D - 0.55)) / 0.5)));
        const artIn = ease.outBack(clamp((t - 0.05) / 0.75)) * (1 - inBack(clamp((t - (D - 0.45)) / 0.42)));

        if (p.background !== 'transparent') {
          const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.65);
          bg.addColorStop(0, rgba(mix(hex(p.bg), C2, 0.18), 1)); bg.addColorStop(0.55, p.bg); bg.addColorStop(1, '#000');
          g.fillStyle = bg; g.fillRect(0, 0, W, H);
        }
        // glow follows loudness
        g.globalCompositeOperation = 'lighter';
        const gl = g.createRadialGradient(cx, cy, RA * 0.8, cx, cy, R0 + LEN * 1.6);
        gl.addColorStop(0, rgba(C2, (0.18 + 0.4 * L) * ringIn)); gl.addColorStop(0.5, rgba(C1, (0.06 + 0.14 * L) * ringIn)); gl.addColorStop(1, rgba(C1, 0));
        g.fillStyle = gl; g.fillRect(0, 0, W, H);

        // particles
        const E = energy(t);
        for (const q of parts) {
          const d = (q.ph * span + q.s * t + q.k * E) % span;
          const u = d / span;
          const r = R0 + LEN * 0.4 + d;
          const a = q.a + 0.04 * t;
          const al = Math.sin(Math.PI * u) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(q.tw + t * 3))) * ringIn;
          if (al <= 0.01) continue;
          g.fillStyle = rgba(q.c < 0.5 ? C1 : C3, al.toFixed(3));
          g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, q.sz * (1 + L * 0.6), 0, TAU); g.fill();
        }

        // spectrum (mirrored left/right)
        const raw = [];
        for (let b = 0; b < M; b++) {
          const f = b / (M - 1);
          const bassW = Math.exp(-f / 0.16);
          const lb = smooth(t - 0.015 - f * 0.12);
          const n = 0.5 + 0.5 * Math.sin(b * 2.3 + t * 9.1 + 3 * Math.sin(b * 0.71 + t * 2.3));
          raw.push(bassW * L * 1.05 + (1 - bassW) * (0.18 + 0.82 * lb) * (0.25 + 0.75 * n) * (0.95 - 0.45 * f));
        }
        const v = raw.map((x, i) => clamp(((raw[i - 1] ?? x) + 2 * x + (raw[i + 1] ?? x)) / 4 * p.sensitivity));
        const rot = (p.rotationSpeed * t * Math.PI) / 180;
        let grad = p.color1;
        if (g.createConicGradient) {
          grad = g.createConicGradient(rot - Math.PI / 2, cx, cy);
          grad.addColorStop(0, p.color1); grad.addColorStop(0.25, p.color2); grad.addColorStop(0.5, p.color3); grad.addColorStop(0.75, p.color2); grad.addColorStop(1, p.color1);
        }
        const R = R0 * (0.85 + 0.15 * ringIn) + L * 6 * U;
        const pts = [];
        for (let j = 0; j < N; j++) {
          const b = j < M ? j : N - 1 - j;
          const th = -Math.PI / 2 + (TAU * (j + 0.5)) / N + rot;
          const len = (5 * U + v[b] * LEN) * ringIn;
          pts.push([th, len]);
        }
        for (const pass of [0, 1]) {
          g.globalCompositeOperation = pass ? 'source-over' : 'lighter';
          g.strokeStyle = grad; g.fillStyle = grad;
          g.globalAlpha = (pass ? 1 : 0.35) * ringIn;
          const bw = Math.max(2, ((TAU * R) / N) * 0.55) * (pass ? 1 : 2.4);
          g.lineCap = 'round';
          if (p.style === 'line') {
            g.lineWidth = (pass ? 4 : 12) * U;
            g.beginPath();
            pts.forEach(([th, len], i) => { const x = cx + Math.cos(th) * (R + len), y = cy + Math.sin(th) * (R + len); i ? g.lineTo(x, y) : g.moveTo(x, y); });
            g.closePath(); g.stroke();
            if (pass) { g.globalAlpha = 0.14 * ringIn; g.fill(); g.globalAlpha = ringIn; g.lineWidth = 2 * U; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); }
          } else if (p.style === 'dots') {
            for (const [th, len] of pts) {
              const steps = Math.max(1, Math.round(len / (9 * U)));
              for (let s = 0; s < steps; s++) { const rr = R + 4 * U + s * 9 * U; g.beginPath(); g.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, (pass ? 2.6 : 5) * U * (1 - s / (steps + 2) * 0.5), 0, TAU); g.fill(); }
            }
          } else {
            g.lineWidth = bw;
            g.beginPath();
            for (const [th, len] of pts) { const c = Math.cos(th), s = Math.sin(th); g.moveTo(cx + c * R, cy + s * R); g.lineTo(cx + c * (R + len), cy + s * (R + len)); }
            g.stroke();
          }
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';

        // artwork / vinyl, pumping on the bass
        const sc = Math.max(0, artIn) * (1 + 0.06 * L * L);
        if (sc > 0.01) {
          const r = RA * sc;
          g.save();
          g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 40 * U; g.shadowOffsetY = 14 * U;
          g.fillStyle = '#000'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
          g.restore();
          if (img && img.complete && img.naturalWidth) {
            g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
            const k = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
            g.drawImage(img, cx - (img.naturalWidth * k) / 2, cy - (img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
            g.restore();
          } else drawVinyl(t, r);
          g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3 * U;
          g.beginPath(); g.arc(cx, cy, r + 6 * U, 0, TAU); g.stroke();
        }
      },
    };
  },
});
