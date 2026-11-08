// 3D clip (Three.js) — a pure function of time like every clip: build the scene in setup(), pose it in render(t), then S.render().
// Helpers: see /runtime/studio3js.js (stage, text, svg, model, particles, mat, color('accent'), orbit, ground, range, ease).
import { stage } from 'studio3js';

studio.clip({
  duration: 4,
  async setup(root, p, { duration }) {
    const S = await stage(root, { light: 'studio', camera: [0, 0.6, 9], shadows: true });
    const word = await S.text(p.text, { size: 1.2, depth: 0.35, perChar: true, material: S.mat({ color: p.color, metal: 0.1, rough: 0.3, clearcoat: 0.6 }) });
    S.shadows(word);
    S.scene.add(word);
    S.ground({ y: -0.9, opacity: 0.3 });
    const letters = word.children;
    return {
      render(t) {
        letters.forEach((m, i) => {
          const k = S.ease.outBack(S.range(t, 0.1 + i * 0.05, 0.9 + i * 0.05));
          m.rotation.x = (1 - k) * -Math.PI / 2;
          m.position.z = (1 - k) * -1.5;
        });
        S.orbit(t, { radius: 9, height: 0.6, turns: 0.02, start: -0.15 });
        const out = S.range(t, duration - 0.5, duration);
        word.position.y = -out * 0.3;
        word.traverse((m) => m.material && (m.material.opacity = 1 - out, m.material.transparent = out > 0));
        S.render();
      },
    };
  },
});
