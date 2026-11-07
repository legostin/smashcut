---
name: studio-production
description: Production workflow for making a whole video from a brief — write the script (scenes with timing, voiceover, visuals) with set_script, then produce scene by scene, updating scene status live so the user can follow and correct early. Use for any request bigger than a single clip edit.
---

# Production workflow (brief → script → storyboard → production → review → export)

**Script first.** Every session starts with `get_script`. If there are no scenes, write the script before anything else — even for a small request, capture the video as it is plus the change (it costs one tool call and gives the user a map of the work).

The editor shows `script.json` live in the "Script" panel, and the user watches the preview change as you work.
Work in small visible steps so mistakes are caught early.

## 1. Brief → script
- `get_script` first. If the brief is empty, write the user's request into `brief`.
- **Story first (studio-craft §0–1):** add to the brief the ONE thing the viewer must remember (one line), the viewer and their task, a LOOK line (palette/type/motion as numbers, from references) and a BANNED line (the defaults this video must avoid). `list_references` before deciding the look.
- Draft scenes with `set_script {stage:'script', scenes:[...]}`. Each scene: `title` (3–6 words), `start`/`duration` (seconds, contiguous, total = target length), `voiceover` (spoken or on-screen copy), `visual` (what we see: layout, motion, style, which template/technique).
- Timing rules: hook in the first 1.5–3 s; one idea per scene; 2–6 s per scene for social, 4–10 s for explainers; land scene boundaries on bars if there is music (`get_timing`).
- Stop after the script if the user asked only for a script; otherwise continue.

## 2. Design system
- Before building clips: `get_design`; if empty, `set_design` with 4–7 colours (bg, surface, text, muted, accent, accent-2), 3–4 type roles (display, title, body, caption — bundled fonts only; Cyrillic-capable for Russian), 3–4 motion tokens (enter, exit, emphasis, camera — GSAP eases + durations from studio-craft §2–3; no 'ambient' idle loops), spacing (margin, gap). Derive it from the brief (brand, tone).
- All clips use the tokens (see studio-clip-authoring). The user sees the system on the board.

## Voice-over (ElevenLabs)
- If the user wants narration and an ElevenLabs key is configured (`list_voices` works): write natural spoken text into each scene's `voiceover`, then `generate_voiceover {sceneId}` per scene (in order — neighbouring text is passed for natural intonation).
- Check `overflow`: if the voice runs past the scene, lengthen the scene (and shift later scenes) or tighten the text and regenerate. Pacing: ~2.5 words/s for RU, ~2.8 for EN.
- Word timings from ElevenLabs feed `studio.words` immediately — use a captions template over the VO range.
- Duck music under the voice: music item `volume` 0.25–0.4 while VO plays (split the music item if needed).

## 3. Storyboard
- `set_script {stage:'storyboard'}`. For each scene decide the concrete build: gallery template (`list_templates`) vs. new clip, music bed, captions. Put that into `visual`/`notes`.

## 4. Production — scene by scene
- `set_script {stage:'production'}`.
- For each scene in order: `update_scene {id, patch:{status:'doing'}}` → build/edit the clip(s) → place them (`timeline_add` with the scene's start/duration) → `update_scene {id, patch:{itemIds:[...]}}` → verify with `render_frame` at the scene's middle and boundaries → `update_scene {status:'done'}`.
- Music: create/choose the bed early (it drives timing); keep scenes on its bars.
- Keep the user's preview meaningful at every moment: finish one scene before starting the next.

## 5. Review
- `set_script {stage:'review'}`; run the studio-craft review loop (§10): measure (read times, dead stretches, sizes, safe areas, loudness), look (frames at scene starts, around every cut, the payoff, the end card), rank P0/P1/P2, fix P0s first (≤ 3 passes), then summarise with the numbers you checked.
- Export is triggered by the user; you may set `stage:'export'` when everything is done.
