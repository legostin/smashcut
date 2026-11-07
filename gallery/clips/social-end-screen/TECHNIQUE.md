# YouTube End Screen

A last-20-seconds layout that respects YouTube's end-screen element zones: headline, one or two video/playlist slots and a circular subscribe slot drawn on with a ring, over a brand gradient — optionally with transparent "holes" so real thumbnails show through.

## Use it for
- The final 5–20 s of a YouTube video, where YouTube's own end-screen elements will be placed over the slots.
- "Watch next" / "Thanks for watching" outros with a channel identity.
- Any CTA screen that must leave precise empty regions for elements added later (cards, thumbnails).

## Avoid when
- Shorts/Reels: YouTube end screens are not available there — use a social-subscribe style CTA instead.
- The outro is under ~5 s: YouTube requires at least 5 s, and the entrance plus hold would feel cramped.
- You need branded content inside the slots — the slots are placeholders by design.

## Anatomy
- `.es` full-frame container. Unit `u = min(W, H) / 1080` scales every size (CSS uses `calc(… * var(--u))`); `portrait = H/W > 1.2` switches to a stacked layout.
- **Layout first, in px**: slot rectangles (16:9) and the subscribe circle `{cx, cy, d, side}` are computed from `W/H` per layout mode (`two`, `playlist`, `one`). Landscape: two slots side by side at `H*0.26` with a `W*0.045` gap, ring centred at `H*0.805`; one-slot mode puts the ring to the right. Portrait: slots stacked at 80 % width.
- **Background** is an SVG: linear (`gradient`) or radial (`dark`) fill, two blurred accent/glow blobs (`feGaussianBlur` 110u), and `feTurbulence` grain at `opacity = grain` with `mix-blend-mode: overlay`. The whole group is masked by `#esm`: white rect + black `rect.hole` per slot and a `circle.hole-c` for the subscribe ring — that is how transparent holes are cut.
- **Headline**: small tracked subline (Inter 600, 0.32em, 60 % white) + uppercase Unbounded 800 at 88u, `white-space: nowrap`, auto-shrunk to `W*0.86`.
- **Slots**: `.slot` with an inset-stroke `.frame` (glassy gradient fill when not holes), a play button or a "Playlist" side panel, two offset `.ghost` frames behind playlist slots (stack illusion), and a label row with an accent dot below.
- **Subscribe**: avatar disc (accent→glow gradient + initials) when not holes, an SVG ring (`r0` faint track + `r1` accent stroke rotated −90° so it starts at 12 o'clock), channel name + pill button either right of the ring (group re-centred after measuring `chan.offsetWidth`) or below.

## Motion
- Entrance scale factor `k = clamp((D - 0.8) / 2.6, 0.55, 1)` compresses entrance times `T(x)` on short clips.
- 0 s: background reveals as a `clip-path: circle()` growing from the subscribe centre to the farthest corner, `T(0.6)` `power3.inOut`.
- `T(0.25)`: subline chars fade/rise (SplitText, 0.5 s `power3.out`, stagger 0.012). `T(0.32)`: headline chars rise from `yPercent 115` through line masks (0.8 s `expo.out`, stagger 0.02).
- `T(0.3) + i*T(0.27)`: slots scale 0.9→1 with `outExpo` over 0.85 s (in `render`), opacity leads (`ki*1.4`); the mask hole is resized in sync, so the hole and the frame grow together.
- `T(0.7)`: ring track fades in; `T(0.75)`: avatar pops (`back.out(1.8)`) and the hole circle opens with `outBack`; `T(0.8)`: accent ring draws on with DrawSVG `0%→100%` over `T(1.1)` `power2.inOut`.
- `T(0.9)`: slot labels rise (stagger 0.1). `T(1.1)`: channel name + button slide in (stagger 0.08).
- Hold: slots float `4u * sin(t/3.4 * 2π + i*1.7)` (eased in by `settle`), blobs drift on slow sines, the button breathes from `T(1.8)` (`scale 1 + 0.035 * sin²`).
- Exit starts at `xo = D - 0.62`: text chars fly up, ring undraws to `100% 100%`, avatar `back.in`, slots shrink in reverse order (0.06 s apart), background circle closes into the ring at `D - 0.47` (0.45 s `power3.in`).

## Adapt to the design system
- `bg1`/`bg2` → bg / surface tokens, `accent` → accent, `glow` → accent-2. Fonts are hard-coded (Unbounded headline, Inter UI) — in your clip use `var(--font-display)` for the headline and `var(--font-body)` for labels.
- Slot radius `20u` should follow the design radius; the button is a 999px pill — square it for brutalist systems.
- 9:16 handled by `portrait` branch (stacked slots, ring under them), but YouTube end screens are a 16:9 feature — use portrait mostly for previews.
- Duration: keep D ≥ 5 s (k hits its 0.55 floor at ~2.2 s). For 20 s end screens nothing changes except a longer floating hold — consider a slow background push.

## Variations
- **Holes mode** (`holes: true`): place real thumbnails on a lower track; the gradient frames them — pair with a subtle shadow ring around each hole.
- **Single hero video**: `1 video + subscribe` layout with the ring beside a large slot.
- **Countdown end screen**: add a small "Next video in 5" counter under the headline, driven from `D`.
- **Beat-synced**: start slot pops on `studio.beat(n)` instead of `T(0.3)+i*T(0.27)`; breathe the button on beats with `studio.level()`.
- **Minimal dark**: `background: dark`, no blobs, grain 0.03, one accent only.

## Pitfalls
- Slot positions must stay where YouTube places its elements; don't move them with transform for "style".
- Holes are cut only from the background — if `background` is `transparent`, holes are ignored (code: `holes = p.holes && p.background !== 'transparent'`).
- Long headlines are shrunk to fit; very long ones become tiny — keep it 2–3 words.
- The mask hole and the slot frame must use the same geometry each frame (both computed in `render(t)`), otherwise the hole drifts off the frame during the float.
- `clip-path` radius must reach the farthest corner (`Math.hypot`), or corners stay unrevealed.

## Reference
Reference implementation: gallery/clips/social-end-screen/ (clip.js, style.css). Key snippet:

```js
slots.forEach((s, i) => {
  const a = T(0.3) + i * T(0.27);
  const ki = E.outExpo(studio.progress(t, a, 0.85));
  const ko = E.inCubic(studio.progress(t, xo + 0.05 + (slots.length - 1 - i) * 0.06, 0.34));
  const sc = (0.9 + 0.1 * ki) * (1 - 0.06 * ko);
  const settle = studio.progress(t, a + 0.6, 1.2);
  const fy = 4 * u * Math.sin((t / 3.4) * Math.PI * 2 + i * 1.7) * settle;
  const o = Math.min(1, ki * 1.4) * (1 - ko);
  s.el.style.transform = `translateY(${fy}px) scale(${sc})`;
  s.el.style.opacity = o;
  if (s.hole) {
    const hs = sc * Math.min(1, ki * 1.15) * (1 - ko);
    const w = s.w * hs, h = s.h * hs;
    s.hole.setAttribute('x', s.x + (s.w - w) / 2);
    s.hole.setAttribute('y', s.y + fy + (s.h - h) / 2);
    s.hole.setAttribute('width', Math.max(0, w));
    s.hole.setAttribute('height', Math.max(0, h));
  }
});
```

```js
const rMax = Math.hypot(Math.max(sub.cx, W - sub.cx), Math.max(sub.cy, H - sub.cy)) + 20;
tl.fromTo(bg, { clipPath: `circle(0px at ${sub.cx}px ${sub.cy}px)` }, { clipPath: `circle(${rMax}px at ${sub.cx}px ${sub.cy}px)`, duration: T(0.6), ease: 'power3.inOut' }, 0)
  .to(bg, { clipPath: `circle(0px at ${sub.cx}px ${sub.cy}px)`, duration: 0.45, ease: 'power3.in' }, D - 0.47);
```
