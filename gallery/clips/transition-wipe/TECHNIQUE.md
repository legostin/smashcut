# Diagonal Band Wipe

1–3 staggered, full-frame colour bands sweep across at an angle, fully cover the frame at the clip's midpoint (the cut), then sweep out — transparent at both ends.

## Use it for
- A clean, graphic scene change between two shots or two scenes; chapter changes in explainers and promos.
- Brand-coloured transitions: the bands are literally the palette (accent → accent-2 → bg).
- A "title card in the middle": the optional label appears on the covering band.

## Avoid when
- The edit is meant to feel seamless or emotional (a cross-dissolve, ink blob or match cut fits better).
- Cuts are very frequent (every 1–2 s): a 1.4 s wipe on every cut becomes noise. Use it on scene boundaries only.
- You need an organic or textured feel — this is hard-edged and geometric.

## The cut contract
- The frame is **fully opaque from `half` to `half + hold`**, where `half = (D - hold) / 2`, so the covered window is centred on **D/2**.
- Place the item so its centre sits exactly on the cut: `start = cutTime - D/2`, on a track **above** both shots. Outgoing shot must extend to the cut, incoming shot must start at the cut (they need not overlap — the band hides the joint).
- At t = 0 and t = D the bands are off-frame (`xPercent ±101`), so the layer is transparent and can sit over anything.

## Anatomy
- `.tw` = full-frame container (`inset:0; overflow:hidden`).
- `.rot` = a box sized to the **bounding box of the frame in rotated space**: `bw = W|cos a| + H|sin a| + 8`, `bh = W|sin a| + H|cos a| + 8`, centred with negative margins and rotated by `angle`. Bands travel exactly as far as needed — no wasted motion, no corner gaps at any angle.
- `.band` × n: each `position:absolute; inset:0` inside `.rot`, moved with `xPercent` (so movement is along the rotated axis). DOM order = paint order; the **last band (color3) is on top and covers the cut**.
- `.label`: centred text, Unbounded 900 120 px uppercase, `white-space:nowrap`, fades/scales in over the covering band.
- Pure GSAP: no canvas, no `render(t)`.

## Motion
- `hold = min(p.hold, D/2)`, `half = (D-hold)/2`, `st = min(stagger, half*0.6/(n-1))`, `move = half - st*(n-1)`.
- In: band i goes `xPercent -101 → 0` over `move` s with `power3.inOut`, starting at `i*st`. With defaults (D 1.4, hold 0.08, stagger 0.08, 3 bands): half = 0.66, move = 0.50 s; bands start at 0, 0.08, 0.16 and the covering band lands exactly at 0.66.
- Out at `half + hold`: bands in **reverse** order (covering band first) go to `xPercent 101` (or back to `-101` if `continueOut` is off), same `move` and ease — revealing the colour bands under it, like peeling layers.
- Label: `opacity 0→1, scale 0.9→1` from `half*0.7` (power3.out), out from `half+hold` with `scale 1.05` (power3.in).
- The `power3.inOut` ease is what sells it: slow start, fast middle (the bands blur past), soft landing at the cut.
- Beat sync: choose D so the cut (D/2) lands on a beat — `start = studio.beat(n) - D/2` in project time; with 120 bpm a 1 s wipe = 2 beats.

## Adapt to the design system
- Colours: `color1` → `accent` (KEY_ROLES), `color2` → `accent-2`, `color3` → you usually want `bg` or `surface` (the covering colour should be calm, since it's the cut frame). In your own clip use `var(--color-accent)` etc.
- Type: label should use `var(--font-display)` and the display weight instead of the hard-coded Unbounded 900.
- Angle: 0 = left→right, 90 = top→bottom; 15–30° feels dynamic, 0° feels corporate. Negative angles reverse the diagonal.
- 9:16: the rotated-box math adapts automatically; reduce label size (120 px nowrap can overflow 1080 px width — measure and fit).
- Durations: 0.8–1.6 s. Note the move time scales with D (no cap), so a 3 s wipe crawls — for long covers, raise `hold` instead.
- Energy: `__energy` remaps time but the cut point stays at D/2 only for symmetric remaps; keep energy near 1 for transitions.

## Variations
- **Single slab**: `bands: 1` with a dark colour — the most neutral "slide" transition.
- **Retract**: `continueOut: false` — bands go back the way they came (a "curtain" feel).
- **Title interstitial**: set `label` and `hold` 0.6–1.0 s for a chapter name on the covering colour.
- **Chevron**: two `.rot` containers with ±angle, each half the frame, for a V-shaped wipe.
- **Beat-staggered**: set `stagger` to 1/4 of a beat so each band lands on a 16th.

## Pitfalls
- Placing the item so it **starts** at the cut: the incoming shot pops in under a half-opaque layer and the old shot vanishes too early. Centre it on the cut.
- The covering band must be the **last** in DOM (on top) and the last to arrive; reorder and you'll see a sliver of the old shot at D/2.
- Using `x` in px instead of `xPercent` inside the rotated box breaks at other resolutions.
- `.band.lead::before` exists in style.css but nothing adds the `.lead` class — dead CSS, ignore it.
- Low contrast between bands reads as a flicker rather than layers; keep at least one strong value step.

## Reference
Reference implementation: gallery/clips/transition-wipe/ (clip.js, style.css). Key snippet:

```js
const hold = Math.min(p.hold, D * 0.5);
const half = (D - hold) / 2; // time for the in-phase (and the out-phase)
const st = Math.min(p.stagger, (half * 0.6) / Math.max(1, n - 1));
const move = half - st * (n - 1);
// in: band 0 first, the covering band last; each lands exactly when the frame must be covered
bands.forEach((b, i) => {
  tl.fromTo(b, { xPercent: -101 }, { xPercent: 0, duration: move, ease: 'power3.inOut' }, i * st);
});
// out: covering band leaves first, revealing the others which follow
const outStart = half + hold;
bands.slice().reverse().forEach((b, j) => {
  tl.to(b, { xPercent: p.continueOut ? 101 : -101, duration: move, ease: 'power3.inOut' }, outStart + j * st);
});
```

```js
const a = (p.angle * Math.PI) / 180, W = studio.width, H = studio.height;
const bw = Math.ceil(W * Math.abs(Math.cos(a)) + H * Math.abs(Math.sin(a))) + 8;
const bh = Math.ceil(W * Math.abs(Math.sin(a)) + H * Math.abs(Math.cos(a))) + 8;
```
