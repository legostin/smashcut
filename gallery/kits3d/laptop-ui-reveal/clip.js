// Studio kit · laptop UI reveal: a closed laptop on a warm daylight set (sun through window mullions, sky fill)
// opens, the display wakes and a dashboard UI builds itself (sidebar, KPI count-ups, chart line drawing, cards) — all
// drawn on a canvas from t — while the camera cranes down from a high 3/4 and pushes in towards the screen.
// Screen: the built-in dashboard (title / numbers from params, colours from tokens) or your image / video via `screen`.
import { stage, THREE } from 'studio3js';

function dashboard(S, p) {
  const A = '#' + S.color(p.accent).getHexString(), B = '#' + S.color('accent2').getHexString();
  const { ease, range, lerp } = S;
  const pts = [0.3, 0.42, 0.38, 0.55, 0.5, 0.68, 0.62, 0.8, 0.74, 0.92];
  return (g, t, w, h) => {
    const u = w / 160, T0 = 1.7; // UI starts building once the lid is open
    g.fillStyle = '#f6f6f4'; g.fillRect(0, 0, w, h);
    const k0 = ease.outCubic(range(t, T0, T0 + 0.5));
    g.globalAlpha = k0;
    // sidebar
    g.fillStyle = '#111114'; g.fillRect(0, 0, lerp(0, u * 30, ease.outExpo(range(t, T0, T0 + 0.8))), h);
    g.fillStyle = A; g.beginPath(); g.arc(u * 8, u * 9, u * 3, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 5; i++) {
      const k = ease.outCubic(range(t, T0 + 0.3 + i * 0.06, T0 + 0.8 + i * 0.06));
      g.fillStyle = i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      g.fillRect(u * 5, u * (22 + i * 9), u * 18 * k, u * 2.4);
    }
    // header
    g.fillStyle = '#111114'; g.font = `700 ${u * 6}px Inter, sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText(p.title || 'Overview', u * 38, u * 15);
    // KPI cards with count-ups
    const kpis = [[p.kpi1 || 'Revenue', Number(p.value1) || 0, '$'], [p.kpi2 || 'Users', Number(p.value2) || 0, ''], ['Growth', 38, '%']];
    kpis.forEach(([label, val, unit], i) => {
      const k = ease.outExpo(range(t, T0 + 0.4 + i * 0.12, T0 + 1.4 + i * 0.12));
      const x = u * (38 + i * 40), y = u * 22 + (1 - k) * u * 6;
      g.globalAlpha = k0 * k;
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x, y, u * 36, u * 22, u * 2.5); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = u * 0.3; g.stroke();
      g.fillStyle = '#6b6b75'; g.font = `500 ${u * 3}px Inter, sans-serif`; g.fillText(label, x + u * 3.5, y + u * 7);
      const n = Math.round(val * ease.outCubic(range(t, T0 + 0.6 + i * 0.12, T0 + 2.2)));
      g.fillStyle = '#111114'; g.font = `800 ${u * 7}px Inter, sans-serif`;
      g.fillText(unit === '$' ? '$' + n.toLocaleString('en-US') : n.toLocaleString('en-US') + unit, x + u * 3.5, y + u * 17);
    });
    // chart card: the line draws itself, area fades in
    const kc = ease.outCubic(range(t, T0 + 0.7, T0 + 1.3));
    g.globalAlpha = k0 * kc;
    const cx = u * 38, cy = u * 50, cw = u * 116, ch = h - cy - u * 6;
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(cx, cy, cw, ch, u * 2.5); g.fill();
    const kl = ease.inOutCubic(range(t, T0 + 1.0, T0 + 2.6));
    const P = pts.map((v, i) => [cx + u * 6 + (i / (pts.length - 1)) * (cw - u * 12), cy + ch - u * 6 - v * (ch - u * 16)]);
    const n = kl * (P.length - 1), last = Math.floor(n), f = n - last;
    const path = P.slice(0, last + 1); if (last < P.length - 1) path.push([lerp(P[last][0], P[last + 1][0], f), lerp(P[last][1], P[last + 1][1], f)]);
    const gr = g.createLinearGradient(0, cy, 0, cy + ch); gr.addColorStop(0, B + '55'); gr.addColorStop(1, B + '00');
    g.fillStyle = gr; g.beginPath(); g.moveTo(path[0][0], cy + ch - u * 6); path.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(path[path.length - 1][0], cy + ch - u * 6); g.fill();
    g.strokeStyle = B; g.lineWidth = u * 1.1; g.lineJoin = 'round'; g.beginPath(); path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    const [ex, ey] = path[path.length - 1];
    g.fillStyle = A; g.beginPath(); g.arc(ex, ey, u * 1.8, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  };
}

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    const S = await stage(root, { fov: 30, studio: { kind: p.studio, backdrop: p.backdrop, size: 2 } });
    const { ease, range, lerp } = S;

    const src = String(p.screen || '').trim();
    const laptop = await S.device('laptop', { width: 2.6, finish: p.finish, screen: src || dashboard(S, p), open: 0, videoStart: 1.7 });
    laptop.rotation.y = -0.18;
    S.scene.add(laptop);

    // frame the open laptop
    laptop.setOpen(1);
    const box = new THREE.Box3().setFromObject(laptop);
    S.camera.setBase([0, 2.2, 8], [0, 0.7, 0]);
    S.frame(box, { margin: portrait ? [0.06, 0.3] : [0.18, 0.1], elevation: 12, azimuth: 14 });

    return {
      render(t) {
        const ko = ease.inOutCubic(range(t, 0.4, 1.7));
        laptop.setOpen(ko);
        // display wakes as the lid passes ~70°
        laptop.screen.material.emissiveIntensity = ease.outCubic(range(t, 1.2, 1.9));
        S.camera.move(t, { crane: { from: 16, to: -2, end: 4.5, ease: 'inOutCubic' }, dolly: { from: 1.12, to: 0.92, ease: 'inOutSine' }, orbit: { from: 10, to: -6 } });
        S.render(t);
      },
    };
  },
});
