# App Promo Phone

A CSS-built modern smartphone (titanium frame, Dynamic Island, side buttons, glass glare) rises in 3D next to a masked headline and checkmark bullets, sways gently during the hold while its app screens slide by — built-in finance-app UI or your own screenshots.

## Use it for
- App launches, App Store / Play-style promo videos, feature announcements.
- "Here is the app" moments in a pitch or explainer, with 1–3 feature bullets.
- Vertical ads for mobile apps (automatic vertical layout).

## Avoid when
- The product is a desktop/web app — use a browser window or cursor demo.
- You need to show a precise interaction flow (taps, scrolling inside a screen); this cycles whole screens, it does not simulate touches.
- The screenshots are not phone-shaped (≈ 9:19.5): `object-fit: cover` will crop them.

## Anatomy
- **Background**: solid colour, two big blurred glows (`filter: blur(140px)`, accent behind the phone + a blue one bottom-left), and a seeded static grain tile (canvas → data URL) at 7 % `overlay`, jittered 12×/s in `render`.
- **Device** (fixed 412 × 862 px design, scaled by `ps`): `.phone` with the finish as a multi-stop 135° linear gradient (fake brushed metal; four finishes), radius 62 px, outer shadows + inset highlight rings; four `.btn` side buttons using the same gradient; `.bezel` (black, inset 5 px); `.scr` screen mask (inset 15 px, radius 47 px, `overflow:hidden`) holding stacked `.sv` screens, a `static-glass` diagonal sheen and a moving `.glare` band; `.island` pill with a camera dot; `.shade` overlay for fake lighting.
- **3D rig**: `.stagecam` (`perspective: 2000px`) → `.rig` (entrance rotation, `preserve-3d`) → `.sway` (render-driven idle motion) → `.holder` (scale `ps`). A blurred elliptical `.shadow` sits under the phone.
- **Built-in screens**: three HTML app screens (home with balance card + transactions, spending donut from SVG circles with `pathLength=100`, savings goals with progress bars); rows carry `.an` for staggered reveal.
- **Copy**: eyebrow pill (accent at 13 % alpha + accent text), headline lines in masks (`.ln` overflow hidden, Manrope 800 124 px, line-height 0.98, tracking −0.035em), bullets with accent check discs (Inter 500 32 px, text at 82 % opacity).
- **Layouts**: `left` (copy left, phone at 70 % W), `right` (mirrored), `center` (copy left, bullets right of the phone), `fan3` (two dimmed side phones fan out at ±255 px, ±9°). If `H > 1.1 W` the layout is forced to **vertical**: copy on top centred at `W × 0.105` px, bullets hidden, phone at 58 % height.
- Headline auto-fit: up to 12 iterations shrinking the font until the widest line fits `copyW`.

## Motion
- 0 s: glows fade/scale in (1.6 s `power2.out`).
- 0.08 s: phone rig rises from `y = 0.75 H` with `rotateX 25°, rotateY -20°` (mirrored for `right`) to rest at `rotateY -8°` (0 in center/vertical), 1.15 s `expo.out` — a big, confident throw that settles into a three-quarter view. Shadow scales in from 0.3 s.
- 0.3 s: eyebrow rises 24 px; 0.38 s: headline lines rise `yPercent 110 → 0`, 0.9 s `expo.out`, stagger 0.09 s.
- 0.85 s: bullets slide in 30 px (stagger 0.1 s); their check discs pop `scale 0 → 1` with `back.out(2.4)` 0.05 s later.
- `fan3`: side phones fan out from behind at 0.75 s with `back.out(1.3)`.
- Screens: first screen rows rise at 0.8 s (`y 22`, stagger 0.045 s); donut arcs sweep via `stroke-dasharray` attr tweens (0.55 s each, stagger 0.12 s); goal bars grow `scaleX`. Each next screen slides up from `yPercent 100` (0.8 s `power3.inOut`) while the previous moves to `-30 %` and dims to 0.4 — a parallax push like a native navigation. The number of screens shown depends on duration (≥ 1.5 s per screen).
- Idle (from 1.0 s, ramping in over 1.4 s with `outCubic`): rotateY sine (period 6.5 s, ±`swayAmount`°), rotateX at 35 % amplitude (8 s), float ±7 px (5.2 s). Different periods so it never looks looped. `.shade` gradient darkens the side facing away, proportional to the total rotateY.
- Glare: a 100° highlight band sweeps across the glass at 1.4 s and every 3.6 s after (1.3 s, `sine.inOut`).
- Exit at `duration - 0.7`: headline lines drop back into masks (`power3.in`), eyebrow/bullets fade down, phone drops `0.12 H` and fades, side phones fold back.

## Adapt to the design system
- `accent` → `accent` (balance card, eyebrow, checks, donut, glow), `background` → `bg`, `textColor` → `text`.
- Fonts: headline Manrope → `var(--font-display)`, bullets/eyebrow Inter → `var(--font-body)`. Bullet text ≥ 28 px.
- Device finish should harmonise with `bg`: `black` on light backgrounds, `natural`/`white` on dark; `desert` for warm palettes.
- Build the in-phone UI from the brand tokens too (surface, radius, accent) — the screens are the product, they must match the brand more than the frame does.
- 9:16: handled automatically (phone 50 % of the height, headline on top, bullets dropped). Put bullets back as a single line under the headline if they matter, and keep them above the lower 20 %.
- Short (≤ 5 s): only one screen is shown; reduce sway. Long (12 s+): use all three screens; consider screenshots that tell a story (onboarding → main → result).

## Variations
- **Hero only**: `layout: center`, no bullets, a single screen, slow push — App Store "product shot".
- **Fan of three**: `fan3` with three different screenshots to show breadth of features.
- **Screen tour**: phone static, screens change on the beat (`studio.beat(n)` for each `switchT`) with bullets highlighted in sync.
- **Notification drop**: add a notification banner sliding down from the island over the screen at a key moment.
- **Hand-off**: phone rotates `rotateY` 90° on exit and a second clip continues the motion (match cut).

## Pitfalls
- Screenshot images must be phone-proportioned and local (`assets/…`); remote URLs are blocked.
- Too much sway (> 6°) plus screen slides plus glare = everything moves; reduce sway when screens change often.
- The 3D needs `transform-style: preserve-3d` on every intermediate wrapper; one missing level flattens the rotation.
- The fake shade/glare must be driven by `t` in `render`; CSS animations would loop independently of the timeline length.
- The `vertical` layout overrides the `layout` param silently — test 9:16 renders separately.
- Long headlines are auto-shrunk to ≥ 40 px; very long lines become small — break lines manually (one line per row).

## Reference
Reference implementation: gallery/clips/product-phone-mockup/ (clip.js, style.css). Key snippet:

```js
    tl.fromTo(el.querySelectorAll('.bg .glow'), { opacity: 0, scale: 0.7 }, { opacity: (i) => (i ? 0.18 : 0.24), scale: 1, duration: 1.6, ease: 'power2.out' }, 0)
      .fromTo(rig, { y: H * 0.75, rotateX: 25, rotateY: -20 * flip }, { y: 0, rotateX: 0, rotateY: baseY, duration: 1.15, ease: 'expo.out' }, 0.08)
      .fromTo(shadow, { opacity: 0, scaleX: 0.5 }, { opacity: 1, scaleX: 1, duration: 1.0, ease: 'expo.out' }, 0.3)
      .fromTo($('.eyebrow'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, 0.3)
      .fromTo(hl.querySelectorAll('.ln span'), { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09 }, 0.38)
      .fromTo(bul.querySelectorAll('.b'), { x: -30 * flip, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: 'expo.out', stagger: 0.1 }, 0.85)
      .fromTo(bul.querySelectorAll('.b i'), { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: 0.1 }, 0.9);
```

```js
        const amp = Number(p.swayAmount) || 0;
        const on = studio.ease.outCubic(studio.progress(t, 1.0, 1.4)) * (1 - studio.progress(t, out, 0.4));
        const ry = amp * Math.sin((t - 1.0) * (Math.PI * 2) / 6.5) * on;
        const rx = amp * 0.35 * Math.sin((t - 1.0) * (Math.PI * 2) / 8 + 0.6) * on;
        const fy = 7 * Math.sin((t - 1.0) * (Math.PI * 2) / 5.2) * on;
        sway.style.transform = `translateY(${fy.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg) rotateX(${rx.toFixed(3)}deg)`;
        // fake shading tied to rotation
        const rotY = (Number(gsap.getProperty(rig, 'rotateY')) || 0) + ry;
        shade.style.background = `linear-gradient(${rotY > 0 ? 270 : 90}deg, rgba(0,0,0,${Math.min(0.35, Math.abs(rotY) * 0.016).toFixed(3)}), rgba(0,0,0,0) 60%)`;
```
