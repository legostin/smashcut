# Pill Highlight Captions

Clean sentence-case captions in balanced 1–2 line pages, where a single rounded pill glides from word to word as each one is spoken.

## Use it for
- Modern, minimal captions on tutorials, vlogs, podcasts, product and brand videos.
- Content where reading the whole sentence matters but you still want "where are we" emphasis.
- Brands with a strong single accent colour (the pill is the brand moment).

## Avoid when
- You need maximum hype (use caption-hormozi-bold or caption-mrbeast-pop).
- No transcript and the fallback timing is far from the real speech.
- Very fast speech: the pill jumps every ~0.15 s and becomes nervous.

## Anatomy
- Words: `studio.words` clipped to the clip, or the fallback `text` timed by weights (`length + 3`, +5 at sentence end, +3 at commas).
- **Pages**: words are first split into sentences (end punctuation or gaps > 0.7 s), then each sentence is split into `ceil(len/maxChars)` balanced pages; the split point is the one closest to the ideal length, with a bonus for breaking after `, ; : — –`. This is the key to captions that "read" well.
- Page timing: visible from first word − 0.16 s until `min(next page − 0.16, last end + 0.8)`.
- DOM: one `.page` per page (`left:50%`, `text-align:center`, `line-height:1.32`, `text-wrap: balance`, `word-spacing: .1em`), a `.pill` (absolute, z-index 0, soft shadow + inner top highlight) and `.w` spans.
- **Glue**: words of ≤ 2 letters (prepositions, articles) are wrapped with the next word in a `white-space:nowrap` span, so a line never ends on "a"/"в"/"to".
- **Fit**: font shrinks by 8 % steps until the page has ≤ `maxLines` distinct `offsetTop`s; then the page width is shrink-wrapped to the widest line and centred. Word rects are cached once in setup (`pg.rects`).
- Optional `.plate`: a translucent dark rounded rect via `::before` behind the whole page.
- Anchors: bottom 86 % (70 % vertical) with the **bottom edge** fixed, top 14 % (22 %) with top edge fixed, centre by middle. Width ≤ 72 % / 1400 px (84 % vertical). Sizes scale with `u = min(W,H)/1080`.

## Motion
- Page in: rise 12 px, fade and blur 4 → 0 px over 0.2 s (`outCubic`). Page out: lift 8 px + fade over the last 0.12 s (`inCubic`).
- Active word `k` = last word with `start ≤ t`; it is full opacity in `pillTextColor`, others at `inactiveOpacity` (0.85).
- Pill on the same line: x and width lerp from the previous word to the current one over 0.14 s (`outCubic`) — it glides.
- Pill on a new line or first word: no slide; it pops in place with scale `0.82 → 1` (`outBack`, 0.18 s) and a 0.06 s fade — avoiding an ugly diagonal swoop across lines.
- Pill padding = 0.17 × font size on each side, height = word height.
- Driven only by speech timing (`studio.words`).

## Adapt to the design system
- `pillColor` → `accent`, `pillTextColor` → `bg` or white depending on contrast, `textColor` → `text`. `radius` (0.3em) should follow the design radius; `0.5em` = full pill, `0.08em` = tag.
- `font` → `body`/`title` role at 600–700 weight — this technique is about restraint; avoid display faces.
- 9:16: the clip already switches to 84 % width and 70 % anchor; keep `maxLines` 2 and `maxChars` ~28–32. 16:9: 66 px at 1080p is right.
- Use `plate: true` when the footage is bright or busy.

## Variations
- **Underline glide**: same lerp logic, but the pill is a 0.08em bar under the word.
- **Outline pill**: transparent fill with a 2 px accent border — lighter, more editorial.
- **Spoken-colour only**: no pill, inactive words at 0.5 opacity, active at 1 — minimal "read-along".
- **Two-speaker**: pill colour per speaker, page alignment left/right per speaker.
- **Keyword pill**: pill only lands on emphasis words; other words just brighten.

## Pitfalls
- Measuring rects before fonts load breaks the pill position — the clip awaits `document.fonts.load`, then measures once.
- If you change font size at render time, cached `pg.rects` become wrong; keep geometry fixed after setup.
- `text-wrap: balance` plus shrink-wrapping is what keeps lines centred and even — dropping either gives ragged pages.
- Low contrast between `pillTextColor` and `pillColor` (e.g. white on yellow) — verify with real tokens.
- Bottom anchor 86 % on 16:9 is close to the edge; with `plate` the plate inset extends further down — check title-safe.

## Reference
Reference implementation: gallery/clips/caption-pill-highlight/ (clip.js, style.css). Key snippet:

```js
          if (k < 0) { pg.pill.style.opacity = 0; continue; }
          const r1 = pg.rects[k];
          const r0 = k > 0 ? pg.rects[k - 1] : r1;
          const sameLine = Math.abs(r0.y - r1.y) < 2;
          const m = E.outCubic(studio.progress(t, pg.words[k].start, 0.14));
          const pad = pg.fs * 0.17;
          let x = r1.x, y = r1.y, w = r1.w, sc = 1;
          if (k > 0 && sameLine) { x = r0.x + (r1.x - r0.x) * m; w = r0.w + (r1.w - r0.w) * m; }
          else sc = 0.82 + 0.18 * E.outBack(studio.progress(t, pg.words[k].start, 0.18));
          x -= pad; w += pad * 2;
          pg.pill.style.opacity = k > 0 && sameLine ? 1 : Math.min(1, studio.progress(t, pg.words[k].start, 0.06));
          pg.pill.style.width = w + 'px';
          pg.pill.style.height = r1.h + 'px';
          pg.pill.style.transform = `translate(${x}px, ${y}px) scale(${sc})`;
```

```js
        const short = w.text.replace(/[^\p{L}\p{N}]/gu, '').length <= 2 && !/[.,!?…;:]$/.test(w.text) && i < pg.words.length - 1;
        if (glue) { glue.appendChild(document.createTextNode(' ')); glue.appendChild(s); if (!short) glue = null; }
        else if (short) { glue = document.createElement('span'); glue.className = 'g'; glue.appendChild(s); d.appendChild(glue); }
        else d.appendChild(s);
```
