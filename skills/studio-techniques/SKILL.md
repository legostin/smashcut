---
name: studio-techniques
description: The gallery is a library of motion-graphics and music TECHNIQUES, not templates to paste. How to pick techniques that fit the script and the design system, study a technique's TECHNIQUE.md and reference code, and write an original clip or score in the project's own style. Includes a categorised index of every technique. Use whenever a scene needs a title, caption, chart, lower third, transition, logo sting, map, product shot, background or music bed.
---

# Technique library

Every folder in `gallery/clips/<id>/` and `gallery/music/<id>/` is a **reference implementation of a technique**:
`TECHNIQUE.md` explains how this kind of thing is made (anatomy, beat-by-beat motion, design-system hooks,
variations, pitfalls) and the code next to it shows one way to do it. Your job is to make **this project's** version:
its copy, its design tokens, its aspect ratio, its timing and its music — not to drop in the gallery look.

A video assembled from untouched templates looks like a template pack: mismatched fonts, colours that ignore the
brand, timings that ignore the script and the beat. An original clip built from the same technique looks designed.

## Workflow
1. **Start from the script and the design.** `get_script` (what each scene must say, how long it is) and `get_design`
   (colours, type roles, motion tokens, spacing). Note format (`get_project`: 16:9 or 9:16) and music (`get_timing`).
2. **Pick techniques per scene** from the index below. Choose by the story moment, not by looks:
   hook → title / stomp / scramble; claim with a number → counter / ring / chart; who is speaking → lower third;
   where → map; how it works → product / cursor / terminal; speech → caption technique; scene change → transition.
   One hero technique per scene; supporting layers (background, callout) stay calm.
3. **Study before writing.** Read `gallery/clips/<id>/TECHNIQUE.md` fully, then the parts of `clip.js` / `style.css`
   it points to. Understand *why* the motion works (mask + overshoot, anticipation, hold push, exit from `duration`).
4. **Write an original clip** with `create_clip` in `clips/<new-id>/`:
   - project copy (from the script) and real data — not the reference's placeholder text;
   - design tokens (`var(--color-*)`, `var(--font-*)`, `studio.design.color()/motion()`), not the reference's hex values;
   - layout computed from `studio.width/height` and the safe areas of the project's format;
   - timings derived from `ctx.duration`, `studio.beat(n)`, `studio.sections/markers`, `studio.words` for this scene;
   - only the params this project needs, with defaults that already look right in this project.
5. **Mix techniques** when the moment calls for it: a kinetic-words title over the mesh-gradient background,
   a counter-stat whose number lands on a `studio.markers` hit, captions with the pill highlight but Hormozi pacing,
   a lower third that uses the line-mask reveal. Borrow the mechanism, not the whole clip.
6. **Verify**: `render_clip` (contact sheet) → fix → `lint_clip` → `render_frame` in context on the timeline.
   Compare against the pitfalls list in the TECHNIQUE.md you used.

## When `use_template` is acceptable
- A **fast draft / animatic** to show structure to the user ("rough cut in 2 minutes"), or when the user explicitly
  asks for that exact gallery clip.
- Then **restyle before calling it done**: rename to a project id, bind colours/fonts to tokens (params with `token`),
  replace placeholder copy, check 9:16 layout and safe areas, retime to the scene and the beat, delete unused params.
- Never ship a video where several scenes are unmodified templates; never copy one and leave its demo text or brand.

## Music
Scores in `gallery/music/<id>/` work the same way: read `TECHNIQUE.md` + `score.js`, then write the project's own score
with `create_music` (see the studio-music-as-code skill) sized to the edit — bars to the video length, the drop or hit on
the key visual moment, sections declared so clips can sync. Reusing a gallery score unchanged is acceptable only as a
temporary bed for a draft.

## Gotchas that apply to most references
- **Token binding by key name.** The runtime maps colour params to design tokens by their key: a param named `color`
  binds to **accent** (not text), `bar`/`barColor` to accent, `navy`/`dark` to bg, `bgEdge` to surface. In your own
  clips declare `"token": "text"` (etc.) explicitly, or name keys `textColor`, `surface`, `background`.
- **1080p/16:9 assumptions.** Many references fit text to a hard-coded width (`1920 - 280`, `1700`) or use fixed px
  boxes (charts 1440×820, browser 1500×880). Compute from `studio.width/height` and a margin so 9:16 works.
- **Palette modes.** Some references only use the accent param in a `custom` palette mode; when you rebuild, drive the
  colours from tokens directly.
- **`-webkit-text-stroke` on Unbounded** shows inner contours; use the SVG `feMorphology` outline from title-marquee-repeat.

## Index
Read `gallery/clips/<id>/TECHNIQUE.md` (or `gallery/music/<id>/TECHNIQUE.md`) before using any of these.

### Titles
- **title-kinetic-words** — words rise one by one through masks, `*accent*` words get a colour block; openers, thesis statements.
- **title-line-mask-reveal** — editorial lines slide/rotate/blur up through per-line masks with eyebrow, hairline and subtitle; premium chapter cards.
- **title-cinematic** — serif film title resolves from blur with breathing letter-spacing, light leak, vignette, grain; trailers, chapters.
- **title-glitch** — RGB-split title from a frame-quantised hash: scramble, slice tears, noise bars, bursts; tech, gaming, hard cuts.
- **title-marquee-repeat** — full-frame wall of a repeated phrase, rows scroll in alternating directions with sine sway and SVG outlines; fashion, events.
- **title-stomp-promo** — one giant word per beat with flashes, inverts, outline words and whip ghosts; hype intros cut to music.
- **quote-card** — oversized quote mark lands, words resolve from blur with highlights, author fades in; testimonials, citations.
- **countdown** — 3-2-1 numbers punch inside a draining ring with tick flashes and a ray-burst final word; pre-reveal hype.

### Text effects
- **text-gradient-shine** — keynote headline: words blur-rise, a gradient sweeps across all words (or a light band passes); product launches.
- **text-scramble-decode** — headline decodes from random glyphs (cursor, random or centre-out order); tech, AI, cyber reveals.
- **text-typewriter-terminal** — terminal types commands at a seeded human pace with cursor, syntax colours and instant output; dev/AI demos.
- **text-neon-flicker** — neon-tube text flickers on, breathes with one faulty letter, cuts off with afterglow; nightlife, gaming, retro.
- **text-3d-extrude** — retro letters bounce in and pop out of the page with a stacked text-shadow extrusion; sale hits, punchlines, kids/gaming.

### Captions (speech-driven, `studio.words`)
- **caption-karaoke** — phrase captions with a box/colour/underline sliding word to word as spoken; general read-along captions.
- **caption-pill-highlight** — balanced sentence-case pages, one rounded pill glides to the spoken word; minimal tutorial/podcast captions.
- **caption-hormozi-bold** — heavy all-caps 1–3-word pages, black stroke, yellow active word, green emphasis; retention talking-head shorts.
- **caption-mrbeast-pop** — one giant word at a time with overshoot, tilt, 3D extruded shadow, coloured keywords; hype viral shorts.

### Lower thirds
- **lower-third-slide** — accent bar grows, plate clip-path-wipes open, name and role slide in; the safe default name plate.
- **lower-third-minimal** — a thin line draws on, the name rises out of it and the role drops below; quiet editorial speaker IDs.
- **lower-third-glass** — frosted liquid-glass blob stretches elastically into a plate, catches a sheen, melts out; modern tech/vlog interviews.
- **lower-third-social-handle** — pill grows from a platform icon disc and flips through handles with follower counts; "follow me" moments.

### Callouts
- **callout-arrow** — pulsing target marker and label card joined by a curved arrow that draws on; point at one detail.
- **callout-hand-drawn** — seeded rough-marker circles, underlines, boxes, highlighter, arrows drawing on; Vox-style explainer markup.
- **callout-spotlight-zoom** — feathered scrim with a spotlight gliding between targets, ring and label cards; UI walkthroughs.

### Infographics
- **counter-stat** — big number counts up with an ease-out, underline fills, landing bump, caption chip; one key metric.
- **progress-ring** — gradient arc gauge with counting %, lit ticks, glow and a landing punch; one percentage KPI.
- **bar-chart** — vertical bars grow in sequence with counting labels, gridlines and one highlighted bar; simple data series.
- **line-chart** — line and gradient area draw on behind a glowing head, points pop, last value badge; trends and growth.
- **infographic-donut-chart** — segments sweep clockwise with counting centre stat, legend and one popped-out highlight; shares of a whole.
- **infographic-bar-race** — horizontal bars interpolate between periods, re-rank and rescale the axis; rankings over time.
- **infographic-timeline** — spine draws node by node, milestone cards rise alternately while the camera pans; histories, roadmaps.
- **infographic-versus-compare** — diagonal split VS slam with shake, mirrored bars per metric, winner checks, score; X vs Y.
- **infographic-wrapped-bento** — Wrapped-style bento tiles flip in with counting numbers and stickers, or one stat per step; recaps.

### Social
- **social-tweet-card** — X/Threads/Bluesky/Reddit-style post card: words blur in, metrics count, like pops; quoting posts in commentary.
- **social-chat-bubbles** — iMessage/WhatsApp chat with typing dots, tail-pop bubbles, auto-scroll, read receipt; texting skits.
- **social-speaker-card** — full-frame bento announcing a speaker (arch photo, name, talk, date) with cell-by-cell clip reveals; event promos.
- **social-subscribe** — channel card where a cursor clicks Subscribe, Like and the bell with bursts; YouTube CTA overlay.
- **social-end-screen** — YouTube end-screen layout with headline, video/playlist slots and subscribe ring drawn on; last 5–20 s.

### Product
- **product-browser-window** — browser window tilts in, types its URL, skeleton-loads, auto-scrolls a landing page; SaaS/site showcases.
- **product-cursor-demo** — cursor glides on arcs, clicks with ripples, types, camera zooms over a dashboard; demos without screen recording.
- **product-phone-mockup** — CSS 3D phone rises beside a masked headline and bullets, sways, cycles app screens; app launches.

### Maps
- **map-pin-highlight** — paper world pushes in to a country, border draws, fill wipes, pin drops with a tag; "where is this" explainers.
- **map-route-flight** — dashed arcs draw leg by leg between city pins with a moving plane, distance chips, following camera; travel/logistics.

### Audio-reactive (`studio.level()`)
- **audio-audiogram** — podcast audiogram: cover art, level-driven mirrored waveform, word-highlighted captions, progress bar; podcast promos.
- **audio-radial-visualizer** — circular spectrum ring, pumping vinyl/artwork, kick-driven particles; music uploads, lo-fi loops, DJ promos.

### Broadcast
- **broadcast-breaking-news** — angled flipping "breaking" block, headline/subheadline bars, LIVE and clock chips; urgent news-style straps.
- **broadcast-ticker-bug** — constant-speed headline crawl with synced category flip, clock and LIVE station bug; news parodies, streams.

### Logos
- **logo-line-draw** — outlines draw on (DrawSVG), fills cross-fade in, shine sweeps, wordmark tracks in; elegant intros/outros.
- **logo-reveal** — ring, rays and particles burst, mark pops and slides aside, letters rise; loud launch/channel stings.
- **logo-shape-assemble** — primitives fly in, orbit and morph (MorphSVG) into the mark, flash pop, wordmark slides out; playful stings.

### Backgrounds
- **bg-gradient-mesh-grain** — seamless-looping aurora mesh gradient with seeded grain and vignette; calm premium backdrop.
- **bg-tech-grid** — dot/line blueprint grid revealed from the centre with light pulses, optional synthwave floor; SaaS/AI backdrop.
- **beat-pulse-shapes** — canvas field of geometric shapes rippling on every beat with bar shockwaves (`studio.beats/bars`); music-driven backdrop.

### Transitions (fully covered at `duration/2` — centre on the cut)
- **transition-wipe** — staggered diagonal colour bands cover then uncover; clean brand-coloured scene/chapter changes.
- **transition-shape-overlay** — stacked colour layers with wavy seeded leading edges flood across; playful liquid scene changes.
- **transition-ink-blob** — gooey canvas ink blots with splatter cover, then dissolve through holes; soft lifestyle/wedding/art cuts.
- **transition-whip-streaks** — fast streak bands with speed-scaled smear and a cut flash; energetic whip-pan cuts on the beat.

### Music (`gallery/music/<id>/`)
- **pulse-120** — 120 bpm, A minor minimal electronic, riser into a drop at bar 8 (15 frames/beat); tech promos, fast montages.
- **corporate-bright** — 116 bpm, C major I–V–vi–IV plucks, four-on-the-floor, bell hook chorus, clean ending; product promos, explainers.
- **synthwave-drive** — 104 bpm, A minor 80s arp that opens up, gated snare, lead from bar 8; retro, gaming, neon edits.
- **lofi-chill** — 84 bpm, C major ii–V–I swung boom-bap, electric piano, vinyl crackle, 2-bar break; vlogs, tutorials, B-roll.
- **cinematic-rise** — 76 bpm, D minor trailer build, a beat of silence then the hit at bar 12; reveals, trailers, dramatic openers.
- **ambient-pad** — 72 bpm, beat-free blooming pads, drone, bells (Fmaj9–Cadd9–Am9–Gsus2); narration, meditation, beauty shots.
