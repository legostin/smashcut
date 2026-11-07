# Kinetic Words Title

A big multi-line statement where every word rises through its own mask, one after another, and `*accent*` words get a colour block that wipes in behind them.

## Use it for
- Openers, chapter cards, the one-line "thesis" of a video, punchy claims over footage.
- Statements of 3–10 words that should be read as a rhythm, not all at once.
- Beat-synced intros: one word (or line) per beat.

## Avoid when
- The text is a sentence of 15+ words: the stagger makes the last word arrive late. Use a line-mask reveal or a caption technique instead.
- The copy must be read instantly (a disclaimer, legal text): word-by-word reveal slows reading.
- There is already a lot of motion on screen; this is a hero technique and wants a calm background.

## Anatomy
- `.kt` container, absolutely positioned between `left/right: 140px`, vertically centred with `translateY(-50%)`; `.center` switches to centred text.
- Optional **eyebrow**: a short accent bar `<i>` (scaleX from 0) and a small uppercase label (Manrope 600, 30 px, tracking 0.32em) inside an `overflow:hidden` row.
- **Lines**: one `.line` per row of the textarea (`white-space: nowrap`), so line breaks are authored, never automatic.
- **Words**: each word is `.w` (`display:inline-block; overflow:hidden`) = the mask, containing `.wi` = the moving glyphs. The mask has padding + equal negative margin (`padding: .06em .04em .1em; margin: -.06em -.04em -.1em`) so ascenders/descenders and the rotate do not get clipped, while layout stays unchanged.
- **Highlight**: tokens matching `*...*` (regex `/\*[^*]+\*|\S+/g`, so a highlight group can contain spaces) get an absolutely positioned `.bg` block in the accent colour, `transform-origin: left`, text switches to `accentText`.
- Gaps between words are explicit `.gap` spans (0.28em) instead of spaces, so inline-block masks do not collapse whitespace unpredictably.
- **Auto-fit**: after `document.fonts.load`, the widest line's `scrollWidth` is measured and the font size scaled down to fit the safe width.
- Type: weight 900, `line-height: 1.06`, `letter-spacing: -0.035em` (-0.045em for Manrope/Inter at 800). Optional soft `text-shadow` for busy footage.

## Motion
- 0.05 s: eyebrow bar grows (`scaleX 0→1`, 0.5 s, `expo.out`); 0.12 s: eyebrow label rises from `yPercent 120` (0.6 s, `expo.out`).
- 0.15 s + i × 0.11 s: each word rises `yPercent 115 → 0` with `rotate 5 → 0` around its bottom-left corner (`transformOrigin '0% 100%'`), 0.75 s `expo.out`. The tiny rotation is the secondary motion that makes it feel thrown rather than slid.
- Highlight words: the block wipes in 0.08 s **before** the word (anticipation; 0.55 s `expo.inOut`), and the word's colour flips to `accentText` 0.2 s into its rise, once it is on the block.
- Whole duration: `lines` scales 0.985 → 1.015 linearly (slow push keeps the hold alive), origin matches the alignment.
- Exit: starts at `duration - min(0.8, duration*0.2) - 0.05`; words leave upward `yPercent -115` through the same masks (`power3.in`, ~0.44 s) with a tight stagger (≤0.04 s); highlight blocks retract to the right; eyebrow follows.
- Exit always ends at the clip end because it is computed from `duration` — never hard-code the exit time.
- Beat sync: replace `t0 + i * st` with `studio.beat(i)` (or `studio.beat(i * 2)` for half-time) to land each word on a beat; keep the 0.75 s ease, it overlaps the next word naturally.

## Adapt to the design system
- Colours: the runtime binds by key name — `accent` → `accent`, `accentText` → `bg`, but the generic key `color` also matches the **accent** rule, so with a design system the main text turns accent-coloured unless the param declares `"token": "text"`. In an original clip use `var(--color-text)`, `var(--color-accent)`, `var(--color-bg)` directly (or name the param `textColor`).
- Type: `font` binds to the `display` role; use `var(--font-display)` / `var(--weight-display)` and the design's tracking instead of the fixed -0.035em. Eyebrow should use the caption/body role.
- Radius: the highlight block uses `0.06em`; match the system (`0` for brutalist, `0.2em` for soft brands).
- Motion: the entrance ease/duration can come from `studio.design.motion('enter')`; the exit from `motion('exit')`.
- 9:16: the auto-fit uses a hard-coded `1920 - 280` width; in your clip use `studio.width - 2 * margin`. Use fewer words per line (2–3), larger size (~120–160 px at 1080 wide), centre alignment, and keep the block inside the middle 60 % of the height.
- Short clips (≤2.5 s): reduce stagger to 0.05–0.07 s and word count, or the exit eats the hold. Long clips (8 s+): keep the entrance timing and let the slow push carry the hold; consider a second statement instead of a 6-second hold.

## Variations
- **Line-by-line**: stagger per `.line` instead of per word (one mask per line) for long statements — faster to read.
- **Beat words**: one word per beat via `studio.beat(n)`, highlight words on downbeats (`studio.bars`).
- **Drop-down**: invert to `yPercent -115 → 0` with `rotate -5` for a "falling" feel; exit downward.
- **Underline accent**: replace the `.bg` block with a 0.08em bar at the baseline (same scaleX wipe) for an editorial look.
- **Replace-the-word**: keep two lines static and cycle the accent word through 3 options with the same mask rise/exit.

## Pitfalls
- Without the padding/negative-margin trick the mask clips descenders and the rotated corner.
- Auto-wrapping inside a line breaks the mask layout — keep `white-space: nowrap` and fit-to-width instead.
- Measure only after fonts are loaded, otherwise the fit uses fallback-font widths.
- Stagger × word count must stay under ~1.2 s, or the `__energy` remap and the exit will collide with late words.
- Highlight text must contrast with the accent (dark text on lime, white on deep blue) — check with the real tokens.
- User text goes in with `textContent`, never `innerHTML`.

## Reference
Reference implementation: gallery/clips/title-kinetic-words/ (clip.js, style.css). Key snippet:

```js
words.forEach((w, i) => {
  const at = t0 + i * st;
  const inner = w.querySelector('.wi');
  tl.fromTo(inner, { yPercent: 115, rotate: 5, transformOrigin: '0% 100%' }, { yPercent: 0, rotate: 0, duration: 0.75, ease: 'expo.out' }, at);
  const bg = w.querySelector('.bg');
  if (bg) {
    tl.fromTo(bg, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: 'expo.inOut' }, at - 0.08);
    tl.fromTo(inner, { color: p.color }, { color: p.accentText, duration: 0.2, ease: 'none' }, at + 0.2);
  }
});
// slow push for life during the hold
tl.fromTo(lines, { scale: 0.985, transformOrigin: p.align === 'center' ? '50% 50%' : '0% 50%' }, { scale: 1.015, duration, ease: 'none' }, 0);

// exit: words leave upward through the same masks, ending at the clip end
const exitDur = Math.min(0.8, duration * 0.2);
const exitSt = Math.min(0.04, (exitDur * 0.5) / Math.max(1, words.length));
const out = Math.max(0.5, duration - exitDur - 0.05);
words.forEach((w, i) => {
  tl.to(w.querySelector('.wi'), { yPercent: -115, duration: exitDur * 0.55, ease: 'power3.in' }, out + i * exitSt);
  const bg = w.querySelector('.bg');
  if (bg) tl.to(bg, { scaleX: 0, transformOrigin: 'right center', duration: exitDur * 0.5, ease: 'power3.in' }, out + i * exitSt);
});
```

```css
.kt .w { display: inline-block; overflow: hidden; vertical-align: top; padding: 0.06em 0.04em 0.1em; margin: -0.06em -0.04em -0.1em; position: relative; }
.kt .wi { display: inline-block; position: relative; will-change: transform; }
.kt .w.hl .wi { color: var(--accentText); padding: 0 0.12em; }
.kt .w.hl .bg { position: absolute; inset: 0.02em 0 0.04em; background: var(--accent); transform-origin: left center; border-radius: 0.06em; }
```
