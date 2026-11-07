# Social Handle Cycler

A compact pill lower third: a platform icon disc pops in, the pill grows out of it, and the disc flips (rotateX) to the next platform while the handle slides up and the pill re-measures its width — cycling through YouTube, Instagram, TikTok, X, Telegram, VK and more.

## Use it for
- "Follow me" moments in creator videos, podcast clips, streams, outros.
- Showing several channels in one small overlay instead of a cluttered row of icons.
- Any "cycle through N short items in one slot" need (handles, prices, cities, features).

## Avoid when
- There is one handle and plenty of space — a plain lower third or end screen is clearer.
- More than ~5 handles in a short clip: each needs ≥ 0.9 s to read.
- The brand forbids platform brand colours next to its own palette (icons carry official colours).

## Anatomy
- Parsing: `handles` textarea, one per line `platform: @handle | followers`; aliases (`yt, ig, insta, tg, twitter, fb, vkontakte, site…`), unknown → `web`.
- `PL` table: per platform a background (solid or the Instagram radial gradient) and a 24×24 inline SVG icon.
- `.sh` root: zero-width anchor (`width: 1px`) placed by `position` (bottom/top × left/right) with `perspective: 420u px` for the flip. Unit `u = min(W,H)/1080 × scale`; height `h = 84u`.
- `.pill`: rounded (`999px`) plate, `--plate` (dark `rgba(16,16,20,.94)` or light), inset edge + drop shadow; its **width is animated** per handle.
- `.disc`: circle of height `h`, `transform-style: preserve-3d`; all platform backgrounds (`.bgl`) and icons are stacked inside and toggled by opacity — no DOM swapping.
- `.txt`: `overflow:hidden` mask beside the disc; each handle is an absolutely positioned `.item` (handle Inter 700 32u + follower count Inter 500 21u in `--muted`). Each item's width is measured in setup → `pw[i] = padL + width + padR` = target pill width.
- Placement: landscape margins 96 px / bottom 92 px; portrait (`H/W > 1.2`) margin 64 px, bottom at 20 % of H (clear of platform UI), top variant at 10 %.

## Motion
- 0.10 s: disc `scale 0 → 1`, `rotate ∓90 → 0`, `back.out(2.2)` (0.55 s).
- 0.30 s: pill visible; 0.35 s: pill grows from disc width to `pw[0]` (`expo.out`, 0.75 s); 0.48 s: first handle rises `yPercent 110 → 0` (`expo.out`); 0.65 s: follower count slides 10u sideways and fades in.
- **Scheduling**: exit at `xo = D − 0.75`; last switch may start at `xo − 0.55`. First switch at `min(1.2 + extra cycle time, last − (n−1)×0.9)`; cycle length `cyc = clamp((last − first)/(n−1), 0.9, cycleDuration)` — so every handle is shown even on short clips, never faster than 0.9 s each. Switches are generated in a loop until `last` (wraps around with `i % n` if there is time).
- Each switch at `c`: disc `rotationX 0 → 90` (0.17 s `power2.in`) — at edge-on the background/icon opacities are swapped with `tl.set` — then `−90 → 0` with `back.out(1.8)` (0.42 s). Old handle exits up (`yPercent −110`, 0.32 s `power3.in`), new one rises from below at c + 0.2 (`expo.out`); pill width eases to the new measurement (`power3.inOut`, 0.6 s, from c + 0.06).
- Exit: text up (0.3 s), pill collapses back to disc width (`power3.in`), fades, disc spins out with `back.in(2)` at xo + 0.42.
- `immediateRender: false` on the repeated `fromTo`s is essential — otherwise later switches would set their start values at time 0.

## Adapt to the design system
- No colour params: theme `dark`/`light` sets `--plate`, `--edge`, `--fg`, `--muted` inline. In an original clip, map them to `var(--color-surface)`, `var(--color-text)`, `var(--color-muted)`.
- Font is Inter in CSS → `var(--font-body)` / `var(--weight-title)` for the handle.
- Radius: fully round pill; for square systems use the radius token on both pill and disc (the disc can be a rounded square).
- 9:16 is handled (portrait branch). `scale` 1.2–1.4 helps on phones.
- Short (≤ 4 s): the scheduler squeezes cycles to ≥ 0.9 s; with 4 handles that needs ≈ 5 s — reduce the list. Long (10 s+): cycles stay at `cycleDuration` and loop through the list again.

## Variations
- **Feature ticker**: icons → feature glyphs, handles → short feature names.
- **Beat flips**: set the switch times to `studio.beats` (every 2 or 4 beats) instead of the computed schedule.
- **Single handle + count-up**: one platform, the follower number counts up during the hold.
- **Vertical stack outro**: reuse the pill build per handle, stacked, staggered 0.12 s, no flip.
- **Platform-coloured pill**: tint the pill with the current platform's colour at low opacity during each switch.

## Pitfalls
- Swap content while the disc is edge-on (rotationX 90) — swapping mid-face is a visible pop.
- Without `immediateRender: false`, repeated `fromTo` on the same element breaks seeking backwards.
- Measure every item's width in setup and animate the pill to it; a fixed max width leaves ugly empty pill tails.
- Mono synthetic text icons (`in`, `VK`, `@`) use Inter — make sure the font is loaded before measuring.
- The default position (bottom-left) collides with captions; move to top or raise when the video has subtitles.
- Platform logos are trademarks — keep official colours/shapes, don't restyle them into the brand palette.

## Reference
Reference implementation: gallery/clips/lower-third-social-handle/ (clip.js, style.css). Key snippet:

```js
let cur = 0;
for (const s of switches) {
  const c = s.t, nx = s.i;
  tl.to(disc, { rotationX: 90, duration: 0.17, ease: 'power2.in' }, c)
    .set([bgs[cur], icons[cur]], { opacity: 0 }, c + 0.17)
    .set([bgs[nx], icons[nx]], { opacity: 1 }, c + 0.17)
    .fromTo(disc, { rotationX: -90 }, { rotationX: 0, duration: 0.42, ease: 'back.out(1.8)', immediateRender: false }, c + 0.17)
    .to(items[cur], { yPercent: -110, duration: 0.32, ease: 'power3.in' }, c)
    .fromTo(items[nx], { yPercent: 110 }, { yPercent: 0, duration: 0.6, ease: 'expo.out', immediateRender: false }, c + 0.2)
    .to(pill, { width: pw[nx], duration: 0.6, ease: 'power3.inOut' }, c + 0.06);
  cur = nx;
}
```

```js
const n = list.length;
const tIn = 0.1, xo = D - 0.75;
const last = xo - 0.55; // latest moment a switch may start
// first switch after the intro has read; pulled earlier on short clips so every handle gets shown
const first = Math.min(tIn + 1.1 + Math.max(0, p.cycleDuration - 1.1), Math.max(0.95, last - (n - 1) * 0.9));
const cyc = n > 1 ? Math.max(0.9, Math.min(p.cycleDuration, (last - first) / (n - 1) || p.cycleDuration)) : Infinity;
const switches = [];
if (n > 1) for (let c = first, i = 1; c <= last + 1e-6; c += cyc, i++) switches.push({ t: c, i: i % n });
```
