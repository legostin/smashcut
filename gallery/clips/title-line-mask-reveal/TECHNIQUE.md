# Editorial Line Mask Reveal

A premium editorial title: each line slides up from behind its own mask (or rotates up, or resolves from blur with tightening tracking), with an eyebrow label, a hairline rule and a subtitle.

## Use it for
- Chapter cards, documentary and brand-film titles, elegant statements over footage.
- Section openers in explainers and keynotes; "about us" headlines.
- Any 1–4 line headline where the whole line should read at once (faster than word-by-word).

## Avoid when
- You want punch/energy — use a kinetic-word or stomp technique instead.
- A single line longer than ~30 characters: lines never wrap, they are shrunk to fit, so long lines become small.
- Lines must reflow responsively (e.g. user text of unknown length in 9:16) — you must author the line breaks.

## Anatomy
- `.lm` block between `left/right: 160px`, vertically centred; `.center` variant centres everything (eyebrow via `justify-content`, rule from the centre).
- **Eyebrow**: a 64 × 2 px accent bar `<i>` + uppercase Manrope 600 label (28 px, tracking 0.34em, accent colour) inside a `.clip` mask.
- **Lines**: each row of the textarea is `.line.clip` (the mask) containing `.in` (the moving block). `*accent*` segments become `.acc` spans in the accent colour. For the `blur` variant every character is wrapped in `.ch` (`inline-block; white-space: pre`).
- `.clip` mask = `overflow: hidden; display: block` with `padding: .1em 0 .14em; margin: -.1em 0 -.14em` — room for ascenders/descenders without changing layout.
- Type: chosen font with a weight pair table (Playfair 400/700, Manrope/Inter 500/800, Unbounded 400/800), `line-height: 0.98`, `letter-spacing: -0.025em` (-0.04em for Unbounded).
- **Foot**: hairline `.rule` (1 px, `currentColor` at 0.45 opacity) whose width is set to the widest line, then `.sub` subtitle (Manrope 500, 30 px, 0.78 opacity) in its own mask.
- Fit: after font load, font size is scaled so the widest line fits `studio.width - 320` (resolution-aware).
- Ease: `CustomEase.create('lmEditorial', '0.16,1,0.3,1')` — a long, soft expo-like out curve (the "editorial" feel). `index.html` loads `/vendor/gsap/CustomEase.min.js` and the clip calls `gsap.registerPlugin(CustomEase)`.

## Motion
- Time scale `k = min(1, D/4)` compresses everything for clips shorter than 4 s; stagger `= stagger × k`, entrance `inDur = 0.95 × max(0.6, k)`.
- 0.08 s: eyebrow bar grows (`scaleX`, `0.7k + 0.2` s), label rises from `yPercent 110` 0.06 s later.
- Lines start at `0.08 + 0.12k` (after the eyebrow): `slide` = `yPercent 112 → 0`; `rotate` = `yPercent 115, rotate 7 → 0` around bottom-left; both `lmEditorial`, 0.95 s, staggered 0.09 s per line.
- `blur` variant: per line, tracking `0.2em → 0` over `inDur × 1.4` while characters fade from `blur(12px)` with a tiny stagger (`min(0.025, 0.5/chars)`).
- Rule draws `scaleX 0 → 1` (`expo.inOut`, `1.1k + 0.2` s) starting half a stagger into the lines; subtitle rises after the last line.
- Hold: the line block drifts `x 0 → 14 px` (left-aligned only) and scales 1 → 1.02 linearly — barely visible, but the frame never freezes.
- Exit (`exitDur = min(0.55, D×0.14)`, faster than the entrance): lines leave upward `yPercent -112` through the same masks (`power3.in`, ≤0.06 s stagger), rotate variant tilts −4°; blur variant blurs out and opens tracking to 0.12em. Eyebrow and rule retract to the right (centre when centred).
- The exit start is clamped `max(lastIn × 0.85, …)` so it never starts before the entrance has mostly settled.

## Adapt to the design system
- `color` → main text, `accent` → eyebrow, rule colour reference, `*accent*` words. Note: the runtime's key-name heuristic binds `color` to the `accent` token; in your own clip set `"token": "text"` on the text-colour param or use `var(--color-text)` directly.
- Font → display role (`var(--font-display)`); eyebrow → caption role; subtitle → body role in `muted`.
- Ease: if the design has a motion token for `enter`, use its ease string; otherwise keep the custom curve — it is the core of the look.
- 9:16: `maxW` already uses `studio.width`; author 2–3 words per line, raise `size` relative to width (~130–150 at 1080 wide), reduce side margins to ~80 px, keep the block in the middle 60 % height.
- Short (≤2.5 s): `k` compresses automatically; drop the subtitle. Long: entrance stays the same; the slow drift carries the hold — consider adding a slow parallax background rather than more text motion.

## Variations
- **Per-word masks within lines**: combine with kinetic-words when one line should land word by word.
- **Underline sweep**: rule grows under the accent word instead of under the block.
- **Down reveal**: `yPercent -112 → 0` (lines drop from above) for endings.
- **Two-tone**: odd lines in `text`, even in `muted`, accent word only once.
- **Section card**: eyebrow as a big chapter number ("02") in a mono font with the same mask rise.

## Pitfalls
- Without the mask padding/negative margin, descenders (g, y, p) and the rotate variant get clipped.
- Lines never wrap (`white-space: nowrap`) — always fit to width after fonts load, as the reference does.
- The blur variant creates a span per character and animates `filter` — fine for titles, too heavy for paragraphs.
- Don't forget the CustomEase plugin script in `index.html` when reusing the ease, or `CustomEase` is undefined.
- Accent on a light footage background: the soft shadow helps, but check contrast of the accent colour.

## Reference
Reference implementation: gallery/clips/title-line-mask-reveal/ (clip.js, style.css). Key snippet:

```js
    // ---- timing (compressed for short items) ----
    const k = Math.min(1, D / 4);
    const st = p.stagger * k;
    const inDur = 0.95 * Math.max(0.6, k);
    const t0 = 0.08;
    const tLines = eyebrow ? t0 + 0.12 * k : t0;
    const inners = lineEls.map((l) => l.firstChild);
    const lastIn = tLines + st * (inners.length - 1) + inDur;
    const exitDur = Math.min(0.55, D * 0.14);
    const exitSt = Math.min(0.06, exitDur * 0.35 / Math.max(1, inners.length));
    const out = Math.max(lastIn * 0.85, D - exitDur - exitSt * inners.length - 0.12);
```

```js
    } else {
      const from = variant === 'rotate' ? { yPercent: 115, rotate: 7, transformOrigin: '0% 100%' } : { yPercent: 112 };
      tl.fromTo(inners, from, { yPercent: 0, rotate: 0, duration: inDur, ease, stagger: st }, tLines);
    }
```

```css
.lm .clip { overflow: hidden; display: block; padding: 0.1em 0 0.14em; margin: -0.1em 0 -0.14em; }
.lm .clip > span { display: block; }
.lm .lines { line-height: 0.98; letter-spacing: -0.025em; }
```
