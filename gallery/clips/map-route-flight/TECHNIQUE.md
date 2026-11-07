# Travel Route / Flight Path Map

A full-frame canvas map (dotted, dark or light world) where a dashed arc draws leg by leg between city pins, a plane (or car/train/ship badge) rides the tangent, distance chips pop at each apex and the camera follows the route before zooming out to the whole trip.

## Use it for
- Travel vlogs ("where we went"), itineraries, tour announcements.
- Logistics and supply-chain explainers, delivery coverage, expansion stories ("from London to Dubai").
- Any multi-stop sequence where distance and order matter.

## Avoid when
- One location is enough — a country highlight + pin is calmer.
- Stops are within one city: the world map at 14× max zoom cannot show streets.
- More than ~6 stops in a short clip: each leg gets `(tB - tA)/n` seconds and the camera starts to whip.

## Anatomy
- **World data**: `assets/world.js` → `window.STUDIO_WORLD = { k, countries, mask }`; country paths are combined into one `Path2D` for the flat styles; `mask` is a base64 bitmap of land cells used to place the dots.
- **One canvas** (`W×H`) redrawn fully in `render(t)`: background (radial gradient for `dots`, sea fill for flat), land, arcs, pins, vehicles. HTML overlay `.ov` holds city chips and distance chips (crisp text, CSS-styled), positioned per frame by projecting map coordinates.
- **Dots style**: land dots on a `dotSpacing`° grid sampled from the mask, drawn in one `beginPath()` (fast); dots near arrived pins (radius 230 px × U growing over 0.8 s) are re-drawn brighter and up to 25 % larger — the "lit up city" effect.
- **Flat styles** (`dark`, `light`): land `Path2D` filled and stroked under `setTransform(scale)`, with world copies at ±360° so routes across the dateline stay on land; radial vignette on top.
- **Legs**: quadratic Béziers; control point = midpoint pushed along the normal by `arcHeight × length`, always bowing north. Longitudes are unwrapped (`±360`) so the shortest way across the Pacific is used. Great-circle km via haversine.
- **Arc drawing**: split the quadratic at the head `h` (de Casteljau: `C1 = A + (C - A) h`, `E = qp(h)`), stroke a 12 px faint glow, then a 4 px dashed line whose `lineDashOffset = -t × 26` makes the dashes march.
- **Vehicle**: plane `Path2D` rotated to `atan2(tangent)` with a drop shadow and an accent tail stripe; other vehicles are glyphs on an accent disc (not rotated).
- **Chips**: city chip = plate with inset accent underline (Manrope 700, 32 px × U); distance chip = accent pill in JetBrains Mono at the arc apex.

## Motion
Schedule scales with `f = clamp(D/8, 0.32, 1)` (values at D = 8 s, 4 stops):
- 0 s: wide camera (`camWide` = 55 % of the whole-route framing).
- 0.27 s: first pin drops with `outBounce` from 46 px × U; its chip opens 0.25 s later (`clipPath inset(0 50% 0 50%) → 0`, 0.5 s `expo.out`, text rises `yPercent 105 → 0`).
- 0.9 s (`tA`): legs start. Each leg gets a slot of `(tB - tA)/n`, draws in 80 % of it with a **sine in-out** head so the plane accelerates out of a city and decelerates into the next.
- Camera keys: `tA` → leg 0 framing, then `LS[i] + 0.3 × legDraw` → leg i framing; between keys `inOutCubic`, scale in log space with the anchored-centre trick (same `lerpCam` as the pin map).
- Distance chip of a leg pops at 55 % of its draw (`opacity/scale 0.7 → 1`, `back.out(2)`).
- Each next pin appears exactly when its leg finishes (`LE[i-1]`), scaling in with `outBack`; chip 0.08 s later. Two pulse rings per pin every 1.8 s (accent for start/end, pin colour for midpoints).
- Vehicle scales in with `outBack` over the first 0.25 s of a leg and shrinks out (`inCubic`) in the last 0.18 s — so it "lands" instead of vanishing.
- `finalOverview`: after the last leg (+0.25 + 1.1 s) the camera pulls back to the whole route, then a slow 4 % push holds until the end.
- No exit: the map holds to the end — cut or transition out.

## Adapt to the design system
- `accent` → route, glow, distance pills, start/end pin cores, chip underline; `pinColor` → pin bodies (binds to `accent` by key name — consider `text`).
- Palettes live in `STY` (bg gradient, land, highlighted land, plate, text, sub): derive from `bg`, `surface`, `text`, `muted` tokens in your own clip.
- Fonts: city names Manrope, distances JetBrains Mono → `var(--font-title)` / a mono or caption role.
- Radius: chip 8 px × U, distance pill 999 px — follow the system's radius.
- All sizes use `U = min(W,H)/1080`, and the camera fits both W and H, so 9:16 works; for vertical prefer north–south routes or lower `arcHeight`, and expect more zoom-out for east–west trips.
- Short (4 s): f shrinks to ~0.5 — limit to 2–3 stops, drop `finalOverview`. Long (12 s+): keep it to ≤ 2 s per leg and add a final hold on the overview.

## Variations
- **Static camera**: `cameraFollow: false` — whole route visible, legs draw in place (good for 9:16 or many stops).
- **Road trip**: `vehicle: car`, `arcHeight: 0` (straight segments), `light` style, distances in mi.
- **Network burst**: one hub to many destinations — draw all legs from the same start with a 0.1 s stagger instead of sequentially.
- **Beat-locked legs**: set `LS[i] = studio.beat(i * 4)` so each leg starts on a bar.
- **Glow trail**: keep the faint 12 px glow only (no dashes) and add a gradient fade behind the vehicle for a premium airline look.

## Pitfalls
- Unwrap longitudes before projecting, or a Tokyo → LA leg goes the long way across the whole map.
- Redraw the entire canvas every `render(t)` (clear/fill first) — never accumulate.
- Dots: batch them into one path; one `fill()` per dot at 1° spacing is tens of thousands of draw calls per frame.
- Rotating text glyphs or the car/ship with the tangent looks wrong; only the plane rotates.
- City chips overlap when stops are close at the current zoom; there is no collision avoidance (the "below" placement branch is disabled in code) — space your stops or shorten names.
- Distance chips sit at the arc apex and can leave the frame when `cameraFollow` frames the next leg — check middle frames.

## Reference
Reference implementation: gallery/clips/map-route-flight/ (clip.js, style.css, assets/world.js). Key snippet:

```js
        legs.forEach((l, i) => {
          const h = legHead(i, t);
          if (h <= 0) return;
          const A = { x: sx(l.a.x), y: sy(l.a.y) }, C = { x: sx(l.c.x), y: sy(l.c.y) }, B = { x: sx(l.b.x), y: sy(l.b.y) };
          // split quadratic at h
          const C1 = { x: A.x + (C.x - A.x) * h, y: A.y + (C.y - A.y) * h };
          const E = qp({ a: A, b: B, c: C }, h);
          g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo(C1.x, C1.y, E.x, E.y);
          g.setLineDash([]);
          g.strokeStyle = p.accent; g.globalAlpha = 0.16; g.lineWidth = 12 * U; g.stroke();
          g.globalAlpha = 1; g.lineWidth = 4 * U; g.setLineDash([11 * U, 9 * U]); g.lineDashOffset = -t * 26 * U; g.stroke();
          g.setLineDash([]);
```

```js
    const legs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      let nx = -dy / L, ny = dx / L;
      if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) { nx = -nx; ny = -ny; } // bow towards the north
      const c = { x: (a.x + b.x) / 2 + nx * L * p.arcHeight, y: (a.y + b.y) / 2 + ny * L * p.arcHeight };
      legs.push({ a, b, c, km: hav(stops[i], stops[i + 1]) });
    }
```
