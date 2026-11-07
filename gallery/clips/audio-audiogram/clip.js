// Podcast audiogram. Waveform = studio.level(t) history (centre = now, edges = slightly earlier) with
// attack/release smoothing; captions from studio.words or the caption text with even timing. All from t.
studio.clip({
  duration: 12,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const { clamp, ease } = studio;
    const U = Math.min(W, H) / 1080;
    const vertical = H > W * 1.1;
    root.innerHTML = `
      <div class="ag ${vertical ? 'vert' : ''}">
        <div class="bgimg"><img alt=""></div><div class="shade"></div>
        <canvas class="grain"></canvas>
        <div class="cover"><div class="art"><img alt=""></div></div>
        <div class="col">
          <div class="show"><span class="dot"></span><span class="txt"></span></div>
          <div class="title"></div>
          <canvas class="wave"></canvas>
          <div class="cap"></div>
          <div class="prog"><div class="track"><div class="fill"></div><div class="knob"></div></div><div class="times"><span class="el"></span><span class="tot"></span></div></div>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const ag = $('.ag');
    ag.style.setProperty('--u', U);
    ag.style.setProperty('--acc', p.accent);
    const src = p.coverImage || 'assets/cover.svg';
    $('.bgimg img').src = src;
    $('.cover img').src = src;
    $('.show .txt').textContent = p.showName || '';

    // ---- title: word masks, auto-fit to ≤ 3 lines ----
    const title = $('.title');
    String(p.episodeTitle || '').split(/\s+/).filter(Boolean).forEach((w) => {
      const m = document.createElement('span'); m.className = 'w';
      const i = document.createElement('span'); i.className = 'i'; i.textContent = w;
      m.appendChild(i); title.appendChild(m); title.appendChild(document.createTextNode(' '));
    });
    let fs = (vertical ? 70 : 66) * U;
    title.style.fontSize = fs + 'px';
    while (title.offsetHeight > fs * 1.06 * 3 + 4 && fs > 34 * U) { fs -= 2 * U; title.style.fontSize = fs + 'px'; }

    // ---- captions model ----
    let words = [];
    if (p.useTranscript) words = (studio.words || []).filter((w) => w.end > 0 && w.start < D).map((w) => ({ text: String(w.text).trim(), start: w.start, end: w.end })).filter((w) => w.text);
    if (!words.length) {
      const toks = String(p.captions || '').split(/\s+/).filter(Boolean);
      const t0 = Math.min(1.0, D * 0.12), t1 = D - Math.min(0.6, D * 0.08);
      const wts = toks.map((w) => w.length + 3 + (/[.!?…]$/.test(w) ? 6 : /[,;:—]$/.test(w) ? 3 : 0));
      const sum = wts.reduce((a, b) => a + b, 0) || 1;
      let acc = t0;
      words = toks.map((w, i) => { const d = ((t1 - t0) * wts[i]) / sum; const o = { text: w, start: acc, end: acc + d * 0.92 }; acc += d; return o; });
    }
    // pages: max N words, break after sentence ends
    const pages = [];
    let cur = [];
    words.forEach((w, i) => {
      cur.push(w);
      const end = /[.!?…]$/.test(w.text);
      if (cur.length >= p.wordsPerPage || end || i === words.length - 1) { pages.push(cur); cur = []; }
    });
    const cap = $('.cap');
    let shownPage = -2, capSpans = [];
    function showPage(k) {
      if (k === shownPage) return;
      shownPage = k;
      cap.textContent = '';
      capSpans = [];
      if (k < 0) return;
      pages[k].forEach((w) => {
        const s = document.createElement('span'); s.className = 'cw'; s.textContent = w.text;
        cap.appendChild(s); cap.appendChild(document.createTextNode(' '));
        capSpans.push(s);
      });
    }

    // ---- intro (GSAP) ----
    const tIn = 0.1;
    tl.fromTo('.cover .art', { scale: 0.86, opacity: 0, y: 30 * U }, { scale: 1, opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, tIn)
      .fromTo('.show', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'expo.out' }, tIn + 0.15)
      .fromTo('.title .i', { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.035 }, tIn + 0.22)
      .fromTo('.prog', { opacity: 0, y: 16 * U }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, tIn + 0.45)
      .fromTo('.bgimg', { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 0);

    // ---- waveform canvas ----
    const wave = $('.wave');
    const col = $('.col');
    const ww = Math.round(col.clientWidth), wh = Math.round((vertical ? 230 : 190) * U);
    wave.width = ww; wave.height = wh;
    wave.style.height = wh + 'px';
    const g = wave.getContext('2d');
    const N = clamp(Math.round(p.barCount), 8, 128);
    const fr = 1 / 30;
    const lv = (t) => clamp(studio.level(t));
    const smooth = (t) => { // attack ~2 frames, release ~6 frames
      let m = 0;
      for (let i = 0; i < 7; i++) { const a = (lv(t - i * fr) + lv(t - (i + 1) * fr)) / 2; m = Math.max(m, a * Math.exp(-i / 6)); }
      return m;
    };
    const hexA = (hex, a) => { const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; };

    // ---- grain ----
    const gcv = $('.grain');
    gcv.width = Math.ceil(W / 2); gcv.height = Math.ceil(H / 2);
    gcv.style.opacity = clamp(p.grain * 3, 0, 1);
    const gg = gcv.getContext('2d');
    const rnd = studio.random(17);
    const tiles = Array.from({ length: 5 }, () => {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const x = c.getContext('2d'), im = x.createImageData(160, 160);
      for (let i = 0; i < im.data.length; i += 4) { const v = (rnd() * 255) | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); return c;
    });

    const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    $('.times .tot').textContent = p.episodeLength || fmt(D);
    const fill = $('.fill'), knob = $('.knob'), el = $('.times .el');
    const art = $('.cover img');

    return {
      render(t) {
        // Ken Burns + backdrop drift
        art.style.transform = `scale(${1 + 0.05 * (t / D)}) translate(${(-1.2 * t / D).toFixed(3)}%, ${(-0.8 * t / D).toFixed(3)}%)`;
        // progress
        const pr = clamp(t / D);
        fill.style.transform = `scaleX(${pr})`;
        knob.style.left = (pr * 100).toFixed(3) + '%';
        el.textContent = fmt(t);

        // waveform
        const intro = (k) => ease.outCubic(clamp((t - 0.55 - Math.abs(k - (N - 1) / 2) / N * 0.5) / 0.6));
        const outro = 1 - ease.inCubic(clamp((t - (D - 0.4)) / 0.35));
        g.clearRect(0, 0, ww, wh);
        const gap = ww / N, bw = Math.max(2, gap * 0.52);
        const mid = p.waveStyle === 'bars' ? wh - bw / 2 : wh / 2;
        const maxH = p.waveStyle === 'bars' ? wh - bw : wh / 2 - bw / 2;
        const hs = [];
        for (let k = 0; k < N; k++) {
          const d = Math.abs(k - (N - 1) / 2) / ((N - 1) / 2);
          const base = smooth(t - d * 0.32);
          const nz = 0.5 + 0.5 * Math.abs(Math.sin(k * 1.7 + t * 6.1 + 2 * Math.sin(k * 0.41 + t * 1.9)));
          const shape = 0.3 + 0.7 * (1 - d * d);
          hs.push(clamp(base * p.sensitivity * shape * (0.35 + 0.65 * nz)) * intro(k) * outro);
        }
        if (p.waveStyle === 'line') {
          for (const pass of [0, 1]) {
            g.beginPath();
            for (let k = 0; k <= N; k++) {
              const kk = Math.min(N - 1, k);
              const x = (k / N) * ww, y = mid - Math.max(1.5 * U, hs[kk] * maxH) * (pass ? -1 : 1);
              k ? g.lineTo(x, y) : g.moveTo(x, y);
            }
            g.lineTo(ww, mid); g.lineTo(0, mid); g.closePath();
            const gr = g.createLinearGradient(0, 0, ww, 0);
            gr.addColorStop(0, hexA(p.accent, 0.15)); gr.addColorStop(0.5, hexA(p.accent, 0.95)); gr.addColorStop(1, hexA(p.accent, 0.15));
            g.fillStyle = gr; g.fill();
          }
        } else {
          g.lineCap = 'round';
          g.lineWidth = bw;
          for (let k = 0; k < N; k++) {
            const x = gap * (k + 0.5);
            const h = Math.max(0.5, hs[k] * maxH);
            const d = Math.abs(k - (N - 1) / 2) / ((N - 1) / 2);
            g.strokeStyle = hexA(p.accent, 0.45 + 0.55 * (1 - d));
            g.beginPath();
            if (p.waveStyle === 'bars') { g.moveTo(x, mid); g.lineTo(x, mid - h); }
            else { g.moveTo(x, mid - h); g.lineTo(x, mid + h); }
            g.stroke();
          }
        }

        // captions
        let k = -1;
        for (let i = 0; i < pages.length; i++) if (pages[i][0].start - 0.05 <= t) k = i;
        if (k >= 0 && t > pages[k][pages[k].length - 1].end + 1.2) k = -1; // long silence → clear
        if (t > D - 0.3) k = -1;
        showPage(k);
        if (k >= 0) {
          const ps = pages[k][0].start - 0.05;
          pages[k].forEach((w, i) => {
            const s = capSpans[i];
            const a = ease.outCubic(clamp((t - ps - i * 0.03) / 0.25));
            const on = t >= w.start && t < (pages[k][i + 1] ? pages[k][i + 1].start : w.end + 0.25);
            s.className = 'cw' + (on ? ' on' : t >= w.start ? ' past' : '');
            s.style.transform = `translateY(${((1 - a) * 14 * U).toFixed(2)}px) scale(${on ? 1.04 : 1})`;
            s.style.opacity = (a * (t >= w.start ? 1 : 0.42)).toFixed(3);
          });
        }

        // grain 12×/s
        const r = studio.random(500 + Math.floor(t * 12));
        gg.clearRect(0, 0, gcv.width, gcv.height);
        gg.fillStyle = gg.createPattern(tiles[Math.floor(r() * tiles.length)], 'repeat');
        gg.save(); gg.translate(-Math.floor(r() * 160), -Math.floor(r() * 160)); gg.fillRect(0, 0, gcv.width + 160, gcv.height + 160); gg.restore();
      },
    };
  },
});
