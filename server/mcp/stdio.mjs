#!/usr/bin/env node
// Smashcut — MCP server (stdio). Thin bridge to the editor's REST API.
// Attach to any agent:  claude mcp add studio -- node <repo>/server/mcp/stdio.mjs
// Env: STUDIO_URL (default http://127.0.0.1:4317), STUDIO_TASK (task id for attribution), STUDIO_PROJECT (open project id)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:4317';
const TASK = process.env.STUDIO_TASK || '';
const PROJECT = process.env.STUDIO_PROJECT || '';

// the editor may restart while the agent works: retry connection failures for up to ~2 minutes
async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await apiOnce(method, path, body);
    } catch (e) {
      const transient = e && (e.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'ECONNRESET' || /fetch failed|ECONNREFUSED|socket hang up/i.test(String(e.message)));
      if (!transient || attempt >= 60) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function apiOnce(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json', 'x-studio-task': TASK, 'x-studio-project': PROJECT } : { 'x-studio-task': TASK, 'x-studio-project': PROJECT },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof data === 'string' ? data : data.error || JSON.stringify(data));
  return data;
}

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const withImages = (t, images) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }, ...images.filter(Boolean).map((data) => ({ type: 'image', data, mimeType: 'image/png' }))] });
const safe = (fn) => async (args) => { try { return await fn(args || {}); } catch (e) { return { isError: true, content: [{ type: 'text', text: 'Error: ' + e.message }] }; } };

const server = new McpServer({ name: 'studio', version: '0.1.0' }, {
  instructions: 'Smashcut editor tools. Always verify visual work with render_clip / render_frame and look at the images. Resolve comments you addressed with resolve_comment.',
});

// messages the user types in the editor chat while the agent works are appended to the next tool result
// (Codex has no hooks; for Claude this is the fallback next to the PostToolUse hook). approve_permission must stay pure.
const registerTool = server.registerTool.bind(server);
server.registerTool = (name, def, handler) => registerTool(name, def, name === 'approve_permission' ? handler : async (args, extra) => {
  const r = await handler(args, extra);
  if (!TASK) return r;
  try {
    const { text: steer } = await apiOnce('GET', '/api/agent/steer');
    if (steer) return { ...r, content: [...(r?.content || []), { type: 'text', text: steer }] };
  } catch { /* editor busy / restarting: deliver later */ }
  return r;
});

server.registerTool('get_project', {
  description: 'Overview of the open project: resolution/fps, tracks, timeline items (with ids, times, refs, params), clips, music, media, open comments, timing summary. Call this first.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/agent/overview'))));

server.registerTool('list_comments', {
  description: 'Frame comments left by the user. Each has project time, clip-local time, normalized x/y (and optional rect), text, status, and an annotated snapshot path you can Read.',
  inputSchema: { status: z.enum(['draft', 'sent', 'resolved', 'done', 'open']).optional().describe('open = draft+sent'), clipId: z.string().optional() },
}, safe(async ({ status, clipId }) => text(await api('GET', `/api/agent/comments?status=${status || ''}&clipId=${clipId || ''}`))));

server.registerTool('resolve_comment', {
  description: 'Mark a comment as addressed (the user will confirm or reopen). Give a one-line note of what you changed.',
  inputSchema: { id: z.string(), note: z.string() },
}, safe(async ({ id, note }) => text(await api('POST', `/api/comments/${id}/resolve`, { note, taskId: TASK }))));

server.registerTool('dismiss_comment', {
  description: 'Delete a frame comment that is no longer relevant (the commented object was removed/replaced, or the remark no longer applies). Always give the reason — the user sees it.',
  inputSchema: { id: z.string(), reason: z.string() },
}, safe(async ({ id, reason }) => text(await api('POST', `/api/comments/${id}/dismiss`, { reason }))));

server.registerTool('list_board_notes', {
  description: 'Comments the user pinned to objects on the board (scenes, storyboard frames, design tokens, layers, components): id, anchors, labels, text, status open|resolved.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/agent/board-notes'))));

server.registerTool('resolve_board_note', {
  description: 'Mark a board comment as done after you addressed it, with a one-line note of what you changed.',
  inputSchema: { id: z.string(), note: z.string() },
}, safe(async ({ id, note }) => text(await api('POST', `/api/board/notes/${id}/resolve`, { note }))));

server.registerTool('delete_board_note', {
  description: 'Delete a board comment that is obsolete: its object no longer exists (scene/layer removed) or the remark no longer applies. Give the reason.',
  inputSchema: { id: z.string(), reason: z.string() },
}, safe(async ({ id, reason }) => text(await api('POST', `/api/board/notes/${id}/dismiss`, { reason }))));

server.registerTool('render_clip', {
  description: 'Render frames of a clip in isolation (transparent areas shown as checkerboard) and return a contact sheet image. Use after every edit to SEE your work. Times are clip-local seconds; default = `count` evenly spaced frames. Pass itemId to use that timeline item\'s params/duration. Also returns runtime errors.',
  inputSchema: { clipId: z.string(), times: z.array(z.number()).optional(), count: z.number().int().min(1).max(16).optional(), itemId: z.string().optional() },
}, safe(async (a) => { const r = await api('POST', '/api/agent/render-clip', a); return withImages({ times: r.times, duration: r.duration, errors: r.errors, file: r.file }, [r.png]); }));

server.registerTool('render_frame', {
  description: 'Render the full composited timeline (video + all graphics layers) at project time(s) — exactly what the viewer/export shows. Returns an image (contact sheet if several times).',
  inputSchema: { times: z.array(z.number()).min(1).max(12) },
}, safe(async (a) => { const r = await api('POST', '/api/agent/render-frame', a); return withImages({ times: r.times, errors: r.errors, file: r.file }, [r.png]); }));

server.registerTool('lint_clip', {
  description: 'Static + runtime checks of a clip against the clip contract (determinism, missing studio.clip, errors at several times, params schema).',
  inputSchema: { clipId: z.string() },
}, safe(async ({ clipId }) => text(await api('POST', '/api/agent/lint-clip', { clipId }))));

server.registerTool('create_clip', {
  description: 'Create a new empty clip package clips/<id>/ (index.html, clip.js, style.css, params.json, manifest.json) from the starter skeleton. Then edit the files. template "3d" = a Three.js clip (import map for three / three/addons / studio3js, clip.js as an ES module) — the default way to make 3D; Blender (create_3d_scene) only for what Three.js can\'t do well.',
  inputSchema: { id: z.string(), name: z.string(), description: z.string().optional(), duration: z.number().optional(), template: z.enum(['2d', '3d']).optional() },
}, safe(async (a) => text(await api('POST', '/api/clips', a))));

server.registerTool('create_music', {
  description: 'Create a new music score music/<id>/score.js from the starter skeleton (Tone.js). Then edit it and call render_music.',
  inputSchema: { id: z.string(), name: z.string(), description: z.string().optional() },
}, safe(async (a) => text(await api('POST', '/api/music', a))));

server.registerTool('list_templates', {
  description: 'The technique library (built-in gallery + the user library): clip & music techniques (id, origin, category, description, sourceDir). These are NOT templates to paste: pick the techniques that fit the script and design system, read them with get_technique, then write an ORIGINAL clip/score in the project style (see the studio-techniques skill).',
  inputSchema: { kind: z.enum(['clip', 'music']).optional(), query: z.string().optional() },
}, safe(async ({ kind, query }) => text(await api('GET', `/api/agent/templates?kind=${kind || ''}&q=${encodeURIComponent(query || '')}`))));

server.registerTool('create_3d_scene', {
  description: 'Create (or update the manifest of) a Blender 3D scene: scenes3d/<id>/scene.py (+ manifest). The scene is CODE using the studio3d helper library — read the studio-blender-3d skill first. Pass `code` to write scene.py, or edit the file afterwards with your file tools. transparent:true renders with alpha (WebM) for compositing over other layers.',
  inputSchema: { id: z.string(), name: z.string().optional(), duration: z.number().optional(), transparent: z.boolean().optional(), code: z.string().optional(), params: z.record(z.string(), z.any()).optional() },
}, safe(async (a) => text(await api('POST', '/api/3d', a))));

server.registerTool('render_3d', {
  description: 'Render a 3D scene with Blender in a stage: quality "mock" (Workbench solid, half-res, seconds — composition, camera, timing), "look" (EEVEE, materials & light), "final" (EEVEE high samples + motion blur; params.engine="cycles" for Cycles). mode "stills" (default) renders the given times (s) into a contact sheet you get back as an image — LOOK at it; mode "animation" renders the whole scene into media and places it on the timeline (replacing the previous render of this scene, keeping its position; pass place {start, track} the first time). Workflow: mock stills → fix → mock animation for timing → look stills → look animation → final animation only when the user approves.',
  inputSchema: { id: z.string(), quality: z.enum(['mock', 'look', 'final']).optional(), mode: z.enum(['stills', 'animation']).optional(), times: z.array(z.number()).optional(), place: z.object({ start: z.number().optional(), track: z.string().optional() }).optional() },
}, async (a) => {
  try {
    const r = await api('POST', `/api/3d/${encodeURIComponent(a.id)}/render`, a);
    const content = [{ type: 'text', text: JSON.stringify({ ...r, image: undefined }, null, 2) }];
    if (r.image) content.push({ type: 'image', data: r.image, mimeType: 'image/png' });
    return { content };
  } catch (e) { return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true }; }
});

server.registerTool('list_references', {
  description: 'The project\'s references — techniques from the library, images/videos, links — that the user wants this video to follow, with the scenes each applies to and how to read it. Call it before designing or making scenes; study the relevant ones (get_technique / Read the media) and follow them in the project style. Mention which references you used.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/agent/references'))));

server.registerTool('get_technique', {
  description: 'Read one technique: TECHNIQUE.md (use it for / anatomy / motion with timings and easings / adapting to the design system and formats / variations / pitfalls / key code) and the list of reference files in its folder (Read them for the full code). Then build your own clip with create_clip.',
  inputSchema: { id: z.string(), kind: z.enum(['clip', 'music']).optional() },
}, safe(async ({ id, kind }) => text(await api('GET', `/api/agent/techniques/${kind === 'music' ? 'music' : 'clip'}/${encodeURIComponent(id)}`))));

server.registerTool('use_template', {
  description: 'Copy a technique\'s reference implementation into the project as-is (clips/<newId> or music/<newId>), optionally placing it. Only for quick drafts or when the user asks for that exact clip — restyle it to the design system before calling it done. Prefer get_technique + create_clip.',
  inputSchema: {
    origin: z.enum(['builtin', 'library']), kind: z.enum(['clip', 'music']), id: z.string(), newId: z.string().optional(),
    place: z.object({ track: z.string().optional(), start: z.number(), duration: z.number().optional(), params: z.record(z.string(), z.any()).optional() }).optional(),
  },
}, safe(async (a) => text(await api('POST', '/api/gallery/use', a))));

server.registerTool('timeline_add', {
  description: 'Add an item to the timeline. kind=clip (ref=clip id), media (ref=file in media/), music (ref=music id). Track defaults to the first track of the matching kind.',
  inputSchema: {
    kind: z.enum(['clip', 'media', 'music']), ref: z.string(), start: z.number(), duration: z.number().optional(), in: z.number().optional(),
    track: z.string().optional(), label: z.string().optional(), params: z.record(z.string(), z.any()).optional(), opacity: z.number().optional(), volume: z.number().optional(),
  },
}, safe(async (a) => text(await api('POST', '/api/items', a))));

server.registerTool('timeline_update', {
  description: 'Patch a timeline item (start, duration, in, track, params (merged), label, opacity, volume, transform).',
  inputSchema: { id: z.string(), patch: z.record(z.string(), z.any()) },
}, safe(async ({ id, patch }) => text(await api('PATCH', `/api/items/${id}`, patch))));

server.registerTool('timeline_remove', {
  description: 'Remove a timeline item by id.',
  inputSchema: { id: z.string() },
}, safe(async ({ id }) => text(await api('DELETE', `/api/items/${id}`))));

server.registerTool('set_project', {
  description: 'Change project settings: name, width, height, fps, duration, background, tracks (full array), markers (full array).',
  inputSchema: { patch: z.record(z.string(), z.any()) },
}, safe(async ({ patch }) => text(await api('PATCH', '/api/project', patch))));

server.registerTool('render_music', {
  description: 'Render music/<id>/score.js to audio and return what it "sounds like": bpm, bars, sections, markers, peak level, loudness sparkline over time, onset/accent times, and a spectrogram image. Use it to check your score.',
  inputSchema: { musicId: z.string() },
}, safe(async ({ musicId }) => { const r = await api('POST', '/api/agent/render-music', { musicId }); return withImages(r.summary, [r.spectrogram]); }));

server.registerTool('analyze_audio', {
  description: 'Analyse an audio/video file from media/: tempo, beat grid, onsets, strongest accents (good cut points), loudness sparkline + spectrogram image.',
  inputSchema: { file: z.string() },
}, safe(async ({ file }) => { const r = await api('POST', '/api/agent/analyze-audio', { file }); return withImages(r.summary, [r.spectrogram]); }));

server.registerTool('transcribe_media', {
  description: 'Transcribe speech in media/<file> with word-level timestamps (local Whisper). Words become available to clips as studio.words when the media is on the timeline.',
  inputSchema: { file: z.string(), language: z.string().optional() },
}, safe(async (a) => text(await api('POST', '/api/agent/transcribe', a))));

server.registerTool('get_timing', {
  description: 'Project timing in project seconds: bpm, beats, bars, music sections & markers, timeline markers, transcript words. Optionally limit to a window.',
  inputSchema: { from: z.number().optional(), to: z.number().optional() },
}, safe(async ({ from, to }) => text(await api('GET', `/api/agent/timing?from=${from ?? ''}&to=${to ?? ''}`))));

server.registerTool('delegate_task', {
  description: 'Start a SUB-AGENT that works in parallel on a self-contained assignment in this project (e.g. build one clip, compose the music, a voice-over pass). It does not see your conversation: give it everything it needs (scene, clip id, duration, design tokens, what to deliver). Returns {taskId}. Then keep working and call wait_subagents to collect the reports. Available only if the user enabled sub-agents in Settings.',
  inputSchema: {
    title: z.string().describe('short name shown in the editor, e.g. "Clip: intro title"'),
    prompt: z.string().describe('the complete assignment'),
    clipId: z.string().optional().describe('the clip this sub-agent owns (scopes its commit)'),
    agent: z.enum(['claude', 'codex']).optional(),
  },
}, safe(async (a) => text(await api('POST', '/api/agent/subagents', a))));

server.registerTool('wait_subagents', {
  description: 'Wait until your sub-agents finish (all of them, or the given ids) and get their reports [{id,title,status,report,version}]. Waits up to ~9 minutes per call; if some are still running, call it again.',
  inputSchema: { ids: z.array(z.string()).optional() },
}, safe(async (a) => text(await api('POST', '/api/agent/subagents/wait', a))));

server.registerTool('message_subagent', {
  description: 'Send a follow-up instruction to one of your sub-agents (it continues its own session; queued if it is busy).',
  inputSchema: { id: z.string(), text: z.string() },
}, safe(async (a) => text(await api('POST', '/api/agent/subagents/message', a))));

server.registerTool('get_script', {
  description: 'The video script / storyboard (script.json): brief, production stage (brief→script→storyboard→production→review→export) and scenes [{id,title,start,duration,voiceover,visual,notes,status todo|doing|review|done|approved, locked?, itemIds}]. Read it before producing a video. Scenes that are approved or locked belong to the user: do not change them (items, clips, timing, copy) unless the task explicitly names them.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/script'))));

server.registerTool('set_script', {
  description: 'Write the script: any of {brief, stage, scenes}. scenes replaces the whole list (keep ids of existing scenes). Use it to draft a script from a brief, re-time scenes, or advance the stage. The user sees it live in the editor.',
  inputSchema: {
    brief: z.string().optional(),
    stage: z.enum(['brief', 'script', 'storyboard', 'production', 'review', 'export']).optional(),
    scenes: z.array(z.object({ id: z.string().optional(), title: z.string(), start: z.number(), duration: z.number(), voiceover: z.string().optional(), visual: z.string().optional(), notes: z.string().optional(), status: z.enum(['todo', 'doing', 'review', 'done', 'approved']).optional(), locked: z.boolean().optional(), itemIds: z.array(z.string()).optional() })).optional(),
  },
}, safe(async (a) => text(await api('PUT', '/api/script', a))));

server.registerTool('update_scene', {
  description: 'Patch one scene (title, start, duration, voiceover, visual, notes, status, itemIds). Set status "doing" when you start a scene and "done" when it is finished and verified — the user watches progress live. Use "review" when you need the user to decide something about the scene (say what in notes). Never set "approved" or change "locked" — those are the user\'s.',
  inputSchema: { id: z.string(), patch: z.record(z.string(), z.any()) },
}, safe(async ({ id, patch }) => text(await api('PATCH', `/api/script/scenes/${id}`, patch))));

server.registerTool('get_design', {
  description: 'The project design system (design.json): colour tokens, type roles, motion tokens, spacing. Clips get them as CSS vars: var(--color-<name>), var(--font-<role>) / var(--weight-<role>) / var(--size-<role>), var(--dur-<name>), var(--space-<name>), and as studio.design in JS (motion eases for GSAP).',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/design'))));

server.registerTool('set_design', {
  description: 'Create or update the design system (any of name, colors, type, motion, spacing, notes; arrays replace). Define it before building clips so every clip shares one look; the user watches it on the board live.',
  inputSchema: {
    name: z.string().optional(),
    colors: z.array(z.object({ name: z.string(), value: z.string(), role: z.string().optional() })).optional(),
    type: z.array(z.object({ role: z.string(), family: z.string(), weight: z.number(), size: z.number(), tracking: z.number().optional(), sample: z.string().optional() })).optional(),
    motion: z.array(z.object({ name: z.string(), ease: z.string(), duration: z.number() })).optional(),
    spacing: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
    notes: z.string().optional(),
  },
}, safe(async (a) => text(await api('PUT', '/api/design', a))));

server.registerTool('list_fx', {
  description: 'Catalog of editing transitions, effects (colour looks, blur, vignette, grain, chromatic aberration, ken burns, shake, letterbox…), masks and blend modes. Apply with timeline_update {id, patch:{fx:{in:{type,duration}, out:{…}, effects:[{type, params}], mask:{shape,x,y,w,h,feather,invert,radius,angle}, blend}}} — fx replaces the whole object, so send all of it. Preview, agent frames and export render fx identically.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/fx'))));

server.registerTool('record_web', {
  description: 'Record footage of a web page (any URL) with a scripted demo: load, waits, smooth scrolls, clicks (with an animated demo cursor + click ripple), typing, hovers, highlights. Produces an MP4 in media/ at the project size (or device=mobile for a phone layout) and optionally places it on the timeline. actions: [{type:"wait",ms}|{type:"scroll",to:"bottom"|"top"|px,selector?,by?,duration?}|{type:"click",selector|text|x,y}|{type:"hover",…}|{type:"type",selector?,text,delay?}|{type:"press",key}|{type:"highlight",selector|text,ms?}|{type:"goto",url}|{type:"move",x,y,duration?}] (coordinates in CSS px of the viewport). Without actions: load → slow scroll down and back.',
  inputSchema: {
    url: z.string(), actions: z.array(z.record(z.string(), z.any())).optional(), seconds: z.number().optional(),
    device: z.enum(['desktop', 'mobile']).optional(), zoom: z.number().optional(), dark: z.boolean().optional(), cursor: z.boolean().optional(), name: z.string().optional(),
    place: z.object({ start: z.number().optional(), track: z.string().optional() }).optional(),
  },
}, safe(async (a) => text(await api('POST', '/api/agent/record-web', a))));

server.registerTool('record_app', {
  description: 'macOS: record the front window of a running app (or the whole screen) for N seconds, optionally running AppleScript lines in the app meanwhile. Needs Screen Recording permission for the editor host. Result: MP4 in media/, optionally placed on the timeline.',
  inputSchema: { app: z.string().optional(), seconds: z.number(), script: z.string().optional(), name: z.string().optional(), padding: z.number().optional(), place: z.object({ start: z.number().optional(), track: z.string().optional() }).optional() },
}, safe(async (a) => text(await api('POST', '/api/agent/record-screen', a))));

server.registerTool('list_voices', {
  description: 'ElevenLabs voices available to the user (id, name, labels: accent/gender/age/use case) and TTS models. Needs an API key in the editor settings.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/voice/voices'))));

server.registerTool('generate_voiceover', {
  description: 'Generate voice-over with ElevenLabs and place it on the audio track. ALWAYS voice scenes by sceneId, after preparing each scene\'s speech text (update_scene {speech}) per the studio-voiceover skill: numbers/dates/units/abbreviations as words in the right grammatical form, {display|spoken} so captions keep the digits, stress marks (U+0301) on ambiguous words, [pause 0.4] where a speaker would breathe. The scene take is generated with steady settings and the neighbours\' speech as context, checked for pace (syllables/s per sentence vs the project\'s voice pace) and re-rolled if it speeds up/slows down. Returns duration, overflow (seconds past the scene end) and pace {rate, projectRate, flagged sentences, gaps}. If sentences are still flagged: simplify/split them or add pauses in speech, then regenerate. Word timestamps become studio.words for captions (display text).',
  inputSchema: {
    sceneId: z.string().optional(), text: z.string().optional(), start: z.number().optional(), place: z.boolean().optional(),
    voiceId: z.string().optional(), modelId: z.string().optional(), speed: z.number().min(0.7).max(1.2).optional(), stability: z.number().min(0).max(1).optional(), style: z.number().min(0).max(1).optional(), name: z.string().optional(),
    takes: z.number().int().min(1).max(4).optional().describe('max takes when the pace check fails (default from settings, 2)'),
  },
}, safe(async (a) => text(await api('POST', '/api/voice/tts', a))));

server.registerTool('voice_report', {
  description: 'Pace check of every scene\'s voice-over: syllables/s, the project\'s voice pace, sentences that run fast/slow (>15%), unexpected gaps, and whether the scene has prepared speech text. Use after voicing to find scenes to fix.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/voice/report'))));

server.registerTool('approve_permission', {
  description: 'Internal: permission prompt bridge. Claude Code calls this (via --permission-prompt-tool) when an action needs approval; the user approves or denies it in the editor UI.',
  inputSchema: { tool_name: z.string(), input: z.record(z.string(), z.any()), tool_use_id: z.string().optional() },
}, async ({ tool_name, input }) => {
  const reply = (d) => text(d.allow ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: d.message || 'Denied by the user.' });
  try {
    const ask = () => api('POST', '/api/agent/permission', { taskId: TASK, tool: tool_name, input });
    let r = await ask();
    if (r.decision) return reply(r.decision);
    for (;;) {
      await new Promise((res) => setTimeout(res, 800));
      const p = await api('GET', `/api/agent/permission/${r.id}`);
      if (p.decision) return reply(p.decision);
      // editor restarted and forgot the request → ask again
      if (p.unknown) { r = await ask(); if (r.decision) return reply(r.decision); }
    }
  } catch (e) {
    return reply({ allow: false, message: 'Editor unreachable, permission denied: ' + e.message });
  }
});

// ---------- media toolkit (server/toolkit; REST /api/toolkit) ----------
const fmtParam = (k, s) => {
  const range = s.type === 'enum' ? (s.values || []).join('|') : s.min != null || s.max != null ? `${s.min ?? ''}..${s.max ?? ''}` : '';
  return `${k}${s.required ? '*' : ''}:${s.type === 'file' ? 'file(' + (s.accept || []).join('/') + ')' : s.type}${s.default !== undefined && s.default !== '' ? '=' + JSON.stringify(s.default) : ''}${range ? ' [' + range + ']' : ''}`;
};

server.registerTool('list_media_tools', {
  description: 'Catalog of programmatic media operations you can run with run_media_tool: cut out backgrounds (photo & video), sticker outlines, colour palettes, resize/crop/adjust/convert images, chroma key green screen → transparent WebM/ProRes, trim, speed/reverse/boomerang, reframe to 9:16/1:1, smooth slow-mo, frame extraction, GIF, seamless loops, image/clip morphs, audio extract/normalize (−14 LUFS)/denoise/remove silence/duck music under voice. Compact by default (* = required); pass op for the full spec of one tool.',
  inputSchema: { category: z.enum(['image', 'video', 'audio', 'convert', 'generate']).optional(), op: z.string().optional().describe('one op id → full JSON spec') },
}, safe(async ({ category, op }) => {
  const { ops } = await api('GET', '/api/toolkit');
  if (op) { const o = ops.find((x) => x.id === op); if (!o) throw new Error(`unknown op ${op}; known: ${ops.map((x) => x.id).join(', ')}`); return text(o); }
  return text(ops.filter((o) => !category || o.category === category).map((o) =>
    `${o.id} [${o.category}${o.cost ? ', ' + o.cost : ''}] — ${o.description}${o.limits ? ' Limits: ' + o.limits + '.' : ''}\n  params: ${Object.entries(o.inputs).map(([k, s]) => fmtParam(k, s)).join(', ')}\n  outputs: ${Object.entries(o.outputs).map(([k, s]) => `${k}:${s.kind}${s.optional ? '?' : ''}`).join(', ')}`).join('\n\n')
    + '\n\nFile params are project-relative paths (media/photo.png; a bare name means media/<name>). Run with run_media_tool {op, params}.');
}));

server.registerTool('run_media_tool', {
  description: 'Run one media toolkit operation (see list_media_tools) and wait for it. File params are project paths like media/photo.png. Results are NEW files in media/ (originals are never changed; names derive from the input, e.g. media/photo.nobg.png) and appear in the media library; json outputs come back inline. Identical re-runs return cached results instantly. Image results are shown to the user in your feed — Read the file to look at it yourself. Slow ops (remove_background_video, slowmo) can take minutes.',
  inputSchema: { op: z.string(), params: z.record(z.string(), z.any()).optional() },
}, safe(async ({ op, params }) => {
  let job = await api('POST', '/api/toolkit/run', { op, params: params || {} });
  const t0 = Date.now();
  while (job.status === 'running') {
    if (Date.now() - t0 > 40 * 60 * 1000) return text({ status: 'running', jobId: job.id, note: 'Still running after 40 min — check GET /api/toolkit/jobs/' + job.id });
    await new Promise((r) => setTimeout(r, 1000));
    job = await api('GET', `/api/toolkit/jobs/${job.id}`);
  }
  if (job.status === 'error') throw new Error(`${op} failed: ${job.error}`);
  const files = [];
  const walk = (v) => { if (typeof v === 'string' && v.startsWith('media/')) files.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(job.outputs);
  const secs = ((Date.parse(job.endedAt || '') - Date.parse(job.startedAt)) / 1000 || 0).toFixed(1);
  return text({
    outputs: job.outputs,
    note: `${job.cached ? 'Cached result (identical earlier run).' : `Done in ${secs}s.`} ${files.length ? `Files (relative to the project folder): ${files.join(', ')}. To place one: timeline_add {kind:'media', ref:'${(files[0] || '').replace(/^media\//, '')}', start, track?}. Transparent results (PNG / WebM alpha) go on a track above the background.` : ''}`.trim(),
  });
}));

// ---------- music QA (server/audio/report.ts; REST /api/agent/music-report) ----------
server.registerTool('music_report', {
  description: 'Objective QA of a rendered score (or an audio file in media/): integrated LUFS, true peak, LRA, crest factor, spectral balance per band (sub/low/low-mid/mid/presence/air) vs the genre target, low-end mono, per-section loudness (from the score sections), static-arrangement detection, silences and endings. Returns a one-line verdict and flags, each with a concrete fix in the score API. Loop: write score → render_music → music_report → fix the P0/P1 flags → repeat (max 3 passes).',
  inputSchema: {
    musicId: z.string().optional(), file: z.string().optional().describe('media file instead of a score'),
    genre: z.string().optional().describe('pop|corporate|house|techno|trap|hiphop|dnb|lofi|cinematic|ambient (default: from the manifest/title)'),
    targetLufs: z.number().optional().describe('default −14'), vo: z.boolean().optional().describe('music sits under voice-over: also check the 1–4 kHz speech band'),
  },
}, safe(async (a) => {
  const r = await api('POST', '/api/agent/music-report', a);
  const lines = [`VERDICT: ${r.verdict}`, ...r.flags.map((f) => `[${f.severity}] ${f.message}\n   fix: ${f.fix}`)];
  return text(lines.join('\n') + '\n\n' + JSON.stringify({ genre: r.genre, metrics: r.metrics, sections: r.sections, staticRuns: r.staticRuns }, null, 1));
}));

await server.connect(new StdioServerTransport());
