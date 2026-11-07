import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AgentEvent, AgentKind, Task } from '../../shared/types.ts';
import { BASE_URL, MCP_STDIO, GALLERY_DIR, getSettings, LIBRARY_DIR } from '../config.ts';
import { cur, hasProject } from '../project.ts';
import { bus } from '../bus.ts';
import { nid, readJson, writeJson } from '../util.ts';
import { commit } from '../git.ts';
import { SYSTEM_PROMPT } from './prompts.ts';
import { denyTask } from '../permissions.ts';

const tasks = new Map<string, Task>();
/** running tasks: taskId → watcher (agents run detached; the server only tails their stream log) */
const live = new Map<string, { timer: NodeJS.Timeout; partial: string }>();
const queue: { taskId: string; prompt: string; images: string[] }[] = [];

function taskFile(id: string) { return cur().p('.studio', 'tasks', id + '.json'); }
function persist(t: Task) { if (hasProject()) writeJson(taskFile(t.id), t); }
const alive = (pid?: number) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e: any) { return e.code === 'EPERM'; } };
function emitTask(t: Task) { persist(t); bus.send({ type: 'task', task: { ...t, events: t.events.slice(-400) } }); }
function pushEvent(t: Task, ev: Omit<AgentEvent, 't'>) {
  const e: AgentEvent = { t: Date.now(), ...ev };
  if (e.text && e.text.length > 6000) e.text = e.text.slice(0, 6000) + '…';
  t.events.push(e);
  bus.send({ type: 'task-event', taskId: t.id, event: e });
}

export function loadTasks() {
  for (const w of live.values()) clearInterval(w.timer);
  live.clear();
  queue.length = 0;
  tasks.clear();
  const dir = cur().p('.studio', 'tasks');
  if (!fs.existsSync(dir)) return;
  const recover: Task[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f.endsWith('.mcp.json')) continue;
    const t = readJson<Task | null>(path.join(dir, f), null);
    if (!t || !t.id || !t.createdAt) continue;
    tasks.set(t.id, t);
    if (t.status === 'running' || t.status === 'queued') recover.push(t);
  }
  // continue where we left off: re-attach to live agents, finish or resume dead ones, re-queue waiting ones
  recover.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const t of recover) {
    if (t.status === 'queued' && t.pending) { queue.push({ taskId: t.id, prompt: t.pending.prompt, images: t.pending.images }); continue; }
    if (t.status === 'running' && t.logFile) {
      pushEvent(t, { kind: 'status', text: alive(t.pid) ? 'редактор перезапустился — агент продолжает работу' : 'редактор перезапускался — восстанавливаю задачу' });
      attach(t);
      continue;
    }
    t.status = 'cancelled';
    persist(t);
  }
  setTimeout(pump, 500);
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
  t.pending = { prompt: o.prompt, images: o.images || [] };
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
  t.pending = { prompt, images };
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
  if (t.pid && alive(t.pid)) {
    const pid = t.pid;
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
    setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch {} }, 3000);
  }
  t.status = 'cancelled';
  t.pending = undefined;
  t.endedAt = new Date().toISOString();
  denyTask(id);
  pushEvent(t, { kind: 'status', text: 'cancelled' });
  emitTask(t);
}

function pump() {
  while (live.size < getSettings().parallelTasks && queue.length) {
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
  // MCP_TOOL_TIMEOUT: permission prompts wait for a human in the editor
  const env = { ...process.env, STUDIO_URL: BASE_URL, STUDIO_TASK: t.id, MCP_TOOL_TIMEOUT: '3600000' };
  if (t.agent === 'claude') {
    cmd = 'claude';
    args = ['-p', prompt, '--output-format', 'stream-json', '--verbose',
      '--mcp-config', mcpConfigFile(t.id),
      '--permission-mode', settings.permissionMode,
      '--permission-prompt-tool', 'mcp__studio__approve_permission',
      '--allowedTools', 'mcp__studio', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'TodoWrite', 'WebFetch', 'WebSearch', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(file:*)', 'Bash(find:*)', 'Bash(mdfind:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(mkdir:*)', 'Bash(cp:*)', 'Bash(mv:*)', 'Bash(node:*)', 'Bash(python3:*)', 'Bash(curl:*)', 'Bash(ffprobe:*)', 'Bash(ffmpeg:*)', 'Bash(git log:*)', 'Bash(git diff:*)', 'Bash(git show:*)',
      '--add-dir', GALLERY_DIR, LIBRARY_DIR,
      '--append-system-prompt', SYSTEM_PROMPT];
    if (settings.claudeModel) args.push('--model', settings.claudeModel);
    if (t.sessionId) args.push('--resume', t.sessionId);
    if (images.length) args[1] = prompt + '\n\nAttached images (Read them): ' + images.join(', ');
  } else {
    cmd = 'codex';
    const access = settings.permissionMode === 'bypassPermissions'
      ? ['--dangerously-bypass-approvals-and-sandbox']
      : ['--approve-for-me', '-c', 'sandbox_workspace_write.network_access=true'];
    const common = ['--json', '--skip-git-repo-check', ...access,
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
  // the agent runs detached and streams into a log file, so it survives editor restarts
  const logFile = store.p('.studio', 'tasks', `${t.id}.log`);
  const errFile = store.p('.studio', 'tasks', `${t.id}.err`);
  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(errFile, 'a');
  t.logFile = logFile;
  t.logOffset = fs.statSync(logFile).size;
  t.pending = undefined;
  try {
    const proc = spawn(cmd, args, { cwd: store.dir, env, stdio: ['ignore', out, err], detached: true });
    proc.on('error', (e) => { pushEvent(t, { kind: 'error', text: `Failed to start ${cmd}: ${e.message}. Is it installed and logged in?` }); });
    t.pid = proc.pid;
    proc.unref();
  } catch (e) {
    fs.closeSync(out); fs.closeSync(err);
    return finish(t, 'error', (e as Error).message);
  }
  fs.closeSync(out); fs.closeSync(err);
  emitTask(t);
  attach(t);
}

/** tail the agent's stream log from the persisted offset; finish or resume when the process ends */
function attach(t: Task) {
  if (live.has(t.id)) return;
  const w = { partial: '', timer: null as unknown as NodeJS.Timeout };
  let lastPersist = 0;
  const drain = () => {
    if (!t.logFile || !fs.existsSync(t.logFile)) return;
    const size = fs.statSync(t.logFile).size;
    if (size <= (t.logOffset || 0)) return;
    const fd = fs.openSync(t.logFile, 'r');
    const buf = Buffer.alloc(size - (t.logOffset || 0));
    fs.readSync(fd, buf, 0, buf.length, t.logOffset || 0);
    fs.closeSync(fd);
    const text = w.partial + buf.toString('utf8');
    const lines = text.split('\n');
    w.partial = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: any;
      try { msg = JSON.parse(line); } catch { pushEvent(t, { kind: 'text', text: line }); continue; }
      try { (t.agent === 'claude' ? parseClaude : parseCodex)(t, msg); } catch { /* ignore */ }
    }
    // offset = bytes fully consumed (complete lines)
    t.logOffset = size - Buffer.byteLength(w.partial, 'utf8');
    if (Date.now() - lastPersist > 1000) { persist(t); lastPersist = Date.now(); }
  };
  const tick = async () => {
    drain();
    if (alive(t.pid)) return;
    // process gone: final drain, then decide
    clearInterval(w.timer);
    drain();
    live.delete(t.id);
    denyTask(t.id);
    if (t.status === 'cancelled') { await afterRun(t); emitTask(t); pump(); return; }
    const completed = t.events.some((e) => e.kind === 'result' && e.ok !== false && e.t >= Date.parse(t.startedAt || '0'));
    const resultEvents = t.events.filter((e) => e.kind === 'result');
    const lastResult = resultEvents[resultEvents.length - 1];
    const finishedThisRun = completed && lastResult && t.events.lastIndexOf(lastResult) > t.events.map((e) => e.kind).lastIndexOf('user');
    if (finishedThisRun) { await finish(t, 'done'); pump(); return; }
    // died mid-run (e.g. machine/editor restart): resume the same session a couple of times
    const errTail = (() => { try { return fs.readFileSync(t.logFile!.replace(/\.log$/, '.err'), 'utf8').slice(-2000); } catch { return ''; } })();
    if ((t.resumes || 0) < 2 && t.sessionId) {
      t.resumes = (t.resumes || 0) + 1;
      pushEvent(t, { kind: 'status', text: 'агент был прерван — продолжаю в той же сессии' });
      t.status = 'queued';
      const prompt = 'Работа была прервана (перезапуск редактора). Проверь текущее состояние проекта (get_script, get_project, файлы) и продолжи задачу с того места, где остановился. Не переделывай уже сделанное.';
      t.pending = { prompt, images: [] };
      emitTask(t);
      queue.unshift({ taskId: t.id, prompt, images: [] });
      pump();
      return;
    }
    pushEvent(t, { kind: 'error', text: `${t.agent} завершился без результата${errTail ? '\n' + errTail : ''}` });
    await finish(t, 'error');
    pump();
  };
  w.timer = setInterval(() => { void tick(); }, 300);
  live.set(t.id, w);
  t.status = 'running';
  emitTask(t);
  void tick();
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
      else if (c.type === 'tool_use') {
        pushEvent(t, { kind: 'tool', tool: String(c.name).replace(/^mcp__studio__/, 'studio.'), input: c.input, text: toolSummary(c.name, c.input) });
        setFocus(t.id, focusFromTool(c.name, c.input));
      }
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
    else if (itype === 'mcp_tool_call') { pushEvent(t, { kind: 'tool', tool: `${it.server}.${it.tool}`, input: it.arguments, text: toolSummary(it.tool, it.arguments) }); setFocus(t.id, focusFromTool(it.tool, it.arguments)); }
    return;
  }
  if (type === 'item.completed') {
    if (itype === 'agent_message' || itype === 'assistant_message') pushEvent(t, { kind: 'text', text: it.text });
    else if (itype === 'reasoning') pushEvent(t, { kind: 'thinking', text: it.text });
    else if (itype === 'command_execution') pushEvent(t, { kind: 'tool_result', ok: it.exit_code === 0, text: short(it.aggregated_output || '') });
    else if (itype === 'file_change') { pushEvent(t, { kind: 'tool', tool: 'edit', text: (it.changes || []).map((c: any) => `${c.kind} ${c.path}`).join('\n') }); const c0 = (it.changes || [])[0]; if (c0) setFocus(t.id, focusFromPath(String(c0.path))); }
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

export function runningCount() { return live.size; }

/** attach an event (e.g. a rendered frame) to a task from outside the stream (MCP bridge) */
export function taskEvent(taskId: string, ev: Omit<AgentEvent, 't'>) {
  const t = tasks.get(taskId);
  if (!t) return;
  pushEvent(t, ev);
  persist(t);
}

/** remember what the agent is working on; the UI follows it */
export function setFocus(taskId: string, focus: Task['focus']) {
  const t = tasks.get(taskId);
  if (!t || !focus) return;
  if (t.focus && t.focus.kind === focus.kind && t.focus.id === focus.id) { t.focus.at = focus.at; return; }
  t.focus = focus;
  emitTask(t);
}

function focusFromPath(p: string): Task['focus'] | undefined {
  const m = /(?:^|\/)(clips|music)\/([^/]+)\//.exec(p);
  if (m) return { kind: m[1] === 'clips' ? 'clip' : 'music', id: m[2], at: Date.now() };
  if (/(?:^|\/)project\.json$/.test(p)) return { kind: 'timeline', at: Date.now() };
  if (/(?:^|\/)script\.json$/.test(p)) return { kind: 'script', at: Date.now() };
  if (/(?:^|\/)design\.json$/.test(p)) return { kind: 'design', at: Date.now() };
  return undefined;
}
function focusFromTool(name: string, input: any): Task['focus'] | undefined {
  const n = String(name).replace(/^(mcp__studio__|studio\.)/, '');
  if (input?.file_path) return focusFromPath(String(input.file_path));
  if (input?.clipId) return { kind: 'clip', id: input.clipId, at: Date.now() };
  if (input?.musicId) return { kind: 'music', id: input.musicId, at: Date.now() };
  if (n.startsWith('timeline_') || n === 'use_template') return { kind: 'timeline', at: Date.now() };
  if (n === 'update_scene') return { kind: 'script', id: input?.id, at: Date.now() };
  if (n.includes('script')) return { kind: 'script', at: Date.now() };
  if (n.includes('design')) return { kind: 'design', at: Date.now() };
  return undefined;
}
