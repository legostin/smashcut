---
name: studio-motion-design
description: Motion design craft rules (timing, easing, typography, composition, rhythm, formats) so agent-made graphics look professionally designed rather than "animated by default". Use when designing any clip or reviewing visual quality.
---

# Motion design craft

## Timing
- Entrances 0.4–0.8 s, exits 0.25–0.5 s (exits are faster than entrances). Holds long enough to read: ~0.3 s per word + 1 s.
- Stagger related elements 0.04–0.12 s. Never move everything at once; never stagger so long that the last item arrives late.
- Overlap: start the next motion before the previous fully settles (offsets like `'-=0.3'`).
- Cut to the beat: put the main hit on a beat/bar (`studio.beat(n)`), secondary motion on off-beats.

## Easing
- Entrances: `expo.out`, `power3.out`, `back.out(1.4)` for playful. Exits: `power2.in` / `expo.in`. Moves between positions: `power2.inOut`.
- Never `linear` for UI/type motion (only for continuous loops, tickers, rotations).
- Spring feel without physics: `studio.spring(t, {stiffness, damping})` in render(t).

## Typography
- Max 2 families per piece. Big headline: 96–200 px at 1080p, tight tracking (−0.02 to −0.04 em), line-height 0.9–1.05. Body: 28–40 px, never < 24 px at 1080p.
- Russian text is ~15–25 % longer than English — size for the longest realistic string and test with it.
- Text reveals: mask (overflow hidden + yPercent 100 → 0), clip-path wipes, per-word/char stagger. Avoid plain fades for hero text.
- High contrast: white on dark plate or dark on bright plate; add a subtle shadow/plate when over unknown footage.

## Composition
- Grid and alignment: align to left edge or centre — pick one. Consistent margins (≥ 96 px at 1080p).
- One focal point per moment. Secondary info smaller and dimmer (60–75 % opacity).
- Colour: 1 accent + neutrals. Accent for the single most important element.
- Depth: parallax (background moves less), scale 1.02–1.06 slow push during holds keeps frames alive.

## Formats
- 16:9: lower thirds bottom-left at ~8–11 % from bottom. 9:16: keep text in the middle 60 % height; captions above the lower 20 %.
- Captions: max 2 lines, ~32–42 chars per line, highlight the current word.

## Quality checklist (run on every render)
- Nothing touches the frame edge unintentionally; nothing is cut off at any time.
- No dead frames at the start (content should begin moving within 0.1–0.3 s).
- The end is clean (fully out, or holds intentionally if the clip is meant to cut).
- Motion reads at 1× speed — check 6–8 frames across the duration.
