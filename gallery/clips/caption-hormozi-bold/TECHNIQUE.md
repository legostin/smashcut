# Hormozi Bold Captions

Heavy all-caps captions shown 1–3 words per "page", with a thick black stroke; the spoken word snaps to yellow with a quick pop and emphasis words (and numbers) turn green.

## Use it for
- Talking-head business, education and motivation shorts/reels where retention matters.
- Fast speech: tiny pages keep up with 3–4 words per second.
- Over any footage — the stroke + shadow make it legible on everything.

## Avoid when
- The tone is calm, premium or editorial — it shouts. Use caption-pill-highlight or caption-karaoke.
- Viewers need to read full sentences (tutorial steps, quotes): 1–3 word pages fragment meaning.
- 16:9 cinematic content where captions should be small and low.

## Anatomy
- Words come from `studio.words` (clip-local `{text,start,end}`, clipped to `[0, D]`); fallback: the `text` param spread over the clip with weights `length + 3`, +5 after `.!?…`, +2 after `,;:—` (so the fake timing pauses at punctuation like speech).
- **Pagination**: a new page starts when it would exceed `maxWords` (3) or `maxChars` (18), on a silence gap > 0.5 s, or after punctuation. Each page shows from its first word start until `min(next page start, last end + 0.45)`; the final page holds 0.6 s.
- **Emphasis**: comma list in `emphasis`, normalised with a Unicode-aware regex (`/[^\p{L}\p{N}%$€₽]+/gu`) so "results," matches "results"; `emphasizeNumbers` marks any token with a digit.
- **DOM**: one absolutely positioned `.page` per page (flex row, centred, `white-space: nowrap`, `line-height:1`), spans `.w` per word.
- **Stroke**: `-webkit-text-stroke: var(--sw) #000; paint-order: stroke fill` — the stroke is drawn behind the fill, so it can be 2× thick without eating the letters (`--sw = strokeWidth*2*u`). Plus a hard + soft black `text-shadow`.
- **Fit**: page width is measured after `document.fonts.load`; if it exceeds 80 % (86 % vertical) of width and shrinking would go below 78 %, it wraps to two lines, otherwise it scales the font down. Stroke scales with the font.
- Position: `auto` = 76 % of height on 16:9, 64 % on 9:16 (above the platform UI). Units scale by `u = min(W,H)/1080`.

## Motion
- All in `render(t)`; pages switch by `visibility` — hard cuts on word timing, which is the look.
- Page snap-in: scale `0.8 → ~1.06 → 1` over 0.2 s (≈6 frames) using `backOut(k, 3)` — big overshoot, fast settle.
- Active word: scale pops to `1 + 0.12` (0.18 for emphasis words) with `backOut(…, 2.2)` over 0.14 s, then relaxes back over 0.1 s (`outCubic`) when the next word starts. Its horizontal **margin grows by half the extra width**, so neighbours slide apart instead of overlapping — a small detail that makes it feel physical.
- Colour: active word = `highlightColor`; emphasis words switch to `altHighlightColor` once spoken and **stay** green; others stay white.
- Final page only: shrinks 15 % and fades over the last 0.14 s (`inCubic`).
- Optional `tilt`: seeded ±2.2° rotation per page (`studio.random(77)`).
- Word timing = speech timing; nothing is on the beat grid. For music-only shorts, generate words from `studio.beats` instead.

## Adapt to the design system
- `textColor` → `text`, `highlightColor` → `accent`, `altHighlightColor` → `accent-2` (key-name binding). The yellow/green pair is the genre signature; if the brand accent is dark (navy, purple), keep the text white and use the accent only for emphasis, or the active word becomes unreadable on the black stroke.
- `font` → `display` role; needs a 800–900 weight face (Inter 900, Manrope 800). Size 100–130 px at 1080p.
- 9:16 (primary format): `auto` places it at 64 %; maxW 86 % of width. 16:9: smaller size (~80–90 px) and lower (80 %).
- Long clips work out of the box (pages follow words). Very short clips with fallback text: shorten the text, not the timing.

## Variations
- **Single word mode**: `maxWords: 1`, size 150+ — pure punch, closer to caption-mrbeast-pop.
- **Background box**: replace the stroke with a rotated black rectangle behind the active page.
- **Emoji pop**: append a keyword-mapped emoji above emphasis words with the same back-out scale.
- **Sentence-case clean**: `uppercase:false`, stroke 6, no shadow, white/accent only — "Hormozi lite" for brands.
- **Beat captions**: build `words` from lyric lines with `start = studio.beat(n)`.

## Pitfalls
- `-webkit-text-stroke` on variable/display fonts (Unbounded) shows internal overlapping contours — the authoring skill recommends an SVG `feMorphology` dilate outline for those; Inter/Manrope are safe.
- Measuring before fonts load gives wrong widths → overflow. The clip awaits `document.fonts.load` first.
- Pages must not overlap in time: `pg.to = min(next.start, …)`. If you add exit animations, keep them inside that window.
- Without the margin compensation, the popped word collides with its neighbours.
- Cyrillic: words are ~20 % longer; lower `maxChars` or size.
- Keep it out of the bottom 18 % on vertical — that's where platform UI sits.

## Reference
Reference implementation: gallery/clips/caption-hormozi-bold/ (clip.js, style.css). Key snippet:

```js
          pg.words.forEach((w, i) => {
            const nextStart = i < pg.words.length - 1 ? pg.words[i + 1].start : Infinity;
            const active = t >= w.start && t < nextStart;
            const sp = pg.spans[i];
            const peak = w.emph ? 0.18 : 0.12;
            let ws = 1;
            if (active) ws = 1 + peak * Math.min(1.25, backOut(studio.progress(t, w.start, 0.14), 2.2));
            else if (t >= nextStart) ws = 1 + peak * (1 - E.outCubic(studio.progress(t, nextStart, 0.1)));
            sp.style.transform = `scale(${ws})`;
            sp.style.margin = `0 ${pg.gap + ((ws - 1) * pg.widths[i]) / 2}px`; // neighbours make room for the pop
            sp.style.color = w.emph && t >= w.start ? p.altHighlightColor : active ? p.highlightColor : p.textColor;
          });
```

```css
.hz .w { position: relative; display: inline-block; transform-origin: 50% 60%;
  -webkit-text-stroke: var(--sw) #000; paint-order: stroke fill; }
.hz.shadow .w { text-shadow: 0 0.07em 0.02em rgba(0,0,0,.9), 0 0.1em 0.28em rgba(0,0,0,.55); }
```
