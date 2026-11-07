# Beat-Pulse Geometric Background

A full-frame canvas background of drifting outline/filled geometric shapes on a staggered grid that pulse in a ripple from the centre on every beat, with shockwave rings on each bar and a breathing hexagon "speaker" in the middle.

## Use it for
- Behind titles, countdowns and promo copy cut to music.
- Music videos, event/party promos, gaming intros — anything where the beat should be visible.
- Filling the frame under a transparent title technique when you have no footage.

## Avoid when
- Calm, corporate or documentary tone — a constantly pulsing field reads as "party".
- There is busy foreground text with thin strokes: the shapes compete with it. Lower `intensity` or dim the field.
- Speech-only projects without music: it falls back to a 120 bpm grid that has nothing to do with the audio.

## Anatomy
- One `<canvas class="bps">` at project resolution; everything is drawn in `render(t)` (no GSAP).
- **Beat grid**: `studio.beats` / `studio.bars` (clip-local, sorted). Fallback: a steady grid at `studio.bpm` starting 32 beats before the clip; bars = every `beatsPerBar`-th beat.
- **Envelope**: `env(arr, t, decay) = exp(−(t − lastBeat) · decay)` via a binary search `lastBefore` — an instant hit with exponential decay. This is the whole "beat-reactive" trick, and it is stateless.
- **Background**: diagonal linear gradient `bg1 → bg2`; a centre radial glow in `c1` at alpha `0.12 + 0.16·beat`; a dark vignette (0 → 0.55 alpha from 45 % to 100 % of the half-diagonal) drawn last.
- **Shapes**: a `cell`-sized grid (`density` param) with odd rows offset half a cell, 18 % of cells skipped for air. Each shape is seeded (`studio.random(seed)`): kind (circle / square / triangle / plus), colour from `[c1,c2,c3]`, size 16–30 % of the cell, rotation, spin, 22 % filled (rest stroked at `cell·0.022` px).
- **Centre hexagon**: two nested hexagons (outer `c2` 6 px rotating +0.25 rad/s, inner `c1` 3 px rotating the other way), radius `min(W,H)·(0.16 + 0.05·beat + 0.03·bar)`.

## Motion
- No entrance/exit — it is a background and is fully on from frame 0. Fade it with the item opacity or put a transition over it.
- **Ripple**: each shape reads the beat envelope at `t − (distance/maxD)·0.22`, so a pulse reaches the corners 0.22 s after the centre — the wave travelling outward is what makes it feel musical rather than flashing.
- Per shape on a beat: scale `1 + 0.55·e·intensity`, extra rotation kick `±0.4·e`, alpha `0.28 → 0.88` (weaker towards the edges).
- **Drift** (`drift` param): every shape floats upward at 14 px/s × drift and wraps vertically (period = rows·cell), bobs on a sine (±8 % cell) and sways horizontally (±6 % cell), all phased per shape.
- **Bar shockwaves**: for the last two bars, a ring grows `60 + age·1100` px over 2.2 s, thinning from 12 px to 2 px and fading; alternate colours `c2/c3`.
- `decay` controls snappiness: 7 ≈ a punchy pulse that dies within a beat at 120 bpm; 3 = soft swell; 12+ = strobe-like.

## Adapt to the design system
- `bg1/bg2` bind to the bg token (bg1) — set `bg2` to the surface token or a darker accent tint. `c1/c2` bind to accent / accent-2; `c3` to a third brand colour or `text` at low alpha.
- Keep the background darker than the foreground title by ≥ 4.5:1 contrast; if the title uses the accent, use only neutrals + accent-2 for shapes.
- Restrict `kind` to 1–2 shapes that match the brand (circles for soft brands, squares/plus for tech).
- 9:16: the grid fills any aspect, but the ring radius and line widths are fixed px — fine at 1080 wide; scale `60 + age*1100` by `min(W,H)/1080` if you change resolution.
- Long durations: fine (it is periodic). For very short clips (< 2 beats) the pulse is barely noticed — sync the clip start to a beat.

## Variations
- **Level-driven**: replace `env(beats, ...)` with `studio.level(t − delay)` for real loudness rather than a grid.
- **Section moods**: switch palette or `decay` per `studio.sections` (calm intro, hard drop).
- **Single-shape field**: only circles, all filled, low alpha — a soft bokeh pulse behind talking heads.
- **Off-beat accents**: a second envelope on beats offset by half a beat driving only the filled shapes.
- **Logo centre**: replace the hexagons with the brand mark scaled by `1 + 0.05·eb`.

## Pitfalls
- Do not keep "last pulse" state between frames — compute everything from `t` (the reference's `lastBefore` + `exp` is seek-safe).
- Reset `globalAlpha` / `globalCompositeOperation` before each frame's background fill.
- `intensity` > 1.4 with small `density` = visual noise; pulse amount and shape count trade off.
- Beats before the clip start are negative — keep them (the fallback grid includes 32 negative beats) so the first frame is not dead.
- Nothing scales with resolution except the grid: ring sizes and hexagon strokes are absolute px.

## Reference
Reference implementation: gallery/clips/beat-pulse-shapes/ (clip.js, style.css). Key snippet:

```js
    const lastBefore = (arr, t) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
    const env = (arr, t, decay) => { const i = lastBefore(arr, t); return i < 0 ? 0 : Math.exp(-(t - arr[i]) * decay); };
```

```js
        for (const s of shapes) {
          const d = Math.hypot(s.x - cx, s.y - cy);
          const e = env(beats, t - (d / maxD) * 0.22, p.decay);
          const bob = Math.sin(drift * 0.9 + s.ph) * cell * 0.08;
          const x = s.x + Math.cos(drift * 0.3 + s.ph) * cell * 0.06, y = s.y + bob - drift * 14;
          const period = rows * cell;
          const sc = 1 + 0.55 * e * I;
          g.save();
          g.translate(x, ((((y + cell) % period) + period) % period) - cell);
          g.rotate(s.rot + drift * s.spin + e * 0.4 * I * (s.spin > 0 ? 1 : -1));
          g.globalAlpha = 0.28 + 0.6 * e * I * (1 - d / maxD * 0.5);
          shape(s, s.size * sc);
          if (s.filled) { g.fillStyle = s.col; g.fill(); } else { g.strokeStyle = s.col; g.stroke(); }
          g.restore();
        }
```
