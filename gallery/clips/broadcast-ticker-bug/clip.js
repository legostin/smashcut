// News ticker + station bug. The crawl is x = x0 - speed·t over a strip repeated long enough for the clip;
// the category box flips to the category of the headline crossing its edge (computed from t, no state).
studio.clip({
  duration: 10,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const U = Math.min(W, H) / 1080;
    const { clamp, ease } = studio;
    const vertical = H > W;
    const BH = p.barHeight * U;
    root.innerHTML = `
      <div class="tk">
        <div class="bug"><div class="logo"></div><div class="live"><span class="dot"></span><span class="lt"></span></div></div>
        <div class="bar">
          <div class="cat"><div class="face a"></div><div class="face b"></div></div>
          <div class="crawl"><div class="strip"></div></div>
          <div class="clock"><span class="hh"></span><span class="colon">:</span><span class="mm"></span></div>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const tk = $('.tk');
    tk.style.setProperty('--u', U);
    tk.style.setProperty('--bh', BH + 'px');
    tk.style.setProperty('--acc', p.accent);
    tk.style.setProperty('--acct', p.accentText);
    tk.style.setProperty('--bar', p.bar);
    const bar = $('.bar');
    bar.style.bottom = (vertical ? H * 0.16 : 54 * U) + 'px';

    // ---- items ----
    let lastCat = 'LATEST';
    const items = String(p.items || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf('|');
      if (i >= 0) { lastCat = l.slice(0, i).trim() || lastCat; return { cat: lastCat, text: l.slice(i + 1).trim() }; }
      return { cat: lastCat, text: l };
    });
    if (!items.length) items.push({ cat: 'LATEST', text: '—' });

    // ---- clock ----
    const m = String(p.startTime || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const clockStart = m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null;
    if (clockStart == null) $('.clock').style.display = 'none';
    if (!p.bugLogo) $('.bug').style.display = 'none';
    $('.bug .logo').textContent = p.bugLogo || '';
    $('.bug .lt').textContent = p.bugLabel || '';
    if (!p.bugLabel) $('.bug .live').style.display = 'none';
    $('.clock .hh').textContent = '00'; $('.clock .mm').textContent = '00';

    // ---- category box: fixed width = widest category ----
    const fa = $('.cat .a'), fb = $('.cat .b');
    let catW = 0;
    for (const c of new Set(items.map((x) => x.cat))) { fa.textContent = c; catW = Math.max(catW, fa.scrollWidth); }
    $('.cat').style.width = Math.ceil(catW + 2) + 'px';

    // ---- strip: measure one cycle, repeat to cover the clip ----
    const strip = $('.strip');
    const crawl = $('.crawl');
    const cycle = [];
    const mk = (it) => {
      const s = document.createElement('span'); s.className = 'it';
      s.innerHTML = '<b></b><span class="sep"></span>';
      s.querySelector('b').textContent = it.text;
      s.querySelector('.sep').textContent = p.separator || '•';
      strip.appendChild(s); return s;
    };
    items.forEach((it) => cycle.push(mk(it)));
    const cycleW = strip.scrollWidth;
    const crawlW = crawl.clientWidth;
    const speed = p.speed * U;
    const t0 = 0.35; // crawl starts once the bar is in
    const x0 = crawlW * 0.3;
    const need = x0 + speed * Math.max(0, D - t0) + 10;
    let copies = Math.max(1, Math.ceil(need / Math.max(1, cycleW)));
    for (let c = 1; c < copies; c++) items.forEach((it) => mk(it));
    // item start offsets in the strip (for category sync)
    const offs = [...strip.children].map((el, i) => ({ x: el.offsetLeft, cat: items[i % items.length].cat }));
    const leadX = 90 * U; // the box flips just before a new headline reaches it
    // category change times
    const changes = [{ t: -1e9, cat: offs[0].cat }];
    for (const o of offs) {
      const tc = t0 + (x0 + o.x - leadX) / speed; // x0 - speed (t - t0) + o.x = leadX
      if (o.cat !== changes[changes.length - 1].cat && tc > 0) changes.push({ t: tc, cat: o.cat });
    }
    const catAt = (t) => { let k = 0; while (k + 1 < changes.length && changes[k + 1].t <= t) k++; return k; };

    // ---- timeline ----
    const outAt = Math.max(0.9, D - 0.5);
    tl.fromTo(bar, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'expo.out' }, 0.02)
      .fromTo('.cat', { xPercent: -110, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.45, ease: 'expo.out' }, 0.15)
      .fromTo('.clock', { opacity: 0, x: 24 * U }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, 0.3)
      .fromTo('.bug', { opacity: 0, scale: 0.86, y: -10 * U }, { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 0.4)
      .fromTo('.bug .live', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'expo.out' }, 0.62)
      .to('.bug', { opacity: 0, scale: 0.92, duration: 0.3, ease: 'power2.in' }, outAt)
      .to(['.cat', '.clock'], { opacity: 0, duration: 0.2, ease: 'power2.in' }, outAt + 0.05)
      .to(bar, { clipPath: 'inset(0 0% 0 100%)', duration: 0.4, ease: 'expo.in' }, outAt + 0.08);

    const dot = $('.bug .dot');
    const hh = $('.clock .hh'), mm = $('.clock .mm'), colon = $('.clock .colon');
    const pad = (n) => String(n).padStart(2, '0');
    return {
      render(t) {
        const x = x0 - speed * Math.max(0, t - t0);
        strip.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
        // category flip (rotateX), 0.5 s
        const k = catAt(t);
        const dt = t - changes[k].t;
        const cur = changes[k].cat, prev = k > 0 ? changes[k - 1].cat : cur;
        const u = clamp(dt / 0.5);
        const e = ease.inOutCubic(u);
        if (k > 0 && u < 1) {
          fa.textContent = prev; fb.textContent = cur;
          fa.style.transform = `translateY(${(-e * 50).toFixed(2)}%) rotateX(${(e * 90).toFixed(2)}deg)`;
          fa.style.opacity = 1 - e;
          fb.style.transform = `translateY(${((1 - e) * 50).toFixed(2)}%) rotateX(${(-(1 - e) * 90).toFixed(2)}deg)`;
          fb.style.opacity = e;
        } else {
          fa.textContent = cur; fa.style.transform = 'none'; fa.style.opacity = 1; fb.style.opacity = 0;
        }
        const ph = t % 1;
        dot.style.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(ph * Math.PI * 2));
        if (clockStart != null) {
          const s = Math.floor(clockStart + Math.max(0, t)) % 86400;
          hh.textContent = pad(Math.floor(s / 3600)); mm.textContent = pad(Math.floor((s % 3600) / 60));
          colon.style.opacity = ph < 0.5 ? 1 : 0.25;
        }
      },
    };
  },
});
