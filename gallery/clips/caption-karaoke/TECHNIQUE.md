# Karaoke Captions

Social-style captions that show the transcript phrase by phrase (up to ~5 words) and light up each word exactly when it is spoken — with a highlight box that slides from word to word, a colour change, or an underline.

## Use it for
- Talking-head and voice-over videos where the viewer reads along (vlogs, explainers, interviews, podcasts).
- Accessibility captions that still feel designed.
- Lyric videos when you have word timings.

## Avoid when
- There is no transcript and the fallback timing would visibly mismatch real speech — get `studio.words` first (transcribe).
- You want maximum energy (use caption-hormozi-bold / caption-mrbeast-pop) or a single sliding pill with sentence-case minimalism (caption-pill-highlight is the more polished version of the slide).

## Anatomy
- Words: `studio.words` clipped to the clip, or the fallback `text` spread over the clip with weights `length + 3` (+4 after `.!?…`, +2 after `,;:—`).
- **Phrases** break on `maxWords` (5), `maxChars` (32), a gap > 0.7 s, or sentence end. Visible from `start − 0.08` to `min(next.start − 0.08, end + 0.7)` (final: `end + 0.8`).
- DOM: `.kar` container (left/right 160 px; `bottom: 150px`, centre or `top: 130px`), one `.cap` per phrase stacked at the same position, each with a `.pill` (absolute, behind words, z-index 0) and `.w` spans (`inline-block`, padding 0 0.13em, z-index 1) joined by real text-node spaces so the phrase wraps naturally.
- Styles: `box` (pill behind the word, text switches to `highlightText`), `color` (word turns `highlight`, no pill), `underline` (pill flattened to a 0.1 em bar at 86 % of the line height, radius 0.06em).
- Upcoming words are dimmed (`upcomingOpacity` 0.55), spoken words full opacity — the reader sees the whole phrase but knows where speech is.
- Shadow mode: layered text-shadows for legibility; removed on the boxed word; pill gets a soft drop shadow.

## Motion
- Phrase in: opacity over 0.1 s, `translateY 26px → 0` and `scale 0.94 → 1` with `outBack` over 0.22 s. Phrase out: last 0.14 s fades and lifts 10 px.
- Active word index `k` = last word whose `start ≤ t`.
- The pill **slides**: its rect is lerped from the previous word's `offsetLeft/Top/Width` to the current one over 0.1 s (`outCubic`). It crosses lines too (y is lerped). On the first word of a phrase it grows in with `outBack` (0.16 s) instead.
- Which word is "boxed" switches at 50 % of the slide, so text colour flips when the pill is mostly under it.
- Current word pops: scale `1.08 → 1` over 0.18 s (`outCubic`).
- Everything is driven by speech timing (`studio.words`); no beat sync.

## Adapt to the design system
- `textColor` → `text`, `highlight` → `accent`, `highlightText` → `bg` (via key names). Ensure `highlightText` on `accent` has ≥ 4.5:1 contrast.
- `font` → display/title role at 800 weight; pill radius `0.18em` should follow the design radius (square for brutalist, full-round for soft).
- Size and margins are absolute px (72 px, left/right 160, bottom 150) — they do not scale with resolution. For 9:16 in an original clip: size ~64–80 px at 1080 wide, side margins ~8 % of width, and **bottom ≥ 20 % of height** (≈ 380 px) to stay above platform UI; `maxChars` ~22.
- Long durations: nothing to change, phrases follow words. Short single-phrase clips: lower `maxWords` so the phrase isn't on screen before it is spoken.

## Variations
- **Two-line page**: raise `maxChars` to ~42 and let it wrap; the pill lerps across lines.
- **Word reveal**: set `upcomingOpacity: 0` so words appear as they are spoken.
- **Speaker colours**: map words to speakers (from your transcript) and swap `highlight` per phrase.
- **Underline editorial**: `style: underline`, Manrope 700, no uppercase, shadow off over a plate.
- **Keyword accent**: second colour for emphasis words (borrow the emphasis-set logic from caption-hormozi-bold).

## Pitfalls
- All phrases share one position; if you add a phrase exit that overlaps the next phrase's entry, they stack illegibly. Keep `showTo ≤ next.start − 0.08`.
- `offsetLeft/offsetWidth` are read in `render` every frame — fine for 5 words, but cache rects in setup if you add many.
- `.w` padding (0.13em) is what makes the pill wider than the glyphs; removing it makes the box tight and cramped.
- Fallback timing only looks right if the text roughly matches the speech length of the clip.
- Hard-coded 1600 px max width / 160 px margins break on vertical frames — recompute from `studio.width`.

## Reference
Reference implementation: gallery/clips/caption-karaoke/ (clip.js, style.css). Key snippet:

```js
          // highlight box slides between words
          if (k < 0 || p.style === 'color') { c.pill.style.opacity = 0; continue; }
          const r1 = rect(c.spans[k]);
          const r0 = k > 0 ? rect(c.spans[k - 1]) : r1;
          const m = slide;
          const lerp = (a, b) => a + (b - a) * m;
          let x = lerp(r0.x, r1.x), y = lerp(r0.y, r1.y), w = lerp(r0.w, r1.w), h = r1.h;
          const grow = k === 0 ? E.outBack(studio.progress(t, c.words[0].start, 0.16)) : 1;
          if (p.style === 'underline') { y = y + h * 0.86; h = Math.max(6, p.size * 0.1); }
          else { y += h * 0.04; h *= 0.94; }
          c.pill.style.opacity = 1;
          c.pill.style.width = w + 'px';
          c.pill.style.height = h + 'px';
          c.pill.style.transform = `translate(${x}px, ${y}px) scale(${grow})`;
```
