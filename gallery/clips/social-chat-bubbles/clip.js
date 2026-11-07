// Text-message conversation (iOS / WhatsApp look): typing dots → bubble pops from its tail → thread scrolls up.
// Layout is measured once in setup; every frame is computed from t in render().
studio.clip({
  duration: 9,
  async setup(root, p, { tl, duration, width, height }) {
    const D = duration, W = width, H = height;
    const portrait = H / W > 1.2;
    const u = (Math.min(W, H) / 1080) * (portrait ? 1.28 : 1); // vertical: bigger UI so it reads on a phone
    const E = studio.ease;
    const wa = p.style === 'whatsapp';
    const dark = p.theme !== 'light';
    const C = wa
      ? (dark ? { bg: '#0b141a', hdr: '#202c33', edge: 'rgba(255,255,255,.08)', fg: '#e9edef', muted: '#8696a0', me: '#005c4b', meText: '#e9edef', them: '#202c33', themText: '#e9edef', dot: '#8696a0' }
              : { bg: '#efeae2', hdr: '#f0f2f5', edge: 'rgba(0,0,0,.08)', fg: '#111b21', muted: '#667781', me: '#d9fdd3', meText: '#111b21', them: '#ffffff', themText: '#111b21', dot: '#8696a0' })
      : (dark ? { bg: '#000000', hdr: '#141416', edge: 'rgba(255,255,255,.1)', fg: '#ffffff', muted: '#8e8e93', me: '#0a84ff', meText: '#ffffff', them: '#262628', themText: '#ffffff', dot: '#8e8e93' }
              : { bg: '#ffffff', hdr: '#f6f6f8', edge: 'rgba(0,0,0,.1)', fg: '#000000', muted: '#8a8a8e', me: '#007aff', meText: '#ffffff', them: '#e9e9eb', themText: '#000000', dot: '#8e8e93' });

    if (!p.panel && dark && !wa) C.them = '#3a3a3c'; // a touch lighter when floating over footage
    // ---- parse messages ----
    const msgs = String(p.messages || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(?:\[(\d+(?:\.\d+)?)\]\s*)?(me|them|я|они)\s*:\s*(.*)$/i);
      if (!m) return { from: 'them', text: l, at: null };
      return { from: /^(me|я)$/i.test(m[2]) ? 'me' : 'them', text: m[3], at: m[1] != null ? Number(m[1]) : null };
    });

    // ---- DOM ----
    const el = document.createElement('div');
    el.className = `cb ${wa ? 'whatsapp' : 'ios'} ${p.panel ? '' : 'nopanel'}`;
    el.style.cssText = `--u:${u};--ts:${p.textSize};` + Object.entries(C).map(([k, v]) => `--${k}:${v}`).join(';');
    root.appendChild(el);
    const pw = portrait ? W * 0.88 : Math.min(W * 0.5, 740 * u);
    const ph = portrait ? H * 0.72 : H * 0.86;
    const px = p.position === 'left' ? W * 0.07 : p.position === 'right' ? W * 0.93 - pw : (W - pw) / 2;
    const py = (H - ph) / 2;
    const hdrH = p.panel ? (wa ? 118 : 178) * u : 0;
    const inpH = p.panel ? 112 * u : 0;
    const vh = ph - hdrH - inpH;
    const CHEV = `<svg class="back" viewBox="0 0 13 21"><path d="M11 2L2.5 10.5 11 19" fill="none" stroke="${wa ? C.fg : '#0a84ff'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    el.innerHTML = `
      <div class="panel" style="left:${px}px;top:${py}px;width:${pw}px;height:${ph}px">
        ${p.panel ? `<div class="hdr" style="height:${hdrH}px">${CHEV}<div class="av" style="background:linear-gradient(180deg, color-mix(in srgb, ${p.avatarColor} 70%, #fff), ${p.avatarColor})"></div>${wa ? '<div class="meta"><div class="nm"></div><div class="st"></div></div>' : '<div class="nm"><span></span><svg viewBox="0 0 10 16"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></div>'}</div>` : ''}
        <div class="vp" style="top:${hdrH}px;height:${vh}px"><div class="stack"></div></div>
        ${p.panel ? `<div class="inp"><div class="plus"><svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke="${C.muted}" stroke-width="3" stroke-linecap="round"/></svg></div><div class="fld">${wa ? 'Message' : 'iMessage'}</div></div>` : ''}
      </div>`;
    const $ = (s) => el.querySelector(s);
    if (p.panel) {
      $('.av').textContent = (p.contactInitials || '').slice(0, 2);
      (wa ? $('.nm') : $('.nm span')).textContent = p.contactName;
      if (wa) $('.st').textContent = p.status;
    }
    const panel = $('.panel'), stack = $('.stack');
    const TAIL = (fill) => `<svg class="tail" viewBox="0 0 30 36"><path d="M8 2 H21 C21 17 23.5 28 30 35.4 C21.5 36.8 13.5 34.6 8 30 Z" fill="${fill}"/></svg>`;
    msgs.forEach((m, i) => {
      const prev = msgs[i - 1], next = msgs[i + 1];
      const row = document.createElement('div');
      row.className = 'row ' + m.from;
      row.style.marginTop = (i === 0 ? 26 : prev.from === m.from ? 7 : 24) * u + 'px';
      const b = document.createElement('div');
      b.className = 'bub';
      b.textContent = m.text;
      const lastOfGroup = !next || next.from !== m.from;
      if (wa) {
        const tm = document.createElement('span');
        tm.className = 'tm';
        tm.textContent = `1:${String(38 + Math.min(i, 20)).padStart(2, '0')}${m.from === 'me' ? '  ✓✓' : ''}`;
        b.appendChild(tm);
        if (prev && prev.from === m.from) b.style[m.from === 'me' ? 'borderTopRightRadius' : 'borderTopLeftRadius'] = 20 * u + 'px';
      } else if (lastOfGroup) {
        b.insertAdjacentHTML('beforeend', TAIL(m.from === 'me' ? C.me : C.them));
        b.style[m.from === 'me' ? 'borderBottomRightRadius' : 'borderBottomLeftRadius'] = 22 * u + 'px';
      }
      b.style.transformOrigin = m.from === 'me' ? '100% 100%' : '0% 100%';
      row.appendChild(b);
      stack.appendChild(row);
      m.row = row; m.bub = b;
    });
    const lastMe = msgs.length && msgs[msgs.length - 1].from === 'me' && p.receipt;
    let rc = null;
    if (lastMe) { rc = document.createElement('div'); rc.className = 'rc'; rc.textContent = p.receipt; stack.appendChild(rc); }
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<i></i><i></i><i></i>';
    stack.appendChild(typing);
    const dots = [...typing.children];
    // measure (stack-local px)
    msgs.forEach((m) => { m.top = m.row.offsetTop; m.bottom = m.row.offsetTop + m.row.offsetHeight; });
    const typH = typing.offsetHeight;

    // ---- schedule ----
    const t0 = 0.6;
    let cur = t0;
    msgs.forEach((m, i) => {
      const prev = msgs[i - 1];
      const gap = i === 0 ? 0 : 0.3 + Math.min(1.0, prev.text.length * 0.018) + (m.from === 'me' ? 0.15 : 0);
      m.typ = m.from === 'them' && p.showTyping ? Math.min(1.1, Math.max(0.55, 0.45 + m.text.length * 0.01)) : 0;
      m.ts = cur + gap; m.ta = m.ts + m.typ; cur = m.ta;
    });
    const avail = D - (lastMe ? 1.6 : 1.1);
    const f = cur > t0 ? Math.min(1.5, (avail - t0) / (cur - t0)) : 1;
    msgs.forEach((m) => {
      if (m.at != null) { m.ta = m.at; m.ts = m.at - m.typ; return; }
      m.ta = t0 + (m.ta - t0) * f; m.ts = m.ta - m.typ * Math.min(1, f);
    });
    const tRc = lastMe ? msgs[msgs.length - 1].ta + 0.7 : Infinity;
    // scroll targets
    const pad = 22 * u;
    const ev = [{ t: -1, y: 0 }];
    const yFor = (bottom) => Math.min(0, vh - pad - bottom);
    msgs.forEach((m) => { if (m.typ) ev.push({ t: m.ts, y: yFor(m.top + typH) }); ev.push({ t: m.ta, y: yFor(m.bottom) }); });
    if (rc) ev.push({ t: tRc, y: yFor(rc.offsetTop + rc.offsetHeight) });
    ev.sort((a, b) => a.t - b.t);

    // ---- panel in / out ----
    tl.fromTo(panel, { y: 50 * u, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.75, ease: 'expo.out' }, 0.02)
      .to(panel, { y: 40 * u, scale: 0.97, opacity: 0, duration: 0.42, ease: 'power2.in' }, D - 0.47);
    if (p.panel) tl.from([$('.hdr .av'), $('.hdr .nm')], { opacity: 0, y: -10 * u, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, 0.2);

    const backOut = (k, c) => 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
    return {
      render(t) {
        // scroll
        let i = 0;
        while (i + 1 < ev.length && ev[i + 1].t <= t) i++;
        const y = i === 0 ? ev[0].y : ev[i - 1].y + (ev[i].y - ev[i - 1].y) * E.outCubic(studio.progress(t, ev[i].t, 0.42));
        stack.style.transform = `translateY(${y}px)`;
        // bubbles
        msgs.forEach((m) => {
          const k = studio.progress(t, m.ta, 0.27);
          m.bub.style.opacity = t < m.ta ? 0 : Math.min(1, (t - m.ta) / 0.05);
          m.bub.style.transform = `scale(${t < m.ta ? 0.6 : 0.6 + 0.4 * backOut(k, 2.4)})`;
        });
        // typing indicator
        const ty = msgs.find((m) => m.typ && t >= m.ts && t < m.ta);
        if (ty) {
          const k = studio.progress(t, ty.ts, 0.22);
          typing.style.top = ty.top + 'px';
          typing.style.opacity = Math.min(1, k * 3);
          typing.style.transform = `scale(${0.6 + 0.4 * backOut(k, 2)})`;
          dots.forEach((d, j) => {
            const b = Math.max(0, Math.sin((t - ty.ts) * Math.PI * 3.2 - j * 0.9));
            d.style.transform = `translateY(${-6 * u * b}px)`;
            d.style.opacity = 0.45 + 0.55 * b;
          });
        } else typing.style.opacity = 0;
        // read receipt
        if (rc) {
          const k = E.outCubic(studio.progress(t, tRc, 0.4));
          rc.style.opacity = k;
          rc.style.transform = `translateY(${(1 - k) * 8 * u}px)`;
        }
      },
    };
  },
});
