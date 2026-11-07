// Versus split: clip-path halves slam in along a diagonal seam, VS badge punches with a decaying shake,
// rows of mirrored bars grow from the centre; winners get a check and the running score ticks up.
studio.clip({
  duration: 9,
  setup(root, p, { tl, duration, width: W, height: H }) {
    const vertical = H > W * 1.1;
    const DW = vertical ? 1080 : 1920, DH = vertical ? 1920 : 1080;
    const k = Math.min(W / DW, H / DH);
    const ox = (W - DW * k) / 2, oy = (H - DH * k) / 2;
    const ICONS = {
      bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
      drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
      flame: '<path d="M12 2c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1.5 1.5 2 2.5 2 0-2.5-.5-4.5.5-7z"/>',
      leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19l7-7"/>',
      star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z"/>',
      chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
      phone: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const side = (s) => ({ name: p[s + 'Name'] || '', sub: p[s + 'Sub'] || '', color: p[s + 'Color'], icon: p[s + 'Icon'], image: String(p[s + 'Image'] || '').trim() });
    const L = side('left'), R = side('right');

    // rows
    const parseNum = (str) => { const s = String(str).trim().replace(/\s/g, '').replace(',', '.'); const v = parseFloat(s); return { v: isNaN(v) ? 0 : v, dec: (s.split('.')[1] || '').replace(/\D.*$/, '').length }; };
    const rows = String(p.rows || '').split('\n').map((line) => {
      const m = /^(.*?):\s*(.+)$/.exec(line.trim());
      if (!m) return null;
      const parts = m[2].split('|').map((x) => x.trim());
      if (parts.length < 2) return null;
      const a = parseNum(parts[0]), b = parseNum(parts[1]);
      const lower = parts.slice(2).some((x) => /lower|less|min|меньше/i.test(x));
      const win = a.v === b.v ? 0 : (a.v > b.v) !== lower ? -1 : 1;
      return { label: m[1].trim(), a, b, win };
    }).filter(Boolean).slice(0, 7);
    const fmt = (n, dec) => n.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // ---------- DOM ----------
    const off = Math.tan((Math.max(0, Math.min(30, p.seamAngle)) * Math.PI) / 180) * (Math.min(W, H) / 2);
    const halfBg = (c, dir) => `linear-gradient(${dir}deg, color-mix(in srgb, ${c} 70%, #fff) 0%, ${c} 42%, color-mix(in srgb, ${c} 62%, #000) 100%)`;
    const el = document.createElement('div');
    el.className = 'vs';
    el.style.color = p.textColor;
    el.innerHTML = `
      <div class="half hl" style="clip-path:polygon(0 0, ${W / 2 + off}px 0, ${W / 2 - off}px 100%, 0 100%);background:${halfBg(L.color, 150)}">
        <div class="tex" style="background:repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 22px)"></div><div class="wm"></div></div>
      <div class="half hr" style="clip-path:polygon(${W / 2 + off}px 0, 100% 0, 100% 100%, ${W / 2 - off}px 100%);background:${halfBg(R.color, 210)}">
        <div class="tex" style="background:repeating-linear-gradient(65deg, rgba(255,255,255,.035) 0 2px, transparent 2px 22px)"></div><div class="wm"></div></div>
      <svg class="flash" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><line x1="${W / 2 + off}" y1="-10" x2="${W / 2 - off}" y2="${H + 10}" stroke="#fff" stroke-width="10" stroke-linecap="round" style="filter:drop-shadow(0 0 18px #fff)"/></svg>
      <div class="stage" style="width:${DW}px;height:${DH}px;transform:translate(${ox}px,${oy}px) scale(${k})"></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const stage = $('.stage');
    const hl = $('.hl'), hr = $('.hr'), flash = $('.flash');
    const wmL = hl.querySelector('.wm'), wmR = hr.querySelector('.wm');
    wmL.textContent = L.name; wmR.textContent = R.name;
    wmL.style.right = W / 2 + 40 + 'px'; wmR.style.left = W / 2 + 40 + 'px';
    wmL.style.marginTop = wmR.style.marginTop = -165 + 'px';

    const cxL = DW * 0.25, cxR = DW * 0.75;
    const topY = vertical ? 190 : 96;
    const mkSide = (s, cx, cls) => {
      const d = document.createElement('div');
      d.className = 'side ' + cls;
      d.style.left = cx - (vertical ? 260 : 420) + 'px';
      d.style.width = (vertical ? 520 : 840) + 'px';
      d.style.top = topY + 'px';
      const ico = s.image ? `<div class="ico"><img src="${esc(s.image)}" alt=""></div>` : s.icon !== 'none' && ICONS[s.icon] ? `<div class="ico"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.icon]}</svg></div>` : '';
      d.innerHTML = `${ico}<div class="nm"><span></span></div><div class="sb"></div>${p.showScore ? '<div class="score"><span>Wins</span><b>0</b></div>' : ''}`;
      d.querySelector('.nm span').textContent = s.name;
      d.querySelector('.sb').textContent = s.sub;
      if (!s.sub) d.querySelector('.sb').style.display = 'none';
      stage.appendChild(d);
      const nm = d.querySelector('.nm');
      if (vertical) nm.style.fontSize = '66px';
      const sp = d.querySelector('.nm span'), maxW = (vertical ? 500 : 760);
      if (sp.offsetWidth > maxW) nm.style.fontSize = parseFloat(getComputedStyle(nm).fontSize) * (maxW / sp.offsetWidth) + 'px';
      return d;
    };
    const sideL = mkSide(L, cxL, 'l'), sideR = mkSide(R, cxR, 'r');
    const scoreL = sideL.querySelector('.score b'), scoreR = sideR.querySelector('.score b');
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.textContent = p.badgeText || 'VS';
    const sideH = Math.max(sideL.offsetHeight, sideR.offsetHeight);
    badge.style.left = DW / 2 + 'px';
    badge.style.top = (vertical ? topY + sideH + 110 : topY + Math.min(sideH, 330) / 2 + 40) + 'px';
    stage.appendChild(badge);

    // rows layout
    const rowsTop = vertical ? topY + sideH + 260 : Math.max(topY + sideH + 70, 500);
    const rowsBottom = vertical ? DH - 220 : DH - 70;
    const rowH = Math.min(vertical ? 200 : 110, (rowsBottom - rowsTop) / Math.max(1, rows.length));
    const R_ = rows.map((r, i) => {
      const d = document.createElement('div');
      d.className = 'row';
      d.innerHTML = `<div class="lbl"></div><div class="trk l"></div><div class="trk r"></div><div class="bar l"></div><div class="bar r"></div>
        <div class="val l"><span class="n"></span><span class="chk" style="color:${L.color}"></span></div><div class="val r"><span class="n"></span><span class="chk" style="color:${R.color}"></span></div>`;
      d.querySelector('.lbl').textContent = r.label;
      d.style.top = rowsTop + i * rowH + 'px';
      d.style.height = rowH + 'px';
      stage.appendChild(d);
      const chkSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      d.querySelectorAll('.chk').forEach((c) => (c.innerHTML = chkSvg));
      return { r, d, lbl: d.querySelector('.lbl'), bl: d.querySelector('.bar.l'), br: d.querySelector('.bar.r'), tl_: d.querySelector('.trk.l'), tr_: d.querySelector('.trk.r'), vl: d.querySelector('.val.l'), vr: d.querySelector('.val.r'), nl: d.querySelector('.val.l .n'), nr: d.querySelector('.val.r .n'), cl: d.querySelector('.val.l .chk'), cr: d.querySelector('.val.r .chk') };
    });
    const maxPill = Math.max(0, ...R_.map((x) => x.lbl.offsetWidth));
    R_.forEach((x) => { x.lbl.style.left = DW / 2 - x.lbl.offsetWidth / 2 + 'px'; });
    R_.forEach((x) => {
      const mid = rowH / 2;
      const max = Math.max(Math.abs(x.r.a.v), Math.abs(x.r.b.v)) || 1;
      let g, maxLen, by;
      if (!vertical) { g = maxPill / 2 + 26; maxLen = Math.min(470, DW / 2 - g - 250); by = mid - 13; x.lbl.style.top = mid - 29 + 'px'; }
      else { g = 14; maxLen = DW / 2 - g - 70; by = mid + 34; x.lbl.style.top = mid - 58 + 'px'; x.lbl.style.height = '52px'; x.lbl.style.fontSize = '22px'; }
      const lenL = (Math.abs(x.r.a.v) / max) * maxLen, lenR = (Math.abs(x.r.b.v) / max) * maxLen;
      Object.assign(x.tl_.style, { left: DW / 2 - g - maxLen + 'px', width: maxLen + 'px', top: by + 'px' });
      Object.assign(x.tr_.style, { left: DW / 2 + g + 'px', width: maxLen + 'px', top: by + 'px' });
      Object.assign(x.bl.style, { left: DW / 2 - g - lenL + 'px', width: Math.max(26, lenL) + 'px', top: by + 'px' });
      Object.assign(x.br.style, { left: DW / 2 + g + 'px', width: Math.max(26, lenR) + 'px', top: by + 'px' });
      if (lenL < 1) x.bl.style.opacity = 0;
      if (lenR < 1) x.br.style.opacity = 0;
      if (!vertical) {
        Object.assign(x.vl.style, { right: DW / 2 + g + maxLen + 26 + 'px', top: mid - 20 + 'px' });
        Object.assign(x.vr.style, { left: DW / 2 + g + maxLen + 26 + 'px', top: mid - 20 + 'px' });
      } else {
        Object.assign(x.vl.style, { left: '70px', top: mid - 50 + 'px', fontSize: '36px', flexDirection: 'row' });
        Object.assign(x.vr.style, { right: '70px', top: mid - 50 + 'px', fontSize: '36px', flexDirection: 'row-reverse' });
      }
      x.nl.textContent = fmt(x.r.a.v, x.r.a.dec);
      x.nr.textContent = fmt(x.r.b.v, x.r.b.dec);
      x.nl.style.minWidth = x.nl.offsetWidth + 'px'; x.nr.style.minWidth = x.nr.offsetWidth + 'px';
      x.nl.style.textAlign = vertical ? 'left' : 'right';
      x.nr.style.textAlign = vertical ? 'right' : 'left';
    });

    // ---------- timeline ----------
    const out = Math.max(1.8, duration - 0.62);
    const rows0 = Math.min(1.15, duration * 0.2);
    const stg = rows.length > 1 ? Math.max(0.15, Math.min(0.42, (out - rows0 - 1.4) / rows.length)) : 0;
    tl.fromTo(hl, { xPercent: -100 }, { xPercent: 0, duration: 0.5, ease: 'expo.out' }, 0.02)
      .fromTo(hr, { xPercent: 100 }, { xPercent: 0, duration: 0.5, ease: 'expo.out' }, 0.02)
      .fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.24)
      .to(flash, { opacity: 0, duration: 0.45, ease: 'power2.out' }, 0.29)
      .fromTo(badge, { scale: 2.2, opacity: 0, rotation: -12 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.42, ease: 'expo.out' }, 0.36)
      .fromTo([sideL, sideR].map((s) => s.querySelector('.ico')).filter(Boolean), { scale: 0, rotation: -15 }, { scale: 1, rotation: 0, duration: 0.55, ease: 'back.out(2.2)', stagger: 0.06 }, 0.35)
      .fromTo([sideL, sideR].map((s) => s.querySelector('.nm span')), { yPercent: 110 }, { yPercent: 0, duration: 0.75, ease: 'expo.out', stagger: 0.06 }, 0.42)
      .fromTo([sideL, sideR].map((s) => s.querySelector('.sb')), { y: 16, opacity: 0 }, { y: 0, opacity: 0.78, duration: 0.6, ease: 'expo.out', stagger: 0.06 }, 0.55);
    if (p.showScore) tl.fromTo([sideL, sideR].map((s) => s.querySelector('.score')), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out', stagger: 0.06 }, 0.7);
    const winT = [];
    R_.forEach((x, i) => {
      const s = rows0 + i * stg;
      tl.fromTo(x.lbl, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'expo.out' }, s)
        .fromTo([x.tl_, x.tr_], { opacity: 0 }, { opacity: 1, duration: 0.3 }, s)
        .fromTo([x.bl, x.br], { scaleX: 0 }, { scaleX: 1, duration: 0.75, ease: 'expo.out' }, s + 0.08)
        .fromTo([x.vl, x.vr], { opacity: 0 }, { opacity: 1, duration: 0.3 }, s + 0.08);
      const tw = s + 0.7;
      winT.push(tw);
      x.cl.style.display = x.r.win === -1 ? '' : 'none';
      x.cr.style.display = x.r.win === 1 ? '' : 'none';
      const wv = x.r.win === -1 ? x.vl : x.r.win === 1 ? x.vr : null;
      const loser = x.r.win === -1 ? [x.br, x.vr] : x.r.win === 1 ? [x.bl, x.vl] : [];
      if (wv) {
        tl.fromTo(wv.querySelector('.chk'), { scale: 0 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' }, tw)
          .fromTo(wv, { scale: 1 }, { scale: 1.12, duration: 0.14, ease: 'power2.out', yoyo: true, repeat: 1, transformOrigin: x.r.win === -1 ? '100% 50%' : '0% 50%' }, tw)
          .to(loser, { opacity: 0.45, duration: 0.4, ease: 'power2.out' }, tw);
      }
    });
    // exit
    tl.to(R_.map((x) => x.d).reverse(), { opacity: 0, y: 14, duration: 0.25, ease: 'power2.in', stagger: 0.03 }, out)
      .to(badge, { scale: 0, rotation: 20, duration: 0.3, ease: 'back.in(2)' }, out + 0.05)
      .to([sideL, sideR], { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' }, out + 0.05)
      .to(hl, { xPercent: -100, duration: 0.42, ease: 'power3.in' }, out + 0.15)
      .to(hr, { xPercent: 100, duration: 0.42, ease: 'power3.in' }, out + 0.15);

    const eOut = gsap.parseEase('expo.out');
    return {
      render(t) {
        // VS punch shake (decaying), and a subtle camera shake on the stage
        const a = t - 0.4;
        const sh = a > 0 && a < 0.5 ? Math.exp(-a * 9) * Math.sin(a * 70) : 0;
        badge.style.translate = `${(sh * 16).toFixed(2)}px ${(sh * -6).toFixed(2)}px`;
        stage.style.translate = `${(sh * 5).toFixed(2)}px 0px`;
        // watermark drift (parallax secondary motion)
        wmL.style.transform = `translateX(${(-t * 14).toFixed(1)}px)`;
        wmR.style.transform = `translateX(${(t * 14).toFixed(1)}px)`;
        // counting values + running score
        let wl = 0, wr = 0;
        R_.forEach((x, i) => {
          const s = rows0 + i * stg + 0.08;
          const q = eOut(studio.progress(t, s, 0.8));
          x.nl.textContent = fmt(x.r.a.v * q, x.r.a.dec);
          x.nr.textContent = fmt(x.r.b.v * q, x.r.b.dec);
          if (t >= winT[i]) { if (x.r.win === -1) wl++; else if (x.r.win === 1) wr++; }
        });
        if (scoreL) { scoreL.textContent = wl; scoreR.textContent = wr; }
      },
    };
  },
});
