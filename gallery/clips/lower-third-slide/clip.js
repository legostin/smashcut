studio.clip({
  duration: 5,
  setup(root, p, { tl, duration }) {
    root.innerHTML = `
      <div class="lt ${p.position}" style="--accent:${p.accent};--plate:${p.plate}">
        <div class="bar"></div>
        <div class="plate"><div class="name"></div><div class="role"></div></div>
      </div>`;
    root.querySelector('.name').textContent = p.name;
    root.querySelector('.role').textContent = p.role;
    const right = p.position === 'right';
    const out = Math.max(1.2, duration - p.outAt);

    tl.from('.bar', { scaleY: 0, duration: 0.45, ease: 'power3.out' }, 0.1)
      .to('.plate', { clipPath: 'inset(0 0% 0 0%)', duration: 0.7, ease: 'expo.out' }, 0.3)
      .from('.name', { x: right ? 40 : -40, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.4)
      .from('.role', { x: right ? 30 : -30, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.52)
      .to('.plate', { clipPath: right ? 'inset(0 100% 0 0%)' : 'inset(0 0% 0 100%)', duration: 0.5, ease: 'expo.in' }, out)
      .to('.bar', { scaleY: 0, transformOrigin: 'top', duration: 0.35, ease: 'power2.in' }, out + 0.35);
  },
});
