import type { PermissionRequest } from '../shared/types.ts';
import { bus } from './bus.ts';
import { nid } from './util.ts';

/**
 * Permission prompts forwarded from agents (Claude's --permission-prompt-tool → studio MCP → here → UI).
 * The MCP tool creates a request and polls until the user decides in the editor.
 */
type Decision = { allow: boolean; message?: string };
const pending = new Map<string, PermissionRequest>();
const decided = new Map<string, Decision>();
const autoAllow = new Set<string>();

function emit() { bus.send({ type: 'permissions', permissions: list() }); }
export function list() { return [...pending.values()]; }

export function request(taskId: string, tool: string, input: unknown): { id: string; decision?: Decision } {
  const id = 'p' + nid();
  if (taskId && autoAllow.has(taskId)) { decided.set(id, { allow: true }); return { id, decision: decided.get(id) }; }
  pending.set(id, { id, taskId, tool, input, createdAt: new Date().toISOString() });
  emit();
  return { id };
}

export function poll(id: string): Decision | null | 'unknown' {
  if (decided.has(id)) return decided.get(id)!;
  return pending.has(id) ? null : 'unknown';
}

export function decide(id: string, allow: boolean, opts: { always?: boolean; message?: string } = {}) {
  const req = pending.get(id);
  if (!req) return false;
  pending.delete(id);
  decided.set(id, { allow, message: opts.message || (allow ? undefined : 'The user denied this action in the editor. Find another way or explain what you need.') });
  if (allow && opts.always && req.taskId) {
    autoAllow.add(req.taskId);
    for (const other of [...pending.values()]) if (other.taskId === req.taskId) { pending.delete(other.id); decided.set(other.id, { allow: true }); }
  }
  emit();
  return true;
}

/** deny everything still pending for a task (on cancel / exit) */
export function denyTask(taskId: string) {
  let changed = false;
  for (const r of [...pending.values()]) if (r.taskId === taskId) { pending.delete(r.id); decided.set(r.id, { allow: false, message: 'Task was stopped.' }); changed = true; }
  autoAllow.delete(taskId);
  if (changed) emit();
}
