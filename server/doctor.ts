import { blenderVersion } from './blender.ts';
// First-run doctor: everything the editor needs from the machine, as [{id, title, status, detail, fix}].
// Cheap checks only — no model calls (agent logins are read from the CLIs' own status commands / credential files).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DoctorCheck } from '../shared/types.ts';
import { binInfo, which, type BinName } from './bin.ts';
import { findBrowser, browserInstalling, lastLaunchError } from './render/browser.ts';
import { PORT, HOST, PROJECTS_DIR, HOME_DIR, BROWSERS_DIR } from './config.ts';

const mac = process.platform === 'darwin';

function exec(cmd: string, args: string[], timeoutMs = 6000): Promise<{ code: number | null; out: string; err?: string }> {
  return new Promise((resolve) => {
    let out = '', done = false;
    const finish = (r: { code: number | null; out: string; err?: string }) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    let p: ReturnType<typeof spawn>;
    try { p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); } catch (e) { return resolve({ code: null, out: '', err: String(e) }); }
    const t = setTimeout(() => { p.kill('SIGKILL'); finish({ code: null, out, err: 'timeout' }); }, timeoutMs);
    p.stdout!.on('data', (d) => (out += d));
    p.stderr!.on('data', (d) => (out += d));
    p.on('error', (e) => finish({ code: null, out, err: e.message }));
    p.on('close', (code) => finish({ code, out }));
  });
}
const firstLine = (s: string) => s.trim().split('\n')[0]?.trim() || '';

function nodeCheck(): DoctorCheck {
  const major = Number(process.versions.node.split('.')[0]);
  return major >= 20
    ? { id: 'node', title: 'Node.js', status: 'ok', detail: `v${process.versions.node}` }
    : { id: 'node', title: 'Node.js', status: 'missing', detail: `v${process.versions.node} — 20 or newer is required`, fix: 'Install Node.js 20+ (https://nodejs.org or `brew install node`)' };
}

async function ffCheck(name: BinName): Promise<DoctorCheck> {
  const b = binInfo(name);
  const title = name === 'ffmpeg' ? 'ffmpeg (export, media)' : 'ffprobe (media info)';
  if (!b.path) return { id: name, title, status: 'missing', detail: `${name} not found on PATH and the bundled fallback is not installed`, fix: mac ? 'brew install ffmpeg' : 'sudo apt install ffmpeg   (or your distro’s package manager)' };
  const r = await exec(b.path, ['-hide_banner', '-version']);
  const ver = /version\s+(\S+)/.exec(r.out)?.[1] || '?';
  if (r.code !== 0) return { id: name, title, status: 'missing', detail: `${b.path} does not run: ${firstLine(r.out || r.err || '')}`, fix: mac ? 'brew install ffmpeg' : 'sudo apt install ffmpeg' };
  const src = b.source === 'bundled' ? 'bundled npm build' : b.source === 'env' ? 'from env' : 'system';
  return { id: name, title, status: 'ok', detail: `${ver} (${src}) — ${b.path}` };
}

async function gitCheck(): Promise<DoctorCheck> {
  const g = which('git');
  const r = g ? await exec(g, ['--version']) : null;
  if (!r || r.code !== 0) return { id: 'git', title: 'git (project versions)', status: 'missing', detail: 'git not found — projects are git repositories (versions, undo of agent work)', fix: mac ? 'xcode-select --install   (or `brew install git`)' : 'sudo apt install git' };
  return { id: 'git', title: 'git (project versions)', status: 'ok', detail: firstLine(r.out).replace(/^git version /, '') };
}

function browserCheck(): DoctorCheck {
  const title = 'Chromium (frame rendering)';
  const b = findBrowser();
  if (b.source !== 'missing') {
    if (lastLaunchError) return { id: 'browser', title, status: 'missing', detail: `${b.detail} failed to start: ${lastLaunchError}`, fix: process.platform === 'linux' ? 'sudo npx playwright-core install-deps chromium-headless-shell' : 'Install Google Chrome, or set STUDIO_CHROMIUM=/path/to/chrome' };
    return { id: 'browser', title, status: 'ok', detail: b.source === 'system' ? `system Chrome — ${b.detail}` : b.detail };
  }
  if (browserInstalling) return { id: 'browser', title, status: 'warn', detail: `downloading Chrome Headless Shell into ${BROWSERS_DIR}…`, fix: 'Wait for the download to finish (progress is in the console)' };
  return { id: 'browser', title, status: 'warn', detail: 'no Chrome/Chromium found — Chrome Headless Shell (~100 MB) is downloaded automatically when the editor starts', fix: `npx agent-videostudio   (or: PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_DIR} npx playwright-core install chromium-headless-shell)` };
}

async function claudeCheck(): Promise<DoctorCheck & { _present: boolean }> {
  const id = 'claude', title = 'Claude Code CLI (agent)';
  const exe = which('claude');
  const v = exe ? await exec(exe, ['--version']) : null;
  if (!v || v.code !== 0) return { _present: false, id, title, status: 'missing', detail: 'claude not found on PATH', fix: 'npm i -g @anthropic-ai/claude-code   (or: curl -fsSL https://claude.ai/install.sh | bash), then run `claude` once to log in' };
  const ver = firstLine(v.out);
  // `claude auth status --json` is a local status read (no model call)
  const s = await exec(exe!, ['auth', 'status', '--json']);
  let logged: boolean | null = null, how = '';
  try { const j = JSON.parse(s.out.slice(s.out.indexOf('{'))); logged = !!j.loggedIn; how = j.authMethod || ''; } catch {}
  if (logged == null) {
    // older CLIs: look for stored credentials instead
    logged = !!process.env.ANTHROPIC_API_KEY || fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'))
      || (mac && (await exec('security', ['find-generic-password', '-s', 'Claude Code-credentials'], 3000)).code === 0);
    how = logged ? 'stored credentials' : '';
  }
  return logged
    ? { _present: true, id, title, status: 'ok', detail: `${ver}${how ? ` — logged in (${how})` : ' — logged in'}` }
    : { _present: true, id, title, status: 'warn', detail: `${ver} — not logged in`, fix: 'claude auth login   (or run `claude` and follow the login prompt)' };
}

async function codexCheck(): Promise<DoctorCheck & { _present: boolean }> {
  const id = 'codex', title = 'Codex CLI (agent)';
  const exe = which('codex');
  const v = exe ? await exec(exe, ['--version']) : null;
  if (!v || v.code !== 0) return { _present: false, id, title, status: 'missing', detail: 'codex not found on PATH', fix: 'npm i -g @openai/codex, then `codex login`' };
  const ver = firstLine(v.out);
  const s = await exec(exe!, ['login', 'status']);
  const text = firstLine(s.out);
  return s.code === 0
    ? { _present: true, id, title, status: 'ok', detail: `${ver} — ${text || 'logged in'}` }
    : { _present: true, id, title, status: 'warn', detail: `${ver} — not logged in${text ? ` (${text})` : ''}`, fix: 'codex login' };
}

function diskCheck(): DoctorCheck {
  const title = 'Disk space (projects, renders)';
  try {
    const st = fs.statfsSync(PROJECTS_DIR);
    const gb = (st.bavail * st.bsize) / 1024 ** 3;
    const detail = `${gb.toFixed(1)} GB free at ${PROJECTS_DIR}`;
    if (gb < 1) return { id: 'disk', title, status: 'missing', detail, fix: 'Free some disk space or set STUDIO_PROJECTS to a roomier volume' };
    if (gb < 5) return { id: 'disk', title, status: 'warn', detail, fix: 'Exports and render caches need a few GB — free some space or set STUDIO_PROJECTS' };
    return { id: 'disk', title, status: 'ok', detail };
  } catch (e) { return { id: 'disk', title, status: 'warn', detail: `could not read free space: ${(e as Error).message}` }; }
}

async function portCheck(serverRunning: boolean): Promise<DoctorCheck> {
  const title = 'Port';
  if (serverRunning) return { id: 'port', title, status: 'ok', detail: `listening on http://${HOST}:${PORT}` };
  const free = await new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(PORT, HOST, () => s.close(() => resolve(true)));
  });
  if (free) return { id: 'port', title, status: 'ok', detail: `${PORT} is free` };
  let studio = false;
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/state`, { signal: AbortSignal.timeout(1500) }); studio = r.ok && 'project' in (await r.json()); } catch {}
  return studio
    ? { id: 'port', title, status: 'ok', detail: `Agent Video Studio is already running on ${PORT}` }
    : { id: 'port', title, status: 'warn', detail: `port ${PORT} is used by another program`, fix: `agent-videostudio --port ${PORT + 1}   (or STUDIO_PORT=${PORT + 1})` };
}

function homeCheck(): DoctorCheck {
  try {
    fs.mkdirSync(HOME_DIR, { recursive: true });
    fs.accessSync(HOME_DIR, fs.constants.W_OK);
    return { id: 'home', title: 'Studio home', status: 'ok', detail: HOME_DIR };
  } catch (e) { return { id: 'home', title: 'Studio home', status: 'missing', detail: `${HOME_DIR} is not writable: ${(e as Error).message}`, fix: 'Fix permissions or set STUDIO_HOME to a writable folder' }; }
}

function blenderCheck(): DoctorCheck {
  const v = blenderVersion();
  return v ? { id: 'blender', title: 'Blender (3D scenes, optional)', status: 'ok', detail: v }
    : { id: 'blender', title: 'Blender (3D scenes, optional)', status: 'warn', detail: 'not found — 3D stages are unavailable', fix: process.platform === 'darwin' ? 'brew install --cask blender   (or download from blender.org)' : 'Install Blender 4.2+ from blender.org' };
}

export async function runDoctor(opts: { serverRunning?: boolean } = {}): Promise<DoctorCheck[]> {
  const [ffmpeg, ffprobe, git, claude, codex, port] = await Promise.all([ffCheck('ffmpeg'), ffCheck('ffprobe'), gitCheck(), claudeCheck(), codexCheck(), portCheck(!!opts.serverRunning)]);
  // one agent is enough: a missing CLI only counts as "missing" when neither is installed
  const agents = [claude, codex].map(({ _present, ...c }) => c as DoctorCheck);
  if (claude._present || codex._present) for (const a of agents) if (a.status === 'missing') a.status = 'warn';
  return [nodeCheck(), ffmpeg, ffprobe, git, browserCheck(), ...agents, blenderCheck(), homeCheck(), diskCheck(), port];
}

const ICON = { ok: '✓', warn: '!', missing: '✗' } as const;
/** console rendering; compact = one line per check, fixes only for problems */
export function formatDoctor(checks: DoctorCheck[], o: { compact?: boolean } = {}): string {
  const tty = process.stdout.isTTY && !process.env.NO_COLOR;
  const color = (s: string, c: number) => (tty ? `\x1b[${c}m${s}\x1b[0m` : s);
  const paint = { ok: 32, warn: 33, missing: 31 } as const;
  const w = Math.max(...checks.map((c) => c.title.length));
  const lines = checks.map((c) => {
    const head = `  ${color(ICON[c.status], paint[c.status])} ${c.title.padEnd(w)}  ${o.compact && c.status === 'ok' ? c.detail.replace(/ — \/\S.*$/, '') : c.detail}`;
    return c.fix && c.status !== 'ok' ? `${head}\n  ${' '.repeat(w + 4)}${color('→ ' + c.fix, 36)}` : head;
  });
  const bad = checks.filter((c) => c.status === 'missing').length, warn = checks.filter((c) => c.status === 'warn').length;
  const sum = bad ? color(`${bad} missing`, 31) + (warn ? `, ${warn} warning(s)` : '') : warn ? color(`${warn} warning(s)`, 33) : color('all good', 32);
  return `  Doctor — ${sum}\n${lines.join('\n')}`;
}
