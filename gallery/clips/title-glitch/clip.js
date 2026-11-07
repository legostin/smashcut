// RGB-split glitch title. Everything is computed in render(t) from a frame-quantised hash,
// so any frame renders identically no matter how it is reached.
studio.clip({
  duration: 4,
  async setup(root, p, { duration }) {
    const SLICES = 7;
    const text = String(p.text || '');
    const el = document.createElement('div');
    el.className = 'gl';
    const font = `'${p.font}', sans-serif`;
    const weight = p.font === 'Bebas Neue' ? 400 : p.font === 'Unbounded' ? 900 : 700;
    el.innerHTML = `<div class="stack" style="font-family:${font};font-weight:${weight};font-size:${p.size}px;color:${p.color};letter-spacing:${p.font === 'Bebas Neue' ? '0.02em' : '-0.02em'}">
        <span class="layer a abs" style="color:${p.colorA}"></span>
        <span class="layer b abs" style="color:${p.colorB}"></span>
        <span class="layer main"></span>
        ${Array.from({ length: SLICES }, () => `<span class="layer slice abs"></span>`).join('')}
        <div class="bars">${Array.from({ length: 6 }, () => '<i></i>').join('')}</div>
      </div>
      <div class="sub" style="color:${p.color}"></div>`;
    root.appendChild(el);
    const stack = el.querySelector('.stack');
    const A = el.querySelector('.a'), B = el.querySelector('.b'), main = el.querySelector('.main');
    const slices = [...el.querySelectorAll('.slice')];
    const bars = [...el.querySelectorAll('.bars i')];
    const sub = el.querySelector('.sub');
    const all = [A, B, main, ...slices];

    try { await document.fonts.load(`${weight} ${p.size}px ${font}`, text); } catch (e) {}
    main.textContent = text;
    const maxW = 1700;
    if (stack.scrollWidth > maxW) stack.style.fontSize = Math.floor(p.size * maxW / stack.scrollWidth) + 'px';

    // ---- deterministic noise ----
    const seed = p.seed | 0;
    const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@/\\<>[]{}=+*?!';
    const FPS = 24; // glitch "frame rate" — quantised so the jitter reads as digital
    const inDur = Math.min(1.0, duration * 0.3), outDur = Math.min(0.7, duration * 0.2);
    const outStart = duration - outDur;

    // burst windows during hold: deterministic list from seed
    const bursts = [];
    if (p.bursts > 0) {
      const rnd = studio.random(seed * 13 + 1);
      let t = inDur + 0.25 + rnd() * 0.4;
      while (t < outStart - 0.2) { const len = 0.08 + rnd() * 0.18; bursts.push([t, t + len]); t += len + (0.4 + rnd() * 1.2) / p.bursts; }
    }

    function scrambled(str, revealed, f) {
      let s = '';
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === ' ' || i < revealed) s += c;
        else s += GLYPHS[Math.floor(hash(f, i + 99) * GLYPHS.length)];
      }
      return s;
    }

    return {
      render(t) {
        const f = Math.floor(t * FPS);
        const I = p.intensity;
        // glitch amount envelope
        let g = 0;
        if (t < inDur) g = 1 - t / inDur;
        else if (t > outStart) g = (t - outStart) / outDur;
        for (const [a, b] of bursts) if (t >= a && t <= b) g = Math.max(g, 0.55 + 0.45 * hash(f, 3));
        g *= I;

        // visibility: flicker in, flicker out
        let vis = 1;
        if (t < inDur) vis = hash(f, 1) < 0.25 + 0.75 * (t / inDur) ? 1 : 0;
        if (t < 0.06) vis = 0;
        if (t > outStart) vis = hash(f, 2) < 1 - (t - outStart) / (outDur * 0.85) ? 1 : 0;
        if (t >= duration - 1 / FPS) vis = 0;

        // text content: scramble resolves left→right on entry, dissolves on exit
        let shown = text;
        if (p.scramble) {
          if (t < inDur) shown = scrambled(text, Math.floor((t / inDur) * text.length * 1.15), f);
          else if (t > outStart) shown = scrambled(text, Math.floor((1 - (t - outStart) / outDur) * text.length), f);
          else if (g > 0.3 && hash(f, 4) < 0.4) shown = scrambled(text, text.length - 1 - Math.floor(hash(f, 5) * 3), f).split('').map((c, i) => (hash(f, i + 300) < 0.85 ? text[i] : c)).join('');
        }
        for (const l of all) if (l.textContent !== shown) l.textContent = shown;

        // RGB split
        const base = 4 * I; // tiny constant split keeps it "digital" while holding
        const dx = base + g * 38 * (hash(f, 6) - 0.3);
        const dy = g * 10 * (hash(f, 7) - 0.5);
        A.style.transform = `translate(${-dx}px, ${-dy}px)`;
        B.style.transform = `translate(${dx}px, ${dy}px)`;
        A.style.opacity = B.style.opacity = vis ? 0.9 : 0;
        main.style.opacity = vis;
        main.style.transform = `translate(${g * 8 * (hash(f, 8) - 0.5)}px, 0)`;

        // horizontal slices displaced
        const h = stack.offsetHeight;
        slices.forEach((s, i) => {
          const active = vis && g > 0.15 && hash(f, 20 + i) < 0.25 + g * 0.45;
          if (!active) { s.style.opacity = 0; return; }
          const y0 = hash(f, 40 + i) * 100, hh = 4 + hash(f, 60 + i) * 18;
          s.style.opacity = 1;
          s.style.clipPath = `inset(${y0}% 0 ${Math.max(0, 100 - y0 - hh)}% 0)`;
          s.style.transform = `translateX(${(hash(f, 80 + i) - 0.5) * 140 * g}px)`;
          s.style.color = hash(f, 90 + i) < 0.3 ? (hash(f, 91 + i) < 0.5 ? p.colorA : p.colorB) : p.color;
        });
        main.style.clipPath = 'none';

        // noise bars
        bars.forEach((b, i) => {
          const on = vis && g > 0.25 && hash(f, 120 + i) < g * 0.5;
          b.style.opacity = on ? 0.85 : 0;
          if (!on) return;
          b.style.top = hash(f, 130 + i) * (h + 120) + 'px';
          b.style.left = hash(f, 140 + i) * 60 + '%';
          b.style.width = 80 + hash(f, 150 + i) * 420 + 'px';
          b.style.height = 2 + Math.floor(hash(f, 160 + i) * 10) + 'px';
          b.style.background = [p.colorA, p.colorB, p.color][Math.floor(hash(f, 170 + i) * 3)];
        });

        // subtitle types on after the title locks
        const subT = studio.progress(t, inDur * 0.8, 0.6);
        const subOut = t > outStart ? 1 - (t - outStart) / (outDur * 0.5) : 1;
        const full = String(p.subtitle || '');
        const n = Math.floor(full.length * subT);
        const cursor = Math.floor(t * 2.5) % 2 === 0 && subT > 0 && subOut > 0 ? '█' : ' ';
        sub.textContent = full.slice(0, n) + (n < full.length || t < outStart ? cursor : '');
        sub.style.opacity = Math.max(0, Math.min(1, subOut)) * (subT > 0 ? 0.85 : 0);
      },
    };
  },
});
