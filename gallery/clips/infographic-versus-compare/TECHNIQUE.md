# Versus Comparison

A full-frame "X vs Y" split: two coloured halves slam in along a diagonal seam with a white flash, a VS badge punches in with a decaying shake, then mirrored bars grow from the centre row by row with counting values, winner checkmarks and a running score.

## Use it for
- Product vs product, old vs new, us vs competitor, sports matchups, "option A or B" explainers.
- 3–6 comparable metrics where one side wins most (or a deliberate close fight).
- 7–12 s data beats in reviews and comparison videos; 16:9 and 9:16.

## Avoid when
- More than 2 contenders — use a bar chart or table technique.
- Metrics are not comparable on one bar scale per row (yes/no features are better as a checklist).
- The tone is calm/editorial; the slam + shake is high-energy by design.

## Anatomy
- `.vs` full frame on `#0b0c10`. Two `.half` layers with **`clip-path: polygon`** split along a seam tilted by `seamAngle` (`off = tan(angle) * min(W,H)/2`). Each half is a 3-stop gradient of its colour made with `color-mix(in srgb, c 70%, #fff)` → `c` → `color-mix(c 62%, #000)`, plus a faint diagonal stripe texture (`repeating-linear-gradient`, 3.5 % white) and a giant outlined watermark of the name (Manrope 900, 330 px, transparent fill, 2 px text stroke at 10 %).
- `.flash`: an SVG line exactly on the seam with a white drop-shadow glow.
- `.stage`: a fixed design canvas (1920×1080 or 1080×1920) translated/scaled to fit the frame — all content below is laid out in canvas px.
- **Sides**: icon tile (116 px, radius 34, translucent white, 7 built-in stroke icons or an image), name (Manrope 800, 92 px, auto-shrunk to 760/500 px), subtitle, optional "Wins N" score pill.
- **Badge**: 176 px white circle, Unbounded 900 italic "VS", with a 10 px translucent ring.
- **Rows**: centred dark label pill; on each side a dark track and a white bar (26 px, radius 13) growing outward from the centre (`transform-origin` 100 % / 0 %); value numbers outside the tracks with a check circle in the winner's colour. Row text `Label: left | right | lower` — `lower` flips which value wins.
- Bars are scaled per row to that row's max value; decimals of the input are preserved when counting.

## Motion
- 0.02 s halves slide in from their sides (`xPercent ∓100 → 0`, 0.5 s `expo.out`) — they meet at the seam ~0.24 s.
- 0.24 s seam flash on (0.05 s), fades 0.45 s `power2.out`: the impact frame.
- 0.36 s badge punches from scale 2.2, rotation −12 (0.42 s `expo.out`); from 0.4 s a **decaying shake** in `render`: `exp(-a*9) * sin(a*70)` drives the badge (16 px) and the whole stage (5 px) for 0.5 s.
- 0.35 s icons pop (`back.out(2.2)`), 0.42 s names rise through masks, 0.55 s subtitles, 0.7 s score pills — 0.06 s stagger between left and right.
- Rows from `rows0 = min(1.15, duration*0.2)`, staggered `stg` (0.15–0.42 s, computed from available time): label pill scales in, tracks fade, bars grow 0.75 s `expo.out` at +0.08 s while values count (`expo.out` 0.8 s in `render`).
- At +0.7 s per row: winner check pops (`back.out(3)`), winning value punches 1.12× yoyo, loser bar/value dim to 45 %, and the score ticks (`t >= winT[i]`).
- Hold: watermarks drift apart 14 px/s (parallax secondary motion).
- Exit at `duration - 0.62`: rows fade bottom-up (0.03 s), badge spins out with `back.in(2)`, sides lift, halves slide back out (`power3.in`).

## Adapt to the design system
- `leftColor` → `accent` and `rightColor` → `accent-2` (bind via `token`), `textColor` → `text`. The `#0b0c10` base, `.lbl` pill `#0e1016` and white bars are hard-coded — in an original clip map them to `bg`, `surface` and `text`.
- Fonts: Manrope → `var(--font-display)`, Inter → `var(--font-body)`, badge Unbounded → display font or a heavy italic of it.
- Radius tokens: icon tile 34, pills 29/23, bars 13 — make them consistent with the system.
- 9:16: the clip uses a vertical canvas with names stacked at the top, badge below, rows with label above full-width bars and values at the edges. Keep ≤5 rows.
- Short (≤6 s): fewer rows; `stg` floor is 0.15 s. Long: `stg` caps at 0.42 s, then the hold is the dimmed final state — add a verdict line instead of a long hold.

## Variations
- **Verdict ending**: after the last row, slide the loser half out and let the winner half fill the frame with "Winner: X".
- **Beat slam**: put the halves' meeting on `studio.beat(0)` and each row on the next beats.
- **Vertical seam (0°)** for a calm corporate version; drop the shake, keep the bars.
- **Photo halves**: put product photos as each half's background (clip-path still splits them), dark gradient for legibility.
- **Feature checklist**: replace bars with ✓/✗ per side for non-numeric rows.

## Pitfalls
- Clip-path halves use frame px (`W/2 ± off`), while content uses the scaled stage — keep both in sync if you change the seam.
- Equal values (`win = 0`) get no check; make sure the score logic and copy handle ties.
- Outline watermark via `-webkit-text-stroke` can show inner contours on variable/display fonts (see clip-authoring skill); use an SVG dilate filter if it looks wrong.
- Two saturated colours side by side: check white text contrast on both — very light colours (yellow) need dark text.
- Shake must be deterministic (math of t), never random per frame.

## Reference
Reference implementation: gallery/clips/infographic-versus-compare/ (clip.js, style.css). Key snippet:

```js
    tl.fromTo(hl, { xPercent: -100 }, { xPercent: 0, duration: 0.5, ease: 'expo.out' }, 0.02)
      .fromTo(hr, { xPercent: 100 }, { xPercent: 0, duration: 0.5, ease: 'expo.out' }, 0.02)
      .fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.05 }, 0.24)
      .to(flash, { opacity: 0, duration: 0.45, ease: 'power2.out' }, 0.29)
      .fromTo(badge, { scale: 2.2, opacity: 0, rotation: -12 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.42, ease: 'expo.out' }, 0.36)
```

```js
      render(t) {
        // VS punch shake (decaying), and a subtle camera shake on the stage
        const a = t - 0.4;
        const sh = a > 0 && a < 0.5 ? Math.exp(-a * 9) * Math.sin(a * 70) : 0;
        badge.style.translate = `${(sh * 16).toFixed(2)}px ${(sh * -6).toFixed(2)}px`;
        stage.style.translate = `${(sh * 5).toFixed(2)}px 0px`;
        // watermark drift (parallax secondary motion)
        wmL.style.transform = `translateX(${(-t * 14).toFixed(1)}px)`;
        wmR.style.transform = `translateX(${(t * 14).toFixed(1)}px)`;
```
