# Stomp Beat Promo

A full-frame "stomp" opener that hard-cuts one giant word per beat, locked to the project's beat grid, with cut flashes, inverted backgrounds, accent slots, outline words and a whip with ghost trails every 4th word.

## Use it for
- Hype intros, event/party/concert promos, trailers and sale announcements cut to music.
- Sequences of 4–12 short words or dates ("THIS / SUMMER / ONE / NIGHT").
- The first 2–6 s of a social ad where rhythm is the hook.

## Avoid when
- There is no driving music — without beats the hard cuts feel random (the fallback is a 120 bpm grid).
- The words form a sentence that must be read for meaning; at 120 bpm each word is on screen 0.5 s.
- Photosensitive concerns: flashes + inverts every beat; lower the flash or `invertEvery` for long runs.

## Anatomy
- `.sp` full frame: `.bg` (solid colour per slot), `.stage` zero-size centre anchor with 3 `.ghost` copies + `.main` word, `.flash` full-frame overlay, two corner labels (`.meta.tl` with blinking dot + text, `.meta.br` word counter `01 / 09`).
- Sizing: every word is measured once at 200 px in a hidden probe; its size = `min(fill% × W / width, 0.62 × H / height)` — each word fills the frame width regardless of length.
- Optical centring: per word, the offset between the line-box centre and the glyph-ink centre (canvas `measureText` font vs actual bounding boxes) is stored in em and applied as `dy`.
- Slots: start times from the beat grid with fractional beats interpolated (`beatAt(off + k × beatsPerWord)` via `studio.beat(i)`), until `D - 0.12`; `loop` repeats words to fill the clip.
- Look per slot index `k` (deterministic, no randomness): invert background every `invertEvery` words, accent slot every `accentEvery` (accent bg, dark text), outline-only every `outlineEvery` (`-webkit-text-stroke`, not on accent slots), whip every 4th word with direction alternating per group of four.
- No GSAP — `render(t)` finds the current slot and computes everything from `since = t - slotStart`, measured in frames (`studio.fps`).

## Motion
- Cut flash: frame 0 at 0.9 opacity, frame 1 at 0.35, then off; off-beat slots (odd k) get a lighter single-frame 0.55 hit — accent on the downbeat, softer on the "and". The flash colour is the opposite of the slot background.
- Scale punch: from `min(1.3, 1.04 / fill)` down to 1 over 3 frames with a quartic ease-out (`1 - (1-x)^4`) — the "stomp". Then a slow push of +4.5 % across the slot so held words never freeze.
- Whip slots: the word slides in from `dir × 220 px` over 6 frames (same quartic ease) with 3 ghost copies trailing at 0.42 / 0.24 / 0.12 opacity, spaced 70 px and fading out over 7 frames — fake motion blur.
- Exit (`min(0.3, D×0.08)` s, last slot only): TV-off — the word collapses vertically (`sy = 1 - a³` to 0.012) for 55 % of the exit, then the remaining line closes horizontally (`sx = 1 - b²`). Corner labels fade at double speed.
- Corner dot blinks at 1 Hz (`floor(t × 2) % 2`); corner UI colour always contrasts with the current background.
- Timing is in frames for the hits (1–7 frames) and in beats for the structure — that pairing is what makes it feel locked.
- Sync: `offsetBeats` to start on a later beat, `beatsPerWord` 0.5 for double-time or 2 for half-time; align the clip start to a bar so the first word is a downbeat.

## Adapt to the design system
- `dark` → `bg`, `light` → `text`, `accent` → `accent` (the `dark` key is bound by name to `bg`; bind `light` explicitly with `"token": "text"` in your clip).
- Font → display role; condensed or ultra-heavy faces (Bebas Neue, Unbounded 900) work best. Bebas is Latin-only. Corner labels → caption role.
- Keep the palette to 3 colours: two neutrals for invert + one accent. A second accent turns it into noise.
- 9:16: `fill` already scales to width and caps at 62 % height; reduce `fill` to ~78 and keep words ≤ 7 characters so the type stays big. Move corner labels outside the platform UI zones.
- Short (2–3 s): 4–6 words, no loop. Long (10 s+): use `beatsPerWord` 2 in the middle section or the energy flattens; a stomp sequence over ~8 s becomes wallpaper.

## Variations
- **Lyric stomp**: drive slots from `studio.words` (word start times) instead of beats for a VO-locked version.
- **Photo flashes**: every accent slot shows a full-frame image cut instead of a colour.
- **Section-aware**: switch palette or `beatsPerWord` at `studio.sections` boundaries (calmer intro, double-time at the drop).
- **Numbers countdown**: words `5 4 3 2 1 GO`, invert every word, final slot held longer.
- **Overlay stomp**: transparent background, only the word + flash at low opacity over footage.

## Pitfalls
- Never let the punch scale push the word past the frame: the start scale is capped by `1.04 / fill`.
- Outline-only words use `-webkit-text-stroke`, which shows overlapping contours on variable fonts (Unbounded); prefer the SVG morphology outline (title-marquee-repeat) in your own version.
- Hard cuts must be computed from the slot, not tweened — seeking backwards must show the right word instantly.
- If the beat map has no beats yet, `studio.beat` falls back to 120 bpm; re-render after the music is added.
- Counter shows the word index (`k % words.length`), so it restarts when words loop — fine, but don't present it as a slot count.

## Reference
Reference implementation: gallery/clips/title-stomp-promo/ (clip.js, style.css). Key snippet:

```js
    // beat grid → slot start times
    const bpw = Math.max(0.5, Number(p.beatsPerWord) || 1);
    const off = Math.max(0, Number(p.offsetBeats) || 0);
    const beatAt = (x) => { const i = Math.floor(x), f = x - i; const a = studio.beat(i); return f ? a + (studio.beat(i + 1) - a) * f : a; };
    const slots = [];
    for (let k = 0; k < 4096; k++) {
      const s = beatAt(off + k * bpw);
      if (s >= D - 0.12) break;
      if (!p.loop && k >= words.length) break;
      slots.push(s);
    }
```

```js
        // scale punch 1.3 → 1 over 3 frames, then a slow push for the rest of the slot
        const punch = 1 + (Math.min(1.3, 1.04 / (p.fill / 100)) - 1) * (1 - eo(Math.min(1, frames / 3)));
        const push = 1 + 0.045 * Math.min(1, since / slotLen);
        let x = 0, sc = punch * push;
        let wx = 0;
        if (L.whip) {
          const u = Math.min(1, frames / 6);
          wx = L.dir * 220 * (1 - eo(u));
          x = wx;
        }
        // exit: final slot collapses vertically into a line, then the line closes (TV-off)
        let sy = 1, sx = 1;
        const ex = (t - (D - exitDur)) / exitDur;
        if (ex > 0 && k === lastSlot) {
          const a = Math.min(1, ex / 0.55), b = Math.max(0, (ex - 0.55) / 0.45);
          sy = Math.max(0.012, 1 - a * a * a);
          sx = 1 - b * b;
        }
```
