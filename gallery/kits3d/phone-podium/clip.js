// Studio kit · phone mockup on a podium: a procedural phone (titanium frame, glossy glass front, live screen) rises
// onto a stepped podium with a glowing accent ring and settles from a 3/4 turn to a gentle sway; product_softbox preset
// (graphite seamless, softboxes + strip rims → long highlights on the glass), slow push-in.
// Screen: an image or a video (.mp4/.webm — seeked frame-exactly) from `screen`, or the built-in app UI drawn from t.
import { stage, THREE } from 'studio3js';

/** built-in app screen, a pure function of t: header, a balance that counts up, cards sliding in, a bar chart */
function appScreen(S, p) {
  const A = '#' + S.color(p.accent).getHexString(), B = '#' + S.color('accent2').getHexString();
  const { ease, range, lerp } = S;
  return (g, t, w, h) => {
    const u = w / 100;
    g.fillStyle = '#0d0d10'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w * 0.8, h * 0.1, 0, w * 0.8, h * 0.1, w * 1.1);
    gr.addColorStop(0, B + '88'); gr.addColorStop(1, '#0d0d1000'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.font = `600 ${u * 3.6}px Inter, sans-serif`; g.fillText('9:41', u * 8, u * 9);
    g.globalAlpha = 0.6; g.font = `500 ${u * 4.2}px Inter, sans-serif`; g.fillText(p.caption || 'Total balance', u * 8, h * 0.17); g.globalAlpha = 1;
    const v = Math.round(lerp(0, Number(p.value) || 0, ease.outExpo(range(t, 0.9, 2.6))));
    g.font = `800 ${u * 13}px Inter, sans-serif`; g.fillText('$' + v.toLocaleString('en-US'), u * 8, h * 0.17 + u * 14);
    // bar chart
    const bars = [0.42, 0.66, 0.5, 0.82, 0.6, 0.95, 0.74];
    const bx = u * 8, by = h * 0.5, bw = (w - u * 16) / bars.length;
    bars.forEach((b, i) => {
      const k = ease.outCubic(range(t, 1.2 + i * 0.08, 2.0 + i * 0.08));
      const bh = h * 0.18 * b * k;
      g.fillStyle = i === 5 ? A : 'rgba(255,255,255,0.18)';
      g.beginPath(); g.roundRect(bx + i * bw + bw * 0.18, by - bh, bw * 0.64, Math.max(bh, 0.1), u * 1.6); g.fill();
    });
    // cards slide in
    ['Payments', 'Savings', 'Cards'].forEach((name, i) => {
      const k = ease.outExpo(range(t, 1.6 + i * 0.15, 2.6 + i * 0.15));
      const y = h * (0.56 + i * 0.12) + (1 - k) * u * 20;
      g.globalAlpha = k;
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.roundRect(u * 6, y, w - u * 12, h * 0.1, u * 4); g.fill();
      g.fillStyle = i === 0 ? A : 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(u * 15, y + h * 0.05, u * 4.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `600 ${u * 4.4}px Inter, sans-serif`; g.fillText(name, u * 23, y + h * 0.045);
      g.globalAlpha *= 0.55; g.font = `500 ${u * 3.4}px Inter, sans-serif`; g.fillText('Updated just now', u * 23, y + h * 0.07);
      g.globalAlpha = 1;
    });
  };
}

studio.clip({
  duration: 6,
  async setup(root, p, { duration: D }) {
    const portrait = studio.height > studio.width;
    const S = await stage(root, { fov: 28, studio: { kind: p.studio, backdrop: p.backdrop, size: 2 } });
    const { ease, range, lerp } = S;

    const ped = S.podium({ shape: 'stepped', steps: 2, radius: 1.15, height: 0.3, bevel: 0.025, ring: p.accent, material: S.materials.mattePlastic({ color: p.podium, roughness: 0.45 }) });
    S.scene.add(ped);

    const src = String(p.screen || '').trim();
    const phone = await S.device('phone', { height: 1.9, finish: p.finish, screen: src || appScreen(S, p), videoStart: 0.6, glare: 0.6 });
    const rig = new THREE.Group(); // rig: entrance + sway; the phone stands on the podium top
    phone.position.y = phone.size.h / 2;
    rig.add(phone);
    S.scene.add(rig);

    const rest = new THREE.Box3().setFromObject(ped).union(new THREE.Box3(new THREE.Vector3(-0.6, 0, -0.3), new THREE.Vector3(0.6, ped.top + phone.size.h, 0.3)));
    S.camera.setBase([0, 1.2, 8], [0, 1, 0]);
    S.frame(rest, { margin: portrait ? [0.12, 0.16] : [0.3, 0.08], elevation: 6 });

    return {
      render(t) {
        const kp = ease.outExpo(range(t, 0, 0.9));
        ped.position.y = lerp(-0.35, 0, kp);
        ped.ring.material.color.copy(S.color(p.accent)).multiplyScalar(2.5 * ease.outCubic(range(t, 0.4, 1.3)));
        // phone rises with a 3/4 turn → settles facing the camera, then sways ±12° (sine, deterministic)
        const kr = ease.outCubic(range(t, 0.3, 1.8));
        rig.position.y = ped.position.y + ped.top + lerp(0.9, 0.02, kr);
        rig.visible = t > 0.3;
        const sway = Math.sin((t - 1.8) * 0.9) * 12 * S.ease.inOutSine(range(t, 1.8, 2.8));
        rig.rotation.y = THREE.MathUtils.degToRad(lerp(-120, -18, kr) + sway);
        phone.scale.setScalar(lerp(0.85, 1, kr));
        S.camera.move(t, { pushIn: { amount: 0.08 }, orbit: { from: 8, to: -4 } });
        S.render(t);
      },
    };
  },
});
