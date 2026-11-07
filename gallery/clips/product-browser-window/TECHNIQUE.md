# Browser Window Reveal

A minimal browser window tilts up into place, types its URL, shows a load bar over a shimmering skeleton, cross-fades into the page and then auto-scrolls a long landing page (built-in mock site or your own tall screenshot) with pauses on chosen sections.

## Use it for
- SaaS launches, website showcases, "our new site is live" announcements.
- Landing-page hero videos and portfolio reels of web work.
- Any moment where "this is a real website you can visit" is the message (the typed URL is the call to action).

## Avoid when
- You need to demonstrate an interaction (clicks, forms): use a cursor walkthrough technique.
- The page content must be readable in detail — the window is ~86 % of the frame, body text at 1500 px page width becomes ~15 px on 1080p.
- Vertical 9:16 with a desktop page: the window becomes a narrow strip (see Adapt).

## Anatomy
- Optional background `.bg`: solid colour, a huge blurred accent glow (`filter: blur(150px)`, opacity .28) and a 64 px line grid masked by a radial gradient. `showBackground: false` = transparent overlay.
- `.persp` box sized to the fitted window (`fit = min(W*0.86/1500, H*0.84/880)`), with `perspective: 2200px`; inside, a `.scaler` renders the window at its native **1500 × 880** design size and `transform: scale(fit)` — so the whole UI is authored in fixed px and scales as one picture.
- `.win`: 14 px radius, big layered shadow, light/dark chrome as CSS custom properties (`--chrome`, `--tab`, `--fg`, `--muted`, `--pill`, `--edge`). Tabs row (traffic lights, one tab with gradient favicon + title, "+"), toolbar (nav icons, pill address bar with lock, placeholder, typed value, accent caret, menu icons), 3 px accent load bar, and `.view` (viewport, `overflow:hidden`, 778 px high).
- `.page` inside the viewport: either `<img src=screenshot>` (full width) or the built-in site — nav, hero (badge, H1 92 px Manrope 800, subhead, CTAs, editor screenshot mock with tracks and a moving playhead), logos row, 3 feature cards, stats, gradient CTA, footer. Hero elements carry class `.an` for the staggered load-in.
- `.skel`: grey bars with a moving highlight via a CSS var `--sh` that `render` sets (`translateX(var(--sh))` on a pseudo element).
- Icons are inline SVG strings from a tiny `icon(d)` helper; user strings are HTML-escaped with `esc()` because the site is built as a template literal.

## Motion
Intro is compressed by `k = clamp((D-0.8)/6.2, 0.45, 1)`; values at D = 9 s:
- 0.05 s: window enters `y 70 → 0, scale 0.9 → 1, rotateX 16° → 0, opacity 0 → 1`, 1.1 s `expo.out` (transform origin top centre — it "stands up" towards the viewer). Glow scales 0.6 → 1 over 1.6 s.
- 0.5 s: URL types at 0.05 s per character (max 1.0 s total), computed in `render` as `floor(progress × length)`; caret visible from 0.3 s before typing, solid while typing, blinks at 1.5 Hz after.
- `tEnter` (typing end + 0.15 s): load bar grows `scaleX` with `power2.out` over 0.9 s, fades at the end; skeleton bars fade in over 0.25 s with a shimmer sweeping every ~0.9 s.
- `tEnter + 0.7 s`: skeleton fades out (0.4 s) while the page fades in (0.35 s); built-in hero elements rise `y 34 → 0` with opacity, 0.8 s `expo.out`, stagger 0.07 s.
- `tPage + 1.0 s`: auto-scroll between `scrollStops` (percent of page). Built-in site snaps intermediate stops to the nearest section top (`offsetTop - 24`). Each move uses `sine.inOut`; move durations are weighted by `0.6 + sqrt(distance) × 1.6`, total moves ≤ 62 % of the available time, the rest is split into equal pauses — so longer jumps take longer, and every stop gets a readable hold.
- Whole clip: `.persp` slow push 1 → 1.025 (`inOutQuad`); hero playhead loops across the editor mock every ~8 s.
- Exit at `duration - 0.62`: window `y -30, scale 0.96, opacity 0`, 0.5 s `power2.in`; glow fades.

## Adapt to the design system
- `accent` → `accent` token: caret, load bar, favicon, mock buttons, badge, CTA gradient. `background` → `bg`.
- Chrome theme: pick `light`/`dark` to contrast with `bg` (dark chrome on a dark background loses the window edge — the 1 px `--edge` ring and shadow are what separate it).
- Built-in site uses Inter + Manrope and its own neutrals; in an original clip, build the mock page from the project tokens (`var(--font-display)`, `var(--color-surface)`, radius tokens) so the "website" looks like the brand.
- 9:16: `fit` is driven by width (1500 px × fit ≈ 0.86 W), so the window shrinks to ~620 px tall at 1080 × 1920. Better: change the design size to a mobile/tablet viewport (e.g. 900 × 1500), or zoom the camera into the top-left of the page, or use a phone mockup technique instead.
- Short (≤ 5 s): k compresses the intro to ~45 %; use 2 scroll stops max. Long (12 s+): more stops, keep pauses ≥ 1.2 s each.

## Variations
- **Screenshot mode**: `screenshot: assets/page.png` (tall full-page capture); stops in % of its height.
- **Typed search → result**: type a query instead of a URL, load into a search results mock, then scroll to the brand.
- **Multi-tab**: add tabs that switch (cross-fade `.page` contents) instead of scrolling — feature tour of several pages.
- **Device push-in**: after load, scale the `.scaler` up 1.4× around a section instead of scrolling (focus on one block).
- **Dark mode flip**: toggle `.win.light` → `.win.dark` variables mid-clip with a quick wipe for a "now with dark mode" beat.

## Pitfalls
- Scroll amount uses `page.offsetHeight - VIEW_H`; with a screenshot the image must be loaded before it is measured (the runtime waits for images before the first seek, but don't cache the height in setup).
- Interpolate scroll with an in-out ease and pauses; a linear constant scroll looks like a screen recording and is hard to read.
- Don't scroll and push/zoom aggressively at the same time — the 2.5 % push is the maximum before it competes with the scroll.
- Typing must be a function of `t` (slice by progress), never accumulated per frame.
- Escape every user string inserted into template-literal HTML (`esc()`), or use `textContent`.
- `transition`s are frozen by the runtime; the skeleton shimmer is driven from `render` via a CSS variable for that reason.

## Reference
Reference implementation: gallery/clips/product-browser-window/ (clip.js, style.css). Key snippet:

```js
    const moves = [];
    const availS = out - 0.35 - tScroll0;
    if (stops.length > 1 && availS > 0.6) {
      const dists = stops.slice(1).map((s, i) => Math.abs(s - stops[i]));
      const wts = dists.map((d) => 0.6 + Math.sqrt(d) * 1.6);
      const sumW = wts.reduce((a, b) => a + b, 0);
      const moveTotal = Math.min(availS * 0.62, wts.reduce((a, w) => a + Math.min(2.4, w * 1.2), 0));
      const pauseEach = (availS - moveTotal) / Math.max(1, stops.length - 1);
      let tt = tScroll0;
      dists.forEach((d, i) => {
        const md = (moveTotal * wts[i]) / sumW;
        moves.push({ t0: tt, t1: tt + md, a: stops[i], b: stops[i + 1] });
        tt += md + pauseEach;
      });
    }
```

```js
        // URL typing + caret
        const n = Math.floor(studio.progress(t, tType0, Math.max(0.01, tType1 - tType0)) * url.length + 1e-6);
        val.textContent = url.slice(0, n);
        ph.style.display = n > 0 || t >= tType0 ? 'none' : '';
        const typing = t >= tType0 - 0.3 && t < tEnter + 0.05;
        caret.style.opacity = typing && (t < tType1 || Math.floor(t * 3) % 2 === 0) ? 1 : 0;
```
