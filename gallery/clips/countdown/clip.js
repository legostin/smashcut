// Countdown: N steps + optional final word evenly divide the clip duration.
studio.clip({
  duration: 4,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const N = Math.max(1, Math.min(10, p.from | 0));
    const hasFinal = !!(p.finalText && p.finalText.trim());
    const step = D / (N + (hasFinal ? 1 : 0));
    const R = 290, C = 2 * Math.PI * R;
    const weight = p.font === 'Bebas Neue' ? 400 : p.font === 'Unbounded' ? 800 : 800;
    const NT = 48;
    let ticks = '';
    for (let i = 0; i < NT; i++) { const a = (i / NT) * Math.PI * 2, r1 = 340, r2 = i % 4 === 0 ? 362 : 352; ticks += `<line x1="${400 + Math.cos(a) * r1}" y1="${400 + Math.sin(a) * r1}" x2="${400 + Math.cos(a) * r2}" y2="${400 + Math.sin(a) * r2}" stroke="${p.color}" stroke-opacity="${i % 4 === 0 ? 0.5 : 0.22}" stroke-width="${i % 4 === 0 ? 4 : 3}" stroke-linecap="round"/>`; }
    const el = document.createElement('div');
    el.className = 'cd';
    el.innerHTML = `
      <div class="disc" style="background:${p.discColor};${p.disc ? '' : 'display:none'}"></div>
      <div class="flash" style="background:radial-gradient(circle, ${p.accent}88 0%, ${p.accent}00 70%)"></div>
      <svg width="800" height="800" viewBox="0 0 800 800">
        <g class="ticks">${ticks}</g>
        <circle cx="400" cy="400" r="${R}" fill="none" stroke="${p.color}" stroke-opacity=".12" stroke-width="16"/>
        <circle class="arc" cx="400" cy="400" r="${R}" fill="none" stroke="${p.accent}" stroke-width="16" stroke-linecap="round" transform="rotate(-90 400 400)" stroke-dasharray="0 ${C}"/>
      </svg>
      ${Array.from({ length: N }, (_, i) => `<div class="n" style="font-family:'${p.font}',sans-serif;font-weight:${weight};font-size:${p.size}px;color:${p.color}">${N - i}</div>`).join('')}
      ${hasFinal ? `<div class="burst">${Array.from({ length: 16 }, (_, i) => `<div class="ray" style="transform:rotate(${i * 22.5}deg)"><i style="background:${i % 2 ? p.accent : p.accent2}"></i></div>`).join('')}</div><div class="final" style="font-family:'${p.font}',sans-serif;font-weight:${weight};color:${p.color}"></div>` : ''}`;
    root.appendChild(el);
    const nums = [...el.querySelectorAll('.n')];
    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, '0123456789' + (p.finalText || '')); } catch (e) {}
    nums.forEach((n) => { n.style.top = -n.offsetHeight / 2 + (p.font === 'Bebas Neue' ? 0.04 * p.size : 0) + 'px'; });
    const final = el.querySelector('.final');
    if (final) {
      final.textContent = p.finalText;
      final.style.fontSize = Math.min(p.size * 0.5, 1500 / Math.max(1, p.finalText.length) * 1.3) + 'px';
      final.style.top = -final.offsetHeight / 2 + 'px';
    }
    const disc = el.querySelector('.disc'), flash = el.querySelector('.flash');
    const svg = el.querySelector('svg'), arc = el.querySelector('.arc'), tickG = el.querySelector('.ticks');

    tl.fromTo([disc, svg], { scale: 0.4, opacity: 0 }, { scale: 1, opacity: (i) => (i ? 1 : p.discOpacity), duration: Math.min(0.5, step * 0.5), ease: 'back.out(1.6)' }, 0)
      .fromTo(tickG, { rotate: -30, transformOrigin: '400px 400px' }, { rotate: 60, duration: D, ease: 'none' }, 0);
    nums.forEach((n, i) => {
      const t0 = i * step;
      tl.fromTo(n, { scale: 1.8, opacity: 0, filter: 'blur(14px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: Math.min(0.35, step * 0.4), ease: 'expo.out' }, t0 + 0.02)
        .to(n, { scale: 0.55, opacity: 0, duration: Math.min(0.18, step * 0.2), ease: 'power2.in' }, t0 + step - Math.min(0.18, step * 0.2))
        .fromTo(flash, { scale: 0.7, opacity: 0.9 }, { scale: 1.35, opacity: 0, duration: Math.min(0.6, step * 0.7), ease: 'power2.out' }, t0 + 0.02);
    });
    const tf = N * step;
    if (final) {
      tl.to([disc, svg], { scale: 1.25, opacity: 0, duration: 0.35, ease: 'power2.in' }, tf)
        .fromTo(final, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: Math.min(0.5, step * 0.6), ease: 'back.out(2.2)' }, tf + 0.02)
        .fromTo(flash, { scale: 0.7, opacity: 1 }, { scale: 2.2, opacity: 0, duration: Math.min(0.7, step * 0.8), ease: 'power2.out' }, tf + 0.02)
        .to(final, { scale: 1.12, opacity: 0, filter: 'blur(8px)', duration: Math.min(0.3, step * 0.35), ease: 'power1.in' }, D - 0.05 - Math.min(0.3, step * 0.35));
      // rays start on an ellipse hugging the word so they never cross it
      const ea = final.offsetWidth / 2 + 30, eb = final.offsetHeight / 2 + 40;
      el.querySelectorAll('.ray i').forEach((r, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        const r0 = 1 / Math.sqrt(Math.pow(Math.cos(a) / ea, 2) + Math.pow(Math.sin(a) / eb, 2));
        const d1 = Math.min(0.3, step * 0.3), d2 = Math.min(0.45, step * 0.4), o = (i % 2) * Math.min(0.04, step * 0.04);
        tl.fromTo(r, { x: r0, scaleX: 0 }, { x: r0 + 40, scaleX: 1, duration: d1, ease: 'power3.out' }, tf + 0.02 + o)
          .to(r, { x: r0 + 260, scaleX: 0, duration: d2, ease: 'power3.in' }, tf + 0.02 + o + d1);
      });
    } else {
      tl.to([disc, svg], { scale: 0.6, opacity: 0, duration: Math.min(0.3, step * 0.3), ease: 'power2.in' }, D - 0.05 - Math.min(0.3, step * 0.3));
    }

    return {
      render(t) {
        // ring drains clockwise over each step
        if (t >= tf) { arc.setAttribute('stroke-dasharray', `0 ${C}`); arc.setAttribute('opacity', 0); return; }
        const local = (t % step) / step;
        const fill = 1 - studio.ease.inOutQuad(local);
        arc.setAttribute('opacity', fill > 0.002 ? 1 : 0);
        arc.setAttribute('stroke-dasharray', `${Math.max(0.001, fill * C)} ${C}`);
      },
    };
  },
});
