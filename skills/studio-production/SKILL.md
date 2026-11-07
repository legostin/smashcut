---
name: studio-production
description: Production workflow for making a whole video from a brief — write the script (scenes with timing, voiceover, visuals) with set_script, then produce scene by scene, updating scene status live so the user can follow and correct early. Use for any request bigger than a single clip edit.
---

# Production workflow (brief → script → storyboard → production → review → export)

The editor shows `script.json` live in the "Сценарий" panel, and the user watches the preview change as you work.
Work in small visible steps so mistakes are caught early.

## 1. Brief → script
- `get_script` first. If the brief is empty, write the user's request into `brief`.
- Draft scenes with `set_script {stage:'script', scenes:[...]}`. Each scene: `title` (3–6 words), `start`/`duration` (seconds, contiguous, total = target length), `voiceover` (spoken or on-screen copy), `visual` (what we see: layout, motion, style, which template/technique).
- Timing rules: hook in the first 1.5–3 s; one idea per scene; 2–6 s per scene for social, 4–10 s for explainers; land scene boundaries on bars if there is music (`get_timing`).
- Stop after the script if the user asked only for a script; otherwise continue.

## 2. Storyboard
- `set_script {stage:'storyboard'}`. For each scene decide the concrete build: gallery template (`list_templates`) vs. new clip, music bed, captions. Put that into `visual`/`notes`.

## 3. Production — scene by scene
- `set_script {stage:'production'}`.
- For each scene in order: `update_scene {id, patch:{status:'doing'}}` → build/edit the clip(s) → place them (`timeline_add` with the scene's start/duration) → `update_scene {id, patch:{itemIds:[...]}}` → verify with `render_frame` at the scene's middle and boundaries → `update_scene {status:'done'}`.
- Music: create/choose the bed early (it drives timing); keep scenes on its bars.
- Keep the user's preview meaningful at every moment: finish one scene before starting the next.

## 4. Review
- `set_script {stage:'review'}`; render 4–8 frames across the whole video (`render_frame`), fix inconsistencies (type sizes, colours, safe areas, timing gaps), then summarise.
- Export is triggered by the user; you may set `stage:'export'` when everything is done.
