# Retro 3D Extrude Type

Chunky retro block letters that bounce-drop in, then "pop out of the page" as a stacked text-shadow extrusion grows behind each letter; the extrusion angle sways during the hold and collapses on exit.

## Use it for
- Sale/promo hits ("-50%", "NEW!"), YouTube punchlines, kids, gaming and retro/80s–90s moments.
- 1–3 short words on 1–2 lines that should feel physical and loud.
- Thumbnail-style stills inside a video (it holds well).

## Avoid when
- Premium, minimal or corporate brands — the bounce and fat extrusion are playful by nature.
- Long text: the per-letter shadow stack is expensive and illegible beyond ~20 characters.
- Over busy footage without a plate: the face colour is light and needs the outline to stay readable.

## Anatomy
- `.ex` centred block (`translate(-50%,-50%)` + `rotate(tilt)`), shifted up by half the extrusion length so the whole object stays centred.
- `.blk` holds one `.row` per text line (`white-space: nowrap`, `line-height: 1.02`); every character is an `inline-block` `.ch` span (`white-space: pre` keeps spaces).
- **Face**: text colour `face` + a thick `-webkit-text-stroke` (`2 × max(3, fs*0.034)`) in the outline colour with `paint-order: stroke fill` — the stroke sits behind the fill, so it reads as an outline and hides the inner contours of variable fonts.
- **Extrusion**: rebuilt every frame in `render(t)` as N offset `text-shadow`s (`N = depth`, step = `max(1, fs/120)` px) along the angle vector `(cos a, sin a)`, each darker towards the back (`mix(extrude, black, 0.08 + 0.3*j/N)`), plus one outline-coloured back edge and an optional soft drop shadow scaled by depth.
- **Lift**: as depth grows the letter itself moves `-n*0.5` steps against the extrusion direction — it rises off the page instead of growing a tail.
- **State objects**: each letter is `{ s, y, o, d, sc, r }`; GSAP tweens these plain numbers on `tl`, `render` turns them into CSS. That lets one timeline drive a style (text-shadow list) GSAP can't interpolate.
- Palettes (face / extrude / outline): retro, candy, mint, sunset, custom (params). Fit: shrinks to `width-360 × height-300` to leave room for the extrusion.

## Motion
- Timing scale `k = min(1, D/3.2)`; letter stagger `st = min(0.045, 0.5/letters) * max(0.6, k)` — the whole drop wave stays ≤ 0.5 s.
- From 0.04 + i·st: letter falls `y -240 → 0` with a slight seeded-by-index tilt `r = -10 + (i%3)*7 → 0`, `bounce.out` over `0.85 * max(0.65, k)` s; opacity snaps in over 0.12 s.
- Depth `d 0 → 1` with `back.out(2)` (~0.42 s) starts at 45 % of the drop — the extrusion "pops" while the letter is still bouncing (overlap = punch).
- Whole duration: block breathes `scale 1 → 1.03` `sine.inOut`.
- Hold: extrusion angle sways ±10° with `sin(t*1.9)`, faded in over the first 1.2 s, so the 3D feels lit by a moving light.
- Exit: `exitDur = min(0.55, D*0.16)`, tiny stagger; depth collapses to 0 (`power2.in`), then each letter scales to 0 with `back.in(2.2)` — flatten first, then vanish.

## Adapt to the design system
- face ← text or bg (light), extrude ← accent, outline ← a dark neutral (bg/surface on light themes). The `faceColor/extrudeColor/outlineColor` params only apply in `custom` palette — in your own clip read tokens directly.
- Font: heavy display role only (`var(--font-display)` at 800–900); thin weights collapse under the stroke.
- Energy: the bounce and back.out overshoot are the "energy" — for calmer systems use `power3.out` drops and `power2.out` depth.
- 9:16: break into 2–3 short rows, size ~150–200 px at 1080 wide; the fit uses `studio.width/height` so it scales correctly, but check the angled extrusion doesn't leave the frame on the long side.
- Short (≤2 s): drop wave compresses via `k`; consider skipping the sway. Long (6 s+): sway + breathe carry it; add a second "hit" (depth pulse on a beat).

## Variations
- **Beat pulse**: add `+0.25 * studio.level()` to `d` during the hold so the extrusion pumps with the music.
- **Long shadow flat**: depth 40, step larger, single extrude colour, no outline — flat-design long shadow.
- **Angle reveal**: animate `angle` from 0 → 50° instead of depth for a "rotating light" reveal.
- **Stacked colours**: alternate extrude colour every 4 layers for a striped retro (80s) extrusion.
- **Sticker hit**: tilt ±8°, add a rotating starburst plate behind (see text-gradient badge or speaker-card sticker).

## Pitfalls
- Don't use `-webkit-text-stroke` without `paint-order: stroke fill` on Unbounded/variable fonts — inner contours show.
- Hundreds of shadows per frame are heavy: keep depth ≤ 40 and letters ≤ ~20.
- GSAP can't tween `text-shadow` lists cleanly — tween numeric state and compose CSS in `render(t)` (deterministic).
- Fit leaves fixed 360/300 px margins; at extreme angles/depths the extrusion can still be cut — check the contact sheet.
- `weight` is 900 for every font (the ternary is a no-op); Playfair at 900 is fine, Manrope/Inter top out lower and render synthetic bold if unavailable.

## Reference
Reference implementation: gallery/clips/text-3d-extrude/ (clip.js, style.css). Key snippet:

```js
render(t) {
  const sway = p.sway ? (10 * Math.PI / 180) * Math.sin(t * 1.9) * Math.min(1, t / 1.2) : 0;
  const a = base + sway;
  const ux = Math.cos(a) * step, uy = Math.sin(a) * step;
  blk.style.transform = `scale(${breathe.s})`;
  letters.forEach((L) => {
    const n = L.d * N;
    const parts = [];
    const whole = Math.floor(n);
    for (let j = 1; j <= whole; j++) parts.push(`${(ux * j).toFixed(2)}px ${(uy * j).toFixed(2)}px 0 ${mix(E, [0, 0, 0], 0.08 + 0.3 * (j / N))}`);
    if (n > 0.05) {
      // dark back edge so the extrusion has an outline too
      const ex = n + stroke / step;
      parts.push(`${(ux * ex).toFixed(2)}px ${(uy * ex).toFixed(2)}px 0 ${outl}`);
      if (p.longShadow) parts.push(`${(ux * (n + 6)).toFixed(1)}px ${(uy * (n + 6) + 10).toFixed(1)}px ${24 + n}px rgba(0,0,0,${(0.35 * L.d).toFixed(2)})`);
    }
    L.s.style.textShadow = parts.length ? parts.join(',') : 'none';
    // as the letter pops out it moves up-left by the depth so it rises off the page
    const lift = -n * 0.5;
    L.s.style.transform = `translate(${(ux * lift).toFixed(2)}px, ${(L.y + uy * lift).toFixed(2)}px) rotate(${L.r}deg) scale(${L.sc})`;
    L.s.style.opacity = L.o;
  });
},
```

```js
letters.forEach((L, i) => {
  const at = 0.04 + i * st;
  tl.fromTo(L, { y: -240, r: -10 + (i % 3) * 7 }, { y: 0, r: 0, duration: drop, ease: 'bounce.out' }, at)
    .fromTo(L, { o: 0 }, { o: 1, duration: 0.12, ease: 'none' }, at)
    .fromTo(L, { d: 0 }, { d: 1, duration: 0.42 * Math.max(0.6, k), ease: 'back.out(2)' }, at + drop * 0.45);
});
```
