# Milestone Timeline

A spine that draws on node by node: a glowing progress head travels between milestones, each dot pops, a stem grows and a date/title/text card clip-reveals off the line (alternating above/below), while the camera pans to follow.

## Use it for
- Company histories, product roadmaps, "how we got here", biographies, project phases.
- 4–8 milestones over 8–14 s, where the viewer should feel progress through time.
- Both 16:9 (horizontal, alternating cards) and 9:16 (vertical spine on the left, cards to the right).

## Avoid when
- More than ~8 milestones in under 10 s: each gets <0.7 s and cards can't be read (the code clamps to 0.35 s per step).
- The milestones need long paragraphs — cards are designed for a date, a 2–4 word title and one line.
- The dates are not sequential/causal; a grid or list technique is clearer.

## Anatomy
- `.tm` full frame; optional background = `bgColor` + a faint radial accent tint from the top + a 34 px dot grid (`radial-gradient` background-image) + a big blurred accent `.glow` (760 px, `blur(140px)`) that follows the progress head.
- `.vp` viewport with a **CSS mask gradient** (`mask-image: linear-gradient(...)`) so cards fade at the frame edges / under the title instead of being cut hard.
- `.track` holds everything that pans: a dashed `.base` spine (`repeating-linear-gradient` 10 px dash), the accent `.prog` line with a glow `box-shadow`, per-milestone `.node` (30 px ring in accent + inner `.fill` disc), `.stem` (2 px, 45 % opacity) and `.card`, plus a white `.tip` with an accent halo.
- Cards: frosted (`rgba(255,255,255,.045)`, 1 px border, `backdrop-filter: blur(6px)`, radius 22) with date (Manrope 800 46 px, accent, tabular-nums), title (700 28 px) and text (22 px at 66 % opacity). Cards are laid out at a fixed width (360) and scaled (`cardScale`) — measured heights are multiplied by the scale.
- Layout along a "main axis" `u`: horizontal → x with alternating above/below cards; vertical → y with cards to the right. Spine position is clamped so cards never hit the title or the frame bottom.
- Camera: if the track is wider than the frame, `maxCam` is the overflow; with `cameraFollow: false` the whole track is scaled to fit instead.

## Motion
- 0.05 s title rises through a mask (0.8 s `expo.out`), 0.18 s subtitle, 0.15 s dashed spine fades in, 0.2 s all nodes appear dim (opacity 0.55, `back.out(2)`, 0.05 s stagger) — a preview of the whole path.
- Schedule: first milestone at `tStart = min(0.9, duration*0.12)`; `per = (out - 0.9 - tStart)/(N-1)` clamped 0.35–2.2 s; arrival times `reach[i]`.
- Progress head (in `render`): eases in from 140 px before the first node, then **moves during the last `move = min(per*0.72, 1.1)` s before each arrival** with `power2.inOut`, and waits at each node — move/hold rhythm instead of constant speed. The tip breathes with `1 + 0.12*sin(t*5)`.
- On arrival (t = reach[i]): node to full opacity; fill pops (`back.out(2.5)`, 0.35 s); node does a quick 1.25× yoyo punch (0.14 s); stem grows at +0.02 s (`power3.out`); card clip-reveals from the spine side (`clipPath inset(100% …) → inset(0 … round 22px)`, 30 px offset, 0.75 s `expo.out`) at +0.08 s; card children stagger up 0.06 s at +0.2 s (text ends at 0.66 opacity).
- Camera: `sine.inOut` pan between `camT0` (when the head reaches the focus point, 58 % width) and `camT1`, so the head stays roughly in place while the world slides.
- Exit at `duration - 0.7`: cards fade/slide (0.03 s stagger), then nodes/stems/lines fade, title leaves upward.

## Adapt to the design system
- `accent` → `accent`, `textColor` → `text`, `bgColor` → `bg` (the boolean `background` only toggles painting). Card fill should become `surface` with alpha; date colour stays accent.
- Fonts: Manrope → `var(--font-title)`, Inter → `var(--font-body)`; card radius 22 → radius token; `spacing` param = gap between milestones (×S).
- 9:16 (auto): vertical spine at the left margin, cards full width to the right, bigger `cardScale` (1.6), camera pans vertically; keep ≤6 milestones.
- Over footage: `background: false` gives a darker card (`rgba(12,14,24,.82)`) and text shadows.
- Long durations: `per` grows up to 2.2 s per milestone (comfortable reading); beyond that, add milestones or a closing card instead of stretching.

## Variations
- **Beat-locked**: set `reach[i] = studio.beat(i * 4)` (one milestone per bar) so each pop lands on a downbeat.
- **Future milestone**: style the last node as hollow/dashed with a "?" to suggest what's next.
- **Image cards**: add a thumbnail per card (photo of the year/product); keep cards the same height.
- **No camera, fit**: `cameraFollow: false` for an overview where all milestones stay visible (works for ≤5).
- **Year counter**: a large year number that counts between dates as the head moves (sync to `hu`).

## Pitfalls
- Measure card heights after setting width and multiply by the scale; mixing scaled and unscaled sizes misplaces cards around the spine.
- Without the edge mask, cards pop in/out at the frame edge during camera pans.
- Constant-speed heads feel mechanical; keep the move/hold rhythm and ease the camera separately.
- Very long titles wrap to 3+ lines and make alternating cards collide with the head/title area — keep copy short or cap lines.
- The tip colour is hard-coded `#fff`; on a light background change it to the text token.

## Reference
Reference implementation: gallery/clips/infographic-timeline/ (clip.js, style.css). Key snippet:

```js
    nodes.forEach((n, i) => {
      const t = reach[i];
      const dir = n.above ? 1 : -1;
      tl.to(n.node, { opacity: 1, duration: 0.15 }, t - 0.05)
        .fromTo(n.fill, { scale: 0 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, t - 0.02)
        .fromTo(n.node, { scale: S }, { scale: 1.25 * S, duration: 0.14, ease: 'power2.out', yoyo: true, repeat: 1 }, t - 0.02)
        .fromTo(n.stem, vertical ? { scaleX: 0 } : { scaleY: 0 }, vertical ? { scaleX: 1, duration: 0.35, ease: 'power3.out' } : { scaleY: 1, duration: 0.35, ease: 'power3.out' }, t + 0.02)
        .fromTo(n.card, vertical ? { x: -24 * S, opacity: 0, clipPath: 'inset(0 100% 0 0 round 22px)' } : { y: 30 * S * dir, opacity: 0, clipPath: n.above ? 'inset(100% 0 0 0 round 22px)' : 'inset(0 0 100% 0 round 22px)' },
          { x: 0, y: 0, opacity: 1, clipPath: 'inset(0% 0% 0% 0% round 22px)', duration: 0.75, ease: 'expo.out' }, t + 0.08)
        .fromTo(n.card.children, { y: 16, opacity: 0 }, { y: 0, opacity: (k) => (k === 2 ? 0.66 : 1), duration: 0.6, ease: 'expo.out', stagger: 0.06 }, t + 0.2);
    });
```

```js
        // progress head along the main axis
        let hu = u0 - leadIn + leadIn * eIO(studio.progress(t, tStart - 0.55, 0.55));
        for (let i = 1; i < N; i++) {
          if (t >= reach[i]) { hu = nodes[i].u; continue; }
          if (t >= reach[i] - move) hu = nodes[i - 1].u + (nodes[i].u - nodes[i - 1].u) * eIO((t - (reach[i] - move)) / move);
          else if (t >= reach[i - 1]) hu = nodes[i - 1].u;
          break;
        }
```
