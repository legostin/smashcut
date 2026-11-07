# Ink Blob Reveal

Organic ink transition on a canvas: noise-edged blots with splatter droplets bloom from seeded drop points, merge (SVG "goo" filter) to cover the frame at D/2, then dissolve through growing ink holes or shrink away.

## Use it for
- Soft, artistic scene changes: lifestyle, wedding, fashion, art, food, travel edits.
- Chapter changes with personality; "paint/ink" brand worlds.
- A brief interstitial word on ink (`label`, Playfair Display) — e.g. a chapter name.

## Avoid when
- Tech/corporate or data stories — reads as decorative; use a band wipe.
- Cuts under ~1 s apart; or durations < 0.8 s (the blots need time to bloom).
- Heavy dark footage with dark ink: the cover reads as a dip-to-black rather than ink.

## The cut contract
- Fully covered from `tCover = half` to `tOut = half + hold`, `half = (D - hold)/2` → centred on **D/2**.
- Blob radius `R = farthest-corner distance × (1.08 + edgeNoise)`, so each blob alone covers the frame at full size — coverage at D/2 is guaranteed regardless of drop positions.
- Transparent at both ends: `render` clears and returns when `t ≤ 0.0001` or `t ≥ D - 0.0001`.
- Centre the item on the cut (`start = cutTime - D/2`), above both shots.
- Long clips: `hold = max(min(p.hold, 0.4D), D - 3.2)` — motion stays ≤ 1.6 s each way, extra time is covered hold.

## Anatomy
- `<canvas>` sized W×H, CSS filter `url(#tibgoo)`: `feGaussianBlur(goo·U)` → `feColorMatrix` alpha `24a − 10` (threshold) → `feComposite atop` the source. Blurring then thresholding makes neighbouring blobs and droplets **fuse like liquid**.
- Drop points (`makeDrops`): a jittered grid (`cols = ceil(sqrt(N·W/H))`), cells shuffled with the seeded RNG — spread out, never clumped.
- Each blob's edge: 72-step polygon whose radius is modulated by 4 harmonics (k = 2,3,5,7, amplitude `(0.5+r)/k`, random phase, slow drift `h.w·t·3`) — a wobbling, living edge.
- Splatter: per blob, `splatter` droplets at random angles/distances that pop in (`outBack`) when the growing edge approaches, each with a smaller satellite droplet, and get swallowed once the edge passes.
- Two-tone: the bleed colour (`color2`) is drawn first with radius + `rim` (26 px × U), then the ink on top — a coloured halo leads the edge.
- Out phase `holes`: fill the frame, then `destination-out` a second set of blobs; `shrink`: blobs shrink in reverse order. Two-tone out uses a scratch canvas per colour so holes reveal the bleed colour first.
- Label: Playfair Display 700, 120 px × `--u`, rises through a mask during the cover.

## Motion
- Blob stagger `st = min(0.12, 0.45·half/(N-1))`; blob i grows from `i·st` and **must be full by tCover**.
- Growth curve `spread(u) = 0.07·outBack(min(1, 5u)) + 0.93·u³`: a quick "plop" (first 7 % of radius with overshoot in the first fifth) then an accelerating spread — like ink hitting paper and soaking.
- With defaults (D 1.6, hold 0.08, 4 seeds): half = 0.76, blobs start 0 / 0.11 / 0.23 / 0.34.
- Out (holes): same `spread` from `tOut` to D; (shrink): `1 - inOutCubic(u)`, reverse order.
- Label: in at `half·0.75` (expo.out), out at `tOut - 0.04` (power3.in).
- Feel: overshoot on the plop (anticipation), droplets ahead of the edge (secondary motion), continuous wobble (never static).

## Adapt to the design system
- Colours: `color1` = ink → bind to `bg` or a dark `text` token; `color2` = bleed → `accent-2` (key `color2` maps there). Label colour → `text`/`bg` in contrast with the ink.
- Type: label → display/title role; serif roles fit the look best.
- Energy of the look: `goo` 0 = crisp vector blobs, 16 = liquid, 30+ = blobby; `edgeNoise` 0.05 (calm) – 0.3 (wild); `splatter` 0 for minimal.
- 9:16: grid adapts (`W/H` in the column count); use 3–5 seeds. Units scale by `U = min(W,H)/1080`.
- Durations 1.2–2 s; the extra length beyond ~3.2 s becomes hold.

## Variations
- **Single drop**: `seeds: 1` placed centre-ish — a classic ink-drop reveal.
- **Ink through to a title**: `hold` 1 s + `label`, `outMode: holes`.
- **Paint splash brand**: `twoTone` with accent bleed + accent-2 ink, high splatter.
- **Watercolour**: lower alpha fill + no goo, multiple overlapping passes.
- **Reverse reveal**: use only the out-phase over a still to dissolve a title card into footage.

## Pitfalls
- The goo filter's `stdDeviation` must scale with resolution (`goo·U`) or 9:16/4K renders look different.
- Canvas must be fully redrawn every `render(t)` (clear + reset transform + composite mode) — the code does this; forgetting `globalCompositeOperation = 'source-over'` after `destination-out` corrupts later frames.
- `seeds` param max is 7, code clamps to 8 — keep within the schema.
- The comment "shifted by `lead` seconds" above `drawIn` is stale: the bleed is a radius offset (`rim`), not a time shift.
- Heavy filters on a full-frame canvas are expensive; keep one canvas, not one per blob.

## Reference
Reference implementation: gallery/clips/transition-ink-blob/ (clip.js, style.css). Key snippet:

```js
    // stagger: blob i starts at i*st and must be full-size by tCover
    const st = Math.min(0.12, (half * 0.45) / Math.max(1, N - 1));
    const grow = (i, t, start, end) => clamp((t - start - i * st) / Math.max(0.05, end - start - i * st));
    const spread = (u) => (u <= 0 ? 0 : 0.07 * ease.outBack(Math.min(1, u * 5)) + 0.93 * u * u * u);

    function blobPath(b, r, t) {
      if (r <= 0.5) return;
      const steps = 72;
      for (let s = 0; s <= steps; s++) {
        const a = (s / steps) * TAU;
        let n = 0;
        for (const h of b.harm) n += h.a * Math.sin(h.k * a + h.ph + h.w * t * 3);
        const rr = r * (1 + p.edgeNoise * 0.55 * n);
        const x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr;
        s ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    }
```

Goo filter (blur + alpha threshold):

```js
wrap.innerHTML = `<svg class="defs"><filter id="tibgoo" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="${gooStd}" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></svg><canvas></canvas><div class="label"><span class="mask"><span class="in"></span></span></div>`;
```
