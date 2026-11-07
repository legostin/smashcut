# Liquid Glass Name Plate

A frosted "liquid glass" lower third (iOS 26 look): a small glass blob pops in, stretches into the name plate with elastic overshoot, catches one sheen, and melts back into the blob at the end. The glass is faked with layered gradients, an edge highlight, a chromatic fringe and grain.

## Use it for
- Speaker IDs in interviews, podcasts, vlogs, tech and product videos.
- Modern, soft brands (consumer apps, wellness, creator content) where a flat bar would look dated.
- Any overlay that must sit on unknown footage and still read (dark frosted base + text shadow).

## Avoid when
- The brand is flat/brutalist or editorial — the glossy material clashes; use a minimal line or slide plate.
- Very bright, white footage: the plate is a dark frost (`rgba(14,18,28,frost)`); on white it reads as a grey smudge.
- You need to show several facts (name + role + company + handle) — the plate holds two lines.

## Anatomy
- `.lg` anchor positioned in px from the frame size (bottom-left by default); unit `u = min(W,H)/1080 × scale` drives every size via `--u` in CSS, so the plate scales with resolution and the `scale` param.
- `.glass` (the material), absolutely positioned, `overflow:hidden`, layers:
  - background stack: a top-left white radial highlight, a 140° tint gradient (`color-mix` of `--tint` at 34 % / 10 % / 22 %), and a dark base `rgba(14,18,28,var(--frost))` (frost = 0.12 + 0.4 × param);
  - `backdrop-filter: blur() saturate(170%)` (works in the editor over layers below, but is not true refraction of the video);
  - `box-shadow` stack: inset top 1.5 px white edge, inset bottom/left faint edges, **chromatic fringe** (±1.5 px pink and cyan outer shadows), two drop shadows for lift;
  - `::before` = gradient border via the mask-composite trick (`mask: content-box, border-box; mask-composite: exclude`);
  - `.grain` = inline SVG `feTurbulence` data-URI with `mix-blend-mode: overlay`; `.spec` = soft radial specular blob; `.sheen` = skewed (−18°) white gradient band.
- `.content` sits above the glass (z-index 4), same anchor, flex row: optional glowing accent dot + name (Manrope 800, 54u px) + title (Inter 500, 28u px, 80 % white). Text is white with soft shadows.
- **Measure first, then animate the glass to the content box**: content padding is set, `offsetWidth/Height` measured, fonts shrunk if wider than 70 % of W (88 % portrait).
- Placement: landscape bottom at `H − 108u0`, margin 110u0; portrait (`H/W > 1.2`) centred at 80 % of height, margin 60u0. `position` left / center / right flips which side the glass is anchored to.

## Motion
- Intro compression `k = clamp((D − 0.9)/2.4, 0.55, 1)`, applied through `T(x) = x × k`.
- 0.05 s: blob (circle, diameter = 62 % of plate height, born where the accent dot sits) pops `scale 0.3 → 1`, `back.out(2.2)`, 0.45 s.
- T(0.28): height grows to the plate (`elastic.out(1, 0.72)`, T(0.95)); T(0.32): width stretches (`elastic.out(1, 0.55)`, T(1.15)) — width and height on **different elastic curves and start times** is what makes it feel liquid, not scaled. Corner radius eases from pill to 30u (`power3.out`); the anchored side slides to 0.
- T(0.5): accent dot pops `back.out(3)`; T(0.55): name/title rise 10u with `blur(8px) → 0` and fade (`expo.out`, 0.7 s, stagger 0.08).
- T(0.75): sheen sweeps across (1.1 s `power2.inOut`) — one pass only.
- Hold: `render(t)` adds secondary motion — the specular blob drifts `left = −10 + 45 × (0.5 + 0.5 sin(0.7t)) %`, the accent dot's glow breathes with `sin(2.6t)`. Both are pure functions of `t`.
- Exit at `xo = D − 0.78`: text lifts and blurs out (0.26 s, stagger 0.04), dot `back.in(2)`, width collapses to the blob (`power3.in`, 0.42 s) then height/radius (0.38 s, +0.06 s later), finally blob `scale 0.2`, opacity 0 at xo + 0.54. Reverse order of the entrance = clean "melt".
- Not beat-driven.

## Adapt to the design system
- `accentColor` is bound to the `accent` token by the runtime (key-name match); `tint` is not bound — set it from `accent` or `surface` yourself (a light, desaturated tint works best).
- Text colour and fonts are hard-coded (white, Manrope/Inter). In an original clip use `var(--color-text)`, `var(--font-title)` for the name and `var(--font-body)` for the role.
- Radius: the final radius `30u` should come from the system's radius scale; pill brands can keep the blob shape (`borderRadius: ph/2`).
- `frost` is the contrast knob: raise it on busy footage.
- 9:16 is handled (portrait branch, 88 % width, 80 % height line — above the platform UI zone). Keep it out of the bottom 18 %.
- Short clips (≤3 s): `k` compresses the intro to 55 %; below ~2.5 s the elastic barely settles — use a plainer plate.

## Variations
- **Light glass**: white-ish base (`rgba(255,255,255,0.35)`), dark text — for bright footage.
- **Badge**: name only, no title, `showAccent` dot as a live/recording indicator (pulse it red).
- **Glass caption bar**: same material and melt animation for a one-line caption or chapter title.
- **Second line swap**: during the hold, swap title for a handle with a mask rise, the plate re-stretches its width with the same elastic.
- **Center pill**: `position: center` for a call-out above captions.

## Pitfalls
- `backdrop-filter` does not see the video in an exported composite of separate layers — rely on the tint/frost, never on blur, for legibility.
- Animate width/height of the glass, not `scale`, or the border, fringe and radius distort.
- Measure the content after fonts load (`document.fonts.load`) or the plate is sized for fallback metrics.
- Elastic eases overshoot: leave room so the plate doesn't overlap the frame edge or captions at peak stretch.
- `gsap.set` in setup is fine for static placement, but every *animated* change must be on `tl`.
- Too much grain (> 0.2) looks like a compression artefact once the video is encoded.

## Reference
Reference implementation: gallery/clips/lower-third-glass/ (clip.js, style.css). Key snippet:

```js
const g0 = { width: blob, height: blob, borderRadius: blob / 2 };
if (pos !== 'center') g0[side] = Math.max(0, blobInset);
tl.set(glass, g0, 0)
  .fromTo(glass, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' }, 0.05)
  .to(glass, { height: ph, duration: T(0.95), ease: 'elastic.out(1, 0.72)' }, T(0.28))
  .to(glass, { width: pw, duration: T(1.15), ease: 'elastic.out(1, 0.55)' }, T(0.32))
  .to(glass, { borderRadius: R, duration: T(0.55), ease: 'power3.out' }, T(0.3));
if (pos !== 'center') tl.to(glass, { [side]: 0, duration: T(0.6), ease: 'power3.out' }, T(0.32));
tl.fromTo($('.sheen'), { x: -0.5 * pw }, { x: 1.3 * pw, duration: 1.1, ease: 'power2.inOut' }, T(0.75));
if (dot) tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' }, T(0.5));
```

```css
.lg .glass::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: calc(1.5px * var(--u));
  background: linear-gradient(150deg, rgba(255,255,255,.75), rgba(255,255,255,.08) 35%, rgba(255,255,255,0) 60%, rgba(255,255,255,.35));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; z-index: 3; }
```
