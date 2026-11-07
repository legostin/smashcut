import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import type { AgentEvent, AgentKind, Task } from '../../shared/types.ts';
import { BASE_URL, MCP_STDIO, GALLERY_DIR, getSettings, LIBRARY_DIR } from '../config.ts';
import { cur, hasProject } from '../project.ts';
import { bus } from '../bus.ts';
import { nid, readJson, writeJson } from '../util.ts';
import { commit } from '../git.ts';
import { SYSTEM_PROMPT } from './prompts.ts';

const tasks = new Map<string, Task>();
const procs = new Map<string, ChildProcess>();
const queue: { taskId: string; prompt: string; images: string[] }[] = [];

function taskFile(id: string) { return cur().p('.studio', 'tasks', id + '.json'); }
function persist(t: Task) { if (hasProject()) writeJson(taskFile(t.id), t); }
function emitTask(t: Task) { persist(t); bus.send({ type: 'task', task: { ...t, events: t.events.slice(-400) } }); }
function pushEvent(t: Task, ev: Omit<AgentEvent, 't'>) {
  const e: AgentEvent = { t: Date.now(), ...ev };
  if (e.text && e.text.length > 6000) e.text = e.text.slice(0, 6000) + '…';
  t.events.push(e);
  bus.send({ type: 'task-event', taskId: t.id, event: e });
}

export function loadTasks() {
  tasks.clear();
  const dir = cur().p('.studio', 'tasks');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.endsWith('.mcp.json')) continue;
    const t = readJson<Task | null>(path.join(dir, f), null);
    if (!t || !t.id || !t.createdAt) continue;
    if (t.status === 'running' || t.status === 'queued') t.status = 'cancelled';
    tasks.set(t.id, t);
  }
}
export function listTasks() {
  return [...tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => ({ ...t, events: t.events.slice(-400) }));
}
export function getTask(id: string) { return tasks.get(id); }

export interface StartOpts { agent?: AgentKind; title: string; prompt: string; clipId?: string; commentIds?: string[]; images?: string[] }

export function startTask(o: StartOpts): Task {
  const t: Task = {
    id: 't' + nid(), agent: o.agent || getSettings().defaultAgent, title: o.title, prompt: o.prompt, clipId: o.clipId, commentIds: o.commentIds || [],
    status: 'queued', events: [], createdAt: new Date().toISOString(),
  };
  tasks.set(t.id, t);
  pushEvent(t, { kind: 'user', text: o.prompt });
  emitTask(t);
  queue.push({ taskId: t.id, prompt: o.prompt, images: o.images || [] });
  pump();
  return t;
}

/** follow-up message in the same agent session */
export function followUp(taskId: string, prompt: string, images: string[] = []) {
  const t = tasks.get(taskId);
  if (!t) throw new Error('task not found');
  if (t.status === 'running' || t.status === 'queued') throw new Error('task is still running');
  t.status = 'queued';
  pushEvent(t, { kind: 'user', text: prompt });
  emitTask(t);
  queue.push({ taskId, prompt, images });
  pump();
  return t;
}

export function cancelTask(id: string) {
  const t = tasks.get(id);
  if (!t) return;
  const qi = queue.findIndex((q) => q.taskId === id);
  if (qi >= 0) queue.splice(qi, 1);
  const p = procs.get(id);
  if (p) { p.kill('SIGTERM'); setTimeout(() => p.kill('SIGKILL'), 3000); }
  t.status = 'cancelled';
  t.endedAt = new Date().toISOString();
  pushEvent(t, { kind: 'status', text: 'cancelled' });
  emitTask(t);
}

function pump() {
  while (procs.size < getSettings().parallelTasks && queue.length) {
    const next = queue.shift()!;
    const t = tasks.get(next.taskId);
    if (!t || t.status === 'cancelled') continue;
    void runTask(t, next.prompt, next.images);
  }
}

function mcpConfigFile(taskId: string) {
  const f = cur().p('.studio', 'tasks', `${taskId}.mcp.json`);
  writeJson(f, { mcpServers: { studio: { command: process.execPath, args: [MCP_STDIO], env: { STUDIO_URL: BASE_URL, STUDIO_TASK: taskId } } } });
  return f;
}

function scopePaths(t: Task) {
  return t.clipId ? [`clips/${t.clipId}`, 'project.json', 'comments.json', 'music'] : ['-A'];
}

async function runTask(t: Task, prompt: string, images: string[]) {
  const store = cur();
  const settings = getSettings();
  t.status = 'running';
  t.startedAt = t.startedAt || new Date().toISOString();
  t.commitBefore = t.commitBefore || (await commit(store.dir, 'Snapshot before agent task: ' + t.title)) || undefined;
  emitTask(t);

  let cmd: string, args: string[];
  const env = { ...process.env, STUDIO_URL: BASE_URL, STUDIO_TASK: t.id };
  if (t.agent === 'claude') {
    cmd = 'claude';
    args = ['-p', prompt, '--output-format', 'stream-json', '--verbose',
      '--mcp-config', mcpConfigFile(t.id),
      '--permission-mode', settings.permissionMode,
      '--allowedTools', 'mcp__studio', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'TodoWrite', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(node:*)', 'Bash(ffprobe:*)', 'Bash(git log:*)', 'Bash(git diff:*)',
      '--add-dir', GALLERY_DIR, LIBRARY_DIR,
      '--append-system-prompt', SYSTEM_PROMPT];
    if (settings.claudeModel) args.push('--model', settings.claudeModel);
    if (t.sessionId) args.push('--resume', t.sessionId);
    if (images.length) args[1] = prompt + '\n\nAttached images (Read them): ' + images.join(', ');
  } else {
    cmd = 'codex';
    const common = ['--json', '--skip-git-repo-check', '-s', 'workspace-write',
      '-c', `mcp_servers.studio.command=${JSON.stringify(process.execPath)}`,
      '-c', `mcp_servers.studio.args=[${JSON.stringify(MCP_STDIO)}]`,
      '-c', `mcp_servers.studio.env={STUDIO_URL=${JSON.stringify(BASE_URL)},STUDIO_TASK=${JSON.stringify(t.id)}}`,
      '-c', 'mcp_servers.studio.startup_timeout_sec=30',
      '-c', 'mcp_servers.studio.tool_timeout_sec=600',
      '-c', 'mcp_servers.studio.default_tools_approval_mode="approve"',
      '-c', `sandbox_workspace_write.writable_roots=[${JSON.stringify(store.dir)}]`];
    if (settings.codexModel) common.push('-m', settings.codexModel);
    for (const img of images) common.push('-i', img);
    const full = SYSTEM_PROMPT + '\n\n---\n\n' + prompt;
    args = t.sessionId ? ['exec', ...common, 'resume', t.sessionId, full] : ['exec', ...common, '-C', store.dir, full];
  }

  pushEvent(t, { kind: 'status', text: `${t.agent} started${t.sessionId ? ' (resumed)' : ''}` });
  let proc: ChildProcess;
  try {
    proc = spawn(cmd, args, { cwd: store.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return finish(t, 'error', (e as Error).message);
  }
  procs.set(t.id, proc);
  let stderr = '';
  proc.stderr!.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
  const rl = readline.createInterface({ input: proc.stdout! });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg: any;
    try { msg = JSON.parse(line); } catch { pushEvent(t, { kind: 'text', text: line }); return; }
    try { (t.agent === 'claude' ? parseClaude : parseCodex)(t, msg); } catch (e) { /* ignore parse issues */ }
  });
  proc.on('error', (e) => { pushEvent(t, { kind: 'error', text: `Failed to start ${cmd}: ${e.message}. Is it installed and logged in?` }); });
  proc.on('close', async (code) => {
    procs.delete(t.id);
    if (t.status === 'cancelled') { await afterRun(t); pump(); return; }
    const failed = code !== 0 && !t.events.some((e) => e.kind === 'result' && e.ok !== false);
    if (failed) pushEvent(t, { kind: 'error', text: `${cmd} exited with code ${code}\n${stderr.slice(-3000)}` });
    await finish(t, failed ? 'error' : 'done');
    pump();
  });
}

async function afterRun(t: Task) {
  const store = cur();
  const sha = await commit(store.dir, `agent(${t.agent}): ${t.title}\n\nTask: ${t.id}`, scopePaths(t));
  if (sha && sha !== t.commitBefore) t.commitAfter = sha;
  // comments left unresolved by a finished task go back to draft so they can be re-sent
  const unresolved = store.comments.filter((c) => t.commentIds.includes(c.id) && c.status === 'sent');
  if (unresolved.length && t.status !== 'running') {
    await store.updateComments((list) => { for (const c of list) if (t.commentIds.includes(c.id) && c.status === 'sent') { c.status = 'draft'; c.resolution = 'Agent finished without resolving this comment.'; } });
  }
}

async function finish(t: Task, status: 'done' | 'error', err?: string) {
  if (err) pushEvent(t, { kind: 'error', text: err });
  t.status = status;
  t.endedAt = new Date().toISOString();
  await afterRun(t);
  pushEvent(t, { kind: 'status', text: status === 'done' ? `finished${t.commitAfter ? ' · version ' + t.commitAfter : ''}` : 'failed' });
  emitTask(t);
}

function short(v: unknown, n = 600) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '…' : s;
}

function parseClaude(t: Task, m: any) {
  if (m.type === 'system' && m.subtype === 'init') { if (m.session_id) t.sessionId = m.session_id; return; }
  if (m.type === 'assistant') {
    for (const c of m.message?.content || []) {
      if (c.type === 'text' && c.text?.trim()) pushEvent(t, { kind: 'text', text: c.text });
      else if (c.type === 'thinking' && c.thinking?.trim()) pushEvent(t, { kind: 'thinking', text: c.thinking });
      else if (c.type === 'tool_use') pushEvent(t, { kind: 'tool', tool: String(c.name).replace(/^mcp__studio__/, 'studio.'), input: c.input, text: toolSummary(c.name, c.input) });
    }
    return;
  }
  if (m.type === 'user') {
    for (const c of m.message?.content || []) {
      if (c.type === 'tool_result') {
        const content = Array.isArray(c.content) ? c.content.map((x: any) => (x.type === 'text' ? x.text : x.type === 'image' ? '[image]' : '')).join('\n') : c.content;
        pushEvent(t, { kind: 'tool_result', ok: !c.is_error, text: short(content) });
      }
    }
    return;
  }
  if (m.type === 'result') {
    if (m.session_id) t.sessionId = m.session_id;
    if (typeof m.total_cost_usd === 'number') t.costUsd = (t.costUsd || 0) + m.total_cost_usd;
    pushEvent(t, { kind: 'result', ok: !m.is_error, text: m.result ? short(m.result, 4000) : m.subtype });
  }
}

function parseCodex(t: Task, m: any) {
  const type: string = m.type || m.msg?.type || '';
  if (type === 'thread.started' || type === 'session.created') { t.sessionId = m.thread_id || m.session_id || t.sessionId; return; }
  if (type === 'error' || type === 'turn.failed') { pushEvent(t, { kind: 'error', text: m.message || m.error?.message || JSON.stringify(m) }); return; }
  if (type === 'turn.completed') { pushEvent(t, { kind: 'result', ok: true, text: 'turn completed' + (m.usage ? ` · ${m.usage.input_tokens ?? '?'} in / ${m.usage.output_tokens ?? '?'} out tokens` : '') }); return; }
  const it = m.item;
  if (!it) return;
  const itype = it.type || it.item_type;
  if (type === 'item.started') {
    if (itype === 'command_execution') pushEvent(t, { kind: 'tool', tool: 'shell', text: it.command, input: { command: it.command } });
    else if (itype === 'mcp_tool_call') pushEvent(t, { kind: 'tool', tool: `${it.server}.${it.tool}`, input: it.arguments, text: toolSummary(it.tool, it.arguments) });
    return;
  }
  if (type === 'item.completed') {
    if (itype === 'agent_message' || itype === 'assistant_message') pushEvent(t, { kind: 'text', text: it.text });
    else if (itype === 'reasoning') pushEvent(t, { kind: 'thinking', text: it.text });
    else if (itype === 'command_execution') pushEvent(t, { kind: 'tool_result', ok: it.exit_code === 0, text: short(it.aggregated_output || '') });
    else if (itype === 'file_change') pushEvent(t, { kind: 'tool', tool: 'edit', text: (it.changes || []).map((c: any) => `${c.kind} ${c.path}`).join('\n') });
    else if (itype === 'mcp_tool_call') {
      const res = it.result?.content?.map((x: any) => (x.type === 'text' ? x.text : '[image]')).join('\n') || it.error?.message || '';
      pushEvent(t, { kind: 'tool_result', ok: !it.error && it.status !== 'failed', text: short(res) });
    } else if (itype === 'todo_list') pushEvent(t, { kind: 'thinking', text: (it.items || []).map((x: any) => `${x.completed ? '☑' : '☐'} ${x.text}`).join('\n') });
    else if (itype === 'error') pushEvent(t, { kind: 'error', text: it.message });
  }
}

function toolSummary(name: string, input: any): string {
  if (!input) return '';
  const n = String(name).replace(/^mcp__studio__/, '');
  if (input.file_path) return String(input.file_path).replace(cur().dir + '/', '');
  if (input.command) return String(input.command).slice(0, 200);
  if (input.pattern) return input.pattern;
  if (n === 'render_clip') return `${input.clipId}${input.times ? ' @ ' + input.times.join(', ') : ''}`;
  if (n === 'render_frame') return `t = ${(input.times || []).join(', ')}`;
  if (n === 'resolve_comment') return `${input.id}: ${input.note}`;
  return short(input, 160);
}

export function runningCount() { return procs.size; }
