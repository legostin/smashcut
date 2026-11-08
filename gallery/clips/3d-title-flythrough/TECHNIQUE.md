# 3D Title Flythrough

Extruded type in a real font flips forward and drops into place letter by letter while the camera pushes in from a high, offset angle; an accent rule draws under the title, an optional second line rises, and the clip ends on a readable front-facing hold. Three.js, transparent background.

## Use it for
- Episode/chapter titles, keynote and launch openers, a hero line over b-roll.
- Short, punchy titles (1–3 words, ≤ ~14 characters per line) — each letter gets its own moment.
- 9:16 too: a two-word title breaks onto two lines automatically.

## Avoid when
- The text is long (a sentence) — per-letter 3D gets slow and small; use a 2D line-mask or kinetic-words title.
- The text must sit in a precise layout with other 2D elements (3D perspective makes exact alignment fiddly).
- Scripts outside Latin/Cyrillic/Greek (the bundled Inter has no CJK/Arabic glyphs) — pass `font` to `S.text` with a font that has them.

## Anatomy
- `stage(root, { light: 'studio', fov: 32, env })` — no shadows (floating type over footage).
- Title: `S.text(title, { size: 1, depth: 0.32, bevel: 0.03, weight, letterSpacing: 0.035, perChar: true, material })` → a Group of glyph meshes, each pivoting on its baseline centre (natural flip axis). Materials are **cloned per letter** so each can fade on its own.
- Finish presets: gloss (`rough 0.2, clearcoat 1`), satin (`rough 0.38, clearcoat 0.3`), chrome (`metal 1, rough 0.14`, env 1.2).
- Accent rule: `S.box(min(0.22 × titleWidth, 2.2), 0.06, 0.06)` 0.32 below the title, faint emissive.
- Second line: `S.text(sub, { size: 0.3, depth: 0.05, weight: 500, letterSpacing: 0.06, perChar: true })`, scaled down if wider than 95 % of the title.
- The whole lockup is centred vertically; `fitDistance` frames it at 64 % width (16:9) / 74 % (9:16), ≤ 60 % / 50 % height.
- 9:16: if the title has a space and no manual `\n`, it breaks at the space nearest the middle.

## Motion
- Letter i: start `0.2 + i × min(0.07, 1.1/N)` s, 1.1 s. Position: from +1.6 up and −2.4 back, `outCubic`. Rotation x: from −0.85π (lying back) to 0 with a soft `outBack` (≈4 % overshoot — a settle, not a bounce). Opacity 0 → 1 over the first 0.25 s.
- `tLand = 0.2 + (N−1) × stagger + 0.6`: the rule draws from the centre (`outExpo`, tLand−0.2 → tLand+0.6).
- Second line from tLand: letters rise 0.25 and fade in, stagger 0.02 s, 0.7 s `outCubic`.
- Camera: from (−0.32 d, 0.22 d, 1.75 d) to (0, 0.02 d, d), `outCubic` 0–3.8 s — a push-in that also swings from high-left to front, so letters landing early are seen in perspective and the end is square-on. Then 2 % drift to the end.
- Hold ≥ 2 s front-facing (the craft rule: type readable, ≤ 25° off-axis).

## Adapt to the design system
- `color` → text token, `accent` → accent token. Weight select maps to the Inter weights bundled with the app; for a brand display font pass `font: '/p/<project>/media/brand.ttf'` (.ttf/.otf/.woff, not .woff2).
- Heavier display weights (800–900) read best in 3D; light weights need less `depth` (≈0.15) and more letterSpacing.
- Sentence case vs caps: caps give a cleaner extruded silhouette; lowercase descenders need more space for the rule (raise the 0.32 gap).
- Motion personality: corporate → drop the outBack (use `outCubic` for rotation); playful → bigger overshoot and stagger 0.09.

## Variations
- **Drop only**: no rotation, letters fall from +3 with `outBack` — a stomp/promo feel.
- **Reverse exit**: in the last 0.8 s flip letters away (`inCubic`) from the last to the first.
- **Fly-through**: start the camera *in front of* the title (z negative of the final, looking back) and pull through the letters — needs `near` small and letters hidden while the camera passes.
- **Two-tone**: material per word (`m.userData.index` ranges) — first word text colour, second word accent.
- **Over footage**: add `shadows: true` + `S.ground()` when there's a floor in the plate and match its perspective.

## Pitfalls
- Bevel widens every glyph by ~bevelSize on each side — with 0 tracking heavy weights touch ("LEVEL" merged). Keep `letterSpacing` ≥ 0.03 at bevel 0.03.
- `perChar` meshes share one material by default; per-letter opacity needs `m.material = m.material.clone()`.
- `transparent = true` permanently on letters causes sort flicker where letters overlap in depth — toggle it only while fading.
- Fit with the *final* lockup (incl. second line) or the hold is off-centre; the flight starts partly out of the vertical centre by design.
- Long titles in 9:16 without a space can't wrap — the fit makes them small; offer a manual `\n`.

## Reference
Reference implementation: gallery/clips/3d-title-flythrough/ (clip.js). Key snippet:

```js
const outBackSoft = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
letters.forEach((m, i) => {
  const d = 0.2 + i * stagger;
  const kp = ease.outCubic(range(t, d, d + 1.1));
  const kr = outBackSoft(range(t, d, d + 1.1));
  const r = rest[i];
  m.position.set(r.x, r.y + (1 - kp) * 1.6, r.z - (1 - kp) * 2.4);
  m.rotation.x = (1 - kr) * -Math.PI * 0.85;
  const op = range(t, d, d + 0.25);
  m.material.opacity = op; m.material.transparent = op < 1; m.visible = op > 0;
});
const k = ease.outCubic(range(t, 0, 3.8));
const z = dist * (lerp(1.75, 1, k) - 0.02 * range(t, 3.8, D));
S.camera.position.set(lerp(-dist * 0.32, 0, k), lerp(dist * 0.22, dist * 0.02, k), z);
S.look(0, 0, 0);
```
