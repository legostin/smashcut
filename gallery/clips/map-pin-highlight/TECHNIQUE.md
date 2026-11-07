# Country Highlight + Pin (Vox style)

A full-frame explainer map: the camera pushes from a world view into one country, its border draws on, an accent fill wipes across it, a pin drops with a labelled tag, and optionally a second country is added while the camera reframes.

## Use it for
- "Where is this?" beats in explainers, news recaps, documentaries and geography content.
- Introducing a location before cutting to footage from it.
- Comparisons of two neighbouring countries (second country + reframe).

## Avoid when
- You need a route between cities or more than two places — use a route map technique.
- The location is a city block or a building: the bundled outlines are Natural Earth 1:50m, so small countries and islands look coarse when framed tightly.
- The video is not about place; a map is a heavy, full-frame interruption.

## Anatomy
- **World data**: `assets/world.js` sets `window.STUDIO_WORLD = { k, countries[] }` — equirectangular SVG path strings (`x=(lon+180)*k, y=(90-lat)*k`, k = 10), each country with `id` (ISO3), `a2`, English `n`, Russian `ru`, label point `lx/ly` and bbox `bb`. Country lookup accepts ISO3, ISO2, full or prefix name in either language.
- **Map SVG** (full frame `W×H`): sea `rect`, one transformed `<g>` holding a 15° graticule path, all land paths (one `<g>` with shared fill/stroke), a `dim` rect that darkens everything except the highlight, and the highlight layers.
- **Highlight** per country: the country path filled with the accent, clipped by a `clipPath` polygon whose right edge is a slanted line (the wipe); one stroked path per sub-polygon (`d.split(/(?=M)/)`) with `strokeDasharray = L` for the draw-on; a dark inner `shade` stroke for depth.
- **Texture**: static paper fibre (`feTurbulence` + `feColorMatrix`, `mix-blend-mode: multiply`), a half-resolution grain canvas (6 seeded 192 px noise tiles, `overlay`), radial vignette.
- **Screen-space overlay** `.ov` (HTML, scaled by `--u = min(W,H)/1080`): the country name (per-character masks, Manrope 800, tracking 0.2em, uppercase), the pin (SVG teardrop marker, blurred contact shadow, two ripple rings) and the tag plate (dot + text). Their positions are projected every frame with `toScreen(cam, x, y)`, so they stay crisp while the map zooms.
- **Camera** is a pure function `cam(t)` → `{s, x, y}`; `render(t)` sets `translate(...) scale(s)` on the map group and rescales stroke widths by `1/s` so lines keep constant on-screen thickness.
- Three map styles (`paper`, `dark`, `flat`) are palettes in a `STY` object: sea, land, border, graticule, dim, plate colours, paper opacity.

## Motion
Schedule scales with `f = clamp(D/7, 0.4, 1)` so short clips compress instead of breaking (values below at D = 7 s, f = 1):
- 0–0.2 s: tiny pre-push (scale × 1.02) on the world framing — no dead frame.
- 0.2 s → 2.7 s: camera push `camA → camB` (`pushDuration` 2.5 s, capped at 42 % of D), `inOutCubic`. Zoom is interpolated in **log space** and the centre is weighted by `1/s` so the target stays anchored (no "swim" sideways during the zoom).
- 1.7 s: border draws on over 1.0 s (`inOutQuad` on dash offset) — starts at 60 % of the push, so the line appears while still travelling.
- 2.1 s: accent fill wipes left→right with a slanted edge (0.75 s, `outExpo`); the rest of the world dims to 0.9 of `S.dim` over the same window; shade stroke fades in.
- 2.45 s: country name characters rise through masks (`yPercent 115 → 0`, 0.7 s `expo.out`, stagger 0.035 s). The name is auto-fitted to 62 % of the country's on-screen width at final framing (clamped 30–92 px × U) and nudged below the pin if they overlap.
- 2.65 s: pin drops 90 px × U with a bounce (`outBounce`, 0.55 s), contact shadow darkens as it lands; plate wipes open (`clipPath inset` right→left, `expo.out`) at 55 % of the drop, text slides in 24 px at 70 %.
- Ripples: first ring at landing, second 0.75 s later, each repeating every 1.5 s (scale 0.2 → 2.6, fading).
- Optional second country at `max(tPin + dPin + 1, 0.48 D)`: camera reframes to the union bbox over 1.6 s, second highlight draws/fills with the same recipe, name rises at 75 % of the reframe. Skipped automatically if there is not enough time before the exit.
- Hold: after settling, slow push to × 1.035 (`inOutQuad`) until the end.
- Exit (if `exitAtEnd`): last ~0.45 s — names leave upward (0.3 s `power2.in`, stagger 0.015), plate wipes closed to the right (`expo.in`), pin scales to 0 (`inCubic`). The map itself stays, so cut to the next shot.
- Grain changes 12×/s via `studio.random(1000 + floor(t*12))` — deterministic, film-like rather than video-noise.

## Adapt to the design system
- `accent` → `accent` token (fill, border, pin core, tag dot); `accent2` → `accent-2`. Keep a strong red/orange family for "Vox" feel, or the brand accent for a corporate map.
- Map palette (`STY`) is hard-coded per style: in your own clip derive sea/land from `bg`/`surface` tokens (land a few % lighter/darker than sea), plate from `text` on `bg` inverted.
- Fonts: the name and tag use Manrope; switch to `var(--font-display)` for the name and `var(--font-body)` for the tag. Both Cyrillic-safe in the default.
- Everything screen-space is multiplied by `U = min(W,H)/1080`, so 9:16 works: the camera fits `framing` × W and × H, so wide countries (Russia, USA) end up small in vertical — raise `framing` to 0.8–0.9 for 9:16, or frame a region instead of the whole country.
- Short (3–4 s): f compresses everything; drop the second country. Long (10 s+): keep the push ≤ 3 s and let the hold push breathe; add a second country or a caption.

## Variations
- **Region focus**: frame a custom bbox (several countries) and highlight them in sequence with the same draw → fill recipe.
- **Data choropleth**: after the zoom, fill several countries with graded accent opacities from a data param; stagger fills by value.
- **Dark newsroom**: `dark` style, no paper, thin cyan border, tag plate light — for tech/news.
- **City only**: skip the fill, keep border draw + pin + tag; push deeper (`framing` 0.85) for a city-level pin.
- **Pin first, zoom out**: reverse the camera (start at `camB`, end on `camA`) to reveal how far away a place is.

## Pitfalls
- Stroke widths must be divided by the camera scale every frame, or borders become huge at 40× zoom.
- Linear zoom interpolation looks wrong; interpolate scale exponentially and weight the centre by `1/s` (see `lerpCam`).
- The fill wipe polygon only covers the main bbox; the code switches to a giant polygon at `pf >= 1` so islands outside it also fill — keep that if you copy the wipe.
- Countries straddling the dateline (Russia, Fiji, USA with Aleutians) have huge bboxes; framing on them zooms out more than expected.
- Placing HTML labels by projecting map coordinates is a per-frame job (in `render`), not a GSAP tween — tweens only for reveals.
- The ISO/name lookup falls back to USA silently: check the country really resolved.
- Grain must be seeded per time bucket, never `Math.random()` per frame.

## Reference
Reference implementation: gallery/clips/map-pin-highlight/ (clip.js, style.css, assets/world.js). Key snippet:

```js
    const lerpCam = (a, b, e) => {
      const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e);
      // keep the zoom anchored: centre follows the scale change, not the raw time
      const w = Math.abs(b.s - a.s) < 1e-6 ? e : (1 / a.s - 1 / s) / (1 / a.s - 1 / b.s);
      return { s, x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
    };
```

```js
    function drawHighlight(h, c, tDrawS, tFillS) {
      const sw = (2.6 * U) / c.s;
      const pd = prog(tDrawS.t, tDrawS.a, tDrawS.d);
      const e = ease.inOutQuad(pd);
      for (const { pth, L } of h.lines) { pth.style.strokeDashoffset = L * (1 - e); pth.setAttribute('stroke-width', sw); pth.style.opacity = pd > 0 ? 1 : 0; }
      h.shade.setAttribute('stroke-width', (1.2 * U) / c.s);
      const pf = outExpo(prog(tFillS.t, tFillS.a, tFillS.d));
      h.shade.style.opacity = pf * 0.8;
      const { x0, x1, y0, y1 } = h.b, slant = (y1 - y0) * 0.35, pad = (x1 - x0) * 0.15 + slant;
      const xe = x0 - pad + (x1 - x0 + pad * 2 + slant) * pf;
      h.poly.setAttribute('points', `${x0 - pad - slant},${y0 - 200} ${xe + slant},${y0 - 200} ${xe - slant},${y1 + 200} ${x0 - pad - slant},${y1 + 200}`);
      // outside the main bbox (islands etc.): the wide polygon also covers them once pf→1
      if (pf >= 1) h.poly.setAttribute('points', `-99999,-99999 99999,-99999 99999,99999 -99999,99999`);
    }
```
