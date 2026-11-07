# Text Message Conversation

An iMessage- or WhatsApp-style chat: "them" messages are preceded by bouncing typing dots, every bubble pops from its tail, the thread scrolls up as it grows, and a read receipt lands under the last "me" message.

## Use it for
- Story-time, skits and "texting" scenes in Shorts, Reels and TikToks.
- Testimonials or customer-support moments told as a conversation.
- Hooks: a dramatic first message ("are you awake?") is a strong scroll-stopper.

## Avoid when
- Messages are long paragraphs — bubbles grow tall, the thread scrolls constantly and nothing can be read. Keep ≤ ~80 characters per message.
- More than ~10 messages in under 10 s — reading speed loses.
- The brand must not look like Apple/WhatsApp UI: build a neutral chat with the brand tokens instead (see Adapt).

## Anatomy
- `.panel`: a phone-like rounded card (radius 54 u, 1.5 u edge ring + big shadow) sized `min(0.5 W, 740 u) × 0.86 H` in 16:9, `0.88 W × 0.72 H` in portrait; positioned centre/left/right. `panel: false` = bubbles only, with a top fade mask on the viewport so scrolled-off messages dissolve over footage.
- Colour sets for iOS/WhatsApp × dark/light live in one object `C` and are applied as CSS custom properties (`--me`, `--them`, `--fg`, `--muted`…). `u = min(W,H)/1080`, ×1.28 in portrait so the UI reads on a phone.
- Header: iOS (centered avatar with initials, name, back chevron) or WhatsApp (row: back, avatar, name, status). Input bar at the bottom (plus button + "iMessage"/"Message" field).
- `.vp` viewport (between header and input, `overflow:hidden`) → `.stack` (flex column) of `.row.me` / `.row.them` → `.bub`. Spacing: 7 u within a sender group, 24 u between groups.
- **Tails**: iOS draws an SVG tail only on the last bubble of a group (mirrored with `scaleX(-1)` for "them") and tightens that corner radius; WhatsApp uses the squared top corner on the first bubble of a group plus a fake time stamp with ✓✓ for "me".
- One reusable `.typing` bubble (three dots) is moved to the position of the next "them" message.
- Messages parse `me: text` / `them: text` (also Russian `я:` / `они:`), optional absolute time `[2.5] me: …`. Text goes in with `textContent`.
- Layout is measured once in setup (`offsetTop`/`offsetHeight` of every row) — the scroll targets are precomputed, `render(t)` only reads them.

## Motion
- 0.02 s: panel rises `y 50 u, scale 0.96 → 1`, 0.75 s `expo.out`; header avatar/name drop in 10 u at 0.2 s (stagger 0.06 s).
- Schedule from 0.6 s: gap before a message = `0.3 + min(1.0, prevText.length × 0.018)` s (reading time of the previous message) + 0.15 s if it is a reply from "me"; "them" messages get typing time `clamp(0.45 + len × 0.01, 0.55, 1.1)` s. The natural schedule is then scaled by `f ≤ 1.5` to fill `duration - 1.1 s` (−1.6 s with a receipt). Absolute `[t]` messages ignore scaling.
- Typing dots: bubble scales in with a back ease (0.22 s), each dot bounces on `max(0, sin((t-ts)·3.2π − j·0.9))` → a travelling wave with rests, 6 u up and opacity 0.45 → 1.
- Bubble pop: at its time the bubble appears in 0.05 s and scales 0.6 → 1 with a custom `backOut(k, 2.4)` over 0.27 s, `transform-origin` at the tail corner (bottom right for me, bottom left for them) — it grows **out of the tail**.
- Scroll: events at typing start and bubble time; the stack moves to `min(0, vh - pad - bottom)` with `outCubic` over 0.42 s — the thread only scrolls once content passes the bottom, exactly like a phone.
- Receipt: 0.7 s after the last "me" message, fades up 8 u (`outCubic`, 0.4 s).
- Exit at `D - 0.47`: panel `y 40 u, scale 0.97, opacity 0`, 0.42 s `power2.in`.
- Beat or VO sync: put `[t]` prefixes on messages to land them on `studio.beats` or on the narration (`studio.words` start times).

## Adapt to the design system
- Colours are hard-coded platform palettes (iOS blue `#0a84ff`, WhatsApp green `#005c4b`). For an original, brand-neutral chat map `--me` → `accent`, `--meText` → `bg` or white, `--them` → `surface`, `--themText` → `text`, `--muted` → `muted`, `--bg` → `bg`. `avatarColor` binds to `accent` by name.
- Font: Inter → `var(--font-body)`; `textSize` 34 px at 1080p (portrait ×1.28 ≈ 44 px). Never below 28 px.
- Radius: iOS bubble 40 u, WhatsApp 20 u — follow the system's radius scale for a custom look.
- 9:16 is the native format: panel 88 % width, 72 % height, UI ×1.28. Keep the input bar above the platform UI zone (bottom 18 %) — lower `ph` or move the panel up if captions also sit there.
- 16:9: put it `left` or `right` and use the other half for B-roll, a reaction face or a title.
- Long clips: scaling is capped at 1.5×, so extra time becomes a hold at the end — add messages instead.

## Variations
- **Bubbles over footage**: `panel: false`, `position: left/right` — floating messages next to a talking head.
- **Group chat**: add names and coloured avatars per sender above the first bubble of each "them" group.
- **Reaction**: after a bubble lands, pop a ❤️/😂 tapback badge on its corner with `back.out` 0.4 s later.
- **Delete/unsend**: make a bubble shrink to 0 and the stack close the gap (re-measure layout for the "after" state and interpolate).
- **Notification preview**: one message only, sliding in as a lock-screen notification card — a hook for the first 2 seconds.

## Pitfalls
- All positions must be measured after fonts load and before scaling; changing `textSize` at render time invalidates the scroll targets.
- Per-message timing proportional to text length is what makes it readable; equal spacing makes long messages unreadable.
- Typing dots for "me" messages look wrong (you don't see your own typing) — the code only types for "them".
- Absolute `[t]` times out of order break the scroll (events are sorted, messages are not) — keep them increasing.
- The read receipt only appears if the last message is from "me".
- Emoji render with the system emoji font; check they exist in the headless renderer before relying on them.

## Reference
Reference implementation: gallery/clips/social-chat-bubbles/ (clip.js, style.css). Key snippet:

```js
    const t0 = 0.6;
    let cur = t0;
    msgs.forEach((m, i) => {
      const prev = msgs[i - 1];
      const gap = i === 0 ? 0 : 0.3 + Math.min(1.0, prev.text.length * 0.018) + (m.from === 'me' ? 0.15 : 0);
      m.typ = m.from === 'them' && p.showTyping ? Math.min(1.1, Math.max(0.55, 0.45 + m.text.length * 0.01)) : 0;
      m.ts = cur + gap; m.ta = m.ts + m.typ; cur = m.ta;
    });
```

```js
      render(t) {
        // scroll
        let i = 0;
        while (i + 1 < ev.length && ev[i + 1].t <= t) i++;
        const y = i === 0 ? ev[0].y : ev[i - 1].y + (ev[i].y - ev[i - 1].y) * E.outCubic(studio.progress(t, ev[i].t, 0.42));
        stack.style.transform = `translateY(${y}px)`;
        // bubbles
        msgs.forEach((m) => {
          const k = studio.progress(t, m.ta, 0.27);
          m.bub.style.opacity = t < m.ta ? 0 : Math.min(1, (t - m.ta) / 0.05);
          m.bub.style.transform = `scale(${t < m.ta ? 0.6 : 0.6 + 0.4 * backOut(k, 2.4)})`;
        });
```
