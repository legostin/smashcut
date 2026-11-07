// Milestone timeline. Layout is computed along a "main" axis (x for horizontal, y for vertical);
// the progress head, spine draw-on and camera pan are evaluated in render(t); pops / cards on ctx.tl.
studio.clip({
  duration: 10,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const vertical = p.orientation === 'vertical' || (p.orientation === 'auto' && H > W * 1.1);
    const S = Math.min(W, H) / 1080;
    const A = p.accent;
    const items = String(p.items || '').split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0] || a[1]).slice(0, 16)
      .map((a) => ({ date: a[0] || '', title: a[1] || '', text: a[2] || '' }));
    if (!items.length) items.push({ date: '—', title: '', text: '' });
    const N = items.length;
    const M = { x: W * 0.0625, y: H * (vertical ? 0.06 : 0.083) };

    const el = document.createElement('div');
    el.className = 'tm' + (p.background ? '' : ' nobg');
    el.style.color = p.textColor;
    el.innerHTML = `${p.background ? `<div class="bg" style="background:radial-gradient(ellipse at 50% 0%, ${A}14, transparent 60%), ${p.bgColor}"><div class="dots"></div><div class="glow" style="background:${A}"></div></div>` : ''}
      <div class="vp" style="position:absolute;inset:0"><div class="track"><div class="base"></div><div class="prog" style="background:${A};box-shadow:0 0 18px ${A}88"></div></div></div>
      <div class="head" style="left:${M.x}px;top:${M.y}px;right:${M.x}px"><div class="title"><span></span></div><div class="sub"></div></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.title span').textContent = p.title || '';
    $('.sub').textContent = p.subtitle || '';
    if (!p.subtitle) $('.sub').style.display = 'none';
    if (!p.title && !p.subtitle) $('.head').style.display = 'none';
    if (S !== 1) { $('.title').style.fontSize = 64 * S * (vertical ? 1.25 : 1) + 'px'; $('.sub').style.fontSize = 28 * S * (vertical ? 1.25 : 1) + 'px'; }
    const headH = p.title || p.subtitle ? $('.head').offsetHeight : 0;
    const track = $('.track'), base = $('.base'), prog = $('.prog');
    // soft edge mask so cards never slide under the title / out of the frame abruptly
    const vp = $('.vp');
    const mk = vertical
      ? `linear-gradient(180deg, transparent ${M.y + headH + 10}px, #000 ${M.y + headH + 90 * S}px, #000 ${H - 60 * S}px, transparent ${H}px)`
      : `linear-gradient(90deg, transparent 0, #000 ${M.x * 0.9}px, #000 ${W - M.x * 0.9}px, transparent ${W}px)`;
    vp.style.webkitMaskImage = vp.style.maskImage = mk;

    // ---------- build nodes & cards ----------
    const cardScale = S * (vertical ? 1.6 : 1.14);
    const gap = Math.max(240, Number(p.spacing) || 430) * S * (vertical ? 1.05 : 1);
    const cardW = vertical ? (W - M.x * 2 - 120 * S) / cardScale : 360;
    const nodes = items.map((it, i) => {
      const node = document.createElement('div');
      node.className = 'node';
      node.style.borderColor = A;
      node.innerHTML = `<div class="fill" style="background:${A}"></div>`;
      const stem = document.createElement('div');
      stem.className = 'stem';
      stem.style.background = p.textColor;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.width = cardW + 'px';
      card.innerHTML = `<div class="d" style="color:${A}"></div><div class="t"></div><div class="x"></div>`;
      card.querySelector('.d').textContent = it.date;
      card.querySelector('.t').textContent = it.title;
      card.querySelector('.x').textContent = it.text;
      if (!it.text) card.querySelector('.x').style.display = 'none';
      if (!it.title) card.querySelector('.t').style.display = 'none';
      card.style.transformOrigin = '0 0';
      track.append(stem, card, node);
      return { node, stem, card, fill: node.querySelector('.fill') };
    });
    const cardH = Math.max(...nodes.map((n) => n.card.offsetHeight)) * cardScale;
    const stemL = 46 * S;

    let u0, spine, maxCam, focus, uEnd;
    if (!vertical) {
      spine = Math.min(H - M.y - cardH - stemL - 30 * S, Math.max(M.y + headH + 50 * S + cardH + stemL, H * 0.56));
      u0 = M.x + (cardW * cardScale) / 2;
      uEnd = u0 + (N - 1) * gap;
      maxCam = Math.max(0, uEnd + (cardW * cardScale) / 2 + M.x - W);
      focus = W * 0.58;
      base.style.cssText += `left:${u0 - 140 * S}px;top:${spine - 1.5 * S}px;width:${uEnd - u0 + 280 * S}px;height:${3 * S}px;background:repeating-linear-gradient(90deg, ${p.textColor}40 0 ${10 * S}px, transparent ${10 * S}px ${20 * S}px)`;
      prog.style.cssText += `left:${u0 - 140 * S}px;top:${spine - 3 * S}px;height:${6 * S}px;width:${uEnd - u0 + 140 * S}px`;
    } else {
      spine = M.x + 26 * S;
      u0 = M.y + headH + 120 * S + cardH / 2;
      uEnd = u0 + (N - 1) * Math.max(gap, cardH + 50 * S);
      maxCam = Math.max(0, uEnd + cardH / 2 + H * 0.12 - H);
      focus = H * 0.55;
      base.style.cssText += `left:${spine - 1.5 * S}px;top:${u0 - 120 * S}px;height:${uEnd - u0 + 260 * S}px;width:${3 * S}px;background:repeating-linear-gradient(180deg, ${p.textColor}40 0 ${10 * S}px, transparent ${10 * S}px ${20 * S}px)`;
      prog.style.cssText += `left:${spine - 3 * S}px;top:${u0 - 120 * S}px;width:${6 * S}px;height:${uEnd - u0 + 120 * S}px`;
    }
    const step = vertical ? Math.max(gap, cardH + 50 * S) : gap;
    const fitTrack = !p.cameraFollow && maxCam > 0 ? (vertical ? H : W) / ((vertical ? H : W) + maxCam) : 1;
    if (fitTrack !== 1) { track.style.transformOrigin = '0 0'; maxCam = 0; }
    nodes.forEach((n, i) => {
      const u = u0 + i * step;
      n.u = u;
      n.above = !vertical && i % 2 === 0;
      n.node.style.transform = `scale(${S})`;
      const cw = cardW * cardScale;
      if (!vertical) {
        n.node.style.left = u + 'px'; n.node.style.top = spine + 'px';
        n.stem.style.left = u + 'px'; n.stem.style.height = stemL + 'px';
        n.stem.style.top = (n.above ? spine - stemL - 14 * S : spine + 14 * S) + 'px';
        n.stem.style.transformOrigin = n.above ? '50% 100%' : '50% 0';
        n.card.style.left = u - cw / 2 + 'px';
        n.card.style.top = (n.above ? spine - stemL - 14 * S - cardH : spine + stemL + 14 * S) + 'px';
      } else {
        n.node.style.left = spine + 'px'; n.node.style.top = u + 'px';
        n.stem.style.top = u - 1 + 'px'; n.stem.style.left = spine + 14 * S + 'px';
        n.stem.style.width = stemL + 'px'; n.stem.style.height = 2 + 'px'; n.stem.style.marginLeft = '0';
        n.stem.style.transformOrigin = '0 50%';
        n.card.style.left = spine + 14 * S + stemL + 'px';
        n.card.style.top = u - (n.card.offsetHeight * cardScale) / 2 + 'px';
      }
      n.card.style.transform = `scale(${cardScale})`;
    });
    const tip = document.createElement('div');
    tip.className = 'tip';
    tip.style.background = '#fff';
    tip.style.boxShadow = `0 0 0 ${6 * S}px ${A}55, 0 0 ${30 * S}px ${A}`;
    track.appendChild(tip);

    // ---------- schedule ----------
    const out = Math.max(1.8, duration - 0.7);
    const tStart = Math.min(0.9, duration * 0.12);
    const per = N > 1 ? Math.max(0.35, Math.min(2.2, (out - 0.9 - tStart) / (N - 1))) : 1;
    const reach = nodes.map((_, i) => tStart + i * per);
    const move = Math.min(per * 0.72, 1.1);
    const camT0 = Math.max(tStart, tStart + ((focus - u0) / step - 0.5) * per);
    const camT1 = Math.min(reach[N - 1] + 0.4, Math.max(camT0 + 0.8, camT0 + (maxCam / step) * per + per));

    // ---------- GSAP ----------
    tl.fromTo($('.title span'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out' }, 0.05)
      .fromTo($('.sub'), { y: 14, opacity: 0 }, { y: 0, opacity: 0.55, duration: 0.6, ease: 'expo.out' }, 0.18)
      .fromTo(base, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' }, 0.15)
      .fromTo(nodes.map((n) => n.node), { opacity: 0, scale: 0.4 * S }, { opacity: 0.55, scale: S, duration: 0.5, ease: 'back.out(2)', stagger: 0.05 }, 0.2);
    nodes.forEach((n, i) => {
      const t = reach[i];
      const dir = n.above ? 1 : -1;
      tl.to(n.node, { opacity: 1, duration: 0.15 }, t - 0.05)
        .fromTo(n.fill, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, t - 0.02)
        .fromTo(n.node, { scale: S }, { scale: 1.25 * S, duration: 0.14, ease: 'power2.out', yoyo: true, repeat: 1 }, t - 0.02)
        .fromTo(n.stem, vertical ? { scaleX: 0 } : { scaleY: 0 }, vertical ? { scaleX: 1, duration: 0.35, ease: 'power3.out' } : { scaleY: 1, duration: 0.35, ease: 'power3.out' }, t + 0.02)
        .fromTo(n.card, vertical ? { x: -24 * S, opacity: 0, clipPath: 'inset(0 100% 0 0 round 22px)' } : { y: 30 * S * dir, opacity: 0, clipPath: n.above ? 'inset(100% 0 0 0 round 22px)' : 'inset(0 0 100% 0 round 22px)' },
          { x: 0, y: 0, opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 22px)', duration: 0.75, ease: 'expo.out' }, t + 0.08)
        .fromTo(n.card.children, { y: 16, opacity: 0 }, { y: 0, opacity: (k) => (k === 2 ? 0.66 : 1), duration: 0.6, ease: 'expo.out', stagger: 0.06 }, t + 0.2);
    });
    tl.to(nodes.map((n) => n.card), { opacity: 0, y: vertical ? 0 : 12 * S, x: vertical ? 12 * S : 0, duration: 0.35, ease: 'power2.in', stagger: 0.03 }, out)
      .to([...nodes.map((n) => n.node), ...nodes.map((n) => n.stem), base, prog, tip], { opacity: 0, duration: 0.4, ease: 'power2.in' }, out + 0.12)
      .to($('.title span'), { yPercent: -110, duration: 0.4, ease: 'power3.in' }, out + 0.05)
      .to($('.sub'), { opacity: 0, duration: 0.3, ease: 'power2.in' }, out + 0.05);

    const eIO = gsap.parseEase('power2.inOut'), eCam = gsap.parseEase('sine.inOut');
    const glow = el.querySelector('.bg .glow');
    const leadIn = 140 * S;
    return {
      render(t) {
        // progress head along the main axis
        let hu = u0 - leadIn + leadIn * eIO(studio.progress(t, tStart - 0.55, 0.55));
        for (let i = 1; i < N; i++) {
          if (t >= reach[i]) { hu = nodes[i].u; continue; }
          if (t >= reach[i] - move) hu = nodes[i - 1].u + (nodes[i].u - nodes[i - 1].u) * eIO((t - (reach[i] - move)) / move);
          else if (t >= reach[i - 1]) hu = nodes[i - 1].u;
          break;
        }
        const drawn = Math.max(0, hu - (u0 - leadIn));
        if (!vertical) prog.style.width = drawn + 'px'; else prog.style.height = drawn + 'px';
        if (!vertical) { tip.style.left = hu + 'px'; tip.style.top = spine + 'px'; } else { tip.style.left = spine + 'px'; tip.style.top = hu + 'px'; }
        tip.style.transform = `scale(${(Math.min(1, studio.progress(t, tStart - 0.55, 0.3)) * (1 + 0.12 * Math.sin(t * 5))).toFixed(3)})`;
        // camera
        const cam = maxCam * eCam(studio.progress(t, camT0, camT1 - camT0));
        track.style.transform = fitTrack !== 1 ? `scale(${fitTrack})` : vertical ? `translateY(${-cam}px)` : `translateX(${-cam}px)`;
        if (glow) {
          const sx = vertical ? spine : (hu - cam) * fitTrack, sy = vertical ? (hu - cam) * fitTrack : spine;
          glow.style.left = sx + 'px'; glow.style.top = sy + 'px';
          glow.style.opacity = (0.15 * Math.min(1, studio.progress(t, 0.2, 0.8)) * (1 - studio.progress(t, out, 0.5))).toFixed(3);
        }
      },
    };
  },
});
