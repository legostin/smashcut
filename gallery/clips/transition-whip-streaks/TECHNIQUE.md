# Whip Pan Streaks

A fast graphic whip: seeded horizontal streak bands with motion-smeared fronts and long fading tails rip across, cover the frame completely at D/2 (optional white flash on the cut) and tear away the other side.

## Use it for
- Energetic cuts in promos, sports, gaming, music edits, hype reels — anywhere a real whip-pan would fit.
- Cuts on a beat or a drop (0.4–0.8 s, the cut lands on the hit).
- Linking two shots that move in the same direction (match the whip direction to the camera motion).

## Avoid when
- Calm, emotional or premium storytelling — it's aggressive.
- Viewers are sensitive to flashes (turn `flashAtCut` off) or the edit already has many flashes.
- You need a long cover/title interstitial — use the wipe or wave cover.

## The cut contract
- Every band's leading edge reaches `Lc = 1.04·L` at `inEnd ≤ mid - hold/2` and glides slowly (`gl = 0.06·L`) until `outS ≥ mid + hold/2`; band body (`Lc + gl + 0.03L`) is long enough that the frame is solid from edge to edge throughout → **fully covered at mid = D/2**.
- White flash peaks exactly at `mid` (falls off over ±1.6 design frames) — the flash hides the cut itself.
- Transparent at both ends: `render` clears and returns if `t ≤ 0` or `t ≥ D`.
- Centre the item on the cut: `start = cutTime - D/2`. Default D = 0.6 s → 0.3 s either side.
- The whip motion is capped at `Dm = min(D, 0.9)`; any extra length becomes covered hold around the cut (`hold = max(min(p.hold, D/2), D - Dm)`).

## Anatomy
- One full-frame `<canvas>`; everything is drawn in `render(t)`. No GSAP timeline at all.
- Direction via a canvas transform matrix `xf` (right / left mirrored / down / up swapped axes) — all logic is written for "left → right".
- Bands: N (6–24) seeded heights `0.35 + r²·1.6` normalised to fill the breadth exactly (no gaps); ~50 % `baseColor`, the rest from the 3 streak colours.
- Each band = a linear gradient: transparent tail → solid body → transparent smeared front. The **smear length is velocity-based**: `v` = numeric derivative of the lead position, `smear = clamp(v·0.006, 2, 0.3L)` — fast = long smear, gliding = crisp.
- Per-band jitter (in "design frames" `fr = Dm/18`): start spread `rnd·spread·fr`, in-end and out-start ±1.2 fr — bands arrive ragged, not as a block.
- Speed lines: `1.4·N` thin soft-ended lines with own start/duration and in-out-quad motion, 70 % `color1`.
- Flash: full-frame white `rgba(255,255,255, 0.85·f²)`.

## Motion
- In: `lead = Lc·u^4.2` (a quint-ish expo-in) from `b.s` to `b.inEnd` — the slam.
- Cover: slow glide `Lc → Lc+gl` while covering (keeps the frame alive instead of freezing).
- Out: `expoOut = 1-(1-u)^4.2` from `outS` to `outE` — the tear-away continues in the same direction.
- 18-frame spec: at 0.6 s / 30 fps it's literally 18 frames; spread default 5 frames.
- The derivative-based smear gives automatic motion blur that peaks at the fastest moment — no blur filter needed.

## Adapt to the design system
- Colours: `color1` → `accent`, `color2` → `accent-2`, `baseColor` → `bg`. Keep one very light streak colour (white/off-white) for the "light" in the whip; it pairs with the flash.
- Direction: match the camera move of the outgoing shot (pan left → whip `left`). In 9:16 `down`/`up` use the long axis.
- Durations: 0.4 (frantic) – 0.9 s (still punchy). Beyond 0.9 s you get a covered hold — fine for a beat drop pause.
- Beat: put D/2 on a beat; 0.5 s at 120 bpm = one beat.

## Variations
- **Clean whip**: `speedLines` off, `flashAtCut` off, 8 bands of base colour + one accent — subtle and premium.
- **Vertical whip**: `direction: down` for social cuts between stacked shots.
- **Brand rip**: all three streak colours from the palette, high band count (20+).
- **Double whip**: two items back-to-back with opposite directions for a "whip there and back" gag.
- **Speed-line overlay only**: keep the lines, drop the bands (bandCount minimal + transparent base) as an energy accent over footage.

## Pitfalls
- Hard-coding the cut to an absolute time instead of `D/2` breaks when the user resizes the item.
- Flashes at every cut fatigue viewers; and they're risky for photosensitive audiences.
- Recreating gradients for every band every frame is fine at 14 bands; at 100+ it gets slow.
- Seed everything (`studio.random(p.seed)`); bands drawn with `Math.random` would differ between preview and export.
- Band heights must sum exactly to the breadth (plus the ±0.75 px overlap) or you get hairline gaps at the cut.

## Reference
Reference implementation: gallery/clips/transition-whip-streaks/ (clip.js, style.css). Key snippet:

```js
    // quint-ish curves: fast like expo, but the streak stays visible over more of the window
    const expoIn = (u) => (u <= 0 ? 0 : Math.pow(u, 4.2));
    const expoOut = (u) => (u >= 1 ? 1 : 1 - Math.pow(1 - u, 4.2));
    function lead(b, t) {
      if (t <= b.s) return 0;
      if (t < b.inEnd) return Lc * clamp(expoIn((t - b.s) / (b.inEnd - b.s)), 0, 1);
      if (t < b.outS) return Lc + gl * ((t - b.inEnd) / Math.max(1e-4, b.outS - b.inEnd));
      return Lc + gl + (Lend - Lc - gl) * expoOut(clamp((t - b.outS) / (b.outE - b.outS)));
    }
```

```js
        for (const b of bands) {
          const x = lead(b, t);
          if (x <= 0 || x - body - tail >= L) continue;
          const v = Math.abs(lead(b, t + 0.004) - lead(b, t - 0.004)) / 0.008;
          const smear = clamp(v * 0.006, 2, L * 0.3);
          const x0 = x - body - tail, x1 = x + smear, span = x1 - x0;
          const gr = g.createLinearGradient(x0, 0, x1, 0);
          gr.addColorStop(0, hexA(b.col, 0));
          gr.addColorStop(tail / span, hexA(b.col, 1));
          gr.addColorStop((tail + body) / span, hexA(b.col, 1));
          gr.addColorStop(1, hexA(b.col, 0));
          g.fillStyle = gr;
          const a = Math.max(0, x0), e = Math.min(L, x1);
          g.fillRect(a, b.y - 0.75, e - a, b.h + 1.5);
        }
```
