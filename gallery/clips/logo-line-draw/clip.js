// Line-draw logo sting: DrawSVG draws each shape's outline in sequence (overlapping), then fills
// cross-fade in while strokes fade out, a masked shine sweeps the mark and the wordmark tracks in.
gsap.registerPlugin(DrawSVGPlugin);
studio.clip({
  duration: 4.5,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const NS = 'http://www.w3.org/2000/svg';
    // built-in mark: compass ring + monoline N + north pointer (120×120)
    const DEFAULT = [
      { d: 'M60 4a56 56 0 1 1 0 112a56 56 0 1 1 0-112ZM60 13a47 47 0 1 0 0 94a47 47 0 1 0 0-94Z', rule: 'evenodd' },
      { d: 'M38 88V34h10l24 34V34h10v54H72L48 54v34Z' },
      { d: 'M60 18l7 11H53Z' },
    ];
    const GEOM = ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'x1', 'y1', 'x2', 'y2', 'transform', 'fill-rule'];
    function parseLogo(src) {
      src = String(src || '').trim();
      if (!src) return DEFAULT.map((s) => ({ tag: 'path', attrs: { d: s.d, 'fill-rule': s.rule || 'nonzero' } }));
      if (src.includes('<')) {
        const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
        return [...doc.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,line')].map((n) => {
          const attrs = {};
          for (const a of GEOM) if (n.getAttribute(a) != null) attrs[a] = n.getAttribute(a);
          return { tag: n.tagName.toLowerCase(), attrs };
        });
      }
      return src.split('\n').map((l) => l.trim()).filter(Boolean).map((d) => ({ tag: 'path', attrs: { d } }));
    }
    const shapes = parseLogo(p.logoSvg);
    const fills = String(p.fillColors || '#fff').split(',').map((s) => s.trim()).filter(Boolean);

    const el = document.createElement('div');
    el.className = `ld ${p.layout}`;
    el.innerHTML = '<div class="markw"></div><div class="txt"><div class="word"></div><div class="tag"></div></div>';
    root.appendChild(el);
    const markw = el.querySelector('.markw');
    const svg = document.createElementNS(NS, 'svg');
    markw.appendChild(svg);
    const mk = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); parent && parent.appendChild(n); return n; };
    const defs = mk('defs', {}, svg);
    const uid = 'ld' + Math.floor(studio.random(p.wordmark || 'x')() * 1e6);
    const clip = mk('clipPath', { id: uid + 'c' }, defs);
    const grad = mk('linearGradient', { id: uid + 'g', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
    [['0', 0], ['0.45', 0.0], ['0.5', 0.85], ['0.55', 0], ['1', 0]].forEach(([o, a]) => mk('stop', { offset: o, 'stop-color': '#ffffff', 'stop-opacity': a }, grad));
    const gFill = mk('g', {}, svg);
    const gStroke = mk('g', { fill: 'none', stroke: p.strokeColor, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const fillEls = [], strokeEls = [];
    shapes.forEach((s, i) => {
      fillEls.push(mk(s.tag, { ...s.attrs, fill: fills[i % fills.length] }, gFill));
      strokeEls.push(mk(s.tag, s.attrs, gStroke));
      mk(s.tag, { ...s.attrs, 'clip-rule': s.attrs['fill-rule'] || 'nonzero' }, clip);
    });
    // viewBox from the geometry
    const bb = gStroke.getBBox();
    const pad = Math.max(bb.width, bb.height) * 0.04;
    const vb = [bb.x - pad, bb.y - pad, bb.width + pad * 2, bb.height + pad * 2];
    svg.setAttribute('viewBox', vb.join(' '));
    const scale = p.markSize / Math.max(vb[2], vb[3]);
    svg.setAttribute('width', vb[2] * scale);
    svg.setAttribute('height', vb[3] * scale);
    gStroke.setAttribute('stroke-width', p.strokeWidth / scale);
    gStroke.style.filter = `drop-shadow(0 0 ${6}px ${p.strokeColor})`;
    const gShine = mk('g', { 'clip-path': `url(#${uid}c)` }, svg);
    const bw = vb[2] * 0.9;
    const shine = mk('rect', { x: vb[0] - bw, y: vb[1] - vb[3], width: bw, height: vb[3] * 3, fill: `url(#${uid}g)`, transform: `rotate(18 ${vb[0] + vb[2] / 2} ${vb[1] + vb[3] / 2})` }, gShine);

    const word = el.querySelector('.word'), tag = el.querySelector('.tag');
    const weight = p.font === 'Playfair Display' ? 700 : p.font === 'Unbounded' ? 600 : 800;
    word.style.cssText += `font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.wordSize}px;color:${p.textColor};letter-spacing:0.05em`;
    word.textContent = p.wordmark || '';
    tag.textContent = p.tagline || '';
    tag.style.color = p.textColor;
    if (!p.wordmark) word.style.display = 'none';
    if (!p.tagline) tag.style.display = 'none';
    try { await document.fonts.load(`${weight} ${p.wordSize}px '${p.font}'`, p.wordmark || 'x'); } catch (e) {}
    const maxW = studio.width - 300 - (p.layout === 'horizontal' ? p.markSize + 56 : 0);
    if (word.scrollWidth > maxW) word.style.fontSize = Math.floor(p.wordSize * maxW / word.scrollWidth * 0.92) + 'px';
    // lock the text column to its final width so the tracking animation never re-centres the lockup
    const txt = el.querySelector('.txt');
    txt.style.width = Math.max(word.scrollWidth, tag.scrollWidth) + 'px';

    // ---- timing ----
    const sting = p.variant === 'sting';
    const k = Math.min(1, D / (sting ? 2.2 : 3.6));
    const dd = (sting ? Math.min(0.5, p.drawDuration) : p.drawDuration) * k;
    const gap = dd * 0.4; // 60 % overlap
    const t0 = 0.05;
    const n = strokeEls.length;
    strokeEls.forEach((s, i) => {
      tl.fromTo(s, { drawSVG: '0%' }, { drawSVG: '100%', duration: dd, ease: 'power2.inOut' }, t0 + i * gap);
    });
    const drawEnd = t0 + (n - 1) * gap + dd;
    const fillAt = drawEnd - 0.15 * k;
    tl.fromTo(fillEls, { opacity: 0 }, { opacity: 1, duration: 0.4 * Math.max(0.6, k), ease: 'power1.inOut', stagger: 0.06 * k }, fillAt)
      .to(gStroke, { opacity: 0, duration: 0.45 * Math.max(0.6, k), ease: 'power1.in' }, fillAt + 0.1 * k)
      .fromTo(svg, { scale: 0.96, transformOrigin: '50% 50%' }, { scale: 1.02, duration: drawEnd, ease: 'power1.inOut' }, 0)
      .to(svg, { scale: 1, duration: 0.7 * Math.max(0.6, k), ease: 'expo.out' }, fillAt + 0.15 * k);
    if (p.shine) tl.fromTo(shine, { attr: { x: vb[0] - bw - vb[2] * 0.3 } }, { attr: { x: vb[0] + vb[2] * 1.3 }, duration: 0.9 * Math.max(0.6, k), ease: 'power2.inOut' }, fillAt + 0.35 * k);
    const wAt = drawEnd - 0.35 * k;
    tl.fromTo(word, { opacity: 0, letterSpacing: '0.5em', marginRight: '-0.45em' }, { opacity: 1, letterSpacing: '0.05em', marginRight: '0em', duration: 1.3 * Math.max(0.6, k), ease: 'expo.out' }, wAt)
      .fromTo(tag, { opacity: 0, y: 10 }, { opacity: 0.7, y: 0, duration: 0.8 * Math.max(0.6, k), ease: 'expo.out' }, wAt + 0.35 * k);
    // hold life: very slow push of the whole lockup
    tl.fromTo(el, { scale: 1 }, { scale: 1.03, duration: D, ease: 'none' }, 0);
    // exit
    const exitDur = Math.min(0.5, D * 0.13);
    const out = D - exitDur - 0.05;
    tl.to(word, { opacity: 0, letterSpacing: '0.18em', duration: exitDur, ease: 'power2.in' }, out)
      .to(tag, { opacity: 0, y: -6, duration: exitDur * 0.8, ease: 'power2.in' }, out)
      .to(svg, { opacity: 0, scale: 0.92, duration: exitDur, ease: 'power2.in' }, out + 0.03);
  },
});
