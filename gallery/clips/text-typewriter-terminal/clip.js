// Typewriter / terminal: the whole typing schedule (per-char times with seeded micro-variance and
// punctuation pauses) is computed once in setup; render(t) only toggles visibility from t.
// Output lines print instantly 0.2 s after the command "executes". Cursor blink is derived from t.
studio.clip({
  duration: 6,
  async setup(root, p, { tl, duration }) {
    const D = duration;
    const THEMES = {
      dark: { panel: '#0d1117', bar: '#161b22', edge: 'rgba(255,255,255,.09)', fg: '#e6edf3', dim: '#8b949e', path: '#79c0ff', flag: '#d2a8ff', str: '#a5d6ff', num: '#ffa657', ok: '#56d364', err: '#ff7b72' },
      light: { panel: '#ffffff', bar: '#f3f4f6', edge: 'rgba(0,0,0,.10)', fg: '#1f2328', dim: '#6e7781', path: '#0969da', flag: '#8250df', str: '#0a3069', num: '#953800', ok: '#1a7f37', err: '#cf222e' },
    };
    const T = THEMES[p.theme] || THEMES.dark;
    const el = document.createElement('div');
    el.className = 'tt' + (p.showWindow ? '' : ' bare');
    for (const [k, v] of Object.entries(T)) el.style.setProperty('--' + k, v);
    // the default neon-green accent is too light on a white panel → use a darker green there
    el.style.setProperty('--accent', p.theme === 'light' && String(p.accent).toLowerCase() === '#3fdc8a' ? '#1a7f37' : p.accent);
    el.innerHTML = `<div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div class="title"></div></div>
      <div class="body"><div class="scroll"></div><div class="cur"></div></div></div>`;
    root.appendChild(el);
    const win = el.querySelector('.win'), body = el.querySelector('.body'), scroll = el.querySelector('.scroll'), cur = el.querySelector('.cur');
    el.querySelector('.title').textContent = p.title || '';
    if (!p.showWindow) { win.style.background = 'transparent'; win.style.boxShadow = 'none'; el.querySelector('.bar').style.display = 'none'; win.classList.add('bare'); }
    win.style.width = Math.min(p.width, studio.width - 160) + 'px';
    body.style.fontSize = p.fontSize + 'px';

    // ---- parse script ----
    const raw = String(p.lines || '').split('\n');
    const items = raw.map((s) => {
      if (s.startsWith('$ ')) return { kind: 'cmd', text: s.slice(2) };
      if (s.startsWith('~ ')) return { kind: 'type', text: s.slice(2) };
      return { kind: 'out', text: s };
    });
    while (items.length && items[items.length - 1].kind === 'out' && !items[items.length - 1].text.trim()) items.pop();
    // a fresh, idle prompt with a blinking cursor once the last output has printed
    if (p.finalPrompt && items.length && items[items.length - 1].kind === 'out') items.push({ kind: 'cmd', text: '', idle: true });
    // bash-ish token colouring
    function tokens(text, isCmd) {
      if (p.syntax !== 'bash' || !isCmd) return [...text].map((c) => ({ c, cls: '' }));
      const out = [];
      const re = /("[^"]*"?|'[^']*'?|\s+|[^\s]+)/g;
      let m, first = true;
      while ((m = re.exec(text))) {
        const tok = m[0];
        let cls = '';
        if (/^\s+$/.test(tok)) cls = '';
        else if (first) { cls = 'k-cmd'; first = false; }
        else if (/^["']/.test(tok)) cls = 'k-str';
        else if (/^--?[\w-]/.test(tok)) cls = 'k-flag';
        else if (/^\d[\d.]*\w*$/.test(tok)) cls = 'k-num';
        else if (tok === '|' || tok === '&&') first = true;
        for (const c of tok) out.push({ c, cls });
      }
      return out;
    }
    const rnd = studio.random((p.seed | 0) || 1);
    const lineEls = [];
    for (const it of items) {
      const ln = document.createElement('div');
      ln.className = 'ln';
      it.el = ln;
      if (it.kind === 'cmd') {
        const ps = document.createElement('span');
        ps.className = 'ps';
        ps.innerHTML = '<span class="path"></span> <span class="sym">$</span> ';
        ps.querySelector('.path').textContent = p.prompt || '~';
        if (!p.prompt) ps.querySelector('.path').remove();
        ln.appendChild(ps);
      }
      if (it.kind === 'out') {
        ln.classList.add('out');
        if (/^\s*[✓✔]/.test(it.text)) ln.classList.add('ok');
        if (/^\s*([✗✘×]|error|err!)/i.test(it.text)) ln.classList.add('err');
        ln.textContent = it.text || ' ';
      } else {
        it.chars = tokens(it.text, it.kind === 'cmd').map(({ c, cls }) => {
          const s = document.createElement('span');
          if (cls) s.className = cls;
          s.textContent = c;
          ln.appendChild(s);
          return s;
        });
        it.tail = document.createElement('span'); // caret anchor after the last char
        it.tail.textContent = '​';
        ln.appendChild(it.tail);
      }
      scroll.appendChild(ln);
      lineEls.push(ln);
    }
    try { await document.fonts.load(`500 ${p.fontSize}px 'JetBrains Mono'`, p.lines); } catch (e) {}

    // ---- schedule ----
    const enter = 0.45;
    let t = enter + 0.25;
    const cps = Math.max(1, p.cps);
    for (const it of items) {
      if (it.kind === 'out') { it.at = t + 0.2; t = it.at + 0.07; continue; }
      it.at = it.idle ? t + 0.25 : t; // line (prompt) appears
      t = it.at + (it.idle ? 0 : 0.32);  // small "thinking" pause before typing
      it.times = it.chars.map((s) => {
        const c = s.textContent;
        let d = (1 / cps) * (0.55 + rnd() * 0.9);
        if (/[.,;:!?]/.test(c)) d *= 3.5;
        else if (c === ' ') d *= 1.5;
        t += d;
        return t;
      });
      it.done = t;
      t += it.kind === 'cmd' ? 0.28 : 0.15; // "enter"
    }
    // compress the schedule so typing + a ≥1 s hold fit inside the item
    const exitDur = Math.min(0.4, D * 0.1);
    const avail = Math.max(0.5, D - exitDur - Math.min(1.6, D * 0.22) - 0.05);
    const total = t;
    const sc = total > avail ? (avail - enter) / Math.max(0.01, total - enter) : 1;
    const remap = (x) => enter + (x - enter) * sc;
    const events = [];
    for (const it of items) {
      it.at = remap(it.at);
      if (it.times) { it.times = it.times.map(remap); it.done = remap(it.done); it.times.forEach((x) => events.push(x)); }
      events.push(it.at);
    }
    events.sort((a, b) => a - b);

    // body height: up to maxLines visible, scroll beyond
    const lh = p.fontSize * 1.6;
    const vis = Math.min(Math.max(1, Math.round(p.maxLines)), items.length);
    body.style.height = (vis * lh + 64) + 'px';
    const cw = (() => { const s = document.createElement('span'); s.textContent = 'M'; scroll.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w; })();
    if (p.cursorStyle === 'bar') { cur.style.width = Math.max(3, p.fontSize * 0.09) + 'px'; cur.style.height = p.fontSize * 1.15 + 'px'; }
    else if (p.cursorStyle === 'underline') { cur.style.width = cw + 'px'; cur.style.height = Math.max(3, p.fontSize * 0.1) + 'px'; }
    else { cur.style.width = cw + 'px'; cur.style.height = p.fontSize * 1.2 + 'px'; }

    // window enter / exit + slow push
    tl.fromTo(el, { opacity: 0, scale: 0.95, y: 26 }, { opacity: 1, scale: 1, y: 0, duration: enter, ease: 'expo.out' }, 0)
      .fromTo(win, { scale: 1 }, { scale: 1.015, duration: D, ease: 'none' }, 0)
      .to(el, { opacity: 0, scale: 0.97, y: 14, duration: exitDur, ease: 'power2.in' }, D - exitDur - 0.02);

    const bodyPad = 30;
    return {
      render(tt) {
        let active = null, lastIdx = -1;
        items.forEach((it, i) => {
          const shown = tt >= it.at;
          it.el.style.display = shown ? '' : 'none';
          if (!shown) return;
          lastIdx = i;
          if (it.chars) {
            let n = 0;
            for (let j = 0; j < it.chars.length; j++) { const v = tt >= it.times[j]; it.chars[j].style.visibility = v ? 'visible' : 'hidden'; if (v) n = j + 1; }
            it.typed = n;
            active = it;
          } else active = it;
        });
        // scroll so the newest line stays in view
        const shownCount = lastIdx + 1;
        const over = Math.max(0, shownCount - vis);
        scroll.style.transform = `translateY(${-over * lh}px)`;
        // cursor: after the last typed char of the newest typed line, or on a fresh prompt-less line
        let anchor = null, typing = false;
        if (active && active.chars) {
          anchor = active.typed < active.chars.length ? active.chars[active.typed] : active.tail;
          typing = active.typed > 0 && active.typed < active.chars.length;
          if (tt > active.done + 0.05 && items.indexOf(active) < items.length - 1) anchor = null;
        }
        const lastEvent = events.filter((x) => x <= tt).pop() || 0;
        const since = tt - lastEvent;
        const on = typing || since < 0.12 || Math.floor((since - 0.12) / 0.53) % 2 === 1;
        if (anchor && anchor.offsetParent) {
          const r = anchor.getBoundingClientRect(), b = scroll.getBoundingClientRect();
          const sx = win.getBoundingClientRect().width / win.offsetWidth || 1;
          const x = (r.left - b.left) / sx, y = (r.top - b.top) / sx;
          const fs = p.fontSize, ch = parseFloat(cur.style.height);
          const yy = p.cursorStyle === 'underline' ? y + lh * 0.82 : y + (lh - ch) / 2;
          cur.style.transform = `translate(${44 + x}px, ${bodyPad + yy - over * lh}px)`;
          cur.style.opacity = on ? 1 : 0;
          // block cursor shows the char under it in the panel colour
          cur.style.mixBlendMode = p.cursorStyle === 'block' ? 'normal' : 'normal';
        } else cur.style.opacity = 0;
      },
    };
  },
});
