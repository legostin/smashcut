// Subscribe CTA: card pop → cursor clicks subscribe → like (burst) → bell (wiggle) → exit.
studio.clip({
  duration: 5,
  async setup(root, p, { tl, duration, width, height }) {
    const D = duration;
    const THUMB = 'M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z';
    const BELL = 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z';
    const burst = (c) => `<div class="burst">${Array.from({ length: 8 }, (_, i) => `<i style="background:${c};transform:rotate(${i * 45}deg) translateX(30px)"></i>`).join('')}</div>`;
    const el = document.createElement('div');
    el.className = 'ss';
    el.innerHTML = `
      <div class="card" style="background:${p.cardColor};color:${p.textColor}">
        <div class="av" style="background:linear-gradient(135deg, ${p.avatarColor}, ${p.accent})"></div>
        <div class="meta"><div class="name"></div><div class="subs"></div></div>
        <div class="btn"><div class="bgA" style="background:${p.accent}"></div><div class="bgB" style="background:rgba(255,255,255,.14)"></div><div class="ripple"></div>
          <div class="t tA"></div><div class="t tB"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span></div></div>
        <div class="ic like">${burst(p.accent)}<svg viewBox="0 0 24 24"><path d="${THUMB}" fill="none" stroke="${p.textColor}" stroke-width="1.8" stroke-linejoin="round"/><path class="fill" d="${THUMB}" fill="${p.textColor}"/></svg></div>
        <div class="ic bell">${burst('#ffd426')}<svg viewBox="0 0 24 24"><g class="bellg"><path d="${BELL}" fill="none" stroke="${p.textColor}" stroke-width="1.8" stroke-linejoin="round"/><path class="fill" d="${BELL}" fill="${p.textColor}"/></g></svg></div>
      </div>
      <svg class="cursor" viewBox="0 0 24 24"><path d="M3 2l15.5 9.2-6.6 1.5 3.9 7.3-3 1.6-3.9-7.4L4 18.8z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.av').textContent = (p.initials || '').slice(0, 3);
    $('.name').textContent = p.channel;
    $('.subs').textContent = p.subscribers;
    $('.tA').textContent = p.button;
    $('.tB span').textContent = p.subscribed;
    if (!p.showLike) $('.like').style.display = 'none';
    if (!p.showBell) $('.bell').style.display = 'none';
    try { await document.fonts.load("800 28px 'Manrope'", p.button + p.subscribed + p.channel); } catch (e) {}

    // place card
    const card = $('.card');
    const cw = card.offsetWidth, ch = card.offsetHeight, s = p.scale;
    const M = 110;
    const pos = p.position;
    const cx = pos === 'bottom-left' ? M + (cw * s) / 2 : pos === 'bottom-right' ? width - M - (cw * s) / 2 : width / 2;
    const cy = pos === 'center' ? height / 2 : height - 120 - (ch * s) / 2;
    card.style.left = cx - cw / 2 + 'px';
    card.style.top = cy - ch / 2 + 'px';
    card.style.transform = `scale(${s})`;
    // absolute centres of the click targets (account for the card scale around its centre)
    const centre = (node) => {
      const x = node.offsetLeft + node.offsetWidth / 2, y = node.offsetTop + node.offsetHeight / 2;
      return { x: cx + (x - cw / 2) * s, y: cy + (y - ch / 2) * s };
    };
    const btn = $('.btn');
    const P = { btn: centre(btn), like: centre($('.like')), bell: centre($('.bell')) };

    // compress the action sequence for short clips
    const k = Math.max(0.55, Math.min(1, (D - 0.7) / 4.3));
    const T = (x) => x * k;
    const cursor = $('.cursor');
    const out = D - 0.55;
    tl.set(card, { transformOrigin: '50% 50%' }, 0)
      .fromTo(card, { scale: s * 0.7, opacity: 0, y: 40 }, { scale: s, opacity: 1, y: 0, duration: 0.55, ease: 'back.out(1.7)' }, 0.02)
      .fromTo($('.av'), { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.5)' }, 0.15)
      .fromTo([$('.name'), $('.subs')], { x: -20, opacity: 0 }, { x: 0, opacity: (i) => (i ? 0.6 : 1), duration: 0.45, ease: 'power3.out', stagger: 0.06 }, 0.2)
      .fromTo(btn, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)' }, 0.28)
      .fromTo(el.querySelectorAll('.ic'), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)', stagger: 0.06 }, 0.34)
      .set($('.tB'), { opacity: 0 }, 0).set($('.bgB'), { opacity: 0 }, 0)
      .set(el.querySelectorAll('.fill'), { opacity: 0 }, 0)
      .set(el.querySelectorAll('.burst i'), { opacity: 0 }, 0)
      .set($('.ripple'), { opacity: 0 }, 0);

    // cursor path
    const hot = (pt) => ({ x: pt.x - 6, y: pt.y - 4 }); // tip of the arrow sits on the target
    const c0 = { x: P.btn.x + 380, y: Math.min(height + 60, P.btn.y + 320) };
    tl.set(cursor, { x: c0.x, y: c0.y, opacity: 0 }, 0)
      .to(cursor, { opacity: 1, duration: 0.15 }, T(0.6))
      .to(cursor, { x: hot(P.btn).x, duration: T(0.75), ease: 'power2.out' }, T(0.6))
      .to(cursor, { y: hot(P.btn).y, duration: T(0.75), ease: 'power3.out' }, T(0.6));
    const click = (at) => tl.to(cursor, { scale: 0.82, duration: 0.08, ease: 'power2.in', transformOrigin: '10% 8%' }, at).to(cursor, { scale: 1, duration: 0.18, ease: 'back.out(3)' }, at + 0.08);
    // subscribe click
    const t1 = T(1.45);
    click(t1);
    const bRect = { x: btn.offsetWidth / 2, y: btn.offsetHeight / 2 };
    tl.set($('.ripple'), { left: bRect.x, top: bRect.y }, 0)
      .fromTo($('.ripple'), { scale: 0, opacity: 0.8 }, { scale: 9, opacity: 0, duration: 0.6, ease: 'power2.out' }, t1 + 0.04)
      .fromTo(btn, { scale: 1 }, { scale: 0.94, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.inOut' }, t1)
      .to($('.bgA'), { opacity: 0, duration: 0.25 }, t1 + 0.1)
      .to($('.bgB'), { opacity: 1, duration: 0.25 }, t1 + 0.1)
      .to($('.tA'), { yPercent: -120, opacity: 0, duration: 0.25, ease: 'power2.in' }, t1 + 0.08)
      .fromTo($('.tB'), { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 0.9, duration: 0.35, ease: 'back.out(2)' }, t1 + 0.22);
    let tNext = T(1.95);
    const iconClick = (sel, target, anim) => {
      tl.to(cursor, { x: hot(target).x, y: hot(target).y, duration: T(0.45), ease: 'power3.inOut' }, tNext);
      const at = tNext + T(0.5);
      click(at);
      const ic = $(sel);
      tl.to(ic.querySelector('.fill'), { opacity: 1, duration: 0.1 }, at + 0.06)
        .fromTo(ic.querySelectorAll('.burst i'), { opacity: 1, scaleX: 0.2, x: 0 }, { opacity: 0, scaleX: 1, x: 22, duration: 0.5, ease: 'power3.out' }, at + 0.06);
      anim(ic, at);
      tNext = at + T(0.4);
    };
    if (p.showLike) iconClick('.like', P.like, (ic, at) => {
      tl.fromTo(ic.querySelector('svg'), { scale: 1, rotate: 0 }, { scale: 1.35, rotate: -14, duration: 0.14, ease: 'power2.out' }, at + 0.06)
        .to(ic.querySelector('svg'), { scale: 1, rotate: 0, duration: 0.45, ease: 'elastic.out(1, 0.4)' }, at + 0.2)
        .to(ic, { backgroundColor: p.accent, duration: 0.2 }, at + 0.06);
    });
    if (p.showBell) iconClick('.bell', P.bell, (ic, at) => {
      const g = ic.querySelector('.bellg');
      tl.set(g, { transformOrigin: '50% 8%' }, 0);
      [18, -15, 11, -7, 4, 0].forEach((r, i) => tl.to(g, { rotate: r, duration: 0.09, ease: 'sine.inOut' }, at + 0.06 + i * 0.09));
    });
    // cursor leaves
    tl.to(cursor, { x: '+=220', y: '+=200', opacity: 0, duration: 0.5, ease: 'power2.in' }, Math.min(tNext + 0.2, out - 0.3));
    // exit
    tl.to(card, { scale: s * 0.85, opacity: 0, y: 30, duration: 0.45, ease: 'back.in(1.5)' }, out);
  },
});
