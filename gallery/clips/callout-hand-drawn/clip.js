// Hand-drawn annotations: seeded rough-marker paths (roughjs-style), drawn on with stroke-dashoffset in render(t).
// Every mark is a pure function of t: draw window → hold → erase in reverse (or fade).
studio.clip({
  duration: 5,
  setup(root, p, { duration, width: W, height: H }) {
    const NS = 'http://www.w3.org/2000/svg';
    const TYPES = ['circle', 'underline', 'box', 'strike', 'bracket', 'highlight', 'arrow'];
    const sw = Math.max(1, Number(p.strokeWidth) || 8) * Math.min(W, H) / 1080;
    const rough = Math.max(0, Number(p.roughness));
    const passes = Number(p.passes) === 1 ? 1 : 2;

    // ---- parse "type: x, y, w, h [#colour] [@delay]" ----
    const list = String(p.annotations || '').split('\n').map((line) => {
      const m = /^\s*([a-z-]+)\s*[:\s]\s*(.*)$/i.exec(line);
      if (!m) return null;
      const type = m[1].toLowerCase();
      if (!TYPES.includes(type)) return null;
      const toks = m[2].split(/[\s,;]+/).filter(Boolean);
      const nums = [], o = { type };
      toks.forEach((tk) => {
        if (tk[0] === '#') o.color = tk;
        else if (tk[0] === '@') o.delay = parseFloat(tk.slice(1));
        else if (!isNaN(parseFloat(tk))) nums.push(parseFloat(tk));
      });
      if (nums.length < 2) return null;
      o.x = (nums[0] / 100) * W; o.y = (nums[1] / 100) * H;
      o.w = ((nums[2] ?? 10) / 100) * W; o.h = ((nums[3] ?? 8) / 100) * H;
      return o;
    }).filter(Boolean).slice(0, 24);

    // ---- rough geometry helpers ----
    const smooth = (pts) => {
      let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
      }
      return d;
    };
    const roughLine = (R, x1, y1, x2, y2, k = 1) => {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux;
      const j = (a) => (R() - 0.5) * 2 * a * rough * k;
      const ext1 = j(sw * 0.9) - sw * 0.4 * rough, ext2 = j(sw * 0.9) + sw * 0.6 * rough;
      const a = { x: x1 - ux * ext1 + nx * j(sw * 0.5), y: y1 - uy * ext1 + ny * j(sw * 0.5) };
      const b = { x: x2 + ux * ext2 + nx * j(sw * 0.5), y: y2 + uy * ext2 + ny * j(sw * 0.5) };
      const bow = Math.min(len * 0.018, sw * 2.2);
      const f1 = 0.25 + R() * 0.15, f2 = 0.6 + R() * 0.15;
      const c1 = { x: x1 + (x2 - x1) * f1 + nx * j(bow), y: y1 + (y2 - y1) * f1 + ny * j(bow) };
      const c2 = { x: x1 + (x2 - x1) * f2 + nx * j(bow), y: y1 + (y2 - y1) * f2 + ny * j(bow) };
      return `M${a.x.toFixed(1)},${a.y.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
    };
    const harmonics = (R) => [2, 3, 5].map((k) => ({ k, a: (R() - 0.5) * (k === 2 ? 1 : 0.5), ph: R() * Math.PI * 2 }));

    function geometry(a, R) {
      const { x, y, w, h } = a;
      const pad = sw * 0.9;
      if (a.type === 'circle') {
        const cx = x + w / 2, cy = y + h / 2, rx = w / 2 + pad * 1.4, ry = h / 2 + pad * 1.4;
        const hs = harmonics(R), tilt = (R() - 0.5) * 0.16, a0 = -Math.PI * (0.62 + R() * 0.18);
        const sweep = Math.PI * 2 * (1.12 + R() * 0.08), N = 56, pts = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N, ang = a0 + sweep * u;
          let k = 1 + 0.12 * Math.min(1.5, rough) * (0.45 - u); // spiral in so the overshoot rides inside the start
          hs.forEach((hh) => { k += hh.a * 0.045 * rough * Math.sin(hh.k * ang + hh.ph); });
          const ex = Math.cos(ang) * rx * k, ey = Math.sin(ang) * ry * k;
          pts.push({ x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt) });
        }
        return { strokes: [smooth(pts)] };
      }
      const strokes = [];
      for (let pass = 0; pass < (a.type === 'arrow' ? 1 : passes); pass++) {
        const o = pass * sw * 0.45, kk = pass ? 2.2 : 1;
        if (a.type === 'underline') {
          const yy = y + h + sw * 0.6 + o;
          strokes.push(pass % 2 ? roughLine(R, x + w * 0.98, yy + sw * 0.15, x - w * 0.01, yy + sw * 0.5) : roughLine(R, x - w * 0.01, yy, x + w, yy - sw * 0.2));
        } else if (a.type === 'strike') {
          const yy = y + h * 0.55;
          strokes.push(roughLine(R, x - pad * 0.5, yy + sw * 0.4 + o, x + w + pad * 0.5, yy - sw * 0.6 + o));
        } else if (a.type === 'box') {
          const l = x - pad, r = x + w + pad, tp = y - pad, bt = y + h + pad;
          strokes.push(roughLine(R, l, tp, r, tp, kk), roughLine(R, r, tp, r, bt, kk), roughLine(R, r, bt, l, bt, kk), roughLine(R, l, bt, l, tp, kk));
        } else if (a.type === 'bracket') {
          const l = x - pad * 1.6, r = x + w + pad * 1.6, tp = y - pad, bt = y + h + pad, arm = Math.min(w * 0.12, h * 0.25, 40 * sw / 8) + sw;
          strokes.push(roughLine(R, l + arm, tp, l, tp, 0.5), roughLine(R, l, tp, l, bt, kk), roughLine(R, l, bt, l + arm, bt, 0.5));
          strokes.push(roughLine(R, r - arm, tp, r, tp, 0.5), roughLine(R, r, tp, r, bt, kk), roughLine(R, r, bt, r - arm, bt, 0.5));
        } else if (a.type === 'highlight') {
          return { fill: true };
        } else if (a.type === 'arrow') {
          // x,y = tail, w,h = vector to the tip
          const x2 = x + w, y2 = y + h, len = Math.hypot(w, h) || 1, nx = -h / len, ny = w / len;
          const bend = (R() < 0.5 ? -1 : 1) * len * (0.16 + R() * 0.08);
          const pts = [];
          for (let i = 0; i <= 14; i++) {
            const u = i / 14, b = 4 * u * (1 - u) * bend;
            pts.push({ x: x + w * u + nx * b + (R() - 0.5) * rough * sw * 0.25, y: y + h * u + ny * b + (R() - 0.5) * rough * sw * 0.25 });
          }
          pts[14] = { x: x2, y: y2 };
          strokes.push(smooth(pts));
          const tx = x2 - pts[12].x, ty = y2 - pts[12].y, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
          const hl = sw * 3.4 + 14, ang = 0.5;
          const wing = (s) => ({ x: x2 - hl * (ux * Math.cos(s * ang) - uy * Math.sin(s * ang)), y: y2 - hl * (uy * Math.cos(s * ang) + ux * Math.sin(s * ang)) });
          const w1 = wing(1), w2 = wing(-1);
          strokes.push(roughLine(R, w1.x, w1.y, x2, y2, 0.4), roughLine(R, x2, y2, w2.x, w2.y, 0.4));
        }
      }
      return { strokes };
    }

    // ---- build DOM ----
    const el = document.createElement('div');
    el.className = 'hd';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    const defs = document.createElementNS(NS, 'defs');
    const hlLayer = document.createElementNS(NS, 'g');
    const marks = document.createElementNS(NS, 'g');
    marks.setAttribute('class', 'marks' + (p.shadow ? ' shadow' : ''));
    svg.append(defs, hlLayer, marks);
    el.appendChild(svg);
    root.appendChild(el);

    const VARIANTS = p.boil ? 3 : 1;
    const seed = Number(p.seed) || 1;
    const D = Math.max(0.15, Number(p.drawDuration) || 0.7);
    const gap = Math.max(0, Number(p.gap) || 0);
    const start0 = Math.max(0, Number(p.startDelay) || 0);
    // natural schedule, compressed when the clip is too short (keep a readable hold before the exit)
    const exitDur = p.exitStyle === 'none' ? 0 : 0.4;
    const exitStart = Math.max(0.6, duration - exitDur - 0.12 - (list.length - 1) * 0.06);
    const natEnd = start0 + list.length * D + (list.length - 1) * gap;
    const budget = Math.max(0.4, Math.min(exitStart - 0.5, duration * 0.62));
    const k = natEnd > budget ? budget / natEnd : 1;
    const drawD = D * Math.max(0.55, k);
    let cursor = start0 * k;
    const ease = gsap.parseEase('power2.inOut'), easeIn = gsap.parseEase('power2.in');

    const items = list.map((a, i) => {
      const color = a.color || (a.type === 'highlight' ? p.highlightColor : p.color);
      const start = a.delay != null && !isNaN(a.delay) ? a.delay : cursor;
      const dd = a.type === 'highlight' ? drawD * 0.8 : a.type === 'arrow' ? drawD * 0.85 : drawD;
      cursor = Math.max(cursor, start + dd + gap * k);
      const vars = [];
      for (let v = 0; v < VARIANTS; v++) {
        const R = studio.random(seed * 1009 + i * 97 + v * 7919);
        const g = geometry(a, R);
        const grp = document.createElementNS(NS, 'g');
        if (g.fill) {
          // highlighter: rough-edged band revealed by a tilted clip polygon (left → right)
          const pad = sw * 0.6, x0 = a.x - pad, x1 = a.x + a.w + pad, y0 = a.y, y1 = a.y + a.h, N = 24, top = [], bot = [];
          const ht = harmonics(R), hb = harmonics(R), amp = a.h * 0.035 * rough;
          const wob = (hs, u) => hs.reduce((acc, hh) => acc + hh.a * Math.sin(hh.k * u * Math.PI + hh.ph), 0);
          for (let s = 0; s <= N; s++) {
            const u = s / N, xx = x0 + (x1 - x0) * u;
            top.push(`${xx.toFixed(1)},${(y0 + wob(ht, u) * amp + u * a.h * 0.03).toFixed(1)}`);
            bot.push(`${(xx - a.h * 0.08).toFixed(1)},${(y1 + wob(hb, u) * amp - u * a.h * 0.02).toFixed(1)}`);
          }
          const cid = `hdclip${i}_${v}`;
          const cp = document.createElementNS(NS, 'clipPath');
          cp.setAttribute('id', cid);
          const poly = document.createElementNS(NS, 'polygon');
          cp.appendChild(poly);
          defs.appendChild(cp);
          const band = document.createElementNS(NS, 'polygon');
          band.setAttribute('points', top.concat(bot.reverse()).join(' '));
          band.setAttribute('fill', color);
          band.setAttribute('clip-path', `url(#${cid})`);
          grp.setAttribute('opacity', p.highlightOpacity);
          grp.appendChild(band);
          hlLayer.appendChild(grp);
          vars.push({ grp, clip: poly, box: { x0: x0 - a.h * 0.4, x1: x1 + a.h * 0.4, y0: y0 - a.h * 0.2, y1: y1 + a.h * 0.2 } });
        } else {
          const segs = g.strokes.map((d) => {
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            path.setAttribute('class', 's');
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', sw.toFixed(2));
            grp.appendChild(path);
            return { path, len: 0 };
          });
          marks.appendChild(grp);
          vars.push({ grp, segs });
        }
      }
      return { a, start, dd, vars };
    });
    // measure stroke lengths once
    items.forEach((it) => it.vars.forEach((v) => {
      if (!v.segs) return;
      v.segs.forEach((s) => { s.len = s.path.getTotalLength() + 1; s.path.style.strokeDasharray = `${s.len} ${s.len}`; });
      v.total = v.segs.reduce((acc, s) => acc + s.len, 0);
    }));

    return {
      render(t) {
        const vIdx = VARIANTS > 1 ? Math.floor(t * 8) % VARIANTS : 0; // boil: new drawing every 1/8 s (≈ on threes)
        items.forEach((it, i) => {
          let prog = ease(studio.progress(t, it.start, it.dd));
          let alpha = 1;
          if (exitDur) {
            const es = exitStart + (items.length - 1 - i) * 0.06;
            const e = easeIn(studio.progress(t, es, exitDur));
            if (p.exitStyle === 'erase') prog *= 1 - e;
            else alpha = 1 - e;
          }
          it.vars.forEach((v, vi) => {
            const on = vi === vIdx;
            v.grp.style.display = on ? '' : 'none';
            if (!on) return;
            v.grp.style.opacity = it.a.type === 'highlight' ? p.highlightOpacity * alpha : alpha;
            if (v.clip) {
              const b = v.box, tilt = (b.y1 - b.y0) * 0.45, X = b.x0 + (b.x1 - b.x0 + tilt) * prog;
              v.clip.setAttribute('points', `${b.x0},${b.y0} ${X.toFixed(1)},${b.y0} ${(X - tilt).toFixed(1)},${b.y1} ${b.x0},${b.y1}`);
              return;
            }
            let rem = prog * v.total;
            v.segs.forEach((s) => {
              const l = Math.max(0, Math.min(s.len, rem));
              rem -= s.len;
              s.path.style.strokeDashoffset = s.len - l;
              s.path.style.visibility = l > 0.5 ? 'visible' : 'hidden';
            });
          });
        });
      },
    };
  },
});
