# Radial Music Visualizer

A circular, audio-reactive visualizer drawn on one canvas: a spinning vinyl (or round artwork) that pumps on the bass, a mirrored spectrum ring in a rotating colour sweep, loudness glow and particles that rush outward on kicks, with track title and artist below.

## Use it for
- Music uploads, lo-fi loops, DJ/mix promos, "now playing" cards, Spotify-canvas style shorts.
- A transparent overlay ring over a music video or a looping background (`background: 'transparent'`).
- Any moment where the soundtrack itself is the subject.

## Avoid when
- The project audio is speech — a voice level makes the ring twitch without musical rhythm (use the audiogram instead).
- There is no music: it falls back to the synthetic 120 bpm pulse and looks generic.
- You need a frequency-accurate spectrum: this is a **pseudo-spectrum** derived from a single loudness value.

## Anatomy
- `.arv` full-frame wrapper with one `<canvas>` (W×H) and a `.meta` block (title Manrope 800 58u, artist 26u uppercase tracking 0.32em) placed just under the ring: `top = cy + R0 + LEN*0.95 + 26u`. `U = min(W,H)/1080`.
- Geometry from the short side `M0 = min(W,H)`: artwork radius `RA = 0.15·M0`, ring inner radius `R0 = 1.2·RA`, max bar length `LEN = 0.14·M0`. Centre `cy` = 44 % of height (42 % in vertical).
- **Background** (unless transparent): radial gradient from `bg` mixed 18 % with `color2` at the centre → `bg` → black.
- **Glow**: additive (`lighter`) radial gradient whose alpha = `0.18 + 0.4·L`.
- **Particles**: 150 seeded (`studio.random(seed)`) dots, each with angle, phase, base speed `s`, kick gain `k`, size, colour (color1/color3) and twinkle phase. Radius = `(ph·span + s·t + k·E) % span` where `E = ∫ level² dt` — they drift slowly and jump outward whenever the music is loud. Alpha `sin(π·u)` fades them in near the ring and out at the frame edge.
- **Spectrum**: `M = N/2` bins mirrored left/right. Low bins follow loudness `L` (weight `exp(−f/0.16)`), higher bins use a slightly delayed `smooth(t − 0.015 − f·0.12)` × a deterministic sine shimmer × a high-frequency roll-off; then a 1-2-1 blur across neighbours. Drawn twice: a wide 0.35-alpha `lighter` glow pass and a crisp pass. Styles: `bars` (radial strokes), `line` (closed polygon + 14 % fill + base circle), `dots` (stacked dots per bin).
- **Colour sweep**: `createConicGradient(rot − π/2)` with stops color1 → color2 → color3 → color2 → color1, rotating with the ring (`rotationSpeed` deg/s). Falls back to solid color1.
- **Centre**: drop-shadowed disc; artwork clipped to a circle (cover-fit), or `drawVinyl` — dark radial disc, 22 grooves, a **fixed** conic sheen (the record turns under it) and a gradient label rotating at `0.55 rev/s`; white 3u rim.

## Motion
- 0.05–0.8 s: centre disc scales in with `ease.outBack` (overshoot); exits in the last 0.45 s with an `inBack` (anticipation pull-in before vanishing).
- 0.1–1.0 s: ring, glow and particles grow in (`ringIn = outCubic`), ring radius from 0.85·R0; out over the last 0.55 s (`inCubic`).
- 0.45 s: title then artist rise through masks (`yPercent 110 → 0`, 0.8 s `expo.out`, stagger 0.1); leave at `max(1.2, D − 0.5)` (0.35 s `power2.in`).
- Continuous: ring rotation, vinyl label spin, particle drift, twinkle.
- Audio coupling: `L = smooth(t)` = max of the last 9 frames of `studio.level` with `exp(−i/5)` decay (instant attack, ~0.3 s release). Centre pumps `1 + 0.06·L²` (squared = only real kicks register), ring radius `+6u·L`, glow alpha, particle size `1 + 0.6·L`.

## Adapt to the design system
- `color1` binds to the accent token, `color2` to accent-2, `bg` to the bg token; `color3` is not auto-bound — set it from a third palette colour (or reuse accent) in your clip.
- Meta fonts are hard-coded Manrope — use `var(--font-display)` for the title and `var(--font-caption)`/body for the artist.
- 9:16: the ring is sized from the short side so it stays ~60 % of width; `cy` moves to 42 %, leaving the lower half for title/lyrics/CTA. Consider bigger meta type in vertical.
- Long clips: everything except intro/outro is continuous, so length is free; the `energy()` integral is computed from 0 each frame (cost grows with t; fine up to a few minutes).
- Energy of the brand: calm brands → `style: 'line'`, low `sensitivity` (0.7), slow rotation; hype → `bars`, 1.3+, rotation 15–25.

## Variations
- **Transparent ring overlay**: `background: 'transparent'`, no artwork, around a speaker's face or a product.
- **Linear spectrum**: same bin model, laid out along a baseline instead of a circle (for a bottom bar).
- **Beat ripples**: add a ring at each `studio.beats` entry expanding/fading over 0.6 s.
- **Lyric visualizer**: put `studio.words` (current word) under the ring instead of the static title.
- **Album artwork mode**: `artwork` path set — the cover replaces the vinyl and pumps on the bass.

## Pitfalls
- Never draw particles with `rnd()` inside `render` — all randomness is precomputed in setup, positions are functions of `t` and `E`.
- Reset canvas state every frame (`setTransform`, `globalCompositeOperation`, `globalAlpha`) — a leaked `lighter` mode blows out the next frame.
- Too high `sensitivity` saturates every bin at 1 and the ring becomes a static disc; check a loud section with `render_frame`.
- White meta text has no plate: in transparent mode over bright footage it disappears.
- The artwork `<img>` is hidden and drawn with `drawImage` — only after it has loaded (`img.complete && naturalWidth`).

## Reference
Reference implementation: gallery/clips/audio-radial-visualizer/ (clip.js, style.css). Key snippet:

```js
    const fr = 1 / 30;
    const lv = (t) => clamp(studio.level(t));
    const smooth = (t) => { let m = 0; for (let i = 0; i < 9; i++) m = Math.max(m, lv(t - i * fr) * Math.exp(-i / 5)); return m; };
    // ∫ level² dt from 0 (sampled at 30 Hz) → particle "kick" travel
    const energy = (t) => { let e = 0; const n = Math.floor(Math.max(0, t) / fr); for (let i = 0; i < n; i++) { const l = lv(i * fr); e += l * l * fr; } const l = lv(n * fr); return e + l * l * (Math.max(0, t) - n * fr); };
```

```js
        // spectrum (mirrored left/right)
        const raw = [];
        for (let b = 0; b < M; b++) {
          const f = b / (M - 1);
          const bassW = Math.exp(-f / 0.16);
          const lb = smooth(t - 0.015 - f * 0.12);
          const n = 0.5 + 0.5 * Math.sin(b * 2.3 + t * 9.1 + 3 * Math.sin(b * 0.71 + t * 2.3));
          raw.push(bassW * L * 1.05 + (1 - bassW) * (0.18 + 0.82 * lb) * (0.25 + 0.75 * n) * (0.95 - 0.45 * f));
        }
        const v = raw.map((x, i) => clamp(((raw[i - 1] ?? x) + 2 * x + (raw[i + 1] ?? x)) / 4 * p.sensitivity));
```
