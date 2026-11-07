// Year-in-review bento ("Wrapped" style). Bento mode: CSS grid tiles flip in one by one, numbers count up
// (render), stickers rotate. Sequence mode: one stat per beat with hard colour-block wipes (clip-path).
studio.clip({
  duration: 8,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const vertical = H > W * 1.1;
    const S = Math.min(W, H) / 1080;
    const palette = String(p.palette || '').split(/[,\s]+/).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c)).map((c) => (c[0] === '#' ? c : '#' + c));
    while (palette.length < 6) palette.push(['#C6F432', '#FF3D8B', '#3D5AFE', '#FF8A3D', '#F4F1EA', '#9B5CFF'][palette.length]);
    const lum = (hex) => { let h = hex.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ink = (bg) => (lum(bg) > 0.35 ? '#0b0b0d' : '#ffffff');
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // ---------- stats ----------
    const stats = String(p.stats || '').split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0]).slice(0, 5).map(([raw, label]) => {
      const m = /^(.*?)(\d[\d\s  .,]*\d|\d)(.*)$/.exec(raw);
      if (!m) return { text: raw, label: label || '' };
      const numStr = m[2].replace(/[\s  ]/g, '');
      const sepSpace = /[\s  ]/.test(m[2]);
      let v, dec = 0, sep = sepSpace ? ' ' : '';
      if (/,\d{3}(\D|$)/.test(numStr) && !/\./.test(numStr)) { v = parseFloat(numStr.replace(/,/g, '')); sep = ','; }
      else { const n2 = numStr.replace(',', '.'); v = parseFloat(n2); dec = (n2.split('.')[1] || '').length; }
      return { prefix: m[1], suffix: m[3], v, dec, sep, comma: /,\d{1,2}$/.test(numStr), label: label || '' };
    });
    const fmt = (s, k) => {
      if (s.text != null) return s.text;
      let str = (s.v * k).toFixed(s.dec);
      if (s.comma) str = str.replace('.', ',');
      const [i, f] = str.split(/[.,]/);
      const ig = s.sep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, s.sep) : i;
      return s.prefix + ig + (f ? (s.comma ? ',' : '.') + f : '') + s.suffix;
    };
    const titleLines = String(p.title || '').split('\n').filter((x) => x.trim());

    // ---------- DOM ----------
    const el = document.createElement('div');
    el.className = 'wb';
    el.style.background = p.background;
    root.appendChild(el);
    const cv = document.createElement('canvas'); cv.width = cv.height = 192;
    const c2 = cv.getContext('2d'), img = c2.createImageData(192, 192), RG = studio.random(5);
    for (let i = 0; i < img.data.length; i += 4) { const v = RG() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    c2.putImageData(img, 0, 0);
    const grain = document.createElement('div');
    grain.className = 'grain';
    grain.style.backgroundImage = `url(${cv.toDataURL()})`;
    el.appendChild(grain);

    const avatar = String(p.avatar || '').trim();
    const initials = (p.handle || '').replace(/^@/, '').slice(0, 1).toUpperCase() || '★';
    const starPath = (n, r1, r2) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n - Math.PI / 2, r = i % 2 ? r2 : r1; d += (i ? 'L' : 'M') + (50 + r * Math.cos(a)).toFixed(2) + ',' + (50 + r * Math.sin(a)).toFixed(2); } return d + 'Z'; };
    const out = Math.max(1.6, duration - 0.6);
    const eExpo = gsap.parseEase('expo.out');
    const counters = []; // { el, stat, t0 }
    const spinners = []; // { el, speed, t0 }
    const eqs = [];

    if (p.mode === 'sequence') {
      // ---------- sequence: one stat per beat ----------
      const beats = [{ title: true }, ...stats];
      const per = (duration - 0.25) / beats.length;
      beats.forEach((b, i) => {
        const bg = palette[i % palette.length], fg = ink(bg);
        const panel = document.createElement('div');
        panel.className = 'seq';
        panel.style.background = bg; panel.style.color = fg;
        if (b.title) {
          panel.innerHTML = `<div class="big">${titleLines.map((l) => `<span class="ln"><span>${esc(l)}</span></span>`).join('')}</div><div class="lab"></div>`;
          panel.querySelector('.lab').textContent = p.handle || p.eyebrow || '';
        } else {
          panel.innerHTML = `<div class="idx">${String(i).padStart(2, '0')} / ${String(stats.length).padStart(2, '0')}</div><div class="num"></div><div class="lab"></div>`;
          panel.querySelector('.lab').textContent = b.label;
          counters.push({ el: panel.querySelector('.num'), stat: b, t0: i * per + 0.15, fit: true });
        }
        el.insertBefore(panel, grain);
        const big = panel.querySelector('.big, .num');
        big.style.fontSize = parseFloat(getComputedStyle(big).fontSize) * S * (vertical ? 0.85 : 1) + 'px';
        panel.querySelector('.lab').style.fontSize = 54 * S * (vertical ? 1.1 : 1) + 'px';
        if (!b.title) { big.textContent = fmt(b, 1); const maxW = W * 0.86; if (big.scrollWidth > maxW) big.style.fontSize = parseFloat(big.style.fontSize) * (maxW / big.scrollWidth) + 'px'; }
        else { const maxW = W * 0.86, wd = Math.max(...[...big.querySelectorAll('.ln span')].map((s) => s.offsetWidth)); if (wd > maxW) big.style.fontSize = parseFloat(big.style.fontSize) * (maxW / wd) + 'px'; }
        const ts = i * per;
        if (i > 0) tl.fromTo(panel, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.38, ease: 'power4.inOut' }, ts - 0.2);
        else tl.fromTo(panel, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.38, ease: 'power4.inOut' }, 0);
        tl.fromTo(panel.querySelectorAll('.ln span'), { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07 }, ts + 0.12)
          .fromTo(panel.querySelector('.num'), { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.6)' }, ts + 0.1)
          .fromTo(panel.querySelector('.lab'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, ts + 0.3);
        if (p.stickers) {
          const st = document.createElement('div');
          st.className = 'sticker';
          const sz = 200 * S;
          const sc = palette[(i + 2) % palette.length];
          Object.assign(st.style, { width: sz + 'px', height: sz + 'px', right: W * 0.07 + 'px', bottom: H * (vertical ? 0.2 : 0.1) + 'px', color: ink(sc) });
          st.innerHTML = `<svg viewBox="0 0 100 100"><path d="${starPath(12, 50, 40)}" fill="${sc}"/></svg><b style="font-size:${30 * S}px">${esc(p.stickerText || '')}</b>`;
          panel.appendChild(st);
          tl.fromTo(st, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.5)' }, ts + 0.35);
          spinners.push({ el: st.querySelector('svg'), speed: 18, t0: ts });
        }
      });
      // final wipe back to the background colour
      const endP = document.createElement('div');
      endP.className = 'seq'; endP.style.background = p.background;
      el.insertBefore(endP, grain);
      tl.fromTo(endP, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.38, ease: 'power4.inOut' }, duration - 0.42);
    } else {
      // ---------- bento ----------
      const n = stats.length;
      const TPL_H = { 5: ['t t b c', 't t d c', 'e f f f'], 4: ['t t b b', 't t c d', 'e e c d'], 3: ['t t b b', 't t c d', 't t c d'], 2: ['t t b', 't t c'], 1: ['t t b'], 0: ['t'] };
      const TPL_V = { 5: ['t t', 't t', 'b c', 'd c', 'e e', 'f f'], 4: ['t t', 't t', 'b c', 'd c', 'e e'], 3: ['t t', 't t', 'b c', 'd d'], 2: ['t t', 't t', 'b c'], 1: ['t t', 'b b'], 0: ['t'] };
      const tpl = (vertical ? TPL_V : TPL_H)[n];
      const M = { x: W * (vertical ? 0.06 : 0.05), y: H * (vertical ? 0.07 : 0.089) };
      const grid = document.createElement('div');
      grid.className = 'grid';
      Object.assign(grid.style, { left: M.x + 'px', top: M.y + 'px', width: W - 2 * M.x + 'px', height: H - 2 * M.y - (vertical ? H * 0.08 : 0) + 'px', gap: 20 * S + 'px',
        gridTemplateAreas: tpl.map((r) => `"${r}"`).join(' '), gridTemplateColumns: `repeat(${tpl[0].split(' ').length}, 1fr)`, gridTemplateRows: `repeat(${tpl.length}, 1fr)` });
      el.insertBefore(grid, grain);
      const areas = ['b', 'c', 'd', 'e', 'f'];
      const tiles = [];
      // title tile
      const tbg = palette[0], tfg = ink(tbg);
      const tt = document.createElement('div');
      tt.className = 'tile tt';
      Object.assign(tt.style, { gridArea: 't', background: tbg, color: tfg });
      tt.innerHTML = `<div class="eb" style="background:${tfg};color:${tbg}"></div>
        <div class="big">${titleLines.map((l) => `<span class="ln"><span>${esc(l)}</span></span>`).join('')}</div>
        <div class="who"><div class="av" style="background:${tfg};color:${tbg}">${avatar ? `<img src="${esc(avatar)}" alt="">` : esc(initials)}</div><span></span></div>`;
      tt.querySelector('.eb').textContent = p.eyebrow || '';
      if (!p.eyebrow) tt.querySelector('.eb').style.visibility = 'hidden';
      tt.querySelector('.who span').textContent = p.handle || '';
      if (!p.handle && !avatar) tt.querySelector('.who').style.visibility = 'hidden';
      grid.appendChild(tt);
      tiles.push(tt);
      stats.forEach((s, i) => {
        const bg = palette[(i + 1) % palette.length], fg = ink(bg);
        const d = document.createElement('div');
        d.className = 'tile';
        Object.assign(d.style, { gridArea: areas[i], background: bg, color: fg });
        d.innerHTML = `<div class="idx">${String(i + 1).padStart(2, '0')}</div>
          <svg class="deco" viewBox="0 0 100 100" style="right:-12%;top:-18%;width:62%;opacity:.13"><path d="${starPath(8, 50, 30)}" fill="${fg}"/></svg>
          <div class="num"></div><div class="lab"></div>`;
        d.querySelector('.lab').textContent = s.label;
        grid.appendChild(d);
        tiles.push(d);
        s.tile = d;
      });
      // sizes need the grid laid out
      const tR = tt.getBoundingClientRect();
      const big = tt.querySelector('.big');
      let bfs = Math.min(tR.height * 0.25, 118 * S * 1.15);
      big.style.fontSize = bfs + 'px';
      const bw = Math.max(...[...big.querySelectorAll('.ln span')].map((x) => x.offsetWidth));
      if (bw > tR.width - 80 * S) big.style.fontSize = (bfs * (tR.width - 80 * S)) / bw + 'px';
      tt.style.padding = `${34 * S}px ${38 * S}px`;
      tt.querySelector('.eb').style.transform = `scale(${S})`; tt.querySelector('.eb').style.transformOrigin = '0 0';
      tt.querySelector('.who').style.fontSize = 26 * S + 'px';
      stats.forEach((s, i) => {
        const d = s.tile, r = d.getBoundingClientRect(), num = d.querySelector('.num'), lab = d.querySelector('.lab');
        d.style.padding = `${30 * S}px ${36 * S}px`;
        lab.style.fontSize = Math.max(18, Math.min(30 * S, r.height * 0.1)) + 'px';
        const textual = s.text != null;
        let fs = Math.min(r.height * (textual ? 0.3 : 0.4), 150 * S);
        num.style.fontSize = fs + 'px';
        num.textContent = fmt(s, 1);
        const avail = r.width - 72 * S - (textual && r.width > r.height * 2 ? 260 * S : 0);
        if (num.scrollWidth > avail) num.style.fontSize = (fs * avail) / num.scrollWidth + 'px';
        if (textual && r.width > r.height * 1.6) {
          const eq = document.createElement('div');
          eq.className = 'eq';
          eq.innerHTML = Array.from({ length: 7 }, () => `<i style="background:${ink(palette[(i + 1) % palette.length])};height:100%"></i>`).join('');
          d.appendChild(eq);
          eqs.push({ bars: [...eq.querySelectorAll('i')], t0: 0 });
        } else if (!textual) counters.push({ el: num, stat: s, t0: 0 });
      });
      // remember untransformed rects for sticker placement (before the entrance tweens scale the tiles)
      const rects = tiles.map((d) => d.getBoundingClientRect());
      // entrance schedule
      const per = Math.min(0.13, Math.max(0.06, (duration * 0.25) / tiles.length));
      tiles.forEach((d, i) => {
        const t0 = 0.08 + i * per;
        tl.fromTo(d, { scale: 0.55, rotation: i % 2 ? 7 : -7, rotateX: 55, opacity: 0, transformPerspective: 1600 }, { scale: 1, rotation: 0, rotateX: 0, opacity: 1, duration: 0.62, ease: 'back.out(1.35)' }, t0);
        const s = stats[i - 1];
        if (s) {
          const c = counters.find((x) => x.stat === s);
          if (c) c.t0 = t0 + 0.15;
          tl.fromTo(d.querySelector('.lab'), { y: 20 * S, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, t0 + 0.25)
            .fromTo(d.querySelector('.idx'), { opacity: 0 }, { opacity: 0.55, duration: 0.4 }, t0 + 0.3);
          if (s.text != null) tl.fromTo(d.querySelector('.num'), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'expo.out' }, t0 + 0.15);
          spinners.push({ el: d.querySelector('.deco'), speed: i % 2 ? -9 : 9, t0: 0 });
        }
      });
      tl.fromTo(tt.querySelectorAll('.big .ln span'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07 }, 0.25)
        .fromTo([tt.querySelector('.eb'), tt.querySelector('.who')], { y: 16 * S, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.08 }, 0.35);
      // stickers
      const stickers = [];
      if (p.stickers) {
        const st = document.createElement('div');
        st.className = 'sticker';
        const sz = 190 * S, sc = palette[1];
        const tr = rects[0];
        Object.assign(st.style, { width: sz + 'px', height: sz + 'px', left: tr.right - sz * 0.5 + 'px', top: tr.top - sz * 0.38 + 'px', color: ink(sc) });
        st.innerHTML = `<svg viewBox="0 0 100 100"><path d="${starPath(12, 50, 40)}" fill="${sc}" stroke="${p.background}" stroke-width="2.5"/></svg><b style="font-size:${30 * S}px"></b>`;
        st.querySelector('b').textContent = p.stickerText || '';
        el.insertBefore(st, grain);
        spinners.push({ el: st.querySelector('svg'), speed: 22, t0: 0 });
        stickers.push(st);
        tl.fromTo(st, { scale: 0, rotation: -40 }, { scale: 1, rotation: -10, duration: 0.6, ease: 'back.out(2.6)' }, 0.08 + tiles.length * per + 0.2);
        if (tiles.length > 3) {
          const pill = document.createElement('div');
          pill.className = 'pill';
          const pc = palette[2];
          const er = rects[tiles.length - 1];
          Object.assign(pill.style, { background: pc, color: ink(pc), left: er.left + er.width * (vertical ? 0.4 : 0.5) + 'px', top: er.top - 34 * S + 'px', fontSize: 24 * S + 'px', height: 64 * S + 'px', padding: `0 ${28 * S}px` });
          pill.textContent = '★ ' + (p.eyebrow || 'Wrapped');
          el.insertBefore(pill, grain);
          stickers.push(pill);
          tl.fromTo(pill, { scale: 0, rotation: 20 }, { scale: 1, rotation: -6, duration: 0.6, ease: 'back.out(2.6)' }, 0.08 + tiles.length * per + 0.35);
        }
      }
      // exit
      tl.to(stickers, { scale: 0, rotation: 30, duration: 0.3, ease: 'back.in(2)', stagger: 0.04 }, out - 0.05)
        .to([...tiles].reverse(), { scale: 0.8, opacity: 0, rotation: (i) => (i % 2 ? 4 : -4), duration: 0.38, ease: 'power3.in', stagger: 0.035 }, out);
    }

    return {
      render(t) {
        counters.forEach((c) => { c.el.textContent = fmt(c.stat, eExpo(studio.progress(t, c.t0, 1.2))); });
        spinners.forEach((s) => { s.el.style.transform = `rotate(${((t - s.t0) * s.speed).toFixed(2)}deg)`; });
        eqs.forEach((e) => e.bars.forEach((b, k) => {
          const h = 0.25 + 0.75 * Math.abs(Math.sin(t * (2.1 + k * 0.37) + k * 1.7)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.9 + k)));
          b.style.transform = `scaleY(${h.toFixed(3)})`;
        }));
        const f = Math.floor(t * 12), r = studio.random(f + 9);
        grain.style.backgroundPosition = `${Math.floor(r() * 192)}px ${Math.floor(r() * 192)}px`;
      },
    };
  },
});
