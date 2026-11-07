// Stomp promo: one huge word per beat. Pure function of t — the slot is found on the beat grid
// (studio.beat), styling per slot is decided by its index, motion inside a slot is computed from
// the time since the beat. Every 4th word whips in sideways with ghost copies (fake motion blur).
studio.clip({
  duration: 6,
  async setup(root, p, { duration }) {
    const D = duration, W = studio.width, H = studio.height, FPS = studio.fps || 30;
    const words = String(p.words || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!words.length) words.push('STOMP');
    const weight = p.font === 'Bebas Neue' ? 400 : p.font === 'Unbounded' ? 900 : 900;
    const family = `'${p.font}', 'Inter', sans-serif`;
    const tracking = p.font === 'Bebas Neue' ? '0.01em' : p.font === 'Unbounded' ? '-0.03em' : '-0.05em';

    const el = document.createElement('div');
    el.className = 'sp';
    el.innerHTML = `<div class="bg"></div><div class="stage">
        <div class="w ghost g3"></div><div class="w ghost g2"></div><div class="w ghost g1"></div><div class="w main"></div></div>
      <div class="flash"></div>
      <div class="meta tl"><i></i><span></span></div><div class="meta br"></div><div class="bar"></div>`;
    root.appendChild(el);
    const bg = el.querySelector('.bg'), flash = el.querySelector('.flash');
    const main = el.querySelector('.main');
    const ghosts = ['.g1', '.g2', '.g3'].map((s) => el.querySelector(s));
    const metaTl = el.querySelector('.meta.tl'), metaBr = el.querySelector('.meta.br');
    metaTl.querySelector('span').textContent = p.meta || '';
    if (!p.meta) metaTl.style.display = 'none';
    if (!p.counter) metaBr.style.display = 'none';
    for (const w of [main, ...ghosts]) {
      w.style.fontFamily = family; w.style.fontWeight = weight; w.style.letterSpacing = tracking;
      if (p.uppercase) w.style.textTransform = 'uppercase';
    }

    // measure each word once → font size that fills `fill`% of the width, capped by height
    try { await document.fonts.load(`${weight} 200px ${family}`, words.join(' ')); } catch (e) {}
    const REF = 200;
    const probe = document.createElement('div');
    probe.className = 'w';
    probe.style.cssText = main.style.cssText + `;font-size:${REF}px;visibility:hidden`;
    el.querySelector('.stage').appendChild(probe);
    const sizes = words.map((w) => {
      probe.textContent = w;
      const r = probe.getBoundingClientRect();
      const byW = (REF * W * (p.fill / 100)) / Math.max(1, r.width);
      const byH = (REF * H * 0.62) / Math.max(1, r.height);
      return Math.min(byW, byH);
    });
    probe.remove();
    // optical vertical centring: offset (in em) from the line-box centre to the glyph-ink centre
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = `${weight} ${REF}px ${family}`;
    const dys = words.map((w) => {
      const m = cv.measureText(p.uppercase ? w.toUpperCase() : w);
      const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
      const boxCentreFromBaseline = (fa - fd) / 2;      // line-height:normal box
      const inkCentreFromBaseline = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      return (boxCentreFromBaseline - inkCentreFromBaseline) / REF;
    });

    // beat grid → slot start times
    const bpw = Math.max(0.5, Number(p.beatsPerWord) || 1);
    const off = Math.max(0, Number(p.offsetBeats) || 0);
    const beatAt = (x) => { const i = Math.floor(x), f = x - i; const a = studio.beat(i); return f ? a + (studio.beat(i + 1) - a) * f : a; };
    const slots = [];
    for (let k = 0; k < 4096; k++) {
      const s = beatAt(off + k * bpw);
      if (s >= D - 0.12) break;
      if (!p.loop && k >= words.length) break;
      slots.push(s);
    }
    if (!slots.length) slots.push(0);
    const slotEnd = (k) => (k + 1 < slots.length ? slots[k + 1] : D);
    const total = slots.length;

    const C = { dark: p.dark, light: p.light, accent: p.accent };
    function look(k) {
      const inv = p.invertEvery > 0 && Math.floor(k / p.invertEvery) % 2 === 1;
      const acc = p.accentEvery > 0 && k % p.accentEvery === p.accentEvery - 1;
      const outline = !acc && p.outlineEvery > 0 && k % p.outlineEvery === p.outlineEvery - 1;
      let bgc = inv ? C.light : C.dark, fg = inv ? C.dark : C.light;
      if (acc) { bgc = C.accent; fg = C.dark; }
      return { bgc, fg, outline, whip: p.ghostTrail && k % 4 === 3, dir: (k >> 2) % 2 ? -1 : 1 };
    }
    const eo = (x) => 1 - Math.pow(1 - x, 4);
    const lastSlot = total - 1;
    const exitDur = Math.min(0.3, D * 0.08);

    return {
      render(t) {
        let k = 0;
        while (k + 1 < total && slots[k + 1] <= t + 1e-6) k++;
        const before = t < slots[0] - 1e-6;
        const L = look(k);
        const text = words[k % words.length];
        const s0 = slots[k], s1 = slotEnd(k);
        const since = Math.max(0, t - s0);
        const slotLen = Math.max(0.05, s1 - s0);
        const fs = sizes[k % words.length];
        const dy = dys[k % words.length] * fs;
        const frames = since * FPS;

        bg.style.background = before ? C.dark : L.bgc;
        // 2-frame flash on every cut (light on dark slots, dark on light ones)
        flash.style.background = L.bgc === C.dark ? '#ffffff' : C.dark;
        flash.style.opacity = before ? 0 : frames < 1 ? 0.9 : frames < 2 ? 0.35 : 0;
        if (k % 2 === 1) flash.style.opacity = frames < 1 ? 0.55 : 0; // lighter hit on off-beats

        // scale punch 1.3 → 1 over 3 frames, then a slow push for the rest of the slot
        const punch = 1 + (Math.min(1.3, 1.04 / (p.fill / 100)) - 1) * (1 - eo(Math.min(1, frames / 3)));
        const push = 1 + 0.045 * Math.min(1, since / slotLen);
        let x = 0, sc = punch * push;
        let wx = 0;
        if (L.whip) {
          const u = Math.min(1, frames / 6);
          wx = L.dir * 220 * (1 - eo(u));
          x = wx;
        }
        // exit: final slot collapses vertically into a line, then the line closes (TV-off)
        let sy = 1, sx = 1;
        const ex = (t - (D - exitDur)) / exitDur;
        if (ex > 0 && k === lastSlot) {
          const a = Math.min(1, ex / 0.55), b = Math.max(0, (ex - 0.55) / 0.45);
          sy = Math.max(0.012, 1 - a * a * a);
          sx = 1 - b * b;
        }
        const fsPx = fs + 'px';
        const paint = (w, opacity, dx) => {
          w.textContent = text;
          w.style.fontSize = fsPx;
          w.style.opacity = before ? 0 : opacity;
          w.style.transform = `translate(-50%,-50%) translate(${x + dx}px,${dy}px) scale(${sc * sx},${sc * sy})`;
          if (L.outline) { w.style.color = 'transparent'; w.style.webkitTextStroke = `${Math.max(2, fs * 0.012)}px ${L.fg}`; }
          else { w.style.color = L.fg; w.style.webkitTextStroke = '0'; }
        };
        paint(main, 1, 0);
        // ghost trail during the whip: 3 copies lagging behind the motion direction
        const trail = L.whip ? Math.max(0, 1 - frames / 7) : 0;
        ghosts.forEach((g, i) => {
          if (trail <= 0) { g.style.opacity = 0; return; }
          paint(g, trail * [0.42, 0.24, 0.12][i], L.dir * (i + 1) * 70 * trail);
        });
        // corner UI follows the background
        const ui = L.bgc === C.dark ? C.light : C.dark;
        metaTl.style.color = ui; metaBr.style.color = ui;
        metaTl.style.opacity = metaBr.style.opacity = ex > 0 ? Math.max(0, 1 - ex * 2) : 0.8;
        metaTl.querySelector('i').style.background = L.bgc === C.accent ? C.dark : C.accent;
        metaTl.querySelector('i').style.opacity = Math.floor(t * 2) % 2 ? 0.35 : 1;
        metaBr.textContent = `${String((k % words.length) + 1).padStart(2, '0')} / ${String(words.length).padStart(2, '0')}`;
      },
    };
  },
});
