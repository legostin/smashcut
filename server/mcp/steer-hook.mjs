#!/usr/bin/env node
// Claude Code hook (PostToolUse / Stop) for agents run by Smashcut: delivers messages the user typed in the editor
// chat while the agent works, without stopping it. The editor sets STUDIO_URL / STUDIO_TASK / STUDIO_PROJECT.
let input = '';
for await (const c of process.stdin) input += c;
let ev = {};
try { ev = JSON.parse(input || '{}'); } catch { /* ignore */ }
const base = process.env.STUDIO_URL, task = process.env.STUDIO_TASK;
if (!base || !task) process.exit(0);
let text = '';
try {
  const res = await fetch(base + '/api/agent/steer', { headers: { 'x-studio-task': task, 'x-studio-project': process.env.STUDIO_PROJECT || '' }, signal: AbortSignal.timeout(4000) });
  if (res.ok) text = (await res.json()).text || '';
} catch { /* editor not reachable: nothing to deliver */ }
if (!text) process.exit(0);
if (ev.hook_event_name === 'Stop') console.log(JSON.stringify({ decision: 'block', reason: text }));
else console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: ev.hook_event_name || 'PostToolUse', additionalContext: text } }));
