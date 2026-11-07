# Countdown 3-2-1

A big number countdown inside a ring that drains over each step, with a flash pulse on every tick and an optional final word that bursts in with rays.

## Use it for
- Before a reveal, launch, drop, giveaway winner or live start.
- Hype intros for streams, events and challenge videos.
- As a beat-locked count-in before the music drop.

## Avoid when
- The video is calm/editorial — a countdown reads as hype or a game show.
- Steps would be shorter than ~0.35 s (e.g. 10 steps in 3 s): numbers become flicker.
- You need a real clock ("2 days left") — use a counter/stat technique instead.

## Anatomy
- `.cd` is a zero-size anchor at the frame centre; every layer is absolutely positioned around it with negative margins.
- `.disc`: 640 px circle behind everything (`discColor`, `discOpacity`, soft drop shadow) so numbers read over any footage.
- `.flash`: 640 px radial-gradient circle in the accent colour (`accent88 → accent00`), re-used for every tick pulse.
- SVG 800×800: 48 tick marks generated in JS (every 4th longer and brighter), a faint full track circle (r 290, stroke 16, 12 % opacity) and the `.arc` circle rotated −90° so it starts at 12 o'clock; the arc length is driven by `stroke-dasharray`.
- One `.n` div per number, all stacked in the same spot (1200 px wide, centred, `tabular-nums`), vertically centred by measuring `offsetHeight` after the font loads (with a small Bebas Neue baseline fix).
- Final word `.final` (uppercase, auto-sized from its length) and a `.burst` of 16 rays (`rotate(i × 22.5deg)`), alternating `accent` / `accent2`.

## Motion
- `step = D / (N + (final ? 1 : 0))` — steps divide the clip duration evenly, so the clip length sets the tempo.
- 0 s: disc + ring scale in `0.4 → 1` (`back.out(1.6)`, ≤0.5 s). The tick ring rotates −30° → 60° linearly over the whole clip (subtle constant motion).
- Each number at `i × step + 0.02`: punches in from `scale 1.8, blur 14px, opacity 0` to sharp (`expo.out`, ≤0.35 s) — it lands like a camera focus pull; at the end of its step it shrinks to 0.55 and fades (`power2.in`, ≤0.18 s).
- Flash on every tick: `scale .7 → 1.35`, opacity `.9 → 0`, `power2.out`, ≤0.6 s.
- Ring drain in `render(t)`: `fill = 1 - inOutQuad((t % step) / step)` → dasharray length; hidden after the last number.
- Final word at `tf = N × step`: disc/ring blow out (`scale 1.25`, fade, `power2.in`), word pops `0.3 → 1` with `back.out(2.2)` (big overshoot), a stronger flash (`scale 2.2`), rays shoot out in two phases (`power3.out` grow then `power3.in` fly-off to +260 px), odd rays delayed by 0.04 s for a crackle. Rays start on an ellipse around the word so they never cross the text.
- Exit: word scales to 1.12 with blur and fades, ending 0.05 s before the clip end.
- Beat sync: set the clip duration to `(N + 1) × 60/bpm` (or two beats per step) and start it on a bar — the even steps then land on beats. For tempo changes, compute `t0` per step from `studio.beat(i)` instead of `i × step`.

## Adapt to the design system
- Intended mapping: `color` → `text`, `accent` (ring, flash) → `accent`, `accent2` (rays) → `accent-2`, `discColor` → `bg`/`surface`. Caveat: the runtime's key-name heuristic binds `color` to the `accent` token (numbers then match the ring) and does not bind `discColor` at all — in your clip use `"token": "text"` / `"token": "surface"` explicitly.
- `font` binds to the display role; numbers must use a face with tabular figures (Inter, Manrope, Unbounded) so they do not shift.
- Swap the disc for the system's surface shape (rounded square for a UI-ish brand) — keep a plate behind the number for contrast.
- 9:16: the 640–800 px assembly fits a 1080 wide frame; reduce `size` to ~240 and keep the final word ≤10 characters (its box is a fixed 1800 px wide and the size heuristic assumes 16:9).
- Short (≤2 s): count from 3 without a final word. Long: don't stretch steps past ~1.2 s — add a final word or a hold instead.

## Variations
- **No ring**: numbers + flash only, with a full-frame colour change per step (inverted bg each tick) for a stomp feel.
- **Digital timer**: replace the ring with a `00:03 → 00:00` mono readout and a progress bar, same per-step logic.
- **Beat count-in**: 4-3-2-1 on beats of the bar before the drop (`studio.beat`), final word on the downbeat marker.
- **Number morph**: exit each number upward through a mask while the next rises from below (line-mask technique) for a calm, premium count.
- **Confetti finale**: replace rays with seeded particles (`studio.random`) computed from `t` in `render`.

## Pitfalls
- All numbers share one position — vertical centring must happen after `document.fonts.load`, or they jump.
- Proportional digits make "1" sit off-centre; use `font-variant-numeric: tabular-nums`.
- Do not use `studio.random` for flicker per frame without a seed; keep the burst deterministic as here.
- Long final words overflow on vertical formats; measure and fit to `studio.width`.
- Many simultaneous moves at the final hit (disc out, word in, flash, rays) work only because they are short and share one origin — don't add more.

## Reference
Reference implementation: gallery/clips/countdown/ (clip.js, style.css). Key snippet:

```js
    nums.forEach((n, i) => {
      const t0 = i * step;
      tl.fromTo(n, { scale: 1.8, opacity: 0, filter: 'blur(14px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: Math.min(0.35, step * 0.4), ease: 'expo.out' }, t0 + 0.02)
        .to(n, { scale: 0.55, opacity: 0, duration: Math.min(0.18, step * 0.2), ease: 'power2.in' }, t0 + step - Math.min(0.18, step * 0.2))
        .fromTo(flash, { scale: 0.7, opacity: 0.9 }, { scale: 1.35, opacity: 0, duration: Math.min(0.6, step * 0.7), ease: 'power2.out' }, t0 + 0.02);
    });
```

```js
    return {
      render(t) {
        // ring drains clockwise over each step
        if (t >= tf) { arc.setAttribute('stroke-dasharray', `0 ${C}`); arc.setAttribute('opacity', 0); return; }
        const local = (t % step) / step;
        const fill = 1 - studio.ease.inOutQuad(local);
        arc.setAttribute('opacity', fill > 0.002 ? 1 : 0);
        arc.setAttribute('stroke-dasharray', `${Math.max(0.001, fill * C)} ${C}`);
      },
    };
```
