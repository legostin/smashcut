# Counter Stat

A big headline number that counts from one value to another with prefix, suffix and decimals, an underline that fills in step with the count, a label below and an optional caption chip that pops when the count lands.

## Use it for
- One key metric per moment: "2.4M active users", "$12,500 saved", "98 % uptime".
- Results, fun facts, social proof, before/after numbers in explainers and promos.
- Beat moments: the landing bump is a natural hit point for a downbeat.

## Avoid when
- You have several numbers to compare — use bar-chart, infographic-wrapped-bento or a sequence of counters.
- The number is not impressive as a change (counting 3 → 4 adds nothing; just show it).
- The value is a year or ID (counting 0 → 2026 is meaningless).

## Anatomy
- Centred flex column (`.cs`, vertically centred with `translateY(-50%)`):
  - `.row`: `.pre` + `.num` + `.suf` on a baseline; prefix/suffix at 0.42 em in the accent colour, number at `size` (240 px) in weight 800, `letter-spacing: -0.04em`.
  - `.ul`: a 12 px rounded track (`color` at 0.18) with an accent `.fill` (`transform-origin: left`).
  - `.label` (Manrope 600 50 px) and `.cap` (accent text on `accent22` — the accent with ~13 % alpha — in a pill).
- **No layout jitter**: after `document.fonts.load`, both the start and end values are rendered and measured; `.num` gets `min-width` = the wider one, plus `font-variant-numeric: tabular-nums` and right alignment. The row never changes width while counting.
- Fit: if the row is wider than 1700 px, the font size is scaled down (and min-width with it). Underline width = row width (min 240 px).
- Formatting: thousands separator (space/comma/dot/none), decimal mark `,` or `.`, a typographic minus `−` for negatives.

## Motion
- 0.05 s: row rises 50 px from blur 12 px → 0 and fades in (0.7 s `expo.out`).
- 0.2 s: underline grows `scaleX 0 → 1` (0.6 s `expo.out`).
- 0.35 s: label rises 30 px (0.6 s `expo.out`).
- Count: from `t0 = 0.35` for `countTime` (1.8 s, capped so it ends ≥ 1.2 s before the clip end), with an **ease-out quart** (`1 − (1−p)^4`) in `render(t)` — fast at first, slowing into the final value so the last digits are readable. The fill's `scaleX` uses the same `k`, so bar and number agree.
- Landing: at the count end, the row bumps to scale 1.04 and back (0.12 s `power2.out`, yoyo) and the caption chip pops (`back.out(2)`, from 0.9 scale) 0.1 s before the landing — the payoff beat.
- Exit at `duration − 0.72`: row, underline, label, caption lift 40 px and fade (0.45 s `power3.in`, stagger 0.06).
- Beat sync: set `t0` so `t0 + ct` = `studio.beat(n)` — the landing bump lands on the beat.

## Adapt to the design system
- `color` → `text` (via the generic `color` key it may bind to accent — in your own clip set it explicitly), `accent` → `accent`, `labelColor` → `muted`.
- `font` → `display` role; it must have tabular figures (Inter, Manrope, JetBrains Mono do). Label → `title`/`body` role, caption → `caption`.
- Radius of the underline/caption → design radius; underline height ~1/20 of the number size.
- 9:16: 240 px numbers fit up to ~6 characters at 1080 wide; the 1700 px fit width is hard-coded — use `studio.width × 0.84` in an original clip. Stack label under, keep it in the middle 60 % height.
- Short clips (≤ 3 s): count 0.8–1.2 s; long clips: don't stretch the count past ~2.5 s — hold on the final value with a subtle scale push instead.

## Variations
- **Roll-up digits**: each digit in its own mask column, sliding vertically (odometer) instead of text replacement.
- **Ring counter**: replace the underline with a progress ring (see progress-ring).
- **Count-down/negative**: `from` > `to` for savings ("−40 %") with a red/green delta chip.
- **Number + context line**: a small "from 0.9M last year" line ghosted at 40 % under the label.
- **Beat ticks**: count in steps on each beat (`Math.floor` to the beat index) for a mechanical feel.

## Pitfalls
- Without the min-width + tabular numerals, the row width changes every frame and the whole group jitters (and so does the bounding box used for anchoring).
- Linear counting looks cheap and the final digits blur by; always ease out.
- Too many decimals (≥ 3) are unreadable while moving.
- Measure after fonts load, otherwise min-width is computed with fallback metrics.
- Locale: Russian convention is space thousands + comma decimals — use the `thousands`/`decimalMark` options or the project's locale.

## Reference
Reference implementation: gallery/clips/counter-stat/ (clip.js, style.css). Key snippet:

```js
    // fixed width = widest of start / end value so digits don't push the layout around
    const num = $('.num');
    try { await document.fonts.load(`${weight} ${p.size}px '${p.font}'`, '0123456789'); } catch (e) {}
    let wmax = 0;
    for (const v of [p.from, p.to]) { num.textContent = fmt(v); wmax = Math.max(wmax, num.offsetWidth); }
    num.style.minWidth = Math.ceil(wmax) + 'px';
```

```js
      .fromTo($('.cap'), { y: 20, opacity: 0, scale: 0.9 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, t0 + ct - 0.1)
      // landing bump when the count finishes
      .fromTo(row, { scale: 1 }, { scale: 1.04, duration: 0.12, ease: 'power2.out', yoyo: true, repeat: 1 }, t0 + ct - 0.02)
      // exit
      .to([row, $('.ul'), $('.label'), $('.cap')], { y: -40, opacity: 0, duration: 0.45, ease: 'power3.in', stagger: 0.06 }, out);

    const fill = $('.fill');
    return {
      render(t) {
        const k = 1 - Math.pow(1 - studio.progress(t, t0, ct), 4);
        num.textContent = fmt(p.from + (p.to - p.from) * k);
        fill.style.transform = `scaleX(${k})`;
      },
    };
```
