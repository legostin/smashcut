// Clip contract: pure function of time. Put every animation on ctx.tl (a paused GSAP timeline the runtime seeks).
studio.clip({
  duration: 4,
  setup(root, p, { tl, duration }) {
    root.innerHTML = `<div class="title"></div>`;
    const el = root.querySelector('.title');
    el.textContent = p.text;
    el.style.color = p.color;
    tl.from(el, { opacity: 0, y: 40, duration: 0.6, ease: 'power3.out' }, 0)
      .to(el, { opacity: 0, y: -20, duration: 0.4, ease: 'power2.in' }, Math.max(0.8, duration - 0.5));
  },
});
