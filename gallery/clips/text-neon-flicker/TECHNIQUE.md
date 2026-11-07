# Neon Sign Flicker

Glowing neon-tube text that powers on with a seeded per-letter flicker, breathes during the hold with one faulty letter that drops out now and then, and cuts off with a warm cooling afterglow — all computed per frame in `render(t)`, no tweens.

## Use it for
- Nightlife, bars, gaming, music, synthwave and retro moments; "open / live / tonight" signage.
- A title on a dark scene or dark footage where light is the subject.
- Any "power on" reveal: a brand word lighting up, a sign in a scene.

## Avoid when
- Bright backgrounds — neon needs darkness; the glow washes out and the unlit tubes vanish.
- Long sentences: the effect is per letter and reads as noise beyond ~15 letters.
- Photosensitive audiences or accessibility-critical content: frame-level flicker can be harsh — lower `flickerIntensity`.

## Anatomy
- `.nf` centred block with padding (70/110/80 px) so the **tube frame** (`.frame`, 5 px border, radius 64 px) surrounds the text.
- `.bloom`: a 1700×1000 radial gradient behind everything whose alpha follows the **average** letter intensity — the room lights up with the sign.
- `.l1` main word and `.l2` subtitle (32 % size, tracking 0.14em, second colour); every non-space character is an `inline-block` `.ch` with its own state.
- **Light model per letter** (intensity `I` 0..1.15):
  - unlit tube colour = neon colour mixed 72 % to dark grey (`[40,40,46]`), shown at 55 % alpha before power-on;
  - lit colour = mix(unlit, white-hot core (colour mixed 78 % to white), I);
  - glow = six stacked `text-shadow`s (2/7/16/34/70/120 px) with alphas × `I × glow`.
- **Determinism**: a custom integer `hash(a, b, c)` seeded by `p.seed` and the **frame number** `f = floor(t*FPS)` decides flicker on/off — frame-quantised, so preview and export match and the flicker never strobes faster than the frame rate. Dropout windows come from `studio.random(seed*7+1)`.
- Fit: shrinks both lines to `studio.width - 440`.

## Motion
- Power-on window `P = clamp(powerOnDuration, 0.3, D*0.35)` (default 1.2 s), starting at `t0 = 0.12`. Unlit tubes fade in over the first 0.25 s (`showOffTubes`).
- Each letter gets a seeded onset inside the first 35 % of `P`; the subtitle comes on `P*0.45` later ("a beat later"). Frame lights at `t0 + P*0.25`, before most letters, with its own flicker.
- Flicker phase (onset → settle): chance of "on" grows with progress `u` (`hash < 0.25 + 0.9u - 0.15fi`), on-level 0.75–1.1, with two classic dead spots at u ≈ 0.18–0.24 and 0.53–0.58 where the letter goes dark.
- Hold: `1 + 0.05 sin(2.6t + 0.35i)` breathing (phase offset per letter) minus a tiny seeded mains hum; the faulty letter drops to 0.05/0.45 for 2–6-frame windows every 0.7–2.1 s.
- Cut-off at `offAt = D - min(0.55, D*0.14)`: all letters to 0 instantly, then a 0.4 s **afterglow** — tubes cool from a warm orange-ish tint (`mix(col, [255,190,150])`) back to unlit; everything fades out in the last 0.2 s.
- There is no GSAP timeline: the `__energy` remap still applies because the runtime remaps `t` before `render`.

## Adapt to the design system
- `color` ← accent, `color2` ← accent-2 (subtitle + frame). Saturated mid-luminance hues work best; very dark tokens give dim neon, white gives no colour.
- Font: thin/regular weights look like tubes (Unbounded 400, Playfair 400, others 500); use the design's display family at a light weight, never 800+.
- Glow strength 0.6–1.4 (shadow radii are px in project space, so they scale with the export).
- 9:16: stack the word over 2 lines (two `.l1`-style rows) and size ~150–180 px at 1080 wide; the 1700 px bloom is wider than the frame, which is fine.
- Short clips (< 2 s): power-on shrinks to `D*0.35`; long (8 s+): more dropouts happen automatically; keep a steady sign by setting `faultyLetterIndex: -1`.

## Variations
- **Beat flicker**: during the hold multiply intensity by `0.85 + 0.15 * studio.level(t)`, or drop the faulty letter on `studio.beats`.
- **Two-state sign**: swap a word mid-hold ("OPEN" → "CLOSED") by cutting one group off and powering the other on with the same flicker model.
- **Outline tubes**: draw letters as SVG strokes (stroke = tube) and apply the same intensity → `drop-shadow` filters for script neon.
- **Background wall**: add a dark brick/plaster texture behind and let the bloom colour it (`mix-blend-mode: screen`).
- **Calm mode**: `flickerIntensity: 0`, `powerOnDuration: 0.5` — a clean fade-up for premium contexts.

## Pitfalls
- Never use `Math.random()` per frame or time-based randomness — hash the frame index with a seed as here.
- Frame-quantise flicker (`floor(t*FPS)`), otherwise sub-frame seeks give different states for the same frame.
- Six large text-shadows per letter are expensive — keep the letter count modest.
- `faultyLetterIndex` counts non-space letters across both lines; an index past the end silently disables it.
- Over light footage add a dark plate or vignette; the unlit tubes rely on contrast.

## Reference
Reference implementation: gallery/clips/text-neon-flicker/ (clip.js, style.css). Key snippet:

```js
function intensity(i, L, t, f) {
  if (t >= offAt) return 0;
  if (t < L.onset) return 0;
  if (t < L.settle) {
    // flicker: frame-quantised on/off with the chance of "on" growing through the window,
    // with classic dead spots around 20 % and 55 % of the sequence
    const u = (t - L.onset) / (L.settle - L.onset);
    if ((u > 0.18 && u < 0.24) || (u > 0.53 && u < 0.58)) return 0.08 * (1 - fi);
    const on = hash(f, i, 21) < 0.25 + u * 0.9 - fi * 0.15;
    return on ? 0.75 + 0.35 * hash(f, i, 5) : 0.06;
  }
  let v = 1 + 0.05 * Math.sin(t * 2.6 + i * 0.35) - 0.025 * hash(f, 0, 9) * fi; // breathing + mains hum
  if (i === faulty) for (const [a, b] of drops) if (t >= a && t < b) v = hash(f, i, 33) < 0.5 ? 0.05 : 0.45;
  return v;
}
```

```js
const off = mix(L.col, [40, 40, 46], 0.72);
const core = mix(L.col, white, 0.78);
let colr, a;
if (I > 0.02) { colr = mix(off, core, Math.min(1, I)); a = 1; }
else if (cool > 0) { colr = mix(off, mix(L.col, [255, 190, 150], 0.5), cool * 0.8); a = Math.max(pre * 0.55, cool); }
else { colr = off; a = (L.onset > t || t >= offAt ? pre * 0.55 : 0.55) * endFade; }
L.s.style.color = css(colr, a);
const k = Math.min(1, I) * G;
L.s.style.textShadow = I > 0.02
  ? `0 0 2px ${css(white, 0.8 * k)}, 0 0 7px ${css(L.col, 0.95 * k)}, 0 0 16px ${css(L.col, 0.9 * k)}, 0 0 34px ${css(L.col, 0.75 * k)}, 0 0 70px ${css(L.col, 0.5 * k)}, 0 0 120px ${css(L.col, 0.3 * k)}`
  : cool > 0 ? `0 0 10px ${css(L.col, 0.25 * cool)}` : 'none';
```
