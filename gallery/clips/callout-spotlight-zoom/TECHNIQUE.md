# Spotlight Focus

Dims the whole frame with a feathered scrim and opens a rounded (or circular) spotlight that glides from one target region to the next, each with an outline ring, a connector line and a label card.

## Use it for
- SaaS walkthroughs and tutorials: "click here", "this is where you export", step 1 → 2 → 3 over a screen recording or screenshot.
- Directing attention to one area of a busy frame (dashboard, map, photo of a group).
- Feature tours where each stop has a short title + one line of explanation.

## Avoid when
- The target moves inside the footage (the hole is static per stop).
- There's only a quick "look here" with no label — an arrow or hand-drawn circle is lighter.
- The footage is already dark: a 66 % dim on dark footage removes all context; lower `dimOpacity`.

## Anatomy
- One full-frame SVG:
  - `<mask>`: a white full-frame rect plus a black `.hole` rect (with `feGaussianBlur` = feather) — the scrim is visible everywhere except the hole.
  - `.scrim` rect in `scrimColor`, masked; its opacity = `dim × dimOpacity`.
  - `.glow` (10 px accent stroke, breathing opacity) and `.ring` (3 px accent stroke, `pathLength="1"` so it can be drawn on with a 0..1 dasharray).
  - `.links` group: per target a connector `<line>` (also `pathLength=1`) and an accent dot with a white stroke at the ring edge.
- Cards are HTML divs (dark or light glass: `rgba(24,28,38,.96)`, 1 px light border, big soft shadow, 22 px radius), with a JetBrains Mono step badge (`01`, `02`), a Manrope 700 38 px title and Inter 500 25 px body at 0.68 opacity. Title/body sit in `.mask` (overflow hidden) rows. `text-wrap: balance`.
- Everything is scaled by `S = min(W,H)/1080`; cards are `transform: scale(S)` from the top-left.
- Card placement: `labelSide: auto` tries right → left → below → above by available room inside title-safe (5 % / 7 %), then clamps into the safe area; the connector endpoints are clamped so the line stays straight and inside both the ring and the card.
- Key idea: the hole geometry is a **proxy object** `st = {x,y,w,h,r,dim,ring,glow}` tweened on `ctx.tl`, and `render(t)` copies it onto the SVG attributes. GSAP interpolates plain numbers; the SVG stays simple.

## Motion
- Hole starts as a rect bigger than the frame (`big`), so the first move is a "closing in" from everywhere.
- 0.1 s: scrim dims in (0.35 s `power1.out`).
- Each stop `i` starts at `0.1 + i*seg` (seg = available time / N, or `holdPerTarget + 0.8`): hole morphs to the target in `min(0.8, seg*0.42)` s — `expo.inOut` for the first (dramatic close-in), `power3.inOut` for the glides between targets (smooth camera-like move).
- First stop only: ring draws on (0 → 1, 0.55 s `power2.inOut`) at 70 % of the morph.
- Card in at 72 % of the morph (overlap, the card arrives while the hole is still settling): connector draws (0.35 s `power2.out`), dot pops (`back.out(3)` — the overshoot), card slides 22 px from the direction of its side and fades in (0.6 s `expo.out`), then step / title / body rise from `yPercent 105` with 0.06 s stagger.
- Card out 0.08 s before the next stop: card slides further 14 px and fades (0.25 s `power2.in`), line retracts by dashoffset to −1 (draws away from the ring), dot shrinks.
- Exit (`duration - 0.6`): ring undraws, hole expands back to `big` (0.55 s `power3.in`), scrim fades.
- Secondary motion during holds: glow opacity breathes with `sin(t·π·1.2)`.
- Very short clips keep only `floor((duration-0.75)/1.5)` targets (≥1.5 s per stop).

## Adapt to the design system
- `accent` → `accent` token (ring, connector, dot, step badge); `scrimColor` → `bg` token (a tinted scrim feels branded, pure black feels generic).
- `cardTheme` light/dark should follow the design's surface; in an original clip use `var(--color-surface)`, `var(--color-text)`, `var(--font-title)`, `var(--font-body)`, and the design radius for both the card and the hole (`radius` param).
- Motion: the hole glide is the signature move — use `studio.design.motion('emphasis')` ease/duration for it.
- 9:16: targets are % of frame; `auto` side will mostly pick below/above — make cards narrower (max-width ~80 % width) and keep them out of the bottom 18 %.
- Long clips: set `holdPerTarget` so each stop stays ~2–4 s, matching VO; for short clips use one target.

## Variations
- **Circle spotlight**: `| circle` per target for faces, buttons, map points.
- **No card / ring only**: hide the card (no title/body, `stepNumbers:false`) for pure focus pulls.
- **Zoom into the spotlight**: combine with an `item.transform` scale on the footage track at each stop for a real push-in.
- **Numbered tour**: step badges + a progress row ("2 / 4") in the corner.
- **Blur scrim**: instead of a colour scrim, render a blurred copy of the footage outside the hole (needs the footage inside the clip as `<video data-start>`).

## Pitfalls
- Feather extends outward (`e = feather*0.75 + pad*0.5`) so the interior stays crisp — if you feather the hole itself, the edge of the target looks foggy.
- Cards measured with `offsetWidth` before `scale(S)` — multiply by S when computing space; forgetting it misplaces cards at non-1080 resolutions.
- Long titles in a 600 px card wrap to 3 lines and cover neighbouring UI — keep titles ≤ 4 words.
- Tweening SVG attributes directly with many filters is slow; the proxy + render pattern avoids layout churn.
- Moving between far-apart targets in < 0.4 s reads as a jump cut; keep morph ≥ 0.5 s.

## Reference
Reference implementation: gallery/clips/callout-spotlight-zoom/ (clip.js, style.css). Key snippet:

```js
    const st = { x: big.x, y: big.y, w: big.w, h: big.h, r: big.r, dim: 0, ring: 0, glow: 0 };
    tl.to(st, { dim: 1, duration: 0.35, ease: 'power1.out' }, tIn);
    targets.forEach((tg, i) => {
      const s = tIn + i * seg;
      const md = Math.min(morph, seg * 0.42);
      tl.to(st, { x: tg.x, y: tg.y, w: tg.w, h: tg.h, r: rad(tg), duration: md, ease: i === 0 ? 'expo.inOut' : 'power3.inOut' }, s);
      if (i === 0) tl.fromTo(st, { ring: 0 }, { ring: 1, duration: 0.55, ease: 'power2.inOut' }, s + md * 0.7);
```

```js
      render(t) {
        const e = feather * 0.75 + pad * 0.5; // feather falls off outside the ring, interior stays clean
        hole.setAttribute('x', st.x - e); hole.setAttribute('y', st.y - e);
        hole.setAttribute('width', Math.max(0, st.w + e * 2)); hole.setAttribute('height', Math.max(0, st.h + e * 2));
        hole.setAttribute('rx', Math.max(0, st.r + e)); hole.setAttribute('ry', Math.max(0, st.r + e));
        scrim.setAttribute('opacity', (st.dim * p.dimOpacity).toFixed(3));
```
