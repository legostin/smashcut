# Logo Reveal — Burst

A full-frame, high-energy logo sting: a ring shockwave, radial rays and seeded particles explode from the centre, a geometric mark pops in with a spin and slides aside, and the wordmark rises letter by letter with a tracking-in tagline.

## Use it for
- Channel intros/outros, product launch openers, event and gaming stings.
- The "brand moment" after a hook, or the last 3–5 s of a promo.
- Brands without a vector logo: the mark is a shape + letter generated from the name.

## Avoid when
- The brand is quiet/luxury — the burst reads as cheap there; use a line-draw or line-mask reveal.
- You need a transparent overlay: the background is part of the clip (radial gradient, always painted).
- The real logo must appear exactly (the mark is a generic hexagon/circle/square/diamond with a letter — swap in an SVG for real brands).

## Anatomy
- `.lr` full-frame, `overflow:hidden`; `.bg` = `radial-gradient(circle at 50% 50%, bg2 0%, bg 70%)` (centre lighter than edges = built-in vignette).
- `.fx` = zero-size anchor at the frame centre; everything burst-related is positioned from it:
  - two rings (600 px circles, 6 px accent border and 2 px accent-2 border),
  - 14 rays: wrapper divs rotated `360/14 × i + 8°`, each holding an 8 px rounded bar (`transform-origin: left`), colours alternating accent / accent-2,
  - particles (default 36): seeded `studio.random(2024)` size 6–20 px, kind = dot / square / ring, colour, angle, radius 260–880 px (y × 0.75 for an elliptical spread), spin ±270°, delay 0–0.15 s, duration 0.9–1.6 s.
- `.group` lockup: `.row` (mark + word, 44 px gap) and `.tag` below.
- **Mark**: inline SVG 100×100 viewBox, shape filled with accent, letter in Unbounded 900 coloured with the background colour (cut-out look); size = `1.25 × wordmark size`.
- **Wordmark**: one `<span>` per character inside `.word { overflow:hidden }` = shared mask for the letter rise. Auto-fit if the row exceeds 1700 px.
- **Tagline**: Inter 500 30 px uppercase, tracking 0.5em with matching `padding-left` so tracked text stays optically centred.

## Motion
- 0.10 s: mark pops `scale 0 → 1`, `rotate −120 → 0`, `back.out(1.6)` (0.8 s), starting at the **screen centre** (`x: shift` = half the row width), then 0.55 s: slides to its place in the row (`expo.inOut`, 0.8 s). It is the focal point before the wordmark exists.
- 0.12 s: main ring `scale 0 → 1.9`, opacity 1 → 0 (1.1 s `expo.out`); 0.20 s: thin ring `scale 0 → 2.6` (1.4 s) — two speeds = depth.
- 0.14 s + (i % 3) × 0.03: rays shoot out (`x 70 → 260`, `scaleX 0 → 1`, 0.35 s `power3.out`), then 0.35 s later fly on and shrink (`x 520`, `scaleX 0`, 0.5 s `power3.in`) — the 3-step offset breaks the symmetry.
- 0.15 s + delay: particles fly to their target with `expo.out` (fast start, long float), fade/shrink from 60 % of their flight.
- 1.12 s (0.55 s without mark): letters rise `yPercent 110 → 0`, stagger 0.045 s, 0.8 s `expo.out`; the row is revealed while the mark is still finishing its slide (overlap).
- +0.45 s: tagline tracks in `letterSpacing 1.1em → 0.5em` to opacity 0.75 (1.4 s `expo.out`).
- Whole clip: group pushes 1 → 1.05 (linear); background zooms 1.15 → 1 (`power1.out`) — opposite directions give parallax.
- Exit (optional `fadeOut`): group fades + `blur(10px)` over 0.55 s from `D − 0.62` (`power2.in`). The background stays.
- No beat sync; to hit music, move the burst start (all the 0.1–0.2 s offsets) to `studio.beat(0)` or a `studio.markers` impact.

## Adapt to the design system
- `bg` → `bg`, `bg2` → `surface` (or a lighter bg tint), `accent` → `accent`, `accent2` → `accent-2`, `textColor` → `text` (runtime binds by key name).
- `font` → display role. In an original clip: `var(--font-display)`, `var(--weight-display)`; mark letter can use the same family instead of hard-coded Unbounded.
- Shape choice follows radius tokens: `square` with `rx` from the system's radius, `circle` for soft brands, `hexagon`/`diamond` for tech/gaming.
- Energy: particle count and ray count are the "loudness" knobs (0 particles + no rays = clean pop).
- 9:16: the row is horizontal — stack the mark above the word for vertical, reduce the 1700 px fit to `studio.width − 2×margin`, and shrink the particle radius (`r` is in px tuned for 1920 width).
- Short (≤3 s): drop the tagline, start letters at ~0.7 s. Long (6 s+): the push carries the hold; add a URL/CTA line at ~2.5 s rather than holding 4 s of nothing.

## Variations
- **Clean pop**: `particles: 0`, remove rays, keep one ring — corporate-friendly.
- **Real logo**: replace the generated mark SVG with the brand's paths; keep the pop + slide.
- **Confetti**: more particles (60–80), wider radius, add gravity (y offset growing with time) for celebrations.
- **Beat burst**: re-fire the ring + a few particles on `studio.bars` during the hold.
- **Mark only**: `mark` alone without wordmark for an app-icon sting (skip the slide).

## Pitfalls
- Hard-coded 1700 px fit and particle radii assume 1920×1080 — scale by `studio.width` in your version.
- `.group` already has `transform: translate(-50%,-50%)` in CSS; GSAP scale composes with it, but if you set `x/y` on it you replace the centring — animate an inner element instead.
- Particle randomness must be seeded (`studio.random(seed)`) and generated in setup, never per frame.
- Letter rise needs the mask padding (`padding: .08em .02em .06em`) or descenders/accents clip.
- The mark letter colour equals `bg`; if `bg` is close to `accent`, the letter disappears.
- Without `fadeOut` the clip just cuts at the end — fine for a hard cut, wrong as the last shot.

## Reference
Reference implementation: gallery/clips/logo-reveal/ (clip.js, style.css). Key snippet:

```js
// burst
tl.fromTo(el.querySelector('.ring'), { scale: 0, opacity: 1 }, { scale: 1.9, opacity: 0, duration: 1.1, ease: 'expo.out' }, 0.12)
  .fromTo(el.querySelector('.r2'), { scale: 0, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 1.4, ease: 'expo.out' }, 0.2);
el.querySelectorAll('.ray i').forEach((r, i) => {
  tl.fromTo(r, { x: 70, scaleX: 0 }, { x: 260, scaleX: 1, duration: 0.35, ease: 'power3.out' }, 0.14 + (i % 3) * 0.03)
    .to(r, { x: 520, scaleX: 0, duration: 0.5, ease: 'power3.in' }, 0.49 + (i % 3) * 0.03);
});
parts.forEach((q) => {
  tl.fromTo(q.d, { x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }, { x: q.x, y: q.y, scale: 1, rotate: q.rot, duration: q.dur, ease: 'expo.out' }, 0.15 + q.delay)
    .to(q.d, { opacity: 0, scale: 0.2, duration: 0.6, ease: 'power2.in' }, 0.15 + q.delay + q.dur * 0.6);
});
// mark
if (hasMark) {
  tl.fromTo(markEl, { scale: 0, rotate: -120, x: shift }, { scale: 1, rotate: 0, duration: 0.8, ease: 'back.out(1.6)' }, 0.1)
    .to(markEl, { x: 0, duration: 0.8, ease: 'expo.inOut' }, 0.55);
}
tl.fromTo(word, { opacity: 0 }, { opacity: 1, duration: 0.01 }, tWord)
  .fromTo(letters, { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: 'expo.out', stagger: 0.045 }, tWord)
  .fromTo(tag, { opacity: 0, letterSpacing: '1.1em', paddingLeft: '1.1em' }, { opacity: 0.75, letterSpacing: '0.5em', paddingLeft: '0.5em', duration: 1.4, ease: 'expo.out' }, tWord + 0.45)
```
