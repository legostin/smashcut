import type { Comment, Item, Project } from '../../shared/types.ts';

export const SYSTEM_PROMPT = `You are a senior motion designer + creative coder working inside Agent Video Studio (a local video editor).
The current directory is the video project. Motion graphics are HTML/CSS/JS clips (clips/<id>/), music is Tone.js code (music/<id>/score.js), the edit is project.json.
You have the "studio" MCP tools: get_project, render_clip, render_frame, lint_clip, list_comments, resolve_comment, timeline_*, use_template, list_templates, create_clip, create_music, render_music, analyze_audio, transcribe_media, get_timing.

Non-negotiable:
- Read the relevant skill in .claude/skills/ (or AGENTS.md) before authoring a clip or a score.
- Clips are pure functions of time (GSAP on ctx.tl / CSS animations / render(t)); no Date.now, rAF loops, timers, network or unseeded randomness.
- After each meaningful edit: render_clip (and render_frame for the composite over footage) and actually LOOK at the images. Fix what looks off — spacing, contrast, cut-off text, timing — before you finish.
- Keep edits scoped to what was asked. Never modify media/ or .studio/.
- When addressing comments: call resolve_comment for each comment you fixed, with a short note.
- Finish with a 2–4 line summary of what you changed.`;

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function commentTaskPrompt(opts: { clipId?: string; item?: Item; project: Project; comments: Comment[]; snapshots: string[] }) {
  const { clipId, item, comments, snapshots } = opts;
  const where = clipId
    ? `clip \`clips/${clipId}/\`${item ? ` (timeline item ${item.id}, track ${item.track}, project time ${item.start.toFixed(2)}–${(item.start + item.duration).toFixed(2)}s, trim-in ${item.in.toFixed(2)}s, params ${JSON.stringify(item.params || {})})` : ''}`
    : 'the edit as a whole (timeline / several layers)';
  const list = comments.map((c, i) => {
    const local = item ? c.time - item.start + item.in : null;
    const region = c.w && c.h ? `, region ${pct(c.x)},${pct(c.y)} size ${pct(c.w)}×${pct(c.h)}` : '';
    return `${i + 1}. [${c.id}] at project ${c.time.toFixed(2)}s${local != null ? ` (clip-local ${local.toFixed(2)}s)` : ''}, point (${pct(c.x)}, ${pct(c.y)})${region}: "${c.text}"`;
  }).join('\n');
  return `Review comments on ${where}.

${list}

Annotated snapshots of the composited frame (numbered pins match the list) — Read them first:
${snapshots.map((s) => '- ' + s).join('\n')}

Fix every comment. Verify with render_clip / render_frame around each comment time, then resolve_comment for each id with a short note.`;
}

export function chatTaskPrompt(opts: { prompt: string; project: Project; playhead?: number; item?: Item; clipId?: string }) {
  const ctx: string[] = [];
  if (opts.playhead != null) ctx.push(`playhead at ${opts.playhead.toFixed(2)}s`);
  if (opts.item) ctx.push(`selected timeline item ${opts.item.id} (${opts.item.kind} "${opts.item.ref}", ${opts.item.start.toFixed(2)}–${(opts.item.start + opts.item.duration).toFixed(2)}s on track ${opts.item.track})`);
  if (opts.clipId) ctx.push(`focus clip: clips/${opts.clipId}/`);
  return `${opts.prompt}${ctx.length ? `\n\n(Editor context: ${ctx.join('; ')}.)` : ''}`;
}
