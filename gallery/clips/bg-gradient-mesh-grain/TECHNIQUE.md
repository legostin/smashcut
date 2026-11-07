# Grainy Mesh Gradient

A full-frame "aurora" background: 3–7 large soft colour blobs drift on seamless-looping Lissajous paths and breathe in size, drawn on a quarter-resolution canvas, blurred, lit by a soft-light pass and covered with seeded film grain and a vignette.

## Use it for
- A premium, calm backdrop behind titles, quotes, product renders, stat cards and talking heads keyed out of their background.
- Brand intros and SaaS/tech videos ("Stripe-style" gradient look).
- Long holds: it loops seamlessly, so any duration works.

## Avoid when
- The brand is flat/brutalist or monochrome print — gradients feel off-brand.
- The foreground has light, thin text over bright blob colours: contrast drops where blobs pass. Keep the base dark or add a plate.
- You need rhythm — this has no beat reaction (see beat-pulse-shapes).

## Anatomy
- `.bmg` wrapper with three layers: `canvas.mesh` (W·0.25 × H·0.25, CSS-upscaled to full frame with `transform: scale(1.06)` to hide blurred edges, `filter: blur(softness·34u px) saturate(1.1)`), `canvas.grain` (full res, `mix-blend-mode: overlay`, opacity `grainAmount·3.3`), optional `.vig` div (CSS radial gradient, edge alpha `0.75·vignette`).
- **Palettes**: `aurora`, `sunset`, `ocean` (fixed base + 6 colours), `mono-brand` (generated from `color1`: lighter/darker shades and ±hue rotations via an HSL helper, base = color1 darkened 86 %), `custom` (`baseColor` + color1–4).
- **Blobs**: placed stratified around an ellipse (radius 0.36 × 0.34 of the frame, every other blob pulled in to 75 %) plus ±6 % jitter — colour zones stay distinct instead of clumping. Each is a radial gradient with stops `0.95 → 0.6 (35 %) → 0.16 (70 %) → 0`, radius 30–50 % of the long side.
- **Light pass**: one white radial gradient (50 % alpha) composited `soft-light`, moving slowly — highlights stay luminous without blowing out.
- **Grain**: 6 seeded 256 px tiles of near-Gaussian noise (sum of three `rnd()`), one picked + offset per grain frame.

## Motion
- No entrance/exit; fully on from frame 0.
- Loop phase `ph = 2π·t / loopSeconds`. Blob position = centre + amplitude · `sin(f·ph + phase)` with **integer** frequencies `fx, fy ∈ {1, 2}` (30 % chance of 2), random direction — so at `t = loopSeconds` every blob is back where it started: seamless loop.
- Breathing radius `1 + (0.08–0.18)·sin(bf·ph + bp)`, `bf ∈ {1,2}`.
- Amplitudes 10–24 % (x) and 9–21 % (y) of the frame × `motion`. At `loopSeconds` 12 the motion is slow and ambient; under 6 s it starts to look busy.
- Grain re-seeded at 15 fps (`floor(t·15)`) when `grainAnimated`, else one static "paper" frame.

## Adapt to the design system
- Use `palette: 'mono-brand'` with `color1` = the accent token for an on-brand gradient from a single colour, or `custom` with bg/surface/accent/accent-2 tokens. Note: `color1` and `baseColor` bind to tokens, but with the default `aurora` palette those params are ignored — switch the palette.
- Keep the base very dark (or very light for light themes) and the blobs mid-saturation; text tokens must pass contrast over the brightest blob.
- `softness` 0.6 is "silky"; 0.2 shows blob shapes (more graphic); 1.0 is almost a flat wash.
- 9:16: everything is relative to the frame, works as is; the blur scales with `min(W,H)`.
- Long durations: set `loopSeconds` to a divisor of the clip length so the last frame matches the first (useful for looping social posts).

## Variations
- **Light theme**: base `#f6f5fb`, pastel blobs, `vignette` 0, grain 0.04 static.
- **Beat breathing**: multiply blob radius by `1 + 0.05·studio.level(t)` for a subtle music response.
- **Spotlight**: a single blob behind the title position, others dimmer — guides the eye.
- **Section colour shift**: crossfade palettes at a `studio.sections` boundary (lerp colours over 1–2 s).
- **Grain-only overlay**: drop the mesh, keep the grain canvas (transparent elsewhere) over footage for a film look.

## Pitfalls
- Integer frequencies are what make the loop seamless — fractional ones cause a jump at the loop point.
- Draw the mesh at low resolution and blur; full-res radial gradients are slow and band visibly.
- Without the `scale(1.06)` the blur darkens/transparent-fades the frame edges.
- The grain cache (`lastGrain`) is keyed only by the grain frame index, so it stays deterministic; do not key it on wall time or on "previous frame".
- Grain overlays text too if the text is in the same clip — put text in a separate clip or above the grain layer.
- `grainAmount` above ~0.15 reads as noise/compression artefacts after YouTube encoding.

## Reference
Reference implementation: gallery/clips/bg-gradient-mesh-grain/ (clip.js, style.css). Key snippet:

```js
        const ph = (TAU * t) / loop;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = pal.base;
        g.fillRect(0, 0, mw, mh);
        const R = Math.max(mw, mh);
        for (const b of blobs) {
          const x = (b.cx + b.ax * Math.sin(b.fx * ph * b.dir + b.px)) * mw;
          const y = (b.cy + b.ay * Math.sin(b.fy * ph + b.py)) * mh;
          const r = R * b.r * (1 + b.br * Math.sin(b.bf * ph + b.bp));
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          const [cr, cg, cb] = b.col;
          gr.addColorStop(0, `rgba(${cr},${cg},${cb},0.95)`);
          gr.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.6)`);
          gr.addColorStop(0.7, `rgba(${cr},${cg},${cb},0.16)`);
          gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          g.fillStyle = gr;
          g.fillRect(0, 0, mw, mh);
        }
```

```css
.bmg canvas.mesh { transform: scale(1.06); }
.bmg canvas.grain { mix-blend-mode: overlay; }
```
