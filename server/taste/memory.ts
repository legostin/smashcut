/**
 * Taste memory: the agents learn the user's personal taste from what the user actually does (picks in ask_user,
 * scene approvals / rejections, frame comments and board notes, reverting agent work, 👍/👎 on finished tasks).
 *
 * Global (all projects), in the studio home dir:
 *   taste.md          — the distilled profile (≤ ~40 concrete bullets, each with its evidence count)
 *   taste-log.jsonl   — raw signals (bounded: the last 500)
 *   taste-state.json  — sequence counter + the last distilled event
 *
 * Every few new signals a one-shot cheap model call (claude haiku, no tools / MCP / hooks; else codex) merges them
 * into the profile. tastePrompt() is appended to every agent's system prompt (and read by the art-director critic).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HOME_DIR, getSettings } from '../config.ts';
import { cur, hasProject } from '../project.ts';
import { which, resolveCmd } from '../bin.ts';

export type TasteEventKind = 'choice' | 'approve' | 'reject' | 'comment' | 'rating' | 'revert' | 'edit';
export interface TasteEvent { seq: number; t: string; kind: TasteEventKind; text: string; sceneId?: string; image?: string; project?: string; projectId?: string; key?: string }
interface TasteState { seq: number; distilledSeq: number; distilledAt?: string; lastError?: string; failedAt?: number }

const PROFILE_FILE = () => path.join(HOME_DIR, 'taste.md');
const LOG_FILE = () => path.join(HOME_DIR, 'taste-log.jsonl');
const STATE_FILE = () => path.join(HOME_DIR, 'taste-state.json');
const MAX_LOG = 500;
/** new signals that trigger an automatic distillation */
const AUTO_AFTER = 6;
/** wait for a burst of signals to settle before distilling */
const DEBOUNCE_MS = Number(process.env.STUDIO_TASTE_DEBOUNCE_MS) || 20_000;
/** after a failed automatic run, don't retry for a while */
const RETRY_MS = 10 * 60_000;
const MAX_PROFILE_BYTES = 6 * 1024;

function readState(): TasteState {
  try { return { seq: 0, distilledSeq: 0, ...JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8')) }; } catch { return { seq: 0, distilledSeq: 0 }; }
}
function writeState(s: TasteState) { writeAtomic(STATE_FILE(), JSON.stringify(s, null, 2)); }
function writeAtomic(file: string, data: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function readLog(): TasteEvent[] {
  let raw = '';
  try { raw = fs.readFileSync(LOG_FILE(), 'utf8'); } catch { return []; }
  const out: TasteEvent[] = [];
  for (const line of raw.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ } }
  return out;
}

/** record one signal (adds project + timestamp); never throws. `key`: a newer signal replaces a not-yet-distilled one with the same key (re-rating a task) */
export function recordTaste(ev: { kind: TasteEventKind; text: string; sceneId?: string; image?: string; key?: string }): void {
  try {
    const text = String(ev?.text || '').replace(/\s+\n/g, '\n').trim();
    if (!text) return;
    const st = readState();
    let project: string | undefined, projectId: string | undefined;
    try { if (hasProject()) { const s = cur(); project = s.project?.name || undefined; projectId = s.id || undefined; } } catch { /* no project context */ }
    const e: TasteEvent = {
      seq: st.seq + 1, t: new Date().toISOString(), kind: ev.kind, text: text.slice(0, 1500),
      ...(ev.sceneId ? { sceneId: ev.sceneId } : {}), ...(ev.image ? { image: ev.image } : {}),
      ...(project ? { project } : {}), ...(projectId ? { projectId } : {}), ...(ev.key ? { key: ev.key } : {}),
    };
    fs.mkdirSync(HOME_DIR, { recursive: true });
    if (ev.key && readLog().some((x) => x.key === ev.key && x.seq > st.distilledSeq)) {
      writeAtomic(LOG_FILE(), [...readLog().filter((x) => !(x.key === ev.key && x.seq > st.distilledSeq)), e].map((x) => JSON.stringify(x)).join('\n') + '\n');
    } else fs.appendFileSync(LOG_FILE(), JSON.stringify(e) + '\n');
    st.seq = e.seq;
    writeState(st);
    // keep the log bounded (trim in batches so we don't rewrite it on every event)
    const log = readLog();
    if (log.length > MAX_LOG + 50) writeAtomic(LOG_FILE(), log.slice(-MAX_LOG).map((x) => JSON.stringify(x)).join('\n') + '\n');
    scheduleAuto();
  } catch { /* taste memory must never break the editor */ }
}

/** the current profile markdown ('' if none) */
export function tasteProfile(): string {
  try { return fs.readFileSync(PROFILE_FILE(), 'utf8').trim(); } catch { return ''; }
}

/** the block for the agents' system prompt ('' if there is no profile yet) */
export function tastePrompt(): string {
  const p = tasteProfile();
  if (!p) return '';
  return `\n\nTHE USER'S TASTE (learned from their choices, approvals, rejections, notes and ratings across projects — apply it by default when you make visual, motion, pacing and editing decisions; explicit requests in this task, the user's standing instructions and the project's own script / design system win on conflict):\n${p}`;
}

// ---------- distillation ----------
let running: Promise<{ profile: string; events: number }> | null = null;
let timer: NodeJS.Timeout | null = null;

function pendingEvents(st = readState()) { return readLog().filter((e) => e.seq > st.distilledSeq); }

function scheduleAuto() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const st = readState();
    if (running || st.failedAt && Date.now() - st.failedAt < RETRY_MS) return;
    if (pendingEvents(st).length >= AUTO_AFTER) distillTaste(false).catch(() => {});
  }, DEBOUNCE_MS);
  timer.unref?.();
}

/** counts + profile for the settings UI */
export function tasteStatus() {
  const st = readState();
  const log = readLog();
  return { profile: tasteProfile(), events: log.length, pending: log.filter((e) => e.seq > st.distilledSeq).length, distilledAt: st.distilledAt, lastError: st.lastError, running: !!running };
}

/** the user edited the profile by hand */
export function saveTasteProfile(md: string) {
  const text = String(md || '').trim();
  if (Buffer.byteLength(text) > MAX_PROFILE_BYTES * 2) throw Object.assign(new Error('Profile is too long'), { statusCode: 400 });
  fs.mkdirSync(HOME_DIR, { recursive: true });
  if (text) writeAtomic(PROFILE_FILE(), text + '\n'); else fs.rmSync(PROFILE_FILE(), { force: true });
  return tasteStatus();
}

/** forget everything learned: profile, log, state */
export function forgetTaste() {
  for (const f of [PROFILE_FILE(), LOG_FILE()]) fs.rmSync(f, { force: true });
  const st = readState();
  writeState({ seq: st.seq, distilledSeq: st.seq });
  return tasteStatus();
}

/** a scene's status changed by the user: approved → approve; finished work sent back → reject */
export function sceneTaste(prev: { id: string; title?: string; visual?: string; status?: string } | undefined, next: { status?: string } | undefined) {
  if (!prev || !next?.status || next.status === prev.status) return;
  const what = `scene “${prev.title || prev.id}”${prev.visual ? ` (visual: ${String(prev.visual).slice(0, 400)})` : ''}`;
  if (next.status === 'approved') recordTaste({ kind: 'approve', text: `The user approved ${what}.`, sceneId: prev.id });
  else if (['done', 'review', 'approved'].includes(prev.status || '') && ['todo', 'doing'].includes(next.status)) recordTaste({ kind: 'reject', text: `The user sent ${what} back to “${next.status}” (it was “${prev.status}”) — they did not like the result.`, sceneId: prev.id });
}

const DISTILL_RULES = `You maintain a short taste profile of ONE video editor user, learned from what they actually do in an AI video editor (Smashcut): which draft they pick when an agent asks, which scenes they approve or send back, their notes on frames, the agent work they revert, their 👍/👎 ratings, and the changes they make BY HAND after the agent (edits: the direction of the change — shorter, bigger, a different colour or font, less motion — is the strongest evidence of what they want; count them as "edits").

Update the profile with the NEW SIGNALS below. Rules:
- Only concrete, reusable visual / motion / typography / colour / pacing / editing / sound preferences ("prefers hard cuts on the downbeat", "dislikes neon glow and bouncy text").
- Each bullet ends with its evidence, e.g. "— 3 picks", "— 2 rejections, 1 note", counting the signals that support it, summed per kind ("2 notes", never "1 note, 1 note"); add to the counts already in the profile.
- Merge with existing bullets — never append duplicates or near-duplicates; reword a bullet when the new evidence sharpens it.
- Drop one-off, project-specific content wishes (a particular brand name, a specific line of copy, "make scene 3 shorter") unless they reveal a general preference.
- When signals conflict, keep one bullet saying it depends (and on what, if the signals show it).
- A bare approval or a 👍 without detail is weak evidence: only use it together with what was approved.
- Never invent preferences that the signals don't support. If the new signals teach nothing general, return the current profile unchanged.
- Group bullets under a few short "## " headings (e.g. Look, Motion, Type & colour, Pacing & edit, Sound). At most 40 bullet lines in total; drop the weakest when over.
- Output ONLY the updated profile in Markdown — no preamble, no explanations, no code fences.`;

function buildPrompt(profile: string, events: TasteEvent[]) {
  const lines = events.map((e) => `- [${e.kind}]${e.project ? ` (project “${e.project}”)` : ''} ${e.text.replace(/\n+/g, ' ')}${e.image ? ` [draft image: ${e.image}]` : ''}`);
  return `${DISTILL_RULES}\n\nCURRENT PROFILE:\n${profile || '(empty — no profile yet)'}\n\nNEW SIGNALS (oldest first):\n${lines.join('\n')}\n\nThe updated profile:`;
}

/** run a one-shot, tool-less model call; resolves with its text output */
function oneShot(prompt: string): Promise<string> {
  const settings = getSettings();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'smashcut-taste-'));
  let cmd: string, args: string[], outFile = '';
  if (which('claude') || !which('codex')) {
    cmd = 'claude';
    args = ['-p', '--model', 'haiku', '--output-format', 'text', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project,local', '--no-session-persistence', '--disable-slash-commands'];
  } else {
    cmd = 'codex';
    outFile = path.join(cwd, 'out.md');
    args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-c', 'model_reasoning_effort="low"', '-o', outFile, ...(settings.codexModel ? ['-m', settings.codexModel] : []), '-'];
  }
  return new Promise((resolve, reject) => {
    const p = spawn(resolveCmd(cmd), args, { cwd, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} }, 180_000);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(kill); reject(e); });
    p.on('close', (code) => {
      clearTimeout(kill);
      let text = out;
      if (outFile) { try { text = fs.readFileSync(outFile, 'utf8'); } catch { text = ''; } }
      fs.rmSync(cwd, { recursive: true, force: true });
      if (code !== 0) return reject(new Error(`${cmd} exited ${code}: ${(err || out).slice(-400)}`));
      resolve(text);
    });
    p.stdin.end(prompt);
  });
}

/** sanity-check the model output; returns the cleaned profile or null */
function validProfile(raw: string): string | null {
  let s = String(raw || '').trim();
  const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i.exec(s);
  if (fence) s = fence[1].trim();
  if (!s || Buffer.byteLength(s) > MAX_PROFILE_BYTES) return null;
  const lines = s.split('\n');
  const bullets = lines.filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
  if (!bullets || bullets > 50 || lines.length > 80) return null;
  if (/^(i |i'm|sorry|here is|here's)/i.test(s)) return null;
  return s;
}

/** fold the new signals into the profile (force: on demand, even below the automatic threshold) */
export function distillTaste(force = false): Promise<{ profile: string; events: number }> {
  if (running) return running;
  running = (async () => {
    const st = readState();
    const events = pendingEvents(st);
    const profile = tasteProfile();
    if (!events.length || (!force && events.length < AUTO_AFTER)) return { profile, events: 0 };
    const batch = events.slice(-150);
    try {
      const next = validProfile(await oneShot(buildPrompt(profile, batch)));
      if (!next) throw new Error('the model returned an unusable profile');
      writeAtomic(PROFILE_FILE(), next + '\n');
      const now = readState();
      writeState({ ...now, distilledSeq: Math.max(now.distilledSeq, events[events.length - 1].seq), distilledAt: new Date().toISOString(), lastError: undefined, failedAt: undefined });
      return { profile: next, events: batch.length };
    } catch (e) {
      const now = readState();
      writeState({ ...now, lastError: (e as Error).message.slice(0, 500), failedAt: Date.now() });
      if (force) throw e;
      return { profile, events: 0 };
    }
  })().finally(() => { running = null; });
  return running;
}
