// Diagonal band wipe: opaque at duration/2, transparent at 0 and at the end.
studio.clip({
  duration: 1.4,
  setup(root, p, { tl, duration }) {
    const D = duration;
    const n = Math.max(1, Math.min(3, p.bands | 0));
    const cols = [p.color1, p.color2, p.color3].slice(3 - n); // the last colour always covers the cut
    const el = document.createElement('div');
    el.className = 'tw';
    // band container = bounding box of the frame in the rotated space (+ small bleed), so bands travel no further than needed
    const a = (p.angle * Math.PI) / 180, W = studio.width, H = studio.height;
    const bw = Math.ceil(W * Math.abs(Math.cos(a)) + H * Math.abs(Math.sin(a))) + 8;
    const bh = Math.ceil(W * Math.abs(Math.sin(a)) + H * Math.abs(Math.cos(a))) + 8;
    el.innerHTML = `<div class="rot" style="width:${bw}px;height:${bh}px;margin:${-bh / 2}px 0 0 ${-bw / 2}px;transform:rotate(${p.angle}deg)">${cols.map((c) => `<div class="band" style="background:${c}"></div>`).join('')}</div><div class="label"></div>`;
    root.appendChild(el);
    const label = el.querySelector('.label');
    label.textContent = p.label || '';
    label.style.color = p.labelColor;
    const bands = [...el.querySelectorAll('.band')];

    const hold = Math.min(p.hold, D * 0.5);
    const half = (D - hold) / 2; // time for the in-phase (and the out-phase)
    const st = Math.min(p.stagger, (half * 0.6) / Math.max(1, n - 1));
    const move = half - st * (n - 1);
    // in: band 0 first, the covering band last; each lands exactly when the frame must be covered
    bands.forEach((b, i) => {
      tl.fromTo(b, { xPercent: -101 }, { xPercent: 0, duration: move, ease: 'power3.inOut' }, i * st);
    });
    // out: covering band leaves first, revealing the others which follow
    const outStart = half + hold;
    bands.slice().reverse().forEach((b, j) => {
      tl.to(b, { xPercent: p.continueOut ? 101 : -101, duration: move, ease: 'power3.inOut' }, outStart + j * st);
    });
    if (p.label) {
      tl.fromTo(label, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: Math.max(0.1, half * 0.4), ease: 'power3.out' }, half * 0.7)
        .to(label, { opacity: 0, scale: 1.05, duration: Math.max(0.1, half * 0.35), ease: 'power3.in' }, outStart);
    }
    // guarantee exact transparency at the very start/end
    tl.set(el, { opacity: 1 }, 0);
  },
});
