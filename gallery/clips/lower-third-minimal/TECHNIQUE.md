# Minimal Line Lower Third

A clean speaker ID: an accent dot pops, a thin rule draws on, the name rises out of the line and the role drops out of it, then everything retracts back into the line.

## Use it for
- Interviews, documentaries, corporate and editorial videos — anywhere the lower third should whisper.
- Multi-speaker edits: it is light enough to repeat every few minutes without fatigue.
- Overlays on graded footage where a solid plate would block the image.

## Avoid when
- Footage is busy/bright behind the text — there is no plate, only a text shadow; use a slide or glass plate.
- Social/vertical content that wants energy (pills, pops) — this is deliberately quiet.
- The role is two lines long: both lines are `nowrap`.

## Anatomy
- `.ltm` flex column, `bottom: 130px`, `left/right: 130px` (or centred with `translateX(-50%)`), alignment follows `position`.
- Three rows: `.mask.top > .name`, `.rule` (`.ln` line + `.dot`), `.mask.bot > .role`.
- The **line is the mask edge**: the top mask hides the name below it, the bottom mask hides the role above it, so the text appears to emerge from the rule. Masks get padding + negative margin (`10px 6px 14px` / `-10px -6px 0`) so glyphs aren't clipped.
- The rule `align-self: stretch` → it is as wide as the longest of name/role automatically.
- Dot (12 px circle) sits 22 px outside the line on the aligned side (centre: on the line).
- Type: name Manrope 700, `nameSize` (64), `line-height 1.05`, tracking −0.02em; role Inter 400 at 48 % of the name size, `roleColor`. Optional double text-shadow + line shadow for legibility.

## Motion
- 0.05 s: dot `scale 0 → 1`, `back.out(3)`, 0.45 s — the anticipation point.
- 0.10 s: line `scaleX 0 → 1` from the aligned side (`expo.inOut`, 0.8 s) — slow start, fast middle, soft landing.
- 0.50 s: name `yPercent 150 → 0` (0.7 s `expo.out`); 0.62 s: role `yPercent −170 → 0` (0.7 s) — opposite directions from the same line, 0.12 s apart.
- Exit: `outDur = min(outAt, D × 0.3)`, starts at `max(0.9, D − outDur − 0.03)`: name sinks back (`power3.in`), role rises back 0.05 s later, the line retracts toward the **opposite** side (origin flips: draws in from left, leaves to the right), dot shrinks last.
- Total entrance ≈ 1.2 s — fits the `__energy` remap window.
- No beat/word sync; to cue on speech, start it at the first `studio.words` item of the speaker.

## Adapt to the design system
- `textColor` → text, `roleColor` → muted, `accent` → accent (bound by key name). `lineColor` matches the `linecolor` pattern → accent; set it to `text` if you want a neutral line and a coloured dot.
- Fonts are hard-coded in CSS (Manrope / Inter): in your version use `var(--font-title)` for the name and `var(--font-body)` for the role; `nameSize` → `var(--size-title)`.
- `lineWeight` 1–3 px for elegant systems, 4–6 px for bold ones; match stroke widths used in other clips.
- Margins (130 px) should come from `--space-margin`.
- 9:16: centre it, `nameSize` ~56–72 at 1080 wide, raise to ~25–30 % from bottom (out of the platform UI zone); long names need a width check (`white-space: nowrap`).
- Long durations: nothing moves in the hold — add a very slow drift or let it be (interviews prefer stillness). Very short (< 2 s) clips: the exit is capped at 30 % of D but the entrance is not; keep D ≥ 3 s.

## Variations
- **Name only**: empty role → the bottom mask is hidden; the line becomes an underline.
- **Vertical rule**: rotate the idea — a vertical line at the left, name and role slide out sideways from it.
- **Chapter marker**: replace name/role with chapter number + title.
- **Accent swap**: line in accent, dot removed, role in accent colour for a brand-forward look.
- **Beat-cued**: start the line draw on `studio.beat(0)` and the text on the next beat.

## Pitfalls
- The `outAt` param is actually the exit *duration* (label says so), not a time — don't confuse it with lower-third-slide's `outAt` (seconds from end).
- Without the shadow, white text on sky/bright walls disappears — keep the shadow or add a subtle gradient scrim.
- Equal timing for name and role looks mechanical; keep the 0.1–0.15 s offset.
- `nowrap` + no fit: very long names overflow the frame. Measure and shrink in your version.
- Retracting the line from the same side it drew from looks like a rewind; flip the origin.

## Reference
Reference implementation: gallery/clips/lower-third-minimal/ (clip.js, style.css). Key snippet:

```js
const origin = p.position === 'right' ? '100% 50%' : p.position === 'center' ? '50% 50%' : '0% 50%';
const endOrigin = p.position === 'right' ? '0% 50%' : p.position === 'center' ? '50% 50%' : '100% 50%';
const ln = el.querySelector('.ln'), dot = el.querySelector('.dot');
const outDur = Math.min(p.outAt, duration * 0.3);
const out = Math.max(0.9, duration - outDur - 0.03);

tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' }, 0.05)
  .fromTo(ln, { scaleX: 0, transformOrigin: origin }, { scaleX: 1, duration: 0.8, ease: 'expo.inOut' }, 0.1)
  .fromTo(name, { yPercent: 150 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' }, 0.5)
  .fromTo(role, { yPercent: -170 }, { yPercent: 0, duration: 0.7, ease: 'expo.out' }, 0.62)
  // exit
  .to(name, { yPercent: 150, duration: outDur * 0.6, ease: 'power3.in' }, out)
  .to(role, { yPercent: -170, duration: outDur * 0.6, ease: 'power3.in' }, out + 0.05)
  .to(ln, { scaleX: 0, transformOrigin: endOrigin, duration: outDur * 0.6, ease: 'power3.inOut' }, out + outDur * 0.35)
  .to(dot, { scale: 0, duration: outDur * 0.35, ease: 'power2.in' }, out + outDur * 0.6);
```

```css
.ltm .mask { overflow: hidden; }
.ltm .mask.top { padding: 10px 6px 14px; margin: -10px -6px 0; }
.ltm .mask.bot { padding: 14px 6px 10px; margin: 0 -6px -10px; }
```
