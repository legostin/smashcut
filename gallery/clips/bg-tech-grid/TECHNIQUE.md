# Blueprint Tech Grid

A "Vercel-style" canvas background: a dot and/or line grid that reveals ring by ring from the centre under a radial fade and a breathing brand glow, with seeded light pulses (comet tails) racing along grid lines and lighting up nearby dots; optional synthwave perspective floor or transparent overlay.

## Use it for
- Behind SaaS, AI, developer-tool and product titles; launch videos; feature cards.
- A quiet "engineered" texture under stats, code, UI mockups.
- Synthwave/retro titles with `perspective: true` (receding floor with a glowing horizon).
- Transparent overlay (`theme: 'transparent'`) over dark footage for a HUD feel.

## Avoid when
- Organic, lifestyle, food or wedding content — the grid reads as "tech".
- Bright busy footage under the transparent mode: 11 % alpha lines vanish.
- The foreground already has a grid/table layout (charts with gridlines) — two grids fight.

## Anatomy
- One `canvas.btg`, all drawing in `render(t)`. Unit `U = min(W,H)/1080`; cell `S = spacing·U` (×2.4 in floor mode).
- **Theme**: `dark` fills `#0a0a0b`, `light` fills `#f6f7f9` (and swaps a white grid colour to near-black automatically), `transparent` draws nothing behind.
- **Glow**: radial gradient at the centre (or at the horizon in floor mode), `glowColor` → `glowColor2` at 35 %, alpha `0.22 + 0.04·sin(0.9t)` (breathing).
- **Lines**: drawn as one-cell segments so each can take its own alpha from `alphaAt()` — that is how the radial fade and the reveal apply to straight lines on a canvas. Lines 11–12 % alpha; dots 38–40 %, radius 1.6u.
- **alphaAt(x,y)** = `reveal × fade`: `reveal` is a ring expanding from the centre over 1.5 s (`outCubic`) with a 3-cell soft edge; `fade` = `1 − smoothstep(0.35·R, R, d)` where `R = fadeRadius · max(W,H) · 0.62`.
- **Pulses**: precomputed in setup (`studio.random(seed)`), `ceil((D+2)·pulseRate)` of them, start times spread evenly `0.7 + k/rate ± jitter`, each 1.1–2.0 s, horizontal or vertical lane, length 8–17 cells, tail 3–6 cells, 65 % in `glowColor`. Head = white→colour radial glow (16u); tail = linear gradient stroke; dots within 2.6 cells of a head brighten and grow (up to ×2) in the pulse colour.
- **Floor mode**: projection `z = 1 + y/DEPTH`, screen = `(cx + (x−cx)/z, hz + (H−hz)/z)` with horizon at 46 % height; lines use `glowColor`, sky/floor gradients, a white glowing horizon line (shadowBlur 24u) that fades in over 1.2 s; the grid scrolls toward the camera.

## Motion
- 0–1.5 s: the grid "draws in" as an expanding ring from the centre (floor mode: from the bottom edge up to the horizon).
- First pulse at ≈0.7 s, then `pulseRate` per second. Each pulse moves with a sine ease-in-out along its lane (`sine(u)`), alpha `sin(π·u)` so it fades in and out — no hard pops.
- Continuous drift: `offX = t·drift·22u`, `offY = t·drift·12u` (mod one cell → seamless). Floor: `t·drift·6·S` toward the camera.
- No exit: let the next scene cut or transition over it.

## Adapt to the design system
- `glowColor` binds to accent; `glowColor2` to accent-2; `color` (grid) to `accent` by the name heuristic — set it explicitly to the text/muted token, a coloured grid looks cheap. Replace the hard-coded `#0a0a0b` / `#f6f7f9` fills with `bg` token values in your own clip.
- `spacing` 40–56 for dense "blueprint"; 80–120 for a calmer macro grid. Dots-only is the most minimal.
- 9:16: the fade radius uses `max(W,H)`, so in vertical the visible grid becomes a tall ellipse-ish area — lower `fadeRadius` (0.6) to keep focus in the middle 60 %.
- Short clips (< 2 s): the reveal takes 1.5 s; start the clip earlier or set reveal shorter in your version. Long clips: pulses keep coming (count scales with D).

## Variations
- **Beat pulses**: spawn pulses at `studio.beats` instead of a constant rate.
- **Focus hole**: invert the fade (bright edges, empty centre) so a title sits on clean background.
- **Cursor trail**: a single pulse that follows a UI cursor path, brightening the grid where it moves.
- **Static texture**: `pulseRate: 0`, `drift: 0` — a pure blueprint plate behind data.
- **Synthwave**: `perspective: true`, magenta/cyan glows, add a sun disc above the horizon.

## Pitfalls
- Drawing each line in one stroke ignores the radial fade — segment it (or mask with a gradient) as the reference does.
- Pulses must be precomputed with seeded randomness; spawning them "when the previous ends" requires state and breaks seeking.
- Too many pulses (> 3/s) turns into noise; 1–2/s reads as "data flowing".
- Floor mode with a light theme loses the neon horizon; keep floor for dark themes.
- Per-frame cost grows with dots × active pulse heads; very small `spacing` (24) at 4K is slow.

## Reference
Reference implementation: gallery/clips/bg-tech-grid/ (clip.js, style.css). Key snippet:

```js
        const reveal = ease.outCubic(clamp(t / 1.5)) * Rmax * 1.08 + S;
        const alphaAt = (sx, sy, k) => {
          const d = floor ? Math.abs(sx - cx) * 0.6 + Math.abs(sy - H) * 0.5 : Math.hypot(sx - cx, sy - cy);
          const rv = clamp((reveal - (floor ? Math.abs(sy - H) * 1.3 + Math.abs(sx - cx) * 0.3 : d)) / (S * 3));
          const fade = floor ? clamp(k * 1.25 - 0.08) * (1 - smooth(W * 0.5, W * 0.72, Math.abs(sx - cx))) : 1 - smooth(Rfade * 0.35, Rfade, d);
          return rv * fade;
        };
```

```js
        for (const [A, B, f, c] of pulseGeo) {
          const al = alphaAt(A[0], A[1], A[2]) * f;
          if (al < 0.01) continue;
          const lg = g.createLinearGradient(B[0], B[1], A[0], A[1]);
          lg.addColorStop(0, rgba(c, 0)); lg.addColorStop(1, rgba(c, al));
          g.strokeStyle = lg; g.lineWidth = 2 * U * (floor ? Math.max(0.4, A[2]) : 1);
          g.beginPath(); g.moveTo(B[0], B[1]); g.lineTo(A[0], A[1]); g.stroke();
          const hr = 16 * U * (floor ? Math.max(0.4, A[2]) : 1);
          const hg = g.createRadialGradient(A[0], A[1], 0, A[0], A[1], hr);
          hg.addColorStop(0, rgba([255, 255, 255], al)); hg.addColorStop(0.25, rgba(c, al * 0.8)); hg.addColorStop(1, rgba(c, 0));
          g.fillStyle = hg; g.fillRect(A[0] - hr, A[1] - hr, hr * 2, hr * 2);
        }
```
