# Breaking News Strap

A broadcast lower-third package: an angled accent "BREAKING" block that 3D-flips to an alternate label, a white headline bar, a navy subheadline bar with a running clock, LIVE and location chips and a channel cube — unfolding left-to-right with light sweeps and retracting in reverse.

## Use it for
- News-style commentary, announcements, "this just in" moments, parody bulletins.
- Any lower third that must feel urgent and official rather than personal.
- Over footage (transparent background), 16:9 bottom-left or top; works in 9:16 at 20 % from the bottom.

## Avoid when
- A calm interview speaker ID — use a minimal lower third; this one shouts.
- Brands that must not look like TV news, or serious real news (do not imitate a real channel's branding).
- Headlines longer than ~70 characters: it shrinks to 36u and then wraps to 2 clamped lines, which looks crowded.

## Anatomy
- `.bn` absolutely positioned at `left: margin` (96u, 56u vertical), `bottom: 92u` (or `top`, or 20 % of height in vertical). `U = min(W,H)/1080`; all CSS uses `calc(Npx * var(--u))`. Inter for text, JetBrains Mono for the clock, Unbounded for the channel number.
- **Chips row** (above): LIVE (accent bg, white dot with a 1 Hz ring pulse) and location (dark glass with an accent ring pin), 44u tall, uppercase 22u.
- **Row 1** (92u tall, drop shadow): `.blk` — accent vertical gradient (`color-mix` lighter top/darker bottom) with an angled right edge via `clip-path: polygon(..., calc(100% - 30u) 100%, ...)` and a 1 px top highlight; inside a `perspective` box holding `.flip` with two faces (`backface-visibility: hidden`, second face pre-rotated `rotateX(180deg)`). `.hl` — white-to-grey gradient bar with navy 800 50u text, tucked 30u under the block (`margin-left: -30u`). `.logo` — 92u navy cube with an inset accent left edge.
- **Row 2** (56u): navy bar with the subheadline (ellipsis on overflow) and a darker clock cell `HH:MM` with a blinking colon.
- **Sweeps**: skewed white gradient bands (`soft-light` on the block, normal on the headline) translated across with `xPercent`.
- **Measured layout**: block width = widest label face; headline font shrinks 50u → 36u to fit `W − 2·margin − block − logo`, then switches to a 2-line clamp; row 2 width = row 1 width; subheadline shrinks 30u → 22u.
- **Clock**: `startTime` parsed as `HH:MM(:SS)`, displayed as `floor(start + t) % 86400` — deterministic, no `Date`.

## Motion
All entrance times are scaled by `f = clamp(D/4, 0.55, 1)` so short straps unfold faster.
- 0.05: block grows `scaleX 0 → 1` from the left (0.4 `expo.out`); 0.18: label rises from `yPercent 110`.
- 0.22: headline bar wipes open with `clipPath inset(0 100% 0 0) → inset(0 0 0 0)` (0.65 `expo.out`); 0.4: headline text rises.
- 0.25: block sweep; 0.45: long headline sweep (1.1 s `power2.inOut`) — the "light catching glass" detail.
- 0.42: row 2 wipes; 0.58: subheadline rises; 0.7: clock slides in from −20u.
- 0.55: logo cube pops `scale 0.4 → 1`, `rotationY −90 → 0` with `back.out(1.6)` (the only overshoot — draws the eye to the brand).
- 0.62: chips rise + wipe, stagger 0.08.
- Hold: every `flipEvery` s (from 0.6 + flipEvery until `outAt`) the label flips `rotationX −180·k` (0.7 `power3.inOut`) with a sweep 0.1 s later.
- Exit at `outAt = D − 0.52`, reverse order and faster (0.2–0.32 s, `power2.in` / `expo.in`): chips → sub + clock → headline text → logo → row 2 → headline bar → label → block collapses last, finishing before D.

## Adapt to the design system
- `palette`: `red` (#e3172b), `blue` (#0a5bd8) or `custom` → `accent` param (bound to the accent token, but only used when palette = custom). `navy` binds to the bg token by name — in your own clip use `var(--color-accent)` for the block and `var(--color-surface)`/`bg` for the bars.
- Keep the white headline bar (or the system's lightest surface) for maximum legibility over footage; the dark text on it should be the bg token.
- Radius: everything is square (4u on chips) — that is the broadcast look; rounding it makes it feel like an app.
- 9:16: margin 56u, positioned 20 % from the bottom (above platform UI); headline will wrap more — keep headlines ≤ 40 chars.
- Short (≤ 4 s): flips are skipped automatically when there is no room; long (10 s+): flips keep it alive; consider cycling headlines too.

## Variations
- **Headline cycler**: several headlines in the white bar, each replaced with a mask rise every N seconds (same as the label flip).
- **Top strap**: `position: 'top'` for "LIVE from …" event overlays.
- **Sports/finance**: replace the location chip with a score or a ticker value; replace the clock with a game clock.
- **No-label minimal**: drop the block and chips, keep the headline + sub bars for a documentary caption.
- **Beat-locked**: put the block hit on `studio.beat(0)` and the flips on bars (`studio.bars`).

## Pitfalls
- The clock must be derived from `t` (plus a start time) — never `new Date()`.
- Measure text after fonts are loaded and before animating; clip-path wipes hide but do not change layout, so measuring works.
- A 3D flip needs `perspective` on the parent, `transform-style: preserve-3d` and `backface-visibility: hidden` on both faces, or both labels show mirrored.
- The headline sweep crosses the text; keep its alpha moderate so the text stays readable during the sweep.
- Exits must be computed from `D` (the reference uses `D − 0.52`) or a shortened item cuts the strap mid-retract.
- Too many simultaneous moves at entrance: here they are staggered 0.05–0.7 s; do not compress them all to 0.

## Reference
Reference implementation: gallery/clips/broadcast-breaking-news/ (clip.js, style.css). Key snippet:

```js
    // 3D label flips (+ a sweep with each flip) during the hold
    const flip = $('.flip');
    if (p.altLabel && p.altLabel !== p.label) {
      let k = 1;
      for (let at = T(0.6) + p.flipEvery; at + 0.7 < outAt; at += p.flipEvery, k++) {
        tl.to(flip, { rotationX: -180 * k, duration: 0.7, ease: 'power3.inOut' }, at)
          .fromTo('.blk .sweep', { xPercent: -120 }, { xPercent: 420, duration: 0.8, ease: 'power2.inOut', immediateRender: false }, at + 0.1);
      }
    }
```

```css
.bn .blk { position: relative; z-index: 2; flex: none; transform-origin: 0 50%; overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 82%, #fff) 0%, var(--acc) 42%, color-mix(in srgb, var(--acc) 78%, #000) 100%);
  clip-path: polygon(0 0, 100% 0, calc(100% - 30px * var(--u)) 100%, 0 100%); }
.bn .blk::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 1px; background: rgba(255,255,255,0.45); }
.bn .persp { position: absolute; inset: 0; perspective: calc(600px * var(--u)); }
.bn .flip { position: absolute; inset: 0; transform-style: preserve-3d; }
.bn .face { position: absolute; inset: 0; display: flex; align-items: center; padding-left: calc(34px * var(--u)); padding-right: calc(64px * var(--u)); backface-visibility: hidden; font: 900 calc(44px * var(--u))/1 'Inter', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; }
.bn .f2 { transform: rotateX(180deg); }
```
