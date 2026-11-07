// Minimal lower third: line draws, name rises above it, role drops below it.
studio.clip({
  duration: 5,
  setup(root, p, { tl, duration }) {
    const el = document.createElement('div');
    el.className = `ltm ${p.position} ${p.shadow ? 'shadow' : ''}`;
    el.innerHTML = `
      <div class="mask top"><div class="name"></div></div>
      <div class="rule" style="height:${p.lineWeight}px"><div class="ln" style="height:${p.lineWeight}px;background:${p.lineColor}"></div><div class="dot" style="background:${p.accent}"></div></div>
      <div class="mask bot"><div class="role"></div></div>`;
    root.appendChild(el);
    const name = el.querySelector('.name'), role = el.querySelector('.role');
    name.textContent = p.name; role.textContent = p.role;
    name.style.fontSize = p.nameSize + 'px'; name.style.color = p.textColor;
    role.style.color = p.roleColor;
    role.style.fontSize = Math.round(p.nameSize * 0.48) + 'px';
    if (!p.role) el.querySelector('.mask.bot').style.display = 'none';

    const origin = p.position === 'right' ? '100% 50%' : p.position === 'center' ? '50% 50%' : '0% 50%';
    const endOrigin = p.position === 'right' ? '0% 50%' : p.position === 'center' ? '50% 50%' : '100% 50%';
    const ln = el.querySelector('.ln'), dot = el.querySelector('.dot');
    const outDur = Math.min(p.outAt, duration * 0.3);
    const out = Math.max(0.9, duration - outDur - 0.03);

    tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' }, 0.05)
      .fromTo(ln, { scaleX: 0, transformOrigin: origin }, { scaleX: 1, duration: 0.8, ease: 'expo.inOut' }, 0.1)
      .fromTo(name, { yPercent: 150 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' }, 0.5)
      .fromTo(role, { yPercent: -170 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' }, 0.62)
      // exit
      .to(name, { yPercent: 150, duration: outDur * 0.6, ease: 'power3.in' }, out)
      .to(role, { yPercent: -170, duration: outDur * 0.6, ease: 'power3.in' }, out + 0.05)
      .to(ln, { scaleX: 0, transformOrigin: endOrigin, duration: outDur * 0.6, ease: 'power3.inOut' }, out + outDur * 0.35)
      .to(dot, { scale: 0, duration: outDur * 0.35, ease: 'power2.in' }, out + outDur * 0.6);
  },
});
