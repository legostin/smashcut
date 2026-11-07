# Podcast Audiogram

A full-frame podcast promo: cover art over its own blurred copy, show + episode title, a canvas waveform driven by `studio.level()`, word-highlighted captions and a progress bar with elapsed time.

## Use it for
- Social cut-downs of podcasts, interviews, voice notes and radio segments where there is no picture.
- Any "audio is the content" moment: a quote from a guest, a teaser for an episode.
- 16:9 (cover left, column right) and 9:16 (cover top, column below) — the layout switches automatically.

## Avoid when
- There is real talking-head footage — use a caption technique over the video instead.
- The project has no audio at all: the waveform falls back to the synthetic beat pulse and looks mechanical.
- Clips under ~5 s: the intro (≈1.3 s) and caption paging need time to read.

## Anatomy
- `.ag` full-frame root (`#120e18` background, Manrope). Everything is sized with a unit `--u = min(W,H)/1080`, written as `calc(Npx * var(--u))`.
- **Backdrop**: `.bgimg` (inset −12 %) holds the cover image with `filter: blur(70u) saturate(1.25)`, then `.shade` — a radial dark gradient (linear in vertical) for text contrast.
- **Grain**: a half-resolution canvas with `mix-blend-mode: overlay`; 5 pre-generated 160×160 seeded noise tiles (`studio.random(17)`), one picked and offset 12×/s from `studio.random(500 + floor(t*12))`.
- **Cover**: 540u square, radius 30u, deep shadow + 1 px inner rim; the `<img>` inside does a Ken Burns (`scale 1 → 1.05`, translate −1.2 % / −0.8 % over the clip).
- **Column**: show label (accent glowing dot + uppercase 26u), episode title (word masks `.w > .i`, auto-shrinks from 66u until ≤ 3 lines, min 34u), waveform canvas (190u tall; 230u vertical), caption block (Inter 600 40u, min-height two lines), progress track + knob + `m:ss` times in JetBrains Mono.
- **Captions model**: `studio.words` (when `useTranscript`) clipped to the clip range; otherwise the `captions` text is spread from `min(1, D*0.12)` to `D − min(0.6, D*0.08)` with weights = word length + 3, +6 after sentence ends, +3 after commas — so pauses feel natural. Pages hold ≤ `wordsPerPage` words and break after `. ! ? …`.

## Motion
- 0 s: backdrop fades in (0.8 s `power2.out`).
- 0.1 s: cover scales 0.86 → 1, y +30u → 0, fades in (0.9 s `expo.out`).
- 0.25 s: show label wipes in with `clipPath: inset(0 100% 0 0) → inset(0 0 0 0)` (0.6 s `expo.out`).
- 0.32 s: title words rise from `yPercent 110` (0.8 s `expo.out`, stagger 0.035 s).
- 0.55 s: progress bar fades/rises (0.6 s `power3.out`).
- Waveform intro from 0.55 s: bars grow centre-out (`ease.outCubic`, 0.6 s each, edge bars up to 0.25 s later); outro shrinks everything in the last 0.4 s (`ease.inCubic`).
- **Waveform**: each bar's height = `smooth(t − d*0.32)` where `d` is distance from the centre — the centre shows "now", the edges show the level 0.32 s earlier, so energy ripples outward. `smooth` = max over the last 7 frames with exponential decay (fast attack, ~6-frame release). Multiplied by a centre-weighted shape `0.3 + 0.7(1−d²)` and a deterministic sine "noise" so neighbouring bars differ.
- **Captions** (in `render`): a page appears 0.05 s before its first word; words rise 14u and fade in with a 0.03 s stagger over 0.25 s; unspoken words sit at 42 % opacity, the current word turns accent and scales 1.04. The page clears after 1.2 s of silence and in the last 0.3 s.
- Progress fill = `scaleX(t/D)`, knob `left` follows, elapsed label = `fmt(t)`.

## Adapt to the design system
- `accent` binds to the accent token (dot, waveform, progress, current word). Use `var(--color-bg)` / `var(--color-surface)` for the `.ag` background and shade tint instead of the hard-coded purple-black.
- Fonts: title → display/title role, captions → body role, times → a mono role if the system has one.
- Radius: cover radius 30u and pill track `99px` — match the system's radius scale.
- 9:16 is handled by the `.vert` class (cover 700u top-centre, column from y 910u, centred text). For square (1:1) neither layout is ideal — add a third layout.
- Long clips (30–60 s): raise `wordsPerPage` only to ~8; better keep 5–6 and let pages change more often. Set `episodeLength` so the total time shows the real episode length, not the clip length.

## Variations
- **Bars-only / line**: `waveStyle: 'bars'` (bottom-anchored) or `'line'` (filled mirrored polygon with a horizontal accent gradient) — same height array, different draw.
- **Video podcast**: replace the cover with a `<video data-start="0">` of the speaker; keep waveform + captions.
- **Quote card audiogram**: drop the title and show one large pull quote word-highlighted, waveform small below.
- **Chapter progress**: mark `studio.markers` as ticks on the progress track.
- **Beat-reactive cover**: scale the cover by `1 + 0.03 * studio.level(t)` for music podcasts.

## Pitfalls
- The comment says "backdrop drift" but only the cover image moves; if you want parallax, transform `.bgimg` too (less than the cover).
- Canvas size is read from `col.clientWidth` in setup — style changes after setup will not resize it.
- Captions must be rebuilt only when the page changes (`showPage` caches `shownPage`) — rebuilding DOM every frame is slow.
- `studio.words` arrive in clip-local seconds and may start negative; filter to `end > 0 && start < D` as the reference does.
- Waveform without smoothing flickers frame to frame; without the distance delay it looks like a single bouncing bar.
- Keep grain subtle (`grain` 0.04–0.08; opacity is `grain*3`), it is overlay-blended over text too.

## Reference
Reference implementation: gallery/clips/audio-audiogram/ (clip.js, style.css). Key snippet:

```js
    const lv = (t) => clamp(studio.level(t));
    const smooth = (t) => { // attack ~2 frames, release ~6 frames
      let m = 0;
      for (let i = 0; i < 7; i++) { const a = (lv(t - i * fr) + lv(t - (i + 1) * fr)) / 2; m = Math.max(m, a * Math.exp(-i / 6)); }
      return m;
    };
```

```js
        for (let k = 0; k < N; k++) {
          const d = Math.abs(k - (N - 1) / 2) / ((N - 1) / 2);
          const base = smooth(t - d * 0.32);
          const nz = 0.5 + 0.5 * Math.abs(Math.sin(k * 1.7 + t * 6.1 + 2 * Math.sin(k * 0.41 + t * 1.9)));
          const shape = 0.3 + 0.7 * (1 - d * d);
          hs.push(clamp(base * p.sensitivity * shape * (0.35 + 0.65 * nz)) * intro(k) * outro);
        }
```
