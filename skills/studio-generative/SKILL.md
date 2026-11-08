---
name: studio-generative
description: Generating filmed-looking footage and photographic stills with external AI models (generate_image / generate_video / list_generators via run_media_tool; fal.ai, Runway, Replicate, Higgsfield, OpenAI, Google, local ComfyUI) — when to generate vs build in code, prompt craft for video models, continuity, cost discipline and budgets, integrating generated shots into the edit, and the legal limits. Read it before any generation.
---

# Generative footage

Generation is **paid from the user's own accounts** (except ComfyUI) and slow (stills 5–60 s, video 1–10 min). Treat every call like a camera day: plan the shot, then shoot once.

## 1. Generate or build?
| Generate (models are good at) | Build in code (never generate) |
|---|---|
| real-world / photographic shots: places, weather, nature, food, crowds, hands at work | **any text**: titles, captions, numbers, labels, prices, UI copy |
| people, products and objects *in a scene* (lifestyle, b-roll) | logos, brand marks, icons (a model will mangle them) |
| textures, backgrounds, plates to composite over | charts, data, diagrams, maps with labels |
| establishing shots, transitions-as-footage, atmosphere | UI / screens / app flows (record_web, or HTML clips) |
| a key visual the motion graphics then animate around | anything that must match exact brand colours or geometry |

Rule: **never generate a text-heavy frame.** Generate the clean plate, put the text on top as a clip. If a frame needs a product's real logo, use the user's product photo (remove_background) — don't let a model invent it.

## 2. The workflow (stills first, then motion)
1. `run_media_tool {op:'list_generators', params:{kind:'video', configured:true}}` — what is set up, model inputs, prices, today's budget. If nothing is configured, say so and offer to build the shot in code (or ComfyUI if the user runs it).
2. **Key frame as a still** — `generate_image` (2–4 variants with `count`, or 2–3 seeds). Cheap ($0.01–0.15). Read the images, pick one; fix composition in the still, not in video. Use the project's design system in the prompt (palette, mood, lens).
3. **Estimate** — the same call with `dryRun:true` returns `cost.usd` without spending. State it to the user for anything over ~$1.
4. **Image → video from the chosen still** (`generate_video {image:'media/key.png', …}`): the first frame is locked, so look, colour and composition stay consistent. Text → video only for throwaway b-roll.
5. Look at the result (`extract_frames` → Read, or render_frame on the timeline). If it's wrong, change ONE thing (prompt wording, camera, seed) and regenerate — don't re-roll blindly.

**Budget discipline:** at most **2 video generations per scene** (first take + one fix) unless the user asks for more; drafts on cheap models/resolutions (fal `pixverse-v6`, `kling-4-flash`, `wan-3` at 480p, `minimax-h3-max`, Runway `gen4_turbo` — $0.05–0.10/s), the final on a premium model (`kling-4` 1080p, `seedance-2.5`, Veo 3.1) only once the shot is approved. Identical re-runs are free (cached) — a new take needs a new `seed`. After generating, report what you spent (`cost.usd` per call; `list_generators` shows today's total). A run that would exceed the daily budget is refused — tell the user, never work around it.

## 3. Prompt craft for video models
Structure: **subject + action + setting + camera move + lens/framing + lighting + style/grade (+ duration in mind)**.
> "A ceramicist's hands shaping wet clay on a spinning wheel, water glistening; small sunlit studio, dust in the air. Slow dolly-in from a medium close-up. 50 mm, shallow depth of field. Warm late-afternoon window light, soft shadows. Natural film grain, muted earth tones."

- **One action per shot**, one camera move per shot. Several beats = several shots, cut in the edit.
- Describe motion with verbs and speed ("slowly turns her head", "steam rises"), not adjectives ("dynamic").
- Camera vocabulary: static, slow push-in / dolly-in, pull-out, pan left/right, tilt up, orbit, crane up, tracking shot, handheld, top-down, macro. Put it in `camera` — Higgsfield Cinema Studio maps it to native presets (`dolly-in`, `crane-up`, `drone-orbit`, `whip-pan`…); other models get it in the prompt.
- Lens & light words carry the look: "35 mm documentary", "85 mm portrait", "anamorphic", "overcast soft light", "neon practicals", "golden hour backlight".
- `negative`: "text, watermark, logo, extra fingers, warped faces, flicker, jump cut, cartoon" (models without negative prompts get it appended).
- Image-to-video prompts describe **what moves**, not what's already in the frame.
- Duration: 4–6 s shots cut better than 10 s ones; models drift and morph in long takes. Generate the length you'll use (+0.5 s handles).
- Aspect: default `project` matches the edit; for 9:16 generate 9:16 rather than cropping 16:9.

## 4. Continuity across shots
- Same subject/character/product: generate a **reference still** first and use it as `image` (image-to-image edit / first frame) for every shot. Models that accept references (Nano Banana, gpt-image edits, FLUX.2, Runway gen4_image) keep identity best.
- Same `seed` + same prompt skeleton → the same look; change only the action/camera words.
- First+last frame models (`endImage`: fal `kling-4`, `kling-3-pro`, `gemini-omni-flash`, `minimax-h3-max`, `wan-3`, `luma-ray-3.2`, `seedance-2.5`, `flux-3-max-video`; Veo 3.1 via Runway / Replicate; Replicate Kling 3 / Seedance 2) make a shot land exactly on a designed end frame — great for match cuts into motion graphics.
- Keep one model per sequence; mixing models changes grain, colour and motion style.

## 5. Integrating shots into the edit
- Results land in `media/` with provenance (`.studio/media/<file>.source.json`: provider, model, prompt, seed, cost) and are conformed to the project fps. Place with `timeline_add {kind:'media', ref:'gen-….mp4'}`.
- `trim` to the best 2–4 s (models are strongest in the middle), `speed` for slow-mo/ramps, `reframe` / `reframe_follow` for other aspects.
- **Grade to the design system**: `adjust` (stills) or item effects (`look`, `tint`, `contrast`, `grain`, `vignette` via timeline fx) so generated footage matches the palette and other shots. A shared grain/vignette glues mixed sources together.
- Composite graphics over generated footage with the trackers (`camera_track` / `planar_track` / `track_object` → `studio.follow` / `studio.plane` / `studio.track` in the clip) — never hand-animate positions on top of moving footage.
- `remove_background_video` / `remove_background` to cut a generated subject out and put it over a designed background.
- Native audio from models is rarely usable for the edit; music/VO come from the editor (generate silent unless the user wants the diegetic sound).

## 6. Legal & ethical limits (non-negotiable)
- **No real people's likeness** (celebrities, politicians, private persons, the user's colleagues) without their documented consent — no "in the style of <living person>", no face references of real people unless the user confirms it's them/they have consent.
- **No copyrighted characters, brands or trademarks** (Mickey Mouse, Marvel, Nike swoosh, Coca-Cola bottle…) and no "in the style of <living artist>". Use the user's own brand assets in code instead.
- No deceptive "real news" footage, no fake documents, no sexual content, no minors in sensitive contexts.
- If a provider blocks a request (content policy), rephrase toward the legitimate intent — don't try to evade the filter.
- Tell the user which shots are AI-generated if the video could be taken as real footage.

## 7. Providers at a glance
- **fal.ai** (one key → most models): Kling 4 / 4 Flash / 3 Pro, Gemini Omni Flash, MiniMax H3, Wan 3, Luma Ray 3.2, Seedance 2.5, FLUX 3 Max, PixVerse V6 for video; Nano Banana 2.1, FLUX 1.1 ultra / FLUX 3 / Kontext, Seedream 5, GPT Image 2.6, Ideogram 4.5, Recraft 4.1, Qwen Image 3 for stills. Default first choice (defaults: `nano-banana-2.1`, `kling-4` at 720p). Any other fal endpoint id works as `model`.
- **Runway**: Gen-4.5 (t2v/i2v), Gen-4 Turbo (cheap i2v), Veo 3.1 with first+last frames, Gen-4 Image with references.
- **Replicate**: curated Veo 3.1, Kling 3, Seedance 2, Wan 3, Hailuo 2.3, FLUX.2, Nano Banana Pro — or any `owner/name` model with `extra` fields.
- **Higgsfield**: Cinema Studio 4.0 (native camera moves, lens/light/genre presets via `extra`), Soul stills.
- **OpenAI**: images only (gpt-image-2.6 flare/sunburst) — best for precise edits; Sora's API is shut down.
- **Google**: Nano Banana 2.1 stills, Gemini Omni Flash video (16:9 / 9:16, 3–15 s, audio). Veo/Imagen are no longer in the Gemini API.
- **ComfyUI** (`provider:'comfy'`, `model:<workflow name>`): free, local; workflows in `~/.smashcut/comfy-workflows/` or `workflows/` with `{{prompt}}`, `{{seed}}`, `{{image}}`, `{{width}}`… placeholders (`example-sdxl-txt2img`, `example-wan22-img2vid` need their models installed).
Errors are explicit (no key, rejected key, no credits, content policy, model unavailable) — relay them to the user; don't retry paid calls in a loop.
