# Speaker Announcement Card

A full-frame editorial bento grid announcing a person: arch-masked photo, name, role, talk title, date/time and event cells that clip-reveal one after another, a rotating text sticker, and a reverse collapse at the end.

## Use it for
- Conference, webinar, meetup, podcast-guest and livestream announcements.
- Any "who / what / when / where" card with 4–6 pieces of structured info.
- Social posts in both 16:9 and 9:16 (each is composed separately, not just rescaled).

## Avoid when
- There is only a name + role — a lower third is lighter and doesn't hide the footage.
- More than ~6 data fields: bento cells get cramped and text shrinks below legibility.
- The photo is a wide group shot: the arch mask is built for a single portrait.

## Anatomy
- `.sk` full-frame container painted `--bg`; `u = min(W,H)/1080` scales everything. `portrait = H/W > 1.2`.
- **Grid in px**: margin `M` (64u / 54u portrait), gap `G = 18u`, five rects A–E computed explicitly. 16:9: A = tall photo column (≤ 36 % width), B = name cell (53 % height), bottom row split into C (talk, 57 %) and stacked D (date, accent fill) / E (event). 9:16: photo + D/E column on top (40 % height), B and C full width below.
- **Cells**: `.cell` absolutely placed, radius 30u, `--cell` fill, `overflow: hidden`; `.cell.acc` uses the accent with an auto-contrast text colour `onAccent` (luminance > 0.6 → near-black, else white).
- **Photo**: inset 26u inside A, arch shape via `border-radius: 999px 999px 22u 22u`, image as `background-image` (cover, 50 % 30 %), or an SVG silhouette + accent radial glow placeholder.
- **Text**: name split into first word / rest as two lines (Unbounded 800, ~110u, -0.035em); eyebrow and time as outline pill chips (`inset box-shadow` in `currentColor`); talk title Manrope 700 with `text-wrap: balance`; date as big Unbounded uppercase.
- **Sticker**: SVG disc with text on a circular `textPath`; the phrase is repeated to fill the ring and the font size is re-fitted with `getComputedTextLength()` against `2π·78`.
- **Fit pass**: `fitW` shrinks name/date/event to the cell's inner width; the talk title shrinks by 0.92 steps (max 10 tries) until label + title fit the cell height.
- Palettes `ink` / `paper` / `cobalt` define bg, cell, fg, accent, placeholder colours.

## Motion
- Build compression `k = clamp((D - 1.2) / 3, 0.5, 1)`; cell `i` starts at `T(0.1 + i*0.09)`.
- Each cell reveals with `clip-path: inset(... round 30u)` from a different side (A from top, B from right, C from top, D from left, E from bottom) to `inset(0)`, 1.0 s `expo.out` — directional variety without extra moves.
- Photo image scales 1.18 → 1 over 1.8 s `expo.out` with A's reveal (counter-zoom inside the mask).
- B: name lines rise through SplitText line masks (`yPercent 105`, 0.95 s `expo.out`, stagger 0.09) at +0.22; eyebrow chip slides from +50u x at +0.3; role fades up at +0.45.
- C: label at +0.25, title lines at +0.28 (stagger 0.07). D: date lines +0.25, weekday +0.4, time chip +0.42. E: event + location slide from x at +0.3 (stagger 0.07).
- Sticker pops `scale 0, rotate -40 → 1, 0` with `back.out(1.7)` at `at(4)+0.35`, then rotates continuously `t*14` deg/s in `render`.
- Hold: photo pushes `1 → 1.035` with `inOutQuad` across the hold.
- Exit at `xo = D - 0.78`: sticker `back.in(2)` pops off, then cells collapse to `inset(0 0 100% 0)` (upward) in reverse order, 0.05 s apart, 0.5 s `power3.in`.

## Adapt to the design system
- Replace the palette object with tokens: `--bg` ← bg, `--cell` ← surface, `--fg` ← text, `--accent` ← accent; keep the `onAccent` luminance check.
- Fonts are hard-coded (Unbounded display, Manrope body) → use `var(--font-display)` for name/date/event, `var(--font-body)` for role/title/chips.
- Cell radius 30u and gap 18u should come from the design's radius/spacing (`var(--space-gap)`); a 0-radius grid reads as Swiss/brutalist.
- 16:9 vs 9:16: keep the two hand-composed layouts; don't just transpose. For 1:1, use the portrait structure with the photo cell at ~50 % height.
- Short clips (3–4 s): `k` floors at 0.5, so the build stays ≥ 0.3 s apart per cell. Long (10 s+): the photo push and sticker spin carry it; consider adding a second-beat reveal (e.g. "Register" chip) mid-hold.

## Variations
- **Multi-speaker**: repeat the build with the photo cell crossfading between 2–3 speakers via the same inset wipe while the event cells stay.
- **Beat build**: start cell `i` on `studio.beat(i)` for a music-driven announcement.
- **Countdown cell**: replace the weekday line with "in 3 days" or a counting number.
- **Paper editorial**: `paper` palette, no sticker, thin 2u outline cells instead of fills.
- **Video portrait**: put a `<video data-start="0">` in the arch instead of a still.

## Pitfalls
- Long names: the name is forced to two `nowrap` lines and shrunk; a 3-word name puts two words on line 2 — check the longest realistic name.
- Text fitting must run after fonts load (the runtime guarantees this before `setup`); measuring in a fresh element without the cell width gives wrong results.
- The `accent` param only overrides the palette when it differs from `#d4ff3a` — a design-system accent token will always override the palette accent.
- Don't animate every child of every cell: the inset reveal is the main move; inner text lags 0.2–0.45 s behind it.
- Photo URLs must be local/project assets — no remote images.

## Reference
Reference implementation: gallery/clips/social-speaker-card/ (clip.js, style.css). Key snippet:

```js
const RR = 30 * u;
const ci = (a, b, c, d) => `inset(${a}% ${b}% ${c}% ${d}% round ${RR}px)`;
const cells = ['A', 'B', 'C', 'D', 'E'].map((c) => $('.cell.' + c));
const from = [ci(100, 0, 0, 0), ci(0, 100, 0, 0), ci(100, 0, 0, 0), ci(0, 0, 0, 100), ci(0, 0, 100, 0)];
const at = (i) => T(0.1 + i * 0.09);
cells.forEach((c, i) => tl.fromTo(c, { clipPath: from[i] }, { clipPath: ci(0, 0, 0, 0), duration: 1.0, ease: 'expo.out' }, at(i)));
tl.fromTo(img, { scale: 1.18 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, at(0));
const nameSplit = new SplitText(nm.children, { type: 'lines', mask: 'lines' });
tl.from(nameSplit.lines, { yPercent: 105, duration: 0.95, ease: 'expo.out', stagger: 0.09 }, at(1) + 0.22)
  .from($('.role'), { y: 20 * u, opacity: 0, duration: 0.7, ease: 'power3.out' }, at(1) + 0.45)
  .from($('.eb'), { x: 50 * u, opacity: 0, duration: 0.7, ease: 'expo.out' }, at(1) + 0.3);
```

```js
// exit: sticker pops off, cells collapse upward in reverse order
const xo = D - 0.78;
if (st) tl.to(st, { scale: 0, duration: 0.3, ease: 'back.in(2)' }, xo - 0.05);
[...cells].reverse().forEach((c, i) => tl.to(c, { clipPath: ci(0, 0, 100, 0), duration: 0.5, ease: 'power3.in' }, xo + i * 0.05));
```
