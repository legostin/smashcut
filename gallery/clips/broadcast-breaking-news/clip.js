// Breaking-news strap: angled label block (3D flips to an alternate label), headline + subheadline bars,
// LIVE bug, location chip, channel cube and a deterministic clock (start time param + t).
studio.clip({
  duration: 8,
  setup(root, p, { tl, duration: D, width: W, height: H }) {
    const U = Math.min(W, H) / 1080;
    const accent = p.palette === 'blue' ? '#0a5bd8' : p.palette === 'custom' ? p.accent : '#e3172b';
    const vertical = H > W;
    const margin = (vertical ? 56 : 96) * U;
    root.innerHTML = `
      <div class="bn ${p.position === 'top' ? 'top-pos' : ''}">
        <div class="chips"><div class="live"><span class="dot"></span><span class="lt"></span></div><div class="loc"><span class="pin"></span><span class="lt"></span></div></div>
        <div class="row1">
          <div class="blk"><div class="persp"><div class="flip"><div class="face f1"></div><div class="face f2"></div></div></div><div class="sweep"></div></div>
          <div class="hl"><div class="mask"><div class="txt"></div></div><div class="sweep"></div></div>
          <div class="logo"><span></span></div>
        </div>
        <div class="row2"><div class="sub"><div class="mask"><div class="txt"></div></div></div><div class="clock"><span class="hh"></span><span class="colon">:</span><span class="mm"></span></div></div>
      </div>`;
    const $ = (s) => root.querySelector(s);
    const bn = $('.bn');
    bn.style.setProperty('--u', U);
    bn.style.setProperty('--acc', accent);
    bn.style.setProperty('--navy', p.navy);
    bn.style.left = margin + 'px';
    bn.style[p.position === 'top' ? 'top' : 'bottom'] = (vertical ? H * 0.2 : 92 * U) + 'px';
    $('.f1').textContent = p.label || '';
    $('.f2').textContent = p.altLabel || p.label || '';
    $('.hl .txt').textContent = p.headline || '';
    $('.sub .txt').textContent = p.subheadline || '';
    $('.live .lt').textContent = p.liveText || '';
    $('.loc .lt').textContent = p.location || '';
    $('.logo span').textContent = p.channel || '';
    if (!p.liveText) $('.live').style.display = 'none';
    if (!p.location) $('.loc').style.display = 'none';
    if (!p.channel) $('.logo').style.display = 'none';
    if (!p.subheadline) $('.sub').classList.add('empty');

    // ---- clock ----
    const m = String(p.startTime || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const clockStart = m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null;
    if (clockStart == null) $('.clock').style.display = 'none';

    // ---- measured layout: block width = widest label; headline auto-fits ----
    const blk = $('.blk');
    const f1 = $('.f1'), f2 = $('.f2');
    const labW = Math.max(f1.scrollWidth, f2.scrollWidth);
    blk.style.width = Math.ceil(labW + 2 * 34 * U + 30 * U) + 'px';
    const maxW = W - 2 * margin;
    const logoW = p.channel ? 92 * U : 0;
    const hlMax = maxW - blk.offsetWidth - logoW + 30 * U;
    const hlTxt = $('.hl .txt');
    let fs = 50 * U;
    hlTxt.style.fontSize = fs + 'px';
    while (hlTxt.scrollWidth + 70 * U > hlMax && fs > 36 * U) { fs -= 2 * U; hlTxt.style.fontSize = fs + 'px'; }
    const hl = $('.hl');
    let hlW = Math.min(hlMax, Math.max(hlTxt.scrollWidth + 80 * U, (vertical ? 0.4 : 0.42) * W));
    if (hlTxt.scrollWidth + 70 * U > hlMax) { // still too long: two lines (clamped) instead of shrinking further
      hl.classList.add('wrap');
      $('.row1').classList.add('wrap');
      hlTxt.style.fontSize = Math.max(34 * U, fs - 4 * U) + 'px';
      hlW = hlMax;
    }
    hl.style.width = hlW + 'px';
    const rowW = blk.offsetWidth - 30 * U + hlW + logoW;
    const subTxt = $('.sub .txt');
    $('.row2').style.width = rowW + 'px';
    const clockW = clockStart != null ? $('.clock').offsetWidth : 0;
    let sfs = 30 * U;
    subTxt.style.fontSize = sfs + 'px';
    while (subTxt.scrollWidth + 60 * U > rowW - clockW && sfs > 22 * U) { sfs -= 1 * U; subTxt.style.fontSize = sfs + 'px'; }

    // ---- timeline ----
    const f = Math.min(1, Math.max(0.55, D / 4));
    const outAt = D - 0.52; // exit block lasts 0.5 s and finishes before D
    const T = (x) => x * f;
    tl.fromTo(blk, { scaleX: 0 }, { scaleX: 1, duration: T(0.4), ease: 'expo.out' }, T(0.05))
      .fromTo('.face', { yPercent: 110 }, { yPercent: 0, duration: T(0.5), ease: 'expo.out' }, T(0.18))
      .fromTo(hl, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: T(0.65), ease: 'expo.out' }, T(0.22))
      .fromTo(hlTxt, { yPercent: 115 }, { yPercent: 0, duration: T(0.6), ease: 'expo.out' }, T(0.4))
      .fromTo('.row2', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: T(0.6), ease: 'expo.out' }, T(0.42))
      .fromTo(subTxt, { yPercent: 120 }, { yPercent: 0, duration: T(0.55), ease: 'expo.out' }, T(0.58))
      .fromTo('.clock', { opacity: 0, x: -20 * U }, { opacity: 1, x: 0, duration: T(0.45), ease: 'power3.out' }, T(0.7))
      .fromTo('.logo', { scale: 0.4, opacity: 0, rotationY: -90 }, { scale: 1, opacity: 1, rotationY: 0, duration: T(0.6), ease: 'back.out(1.6)' }, T(0.55))
      .fromTo('.chips > div', { yPercent: 110, clipPath: 'inset(0 100% 0 0)' }, { yPercent: 0, clipPath: 'inset(0 0% 0 0)', duration: T(0.55), ease: 'expo.out', stagger: T(0.08) }, T(0.62))
      .fromTo('.blk .sweep', { xPercent: -120 }, { xPercent: 420, duration: T(0.8), ease: 'power2.inOut' }, T(0.25))
      .fromTo('.hl .sweep', { xPercent: -120 }, { xPercent: 1250, duration: T(1.1), ease: 'power2.inOut' }, T(0.45));

    // 3D label flips (+ a sweep with each flip) during the hold
    const flip = $('.flip');
    if (p.altLabel && p.altLabel !== p.label) {
      let k = 1;
      for (let at = T(0.6) + p.flipEvery; at + 0.7 < outAt; at += p.flipEvery, k++) {
        tl.to(flip, { rotationX: -180 * k, duration: 0.7, ease: 'power3.inOut' }, at)
          .fromTo('.blk .sweep', { xPercent: -120 }, { xPercent: 420, duration: 0.8, ease: 'power2.inOut', immediateRender: false }, at + 0.1);
      }
    }
    // out: faster than in, reverse order, everything gone by D
    tl.to(['.chips > div'], { yPercent: 110, duration: 0.25, ease: 'power2.in', stagger: 0.04 }, outAt)
      .to([subTxt, '.clock'], { yPercent: 120, opacity: 0, duration: 0.22, ease: 'power2.in' }, outAt)
      .to(hlTxt, { yPercent: 115, duration: 0.24, ease: 'power2.in' }, outAt + 0.03)
      .to('.logo', { scale: 0.4, opacity: 0, duration: 0.22, ease: 'power2.in' }, outAt + 0.02)
      .to('.row2', { clipPath: 'inset(0 100% 0 0)', duration: 0.3, ease: 'expo.in' }, outAt + 0.1)
      .to(hl, { clipPath: 'inset(0 100% 0 0)', duration: 0.32, ease: 'expo.in' }, outAt + 0.12)
      .to('.face', { yPercent: -110, duration: 0.2, ease: 'power2.in' }, outAt + 0.18)
      .to(blk, { scaleX: 0, duration: 0.22, ease: 'expo.in' }, Math.min(D - 0.23, outAt + 0.26));

    const dot = $('.live .dot');
    const hh = $('.clock .hh'), mm = $('.clock .mm'), colon = $('.clock .colon');
    const pad = (n) => String(n).padStart(2, '0');
    return {
      render(t) {
        // LIVE dot: 1 Hz pulse
        const ph = (t % 1);
        dot.style.boxShadow = `0 0 0 ${(ph * 10 * U).toFixed(2)}px rgba(255,255,255,${(0.55 * (1 - ph)).toFixed(3)})`;
        dot.style.opacity = 0.55 + 0.45 * Math.cos(ph * Math.PI * 2) ** 2;
        if (clockStart != null) {
          const s = Math.floor(clockStart + Math.max(0, t)) % 86400;
          hh.textContent = pad(Math.floor(s / 3600));
          mm.textContent = pad(Math.floor((s % 3600) / 60));
          colon.style.opacity = ph < 0.5 ? 1 : 0.25;
        }
      },
    };
  },
});
