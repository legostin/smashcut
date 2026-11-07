# Beast Pop Words

One huge word at a time that pops in with overshoot and a tilt, sits on a chunky stacked-shadow 3D extrude with a black outline, and turns yellow / green / red when it is a keyword (numbers and money automatically).

## Use it for
- High-energy viral shorts: challenges, reactions, "I spent $1,000,000 on…" hooks.
- The first 3 seconds of a short, where every word must hit.
- Gaming / kids / entertainment content cut fast.

## Avoid when
- Speech is fast and dense (> 4 words/s): one word per frame flickers. Use caption-hormozi-bold (pages of 1–3 words).
- Corporate, educational or calm content — it is deliberately loud.
- The word must sit next to a face in 16:9 — it is centred and huge.

## Anatomy
- Words: `studio.words` clipped to the clip, or the fallback `text` timed by `length + 4` weights (+5 at sentence end, +2 at commas).
- **Keywords**: comma list where an entry can be a multi-word phrase ("one rule") — matched as a consecutive word sequence after normalisation (`/[^\p{L}\p{N}%$€₽]+/gu`). Each keyword/phrase gets the next colour of `keyColor1..3` in rotation; `autoKeywords` makes any token with a digit a keyword.
- Each word is one absolutely positioned `.word` div centred at `left:50%` with `marginLeft = -width/2`, `top = pos*H - height/2`; scaled down to fit 78 % (84 % vertical) of width.
- **Outline**: `-webkit-text-stroke: var(--sw) #000; paint-order: stroke fill` (stroke behind fill, ×2 width).
- **3D extrude**: one hard `text-shadow` per pixel of depth — `${i*0.55}px ${i}px 0 #000` for i = 1..depth (15 px at 1080p) — plus a soft blurred shadow at the end. Passed as a CSS variable `--ex`.
- Per-word seeded randomness (`studio.random(seed)`): entry tilt side `±rotationRange`, settle tilt within ±3°, shake phases.
- Position: `auto` = 62 % height (60 % vertical).

## Motion
- All in `render(t)`; a word is visible from its start to the next word's start (or `end + 0.3` if a pause > 0.6 s follows; last word holds 0.5 s).
- Pop: scale `0.3 → popScale (1.25)` in `pd` = 0.05–0.1 s (≈2–3 frames, `outQuad`), then `→ 1` over `pd*1.2` (`inOutQuad`). Short words pop faster (`pd = 30 %` of their window).
- Slow grow during the hold: +3 % scale over the word's life (keeps it alive).
- Rotation eases from the entry tilt (±8°) to a small residual tilt over 0.22 s (`outCubic`) — it never fully straightens, which reads as "hand-placed".
- Keywords: squash & stretch with `outElastic` after the pop — `scaleY 1.15 → 1`, `scaleX 0.92 → 1` over 0.45 s.
- Hold shake (after 0.18 s, ramping in over 0.2 s): ±2 px from two summed sines per axis with seeded phases — smooth, deterministic micro-jitter.
- Final word: shrinks 60 % and fades in the last 0.14 s (`inCubic`).
- Timing = speech; for music-driven hype text, set word starts to `studio.beat(n)`.

## Adapt to the design system
- `textColor` → `text`; `keyColor1` → `accent`, `keyColor2` → `accent-2` (by key name); `keyColor3` stays as a third pop colour — pick it from the palette's warm tone. The look depends on saturated keyword colours over a black outline; muted brand colours lose the effect.
- `font` → `display` role at 900 weight (Unbounded / Inter Black). Size 130–170 px at 1080 short side.
- 9:16 is the native format (maxW 84 %, 60 % height). In 16:9 reduce size (~110 px) and `shadowDepth` (~10).
- Duration-independent: words follow the transcript.

## Variations
- **Emoji companion**: a keyword-mapped emoji pops 0.05 s after the word, offset up-right, same overshoot.
- **Colour plates**: instead of coloured text, put keywords on a rotated colour block (white text) — stronger on busy footage.
- **Two-word stack**: show keyword phrases as a two-line stack instead of word by word.
- **Beat mode**: one word per beat from a hook line, with `studio.level()` driving extra scale on loud hits.
- **Calmer pop**: `popScale 1.08`, `rotationRange 2`, shake off — reads as bold captions for brands.

## Pitfalls
- The default font is Unbounded with `-webkit-text-stroke`: per the authoring skill, stroke on variable/display fonts can show internal overlapping contours — check the render or use Inter, or an SVG `feMorphology` outline.
- Stacked text-shadows are expensive with depth 30 on long clips; keep depth ≤ 20.
- Words shorter than ~0.12 s become single-frame flashes; merge them with the next word.
- Long words (Russian, German) get scaled to fit — check that a 14-letter word still reads at the reduced size.
- Don't randomise per frame; the clip seeds per word in setup so every render is identical.

## Reference
Reference implementation: gallery/clips/caption-mrbeast-pop/ (clip.js, style.css). Key snippet:

```js
          const lt = t - w.from;
          // pop: 0 → popScale over ~3 frames, settle to 1 over ~3 more
          const pd = Math.max(0.05, Math.min(0.1, (w.to - w.from) * 0.3)); // short words pop faster
          const a = studio.progress(lt, 0, pd), b = studio.progress(lt, pd, pd * 1.2);
          let s = lt < pd ? 0.3 + (p.popScale - 0.3) * E.outQuad(a) : p.popScale + (1 - p.popScale) * E.inOutQuad(b);
          s *= 1 + 0.03 * E.outQuad(studio.progress(lt, 0.2, Math.max(0.3, w.to - w.from)));
          const rot = w.rot0 + (w.rot1 - w.rot0) * E.outCubic(studio.progress(lt, 0, 0.22));
          // keyword squash & stretch
          let sy = 1, sx = 1;
          if (w.key) { const q = E.outElastic(studio.progress(lt, pd, 0.45)); sy = 1.15 - 0.15 * q; sx = 0.92 + 0.08 * q; }
```

```js
    const depth = p.shadowDepth * u;
    const ex = [];
    for (let i = 1; i <= Math.round(depth); i++) ex.push(`${(i * 0.55).toFixed(2)}px ${i}px 0 #000`);
    ex.push(`${(depth * 0.55 + 2 * u).toFixed(1)}px ${(depth + 10 * u).toFixed(1)}px ${(24 * u).toFixed(1)}px rgba(0,0,0,.45)`);
```
