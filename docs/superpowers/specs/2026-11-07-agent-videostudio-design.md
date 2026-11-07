# Agent Video Studio — design (v1: motion graphics)

Local-first web video editor where local coding agents (Claude Code, Codex) author motion graphics,
music and the edit. Everything free and works out of the box.

## Decisions
- **Shape:** local Node server (Fastify, TS via tsx) + React/Vite web UI on localhost. Electron later, maybe.
- **Edit model (D+B):** the edit is JSON (`project.json`); each motion-graphics clip is an HTML/CSS/JS
  composition (GSAP, WAAPI, CSS, canvas, SVG) rendered by headless Chromium frame by frame.
- **Agents (C):** the editor spawns `claude -p --output-format stream-json` / `codex exec --json` in the
  project dir and streams events into the UI. Agents get an MCP server (`studio`) that lets them render
  frames and contact sheets of their own output, read and resolve comments, edit the timeline and analyse
  music. The same MCP server can be attached to a terminal agent.
- **Comments (C):** pins on frames (time + point/rect + text) are drafts. "Send" groups them per clip
  and starts one agent per clip, running in parallel. Agent resolves → user accepts or reopens. Every
  agent task is a git commit inside the project, so you can compare versions and restore.
- **Gallery/skills (B):** built-in curated templates + `~/.agent-videostudio/library`. Templates have
  parameters (text, colour, numbers) editable in the inspector without an agent. Package = folder with
  `manifest.json`, ready for a future remote catalog. Skills are synced into each project
  (`.claude/skills`, `AGENTS.md`).
- **Audio intelligence (C):** transcription with word timestamps (transformers.js Whisper, local, free),
  onset/tempo analysis for imported audio, loudness + spectrogram for agent "hearing".
- **Music as code (A):** Tone.js scores (`music/<id>/score.js`), rendered offline in headless Chromium to
  WAV. The score emits a beat map (bpm, bars, sections, markers) that clips use through `studio.beat()`.
- **Generators (later):** timeline item source type `generated` (provider/prompt/jobId) is reserved.

## Project folder
```
project.json  comments.json
clips/<id>/{index.html, clip.js, style.css, params.json, assets/}
music/<id>/score.js
media/
.studio/  (cache, renders, exports, analysis, transcripts, comment snapshots)
AGENTS.md CLAUDE.md .claude/skills/
```

## Clip contract
A clip is a pure function of time. `studio.clip({duration, setup(root, params, ctx), render(t)})`.
GSAP timelines and CSS/WAAPI animations are auto-seeked. No `Date.now`, `requestAnimationFrame`,
unseeded `Math.random` or network. The background is transparent. Context: `studio.params`, `studio.beats`,
`studio.words`, `studio.beat(n)`, `studio.random(seed)`.

## Render
- Preview: layered player (video/audio elements + clip iframes) driven by one master clock.
- Export: each clip → PNG sequence with alpha (cached by content hash) → ffmpeg composite with media and
  audio mix → mp4.

## Testing
Smoke tests for the runtime determinism, render of the gallery templates, music render, export of the
demo project, MCP tool listing.
