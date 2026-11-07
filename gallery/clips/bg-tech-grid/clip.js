// Blueprint tech grid: dots/lines draw in from the centre, radial fade, brand glow, seeded light pulses along
// grid lines (comet tails) that brighten nearby dots. Optional perspective floor. Pure function of t (canvas).
studio.clip({
  duration: 10,
  setup(root, p, { width: W, height: H, duration: D }) {
    const { clamp, ease } = studio;
    const U = Math.min(W, H) / 1080;
    const TAU = Math.PI * 2;
    const cv = document.createElement('canvas');
    cv.className = 'btg'; cv.width = W; cv.height = H;
    root.appendChild(cv);
    const g = cv.getContext('2d');

    const hex = (h) => { h = String(h).replace('#', ''); const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const light = p.theme === 'light';
    const gridC = hex(light && /^#?f{3,6}$/i.test(String(p.color).replace('#', '')) ? '#0b0b10' : p.color);
    const G1 = hex(p.glowColor), G2 = hex(p.glowColor2);
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed ? a.toFixed(3) : a})`;
    const floor = !!p.perspective;
    const S = p.spacing * U * (floor ? 2.4 : 1);
    const cx = W / 2, cy = H / 2;
    const hz = H * 0.46; // horizon (floor mode)
    const Rfade = p.fadeRadius * Math.max(W, H) * 0.62;
    const Rmax = Math.hypot(W, H) / 2;
    const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };

    // ---- projection: plane (x across, y) → screen. Flat: identity. Floor: y = depth in px from the camera.
    const DEPTH = S * 5;
    const proj = (x, y) => {
      if (!floor) return [x, y, 1];
      const z = 1 + Math.max(0, y) / DEPTH;
      return [cx + (x - cx) / z, hz + (H - hz) / z, 1 / z];
    };

    // ---- grid extents (in cells around the centre) ----
    const nx = Math.ceil((floor ? W * 4 : W) / 2 / S) + 2;
    const ny = floor ? 70 : Math.ceil(H / 2 / S) + 2;

    // ---- pulses ----
    const rnd = studio.random(p.seed | 0);
    const pulses = [];
    if (p.pulseRate > 0) {
      const count = Math.ceil((D + 2) * p.pulseRate);
      for (let k = 0; k < count; k++) {
        const horiz = floor ? false : rnd() < 0.5;
        const lanes = horiz ? ny - 2 : floor ? 10 : nx - 2;
        const lane = Math.round((rnd() * 2 - 1) * lanes * (floor ? 1 : 0.8));
        const len = floor ? 12 + Math.floor(rnd() * 10) : 8 + Math.floor(rnd() * 10);
        const dir = floor ? -1 : rnd() < 0.5 ? -1 : 1;
        const start = floor ? 14 + Math.floor(rnd() * 12) : -dir * Math.round(len / 2 + (rnd() - 0.5) * 6);
        pulses.push({ s: 0.7 + k / p.pulseRate + (rnd() - 0.5) * 0.6 / p.pulseRate, dur: 1.1 + rnd() * 0.9, horiz, lane, len, dir, start, col: rnd() < 0.65 ? G1 : G2, tail: 3 + rnd() * 3 });
      }
    }
    const sine = (u) => -(Math.cos(Math.PI * u) - 1) / 2;

    return {
      render(t) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        g.clearRect(0, 0, W, H);
        if (p.theme === 'dark') { g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, W, H); }
        else if (light) { g.fillStyle = '#f6f7f9'; g.fillRect(0, 0, W, H); }
        if (floor) {
          const sky = g.createLinearGradient(0, 0, 0, hz);
          sky.addColorStop(0, rgba(G2, 0)); sky.addColorStop(0.7, rgba(G2, light ? 0.06 : 0.1)); sky.addColorStop(1, rgba(G2, light ? 0.18 : 0.32));
          g.fillStyle = sky; g.fillRect(0, 0, W, hz);
          const fl = g.createLinearGradient(0, hz, 0, H);
          fl.addColorStop(0, rgba(G1, light ? 0.1 : 0.16)); fl.addColorStop(0.25, rgba(G1, 0.03)); fl.addColorStop(1, rgba(G1, 0));
          g.fillStyle = fl; g.fillRect(0, hz, W, H - hz);
        }

        // centre glow (breathing)
        const gy = floor ? hz : cy;
        const glow = g.createRadialGradient(cx, gy, 0, cx, gy, Math.min(W, H) * (floor ? 0.6 : 0.62));
        const ga = (light ? 0.16 : 0.22) + 0.04 * Math.sin(t * 0.9);
        glow.addColorStop(0, rgba(G1, ga)); glow.addColorStop(0.5, rgba(G2, ga * 0.35)); glow.addColorStop(1, rgba(G1, 0));
        g.fillStyle = glow; g.fillRect(0, 0, W, H);

        // drift / scroll
        const offX = floor ? 0 : ((t * p.drift * 22 * U) % S);
        const offY = floor ? ((t * p.drift * 6 * S) % S) : ((t * p.drift * 12 * U) % S);
        const reveal = ease.outCubic(clamp(t / 1.5)) * Rmax * 1.08 + S;
        const alphaAt = (sx, sy, k) => {
          const d = floor ? Math.abs(sx - cx) * 0.6 + Math.abs(sy - H) * 0.5 : Math.hypot(sx - cx, sy - cy);
          const rv = clamp((reveal - (floor ? Math.abs(sy - H) * 1.3 + Math.abs(sx - cx) * 0.3 : d)) / (S * 3));
          const fade = floor ? clamp(k * 1.25 - 0.08) * (1 - smooth(W * 0.5, W * 0.72, Math.abs(sx - cx))) : 1 - smooth(Rfade * 0.35, Rfade, d);
          return rv * fade;
        };

        // pulse heads (screen space) for dot brightening
        const heads = [];
        const pulseGeo = [];
        for (const q of pulses) {
          const u = (t - q.s) / q.dur;
          if (u <= 0 || u >= 1) continue;
          const pos = q.start + q.dir * q.len * sine(u);
          const fadeIO = Math.sin(Math.PI * u);
          let a, b; // plane coords of head and tail
          if (q.horiz) { const y = cy + q.lane * S + offY; a = [cx + pos * S + offX, y]; b = [cx + (pos - q.dir * q.tail) * S + offX, y]; }
          else if (floor) { const x = cx + q.lane * S; a = [x, (pos) * S - offY]; b = [x, (pos + q.tail) * S - offY]; }
          else { const x = cx + q.lane * S + offX; a = [x, cy + pos * S + offY]; b = [x, cy + (pos - q.dir * q.tail) * S + offY]; }
          const A = proj(...a), B = proj(...b);
          heads.push([A[0], A[1], fadeIO, q.col]);
          pulseGeo.push([A, B, fadeIO, q.col]);
        }

        const [r, gg, b] = gridC;
        // lines
        if (p.mode !== 'dots') {
          g.lineWidth = Math.max(1, 1 * U);
          const la = floor ? (light ? 0.6 : 0.62) : light ? 0.12 : 0.11;
          const lc = floor ? G1 : gridC;
          for (let i = -nx; i <= nx; i++) {
            const x = cx + i * S + offX;
            if (floor) {
              // longitudinal line: draw in short segments so the alpha can follow depth
              for (let j = 0; j < 24; j++) {
                const y0 = j * S * 2.5, y1 = (j + 1) * S * 2.5;
                const A = proj(x, y0), B = proj(x, y1);
                const al = alphaAt(A[0], A[1], A[2]) * la;
                if (al < 0.003 || A[0] < -W || A[0] > 2 * W) continue;
                g.strokeStyle = rgba(lc, al); g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
              }
            } else {
              // vertical line in a few segments for the radial fade
              for (let j = -ny; j < ny; j++) {
                const y0 = cy + j * S + offY;
                const al = alphaAt(x, y0 + S / 2, 1) * la;
                if (al < 0.003) continue;
                g.strokeStyle = rgba(gridC, al); g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + S); g.stroke();
              }
            }
          }
          for (let j = floor ? 0 : -ny; j <= ny; j++) {
            if (floor) {
              const y = j * S - offY;
              if (y < 0) continue;
              const A = proj(cx - W * 3, y), B = proj(cx + W * 3, y);
              const al = alphaAt(cx, A[1], A[2]) * la;
              if (al < 0.003) continue;
              const lg = g.createLinearGradient(0, 0, W, 0);
              lg.addColorStop(0, rgba(lc, 0)); lg.addColorStop(0.25, rgba(lc, al)); lg.addColorStop(0.75, rgba(lc, al)); lg.addColorStop(1, rgba(lc, 0));
              g.strokeStyle = lg; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
            } else {
              const y = cy + j * S + offY;
              for (let i = -nx; i < nx; i++) {
                const x0 = cx + i * S + offX;
                const al = alphaAt(x0 + S / 2, y, 1) * la;
                if (al < 0.003) continue;
                g.strokeStyle = rgba(gridC, al); g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + S, y); g.stroke();
              }
            }
          }
        }

        // dots (at intersections)
        if (p.mode !== 'lines') {
          const da = light ? 0.38 : 0.4;
          for (let j = floor ? 0 : -ny; j <= ny; j++) {
            for (let i = -nx; i <= nx; i++) {
              const P = floor ? proj(cx + i * S, j * S - offY) : [cx + i * S + offX, cy + j * S + offY, 1];
              if (floor && j * S - offY < 0) continue;
              const [x, y, k] = P;
              if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
              let al = alphaAt(x, y, k);
              if (al < 0.01) continue;
              let hi = 0, hc = G1;
              for (const [hx, hy, f, c] of heads) { const d = Math.hypot(x - hx, y - hy); const R = S * 2.6 * (floor ? k : 1); if (d < R) { const v = (1 - d / R) * f; if (v > hi) { hi = v; hc = c; } } }
              const rad = (1.6 + 1.6 * hi) * U * (floor ? Math.max(0.35, k) : 1);
              g.fillStyle = hi > 0.02 ? rgba(hc, Math.min(1, al * (da + hi))) : rgba(gridC, al * da);
              g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
            }
          }
        }

        // pulses: comet tails + glowing heads
        g.lineCap = 'round';
        for (const [A, B, f, c] of pulseGeo) {
          const al = alphaAt(A[0], A[1], A[2]) * f;
          if (al < 0.01) continue;
          const lg = g.createLinearGradient(B[0], B[1], A[0], A[1]);
          lg.addColorStop(0, rgba(c, 0)); lg.addColorStop(1, rgba(c, al));
          g.strokeStyle = lg; g.lineWidth = 2 * U * (floor ? Math.max(0.4, A[2]) : 1);
          g.beginPath(); g.moveTo(B[0], B[1]); g.lineTo(A[0], A[1]); g.stroke();
          const hr = 16 * U * (floor ? Math.max(0.4, A[2]) : 1);
          const hg = g.createRadialGradient(A[0], A[1], 0, A[0], A[1], hr);
          hg.addColorStop(0, rgba([255, 255, 255], al)); hg.addColorStop(0.25, rgba(c, al * 0.8)); hg.addColorStop(1, rgba(c, 0));
          g.fillStyle = hg; g.fillRect(A[0] - hr, A[1] - hr, hr * 2, hr * 2);
        }

        // floor mode: horizon haze
        if (floor) {
          const hl = g.createLinearGradient(0, 0, W, 0);
          const ha = ease.outCubic(clamp(t / 1.2));
          hl.addColorStop(0, rgba(G1, 0)); hl.addColorStop(0.5, rgba([255, 255, 255], 0.85 * ha)); hl.addColorStop(1, rgba(G1, 0));
          g.save(); g.shadowColor = rgba(G1, 0.9); g.shadowBlur = 24 * U;
          g.fillStyle = hl; g.fillRect(0, hz - 1.5 * U, W, 3 * U);
          g.restore();
        }
      },
    };
  },
});
