# Cinematic Serif Title

A film title card: an elegant serif title whose letters resolve out of blur in a shuffled order while the letter-spacing slowly breathes in, over a dark graded background with a drifting light leak, vignette and film grain.

## Use it for
- Trailer and film openers, documentary chapter cards, "Coming soon" end cards.
- Slow, emotional moments; brand films; anything that wants a premium, quiet tone.
- Short titles (1–4 words) that can carry wide tracking.

## Avoid when
- The pace is fast (social hooks, promos): the reveal takes ~1.7 s and the clip breathes for its whole length.
- The title is long (25+ characters): with `breathe` tracking it gets auto-shrunk to small type.
- You need to show footage underneath — this is a full-frame card (see Variations for an overlay).

## Anatomy
- `.cin` full frame. Layers bottom → top: `.bg` radial gradient (`bgCenter` → `bgEdge`), `.leak` (1400 × 900 px ellipse of the accent, `blur(120px)`, opacity 0.22, `mix-blend-mode: screen`), `.vignette` (radial transparent 45 % → black 65 %), `.content`, `.grain` (overlay blend), `.black` (fade to/from black).
- `.content` centred: `.kicker` and `.sub` in small uppercase Inter with huge tracking (0.55em / 0.4em) and matching `padding-left` so the tracking does not shift the text off-centre; `.title` in Playfair Display; `.line` a 1 px hairline gradient `transparent → accent → transparent`.
- Title letters are `inline-block` spans (`white-space: pre` keeps spaces); tracking is a CSS custom property `--ls` used by both `letter-spacing` and `padding-left` (same centring trick), so GSAP can tween one variable.
- Fit: font size is reduced so the widest state (max breathe) fits 1700 px.
- Grain: four 256 × 256 noise tiles baked once with `studio.random(99)` into data URLs; `render(t)` swaps tile and offset at 24 fps → animated grain that is fully deterministic.

## Motion
- 0 s → `min(1.2, D×0.2)`: fade from black (`power1.inOut`). Last `min(0.9, D×0.15)` s: fade to black (`power1.in`).
- Whole clip: light leak drifts `xPercent -18 → 14`, `yPercent 6 → -4`, `scale .9 → 1.1` (linear); title `--ls` from `0.05 + breathe` em to `0.05em` with `sine.out`, and title `scale 1.04 → 1` (`power1.out`). The constant tightening is the signature move — the frame never freezes.
- 0.3 s: kicker fades/drops in (1.2 s, `power2.out`, to 0.8 opacity).
- 0.4 s → 0.4 + `min(1.2, D×0.22)`: letters resolve `opacity 0, blur 18px, y 10 → sharp`, 1.3 s each, `power2.out`, in a Fisher-Yates shuffled order (`studio.random(5)`) — long overlapping durations make it shimmer rather than tick.
- 0.9 s: hairline grows from the centre (`scaleX`, 1.6 s, `expo.inOut`). 1.4 s: subtitle rises (1.2 s, to 0.65 opacity).
- Exit at `max(D×0.6, D - 1.4)`: letters dissolve back into blur, `stagger { each: 0.02, from: 'edges' }` (1.0 s `power2.in`); kicker/sub/line fade together (0.8 s).
- Everything is slow (1–1.6 s tweens, sine/power1/power2): no overshoot, no snap. That is what reads "cinematic".
- Music: time the title resolve to a swell or section start (`studio.sections`) — e.g. start the clip so 0.4 s lands on the hit.

## Adapt to the design system
- `textColor` → `text`; `accent` (hairline, leak) → `accent`; the key-name heuristic binds `bgCenter` → `bg` and `bgEdge` → `surface`, which inverts the intended glow (centre should be the lighter one) — in your clip bind them explicitly (`"token": "surface"` for the centre, `"token": "bg"` for the edge).
- Title font: the system's display serif if it has one; Playfair Display is hard-coded in CSS and in the font-load call — change both. Kicker/sub → caption role.
- Keep the accent low-saturation for the leak; a neon brand accent at 0.22 opacity screen-blended will look cheap — use a warm/neutral derivative.
- 9:16: lower `size` (~110) and `breathe` (~0.15) — the fit width must be `studio.width - margin`, not the hard-coded 1700. Kicker tracking 0.55em can be too wide for small widths.
- Short (≤3 s): set `breathe` lower and the shuffle spread is already `D×0.22`; consider no fade-to-black if a transition follows. Long (8 s+): the breathe stretches automatically; add a second line (subtitle) later in the hold.

## Variations
- **Overlay mode**: drop `.bg`, `.vignette`, `.black`; keep grain at low opacity and add a soft text-shadow — a cinematic title over footage.
- **Left-to-right resolve**: replace the shuffle with sequential order and `from: 'start'` for a "writing" feel.
- **Two-word lockup**: title + thin italic "and" connector; kicker becomes a year/date.
- **Tracking out**: invert the breathe (tight → wide) for an ending card that "exhales".
- **Letterbox**: add 2.35:1 black bars that slide in during the fade from black.

## Pitfalls
- Tracking without matching `padding-left` makes centred text drift right as spacing changes.
- `filter: blur` on many large letters is heavy; keep titles short.
- Grain via `Math.random` per frame would differ between preview and export — bake seeded tiles as here.
- Fade-to-black end + a following transition = double darkness; disable `fadeBlack` when you cross-cut.
- Measure the fit at the widest tracking, not at the final tracking, or the opening frames overflow.

## Reference
Reference implementation: gallery/clips/title-cinematic/ (clip.js, style.css). Key snippet:

```js
    // letter-spacing breathes in over the whole clip
    tl.fromTo(title, { '--ls': (0.05 + p.breathe) + 'em' }, { '--ls': '0.05em', duration: D, ease: 'sine.out' }, 0);
    tl.fromTo(title, { scale: 1.04 }, { scale: 1, duration: D, ease: 'power1.out' }, 0);

    // letters resolve from blur in a shuffled (deterministic) order
    const order = chars.map((_, i) => i);
    const rnd = studio.random(5);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const spans = [...title.children];
    const spread = Math.min(1.2, D * 0.22);
    order.forEach((idx, k) => {
      tl.fromTo(spans[idx], { opacity: 0, filter: 'blur(18px)', y: 10 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 1.3, ease: 'power2.out' }, 0.4 + (k / Math.max(1, order.length - 1)) * spread);
    });
```

```js
    return {
      render(t) {
        if (!tiles.length) return;
        const f = Math.floor(t * 24);
        grainEl.style.backgroundImage = `url(${tiles[f % tiles.length]})`;
        grainEl.style.backgroundPosition = `${(f * 73) % 128}px ${(f * 37) % 128}px`;
      },
    };
```
