# Quote Card

A full-frame typographic quote: an oversized opening quotation mark lands, the quote resolves word by word out of blur with `*highlighted*` phrases, a short rule draws and the author fades in.

## Use it for
- Testimonials, customer quotes, expert citations, pull quotes in documentaries.
- Social "quote posts" (square/vertical) and slow, reflective moments between scenes.
- Any text that should be read in full and attributed.

## Avoid when
- The quote is over ~260 characters — even auto-sized it becomes a wall of text; cut it.
- You need it over footage: this paints its own background (adapt to a plate if you need an overlay).
- High-energy edits — the blur-resolve is deliberately calm.

## Anatomy
- `.qc` fills the frame (`inset: 0; overflow: hidden`).
- `.bg`: radial gradient `ellipse 70% 80% at 30% 40%` from `bg2` (glow) to `bg` — off-centre light gives depth without an image.
- `.glyph`: a giant closing quote `”` (Playfair 900, 900 px) parked bottom-right at 6 % opacity — a watermark texture.
- `.wrap` (left/right 230 px, vertically centred) holds: `.mark` opening quote `“` in accent (260 px with `line-height: 0.6` and fixed 120 px height so it does not push the text down), `.q` quote, `.rule` (110 × 5 px accent bar), `.author` (Manrope 700, 42 px) and `.role` (Inter 28 px at 0.6 opacity).
- Words are `<span class="w">` (`inline-block; white-space: pre`) separated by real text-node spaces so wrapping still works. `*phrase*` may span several words — a flag stays on until the token that ends with `*` (trailing punctuation ignored); highlighted words get the accent colour and weight 700 for Playfair.
- Auto size by character count: `<50 → 112`, `<90 → 90`, `<160 → 70`, `<260 → 54`, else `44` px. Then a vertical fit: if `.wrap` is taller than 960 px the size is scaled by `sqrt(900 / height)`.

## Motion
- Whole clip: background scales 1.12 → 1 (`power1.out`) — a slow pull-back; the watermark glyph drifts up from `y 120, rotate 8` to rest (`power2.out`) over the full duration.
- 0.1 s: the opening mark lands `y 60, scale 0.6 → 1` with `back.out(1.8)` (0.8 s) — the only overshoot in the piece, it sets the "landing" beat.
- 0.55 s: words resolve `y 26, opacity 0, blur 10px → 0` (0.7 s `power3.out`), stagger `min(wordStagger, D×0.35 / words)` — long quotes automatically stagger faster so the reveal stays inside ~35 % of the clip.
- `tEnd - 0.3` (tEnd = 0.55 + words × stagger + 0.5): the rule wipes in (`scaleX`, `expo.inOut`, 0.6 s), overlapping the last words.
- `tEnd`: author then role rise 20 px (0.6 s `power3.out`, 0.1 s stagger; role to 0.6 opacity).
- Exit at `D - 0.8`: mark, quote, rule, author, role lift `y -30` and fade (`power2.in`, 0.5 s, 0.05 s stagger). The background stays — the card can cut to the next scene or be covered by a transition.
- Reading time: keep ≥ 0.3 s per word + 1 s of hold between the author fade and the exit; lengthen the clip rather than speeding the stagger.

## Adapt to the design system
- `bg` → `bg`, `bg2` → choose a `surface` or a darkened accent for the glow, `textColor` → `text`, `accent` → `accent` (key-name binding does this for `bg`, `textColor`, `accent`; `bg2` is mapped to `surface`).
- Quote font: use the system's display/title role; serif (Playfair) reads "editorial", a grotesk reads "product". Author line = title/body role, role line = caption role in `muted`.
- Rule radius/height and the mark style should match the system (square rule for brutalist, a pill for soft).
- 9:16: reduce the side margin (230 → ~90 px), push the auto sizes up ~10 % (narrower measure = more lines), and keep the block in the middle 60 % height. The 960 px fit assumes a 1080 tall frame — use `studio.height * 0.85`.
- Long durations: keep the entrance timing; add a slow `scale 1 → 1.03` push on `.wrap` during the hold.

## Variations
- **Overlay quote**: drop `.bg`/`.glyph`, put the wrap on a translucent surface plate with radius — usable over interview footage.
- **Photo attribution**: add a round author photo next to the name, popping in with the author line.
- **Line-mask resolve**: replace the blur with per-line masks (see title-line-mask-reveal) for a crisper, more premium feel.
- **Highlighter**: instead of coloured text, animate a marker swipe (`scaleX` block behind the highlighted words) after the words resolve.
- **Spoken quote**: when VO reads the quote, time each word's reveal to `studio.words[i].start` instead of a fixed stagger.

## Pitfalls
- `white-space: pre` on each word plus a separate text-node space is what keeps wrapping working; putting the space inside the span breaks line wrapping.
- Blur filters on hundreds of words are expensive; keep quotes short.
- Highlight markers inside punctuation (`*word*,`) must still close — the code strips trailing punctuation before testing `endsWith('*')`.
- Opening mark with a normal line-height pushes the text down by ~200 px; keep `line-height: 0.6` + fixed height.
- Accent text on a dark glow needs contrast — check the accent against both `bg` and `bg2`.

## Reference
Reference implementation: gallery/clips/quote-card/ (clip.js, style.css). Key snippet:

```js
    const st = Math.min(p.wordStagger, (D * 0.35) / Math.max(1, words.length));
    const tW = 0.55, tEnd = tW + words.length * st + 0.5;
    const out = Math.max(0.8, D - 0.8);
    tl.fromTo($('.bg'), { scale: 1.12 }, { scale: 1, duration: D, ease: 'power1.out' }, 0)
      .fromTo(glyph, { y: 120, rotate: 8, opacity: 0 }, { y: 0, rotate: 0, opacity: 0.06, duration: D, ease: 'power2.out' }, 0)
      .fromTo($('.mark'), { y: 60, scale: 0.6, opacity: 0, transformOrigin: p.align === 'center' ? '50% 50%' : '0% 50%' }, { y: 0, scale: 1, opacity: 1, duration: 0.8, ease: 'back.out(1.8)' }, 0.1)
      .fromTo(words, { y: 26, opacity: 0, filter: 'blur(10px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', stagger: st }, tW)
      .fromTo($('.rule'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.inOut' }, tEnd - 0.3)
      .fromTo([$('.author'), $('.role')], { y: 20, opacity: 0 }, { y: 0, opacity: (i) => (i ? 0.6 : 1), duration: 0.6, ease: 'power3.out', stagger: 0.1 }, tEnd)
      // exit: content lifts away, background stays
      .to([$('.mark'), q, $('.rule'), $('.author'), $('.role')], { y: -30, opacity: 0, duration: 0.5, ease: 'power2.in', stagger: 0.05 }, out);
```

```css
.qc .mark { font: 900 260px/0.6 'Playfair Display', serif; height: 120px; margin-bottom: 30px; }
.qc .q { line-height: 1.18; letter-spacing: -0.01em; }
.qc .q .w { display: inline-block; white-space: pre; }
```
