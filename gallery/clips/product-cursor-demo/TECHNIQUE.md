# Cursor Click Walkthrough

A macOS-style cursor glides along curved paths between targets, clicks with a press-and-ripple, types into fields, shows tooltips and triggers camera zooms — over a built-in SaaS dashboard mockup, your own screenshot, or as a transparent overlay on a real screen recording.

## Use it for
- Product demos and launch videos without a screen recording ("type a query, pick a range, export").
- Explaining a 3–6 step UI flow in a tutorial.
- Adding a clean, consistent cursor + click feedback on top of an existing recording (`overlay` mode).

## Avoid when
- The flow is longer than ~8 steps — split it into several clips, one per sub-task.
- The UI is mobile: use a phone mockup technique; a desktop cursor on a touch UI reads wrong.
- You only want to show a page, not interaction — a browser-window scroll is calmer.

## Anatomy
- **Screen design space**: a fixed 1920 × 1080 "screen" (`SW × SH`), scaled by `fit = min(W/SW, H/SH)` and centred; in `overlay` mode the screen is the frame itself (`W × H`, fit 1). Steps are written in **% of the screen**, so they survive any output size.
- Layers: `.bg` (solid colour + two drifting blurred glows + dot pattern) → `.screen` → `.push` (whole-clip 3 % push) → `.cam` (zoom, with `transform-origin` at the zoom target) → window (`.win` with traffic lights + title) containing the mockup or `<img class="shot">` → `.fx` layer (ripples, tooltips, typed text, cursor). Because `.fx` is inside `.cam`, the cursor and ripples zoom with the UI.
- **Mockup**: sidebar nav, search field (`data-fx="input"`), three date-range chips (`data-fx="chip"`), Export button with spinner (`data-fx="export"`), 3 KPIs, an SVG line+area chart and a channels panel, and a toast. Elements with class `.hit` are interactive.
- **Hit testing**: every `.hit` rect is measured with `getBoundingClientRect()` **before** the screen is scaled, stored in screen coordinates; `hitAt(x, y)` (12 px tolerance) tells a step which element it clicked, which drives the state: focus + typing for the input, dataset morph for chips, spinner → "✓ Exported" → toast for export.
- **Steps DSL** (`steps` textarea): `move|click|type|wait: x, y [, zoom] [| text]`. `type` = click + type text; text on `click` = tooltip; zoom 1–3 on a step = camera zoom into that point. Max 20 steps.
- **Cursor**: inline SVG arrow (light or dark), scaled by `cursorSize`, hotspot at (7, 3.5) via `transformOrigin`.

## Motion
- 0.05 s: window enters `y 60, scale 0.92, rotateX 10° → 0`, 1.0 s `expo.out`; KPIs/panels rise `y 24` with stagger 0.06 s from 0.35 s; glows fade to 0.55. Chart line grows from 0.55 s (1.2 s `expo.out`).
- Cursor fades in over 0.35 s ending at `tStart` = 0.85 s (0.25 s in overlay).
- **Planning**: each step expands into `move` (0.6–1.0 s by distance: `0.5 + dist/SW × 0.7`), `hover` (0.12 s, 0.25 s before a zoom), `click` (0.35 s), `type` (0.06 s per char + 0.15 s) and `dwell` (0.35 s, +0.4 s after a tooltip click, +0.9 s if zoomed). The natural total is then **fitted to the clip**: compressed proportionally if too long, or extra time spread across dwells (≤ 1.4 s each) if too short. Write steps once — the clip works at 5 s or 15 s.
- **Moves**: quadratic Bézier with the control point offset 10 % of the length perpendicular to the path, bowing "up" like a wrist arc; progress eased `power2.inOut`. Never a straight linear line.
- **Click**: cursor scales to 0.85 in 0.1 s, back with `power3.out` over 0.18 s; two ripples 0.09 s apart (scale 0.15 → 0.9/1.15, `expo.out`, fading over 0.6 s); the clicked element bumps 1 → 1.03 → 1 over 0.32 s (sine).
- **Zoom**: starts 0.05 s before the move, eases in (`power3.inOut`) until the click (≤ 0.95 s), holds ≥ 0.5 s after the click, eases out over 0.85 s before the next move. Anticipation: the camera is already moving while the cursor travels.
- **Tooltip** appears 0.15 s before the move ends (`expo.out` 0.45 s, rises 12 px, scale 0.92 → 1), placed above or below the hit element depending on space, fades as the next move starts.
- **UI state**: search gets focus ring + caret (blinks every 0.5 s when idle) and text typed by progress; chips morph the chart between 3 datasets over 0.8 s and tween the KPI numbers; export: spinner 0.08–0.95 s after click, then "✓ Exported", toast slides up 1.0 s after the click.
- Background glows drift on slow sines (0.3–0.35 rad/s) — secondary motion.
- Exit at `outT = duration - 0.65`: cursor fades (0.25 s), window `y -24, scale 0.97, opacity 0`, 0.45 s `power2.in`.

## Adapt to the design system
- `accent` → `accent` (chart, active chip, focus, export button), `rippleColor` → `accent`, `background` → `bg`. `theme` light/dark should be the opposite contrast of `bg` only if you want the window to pop; same-tone works for a seamless brand look.
- In an original clip, build the mock UI from the project tokens: `--color-surface` for panels, `--color-muted` for secondary text, radius tokens for cards/chips, `--font-body` for UI text. Keep UI text ≥ 18 px in the 1920 design space.
- `cursorSize` 1.6 is tuned for 1080p reading on a phone; use 1.2–1.4 for desktop-only videos.
- 9:16: the 16:9 screen is fitted by width (~1080 × 608) — use zooms on every step (1.6–2.2) so the action is legible, or design a vertical screen (`SW × SH` = 1080 × 1920) for a mobile-web mockup.
- Short clips compress every step proportionally — below ~1 s per step it feels frantic; reduce steps instead.

## Variations
- **Overlay on a recording**: `mode: overlay` — no window/background, cursor + ripples + typed text over your footage; align step % to the recording.
- **Screenshot**: `mode: image` with `assets/app.png` — clicks ripple and zoom, but there is no UI state change (no `.hit` elements); add tooltips to explain.
- **Feature spotlight**: one click with zoom 2.0 and a tooltip, long dwell — a single-feature callout.
- **Keyboard shortcut**: replace the cursor with a key-cap HUD (`⌘ K`) that presses on the click times, opening a command palette mock.
- **Before/after**: chip clicks morph data; use two chips to toggle "Before" and "After" states of any metric.

## Pitfalls
- Measure hit targets before applying the screen scale or any entrance transform; otherwise coordinates drift.
- A cursor path computed incrementally per frame is not seekable — evaluate the schedule from `t` (the `moves` lookup in `render`).
- Zooming while the cursor moves fast plus a window push = triple motion; keep zoom ≤ 2.2 and the push tiny.
- Tooltips near the top/bottom edge flip side automatically; when zoomed they can still leave the frame — check zoomed frames.
- Steps outside 0–100 % or over non-hit areas still click (ripple only) — verify the target is a real element.
- Typing speed below 0.04 s/char reads as pasted; above 0.1 s/char drags.

## Reference
Reference implementation: gallery/clips/product-cursor-demo/ (clip.js, style.css). Key snippet:

```js
    plan.forEach((q, qi) => {
      const t0 = t; t += q.d;
      if (q.kind === 'move') {
        const dx = q.b.x - q.a.x, dy = q.b.y - q.a.y, len = Math.hypot(dx, dy) || 1;
        const side = dx >= 0 ? -1 : 1; // arc bows "up" like a wrist movement
        const c = { x: (q.a.x + q.b.x) / 2 + (-dy / len) * len * 0.1 * side, y: (q.a.y + q.b.y) / 2 + (dx / len) * len * 0.1 * side };
        moves.push({ t0, t1: t, a: q.a, b: q.b, c });
```

```js
        // press feedback
        let press = 1;
        const bump = new Map();
        clicks.forEach((c, i) => {
          const age = t - c.t;
          if (age >= 0 && age < 0.1) press = Math.min(press, 1 - 0.15 * (age / 0.1));
          else if (age >= 0.1 && age < 0.28) press = Math.min(press, 0.85 + 0.15 * eOut((age - 0.1) / 0.18));
          [ripples[i], ripples2[i]].forEach((r, k) => {
            const a2 = age - k * 0.09;
            if (a2 < 0 || a2 > 0.6) { r.style.opacity = 0; return; }
            const q = a2 / 0.6;
            r.style.left = c.x + 'px'; r.style.top = c.y + 'px';
            r.style.transform = `scale(${0.15 + eExpo(q) * (k ? 0.75 : 1)})`;
            r.style.opacity = ((1 - q) * (k ? 0.5 : 0.95)).toFixed(3);
          });
          if (c.hit && age >= 0 && age < 0.32) bump.set(c.hit.el, 1 + 0.03 * Math.sin(Math.PI * (age / 0.32)));
        });
```
