// App promo phone: CSS-only device (titanium frame, island, buttons, glass glare) in CSS 3D,
// built-in finance-app screens (or images) that slide inside the screen mask, masked headline + bullets.
studio.clip({
  duration: 9,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const vertical = H > W * 1.1;
    const A = p.accent;
    const FINISH = {
      natural: 'linear-gradient(135deg,#8d9199 0%,#dfe1e5 16%,#767a83 38%,#cfd2d7 60%,#7f838c 82%,#c0c3c8 100%)',
      black: 'linear-gradient(135deg,#2a2b2f 0%,#5b5d63 16%,#1c1d20 40%,#4a4c52 62%,#222326 84%,#3e4045 100%)',
      white: 'linear-gradient(135deg,#d8d8d6 0%,#ffffff 18%,#c6c6c3 40%,#f4f4f2 62%,#cbcbc8 84%,#ececea 100%)',
      desert: 'linear-gradient(135deg,#a88c72 0%,#ead5bf 16%,#94785f 38%,#dcc3aa 60%,#9a7e65 82%,#cfb69d 100%)',
    };
    const finish = FINISH[p.deviceColor] || FINISH.natural;
    const usd = (s, d = 0) => '$' + Number(s).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // ---------- in-phone app screens ----------
    const icon = (c, d) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const status = `<div class="status"><span>9:41</span><span class="ic"><b style="width:3px;height:6px"></b><b style="width:3px;height:9px"></b><b style="width:3px;height:12px"></b><b style="width:25px;height:12px;border-radius:4px;margin-left:6px"></b></span></div>`;
    const tabs = `<div class="tabs"><i style="border-color:${A}"></i><i></i><i></i><i></i></div><div class="home"></div>`;
    const SCREENS = [
      () => `<div class="app">${status}
        <div class="hd an"><div><small>Good afternoon,</small><strong>Anna</strong></div><div class="av"></div></div>
        <div class="card an" style="background:linear-gradient(135deg,${A},#b8f5d9)"><small>Total balance</small><div class="amt">${usd(24856.4, 2)}</div><span class="pill">+12.4% this month</span>
          <svg width="120" height="46" viewBox="0 0 120 46"><path d="M2 40 C18 36 22 22 38 26 S58 38 72 20 S96 14 118 4" fill="none" stroke="#062016" stroke-width="3" stroke-linecap="round" opacity=".55"/></svg></div>
        <div class="qa an">${[['Send', '<path d="M5 12h14M13 6l6 6-6 6"/>'], ['Pay', '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>'], ['Save', '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>'], ['More', '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>']].map((q) => `<div><i>${icon(A, q[1])}</i>${q[0]}</div>`).join('')}</div>
        <div class="sec an">Recent activity<span>See all</span></div>
        ${[['Coffee shop', 'Cafes & restaurants', '−$4.80', '#f7b267'], ['Taxi', 'Transport', '−$12.60', '#5b8cff'], ['Salary', 'Income', '+$4,200.00', A], ['Supermarket', 'Groceries', '−$86.40', '#f25c54'], ['Cinema', 'Entertainment', '−$24.00', '#9b7bff']].map((r) => `<div class="tx an"><i style="background:${r[3]}2e;box-shadow:inset 0 0 0 2px ${r[3]}"></i><div>${r[0]}<span>${r[1]}</span></div><b style="color:${r[2][0] === '+' ? A : '#fff'}">${r[2]}</b></div>`).join('')}
        ${tabs}</div>`,
      () => {
        const seg = [[32, A, 'Food'], [24, '#5b8cff', 'Shopping'], [18, '#f7b267', 'Transport'], [14, '#f25c54', 'Entertainment'], [12, '#9b7bff', 'Other']];
        let cum = 0;
        const arcs = seg.map((s) => { const c = `<circle class="arc" cx="125" cy="125" r="102" fill="none" stroke="${s[1]}" stroke-width="24" pathLength="100" stroke-dasharray="0 100" stroke-dashoffset="${-cum}" data-v="${s[0] - 1.6}" stroke-linecap="butt"/>`; cum += s[0]; return c; }).join('');
        return `<div class="app">${status}<div class="ttl an">Spending</div>
          <div class="seg an"><div>Week</div><div class="on">Month</div><div>Year</div></div>
          <div class="ring an"><svg width="250" height="250" viewBox="0 0 250 250" style="transform:rotate(-90deg)"><circle cx="125" cy="125" r="102" fill="none" stroke="#182039" stroke-width="24"/>${arcs}</svg>
            <div class="c"><b>${usd(2482)}</b><span>in May</span></div></div>
          ${seg.map((s) => `<div class="lg an"><i style="background:${s[1]}"></i><span>${s[2]}</span><em>${s[0]}%</em></div>`).join('')}
          ${tabs}</div>`;
      },
      () => `<div class="app">${status}<div class="ttl an">Savings</div>
        <div class="tot an">Total saved<b>${usd(12820)}</b></div>
        ${[['Trip to Japan', '$4,080 of $6,000', 68, A], ['New laptop', '$1,260 of $3,000', 42, '#5b8cff'], ['Emergency fund', '$7,480 of $8,800', 85, '#f7b267']].map((g) => `<div class="goal an"><div class="r1"><i style="background:${g[3]}2e;box-shadow:inset 0 0 0 2px ${g[3]}"></i><div>${g[0]}<span>${g[1]}</span></div><em>${g[2]}%</em></div><div class="trk"><b style="width:${g[2]}%;background:${g[3]}"></b></div></div>`).join('')}
        <div class="cta an" style="background:${A}">+ New goal</div>
        ${tabs}</div>`,
    ];
    const screenHTML = (k) => {
      const img = String(p['screen' + (k + 1)] || '').trim();
      return img ? `<img src="${img.replace(/"/g, '&quot;')}" alt="">` : SCREENS[k]();
    };
    const phoneHTML = (screens, cls = '') => `
      <div class="phone ${cls}" style="background:${finish}">
        <div class="btn" style="left:-5px;top:168px;height:36px;background:${finish}"></div>
        <div class="btn" style="left:-5px;top:228px;height:66px;background:${finish}"></div>
        <div class="btn" style="left:-5px;top:306px;height:66px;background:${finish}"></div>
        <div class="btn" style="right:-5px;top:256px;height:104px;background:${finish}"></div>
        <div class="bezel"></div>
        <div class="scr">${screens.map((k) => `<div class="sv">${screenHTML(k)}</div>`).join('')}<div class="static-glass"></div><div class="glare"></div></div>
        <div class="island"></div>
        <div class="shade"></div>
      </div>`;

    // ---------- layout ----------
    const layout = vertical ? 'vertical' : p.layout;
    const count = Math.max(1, Math.min(3, Math.round(p.screenCount) || 1));
    const PW = 412, PH = 862;
    const ps = vertical ? Math.min((H * 0.5) / PH, (W * 0.56) / PW) : Math.min(1, (H * 0.8) / PH);
    const pcx = vertical ? W / 2 : layout === 'right' ? W * 0.3 : layout === 'center' ? W / 2 : layout === 'fan3' ? W * 0.69 : W * 0.7;
    const pcy = vertical ? H * 0.58 : H / 2 + 10;
    const margin = W * 0.073;

    const el = document.createElement('div');
    el.className = 'pm';
    el.innerHTML = `
      <div class="bg" style="background:${p.background}">
        <div class="glow" style="width:${W * 0.55}px;height:${W * 0.55}px;left:${pcx - W * 0.275}px;top:${pcy - W * 0.3}px;background:${A};opacity:.22"></div>
        <div class="glow" style="width:${W * 0.45}px;height:${W * 0.45}px;left:${-W * 0.12}px;top:${H * 0.55}px;background:#3b5bff;opacity:.18"></div>
        <div class="grain"></div>
      </div>
      <div class="side-l" style="position:absolute;left:0;top:0"></div>
      <div class="side-r" style="position:absolute;left:0;top:0"></div>
      <div class="stagecam" style="left:${pcx}px;top:${pcy}px">
        <div class="shadow" style="left:${-260 * ps}px;top:${(PH / 2 + 22) * ps}px;transform:scale(${ps})"></div>
        <div class="rig"><div class="sway"><div class="holder" style="position:absolute;left:${-PW / 2}px;top:${-PH / 2}px;transform:scale(${ps})">${phoneHTML([...Array(count).keys()], 'main')}</div></div></div>
      </div>
      <div class="copy" style="color:${p.textColor}">
        <div class="eyebrow" style="background:${A}22;color:${A}"><i style="background:${A}"></i><span></span></div>
        <div class="hl"></div>
        <div class="bul"></div>
      </div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    $('.holder').style.transformOrigin = `${PW / 2}px ${PH / 2}px`;

    // grain texture (seeded, static tile; jittered on twos in render)
    const cv = document.createElement('canvas'); cv.width = cv.height = 192;
    const cx2 = cv.getContext('2d'), img = cx2.createImageData(192, 192), R = studio.random(11);
    for (let i = 0; i < img.data.length; i += 4) { const v = R() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    cx2.putImageData(img, 0, 0);
    const grain = $('.grain');
    grain.style.backgroundImage = `url(${cv.toDataURL()})`;

    // copy
    const copy = $('.copy');
    $('.eyebrow span').textContent = p.eyebrow || '';
    if (!p.eyebrow) $('.eyebrow').style.display = 'none';
    const hl = $('.hl');
    String(p.headline || '').split('\n').filter((s) => s.trim()).forEach((line) => {
      const ln = document.createElement('div'); ln.className = 'ln';
      const sp = document.createElement('span'); sp.textContent = line; ln.appendChild(sp); hl.appendChild(ln);
    });
    const bul = $('.bul');
    const checkSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06140e" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
    String(p.bullets || '').split('\n').filter((s) => s.trim()).slice(0, 5).forEach((b) => {
      const d = document.createElement('div'); d.className = 'b';
      d.innerHTML = `<i style="background:${A}">${checkSvg}</i><span></span>`;
      d.querySelector('span').textContent = b.trim();
      bul.appendChild(d);
    });
    // place copy per layout + auto-fit the headline
    let copyW = 760;
    if (layout === 'vertical') {
      copyW = W * 0.86; copy.style.left = (W - copyW) / 2 + 'px'; copy.style.top = H * 0.08 + 'px'; copy.style.transform = 'none';
      copy.style.textAlign = 'center'; bul.style.display = 'none';
      hl.style.fontSize = Math.round(W * 0.105) + 'px';
    } else if (layout === 'right') { copy.style.left = W - margin - copyW + 'px'; }
    else if (layout === 'center') {
      copyW = Math.min(620, pcx - PW * ps / 2 - margin - 70);
      copy.style.left = margin + 'px';
      bul.style.position = 'absolute'; bul.style.marginTop = '0';
      bul.style.width = copyW + 'px';
      el.appendChild(bul);
      bul.style.left = pcx + PW * ps / 2 + 80 + 'px';
      bul.style.top = '50%'; bul.style.transform = 'translateY(-50%)'; bul.style.color = p.textColor;
      bul.style.width = W - margin - (pcx + PW * ps / 2 + 80) + 'px';
    } else { copy.style.left = margin + 'px'; copyW = Math.min(780, pcx - PW * ps / 2 - (layout === 'fan3' ? 300 * ps : 0) - margin - 60); }
    copy.style.width = copyW + 'px';
    let fs = parseFloat(getComputedStyle(hl).fontSize);
    const widest = () => Math.max(...[...hl.querySelectorAll('.ln span')].map((s) => s.offsetWidth), 0);
    for (let i = 0; i < 12 && widest() > copyW && fs > 40; i++) { fs *= Math.max(0.8, copyW / widest()); hl.style.fontSize = fs + 'px'; }
    [...hl.querySelectorAll('.ln span')].forEach((s) => (s.style.whiteSpace = 'nowrap'));

    // fan3 side phones
    const sides = [];
    if (layout === 'fan3') {
      [[-1, 1 % count === 0 ? 1 : 1], [1, 2]].forEach(([dir, k], i) => {
        const holder = el.querySelector(i ? '.side-r' : '.side-l');
        holder.style.left = pcx + 'px'; holder.style.top = pcy + 'px';
        holder.innerHTML = `<div class="fan" style="position:absolute;left:${-PW / 2}px;top:${-PH / 2}px;transform-origin:50% 100%">${phoneHTML([Math.min(2, k)])}</div>`;
        const f = holder.querySelector('.fan');
        f.style.filter = 'brightness(.78)';
        sides.push({ el: f, dir });
      });
    }

    // ---------- timeline ----------
    const out = Math.max(1.5, duration - 0.7);
    const rig = $('.rig'), shadow = $('.shadow');
    const flip = layout === 'right' ? -1 : 1;
    const baseY = layout === 'center' || layout === 'vertical' ? 0 : -8 * flip;
    tl.fromTo(el.querySelectorAll('.bg .glow'), { opacity: 0, scale: 0.7 }, { opacity: (i) => (i ? 0.18 : 0.24), scale: 1, duration: 1.6, ease: 'power2.out' }, 0)
      .fromTo(rig, { y: H * 0.75, rotateX: 25, rotateY: -20 * flip }, { y: 0, rotateX: 0, rotateY: baseY, duration: 1.15, ease: 'expo.out' }, 0.08)
      .fromTo(shadow, { opacity: 0, scaleX: 0.5 }, { opacity: 1, scaleX: 1, duration: 1.0, ease: 'expo.out' }, 0.3)
      .fromTo($('.eyebrow'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, 0.3)
      .fromTo(hl.querySelectorAll('.ln span'), { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09 }, 0.38)
      .fromTo(bul.querySelectorAll('.b'), { x: -30 * flip, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.1 }, 0.85)
      .fromTo(bul.querySelectorAll('.b i'), { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: 0.1 }, 0.9);
    sides.forEach((s) => {
      tl.fromTo(s.el, { x: 0, rotation: 0, scale: 0.9, opacity: 0 }, { x: s.dir * 255, rotation: s.dir * 9, scale: 0.86, opacity: 1, duration: 0.9, ease: 'back.out(1.3)' }, 0.75)
        .to(s.el, { x: 0, rotation: 0, opacity: 0, duration: 0.4, ease: 'power2.in' }, out);
    });
    // screens: every screen's rows rise in when it appears
    const svs = [...$('.phone.main .scr').querySelectorAll('.sv')];
    const firstIn = 0.55;
    const span = Math.max(0, out - 0.6 - 1.8);
    const nShow = Math.max(1, Math.min(count, 1 + Math.floor(span / 1.5)));
    const switchT = [firstIn];
    for (let k = 1; k < nShow; k++) switchT.push(1.8 + (span * k) / nShow);
    svs.forEach((sv, k) => {
      if (k >= nShow) { sv.style.display = 'none'; return; }
      const ts = switchT[k];
      if (k > 0) {
        tl.set(sv, { yPercent: 100 }, 0)
          .to(sv, { yPercent: 0, duration: 0.8, ease: 'power3.inOut' }, ts)
          .to(svs[k - 1], { yPercent: -30, opacity: 0.4, duration: 0.8, ease: 'power3.inOut' }, ts);
      }
      const an = sv.querySelectorAll('.an');
      if (an.length) tl.fromTo(an, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.045 }, ts + (k ? 0.35 : 0.25));
      sv.querySelectorAll('.arc').forEach((a, i) => {
        tl.fromTo(a, { attr: { 'stroke-dasharray': '0 100' } }, { attr: { 'stroke-dasharray': `${a.dataset.v} ${100 - a.dataset.v}` }, duration: 0.55, ease: 'power3.out' }, ts + 0.45 + i * 0.12);
      });
      const bars = sv.querySelectorAll('.trk b');
      if (bars.length) tl.fromTo(bars, { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'expo.out', stagger: 0.08 }, ts + 0.5);
    });
    // exit
    tl.to(hl.querySelectorAll('.ln span'), { yPercent: 110, duration: 0.45, ease: 'power3.in', stagger: 0.05 }, out)
      .to([$('.eyebrow'), ...bul.querySelectorAll('.b')], { y: 16, opacity: 0, duration: 0.35, ease: 'power2.in', stagger: 0.04 }, out)
      .to(rig, { y: H * 0.12, opacity: 0, duration: 0.5, ease: 'power2.in' }, out + 0.1)
      .to(shadow, { opacity: 0, duration: 0.4, ease: 'power2.in' }, out + 0.1)
      .to(el.querySelectorAll('.bg .glow'), { opacity: 0, duration: 0.5, ease: 'power1.in' }, out + 0.1);

    // glare sweeps: once after landing, then every ~3.5 s
    const glares = [...el.querySelectorAll('.glare')];
    const sweeps = [];
    for (let s = 1.4; s < out - 0.5; s += 3.6) sweeps.push(s);
    const sway = $('.sway'), shade = $('.phone.main .shade');
    const eIO = gsap.parseEase('sine.inOut');
    return {
      render(t) {
        const amp = Number(p.swayAmount) || 0;
        const on = studio.ease.outCubic(studio.progress(t, 1.0, 1.4)) * (1 - studio.progress(t, out, 0.4));
        const ry = amp * Math.sin((t - 1.0) * (Math.PI * 2) / 6.5) * on;
        const rx = amp * 0.35 * Math.sin((t - 1.0) * (Math.PI * 2) / 8 + 0.6) * on;
        const fy = 7 * Math.sin((t - 1.0) * (Math.PI * 2) / 5.2) * on;
        sway.style.transform = `translateY(${fy.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg) rotateX(${rx.toFixed(3)}deg)`;
        // fake shading tied to rotation
        const rotY = (Number(gsap.getProperty(rig, 'rotateY')) || 0) + ry;
        shade.style.background = `linear-gradient(${rotY > 0 ? 270 : 90}deg, rgba(0,0,0,${Math.min(0.35, Math.abs(rotY) * 0.016).toFixed(3)}), rgba(0,0,0,0) 60%)`;
        // glare
        let gx = -140;
        if (p.glare) for (const s of sweeps) { const q = studio.progress(t, s, 1.3); if (q > 0 && q < 1) { gx = -140 + eIO(q) * 380; break; } }
        glares.forEach((g) => (g.style.transform = `translateX(${gx}%)`));
        // grain on twos
        const f = Math.floor(t * 12), r = studio.random(f + 3);
        grain.style.backgroundPosition = `${Math.floor(r() * 192)}px ${Math.floor(r() * 192)}px`;
      },
    };
  },
});
