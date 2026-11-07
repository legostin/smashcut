// Grainy mesh gradient: soft radial blobs on Lissajous paths with integer frequencies per loop (seamless loop),
// drawn at low resolution and upscaled + blurred; seeded grain tiles over the top (overlay blend).
studio.clip({
  duration: 10,
  setup(root, p, { width: W, height: H }) {
    const { clamp } = studio;
    const TAU = Math.PI * 2;
    const hex = (h) => { h = String(h).replace('#', ''); const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const toHex = (c) => '#' + c.map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
    const shade = (c, k) => toHex(hex(c).map((x) => (k >= 0 ? x + (255 - x) * k : x * (1 + k))));
    const hue = (c, deg) => { // rotate hue (for mono-brand variety)
      const [r, g, b] = hex(c).map((x) => x / 255);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
      let h = 0, s = 0;
      if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
      h = (h + deg + 360) % 360;
      const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
      const [a, bb, cc] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
      return toHex([(a + m) * 255, (bb + m) * 255, (cc + m) * 255]);
    };
    const PAL = {
      aurora: { base: '#050816', cols: ['#00d9b5', '#2d6bff', '#8a3cf0', '#00ff9d', '#0a2f8f', '#53e0ff'] },
      sunset: { base: '#1a0a1f', cols: ['#ff7a59', '#ff3d7f', '#ffc15e', '#7b2ff7', '#ff9a8b', '#d6336c'] },
      ocean: { base: '#021526', cols: ['#0ea5e9', '#22d3ee', '#1e3a8a', '#38bdf8', '#0f766e', '#6366f1'] },
      'mono-brand': { base: shade(p.color1, -0.86), cols: [p.color1, shade(p.color1, 0.35), shade(p.color1, -0.45), hue(p.color1, 28), hue(p.color1, -24), shade(p.color1, 0.6)] },
      custom: { base: p.baseColor, cols: [p.color1, p.color2, p.color3, p.color4, p.color1, p.color3] },
    };
    const pal = PAL[p.palette] || PAL.aurora;

    const wrap = document.createElement('div');
    wrap.className = 'bmg';
    root.appendChild(wrap);
    const SC = 0.25; // mesh resolution
    const mw = Math.ceil(W * SC), mh = Math.ceil(H * SC);
    const mesh = document.createElement('canvas');
    mesh.className = 'mesh'; mesh.width = mw; mesh.height = mh;
    mesh.style.filter = `blur(${(p.softness * 34 * Math.min(W, H)) / 1080}px) saturate(1.1)`;
    wrap.appendChild(mesh);
    const g = mesh.getContext('2d');
    const grain = document.createElement('canvas');
    grain.className = 'grain'; grain.width = W; grain.height = H;
    grain.style.opacity = clamp(p.grainAmount * 3.3, 0, 1);
    wrap.appendChild(grain);
    const gg = grain.getContext('2d');
    if (p.vignette > 0) {
      const v = document.createElement('div'); v.className = 'vig';
      v.style.background = `radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,${(0.75 * p.vignette).toFixed(2)}) 100%)`;
      wrap.appendChild(v);
    }

    const rnd = studio.random(p.seed | 0);
    const n = clamp(Math.round(p.blobCount), 2, 8);
    const loop = Math.max(1, p.loopSeconds);
    const blobs = Array.from({ length: n }, (_, i) => ({
      col: hex(pal.cols[i % pal.cols.length]),
      // stratified around the frame so colour zones stay distinct
      cx: 0.5 + 0.36 * Math.cos((i / n) * TAU + 0.6) * (i % 2 ? 0.75 : 1) + (rnd() - 0.5) * 0.12,
      cy: 0.5 + 0.34 * Math.sin((i / n) * TAU + 0.6) * (i % 2 ? 0.75 : 1) + (rnd() - 0.5) * 0.12,
      ax: (0.1 + rnd() * 0.14) * p.motion, ay: (0.09 + rnd() * 0.12) * p.motion,
      fx: rnd() < 0.3 ? 2 : 1, fy: rnd() < 0.3 ? 2 : 1, // integer cycles per loop → seamless
      px: rnd() * TAU, py: rnd() * TAU, r: 0.3 + rnd() * 0.2, br: 0.08 + rnd() * 0.1, bf: 1 + Math.floor(rnd() * 2), bp: rnd() * TAU,
      dir: rnd() < 0.5 ? -1 : 1,
    }));

    // grain tiles (seeded once); each grain frame picks a tile + offset from its own seed
    const T = 256;
    const tiles = Array.from({ length: 6 }, () => {
      const c = document.createElement('canvas'); c.width = c.height = T;
      const x = c.getContext('2d'), im = x.createImageData(T, T);
      for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 150; im.data[i] = im.data[i + 1] = im.data[i + 2] = clamp(v, 0, 255); im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); return c;
    });
    let lastGrain = null;

    return {
      render(t) {
        const ph = (TAU * t) / loop;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = pal.base;
        g.fillRect(0, 0, mw, mh);
        const R = Math.max(mw, mh);
        for (const b of blobs) {
          const x = (b.cx + b.ax * Math.sin(b.fx * ph * b.dir + b.px)) * mw;
          const y = (b.cy + b.ay * Math.sin(b.fy * ph + b.py)) * mh;
          const r = R * b.r * (1 + b.br * Math.sin(b.bf * ph + b.bp));
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          const [cr, cg, cb] = b.col;
          gr.addColorStop(0, `rgba(${cr},${cg},${cb},0.95)`);
          gr.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.6)`);
          gr.addColorStop(0.7, `rgba(${cr},${cg},${cb},0.16)`);
          gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          g.fillStyle = gr;
          g.fillRect(0, 0, mw, mh);
        }
        // a soft light pass keeps highlights luminous without blowing out
        g.globalCompositeOperation = 'soft-light';
        const lx = (0.5 + 0.3 * Math.sin(ph + 1)) * mw, ly = (0.35 + 0.2 * Math.cos(ph)) * mh;
        const lg = g.createRadialGradient(lx, ly, 0, lx, ly, R * 0.7);
        lg.addColorStop(0, 'rgba(255,255,255,0.5)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = lg; g.fillRect(0, 0, mw, mh);
        g.globalCompositeOperation = 'source-over';

        // grain: re-seeded every 2 frames (15 fps "film"), or fixed (paper)
        const gi = p.grainAnimated ? Math.floor(t * 15) : 0;
        if (gi !== lastGrain && p.grainAmount > 0) {
          lastGrain = gi;
          const r = studio.random(7919 + gi * 31 + (p.seed | 0));
          gg.clearRect(0, 0, W, H);
          gg.fillStyle = gg.createPattern(tiles[Math.floor(r() * tiles.length)], 'repeat');
          const ox = Math.floor(r() * T), oy = Math.floor(r() * T);
          gg.save(); gg.translate(-ox, -oy); gg.fillRect(0, 0, W + T, H + T); gg.restore();
        }
      },
    };
  },
});
