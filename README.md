# Smashcut

**Your AI crew makes the video. You direct.**

Smashcut is a local-first video editor where your own coding agents — **Claude Code** and **Codex** — write the script, design the motion graphics, compose the music, voice it, build 3D shots in Blender and cut the edit. You steer with a storyboard, comments on frames and plain language. Everything they make is code you can open, version and change.

*Русская версия: [README.ru.md](README.ru.md)*

## Install

Requirements: macOS or Linux, Node.js 20+, and at least one agent CLI you are logged into —
[Claude Code](https://claude.com/claude-code) (`npm i -g @anthropic-ai/claude-code`, then `claude`) and/or Codex (`npm i -g @openai/codex`, then `codex login`).

```sh
npx smashcut-studio                 # opens http://127.0.0.1:4317 with a demo project in ~/Smashcut
# or
npm i -g smashcut-studio && smashcut ~/Videos/my-video

smashcut doctor                     # checks ffmpeg, the render browser, claude/codex logins, Blender, disk, port
smashcut --port 4400 --no-open
```

ffmpeg is used from your system if present (`brew install ffmpeg`), otherwise a bundled build. Rendering uses your installed Chrome or downloads Chrome Headless Shell once. Blender (optional) enables 3D scenes.

## How it works

- **Storyboard first.** The agent writes the script — scenes with timing, copy and visual notes — then produces scene by scene. Every scene shows a live status (not started → in progress → needs review → done → approved) and which agent is on it. Select scenes and *Make*, *Redo*, *Variations*, *Voice-over*, *Approve* or *Lock* them; approved and locked scenes are off-limits for agents.
- **Motion graphics as code.** A clip is HTML/CSS/JS (GSAP, SVG, canvas) — a pure function of time, rendered frame-exact. Flexible params, design-system tokens, layout gizmo, transitions, effects, masks and blend modes, identical in preview and export.
- **References, techniques, inspiration.** 57 built-in *techniques* (each with a TECHNIQUE.md the agent studies — not templates to paste) and 108 curated real-world motion pieces (studios, product launches, code demos, social formats) with breakdowns. Add them to the project as references, bound to scenes.
- **Music as code.** Tone.js scores rendered offline; beats, sections and markers drive the animation.
- **Voice-over as a process.** Speech text with numbers spelled out, stress marks and pauses (`{2026|twenty twenty-six}`), ElevenLabs takes with a pace check so the voice doesn't speed up or slow down; captions keep the display text.
- **3D with Blender.** Scenes as Python code, rendered headless in stages: mock (seconds) → look (EEVEE) → final; renders land on the timeline and get replaced in place.
- **Media toolkit for agents.** Background removal (images & video), chroma key, stickers, reframing, morphs, slow-mo, loudness, denoise, silence removal, music ducking.
- **Review loop.** Pin comments on frames or canvas objects; agents resolve or dismiss them. Interrupt a working agent at any time; sub-agents build scenes in parallel.
- **Versions.** Spin off a version in another language, aspect ratio or length — it inherits the script and design system and the agent adapts it.
- **Safe by default.** Projects are git repositories (every agent task is a commit; undo/redo), agents run isolated with only the editor's tools, the editor survives restarts and agents keep working.
- Multiple projects in separate tabs, English UI with Russian and more locales, export to MP4 / ProRes 4444 (alpha) / WebM / GIF.

## Use your own terminal agent

```sh
claude mcp add studio -e STUDIO_URL=http://127.0.0.1:4317 -- node "$(npm root -g)/smashcut-studio/server/mcp/stdio.mjs"
```

## Develop

```sh
npm install
npm run dev        # server (tsx) + Vite
npm start          # build the UI if needed and run
npm test           # end-to-end: templates, music, composite, MCP, export parity
npx tsx test/toolkit.ts
npm run build && npm pack
```

MIT license.
