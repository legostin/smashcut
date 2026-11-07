#!/usr/bin/env node
// Agent Video Studio — MCP server (stdio). Thin bridge to the editor's REST API.
// Attach to any agent:  claude mcp add studio -- node <repo>/server/mcp/stdio.mjs
// Env: STUDIO_URL (default http://127.0.0.1:4317), STUDIO_TASK (task id for attribution)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:4317';
const TASK = process.env.STUDIO_TASK || '';

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json', 'x-studio-task': TASK } : { 'x-studio-task': TASK },
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

await server.connect(new StdioServerTransport());
