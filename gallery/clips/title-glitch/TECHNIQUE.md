# Glitch Title

An RGB-split digital glitch title: characters scramble into place, colour channels split, horizontal slices tear sideways and noise bars flash in seeded bursts — all computed in `render(t)` from a frame-quantised hash.

## Use it for
- Tech, gaming, cyber/AI, "system online" and hard-cut intros.
- Error/hack story beats ("access denied", "signal lost").
- Short punchy titles over dark footage or a dark grid background.

## Avoid when
- Brand is calm, premium or editorial — glitch reads loud and a little dated.
- Text must be read immediately; it is unreadable for the first ~0.5 s.
- Light backgrounds: the channel layers use `mix-blend-mode: screen`, which disappears on white.
- Photosensitive audiences: intensity > 1 with bursts > 2/s is a lot of flashing.

## Anatomy
- `.gl` centred row; `.stack` is an inline-block (`white-space: nowrap`, `line-height: 1`) holding stacked text layers:
  - `.a` and `.b` absolute copies in `colorA` / `colorB` with `mix-blend-mode: screen` (the RGB split);
  - `.main` the real text (in flow, defines size);
  - 7 absolute `.slice` copies, each shown through `clip-path: inset(y0% 0 rest% 0)` and shifted on X;
  - `.bars` — 6 thin noise rectangles in an area extending past the text (`inset: -60px -200px`).
- `.sub`: JetBrains Mono subtitle that types on with a `█` cursor.
- Font weight depends on the face (Unbounded 900, Bebas 400, others 700); size is shrunk to fit 1700 px.
- Determinism: a custom integer `hash(a, b)` seeded by `p.seed` gives a stable value for (frame, channel). Time is quantised to `FPS = 24` so jitter steps like digital video, not smooth noise. Burst windows are precomputed in setup with `studio.random(seed*13+1)`.
- No GSAP timeline at all — the whole look is a function of `t` in `render`.

## Motion
- Entry `inDur = min(1.0, D×0.3)`: glitch envelope `g` falls 1 → 0; visibility flickers in (probability of "on" rises 25 % → 100 %), nothing for the first 0.06 s; scramble resolves left → right (revealed count = `t/inDur × len × 1.15`, so it locks slightly before the envelope ends).
- Hold: constant tiny split `4 × intensity` px keeps it alive. Seeded bursts (0.08–0.26 s long, gaps `(0.4 + rnd×1.2) / bursts` s) push `g` to 0.55–1 and may swap 1–3 characters.
- `g` drives everything: channel offsets `dx = base + g × 38 × (h - 0.3)`, `dy = g × 10 × (h - 0.5)`; main jitter `g × 8`; slices active when `g > 0.15` with probability `0.25 + g × 0.45`, X shift up to ±70 × g px, 30 % of slices tinted A/B; noise bars when `g > 0.25`.
- Subtitle: types on over 0.6 s starting at `inDur × 0.8`, cursor blinks at 2.5 Hz, fades in the first half of the exit.
- Exit `outDur = min(0.7, D×0.2)`: envelope ramps up, characters dissolve back into glyphs right → left, visibility flickers off, fully hidden on the last frame.
- Beat sync: to make bursts hit the music, build the `bursts` list from `studio.beats` (e.g. a 0.12 s window on every 2nd beat) instead of the seeded schedule; `studio.level()` can scale `g` for audio-reactive glitching.

## Adapt to the design system
- `color` → main text; `colorA`/`colorB` → the split pair. Note the runtime's key-name heuristics bind `color` and `colorA` to `accent` and `colorB` to `accent-2`; set `"token": "text"` on `color` in your own clip so the main text uses the text colour.
- Split colours should be a complementary pair (magenta/cyan, red/teal). With a single brand accent, use accent + a hue-shifted partner.
- Fonts: a heavy display or mono face; Space Grotesk and Bebas Neue are Latin-only (the scramble glyph set is Latin too) — for Cyrillic use Unbounded/JetBrains Mono and add Cyrillic glyphs to `GLYPHS`.
- 9:16: size ~110–130 and short words; the 1700 px fit must become `studio.width - margin`.
- Short (≤2 s): set intensity ~0.8 and bursts 0 — entry and exit already take 50 %. Long: lower bursts (0.5/s) or it becomes noise.

## Variations
- **Clean lock**: scramble only, no slices/bars, small split — a refined "decode" for AI brands (cf. text-scramble-decode).
- **Glitch transition**: run the envelope at max for 0.3 s around a cut, with slices covering a full-frame screenshot.
- **Audio-reactive**: `g = studio.level(t) ** 2 × intensity` during the hold.
- **Error card**: red/white split, subtitle `ERR 0x04 — signal lost`, bars wider and longer.
- **Logo glitch**: replace text layers with copies of an SVG logo (same split/slice logic via clip-path).

## Pitfalls
- Never use `Math.random()` per render — frames would differ on every seek; hash from (frame, index) as here.
- Unquantised time (`t` instead of `floor(t×FPS)`) makes the jitter swim smoothly and look like a bug.
- Scrambled glyphs in a proportional font change the text width each frame; that's acceptable in a glitch, but in a centred clean decode use a mono face.
- `screen` blending requires a dark background behind the clip.
- Keep the subtitle short — it types in 0.6 s regardless of length.

## Reference
Reference implementation: gallery/clips/title-glitch/ (clip.js, style.css). Key snippet:

```js
    const seed = p.seed | 0;
    const hash = (a, b = 0) => { let h = (a * 374761393 + b * 668265263 + seed * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@/\\<>[]{}=+*?!';
    const FPS = 24; // glitch "frame rate" — quantised so the jitter reads as digital
```

```js
        // RGB split
        const base = 4 * I; // tiny constant split keeps it "digital" while holding
        const dx = base + g * 38 * (hash(f, 6) - 0.3);
        const dy = g * 10 * (hash(f, 7) - 0.5);
        A.style.transform = `translate(${-dx}px, ${-dy}px)`;
        B.style.transform = `translate(${dx}px, ${dy}px)`;
        A.style.opacity = B.style.opacity = vis ? 0.9 : 0;
        main.style.opacity = vis;
        main.style.transform = `translate(${g * 8 * (hash(f, 8) - 0.5)}px, 0)`;

        // horizontal slices displaced
        const h = stack.offsetHeight;
        slices.forEach((s, i) => {
          const active = vis && g > 0.15 && hash(f, 20 + i) < 0.25 + g * 0.45;
          if (!active) { s.style.opacity = 0; return; }
          const y0 = hash(f, 40 + i) * 100, hh = 4 + hash(f, 60 + i) * 18;
          s.style.opacity = 1;
          s.style.clipPath = `inset(${y0}% 0 ${Math.max(0, 100 - y0 - hh)}% 0)`;
          s.style.transform = `translateX(${(hash(f, 80 + i) - 0.5) * 140 * g}px)`;
          s.style.color = hash(f, 90 + i) < 0.3 ? (hash(f, 91 + i) < 0.5 ? p.colorA : p.colorB) : p.color;
        });
```
