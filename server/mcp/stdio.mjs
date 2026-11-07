#!/usr/bin/env node
// Agent Video Studio — MCP server (stdio). Thin bridge to the editor's REST API.
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
  instructions: 'Agent Video Studio editor tools. Always verify visual work with render_clip / render_frame and look at the images. Resolve comments you addressed with resolve_comment.',
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
  description: 'Create a new empty clip package clips/<id>/ (index.html, clip.js, style.css, params.json, manifest.json) from the starter skeleton. Then edit the files.',
  inputSchema: { id: z.string(), name: z.string(), description: z.string().optional(), duration: z.number().optional() },
}, safe(async (a) => text(await api('POST', '/api/clips', a))));

server.registerTool('create_music', {
  description: 'Create a new music score music/<id>/score.js from the starter skeleton (Tone.js). Then edit it and call render_music.',
  inputSchema: { id: z.string(), name: z.string(), description: z.string().optional() },
}, safe(async (a) => text(await api('POST', '/api/music', a))));

server.registerTool('list_templates', {
  description: 'Built-in gallery and the user library: clip & music templates (id, origin, category, description). Template source folders can be Read for reference.',
  inputSchema: { kind: z.enum(['clip', 'music']).optional(), query: z.string().optional() },
}, safe(async ({ kind, query }) => text(await api('GET', `/api/agent/templates?kind=${kind || ''}&q=${encodeURIComponent(query || '')}`))));

server.registerTool('use_template', {
  description: 'Copy a template into the project (clips/<newId> or music/<newId>) and optionally place it on the timeline.',
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

server.registerTool('get_script', {
  description: 'The video script / storyboard (script.json): brief, production stage (brief→script→storyboard→production→review→export) and scenes [{id,title,start,duration,voiceover,visual,notes,status todo|doing|done,itemIds}]. Read it before producing a video.',
  inputSchema: {},
}, safe(async () => text(await api('GET', '/api/script'))));

server.registerTool('set_script', {
  description: 'Write the script: any of {brief, stage, scenes}. scenes replaces the whole list (keep ids of existing scenes). Use it to draft a script from a brief, re-time scenes, or advance the stage. The user sees it live in the editor.',
  inputSchema: {
    brief: z.string().optional(),
    stage: z.enum(['brief', 'script', 'storyboard', 'production', 'review', 'export']).optional(),
    scenes: z.array(z.object({ id: z.string().optional(), title: z.string(), start: z.number(), duration: z.number(), voiceover: z.string().optional(), visual: z.string().optional(), notes: z.string().optional(), status: z.enum(['todo', 'doing', 'done']).optional(), itemIds: z.array(z.string()).optional() })).optional(),
  },
}, safe(async (a) => text(await api('PUT', '/api/script', a))));

server.registerTool('update_scene', {
  description: 'Patch one scene (title, start, duration, voiceover, visual, notes, status, itemIds). Set status "doing" when you start a scene and "done" when it is finished and verified — the user watches progress live.',
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
  description: 'Generate voice-over with ElevenLabs and (by default) place it on the audio track. Pass sceneId to voice a scene from the script (uses its voiceover text, starts at the scene start, replaces a previous take of that scene, links the item to the scene) — or text + start. Returns duration and overflow (seconds the voice runs past the scene) so you can re-time scenes. Word timestamps become studio.words for captions automatically.',
  inputSchema: {
    sceneId: z.string().optional(), text: z.string().optional(), start: z.number().optional(), place: z.boolean().optional(),
    voiceId: z.string().optional(), modelId: z.string().optional(), speed: z.number().min(0.7).max(1.2).optional(), stability: z.number().min(0).max(1).optional(), style: z.number().min(0).max(1).optional(), name: z.string().optional(),
  },
}, safe(async (a) => text(await api('POST', '/api/voice/tts', a))));

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

await server.connect(new StdioServerTransport());
