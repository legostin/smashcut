// Counter stat: number counts from→to (computed in render), underline fills with progress.
studio.clip({
  duration: 5,
  async setup(root, p, { tl, duration }) {
    const el = document.createElement('div');
    el.className = `cs ${p.shadow ? 'shadow' : ''}`;
    const weight = p.font === 'Unbounded' ? 800 : p.font === 'JetBrains Mono' ? 700 : 800;
    el.innerHTML = `
      <div class="row" style="font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.size}px;color:${p.color}">
        <span class="pre" style="color:${p.accent}"></span><span class="num"></span><span class="suf" style="color:${p.accent}"></span>
      </div>
      <div class="ul"><div class="track" style="background:${p.color}"></div><div class="fill" style="background:${p.accent}"></div></div>
      <div class="label" style="color:${p.labelColor}"></div>
      <div class="cap" style="color:${p.accent};background:${p.accent}22"></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.pre').textContent = p.prefix || '';
    $('.suf').textContent = p.suffix || '';
    $('.label').textContent = p.label || '';
    $('.cap').textContent = p.caption || '';
    if (!p.caption) $('.cap').style.display = 'none';
    if (!p.label) $('.label').style.display = 'none';

    const sep = { space: ' ', comma: ',', dot: '.', none: '' }[p.thousands] ?? '';
    const dec = Math.max(0, Math.min(4, p.decimals | 0));
    const fmt = (v) => {
      const neg = v < 0; v = Math.abs(v);
      let [i, f] = v.toFixed(dec).split('.');
      i = i.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      return (neg ? '−' : '') + i + (f ? p.decimalMark + f : '');
    };
    // fixed width = widest of start / end value so digits don't push the layout around
    const num = $('.num');
    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, '0123456789'); } catch (e) {}
    let wmax = 0;
    for (const v of [p.from, p.to]) { num.textContent = fmt(v); wmax = Math.max(wmax, num.offsetWidth); }
    num.style.minWidth = Math.ceil(wmax) + 'px';
    const row = $('.row');
    const maxW = 1700;
    if (row.offsetWidth > maxW) { const s = maxW / row.offsetWidth; row.style.fontSize = Math.floor(p.size * s) + 'px'; num.style.minWidth = Math.ceil(wmax * s) + 'px'; }
    $('.ul').style.width = Math.max(240, row.offsetWidth) + 'px';

    const t0 = 0.35;
    const ct = Math.min(p.countTime, Math.max(0.3, duration - t0 - 1.2));
    const out = Math.max(0.8, duration - 0.72);
    tl.fromTo(row, { y: 50, opacity: 0, filter: 'blur(12px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'expo.out' }, 0.05)
      .fromTo($('.ul'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, 0.2)
      .fromTo($('.label'), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, 0.35)
      .fromTo($('.cap'), { y: 20, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, t0 + ct - 0.1)
      // landing bump when the count finishes
      .fromTo(row, { scale: 1 }, { scale: 1.04, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 }, t0 + ct - 0.02)
      // exit
      .to([row, $('.ul'), $('.label'), $('.cap')], { y: -40, opacity: 0, duration: 0.45, ease: 'power3.in', stagger: 0.06 }, out);

    const fill = $('.fill');
    return {
      render(t) {
        const k = 1 - Math.pow(1 - studio.progress(t, t0, ct), 4);
        num.textContent = fmt(p.from + (p.to - p.from) * k);
        fill.style.transform = `scaleX(${k})`;
      },
    };
  },
});
