# Repetitive Type Marquee

A full-frame wall of one repeated word or phrase: rows scroll in alternating directions with a sine-wave sway, alternate filled and outlined type, and the accent centre row scales up mid-clip while the rest recede.

## Use it for
- Fashion, event, music and sports promos; drops and "new season" announcements.
- Bold section openers and poster-like title cards.
- A textured, typographic background behind a product shot or a cut-out person (transparent mode).

## Avoid when
- The message needs more than 1–3 words — repetition only works with short phrases.
- The tone is calm or corporate; a full-frame moving wall is loud.
- Over detailed footage at full opacity — it competes; use transparent mode at low opacity instead.

## Anatomy
- `.mq` full frame, optional solid background (`bgColor`) or transparent overlay.
- N rows (3–11) absolutely positioned at `H/2 + (i - mid) × pitch` with `pitch = H / (N - 0.6)` — rows tile the full height with a little bleed off top and bottom.
- Font size from the cap height: measure `'HЭ'` on a canvas → `fs = pitch × 0.74 / cap`; a vertical offset `dy` centres the **cap band** (not the line box) on each row, so different fonts sit identically.
- Each row: `.strip` (flex, nowrap) of repeated `.unit`s = phrase + a round `.dot` separator (`0.16em`, `currentColor`). One unit is measured and cloned `ceil((W + 2uw)/uw) + 1` times for a seamless loop.
- Outline rows use an **SVG filter** instead of `-webkit-text-stroke`: `feMorphology dilate` then `feComposite operator="out"` with `SourceAlpha` → a clean union outline even for variable fonts with overlapping contours (Unbounded).
- Patterns: `alternate` (odd distance from centre = outline), `filled`, `outline`, `accent-only` (only centre filled). The centre row is always filled and coloured `accent`.
- Directions alternate per row (`dir = ±1` by parity from the centre).

## Motion
- Scroll is pure math in `render(t)`: `x = dir × speed × t + A × sin(2πft + i × 0.9)`, wrapped with `((x % uw) + uw) % uw` → infinite, seamless, seekable. Defaults: 150 px/s, 40 px amplitude, 0.25 Hz, phase 0.9 rad per row (a travelling wave across rows).
- Enter (GSAP): rows rise `y 60 → 0` and fade in from the centre outwards, delay `0.04 + |i - mid| × 0.07k` (k = `min(1, D/4)`), 0.9 s `expo.out`.
- Mid-clip emphasis at `D × 0.42` (only if `D ≥ 3`): centre row scales to 1.32 (`expo.inOut`, `min(1.1, D×0.2)` s) while all other rows fade to 0.28 — the focal "beat" of the clip.
- Exit (`min(0.5, D×0.12)` s): rows lift `y -50` and fade from the edges in, centre row last (`power2.in`, 0.05k stagger).
- Beat sync: put the emphasis at a bar (`studio.bars` / `studio.beat(n)`) instead of `D × 0.42`, or modulate `speed` by `studio.level()` for audio-reactive pulsing (integrate carefully — x must stay a function of t).

## Adapt to the design system
- `bgColor` → `bg`, `color` → rows, `accent` → centre row. Caveat: key-name binding maps `color` to the `accent` token too — in your clip set `"token": "text"` on it or use `var(--color-text)`, otherwise every row becomes accent and the centre row loses its contrast.
- Font → display role; heavy weights (800–900) carry the wall best. Bebas Neue is Latin-only; the cap measure includes `Э` so Cyrillic fonts centre correctly.
- Outline width (`stroke`) should scale with the design's line weight (1.5–3 px at 1080p).
- 9:16: more rows (9–11) with shorter phrases; the pitch is derived from `studio.height` and copies from `studio.width`, so it adapts automatically. The scale-up row may overflow sideways in 9:16 — fine, it is a marquee.
- Short (<3 s): emphasis is disabled automatically; raise speed slightly. Long (10 s+): lower speed (80–120) and amplitude, or the motion becomes tiring.

## Variations
- **Static wall + one moving row**: speed 0 for all but the centre row.
- **Diagonal marquee**: rotate `.mq` −8° and scale 1.2 to cover corners.
- **Photo cut-out sandwich**: transparent mode behind a person cut-out, with the centre row duplicated above the person.
- **Beat flip**: on each beat, swap filled/outline pattern (index parity + `floor(beatIndex)`).
- **Multi-phrase**: different text per row (brand, date, city), same unit-measure loop per row.

## Pitfalls
- `-webkit-text-stroke` on Unbounded shows internal contour overlaps — use the morphology filter as here.
- Measure the unit **after** fonts load, or the loop seam jumps.
- Don't animate the scroll with a GSAP repeat/yoyo tween; wrap a pure function of t so any seek is exact.
- High speed + high wave amplitude causes strobing at 30 fps — keep `speed × fps` reasonable (≤ ~25 px/frame).
- Too many outline rows over busy footage become illegible; use `filled` with lower opacity instead.

## Reference
Reference implementation: gallery/clips/title-marquee-repeat/ (clip.js, style.css). Key snippet:

```js
    // outline via an SVG morphology filter (dilate − original): a clean union outline even for fonts
    // whose glyphs have overlapping contours (-webkit-text-stroke would show the overlaps)
    const fid = 'mqOutline' + Math.round(p.stroke * 10);
    el.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><filter id="${fid}" x="-2%" y="-30%" width="104%" height="160%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceGraphic" operator="dilate" radius="${Math.max(0.5, p.stroke)}" result="d"/>
      <feComposite in="d" in2="SourceAlpha" operator="out"/></filter></svg>`);
```

```js
    const speed = Number(p.speed) || 0, A = Number(p.waveAmplitude) || 0, f = Number(p.waveFrequency) || 0;
    return {
      render(t) {
        for (const r of rows) {
          const x = r.dir * speed * t + A * Math.sin(2 * Math.PI * f * t + r.i * 0.9);
          const off = ((x % uw) + uw) % uw;
          r.strip.style.transform = `translate3d(${(-uw + off).toFixed(2)}px,0,0)`;
        }
      },
    };
```
