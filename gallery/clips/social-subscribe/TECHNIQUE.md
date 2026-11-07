# Subscribe + Like CTA

A pill-shaped channel card pops in, a fake cursor glides over and clicks Subscribe (the button flips to "Subscribed"), then Like and the notification bell, each with a burst and a wiggle, before the card drops out.

## Use it for
- A 3–6 s call-to-action overlay inside a YouTube video ("if you like this, subscribe").
- Any "click this" micro-story: follow, join, add to cart, enable notifications.
- Overlays over talking-head footage, bottom-centre or in a corner.

## Avoid when
- Vertical Shorts/Reels with platform UI along the bottom and right — the card sits 120 px above the bottom edge, inside the unsafe zone.
- The CTA must be calm/premium: cursor + bursts + elastic wiggles read as playful YouTube energy.
- Under ~2.5 s: the sequence compresses to 55 % and the clicks become frantic.

## Anatomy
- `.ss` full-frame transparent container with one `.card` (flex row, `border-radius: 999px`, deep drop shadow + 1 px inner hairline, `white-space: nowrap`).
- **Avatar** disc (gradient `avatarColor → accent`, initials), **meta** (channel name Manrope 700 34 px, subscriber line Inter 24 px at 60 %).
- **Button**: two stacked background layers (`.bgA` accent, `.bgB` translucent white) cross-faded on click, a `.ripple` circle, and two labels in the same grid cell (`grid-area: 1/1`) — "Subscribe" and a checkmark + "Subscribed" — so the swap needs no layout change.
- **Icons**: like (thumb) and bell as SVG with an outline path plus a duplicate `.fill` path that fades in on click; each icon has an 8-ray `.burst` (`<i>` bars rotated `i*45deg`).
- **Cursor**: an inline SVG arrow with a drop shadow, positioned in absolute px.
- **Placement**: the card is measured (`offsetWidth/Height`) and placed by `position` (bottom-center/left/right, centre) with 110 px side margin; it's scaled by `p.scale` around its centre. Click-target centres are computed with `centre(node)` accounting for that scale, so the cursor lands exactly on the buttons.

## Motion
- 0.02 s: card pops `scale 0.7s → s`, `y 40 → 0`, 0.55 s `back.out(1.7)`. 0.15 s avatar `back.out(2.5)`; 0.2 s name/subs slide in (stagger 0.06, subs end at 0.6 opacity); 0.28 s button and 0.34 s icons pop with `back.out(2)` (icon stagger 0.06).
- Action time scale `k = clamp((D - 0.7) / 4.3, 0.55, 1)`.
- `T(0.6)`: cursor fades in from bottom-right (`+380, +320`) and travels with **separate x and y tweens** — x `power2.out`, y `power3.out` over `T(0.75)` — which bends the path into a natural arc.
- Click helper: cursor scales to 0.82 in 0.08 s (`power2.in`, origin at the arrow tip) and springs back `back.out(3)` in 0.18 s.
- Subscribe at `T(1.45)`: ripple `scale 0 → 9`, opacity 0.8 → 0 (0.6 s); button squash 0.94 yoyo; bg layers cross-fade (0.25 s); "Subscribe" exits up (`yPercent -120`), "Subscribed" rises in with `back.out(2)` at +0.22.
- From `T(1.95)` each icon: cursor moves `power3.inOut` over `T(0.45)`, clicks at +`T(0.5)`; fill fades in, burst rays shoot out (`x 0 → 22`, `scaleX 0.2 → 1`, fade, 0.5 s `power3.out`).
  - Like: thumb pops `scale 1.35, rotate -14` (0.14 s) then settles `elastic.out(1, 0.4)`; disc turns accent.
  - Bell: pendulum wiggle `[18, -15, 11, -7, 4, 0]` deg, 0.09 s each `sine.inOut`, pivot at the top (`50% 8%`).
- Cursor leaves down-right (`+=220, +=200`, `power2.in`); card exits at `D - 0.55` with `back.in(1.5)` to 0.85 scale.

## Adapt to the design system
- `accent` → accent (button, like fill, burst), `avatarColor` → accent-2, `cardColor` → surface, `textColor` → text. Keep the bell burst yellow or map it to accent-2.
- Fonts are hard-coded Manrope/Inter → use `var(--font-title)` for name/button and `var(--font-body)` for the subscriber line.
- Radius: full pill by design; for a squarer system use the design radius on card and button, keep icons circular.
- 9:16: place it at `center` or raise it above the bottom 20 % (`cy` from `height * 0.7`); scale ~1.4–1.6 at 1080 wide; drop the bell if width is tight.
- Short durations compress actions (floor 55 %); for long clips (8 s+) add a slow idle float or a second click loop rather than a long static hold.

## Variations
- **Follow button only**: hide like/bell (`showLike/showBell: false`) for Instagram/TikTok "Follow".
- **Platform skins**: swap the button colours and copy (Follow, Join, Подписаться); swap the thumb path for a heart.
- **Beat clicks**: put `t1` and each icon click on `studio.beat(n)` so taps land on the music.
- **No cursor**: replace the cursor with a "tap" circle (touch UI) — same ripple timing.
- **Counter bump**: animate the subscriber line counting +1 right after the subscribe click.

## Pitfalls
- Measure the card only after fonts load (the clip awaits `document.fonts.load`), otherwise click targets miss the buttons.
- When scaling the card, compute target positions through the scale (`centre()`); using `getBoundingClientRect` before the transform is set gives wrong coordinates.
- Mono-ease cursor moves (same ease on x and y) look robotic — keep different eases or an arc.
- Too many effects per click (ripple + burst + elastic + colour) all at once is noisy; keep the 0.06 s offsets.
- Russian "Подписаться/Вы подписаны" is longer — the pill grows; check it fits at the chosen scale and margin.

## Reference
Reference implementation: gallery/clips/social-subscribe/ (clip.js, style.css). Key snippet:

```js
// cursor path
const hot = (pt) => ({ x: pt.x - 6, y: pt.y - 4 }); // tip of the arrow sits on the target
const c0 = { x: P.btn.x + 380, y: Math.min(height + 60, P.btn.y + 320) };
tl.set(cursor, { x: c0.x, y: c0.y, opacity: 0 }, 0)
  .to(cursor, { opacity: 1, duration: 0.15 }, T(0.6))
  .to(cursor, { x: hot(P.btn).x, duration: T(0.75), ease: 'power2.out' }, T(0.6))
  .to(cursor, { y: hot(P.btn).y, duration: T(0.75), ease: 'power3.out' }, T(0.6));
const click = (at) => tl.to(cursor, { scale: 0.82, duration: 0.08, ease: 'power2.in', transformOrigin: '10% 8%' }, at).to(cursor, { scale: 1, duration: 0.18, ease: 'back.out(3)' }, at + 0.08);
// subscribe click
const t1 = T(1.45);
click(t1);
const bRect = { x: btn.offsetWidth / 2, y: btn.offsetHeight / 2 };
tl.set($('.ripple'), { left: bRect.x, top: bRect.y }, 0)
  .fromTo($('.ripple'), { scale: 0, opacity: 0.8 }, { scale: 9, opacity: 0, duration: 0.6, ease: 'power2.out' }, t1 + 0.04)
  .fromTo(btn, { scale: 1 }, { scale: 0.94, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.inOut' }, t1)
  .to($('.bgA'), { opacity: 0, duration: 0.25 }, t1 + 0.1)
  .to($('.bgB'), { opacity: 1, duration: 0.25 }, t1 + 0.1)
  .to($('.tA'), { yPercent: -120, opacity: 0, duration: 0.25, ease: 'power2.in' }, t1 + 0.08)
  .fromTo($('.tB'), { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 0.9, duration: 0.35, ease: 'back.out(2)' }, t1 + 0.22);
```
