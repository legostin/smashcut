---
name: studio-taste
description: Taste — how to design frames and motion that look made by a demanding designer, not generated. The process (idea → references → style frames → build → art director), the first read and hierarchy, composition and negative space, type as a system, colour discipline, light, motion feel, finish, the "generated look" to avoid, and how to work with the art director, taste_audit and the user's learned taste. Read it before designing any scene; studio-craft has the hard numbers.
---

# Taste — make the frame a designer would sign

Craft (studio-craft) makes a video correct. Taste makes it *good*: every choice deliberate, nothing default, nothing extra.
Taste is mostly **judgement and removal**: decide what the frame is about, then cut everything that doesn't serve it.

## 1. The process (every scene)
1. **Idea in one line.** What must the viewer feel/remember in this scene? Find a visual idea that comes FROM the content (a metaphor, a transformation, a number becoming an object) — not decoration added to it.
2. **Borrow principles, not looks.** Pick 1–2 references (list_references, search_inspiration) and name the principle you take: "hard cut to scale contrast like X", "type as the image like Y". Never recreate a piece.
3. **Style frame first.** Build the scene's key frame (the payoff moment) before animating anything. Render it, look at it for real. If the still isn't strong, motion won't save it.
4. **Then motion**, then the seams with the neighbours.
5. **Judge like a stranger**, then `art_director {sceneId}` — fix P0/P1, re-review (max 3 rounds). Run `taste_audit` for measured facts while iterating.
6. **Removal pass:** for each frame ask "what can I take away without losing the point?" — and take it away.

## 2. The first read
- Squint (or imagine the frame at thumbnail size): the eye must go to ONE thing first, then a clear second, then a third. Never two equal winners.
- Build hierarchy with **contrast of one property at a time**: size (hero ≥ 3× secondary), weight, value (light/dark), colour, isolation, motion. Stacking all of them on everything = no hierarchy.
- Max 3 levels of importance in a frame. Anything at a 4th level is probably removable.
- In motion: the focal point moves the eye on purpose — the next thing appears where the eye already is, or a move leads it there.

## 3. Composition
- Use a grid: margins ≈ 6–8% of the short side, a column grid (6/12 columns) and a spacing scale (8-px steps at 1080p). Align edges, don't eyeball.
- **Asymmetric balance** beats centring everything. Centre only for a deliberate monumental moment (a single word, the end card).
- **Negative space is a material:** calm frames 40–60% empty; dense frames are a choice for energy, then a release. Empty space at the edges must look intended (big and clean), not leftover.
- Avoid tangents (shapes just touching each other or the frame edge), elements 5–20 px from an edge, accidental alignments that create new lines.
- Scale contrast is the cheapest drama: one huge element + small precise details.
- Vertical 9:16: design for the middle 50% (platform UI eats the top ~15%, bottom ~35%, right ~15%).

## 4. Type as a system
- ≤ 2 families (often one family, 2 weights). Weight/size steps from a scale (e.g. 1.25–1.5 ratio); don't invent sizes per element.
- Display type: tracking −1…−4% (tighter as it grows), leading 0.9–1.05; body/captions leading 1.3–1.45. ALL CAPS gets +4…+10% tracking.
- Short lines (display ≤ 6 words; vertical ≈ 4–5), break lines on meaning, no widows/orphans, no hyphenation in titles.
- Type can BE the image: huge, cropped, masked, kinetic — better than a small title on a busy picture.
- Real fonts only (loaded, not a fallback); tabular numerals for changing numbers; optical alignment (punctuation and round letters slightly outside the edge).

## 5. Colour and light
- 60/30/10: dominant neutral, secondary, accent. The **accent is rationed** to the one thing that matters in a frame (the payoff word, the key number).
- Tint neutrals toward the palette's hue (warm or cool greys); dark backgrounds are near-black with a hue (#0b0b0c–#141418), not #000 with neon.
- Check the frame in greyscale: the value hierarchy must still read.
- Saturated on saturated, rainbow palettes, purple-to-blue gradients by default = the generated look.
- Light (3D, footage composites): one coherent key direction, soft fill, a rim to separate; contact shadows ground objects. Glow is for emissive things only.

## 6. Motion feel
- Contrast of tempo: fast arrivals, still holds, a slow drift underneath — never the same speed everywhere.
- Anticipation → action → follow-through/settle; overlapping action (parts arrive slightly apart); a moment of stillness before the payoff.
- Every movement has a direction that means something; keep a dominant direction across the film.
- Restraint: if two things move, one of them probably shouldn't. Landed things hold still.
- Rhythm: vary shot lengths (long–short–short–long), cut on the beat/word, end on a held frame.

## 7. Finish
- Consistent stroke widths, corner radii from one scale, one shadow style, one icon style.
- A whisper of grain/noise (2–4%) prevents banding and sterility on gradients and flat darks.
- Pixel-check: no clipped glyphs, jaggies on thin lines, soft text from scaling, half-pixel blur, stray elements at cut frames.

## 8. The "generated look" (never by default)
Everything centred · floating cards/devices in a dark void · purple-blue gradients · glow and bloom on everything · particle confetti as filler · gratuitous 3D rotation · three cards in a row · bullet lists on screen · every element fading up the same way · random emoji/stock icons · "Introducing…" / logo-first openers · decoration without meaning · the same ease and duration on everything · busy backgrounds under text.
Use any of these only as a deliberate, named choice that the idea needs.

## 9. Whose taste
- **The user's taste wins:** the system prompt carries their standing instructions (house style) and their *learned taste* (from their choices, approvals, rejections, comments, ratings). Apply it; when it conflicts with a general rule here, follow the user.
- Then the project's design system (get_design) and the references they chose.
- Then this skill. Then your own preference — last.
- When the direction is genuinely open (and autopilot is off), show 2–3 cheap style frames with ask_user instead of guessing: choices teach the studio the user's taste.

## 10. Working with the art director
- `art_director {sceneId, focus?}` → PASS / NOT YET with P0/P1/P2 as `t=… · where · problem → exact change`. You are idle while it reviews.
- It sees: key frames (incl. both seams), motion strips at ~12 fps around the entrance, cuts and exit, the user's references as pictures, the measured audit, the brief, the design system and the user's taste. Unchanged frames return the previous verdict instantly — re-review only after real changes.
- When all scenes are done: `art_director {film:true}` — one pass over the whole video (hook, spine, pacing curve, one design language, transition family, seams).
- Fix the smallest scope that resolves each item; keep what it says works. If you disagree with an item, say why in your final message — don't silently ignore it.
- Scenes need a passing review (or 3 used rounds) before `update_scene status:"done"`; trivial changes may pass `force:true, reason`.
- `taste_audit {sceneId}` gives measured facts (contrast, sizes, safe areas, read time, simultaneous motion, dead stretches, fonts, palette) — fast, use it every iteration.
