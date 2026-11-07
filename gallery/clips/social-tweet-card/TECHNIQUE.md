# Animated Post Card

A social post card (X, Threads, Bluesky or Reddit look; dark or light) that rises in, reveals its text word by word with a blur-rise, counts up its metrics and pops the like button with a ring and particle burst.

## Use it for
- Quoting a post in commentary, news recap and reaction videos.
- Testimonials or "people are saying" moments, styled as native social UI.
- Shorts/Reels where a screenshot would be static and blurry.

## Avoid when
- The post is very long (> ~280 chars): the body shrinks to 34 px and the card gets taller than 86 % of the frame (it is then scaled down).
- Several posts must be on screen at once — build a stacked feed variant instead of layering cards.
- Brand guidelines forbid platform look-alikes; restyle it as a neutral "quote card" with your tokens.

## Anatomy
- `.tc` full-frame transparent layer → `.wrap` (idle drift) → `.card` absolutely placed and measured. Unit `--u = min(W,H)/1080 * scale`.
- Theme classes `.dark` / `.light` set background, text, `--muted` and `--line`; platform maps `ACC` (link/badge blue or Reddit orange) and `LIKE` colours.
- **Header**: gradient avatar with initials (`color-mix` towards violet), name (ellipsis) + optional scalloped verified badge (24-point star path generated in a loop), handle, platform logo SVG top-right.
- **Body**: text split into lines → words as `inline-block` spans; `#tags`, `@mentions` and URLs get `.tag` (accent colour). Reddit: first line becomes a bold title. Body size steps by length: 41 / 37 / 34 (`--fs`).
- **Timestamp** line, then a **metrics row** with a hairline top border; the set depends on platform (X: replies, reposts, likes, views). Numbers formatted with `Intl.NumberFormat(..., { notation: 'compact' })` (`en`/`ru`).
- Each metric `.v` gets `min-width` = its final rendered width so the row never reflows while counting; `font-variant-numeric: tabular-nums`.
- Like metric has 6 seeded particles (`studio.random(11)` angle + radius) and a `.ring`.
- Fit: if the card is taller than `H*0.86`, the whole card is scaled by `fit`.

## Motion
- Build compression `k = clamp((D - 0.7) / 3.6, 0.5, 1)`.
- 0.05 s: card rises `y 60u → 0`, `scale 0.96 → 1` (× fit), fade, 0.75 s `expo.out`. 0.18 s avatar `back.out(2)`; 0.24 s name/handle slide from −18u (stagger 0.06); 0.3 s logo spins in from −20°.
- `T(0.42)`: words reveal `opacity 0, y 14u, blur(6px) → sharp`, 0.45 s `power3.out`, stagger `min(0.03, T(1.3) / words)` — total reveal is capped to ~1.3 s however long the post.
- `T(1.2)` timestamp fades; `T(1.3)` metrics rise in (stagger 0.06).
- `cs = T(1.35)`: metrics count up in `render` with `outExpo` over 1.2 s, each 0.08 s after the previous.
- `tLike = cs + T(1.25)`: heart/upvote fills `LIKE`, scales 1 → 1.4 (0.12 s `outQuad`) then back with `outElastic` (0.35 s); ring expands `0.3 → 1.6` while its border thins and fades (0.45 s); particles fly out on seeded angles with `outCubic`, fading with `1 - q²`.
- Hold: `.wrap` drifts `sin(t*1.1) * 4u`, eased in from 0.8 s.
- Exit at `D - 0.5`: card drops 50u and fades, 0.45 s `power2.in`.

## Adapt to the design system
- In an original clip, drop the platform palette and use tokens: card ← surface, text ← text, muted ← muted, link/badge ← accent, like ← accent-2.
- Font is hard-coded Inter (platform-faithful); for a branded quote card use `var(--font-body)` for the body and `var(--font-title)` for the name.
- Card radius 30u → design radius; shadow depth to taste (lighter on light themes).
- 9:16: keep `cardW = W*0.88`, raise `scale` to ~1.1–1.2 at 1080 wide and keep it centred vertically (not in the bottom 20 %). 16:9: `position: left/right` leaves room for a talking head.
- Short clips (2–3 s): skip the like pop or put it at `T(1.6)`; long clips: hold with the drift, or add a second card replacing the first.

## Variations
- **Thread**: stack 2–3 cards; each new one pushes the previous up by its height with `power3.inOut`.
- **Viral counter**: keep counting slowly during the hold (`outExpo` over the whole duration) to show "blowing up".
- **Highlight sentence**: after the reveal, wipe a marker highlight behind one key phrase (scaleX block behind words).
- **Reply bubble**: add a smaller reply card sliding in under the post at the like moment.
- **Word timing from VO**: drive word opacity from `studio.words` so the post is "read aloud".

## Pitfalls
- Without the `min-width` reservation, counting numbers change width and the metrics row jitters.
- Seeded randomness only (`studio.random`), never `Math.random` per frame, or particles change between preview and export.
- Count with `notation: 'compact'` only above 1000 (the clip does `n < 1000 ? Math.round(n)`), otherwise "0.4K" artefacts appear early in the count.
- Very long names are ellipsised; long handles are `nowrap` and can push the logo — test real data.
- Logos and badges imitate real platforms: fine for commentary, but don't present fabricated posts as real quotes.

## Reference
Reference implementation: gallery/clips/social-tweet-card/ (clip.js, style.css). Key snippet:

```js
// count up
metrics.forEach((m, i) => {
  if (m.target == null) return;
  const q = E.outExpo(studio.progress(t, cs + i * 0.08, 1.2));
  m.v.textContent = f(m.target * q);
});
// like pop: heart fills, scales 1→1.4→1, ring + 6 seeded particles burst
const lm = metrics.find((m) => m.d.like);
if (lm && p.likePop) {
  const on = t >= tLike;
  const hp = lm.el.querySelector('.hp');
  hp.setAttribute('fill', on ? LIKE : 'none');
  hp.setAttribute('stroke', on ? LIKE : 'currentColor');
  lm.v.style.color = on ? LIKE : '';
  const a = studio.progress(t, tLike, 0.12), b = studio.progress(t, tLike + 0.12, 0.35);
  const s = t < tLike ? 1 : a < 1 ? 1 + 0.4 * E.outQuad(a) : 1.4 - 0.4 * E.outElastic(b);
  lm.el.querySelector('svg').style.transform = `scale(${s})`;
```

```js
.from(words, { opacity: 0, y: 14 * u, filter: 'blur(6px)', duration: 0.45, ease: 'power3.out', stagger: Math.min(0.03, T(1.3) / Math.max(1, words.length)) }, T(0.42))
```
