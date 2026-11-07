// Editorial line mask reveal: each line rises from behind its own mask (slide / rotate) or
// resolves from blur with tracking tightening (blur). Eyebrow + hairline rule + subtitle.
gsap.registerPlugin(CustomEase);
studio.clip({
  duration: 5,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const ease = CustomEase.create('lmEditorial', '0.16,1,0.3,1');
    const weights = { 'Playfair Display': [400, 700], Manrope: [500, 800], Inter: [500, 800], Unbounded: [400, 800] };
    const weight = (weights[p.font] || [500, 800])[p.weight === 'bold' ? 1 : 0];
    const variant = p.variant || 'slide';

    const el = document.createElement('div');
    el.className = `lm ${p.align} ${p.shadow ? 'shadow' : ''}`;
    el.style.cssText = `--color:${p.color};--accent:${p.accent}`;
    root.appendChild(el);

    let eyebrow = null;
    if (p.eyebrow) {
      eyebrow = document.createElement('div');
      eyebrow.className = 'eyebrow';
      eyebrow.innerHTML = '<i></i><span class="clip"><span></span></span>';
      eyebrow.querySelector('.clip > span').textContent = p.eyebrow;
      el.appendChild(eyebrow);
    }
    const lines = document.createElement('div');
    lines.className = 'lines';
    lines.style.cssText = `font-family:'${p.font}',serif;font-weight:${weight};font-size:${p.size}px`;
    if (p.font === 'Unbounded') lines.style.letterSpacing = '-0.04em';
    el.appendChild(lines);

    const rows = String(p.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const lineEls = rows.map((row) => {
      const line = document.createElement('div');
      line.className = 'line clip';
      const inner = document.createElement('span');
      inner.className = 'in';
      // *accent* groups → coloured spans; chars wrapped for the blur variant
      row.split(/(\*[^*]+\*)/).filter(Boolean).forEach((seg) => {
        const acc = /^\*.*\*$/.test(seg);
        const host = acc ? Object.assign(document.createElement('span'), { className: 'acc' }) : inner;
        const txt = acc ? seg.slice(1, -1) : seg;
        if (variant === 'blur') [...txt].forEach((c) => host.appendChild(Object.assign(document.createElement('span'), { className: 'ch', textContent: c })));
        else host.appendChild(document.createTextNode(txt));
        if (acc) inner.appendChild(host);
      });
      line.appendChild(inner);
      lines.appendChild(line);
      return line;
    });

    let foot = null;
    if (p.subtitle) {
      foot = document.createElement('div');
      foot.className = 'foot';
      foot.innerHTML = '<div class="rule"></div><div class="sub clip"><span></span></div>';
      foot.querySelector('.sub > span').textContent = p.subtitle;
      el.appendChild(foot);
    }

    // fit: shrink so the widest line fits the safe area (lines never wrap)
    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, rows.join(' ')); } catch (e) {}
    const maxW = studio.width - 320;
    const widest = Math.max(1, ...lineEls.map((l) => l.firstChild.scrollWidth));
    if (widest > maxW) lines.style.fontSize = Math.floor(p.size * maxW / widest) + 'px';
    // the rule spans the text block, not the whole safe area
    if (foot) foot.style.width = Math.min(maxW, Math.max(...lineEls.map((l) => l.firstChild.scrollWidth))) + 'px';
    if (foot && p.align === 'center') foot.style.margin = '44px auto 0';

    // ---- timing (compressed for short items) ----
    const k = Math.min(1, D / 4);
    const st = p.stagger * k;
    const inDur = 0.95 * Math.max(0.6, k);
    const t0 = 0.08;
    const tLines = eyebrow ? t0 + 0.12 * k : t0;
    const inners = lineEls.map((l) => l.firstChild);
    const lastIn = tLines + st * (inners.length - 1) + inDur;
    const exitDur = Math.min(0.55, D * 0.14);
    const exitSt = Math.min(0.06, exitDur * 0.35 / Math.max(1, inners.length));
    const out = Math.max(lastIn * 0.85, D - exitDur - exitSt * inners.length - 0.12);

    if (eyebrow) {
      tl.fromTo(eyebrow.querySelector('i'), { scaleX: 0 }, { scaleX: 1, duration: 0.7 * k + 0.2, ease }, t0)
        .fromTo(eyebrow.querySelector('.clip > span'), { yPercent: 110 }, { yPercent: 0, duration: inDur * 0.9, ease }, t0 + 0.06);
    }
    if (variant === 'blur') {
      lineEls.forEach((l, i) => {
        const chars = [...l.querySelectorAll('.ch')];
        const at = tLines + i * st;
        tl.fromTo(l.firstChild, { letterSpacing: '0.2em' }, { letterSpacing: '0em', duration: inDur * 1.4, ease }, at)
          .fromTo(chars, { opacity: 0, filter: 'blur(12px)' }, { opacity: 1, filter: 'blur(0px)', duration: inDur * 0.8, ease: 'power2.out', stagger: { each: Math.min(0.025, 0.5 / chars.length), from: 'start' } }, at);
      });
    } else {
      const from = variant === 'rotate' ? { yPercent: 115, rotate: 7, transformOrigin: '0% 100%' } : { yPercent: 112 };
      tl.fromTo(inners, from, { yPercent: 0, rotate: 0, duration: inDur, ease, stagger: st }, tLines);
    }
    if (foot) {
      tl.fromTo(foot.querySelector('.rule'), { scaleX: 0 }, { scaleX: 1, duration: 1.1 * k + 0.2, ease: 'expo.inOut' }, tLines + st * 0.5 + 0.1 * k)
        .fromTo(foot.querySelector('.sub > span'), { yPercent: 110 }, { yPercent: 0, duration: inDur * 0.9, ease }, tLines + st * inners.length + 0.25 * k);
    }
    // secondary motion during the hold: slow drift + breathing scale
    tl.fromTo(lines, { x: 0, scale: 1, transformOrigin: p.align === 'center' ? '50% 50%' : '0% 50%' }, { x: p.align === 'center' ? 0 : 14, scale: 1.02, duration: D, ease: 'none' }, 0);

    // ---- exit: lines leave upward through the same masks (faster than the entrance) ----
    if (variant === 'blur') {
      tl.to(lineEls.map((l) => l.firstChild), { opacity: 0, filter: 'blur(14px)', letterSpacing: '0.12em', duration: exitDur, ease: 'power2.in', stagger: exitSt }, out);
    } else {
      tl.to(inners, { yPercent: -112, rotate: variant === 'rotate' ? -4 : 0, duration: exitDur, ease: 'power3.in', stagger: exitSt }, out);
    }
    if (eyebrow) {
      tl.to(eyebrow.querySelector('.clip > span'), { yPercent: -110, duration: exitDur * 0.9, ease: 'power3.in' }, out)
        .to(eyebrow.querySelector('i'), { scaleX: 0, transformOrigin: 'right center', duration: exitDur * 0.9, ease: 'power3.in' }, out + 0.04);
    }
    if (foot) {
      tl.to(foot.querySelector('.sub > span'), { yPercent: -110, duration: exitDur * 0.9, ease: 'power3.in' }, out + 0.03)
        .to(foot.querySelector('.rule'), { scaleX: 0, transformOrigin: p.align === 'center' ? 'center' : 'right center', duration: exitDur, ease: 'power3.in' }, out + 0.06);
    }
  },
});
