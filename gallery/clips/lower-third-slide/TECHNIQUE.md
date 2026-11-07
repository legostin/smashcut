# Slide Plate Lower Third

The classic broadcast name plate: a vertical accent bar grows, a solid plate wipes open beside it with `clip-path`, name and role slide in, and at the end the plate wipes shut and the bar collapses.

## Use it for
- Talking-head interviews, corporate and explainer videos, webinars — the "safe default" speaker ID.
- Busy or bright footage: the solid plate guarantees contrast.
- A fast, minimal-code base when a project needs many consistent lower thirds.

## Avoid when
- The video is premium/editorial and should feel airy — a solid box is heavy; use the minimal line.
- Vertical social content where the bottom area is covered by platform UI (the plate is pinned 120 px from the bottom).
- You need more than name + one role line.

## Anatomy
- Whole clip is 21 lines of JS — the technique is mostly CSS.
- `.lt` flex row pinned `bottom: 120px`, `left: 120px` (or `right`, with `row-reverse` so the bar stays on the outer edge).
- `.bar`: 12 px wide accent strip, `align-items: stretch` makes it exactly the plate height; `transform-origin: bottom`.
- `.plate`: solid `--plate` background, `padding: 26px 40px 28px`, starts fully clipped with `clip-path: inset(0 100% 0 0)` (right variant: `inset(0 0 0 100%)`) so it opens from the bar outward.
- Name: Manrope 700 64 px, tracking −0.02em; role: Inter 500 30 px at 72 % white. Both `nowrap`; text colour comes from base.css (`#fff`).
- Colours are passed as CSS custom properties on the root (`--accent`, `--plate`).

## Motion
- 0.10 s: bar `scaleY 0 → 1` from the bottom, `power3.out`, 0.45 s.
- 0.30 s: plate clip-path opens to `inset(0 0% 0 0%)`, `expo.out`, 0.7 s — overlaps the bar by 0.25 s.
- 0.40 s: name slides in 40 px from the bar side + fades (`power3.out`, 0.6 s); 0.52 s: role, 30 px (smaller distance = parallax between the two lines).
- Hold until `out = max(1.2, D − outAt)` (`outAt` = seconds from the end, default 0.9).
- Exit: plate clips closed toward the far edge (`expo.in`, 0.5 s), then 0.35 s later the bar collapses toward the top (`power2.in`, 0.35 s) — origin flips from bottom to top so the bar "passes through" rather than rewinding.
- No beat/word sync.

## Adapt to the design system
- `accent` → accent, `plate` → surface (runtime key-name binding). Name/role colours are not params: in your version use `var(--color-text)` and `var(--color-muted)`.
- Fonts: hard-coded Manrope/Inter in CSS → `var(--font-title)` / `var(--font-body)`, sizes from `--size-title` / `--size-body`.
- Radius: the plate is square; add `border-radius` from the system (note: `clip-path: inset()` also accepts `round 12px`).
- Spacing: 120 px margins and the padding should come from `--space-margin` / `--space-gap`.
- 9:16: move it up to ~22–28 % from the bottom, left margin ~60 px, name 52–60 px; check that long names fit `studio.width − 2×margin`.
- Long durations: nothing moves during the hold — fine for interviews; for 10 s+ you can add a slow 1–2 % plate push.

## Variations
- **Two-tone**: second plate for the role in the accent colour, wiping in 0.1 s after the name plate.
- **Logo tab**: a square with the company logo replaces the bar.
- **Top-left topic tag**: same build, positioned top-left, for chapter/topic labels.
- **Rounded pill**: radius on the plate + bar becomes a dot.
- **Word-cued**: start at the speaker's first `studio.words` timestamp and exit before their last word ends.

## Pitfalls
- Tweens target global selectors (`'.bar'`, `'.plate'`); fine in a single-instance clip, but scope selectors to the root element if you build several plates in one clip.
- `outAt` is "seconds from the end" here but "exit duration" in lower-third-minimal — read params carefully.
- `clip-path` animation must start from a value GSAP can interpolate (`inset(...)` to `inset(...)` with the same number of values).
- `nowrap` with no auto-fit: long names/roles run off-screen on narrow (vertical) frames.
- `max(1.2, D − outAt)` means on very short clips the exit overruns the end — keep D ≥ 2.5 s.

## Reference
Reference implementation: gallery/clips/lower-third-slide/ (clip.js, style.css). Key snippet:

```js
const right = p.position === 'right';
const out = Math.max(1.2, duration - p.outAt);

tl.from('.bar', { scaleY: 0, duration: 0.45, ease: 'power3.out' }, 0.1)
  .to('.plate', { clipPath: 'inset(0 0% 0 0%)', duration: 0.7, ease: 'expo.out' }, 0.3)
  .from('.name', { x: right ? 40 : -40, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.4)
  .from('.role', { x: right ? 30 : -30, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.52)
  .to('.plate', { clipPath: right ? 'inset(0 100% 0 0%)' : 'inset(0 0% 0 100%)', duration: 0.5, ease: 'expo.in' }, out)
  .to('.bar', { scaleY: 0, transformOrigin: 'top', duration: 0.35, ease: 'power2.in' }, out + 0.35);
```

```css
.lt { position: absolute; bottom: 120px; display: flex; align-items: stretch; gap: 0; }
.lt.left { left: 120px; }
.lt.right { right: 120px; flex-direction: row-reverse; }
.bar { width: 12px; background: var(--accent); transform-origin: bottom; }
.plate { background: var(--plate); padding: 26px 40px 28px; overflow: hidden; clip-path: inset(0 100% 0 0); }
.right .plate { clip-path: inset(0 0 0 100%); }
```
