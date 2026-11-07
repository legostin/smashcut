# News Ticker + Station Bug

A broadcast overlay: a full-width bottom ticker with a constant-speed headline crawl, a category box that flips to the category of the headline currently entering, a running clock chip, and a top-right station bug with a pulsing LIVE tag.

## Use it for
- News parodies, livestream overlays, event screens, market/score updates, "meanwhile" info layers.
- Long holds over footage where a secondary information layer keeps the frame busy without a focal claim.
- Any looping list of short facts (sponsors, schedule, tips) presented as a crawl.

## Avoid when
- The info must be read in full — viewers catch only fragments of a crawl. Use a lower third or a card.
- 9:16 shorts with platform captions/UI at the bottom: the bar sits at 16 % from the bottom and can clash.
- Clips under ~4 s: the crawl barely moves past one headline.

## Anatomy
- `.tk` full-frame transparent container; `U = min(W,H)/1080`; bar height `BH = barHeight·U` drives all ticker font sizes (`calc(var(--bh) * 0.4)` etc.).
- **Bar**: full width at `bottom: 54u` (16 % of height in vertical), vertical gradient from the `bar` colour (`color-mix` lighter top / darker bottom), a 3u accent top rule (`::before`), drop shadow.
- **Category box** `.cat`: accent fill, angled right edge (`clip-path` with an 18u slant), `perspective: 400u`, two absolutely positioned faces `.a`/`.b`. Its width is fixed to the widest category so the bar never jumps.
- **Crawl** `.crawl > .strip`: an overflow-hidden lane with soft edge fades (`mask-image` linear gradient 40u each side); the strip is a nowrap flex row of `<b>text</b><span class="sep">•</span>` items, separator in the accent colour.
- **Repeat to cover**: one cycle is measured (`strip.scrollWidth`), then copies are appended until `x0 + speed·(D − t0)` is covered — no wrap-around needed, so no seam.
- **Clock chip** (JetBrains Mono, darker cell) and **station bug** (Unbounded logo on dark glass + red LIVE tag, 64u tall, top-right 64u/54u).
- **Items** parse as `CATEGORY | text` per line; a line without a category inherits the previous one.

## Motion
- 0.02 s: bar wipes in from the left (`clipPath inset(0 100% 0 0) → 0`, 0.5 `expo.out`).
- 0.15 s: category box slides from `xPercent −110` (0.45 `expo.out`); 0.3 s: clock slides from +24u.
- 0.4 s: bug fades/scales `0.86 → 1`, drops 10u (0.6 `expo.out`); 0.62 s: LIVE tag wipes open.
- Crawl: `x = x0 − speed·max(0, t − 0.35)` with `x0 = 30 %` of the lane — **linear** and constant (the only place linear is right). Starts once the bar is in.
- Category sync: for every item, the time its left edge reaches `leadX = 90u` from the lane start is solved analytically (`tc = t0 + (x0 + o.x − leadX)/speed`); when the category changes, the box flips over 0.5 s (`inOutCubic`): old face rotates `rotateX 0→90°` and moves up 50 %, new face comes from below — computed in `render(t)` from the change list, no state.
- LIVE dot: cosine pulse at 1 Hz; clock colon blinks every half second; clock = `startTime + t`.
- Exit at `max(0.9, D − 0.5)`: bug fades (0.3), category + clock fade (0.2), bar wipes out to the right (`inset(0 0 0 100%)`, 0.4 `expo.in`).

## Adapt to the design system
- `accent` → accent token (category box, rule, separators), `accentText` → bg token. **Caution:** the `bar` param name matches the runtime's accent heuristic, so under a design system the bar becomes the accent colour — in your own clip bind the bar explicitly to `surface`/`bg` (`"token": "surface"`).
- LIVE red `#e3172b` and the bug's dark glass are hard-coded; map them to an alert/danger colour and the surface token.
- Fonts: Inter for headlines, Unbounded for the logo — use body and display roles.
- 9:16: raise `barHeight` to ~80 and `speed` lower (~150) — the lane is narrower so text passes faster per screen width; move the bug below the top 10 % (platform UI).
- Speed: 150–220 px/s at 1080p reads comfortably; > 300 is unreadable.

## Variations
- **Static rotating headline**: instead of a crawl, show one headline at a time with a mask rise every N s, category flipping in sync.
- **Market ticker**: items like `AAPL ▲ 1.2%`, green/red per item, no categories.
- **Top crawl**: bar at top for event/stream "now/next" info; drop the bug.
- **Beat crawl**: category flips on `studio.bars` instead of geometry.
- **Branded bug only**: just the bug + LIVE for a stream watermark.

## Pitfalls
- Never accumulate position frame by frame; `x` must be a function of `t` (seeking backwards must work).
- Measure widths after fonts load (they are loaded before setup in this runtime) and before animating.
- Do not wrap the strip with modulo unless the strip is at least lane width + one cycle; the reference sidesteps this by appending copies.
- The category box width must be fixed to the widest category or the lane width changes on every flip.
- Uppercase heavy category text needs `letter-spacing` and a contrasting `accentText`; yellow + white text fails.

## Reference
Reference implementation: gallery/clips/broadcast-ticker-bug/ (clip.js, style.css). Key snippet:

```js
    const cycleW = strip.scrollWidth;
    const crawlW = crawl.clientWidth;
    const speed = p.speed * U;
    const t0 = 0.35; // crawl starts once the bar is in
    const x0 = crawlW * 0.3;
    const need = x0 + speed * Math.max(0, D - t0) + 10;
    let copies = Math.max(1, Math.ceil(need / Math.max(1, cycleW)));
    for (let c = 1; c < copies; c++) items.forEach((it) => mk(it));
    // item start offsets in the strip (for category sync)
    const offs = [...strip.children].map((el, i) => ({ x: el.offsetLeft, cat: items[i % items.length].cat }));
    const leadX = 90 * U; // the box flips just before a new headline reaches it
    // category change times
    const changes = [{ t: -1e9, cat: offs[0].cat }];
    for (const o of offs) {
      const tc = t0 + (x0 + o.x - leadX) / speed; // x0 - speed (t - t0) + o.x = leadX
      if (o.cat !== changes[changes.length - 1].cat && tc > 0) changes.push({ t: tc, cat: o.cat });
    }
    const catAt = (t) => { let k = 0; while (k + 1 < changes.length && changes[k + 1].t <= t) k++; return k; };
```

```css
.tk .crawl { position: relative; flex: 1; min-width: 0; overflow: hidden; margin-left: calc(-18px * var(--u)); -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 calc(40px * var(--u)), #000 calc(100% - 40px * var(--u)), transparent 100%); mask-image: linear-gradient(90deg, transparent 0, #000 calc(40px * var(--u)), #000 calc(100% - 40px * var(--u)), transparent 100%); }
```
