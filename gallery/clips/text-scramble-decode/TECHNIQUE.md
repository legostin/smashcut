# Scramble Decode Text

A hacker-style headline that decodes from random glyphs into the final text (left-to-right with a riding block cursor, random, or centre-out), with a small tag above, a monospace subtitle that decodes a beat later, idle single-character glitches and a re-scramble exit.

## Use it for
- Tech, AI, cyber, security and "reveal the answer" moments; product names, codenames, passwords.
- Short headlines (1–4 words) and data-ish sublines (versions, specs, coordinates).
- Transitions between topics in dev/tool content: decode the next section title.

## Avoid when
- Emotional, warm or editorial stories — the glyph noise reads as cold/technical.
- Long body text: per-character noise is unreadable and expensive.
- Cyrillic text with a Latin-only charset looks odd mid-decode — supply a Cyrillic glyph set.

## Anatomy
- `.sd` block between `left/right: 140px`, vertically centred; `.left` alignment option.
- Rows: optional `.tag` (JetBrains Mono 26 px, tracking 0.2em, scramble colour), `.head` (main font, 128 px), optional `.sub` (JetBrains Mono 32 px, tracking 0.06em), and a 2 px `.bar` underline.
- Every character is a `.c` span (`inline-block`, `white-space: pre`, centred).
- **Fixed slot widths**: after fonts load and the fit pass, each span's width is locked to its *final* glyph width (`getBoundingClientRect().width`) — scrambling glyphs of different widths can't make the line jitter, even in proportional fonts.
- **Per-character schedule**: `rank(i)` in 0..1 by direction (ltr = `i/(n-1)`, centre-out = distance from centre, random = seeded hash). `appear = start + rank*min(0.35, dur*0.35)`; `resolve = start + 0.2k + rank*dur ± 0.04` seeded jitter.
- **States**: `off` → `scr` (random glyph from `charset`, scramble colour, 60–100 % opacity, green glow) → `fin` (final char) → `scr` again on exit → `off`.
- **Glyph choice** `charset[hash(f >> 1, i, line)]` — `f >> 1` changes glyphs every 2 frames (15 Hz at 30 fps), readable as "computing" rather than flashing.
- **Cursor**: in `ltr` mode the next unresolved headline char gets `.cur` → a solid `::after` block in the scramble colour, riding the decode front.
- Own seeded `hash()` instead of GSAP ScrambleText, because the stock plugin is not frame-deterministic.

## Motion
- `k = min(1, D/3.2)`; decode length `dec = clamp(decode, 0.3, D*0.38)` (default 1.2 s).
- t ≈ 0.03 s: tag decodes over `dec*0.45`. +0.08 s: headline decodes over `dec`. +0.3k s later: subtitle over `dec*0.9` — staggered rows, not simultaneous.
- Bar grows `width 0 → 50 % of headline` over `dec + 0.3` with `expo.out` (the only GSAP tween), retracts on exit.
- Freshly resolved characters flash white for 3 frames with the glow, then settle to `finalColor` with a dark soft shadow — that micro-flash is what makes each "lock" feel satisfying.
- Hold: seeded glitch windows every 0.45–1.25 s re-scramble one random char for 2–4 frames (`studio.random(seed*17+3)`).
- Exit: `exitDur = min(0.6, D*0.16)` ending 0.03 s before the end; each char re-scrambles then vanishes in rank order (`scramble` = same direction, `reverse` = opposite), rows offset 0.04 s.

## Adapt to the design system
- `scrambleColor` ← accent (terminal green is the default cliché — a brand accent is often better), `finalColor` ← text.
- Headline font ← display role; monospace (JetBrains Mono) looks most "decoded", but the width lock makes proportional fonts work too. Tag/sub stay mono for texture.
- Charset: match the language/brand — `01` for binary, katakana for cyberpunk, `АБВГДЕЖЗ…` for Russian text, digits only for numbers.
- 9:16: replace the 140 px margins with ~8 % of width; headline ~90–110 px at 1080 wide, subline may need two lines (currently `nowrap` + shrink).
- Short clips: decode shrinks to `D*0.38`; long clips: glitches continue every ~1 s — set fewer by spacing or by raising the window gap.

## Variations
- **Number reveal**: charset `0123456789`, `center-out`, for a stat or price "locking in".
- **Word swap**: decode text A, hold, scramble-swap to text B using the same per-char schedule (exit A + enter B in one pass).
- **Beat decode**: start each row on `studio.beat(n)`, or resolve one word per beat.
- **Redacted reveal**: start chars as black bars (`.cur` style) instead of glyphs, then decode.
- **Voice-synced**: set each word's `resolve` to its `studio.words[i].start` so the text decodes as it's spoken.

## Pitfalls
- Don't use GSAP's ScrambleText or `Math.random()` per frame — the export won't match the preview.
- Measure and lock widths *after* the font-size fit; locking first leaves gaps or overlaps after shrinking.
- Changing glyphs every frame strobes; every 2 frames is the sweet spot at 30 fps.
- Very long sublines are shrunk to fit in one line and can become tiny — keep them ≤ ~45 chars.
- Bright scramble colours with glow on bright footage clip to white — add a dark plate.

## Reference
Reference implementation: gallery/clips/text-scramble-decode/ (clip.js, style.css). Key snippet:

```js
// lock each slot to its final glyph width
for (const L of lines) {
  L.spans.forEach((s) => { const w = s.getBoundingClientRect().width; s.style.width = w + 'px'; });
  const n = L.chars.length;
  // resolve order
  L.ranks = L.chars.map((_, i) => {
    if (p.direction === 'random') return hash(i, 77);
    if (p.direction === 'center-out') return Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
    return n > 1 ? i / (n - 1) : 0;
  });
  const appearSpread = Math.min(0.35, L.dur * 0.35);
  L.appear = L.ranks.map((r) => L.start + r * appearSpread);
  L.resolve = L.ranks.map((r, i) => L.start + 0.2 * k + r * L.dur + (hash(i, 31) - 0.5) * 0.08);
}
```

```js
if (state === 'scr') {
  s.textContent = rnd(f, i, li);
  s.style.color = sc; s.style.opacity = 0.6 + 0.4 * hash(f, i, 9);
  s.style.textShadow = glowS;
  if (L.resolve[i] > t) head = Math.max(head, i);
} else {
  s.textContent = ch;
  // freshly resolved chars flash white-hot for ~3 frames, then settle
  const age = t - L.resolve[i];
  s.style.color = age < 3 / FPS ? '#ffffff' : isTag ? sc : fc;
  s.style.opacity = isTag ? 0.85 : 1;
  s.style.textShadow = age < 3 / FPS ? glowS : glowF;
}
```
