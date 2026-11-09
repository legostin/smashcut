---
name: studio-craft
description: The craft rules every video must follow — story first, audio as the clock, one focal motion at a time, easing by role with concrete durations, read time and type sizes, safe areas, seams between scenes, editing hygiene, sound levels, the banned "generated" defaults, and the review loop. Read it before planning or building any video, and check against it before you say "done". Full digest with sources: REFERENCE.md in this folder.
---

# Craft — how professional video is made (numbers, not vibes)

Weak generated videos are "good motion around no story" and the same defaults everywhere. These rules exist to prevent exactly that. Numbers come from measured references (HyperFrames films, BBC/Netflix subtitle specs, Material/Carbon/Fluent motion tokens, NN/g) — see REFERENCE.md.

## 0. Meta-rules
1. **Story before frames.** Write in one line the ONE thing the viewer must remember. One viewer, one real task, one object/number travelling through the video. Build only what serves it. No feature lists, no "three cards in a row".
2. **Audio is the clock.** With voice-over, time every beat to the word timestamps (`get_timing` words). With music only, to bars and downbeats. Trim the script; never stretch motion to fill audio.
3. **One focal motion at a time.** Reveal one thing, let it land, then the next. The eye can't track two new things.
4. **Fight the defaults** (§9). Choose from the subject, the brand and the references (`list_references`).
5. **Measure, then look, then fix the worst first** (§10). Never score yourself out of 10 — find the P0s.

## 1. Story and structure
- **Hook ≤ 3 s; frame 0 is the thumbnail.** Never open on black, a logo or "Introducing…". Open on the result, the pain, a bold number, or a question.
- Spine: hook → tension/problem → turn (product/idea named at ~20–30%) → proof → payoff at ~60–80% → end card held 2–3 s.
- Durations: 15 s = hook 3 · body 9 · CTA 3. 30 s = hook 3 · problem 5 · solution 12 · proof 6 · CTA 4. 60 s = hook 5 · problem 10 · solution 25 · proof 12 · CTA 8. 2 min explainer: 5–8 scenes of 12–20 s.
- **Voice-over length:** ~150 words/min human, ~2.2 words/s for TTS → ~19 spoken words per 8–9 s scene. Don't repeat the voice-over verbatim on screen: the screen shows the key word, number or picture.
- Every number on screen comes from the brief/source, consistently rounded; illustrative numbers are marked as such.

## 2. Easing by role (GSAP)
| Role | Ease | Notes |
|---|---|---|
| Arrive / enter | `expo.out` or `power4.out` (≈ cubic-bezier(0.16,1,0.3,1)) | long tail: fast start, gentle landing |
| Leave / exit | `power3.in` (or `power2.in`) | exits ≈ 60% of the entrance duration; opacity done by ~30% of the travel |
| Move inside the frame, camera | `power2.inOut` / `sine.inOut` | |
| Constant: rotation, progress, scroll | `none` (linear) | the ONLY place for linear |
| Overshoot (rare, playful) | `back.out(1.4–1.7)` max | never `bounce`/strong `elastic` on text or UI |
- Similar elements share one ease+duration; different roles get different curves. One `power2.out 0.5s` on everything = the generated look.
- Scale tweens: interpolate perceptually (e.g. `scale` via a log-feel ease such as `expo.out`, or tween in log space) — linear scale looks like it slows down.

## 3. Durations for VIDEO (not UI)
| Element | Number |
|---|---|
| Single element entry | 0.4–0.8 s (≤ 0.8 s; longer builds are staggers) |
| Fast move / whip | 0.3–0.6 s, motion blur 6–12 px on text, 15–20 px full-frame |
| Stagger letters / words / list items | ~1 frame (33 ms) / 60–120 ms / 40–80 ms |
| Whole group stagger | ≤ 0.5 s total; next element starts when the previous is 30–50% done |
| Word blur-in title | blur 6px→0 + opacity in 0.13 s, 67 ms apart, no translate |
| Count-up number | 1.2–1.6 s, land on a downbeat, then hold |
| Stillness before the payoff | 0.3–0.75 s |
| Slow push on footage | scale 1.00 → 1.08 over the shot |
| Background orbit | 3–5° per second |
| Text exit | blur-out + fade 0.13–0.25 s |
- Duration grows with distance/size, but slower than linearly. Staggers shrink through the group (×0.84 per item) so the cascade resolves.
- **No idle wobble:** no breathing/floating/pulsing loops. Landed titles hold DEAD still. Between entry and exit something meaningful happens (staged reveal on a VO word, a camera move with intent, the UI working) — or cut sooner. No stretch longer than 3 s without change, no single treatment longer than ~6 s.

## 4. Text you can read
- **On-screen time ≥ 0.5 s + 0.3 s per word**; the final line ≥ 2 s.
- Captions: ≤ 20 characters/s, each group on screen 0.83–7 s, 2–6 words per group, one group at a time, break at punctuation/pauses, never across a shot change; gaps between captions 0 or ≥ 1 s.
- Titles: 4–9% of frame height, ≤ 6 words per line (vertical ≈ 5), ≤ 3 lines. Nothing readable under 2.6% of the short side (28 px at 1080×1920, 28 px at 1920×1080 height).
- Contrast ≥ 4.5:1 for anything meant to be read; over bright footage add a scrim sized to the text. Tabular numerals (`font-variant-numeric: tabular-nums`) on changing numbers. Make sure the real font loaded (no fallback "almost Arial").

## 5. Composition, safe areas, colour
- **16:9:** keep text inside title-safe (90%: 1728×972 at 1080p); action-safe 93%.
- **9:16 (TikTok/Reels/Shorts):** keep the top ~15%, the bottom ~35% and the right ~15% (button rail) free of text; captions ~600–700 px above the bottom; key content in the middle. Check every frame at phone width.
- One focal point per frame; rule of thirds for heroes; generous negative space; align to a grid.
- Colour: 1 accent, used only on the key word, the payoff and the end card. Palette and type come from the design system/references — write them down as numbers. No full-screen dark LINEAR gradients (banding in H.264 — use radial or solid + local glow). Atmosphere ≥ 15–25% opacity (5% vanishes in compression); 1-px lines/borders scaled up for video.

## 6. Seams between scenes (transitions)
- Every transition has a cause. Pick ONE dominant direction for the film and keep ordinary changes in it; reserve other directions for meaning (back in time, contrast).
- Use 2–3 transition types for the whole film, repeated — not a new effect per cut, and avoid crossfades as the default (slideshow feel).
- **Cut mid-motion** on both sides with mirrored eases (outgoing `power4.in`, incoming `power4.out`, ~12% of the frame each) — no entries from rest, no exit that settles before the cut.
- Hand a concrete object across the cut (match cut / the object becomes the next world). Match the scale direction on zooms (don't recede then grow from small).
- No white flash at seams on dark films (opaque stage background).

## 7. Editing and rhythm
- Never cut inside a word; pad cuts 30–200 ms; prefer silences ≥ 400 ms as cut points; 30 ms audio fades at every cut.
- J/L cuts: let voice-over and music bridge picture cuts.
- Cut on beats/downbeats when the music drives (`studio.beats`, `get_timing`); land payoffs on downbeats. Compute beat times per index, don't accumulate drift.
- Shot length by format: social/trailer 0.8–1.5 s, promo 1.5–2.5 s, explainer 2.5–5 s, cinematic/interview 5 s+. To match a reference edit, measure it: `run_media_tool detect_shots` → rhythm.
- Preserve the user's own edits; change one thing at a time.

## 8. Sound
- Music bed for anything over 15 s (unless designed for muted autoplay); duck it 12–18 dB under speech (`duck` op or volume automation).
- SFX: few, each with a visible cause, 3–6 dB over the bed, landing one frame after the picture; rotate 2–3 takes of repeated sounds.
- Final mix: −14 LUFS integrated, true peak ≤ −1 dBTP for social (−23 LUFS broadcast) — use the `normalize` op and SAY it was measured, not heard.

## 9. BANNED defaults (the "generated" look)
- Everything fades and slides up · everything animates at once · idle breathing/floating loops · titles drifting after landing.
- Dark void with floating cards and particles · three cards in a row · bullet-slide feature lists · "Introducing…" openers · logo-only first frame · docked logo in a corner for the whole film.
- The same `power2.out 0.5s` on every element · bounce/elastic on text or UI · crossfade between every scene · ping-pong directions across cuts.
- Accent colour everywhere · tiny text in the platform UI zones · voice-over repeated on screen · invented unlabelled numbers · hand-drawn fake UI when a real capture is available (record_web / record_app).

## 10. Review loop (before every reply that delivers work)
1. **Measure:** read times (§4), dead stretches > 3 s, text sizes, safe areas, contrast, loudness (`normalize` report), duration vs plan.
   `taste_audit` (sceneId, start/end or clipId) measures most of this for you — text size/safe areas/read time/fonts/contrast, simultaneous starts, linear entrances, idle wobble, dead stretches, frame 0, flicker, palette — as `P0 t=… · where · problem → fix`; run it before calling a scene done, fix P0s first.
2. **Look:** `render_frame` contact sheets — scene starts, ±2 frames around every cut, the payoff, the end card; for 9:16 imagine the platform UI over it.
3. **Rank** problems P0 (broken/unreadable/off-brief) → P1 (craft) → P2 (polish); fix P0s first; at most 3 passes, then report what's left.
4. For publishable work you may ask a fresh-eyes sub-agent (`delegate_task`) with only the storyboard + frame sheets: "list P0/P1 as `t=4.2s · where · problem → exact change`".
5. In the final message: the one-line story, what you checked (with numbers), the weakest shot and what you'd do next.
