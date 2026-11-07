# Craft research digest: editing, video and motion design for Smashcut agents

Compiled 2026-11-08. This is a reference for writing Smashcut's core skills. Each rule is written as an instruction ("Do X because Y"), with numbers where a source gives them.

Confidence tags:
- **[std]**: a published standard or first-party spec (SMPTE, EBU, Netflix, BBC, Material, Carbon, Fluent, NN/g, TikTok or Google ad guidance).
- **[measured]**: measured by a tool vendor on shipped films (mostly HeyGen HyperFrames). Good defaults, not laws.
- **[practice]**: widely repeated practitioner convention with no single authority.
- **[uncertain]**: sources conflict, or the number is an estimate. Verify it, or treat it as a starting point only.

All pixel figures assume 1920x1080 (16:9) or 1080x1920 (9:16) unless stated otherwise. Scale proportionally for other sizes.

---

## 0. The meta-rules

These sit above every other section.

1. **Write the story before you build any frame.** Most weak generated films are "good motion around no story": a list of features, three cards in a row, a logo, a URL. State the one thing the viewer must remember, then build only what serves it. [measured, HyperFrames story.md]
2. **Let the audio be the clock.** With narration, time every beat to the word timestamps. With music only, time beats to bars and downbeats. Never stretch motion to fill audio; trim the script or the music instead. [measured, HyperFrames; video-use]
3. **Keep one thing moving at a time, and make it the thing that matters.** The eye cannot track two new things at once, so reveal one thing, pause, then reveal the next. [practice, video-use; IxDF staging; Fluent hierarchy]
4. **Fight the defaults.** Generated motion falls into recognisable tells: everything fades and slides up, idle "breathing" loops, a dark void with floating cards, the same `power2.out 0.5s` on every element. Name them in a BANNED list and replace each with a choice taken from the subject or the brand. [measured, HyperFrames; Anthropic frontend-design]
5. **Measure, then look, then fix the worst thing first.** You cannot hear the audio or see motion the way a viewer does. Use numeric checks (loudness, on-screen read time, safe areas, contrast) plus contact sheets of frames, rank problems P0/P1/P2, and fix P0s first. Never "score" a film out of 10, because a score finds nothing to fix. [measured, HyperFrames review.md; video-use self-eval]

---

## 1. Editing

### 1.1 Murch's Rule of Six (decide every cut by priority)

Walter Murch (*In the Blink of an Eye*) ranks six criteria for a cut, with his own weights:

| Criterion | Weight |
|---|---|
| Emotion | 51% |
| Story | 23% |
| Rhythm | 10% |
| Eye-trace | 7% |
| 2D plane of screen | 5% |
| 3D space of action | 4% |

The weights are Murch's stated values, not a measured result.

- **Choose the cut that best serves emotion, even when it breaks spatial continuity**, because emotion outweighs the bottom three criteria combined. When a cut cannot satisfy all six, give up the lowest ones first: 3D space, then 2D plane, then eye-trace. Never trade emotion for story. [std/practice, Murch]
- **Plan eye-trace across every cut.** Put the incoming focal point near where the outgoing focal point was, or where the eye is already travelling. In motion graphics this becomes the "carrier" rule (§3.4): hand a concrete object across the cut at a matched position. [Murch; HyperFrames motion-doctrine]
- **Cut at the moment the viewer would blink, which is when the thought completes.** Murch's blink theory says a cut lands well when the idea of the shot has been delivered. Don't hold a shot after its information is spent. [Murch, practice]

### 1.2 Cut types and when to use them

- **Cut on action.** Cut in the middle of a movement (a hand reaching, a door opening, an element accelerating) because the viewer follows the motion and doesn't notice the cut. In motion graphics: cut at the fastest frame of a move, with the same direction and speed on both sides. [practice; HyperFrames motion.md]
- **J-cut and L-cut (split edits).** In a J-cut, the next shot's audio starts before its picture. In an L-cut, the current shot's audio continues over the next picture. Use them in dialogue, interviews and voice-over to smooth scene changes and make cuts feel motivated, because sound leading picture prepares the viewer. Pair them; J and L cuts work best together. [practice; Vimeo, StudioBinder]
  - Smashcut mapping: let VO run 0.3–1.0 s over the start of the next clip (L), or let the next scene's music or SFX start up to 0.5 s early (J). These durations are [practice]; tune them by eye.
- **Match cut.** Join two shots by a shared shape, motion or position: a circle becomes a lens, a wheel, a logo. Use it for scene changes in graphics because it gives the eye a carrier. Keep the carrier's centre within about 12 px and its size within 5% across the cut, which is the tolerance HyperFrames' Seam Gate enforces. [measured]
- **Jump cut.** A cut between two shots of the same subject from almost the same angle. Use it deliberately, to compress time in a talking head or for energy, and pair it with a punch-in (scale 1.0 → 1.1–1.2) so it reads as intended. Otherwise change the angle by at least 30° or change the shot size, because smaller changes read as mistakes (the 30-degree rule). [practice; StudioBinder]
- **Cut-in or punch-in.** A tighter framing of the same shot, used for emphasis on a word. Make punch-ins on the stressed word and keep them on a wrapper, never on the media element itself. [HyperFrames motion.md]
- **Hard cut vs. transition.** Prefer hard cuts and motivated transitions over dissolves. HyperFrames' measured rule: use 3–5 kinds of transition per film, each caused by something on screen. At most one third of seams between beats should be plain hard cuts. Worlds never crossfade into each other. [measured]
- **Dip cut.** Darken the outgoing frame by about 40% for 3 frames before a hard cut so the cut reads as intended. [measured, HyperFrames]

### 1.3 Continuity

- **180-degree rule.** Keep cameras on one side of the axis between two subjects so screen direction stays consistent. In graphics the equivalent is screen direction: if a product, character or data flow moves left-to-right in one scene, keep it moving left-to-right in the next. A flip reads as a reversal of meaning. [std practice; StudioBinder]
- **Pick one dominant direction per film (the "current") and use it for every ordinary transition.** Reserve other directions for meaning. HyperFrames uses this mapping [measured]:
  - left: next beat;
  - up: elevation or a conclusion;
  - Z-push: going deeper into the same idea;
  - Z-pull: arrival of something bigger.

  Never run consecutive transitions in opposite directions, because ping-pong reads as an error. Change direction only with a visible cause (a click, an impact) or at a chapter boundary.
- **Match the scale-sign on Z transitions.** If the outgoing scene recedes (shrinks), the incoming one must also be shrinking into place (it starts large, at about 1.25, and settles to 1). Never answer it with a grow-from-small entrance, because that mirrors the vector. This is the most common violation, because grow-from-small is the default entrance. [measured, HyperFrames cut-the-curve]
- **Keep synchronised layers on one clock.** A shot's video, its captions and its source-synced overlays belong under one timing group, so trimming or moving the shot moves all of them. [Remotion video-editing skill]

### 1.4 Cutting dialogue and voice-over

- **Never cut inside a word.** Snap every cut to a word boundary from a word-level transcript. [video-use, hard rule]
- **Pad cut edges by 30–200 ms.** Transcriber timestamps drift 50–100 ms. Example values: 50 ms before the first kept word and 80 ms after the last. Go tighter for montage energy and looser for documentary. [video-use]
- **Prefer silences of at least 400 ms as cut points.** 150–400 ms gaps are usable after a visual check. Gaps under 150 ms are unsafe (mid-phrase). [video-use]
- **Leave 400–600 ms of air at speaker handoffs.** Use less for fast pace and more for a cinematic feel. [video-use, practice]
- **Put a 30 ms audio fade on every segment boundary**, because hard sample cuts pop. [video-use, hard rule]
- **Extend past punchlines to include the reaction**, because the laugh or the beat is part of the moment. [video-use]
- **Never decide audio and video cuts independently.** Every cut must work on both tracks. [video-use]

### 1.5 Shot length and pacing by context

| Context | Typical shot or hold length | Source |
|---|---|---|
| Contemporary English-language feature films, average | ~2.5–4 s (down from ~10–12 s in the 1930s) | Cutting/Salt [std research; figures vary by sample] |
| Fast montage | 0.13–0.8 s per cut | HyperFrames [measured] |
| Product-launch films, average shot | 1.8–3 s, with motion inside the shot | HyperFrames [measured] |
| UI demo, one framing while the UI acts | 7–10 s | HyperFrames [measured] |
| Vertical social | 1–2 s shots; a new beat every 2–4 s | HyperFrames vertical.md [measured]; 1.5–2.5 s scene change per creator blogs [uncertain] |
| Simple explainer card over VO | 5–7 s; complex diagram 8–14 s; floor 3 s | video-use [measured on one launch] |
| Narrated explainer scene | ~19 spoken words (~9 s); at most 2 scenes up to 26 words (12 s) | HyperFrames film.md [measured] |
| Music video, per lyric phrase | 1.4–4 s | HyperFrames music.md [measured] |
| Any single visual treatment | goes stale after ~6 s; change it or cut | HyperFrames [measured] |

- **Contrast your speeds.** A fast process is followed by a payoff at normal speed. Uniform tempo reads as a lecture or a slideshow. [measured; manim-video design thinking]
- **Hold 0.3–0.75 s of stillness before the payoff** (the "dramatic comma"), because jumping straight from action to result kills the reveal. [measured, HyperFrames]
- **Treat more than 3 s with nothing changing as a dead stretch.** Fix it unless the hold is deliberate. [measured, HyperFrames `dead_stretch` warning]
- **Hold the final frame of an animation at least 1 s before the cut.** Over voice-over, make a visual at least as long as its narration plus 1 s. [video-use]

**Sources: Editing**
- Murch's Rule of Six, UT Austin RTF wiki: https://cloud.wikis.utexas.edu/wiki/spaces/rtf318/pages/80022510/Murch+s+Rule+of+Six
- No Film School, "6 Rules for Good Cutting According to Walter Murch": https://nofilmschool.com/2016/11/6-rules-good-cutting-according-oscar-winning-editor-walter-murch
- Cutting et al., "Quicker, Faster, Darker: Changes in Hollywood Film over 75 Years" (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC3485803
- Cornell, "Pattern in movies mimics that found in our brain": https://news.cornell.edu/node/271563
- Vimeo, "How and when to make Jump cuts, L-cuts, and J-cuts": https://vimeo.com/blog/post/guide-to-film-cuts
- StudioBinder, "What is continuity editing": https://www.studiobinder.com/blog/what-is-continuity-editing-in-film/
- browser-use/video-use SKILL.md (cut craft, hard rules): https://github.com/browser-use/video-use
- HeyGen HyperFrames skills (motion.md, film.md, motion-doctrine, cut-the-curve): https://github.com/heygen-com/hyperframes

---

## 2. Rhythm and music

- **Compute the beat grid from the BPM; never accumulate rounded beats.** Frames per beat = fps × 60 / BPM. Compute each beat as `round(index × framesPerBeat)`, because adding a rounded value repeatedly drifts (at 128 BPM and 30 fps it drifts 2 frames in 32 beats). [measured, HyperFrames motion.md]
- **Cut on the beat; change the layout on the bar.** Beat-level events are cuts, hits and pops. Bar-level events (every 4 beats in 4/4) are scene, layout or colour changes. Chapters land on section boundaries (verse, chorus). [measured, HyperFrames]
- **Start a move 40–190 ms before the hit it must land on.** A reaction starts 0–45 ms after the hit. The hit itself is an instant set with 0 ms duration, because easing a hit kills its punch. [measured, HyperFrames film.md]
- **Optionally cut 1–2 frames before the beat** for a tighter feel. Many music editors do this because a cut that lands late feels wrong sooner than one that lands early. [practice, uncertain; no rigorous study found]
- **Land sound effects one frame after their picture**, because light arrives before sound and an early sound feels wrong sooner than a late one. Most SFX files have an attack before their transient, so measure the peak and offset the file so the peak lands on the contact frame. [measured, HyperFrames sound.md; video-use]
- **Trust beat detection only on rhythmic passages.** On calm music, trackers invent a metronome, often at double tempo. Cut there on phrase and energy changes instead. [measured, HyperFrames]
- **Don't cut on every beat.** Cut density follows energy: slower shots in verses, one picture per strong beat in choruses, a held image on a breakdown. "Every cut on every beat" is a named tell. [measured, HyperFrames music.md]
- **Enter music at its strongest bar, not at a quiet intro, and end on a bar line** with a short fade under the end card. With looped library beds, use a 0.4 s fade-in and a 1.5 s fade-out. [measured, HyperFrames]
- **Hold any word meant to be read for at least one beat.** [measured, HyperFrames]
- **Lengthen a section with a hold or a new treatment, never by slowing tweens.** Slowed motion reads as sluggish. [measured, HyperFrames]
- **Let the sound act out the story.** The "old way" sits near silence, the music opens when the product or answer appears, and the music holds back until the payoff. [measured, HyperFrames sound.md]
- **For generated music under captions or VO, keep it simple and out of the way:** 70–90 BPM, a 4-chord loop in soft tones, a 1 s fade-in, a 2 s fade-out, and peaks around a quarter of full scale. [Anthropic explainer-video-maker quickstart]

**Sources: Rhythm and music**
- HyperFrames motion.md, film.md ("On music"), types/music.md, sound.md: https://github.com/heygen-com/hyperframes/tree/main/skills/hyperframes/references
- video-use SKILL.md, "Music and sound effects": https://github.com/browser-use/video-use/blob/main/SKILL.md
- Anthropic skills repo, explainer-video-maker quickstart: https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/managed-agents-quickstarts/explainer-video-maker.md
- Wideframe blog (practitioner claim of 2–3 frames early, unsourced): https://try-wideframe-6ke.pages.dev/blog/how-to-use-ai-to-match-cuts-to-music-beats

---

## 3. Motion principles

### 3.1 Disney's 12 principles, translated to motion graphics

| Principle | Instruction for Smashcut agents |
|---|---|
| Squash and stretch | Use it only on things with implied material (a button press, a bouncing ball, a character). Keep volume constant: stretch thinner, squash wider. Make rubbery things pronounced and heavy things subtle. Never squash text glyphs or UI chrome. [IxDF] |
| Anticipation | Before a big move, add a small counter-move (3–10% of the travel, a few frames) or a visible cause (a cursor moving to a button, a click squash). It tells the viewer where to look. Skip it on small UI moves. [IxDF; practice] |
| Staging | Build each frame around the one thing the viewer should notice first. Don't animate several elements at once, because they compete. Keep secondary motion minimal. [IxDF; Remotion video-layout] |
| Straight-ahead vs. pose-to-pose | Use pose-to-pose (keyframed start, middle, end states on a timeline) for almost everything, because it is seekable and deterministic. Use straight-ahead or simulation only for effects such as particles and physics, and bake those. [IxDF] |
| Follow-through and overlapping action | Let related parts move at different rates: the lead element first, then the title, then the description. Start the next element when the previous one is 30–50% done. Fully sequential motion looks robotic; all at once looks cheap. [IxDF; HyperFrames measured] |
| Slow in and slow out (easing) | Never use linear motion for position or scale, because it looks robotic. See §4. [NN/g, Carbon, Fluent, all agree] |
| Arcs | Move characters, cursors and objects on curved paths, because physical things move in arcs. Keep UI panels and text on straight axes, because arcs on UI read as a wobble. [IxDF; practice] |
| Secondary action | Add one supporting motion that reinforces the main action (confetti on completion, a shadow tightening on a landing). Never more than one, and never one that competes. [IxDF] |
| Timing | Tie duration to meaning and mass: big or heavy elements move and rebound slower, small ones snap. Make duration scale with distance. [IxDF; Carbon; HyperFrames causal motion] |
| Exaggeration | Exaggerate the one key moment (the payoff, the hero number), not every moment. If an effect becomes noticeable on repeat, make it subtler. [IxDF; NN/g] |
| Solid drawing | Keep perspective, shadows and light consistent: one light direction per world and shadows that match it. Wrong shadows make the whole piece look faulty. [IxDF] |
| Appeal | Give the film a personality through consistent choices (one motion language, one palette, one type system), not decoration. [IxDF; brand motion systems] |

### 3.2 Willenskomer's "UX in Motion" vocabulary (useful for UI-in-video)

Issara Willenskomer argues UI motion is governed by its own 12 principles, not Disney's:

- easing;
- offset and delay;
- parenting;
- transformation;
- value change;
- masking;
- overlay;
- cloning;
- obscuration;
- parallax;
- dimensionality;
- dolly and zoom.

This list is from his "UX in Motion Manifesto". The page was not fetchable (HTTP 403), so it was checked against memory and secondary mentions only [uncertain on exact wording]. How to use it:

- **Parenting:** link child motion to a parent (a card's contents move with the card) so groups read as one object.
- **Transformation:** morph one element into the next (a button widens into a dialog) instead of cutting, so the viewer keeps the thread.
- **Value change:** animate numbers counting up so data feels live. Use tabular figures so the count doesn't jitter.
- **Masking and obscuration:** reveal with clip-path or masks instead of fades, and blur the background to push focus forward.
- **Dolly and zoom:** move the "camera" (a wrapper's scale and translate) through a world instead of swapping slides.

### 3.3 Performance: the scene must keep performing

- **Ban idle wobble.** Breathing, floating, pulsing and slow-drift loops standing in for motion read as "the video is waiting". If a scene finishes entering with seconds left, that is a planning bug: add story, not wobble. [measured, HyperFrames motion-doctrine]
- **Give every phase between entry and exit a purpose.** Pick one per phase:
  - staged reveals paid off on narration beats;
  - a camera move with intent (establish wide, travel, arrive on the subject);
  - the UI actually working (progress advances, counts tick);
  - an animated sequence (a card files into a stack);
  - a cursor-led action whose click ignites the next beat.

  Test: pause at any second and something meaningful should be mid-flight. [measured, HyperFrames]
- **Land titles, then hold them dead still.** Move the motion to the next element, the camera or the background. A title that keeps sliding or creeping after it lands is a tell. [measured, HyperFrames]
- **Chain motion causally.** For example: click → squash → release → flight → impact → recoil → reveal. Start effects on the causing frame, never "shortly after". Scale reactions to implied mass. [measured, HyperFrames]
- **Reveal elements when they are named, across the back half of a scene.** Everything appearing in the first quarter and then freezing reads as a slideshow. [measured, HyperFrames film.md]
- **Decide whether to animate at all.** Animate sequences, transformations, assembly and before/after comparisons. Show a single labelled diagram static. Rule of thumb: if you would explain it with "first X, then Y", animate it; if you would point at parts of one picture, keep it static. [manim-video design thinking]

### 3.4 Transitions as storytelling

- **Make transitions caused by on-screen objects.** For example, the clicked button becomes the next scene, or a card grows past the frame and becomes the world. A crossfade has no carrier and should be the exception. [measured, HyperFrames]
- **Use 2–3 inter-scene transition types per film and repeat them**, plus hand-made match cuts and morphs, because a consistent vocabulary reads as designed and variety reads as a template. [measured, HyperFrames motion-doctrine] (HyperFrames motion.md allows 3–5; use 2–3 as the default and 5 as the ceiling.)
- **Cut the curve.** Exit with an accelerating ease (`power4.in`) and enter with the mirrored decelerating ease (`power4.out`), same distance and duration, cut mid-motion on both sides. Velocity then matches at the cut. Travel only about 12% of the frame (about 230 px at 1920), never a full off-screen push. Total about 0.6 s; exit 0.2–0.4 s; entry at least as long as the exit. [measured, HyperFrames cut-the-curve]
- **Never start an entry from rest right after a cut, and never let an exit settle before it.** Both create a dead beat. The incoming side should pick up at least 50% of the way through its notional path. [measured]
- **Paint an opaque stage background** (`#root { background: var(--canvas) }`). Overlapping transition windows can sum below opacity 1 and flash the browser's default white on dark films. [measured, HyperFrames seam-craft]

Measured transition recipes (HyperFrames):

| Transition | Recipe |
|---|---|
| Zoom through a button | Camera tracks to the button with blur (0.6 s), then the button scales from ~8% to ~250% of the frame in 0.35 s, strong ease-in; its fill becomes the next frame |
| Object becomes the world | A card grows past the frame in 0.65 s, ease-in-out, radius shrinking; surroundings blur ~15 px and fade in 0.3 s |
| Morph | A container widens (~110 → ~880 px in 0.2 s, `power3.out`) with horizontal blur 12 → 0 |
| Colour flood | The hero stays while the ground changes colour in ~0.4 s, `power2.inOut` |
| Whip | A smear of 0.13–0.3 s; the arriving element lands blurred and sharpens in ~0.13 s |
| Iris from click | `clip-path: circle()` opens from the click point in 0.15 s |
| Zoom-through (forward) | Exit scale 1 → 1.2, blur 0 → 10 px, 0.2 s `power3.in`; entry 0.75 → 1, 0.5 s `expo.out` |
| Inverse zoom (arrival) | Exit 1 → 0.8; entry 1.25 → 1; spend it on payoff beats only |
| Rack-focus blur cut | Peak blur 8–12 px, swap at peak, at most once per ~8 s |

**Sources: Motion principles**
- IxDF, "UI Animation: How to Apply Disney's 12 Principles": https://ixdf.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design
- UX Mag on Willenskomer's "UX in Motion" principles: https://uxmag.com/?p=16439
- HyperFrames motion-doctrine, cut-the-curve, seam-craft: https://github.com/heygen-com/hyperframes/tree/main/.claude/skills
- video-use, manim-video "animation-design-thinking.md": https://github.com/browser-use/video-use/tree/main/skills/manim-video/references
- Fluent 2 motion (hierarchy, staggering): https://fluent2.microsoft.design/motion

---

## 4. Easing and timing (concrete numbers)

### 4.1 Ease by role

- **Use ease-out for entrances**, so the element arrives fast and settles where the eye can follow it. **Use ease-in for exits**, so it accelerates away. **Use ease-in-out for moves within the frame**, such as camera moves, repositioning and colour floods. Never ease-in an entrance, because a slow start feels unresponsive. [NN/g std; Carbon; Fluent; HyperFrames]
- **Use linear only for rotation, progress bars, constant-speed scrolls, and opacity paired with a separate eased transform.** [Fluent; HyperFrames]
- **Give arrivals a long-tailed ease-out** (`expo.out`, `power4.out`, cubic-bezier(0.16, 1, 0.3, 1)), because landings should take longer than departures. Make exits clean, one smooth motion, never "slide, stop, leave". [measured, HyperFrames; Remotion timing.md uses bezier(0.16, 1, 0.3, 1)]
- **Don't use the same ease and duration on everything.** One `power2.out` at 0.5 s for every element is the signature of generated motion. Similar elements share one ease and duration; different roles get different curves. [measured, HyperFrames]
- **Ban `bounce.out` and strong `elastic` on UI and text.** Mild overshoot is fine: `back.out(1.4–1.7)`. [measured, HyperFrames motion-doctrine]
- **Spring damping ratios** [measured, HyperFrames]:
  - 1.0: no bounce;
  - 0.7–0.85: premium;
  - 0.4–0.6: playful;
  - under 0.3: cartoon.

  Position and scale may bounce; opacity and colour never bounce.
- **Use perceptual scale for scale tweens.** Linear interpolation of scale looks like it slows down as the object gets bigger. Interpolate in log space, or use an ease that compensates. [Remotion timing.md, `output: 'perceptual-scale'`]
- **Fade opacity faster than position.** On an exit, opacity should complete at about 25–30% of the travel. With `power3.in`, opacity stays near 1 too long, so put opacity on its own linear or faster tween. [measured, HyperFrames cut-the-curve]

### 4.2 Duration reference tables

UI-scale motion (NN/g, [std]):

| Motion | Duration |
|---|---|
| Simple feedback (toggle, checkbox) | ~100 ms |
| Modal or medium change | 200–300 ms |
| Large or full-screen movement | ≤ ~400 ms; ~500 ms starts to feel sluggish |
| Entrance vs. exit | Entrance may be longer, e.g. 300 ms in, 200–250 ms out |
| Overall range | 100–500 ms; the more often it is seen, the shorter it should be |

Design-system tokens (verified from source files):

| System | Tokens |
|---|---|
| Material 3 durations | short1–4 = 50/100/150/200 ms; medium1–4 = 250/300/350/400; long1–4 = 450/500/550/600; extra-long1–4 = 700/800/900/1000 |
| Material 3 easing | emphasized (0.2, 0, 0, 1); emphasized-decelerate (0.05, 0.7, 0.1, 1) for entrances; emphasized-accelerate (0.3, 0, 0.8, 0.15) for exits; standard (0.2, 0, 0, 1); standard-decelerate (0, 0, 0, 1); standard-accelerate (0.3, 0, 1, 1) |
| IBM Carbon durations | fast-01 70 ms (buttons), fast-02 110 ms (fades), moderate-01 150 ms (small moves), moderate-02 240 ms (expansions, toasts), slow-01 400 ms (large expansions), slow-02 700 ms (background dimming) |
| Carbon easing, productive | standard (0.2, 0, 0.38, 0.9); entrance (0, 0, 0.38, 0.9); exit (0.2, 0, 1, 0.9) |
| Carbon easing, expressive | standard (0.4, 0.14, 0.3, 1); entrance (0, 0, 0.3, 1); exit (0.4, 0.14, 1, 1) |
| Fluent 2 durations | ultraFast 50, faster 100, fast 150, normal 200, gentle 250, slow 300, slower 400, ultraSlow 500 ms |
| Fluent 2 curves | decelerateMax (0.1, 0.9, 0.2, 1), decelerateMid (0, 0, 0, 1), decelerateMin (0.33, 0, 0.1, 1), accelerateMax (0.9, 0.1, 1, 0.2), accelerateMid (1, 0, 1, 1), accelerateMin (0.8, 0, 0.78, 1), easyEase (0.33, 0, 0.67, 1), easyEaseMax (0.8, 0, 0.2, 1) |

Carbon splits motion into two modes: **productive** (subtle, fast, for task UI) and **expressive** (vibrant, for significant moments). Use expressive motion occasionally, never everywhere. Video motion graphics sit mostly in the expressive range. [std]

Motion-graphics scale (video, not UI). Video beats run longer than UI because the viewer is watching, not operating:

| Element | Number | Source |
|---|---|---|
| Fast move | 0.3–0.6 s, motion blur peaking at the fastest frame: 6–12 px on text-sized elements, 15–20 px full-frame | HyperFrames [measured] |
| Single element entry | ≤ ~800 ms; a longer build is a multi-element stagger, not one slow element | HyperFrames [measured] |
| Exit vs. entry | Exits 40–50% shorter (motion.md) or ~75% of entry (motion-doctrine); pick one and apply it consistently | HyperFrames [measured] |
| Stagger: letters | ~1 frame apart (~33 ms at 30 fps); names 0.1 s apart | HyperFrames [measured] |
| Stagger: words | 60–120 ms (blur-in words: 67 ms) | HyperFrames [measured] |
| Stagger: list items | 40–80 ms | HyperFrames [measured] |
| Total stagger for a group | ≤ 500 ms; with 8+ items tighten per-item delay or stagger only the first few | HyperFrames [measured] |
| Word blur-in title | `blur(6px)` → 0 and opacity 0 → 1 in 0.13 s, 0.067 s apart, no translate | HyperFrames [measured] |
| Whole-line blur-in | 8 px → 0 in 0.13–0.2 s | HyperFrames [measured] |
| Waterfall entry (title cascade) | Heavy words 60–80 px travel over 0.16–0.20 s; normal 40–50 px over 0.13–0.16 s; light 30–48 px over 0.10–0.13 s; `power4.out`; next item starts within ±2 frames of the previous one settling | HyperFrames cut-the-curve [measured] |
| Text exit | Blur-out plus fade, 0.13–0.25 s | HyperFrames [measured] |
| Count-up number | 1.2–1.6 s, then hold; land it on a downbeat | HyperFrames [measured] |
| Stillness before payoff | 0.3–0.75 s | HyperFrames [measured] |
| Background stage orbit | 3–5° per second | HyperFrames [measured] |
| Slow push on footage | Scale 1.0 → 1.08 over the shot | HyperFrames [measured] |
| "Too fast" feedback | Slow every zoom and pan to 0.7× of its speed, nothing else | HyperFrames [measured] |
| Snappy entrances | If entrances read as glitches, slowing the whole video by about 1 s often fixes it | HyperFrames [measured] |

- **Make duration scale with distance and size**, non-linearly. Larger elements get more time, but the time grows slower than the distance. [Carbon; Fluent; NN/g]
- **Stagger with shrinking gaps.** Start with larger offsets and shorten them through the group (e.g. ×0.84 decay per item), so a cascade accelerates and resolves. [Fluent; HyperFrames waterfall]
- **Respect reduced-motion in any interactive preview.** It doesn't apply to the rendered MP4, but it does apply to anything shown live in the editor UI. [GSAP skills; NN/g]

**Sources: Easing and timing**
- NN/g, "Executing UX Animations: Duration and Motion Characteristics": https://www.nngroup.com/articles/animation-duration/
- Material Web token source (`_md-sys-motion.scss`): https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-sys-motion.scss
- Material 3, "Easing and duration": https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- IBM Carbon, Motion overview: https://carbondesignsystem.com/elements/motion/overview/
- Fluent UI tokens (durations.ts, curves.ts): https://github.com/microsoft/fluentui/tree/master/packages/tokens/src/global
- Fluent 2, Motion: https://fluent2.microsoft.design/motion
- Apple HIG, Motion (page not machine-readable; general principles of purposeful, brief, physically plausible motion and honouring Reduce Motion are well known): https://developer.apple.com/design/human-interface-guidelines/motion
- GSAP official skills (gsap-core: eases, stagger, matchMedia reduced motion): https://github.com/greensock/gsap-skills
- Remotion skills, timing.md: https://github.com/remotion-dev/skills

---

## 5. Typography in motion (with numbers)

### 5.1 Read time: how long text must stay on screen

- **Hold a line for 0.5 s + 0.3 s per word.** Hold the film's last line at least 2 s. A 1–2 word chapter line may hold 0.4 s. [measured, HyperFrames]
  - Cross-check: the BBC asks for at least about 0.3 s per word for subtitles (1.2 s for 4 words), from a 160–180 wpm reading rate (0.33–0.375 s per word). [std]
- **Caption reading speed:**
  - Netflix English: at most 20 characters per second for adult content, 17 cps for children's. [std]
  - Netflix: at least 5/6 s per event (20 frames at 24 fps) and at most 7 s. [std]
  - Treat a caption cue under 0.35 s as a flash. Grow the chunk to 3 words rather than flash it. [video-use]
- **Treat text overlays and burned captions differently.** TikTok's ad guidance says overlay text can display at 5–10 words per second [std, TikTok ads]. That is the pace of fast-cut social captions that follow speech, not of standalone titles. Standalone titles use the 0.5 s + 0.3 s/word rule.
- **Give extra time** for unfamiliar words, numbers and long figures, text competing with complex visuals, and placed or moving text. [std, BBC 4.3]
- **Read every line aloud at a moderate pace and keep it on screen at least that long.** For key lines, aim for "can be read twice". [practice, uncertain origin]
- **Use less motion the more words are on screen.** Per-word animation suits short phrases. Long sentences animated word by word are tiring and slow comprehension. [practice]

### 5.2 Words per line and lines per screen

| Context | Limit | Source |
|---|---|---|
| Titles in motion films | ≤ 6 words per line, one line on screen at a time, no trailing periods; explainer lines up to ~10 words | HyperFrames story.md [measured] |
| Kinetic-type scene | 3–7 English words (4–12 CJK characters) per scene | HyperFrames film.md [measured] |
| Vertical claim line | ~5 English words (~8 Chinese characters) per line; cut words, never shrink type | HyperFrames vertical.md [measured] |
| Subtitles, Netflix | 42 characters per line, max 2 lines, keep to 1 line unless over 42 | Netflix [std] |
| Subtitles, BBC broadcast | 37 characters (Teletext) | BBC [std] |
| Subtitles, BBC online | Line ≤ 68% of frame width for 16:9; ≤ 90% for 4:3, 1:1 and 9:16; 37 characters at 75% width in 16:9 ≈ 25 characters at 90% width in 9:16 | BBC [std] |
| Caption chunks, high energy | 2–3 words | HyperFrames captions [measured] |
| Caption chunks, conversational | 3–5 words | HyperFrames [measured] |
| Caption chunks, calm or documentary | 4–6 words (natural-sentence style 4–7) | HyperFrames; video-use |
| Body copy (any) | < 80 characters per line | Anthropic frontend-design |

- **Break lines and caption chunks at natural points:** after punctuation, before conjunctions and prepositions, or at a pause of 150 ms or more. Never split an article from its noun, a first name from a last name, a pronoun from its verb, or a verb from its auxiliary or negation. Prefer a bottom-heavy pyramid shape for two lines. [std, Netflix; HyperFrames]
- **Show one caption group at a time.** Start a caption 0.1–0.3 s into a film, not at frame 0, because at 0 s it looks pre-existing. Hard-kill each group after its exit (opacity 0 plus `visibility: hidden`), because stale groups linger. [measured, HyperFrames]
- **Don't let captions straddle a shot change.** End them at the cut, or start them on it, because viewers re-read a caption that crosses a cut. Leave gaps between captions of either 0 or at least 1 s (preferably 1.5 s), because short gaps flicker. [std, BBC 4.5, 6.3]
- **Make caption appearance coincide with speech onset**, and remove it roughly when the speech ends. [std, BBC 5.1]

### 5.3 Type size relative to the frame

| Use | Size | Source |
|---|---|---|
| Title | 4–9% of frame height, 1–2 lines (43–97 px at 1080p) | HyperFrames [measured] |
| Quiet or secondary line | 2.5–4% of frame height | HyperFrames [measured] |
| Hero word | May fill 60–90% of frame width | HyperFrames [measured] |
| Absolute floor for any readable text | ≥ 2.6% of the frame's short side (~28 px at 1080) | HyperFrames `text_below_floor` check [measured] |
| Vertical (9:16) | Nothing meant to be read under 28 px; titles ~1.35× their landscape size | HyperFrames vertical.md [measured] |
| Remotion rough minimums at 1080 px width | Headline 84 px, supporting text 44 px; scale with width | Remotion video-layout.md |
| Subtitle line height (BBC authoring) | 7–8% of video height for 16:9, 4:3, 1:1; 3.9–4.5% for 9:16 | BBC [std] |
| Caption fit (HyperFrames default) | Base 78 px, min 42 px, max width 1600 px landscape / 900 px portrait | HyperFrames [measured] |
| Caption style by tone | Hype 72–96 px, 800–900 weight; corporate 56–72 px, 600–700; tutorial 48–64 px; storytelling 44–56 px | HyperFrames captions authoring [measured] |
| Caption on 1080p (generic) | 36–48 px | blog [practice, uncertain; smaller than the others; prefer BBC/HyperFrames numbers] |

- **Check readability at phone width (360 px wide).** Most viewers watch on phones, and a line that reads fine at 1920 can be unreadable there. [measured, HyperFrames review]

### 5.4 Contrast, weight and treatment

- **Use high contrast: white text on black or a dark scrim is the subtitle baseline.** BBC uses white on black. Speaker colours in priority order: white #FFFFFF, yellow #FFFF00, cyan #00FFFF, green #00FF00. [std, BBC 8]
- **Aim for at least 4.5:1 contrast** (WCAG AA for normal text) for any text meant to be read, and at least 3:1 for large display type. [std, WCAG 2.x, from general knowledge]
- **Over footage, choose the treatment by the brightness behind the text** (0–255) [measured, HyperFrames]:
  - under 60: `screen` blend;
  - 60–180: `overlay`;
  - over 180: `normal` with opaque colour.

  Plain subtitles over a background brighter than 60 get a scrim sized to the text (30–40% opacity), never a full-width bar.
- **Highlight one word per line at most, in the accent colour, and only when it carries meaning.** In captions, brand names, numbers and CTAs get the emphasis. [measured, HyperFrames] (Anthropic's frontend-design warns that one accented word in every web headline is a tell. In video it is acceptable when rationed.)
- **Use tabular numerals** (`font-variant-numeric: tabular-nums`) for any changing number, so count-ups don't jitter. [measured, HyperFrames data.md]
- **Verify that fonts loaded.** A web font that fails silently ships in a fallback face. Await `document.fonts.ready` and assert `document.fonts.check('700 76px "Family"')` before rendering. Use only the weights a font ships, or 600/700 render as fake bold. [video-use; HyperFrames film.md]
- **When a typed line grows, centre it on the full string's width**, not the partial string, or the text slides during the reveal. [video-use]
- **Use `overflow: visible` on caption containers**, so scaled emphasis words and glows aren't clipped. Use a full-width centred container, not `left: 50%; translateX(-50%)`, which clips at the edges. [measured, HyperFrames]

**Sources: Typography in motion**
- Netflix, English (USA) Timed Text Style Guide: https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide
- Netflix, Timed Text Style Guide: General Requirements: https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements
- BBC Subtitle Guidelines (fetched via curl; sections 3.1, 4, 4.5, 5.1, 6.3, 8.1, 9.2.1, 10.1): https://www.bbc.co.uk/accessibility/forproducts/guides/subtitles/
- TikTok Ads, Creative best practices for performance ads: https://ads.tiktok.com/help/article/creative-best-practices
- HyperFrames captions.md, media-use captions authoring.md and motion.md: https://github.com/heygen-com/hyperframes/tree/main/skills
- Remotion skills, video-layout.md: https://github.com/remotion-dev/skills/blob/main/skills/remotion-best-practices/remotion-create/video-layout.md
- SSW rule, "Do you give enough time to read texts in your videos?": https://www.ssw.com.au/rules/post-production-do-you-give-enough-time-to-read-texts-in-your-videos

---

## 6. Composition and colour

### 6.1 Safe areas

**Broadcast and landscape (SMPTE ST 2046-1)** [std]
- Action safe = 93% of width and height, centred.
- Title safe = 90% of width and height, centred.
- Legacy SD values were 90% action and 80% title, and still appear in older tools.

At 1920x1080 [computed]:

| Area | Width × height | Inset per edge |
|---|---|---|
| Action safe | 1786 × 1004 | ~67 × 38 px |
| Title safe | 1728 × 972 | 96 × 54 px |

- **Keep all text inside title-safe**, because it guarantees the text survives overscan, crops and player chrome. HyperFrames uses an 80% box for captions. Remotion suggests at least 80 px from the sides and 100 px from top and bottom at 1080 px width. [std; measured]

**Vertical 9:16 (1080x1920).** These are mostly ad-guidance figures; organic layouts vary and the platforms change them. Verify with a test upload. [uncertain]

| Platform | Keep clear: top | Bottom | Left | Right | Notes |
|---|---|---|---|---|---|
| TikTok | 240 px (12.5%) | 660 px (34%) | 120 px (11%) | 120 px | Action rail ~300 px wide from y ≈ 840 px down on the right |
| Instagram Reels (Meta) | 269 px (14%) | 672 px (35%) | 65 px (6%) | 65 px (6%) | Meta ad diagram: 14% / 35% / 6%; Reels ads with a disclaimer keep the bottom 768 px (40%) clear |
| YouTube Shorts | 288 px (15%) | 672 px (35%) | 48 px | 192 px | Subscribe and channel info bottom-left, actions right |
| All three combined | 288 px | 672 px | 120 px | 192 px | Usable box ~768 × 960 px, centred slightly left |

HyperFrames' simpler rule [measured]:
- nothing in the top 168 px;
- every word and the product inside y = 168–1330 px;
- only texture below 1330 px;
- no text under the right-hand action rail.

Reap's conservative working margins: top ~15%, sides 10–15%, bottom 25–35%.

- **Place vertical captions in the lower-middle**, about 600–700 px from the bottom on 1080x1920 (HyperFrames), which is above the platform UI and below faces. BBC: "a little higher up, though still generally in the lower third". [measured; std]
- **Place landscape captions 80–120 px from the bottom, centred.** Never cover the speaker's mouth or face, or on-screen text. Move captions to the top when the bottom carries important action. [measured; std, BBC 10.1; Netflix]

### 6.2 Layout and focus

- **Build each frame around one focal point.** Decide what the viewer sees first. Two focal points in one frame, or a subject that is too close in value to the ground, give the eye nowhere to go. [Remotion video-layout; HyperFrames review]
- **Use the rule of thirds for subjects and faces**: eyes on the upper third line, and lead room in the direction of gaze or motion. Centre the subject in vertical video, because the platform UI eats the edges. [practice; HyperFrames vertical]
- **Design for video, not a web page.** Don't add redundant elements, cards for the sake of cards, legends, or bullet slides. Labels sit on the part they name, with a leader line if needed, and appear with it. [Remotion; HyperFrames explainer]
- **Keep grids symmetrical: equal card sizes, equal gaps**, because lopsided layouts read as mistakes. Make logos fill their card. [charlie947 vox-explainer]
- **Recompose for each aspect ratio, never squeeze.** A landscape layout (side-by-side panels, wide charts) becomes a vertical sequence in 9:16. [measured, HyperFrames vertical]
- **Leave space empty.** About 40% empty space and at most 2 accent colours is one proven minimal look. [video-use example; one style, not a mandate]
- **Give each "world" its own ground, light and scale**, and enter each world through an object already on screen. Keep one home stage, one carrier and a constant palette and type across worlds. Avoid one dark canvas with small UI floating in it. [measured, HyperFrames story]

### 6.3 Colour

- **Take the palette from the brand, a reference, or the subject's world, in that order.** Write it down as numbers (hex values, fonts, weights) before the first scene. Without outside input the same brief produces the same look every run. [measured, HyperFrames look.md; Anthropic frontend-design]
- **Use 4–6 named colours: ground, ink, one accent, plus support.** Ration the accent to one highlighted word, the payoff and the end card. [Anthropic frontend-design; HyperFrames story §7]
- **Avoid the generated-design clusters** unless the brief asks for them [Anthropic frontend-design, explicit list]:
  - cream #F4F1EA with a serif and a terracotta accent;
  - near-black with an acid-green or vermilion accent;
  - hairline broadsheet layouts;
  - identical rounded SaaS cards with rgba(0,0,0,.1) shadows;
  - all-caps eyebrow labels and mono data labels.

  HyperFrames adds: dark void with glow and particles, and defaulting to Inter, Space Grotesk, Instrument Serif, Geist or JetBrains Mono.
- **Avoid full-screen linear gradients on dark grounds**, because they band under H.264. Use a radial gradient, a solid fill, or a solid plus a local glow. [measured, HyperFrames look.md]
- **Keep atmospheric elements at 15–25% opacity, not 5%**, because 5% vanishes in compression. Give the focal element full saturation. [measured, HyperFrames]
- **Scale up thin web details.** A 1px border or a 6% shadow from a website disappears on video; scale borders, spacing and shadows for the screen. [measured, HyperFrames look.md]
- **Avoid flashing and hard high-contrast strobing**, because of seizure risk. As a general limit, use no more than 3 flashes per second (WCAG 2.3.1, from general knowledge). [std; NN/g]
- **Grade footage by reasoning about the image, one adjustment at a time.** Mental model: ASC CDL, `out = (in × slope + offset) ^ power`. Slope moves highlights, offset moves shadows, power moves midtones. Never go aggressive without checking skin tones. [video-use]

**Sources: Composition and colour**
- SMPTE ST 2046-1:2009 (Safe Action and Safe Title Areas): https://pub.smpte.org/doc/st2046-1/
- Upload-Post Safe Zone Checker (TikTok, Reels, Shorts pixel figures): https://www.upload-post.com/tools/safe-zone-checker/
- Reap, "YouTube Shorts, Reels and TikTok Safe Zones": https://reap.video/blog/short-form-video-safe-zones
- AdManage, Instagram Reels safe zone (Meta 14/35/6%): https://admanage.ai/instagram-reels-safe-zone
- HyperFrames look.md, types/vertical.md, story.md: https://github.com/heygen-com/hyperframes/tree/main/skills/hyperframes/references
- Anthropic skills, frontend-design SKILL.md: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- Remotion video-layout.md (as above)

---

## 7. Storytelling structures (with timings)

### 7.1 Universal spine

- **Write down "the one thing" first.** It is one line ("You can now…" for a launch, the one idea for an explainer) and one takeaway in the viewer's words. Pick one viewer doing one real task, with one real piece of data travelling from the hook to the payoff. [measured, HyperFrames story]
- **Take every claim from the source.** Never derive claims the source didn't make ("40 min → 2 min" is not "20× faster"), and mark illustrative numbers as illustrative. [HyperFrames; Anthropic quickstart; charlie947]
- **Pitch three different storylines (different world, device and form), then build one.** Recommend one and save all three, because the first idea is the default idea. [measured, HyperFrames story §2]
- **Make the words and the pictures each tell the story on their own.** Read the lines alone: a stranger should get the pitch. Watch the pictures alone: they should tell the same story. With voice-over, never repeat the spoken sentence verbatim on screen. [measured, HyperFrames]
- Structural archetypes [video-use]:
  - Launch: HOOK → PROBLEM → SOLUTION → BENEFIT → EXAMPLE → CTA
  - Tutorial: INTRO → SETUP → STEPS → GOTCHAS → RECAP
  - Documentary: THESIS → EVIDENCE → COUNTERPOINT → CONCLUSION
  - Explainer: ask the question in scene 1, answer it in the last scene [Anthropic]
  - Promo: show the problem in scene 1, end on one CTA [Anthropic]
  - TikTok ads: hook → unique selling points → clear CTA [std]

### 7.2 Beat shares for a launch or promo (HyperFrames, measured on ~35 s films)

| Beat | Share | Job |
|---|---|---|
| Hook | ~8% | The world and the need, or the feature already working |
| Tension | ~12% | The old way failing on screen |
| Reveal | ~8% | Product or idea named, ~20–30% in |
| Proof | ~40% | The real task as 3–6 verbs (paste, pick, watch it build, ship), one per beat |
| Payoff | ~20% | Biggest visual moment, once, 60–80% in, at normal speed |
| Claim | ~8% | The one thing, in one line |
| End card | ~8% | Mark carried in; name and CTA land and hold 2–3 s |

### 7.3 Timing templates (derived from the shares above plus platform guidance; adjust to the story)

Voice-over budget: ~150 wpm (2.5 words/s) for human VO [practice; 140–150 words for 60 s explainers per Bread & Beyond]. TTS reads ~2.2 words/s (132 wpm) [measured, HyperFrames]. Script 10–15% under the ceiling to leave room for pauses and music. [practice]

| Length | Structure (seconds) | Max VO words | Scenes |
|---|---|---|---|
| **6 s** (bumper) | One idea: hook/product 0–4, brand + CTA 4–6 | ~12–15 | 1–2 |
| **15 s** | Hook 0–2 · problem/tension 2–4 · reveal 4–6 · proof 6–11 · claim + CTA/end card 11–15 | ~30–35 (TTS) / 35–38 (human) | 3–5; new beat every 2–4 s |
| **30 s** | Hook 0–3 · tension 3–6 · reveal 6–9 · proof 9–21 · payoff 21–25 · claim 25–27 · end card 27–30 | ~65–70 | 5–8 |
| **60 s** | Hook 0–3 · problem 3–10 · reveal/solution 10–16 · proof/how it works 16–40 · payoff 40–50 · claim 50–54 · CTA/end card 54–60 | ~130–150 | 6–10 (≈19 words per scene) |
| **120 s** | Hook 0–5 · problem + stakes 5–20 · solution named 20–30 · how it works, 3 steps × ~15 s, 30–75 · proof/example/social proof 75–95 · payoff 95–105 · recap claim 105–112 · CTA/end card 112–120 | ~260–300 | 10–16; change visual treatment at least every ~6 s |

Notes:
- **Keep a 30–90 s narrated film to about 155 words or fewer**, and a whole film to about 400 words at most. [measured, HyperFrames, TTS-based; tighter than the 150 wpm human figure, so use it for TTS VO]
- **Under 1 minute is the highest-engagement band.** Wistia (13M+ videos) reports videos under 1 minute averaging 52% engagement, dropping ~11% past that. Prefer the shortest version that tells the story, but a longer film earns more total watch time. Never pad to fill a requested length; treat requested lengths as ranges. [std-ish, Wistia data; HyperFrames]
- **Explainers run 30–90 s.** Ground the explainer in a person or situation the viewer knows. Introduce the abstract device inside that situation, and return to the person with the answer. Build one diagram that grows one part per beat, and never drop a finished diagram on screen at once. [measured, HyperFrames explainer]
- **Size changelog or PR videos by diff size.** ≲50 lines: 20–40 s; 50–200: 40–70 s; 200–600: 70–110 s; larger: 110–180 s. [measured, HyperFrames film.md]

### 7.4 Hooks

- **Make frame 0 a thumbnail: never black, never a logo alone.** Open on one of:
  - the feature working on something recognisable;
  - a real moment that creates the need;
  - a question containing the input ("What if you could make a video from your ⟨website⟩?");
  - the result first, then pull back;
  - the bug itself. [measured, HyperFrames]
- **Deliver the proposition in the first 3 seconds.** TikTok's ad guidance says to introduce the content proposition in the first 3 s and prioritise the hook in the first 6 s. Google ABCD says to "jump in": get to the heart of the story fast with tight framing, and introduce the brand early. [std]
- **Never open with "Introducing", "Meet…" or a logo.** "Introducing X" is fine after the pain. Typing into a prompt box with nothing else on screen is a generated-film tell when used as an opener. [measured, HyperFrames]
- **Show the old way failing before the relief arrives.** The proof is often the same shot improved in front of the viewer. [measured, HyperFrames]
- **Make the opening line promise what is coming.** State the question big and show the first surprise within 5 s. If the first 3 s would not stop your own thumb, rebuild them. [charlie947 vox-explainer]

### 7.5 B-roll and cutaways

- **Cut B-roll on the sentence, not mid-phrase.** Use it to show what the speaker names, cover jump cuts and add proof. Never put a card over the speaker's face. [measured, HyperFrames vertical; practice]
- **Show what the line means, not the line itself.** For lyrics and narration, pick a picture that embodies the line rather than one that illustrates its words literally. [measured, HyperFrames music]
- **Use real material for real things:** screenshots of the actual site, real map imagery, real UI. Don't redraw a UI from scratch, because guessed spacing reads as fake. Rebuild only the part that moves. [HyperFrames film.md; charlie947 polish]
- **End on the one idea in one line.** Explainers need no brand end card unless asked. For promos, build the end card (the mark carried in, typed or wiped in), not a still, and hold it 2–3 s. [measured, HyperFrames]

**Sources: Storytelling structures**
- HyperFrames story.md, types/explainer.md, types/launch.md, film.md: https://github.com/heygen-com/hyperframes/tree/main/skills/hyperframes/references
- video-use, editor sub-agent brief (archetypes): https://github.com/browser-use/video-use/blob/main/SKILL.md
- Anthropic explainer-video-maker quickstart: https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/managed-agents-quickstarts/explainer-video-maker.md
- TikTok Ads, Creative best practices: https://ads.tiktok.com/help/article/creative-best-practices
- Google, ABCDs of effective video ads: https://business.google.com/us/resources/articles/abcds-of-effective-video-ads/
- Wistia, Optimal video length: https://wistia.com/blog/optimal-video-length
- Bread & Beyond, words for a 60 s explainer: https://breadnbeyond.com/how-many-words-does-a-60-seconds-explainer-video-needs/
- charlie947 motion-graphics-skills, vox-explainer: https://github.com/charlie947/motion-graphics-skills

---

## 8. Social-video specifics

- **Deliver vertical at 1080x1920, 30 fps, at least 720p.** TikTok's minimum is 720p. Common targets [video-use]:

  | Use | Format |
  |---|---|
  | Cinematic | 1920x1080 @ 24 |
  | Screen content | 1920x1080 @ 30 |
  | Vertical | 1080x1920 @ 30 |
  | Square | 1080x1080 @ 30 |
  | LinkedIn feed | 1080x1350 (4:5) |

- **Design for sound-off and sound-on at once.** Caption all speech, and make the picture carry the hook without sound. Also design the audio for sound-on, because TikTok and YouTube are mostly watched with sound, and Google says to pair audio and visuals. [std, TikTok, Google ABCD; HyperFrames] (The often-quoted "85% watch muted" is a 2016 Facebook-era figure. Treat it as outdated and [uncertain].)
- **"See and say" the brand and the CTA:** show it on screen and say it in the voice-over at the same time, because the pair is more memorable. [std, Google ABCD]
- **Put people on screen early.** TikTok recommends featuring creators, employees or customers. Google ABCD recommends humanising the story, with a face in the first 5 s in its case studies. [std]
- **Keep shots to 1–2 s and change beats every 2–4 s, with the payoff before the swipe.** [measured, HyperFrames vertical]
- **Track "viewed vs. swiped away" on Shorts as the hook metric.** Creator blogs call over 70% viewed strong. There is no official threshold. [uncertain]
- **Make a loop only on purpose.** A last frame that cuts back to the first is a choice, not a default. [measured, HyperFrames]
- **Use talking-head grammar:** punch-ins on emphasis words, B-roll cut on the sentence, captions in the lower-middle band, and the face never under a card. [measured, HyperFrames]
- **Mix to about −14 LUFS.** Social platforms publish no official loudness spec and use adaptive loudness; −14 LUFS integrated with true peak ≤ −1 dBTP is the common safe target (§9). [uncertain]
- **Make several hook variants of the same video**, 3–5 versions of the first 3 s, because platforms reward testing, and an agent can produce variants cheaply. [std, TikTok ads; practice]

**Sources: Social-video specifics**
- TikTok Ads, Creative best practices: https://ads.tiktok.com/help/article/creative-best-practices
- Google, ABCDs: https://business.google.com/us/resources/articles/abcds-of-effective-video-ads/
- HyperFrames types/vertical.md: https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes/references/types/vertical.md
- Bytecap, YouTube Shorts retention benchmarks (no official threshold): https://www.bytecap.io/research/youtube-shorts-retention-benchmarks
- Safe-zone sources as in §6.

---

## 9. Audio levels (numbers)

### 9.1 Delivery loudness targets

| Destination | Integrated loudness | True-peak ceiling | Status |
|---|---|---|---|
| YouTube | −14 LUFS (turns down only) | −1 dBTP | Observed; YouTube publishes no number [uncertain] |
| TikTok, Instagram Reels, Facebook, X | No published target; ~−14 LUFS is the safe choice | −1 dBTP | [uncertain] |
| Spotify | −14 LUFS | −1 dBTP (−2 if master is louder than −14) | First-party |
| Apple Music | −16 LUFS | −1 dBTP | Reported |
| Apple Podcasts, general podcasts | −16 LUFS (±1) stereo; ~−19 mono | −1 dBTP | First-party (Apple) |
| AES TD1008 (streaming) | Speech −18, music −16, mixed −17 LUFS | −1 dBTP | Standard [secondary source] |
| EBU R128 broadcast (EU) | −23 LUFS (±0.5 LU; some cite ±1) | −1 dBTP | Standard |
| ATSC A/85 broadcast (US) | −24 LKFS (±2) | −2 dBTP | Standard (CALM Act for ads) |
| Netflix | −27 LKFS dialogue-gated (±2) | −2 dBTP | First-party |

- **Default Smashcut export:** mix to PCM, then two-pass loudness-normalise the final mix to −14 LUFS integrated with true peak ≤ −1 dBTP (ffmpeg `loudnorm`, two pass). Offer a −23 LUFS broadcast preset. [video-use; HyperFrames sound.md says −16 to −14 for social]
- **Measure; don't assume.** Run `ffmpeg -i out.mp4 -af ebur128=peak=true -f null -` for integrated loudness and true peak, plus RMS per section (dialogue, music-only, end card). An end card 15 dB below the dialogue, or effects louder than speech, is a bug. Report the numbers and say the mix was measured, not heard. [video-use; HyperFrames]
- **Keep each source file's true peak at −1 dBTP or lower before mixing.** AI-generated audio often clips. [measured, HyperFrames]

### 9.2 Relative levels inside the mix

- **Duck the music bed under speech by about 12–18 dB from its music-only level.** video-use uses −12 to −15 dB. As gain, that is about 0.3–0.4 during speech with HyperFrames-style ducking, or ~0.14 static volume for music under a voice (≈ −17 dB). A −18 dB duck is a common starting point. Ramp the bed back up after speech, with a 0.3–0.5 s release [practice]. [measured; practice; uncertain on exact numbers, so tune by measuring dialogue intelligibility]
- **Rough level guide:** dialogue peaks around −12 to −6 dBFS, music bed around −25 to −18 dBFS under dialogue. [practice, Adorama]
- **Speech sounds 2–3 LU louder than music at the same meter reading** (AES TD1008). That is why speech-only targets sit 2 LU lower; don't push the VO "to match" the music meter. [std, secondary]
- **Put each sound effect 3–6 dB above the bed.** Use few effects, and give every effect a visible cause. About 8 effects in 18 s reads as designed; about 20 reads as generic. Rotate 2–3 takes of a repeated sound, because the same whoosh on every cut is the most common audio tell. [measured, HyperFrames; video-use]
- **Map SFX to causes** [measured, HyperFrames]:

  | Sound | Use only on |
  |---|---|
  | Click | A real on-screen click |
  | Whoosh | A cut or a fast large move |
  | Soft key tick | Text arriving letter by letter |
  | Pop | A badge, chip or number landing |
  | Riser into impact | The payoff or the mark, once per film |

  No synthesised chimes or dings.
- **Ramp the music out before a stinger or end card**, instead of letting its tail decay under the CTA. [video-use]
- **Check how the bed plays on phone speakers.** A bed with most of its energy under 150 Hz plays as nothing on a phone. [measured, HyperFrames]
- **Clean up the voice track with EQ** [HyperFrames mixing.md]:
  - high-pass at 80 Hz (removes rumble);
  - boomy: −4 dB at 200 Hz;
  - muffled: −3 dB at 250 Hz;
  - intelligibility: +2.5 dB at 3 kHz, or duck the music;
  - harsh: −3 dB at 3.2 kHz;
  - limiter last in the chain.
- **Put 30 ms fades on every audio cut.** [video-use]
- **Whisper transcribes silence as hallucinated text** (e.g. "Thank you."). Drop words that start inside a trailing silence (`silencedetect=noise=-35dB:d=0.6`). Real speech sits around −16 to −26 dB. [measured, HyperFrames]

**Sources: Audio levels**
- Fora Soft, "LUFS targets per platform 2026" (aggregated table, with confirmed vs. estimated flags): https://www.forasoft.com/learn/audio-for-video/articles-audio/lufs-targets-per-platform-2026
- Netflix, Loudness and True Peaks: https://backlothelp.netflix.com/hc/en-us/articles/360050414014-Loudness-and-True-Peaks-How-to-Measure-and-When-to-Flag
- EBU R128 s4 supplement: https://tech.ebu.ch/docs/r/r128s4.pdf
- NUGEN, Broadcast Loudness Made Simple: https://nugenaudio.com/broadcast-loudness-made-simple/
- iZotope, Mastering for streaming platforms: https://www.izotope.com/en/learn/mastering-for-streaming-platforms.html
- Storyblocks, How to balance audio (music −18 to −22 dB under dialogue): https://www.storyblocks.com/resources/tutorials/how-to-balance-audio-premiere-pro
- Adorama, Mastering audio levels: https://www.adorama.com/alc/mastering-audio-levels/
- HyperFrames sound.md, media-use mixing.md: https://github.com/heygen-com/hyperframes
- video-use SKILL.md: https://github.com/browser-use/video-use

---

## 10. Common amateur mistakes and their fixes

| Mistake | Why it looks amateur | Fix |
|---|---|---|
| Linear easing on moves | Robotic, mechanical | Ease-out for entrances, ease-in for exits, ease-in-out for in-frame moves (§4) |
| Same ease and duration on everything (`power2.out 0.5s`) | Flat, "generated" | Assign eases by role; vary duration with distance and mass |
| Everything fades and slides up | The most common generated tell | Vary entrances: blur-in per word, grey-to-ink, waterfall, a mask reveal, entering through an on-screen object |
| Everything animates at once | No focus; the eye can't track it | One thing at a time; stagger 40–120 ms; total ≤ 500 ms; overlap 30–50% |
| Idle breathing, floating or pulsing loops | "The video is waiting" | Staged reveals, a camera with intent, the UI acting, or cut sooner |
| Titles keep drifting or scaling after they land | Nervous, unfinished | Land them, then hold dead still |
| Text too short on screen | Unreadable, frustrating | 0.5 s + 0.3 s/word; last line ≥ 2 s; captions ≤ 20 cps |
| Text too small, or in the platform UI zones | Unreadable on phones, covered by buttons | ≥ 2.6% of the short side (≥ 28 px in 9:16); titles 4–9% of height; obey safe zones (§6.1) |
| Crossfades between every scene | Slideshow feel, no carrier | Cut-the-curve in the film's direction, match cuts, object-becomes-world |
| Ping-pong directions across cuts | Reads as an error | One dominant direction; reserve others for meaning |
| Entering from rest after a cut, or an exit that settles first | Dead beat at every seam | Cut mid-motion on both sides with mirrored eases |
| Grow-from-small entrance after a receding exit | Mirrored Z vector, jarring | Match the scale-sign (§1.3) |
| Black or logo-only first frame | Bad thumbnail; swipe-away | Frame 0 shows the hook: a face, the result, or a bold line |
| Opening with "Introducing…" or a logo | No reason to keep watching | Open on the need or the result; name the product ~20–30% in |
| Feature list, three cards in a row, bullet slides | No story | One viewer, one task, one data object travelling through |
| Voice-over repeated verbatim on screen | Redundant, splits attention | Screen shows key words, numbers or the picture; VO says the sentence |
| VO longer than visuals, padded with drift | Sluggish | Trim the script (≈19 words per scene); never stretch motion |
| Music too loud under VO, or no ducking | Unintelligible speech | Duck 12–18 dB under speech; check that the VO sits on top |
| Same whoosh on every cut; too many SFX | Template sound | Few effects, each with a cause; rotate 2–3 takes; 3–6 dB over bed |
| Silent film over 15 s | Feels unfinished | Music bed plus caused SFX, unless it is deliberately made for muted autoplay |
| Unnormalised or clipping export | Too quiet or distorted on platform | Two-pass loudnorm to −14 LUFS, ≤ −1 dBTP; measure |
| Clicks or pops at audio cuts | Sloppy | 30 ms fades at every boundary; cut at word boundaries, padded 30–200 ms |
| Captions straddling cuts or flickering with tiny gaps | Re-reading, jitter | End or start captions at cuts; gaps of 0 or at least 1 s |
| Fallback font rendered | "Almost Arial" | Await font load and assert it before render |
| Full-screen dark linear gradient | Banding in H.264 | Radial gradient, or solid plus local glow |
| 5%-opacity atmosphere, 1 px borders | Vanish in compression | 15–25% opacity; scale borders and shadows for video |
| Hand-drawn fake UI | Reads as a mockup | Use real screenshots or captures; rebuild only what moves |
| Bounce or elastic on UI and text | Cartoonish | At most `back.out(1.4–1.7)`; springs at damping ratio 0.7–0.85 for premium |
| Accent colour everywhere | No hierarchy | Accent only on one word, the payoff and the end card |
| White flash at transitions on dark films | Render artifact | Opaque stage background |
| Reaction a few frames after its cause | Feels disconnected | Same-frame ignition; SFX peak one frame after the picture |
| Unlabelled invented numbers | Untrustworthy | Every number from the source, consistently rounded, with a small source line |

**Sources: Common mistakes**
- Synthesised from §1–§9. Primary tells come from HyperFrames ("Defaults that look generated", story.md §8, spec BANNED list), Anthropic frontend-design (generated-design clusters), video-use (audio and caption hard rules), NN/g and Carbon (easing).

---

## 11. Review checklist (run before every render or reply)

**Story**
- [ ] Can you state the one thing in one line? Does every scene serve it?
- [ ] Hook: frame 0 is meaningful (not black, not a logo); the proposition lands in ≤ 3 s.
- [ ] Do beats cause each other in order? Reveal at ~20–30%, payoff at ~60–80%, end card holds 2–3 s.
- [ ] Lines alone tell the pitch; pictures alone tell the story; VO not duplicated verbatim on screen.
- [ ] Every claim and number traces to the source; illustrative numbers are marked.

**Edit and rhythm**
- [ ] No cut inside a word; edges padded 30–200 ms; 30 ms audio fades at every cut.
- [ ] Beats land on VO anchor words or music downbeats; the beat grid is computed per index, not accumulated.
- [ ] No dead stretch over 3 s (unless deliberate); no single treatment over ~6 s.
- [ ] 0.3–0.75 s stillness before the payoff; the payoff plays at normal speed.
- [ ] Every transition has a cause; 2–3 transition types, repeated; no ping-pong directions; Z scale-sign matched.
- [ ] Cuts happen mid-motion with mirrored eases; no entries from rest; no white flash at seams.

**Motion**
- [ ] Pause test: at any second, something meaningful is mid-flight; no idle wobble.
- [ ] One focal motion at a time; stagger 40–120 ms, total ≤ 500 ms.
- [ ] Eases match roles (out = arrive, in = leave, in-out = in-frame); no linear on position or scale; no bounce or elastic on UI.
- [ ] Single entries ≤ 800 ms; exits shorter than entries; landed titles hold still.

**Type and layout**
- [ ] Every line holds ≥ 0.5 s + 0.3 s/word; last line ≥ 2 s; captions ≤ 20 cps, ≥ 5/6 s, ≤ 7 s.
- [ ] Titles ≤ 6 words per line (vertical ~5); captions 2–6 words per group, one group at a time.
- [ ] Sizes: titles 4–9% of height; nothing under 2.6% of the short side (28 px in 9:16).
- [ ] Inside title-safe (90%) in landscape; inside the platform safe zone in vertical (top ~15%, bottom ~35%, right rail clear).
- [ ] Contrast ≥ 4.5:1 for read text; a scrim behind captions over bright footage.
- [ ] Fonts verified as loaded; tabular numerals on changing numbers.
- [ ] Phone-width (360 px) contact sheet checked; nothing clipped or overlapping; one focal point per frame.

**Look**
- [ ] Palette and type come from the brand, reference or subject (numbers written down); the accent is rationed.
- [ ] None of the BANNED defaults (dark void and particles, cream/serif/terracotta, three cards in a row, fade-slide-up everything, docked logo).
- [ ] No full-screen dark linear gradients; atmosphere at ≥ 15% opacity; borders and shadows scaled for video.

**Audio**
- [ ] Music bed present for films over 15 s (unless designed for muted autoplay); ducked 12–18 dB under VO.
- [ ] SFX few, caused, 3–6 dB over the bed, peak one frame after the picture; repeated sounds rotated.
- [ ] Final mix measured: −14 LUFS integrated (social) or −23 (broadcast); true peak ≤ −1 dBTP; per-section RMS sane (end card not 15 dB down).
- [ ] The delivery note says the audio was measured, not heard.

**Delivery**
- [ ] Duration matches the plan (ffprobe); resolution and fps match the target platform.
- [ ] A notes file (REVIEW.md or project memory) records creative calls, rejected options, the weakest shot, and warnings kept on purpose.
- [ ] Optional: a fresh-eyes critic sub-agent given only the storyboard plus frame sheets, asked for P0/P1 lines in the format `t=4.2s · where · problem → exact change`.

**Sources: Review checklist**
- HyperFrames review.md: https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes/references/review.md
- video-use self-eval steps: https://github.com/browser-use/video-use/blob/main/SKILL.md
- Plus all standards cited above.

---

## 12. Agent-skill references (existing skills and guides, and what to borrow)

### 12.1 HeyGen HyperFrames: the closest analogue to Smashcut

**Repo:** https://github.com/heygen-com/hyperframes. Install with `npx skills add heygen-com/hyperframes`. Open source, launched April 2026. HTML/CSS/JS + GSAP compositions rendered deterministically to MP4 via Chrome and FFmpeg.

**What's in it:**
- `skills/hyperframes/` (SKILL.md plus references):
  - story.md: the one thing, three storylines, device × form tables, hook rules, beat shares, copy rules, generated-film tells;
  - motion.md: measured durations, eases by role, springs, stagger, beat grid, transitions with causes, feedback-to-change table;
  - look.md: brand-first palette, video facts on banding and opacity;
  - captions.md, sound.md, review.md;
  - film.md: script pacing and words per scene, music timing, PR and website films;
  - format.md;
  - `types/`: explainer, launch, vertical, music, data, 3D, character;
  - 13 frame presets with FRAME.md specs.
- `.claude/skills/` (internal):
  - motion-doctrine: vector law, the current, carriers, causal motion, ban on idle wobble, Seam Gate verifier;
  - cut-the-curve: exact parameters for 7 seam and in-scene techniques;
  - seam-craft: white-flash guard and overlap mechanics;
  - captions-overlay, changelog-video, oversized-cursor.
- `skills/media-use/`: TTS, transcription, BGM, SFX, mixing (fx-chain and automation, EQ cheat-sheet, ducking and carving), grading, LUTs.
- `skills/remotion-to-hyperframes/`, the registry of blocks and components, and a CLI with `check`, `snapshot --review`, `keyframes --shot`, `audio --json`, `beats`.

**Borrow:**
1. The measured numeric defaults (§4 tables).
2. The story-first workflow (SPEC.md, STORYLINES.md, then build).
3. The BANNED-defaults list.
4. The vector ledger (`ledger.json` per seam) plus an automated verifier. Smashcut's timeline JSON could carry exit and entry vectors per cut and lint them.
5. Automated craft warnings: `line_unread`, `dead_stretch`, `text_below_floor`, `first_frame_empty`, `film_silent`. These are cheap to implement in our renderer.
6. A review pass that produces three contact sheets (scene start and middle, strips across every cut at ±0.2 s, phone width) and P0/P1/P2 notes.
7. Motion assertions per composition (`appearsBy`, `before`, `staysInFrame`, `keepsMoving`).
8. Root CSS variables for palette and fonts so a film can be rebranded.

**Caveat:** some internal rules conflict with each other (exit = 75% of entry vs. 40–50% shorter; 2–3 vs. 3–5 transition types). Pick one value and document it.

### 12.2 Remotion official agent skills

**Repo:** https://github.com/remotion-dev/skills (`remotion-best-practices` router, v4.0.541). Install with `npx skills add remotion-dev/skills` or `npx remotion skills add`.

**What's in it:**
- A router SKILL.md that loads sub-references on demand: create, markup (timing, transitions, audio, voiceover, sfx, captions, text-highlights, motion-blur, light-leaks, lottie, 3D, fonts, measuring text), maps (Mapbox, MapLibre, Cesium), multimedia, interactivity and timeline structure.
- "Preserve user changes": if the user edited code since your last edit, assume it was intentional.
- "Open the preview before building": keep Studio open so the user can watch and steer, and don't render unless asked.
- Video-layout rules: one focal point, safe margins of 80 px at the sides and 100 px top and bottom, headline ≥ 84 px and supporting text ≥ 44 px at 1080 width.
- Timing: `interpolate` with clamping, bezier (0.16, 1, 0.3, 1), spring with damping 200 (no bounce), perceptual-scale for scale.
- Editable timeline structure: each independently editable clip is its own node; synchronised layers share one timing boundary; Track vs. TransitionSeries semantics.

**Borrow:**
- The router-plus-lazy-references architecture for our skills.
- The "preserve user edits" rule, which matters because Smashcut users edit the timeline JSON by hand.
- The "preview first" rule.
- Perceptual scale interpolation.
- Clip grouping so captions and overlays move with their shot.

It is light on craft and taste; mostly API correctness.

### 12.3 GreenSock official GSAP skills

**Repo:** https://github.com/greensock/gsap-skills. Skills: gsap-core, gsap-timeline, gsap-performance, gsap-plugins, gsap-scrolltrigger, gsap-react, gsap-frameworks, gsap-utils.

**What's in it:** correct API usage, including:
- eases (power1–4, back, elastic, CustomEase);
- stagger objects (`{each, from: "center"|"edges"|"random"}`);
- `immediateRender` pitfalls with stacked `from()` tweens;
- `autoAlpha`;
- `gsap.defaults`;
- `matchMedia` with reduced motion;
- timeline position parameters;
- performance: transforms and opacity only, avoid layout thrash.

**Borrow:** use it as the technical layer under our motion skill. Pair it with HyperFrames' rule that timelines must be seek-safe and deterministic: no `requestAnimationFrame`, no wall-clock time, no layout measured in `onUpdate`.

### 12.4 browser-use video-use: editing real footage by conversation

**Repo:** https://github.com/browser-use/video-use (also vendors `skills/manim-video/`).

**What's in it:**
- 12 hard production-correctness rules: subtitles last, per-segment extract then lossless concat, 30 ms fades, PTS-shifted overlays, output-timeline SRT offsets, never cut inside a word, pad 30–200 ms, word-level ASR only, cache transcripts, parallel sub-agents per animation, confirm strategy before cutting.
- Cut craft (silences ≥ 400 ms, handoff air 400–600 ms).
- A packed phrase-level transcript as the LLM's reading view.
- An editor sub-agent brief with structural archetypes.
- An EDL JSON format.
- Self-eval at every cut (±1.5 s filmstrip and waveform), capped at 3 passes, plus a "roast" critic sub-agent.
- Audio mastering (two-pass loudnorm −14 LUFS / −1 dBTP, per-section RMS).
- Animation duration rules (cards 5–7 s, never parallel-reveal).
- A sub-agent animation brief template (10 items, ending with "Do not ask questions").
- Session memory in project.md.

**Borrow:**
- The hard-rules vs. artistic-freedom split, which is a good skill design pattern.
- The packed transcript format for VO and footage editing.
- The EDL fields `beat`, `quote`, `reason` per range, which make an edit reviewable.
- The self-eval-at-every-cut loop.
- The critic sub-agent.
- The per-animation sub-agent brief template.
- The persistent project.md memory.

### 12.5 Anthropic public skills repo

**Repo:** https://github.com/anthropics/skills.

| Skill | What it teaches | What to borrow |
|---|---|---|
| `frontend-design` | Ground design in the subject; plan tokens (4–6 hex colours, type roles, layout) and review the plan against the brief before building; an explicit list of the generated-design clusters to avoid; "spend your boldness in one place"; motion: one orchestrated moment beats scattered fade-and-slide-ups | The anti-default list, the plan-review-build-critique loop and "remove one accessory"; apply them to every visual brief |
| `canvas-design`, `algorithmic-art`, `theme-factory` | Design philosophy first, then execution; 10 ready themes (palette plus font pairs) | Theme-as-data pattern for rebrandable films |
| `slack-gif-creator` | Frame-based animation with easing helpers (ease_out for landings, ease_in for falls, bounce_out for landing); FPS and size budgets | Little craft value; skip |
| `claude-api` explainer-video-maker quickstart | An agent workflow: read the sources, storyboard 4–8 scenes of 7–10 s each, shared style sheet and drawing library, one agent per scene plus a music agent, an independent reviewer who saw no code and flags at most one scene, then a fixer; explainer = question → answer; promo = problem → one CTA; music spec (70–90 BPM, 4-chord loop, fades, peaks at ¼ scale) | The shared-style-library rule (so multi-agent scenes look like one piece) and the blind-reviewer pattern |

### 12.6 Community skill packs (lower authority, useful patterns)

- **charlie947/motion-graphics-skills** (https://github.com/charlie947/motion-graphics-skills). 15 skills: launch-video, apple-launch-film, vox-explainer, animated-chart, milestone-reveal, loop-cover, reel-export, brand-intake, motion-brief-writer, reference-to-motion, title-sequence-3d, plus prompts.
  - Borrow: "Fix one thing at a time; keep everything else exactly as it is."
  - Borrow: use real components or screenshots, never drawn UI.
  - Borrow: vox-explainer's review rules (sound is not optional; the opening line must promise; every fact sourced; symmetrical grids; animating "on twos" as a deliberate style).
  - Borrow: brand intake (hex values plus font plus logo) before building.
- **manim-video** (inside video-use). `animation-design-thinking.md`: when to animate vs. show static; narration first; mark visual beats per sentence; minimum on-screen times (new equation 2 s animation + 2 s pause; concept label 1 + 1 s; key insight 2.5 + 3 s; annotation 0.8 + 0.5 s); tempo variation.
  - Borrow: the beat-marking method and pause minimums for explainers.
- **dylantarre/animation-principles** (https://github.com/dylantarre/animation-principles). The 12 principles indexed by domain (video and motion graphics, data viz, brand, presentations), by thinking style (timing mastery, rhythm and pacing, attention direction) and by persona. Only the video doc was skimmed [uncertain depth].
  - Possible use: a principle lookup table for reviews.
- **Vincentwei1021/video-shotcraft** (https://github.com/Vincentwei1021/video-shotcraft). A Remotion-based cinematic product-video skill with a large gallery of named shot recipes (crash-zoom-punch, circle-match-iris, card-flip-reveal, beat-cut-moves, …). Only the file list was inspected [uncertain quality].
  - Possible use: the "named shot recipe" catalogue pattern for our clip library.
- **Other listings found but not inspected:** Miftahul-Islam-Efaz/Motion-graphics-skill ("motion-video-director"), gabrielgreco1/skills (motion-designer), emilkowalski/skills `apple-design` (Apple motion rules audit, recommended by charlie947). Use them only as inspiration.

### 12.7 What Smashcut's core skills should take, in order of value

1. **A story-first planning step** (one thing → three storylines → spec with LOOK and BANNED lines → storyboard tied to VO or music timestamps). From HyperFrames and the Anthropic quickstart.
2. **A numeric motion-defaults table** (§4) plus role-based easing. From HyperFrames, NN/g, Carbon, Material and Fluent.
3. **Seam rules for the timeline** (direction current, mirrored eases, scale-sign, carriers), ideally linted from the timeline JSON. From HyperFrames motion-doctrine and the Seam Gate.
4. **Typography and caption rules with read-time math** (§5). From BBC, Netflix and HyperFrames.
5. **Audio rules** (ducking, few caused SFX, −14 LUFS / −1 dBTP, measure don't assume). From video-use and HyperFrames.
6. **Automated craft checks plus a review loop** (contact sheets, P0/P1/P2, blind critic sub-agent, at most 3 passes). From HyperFrames review and video-use.
7. **Process hygiene:** preserve user edits, preview first, fix one thing at a time, keep project memory. From Remotion, charlie947 and video-use.

---

*Uncertain items, collected:*
- Vertical safe-zone pixel values (ad guidance, platform-dependent).
- Social LUFS targets (no published specs).
- AES TD1008 numbers (secondary source).
- Exact ducking dB.
- Cutting 1–2 frames before the beat.
- "85% watch muted" (outdated).
- Shorts "viewed > 70%" benchmark.
- Willenskomer's list (page unreadable).
- Average-shot-length "now" values (2.5–4 s, depending on sample).
- HyperFrames' internally inconsistent exit-ratio and transition-count rules.
