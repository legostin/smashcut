import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Settings } from '../shared/types.ts';

/** package root: the nearest dir with our package.json — works from source (server/config.ts) and from the bundle (dist/server/*.js) */
function findRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (let d = here; ; d = path.dirname(d)) {
    try { if (JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name === 'agent-videostudio') return d; } catch {}
    if (path.dirname(d) === d) return path.resolve(here, '..');
  }
}
export const ROOT = findRoot();
/** directory of an installed npm package (looks in ROOT/node_modules and every parent node_modules, so hoisted installs work) */
export function moduleDir(name: string): string {
  for (let d = ROOT; ; d = path.dirname(d)) {
    const p = path.join(d, 'node_modules', name);
    if (fs.existsSync(path.join(p, 'package.json'))) return p;
    if (path.dirname(d) === d) return path.join(ROOT, 'node_modules', name);
  }
}
export const RUNTIME_DIR = path.join(ROOT, 'runtime');
export const GALLERY_DIR = path.join(ROOT, 'gallery');
export const SKILLS_DIR = path.join(ROOT, 'skills');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');
export const MCP_STDIO = path.join(ROOT, 'server', 'mcp', 'stdio.mjs');
export const HOME_DIR = process.env.STUDIO_HOME || path.join(os.homedir(), '.agent-videostudio');
export const LIBRARY_DIR = path.join(HOME_DIR, 'library');
export const USER_SKILLS_DIR = path.join(HOME_DIR, 'skills');
export const PROJECTS_DIR = process.env.STUDIO_PROJECTS || path.join(os.homedir(), 'AgentVideoStudio');
export const PORT = Number(process.env.STUDIO_PORT || 4317);
export const HOST = process.env.STUDIO_HOST || '127.0.0.1';
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const BROWSERS_DIR = path.join(HOME_DIR, 'browsers');

for (const d of [HOME_DIR, LIBRARY_DIR, path.join(LIBRARY_DIR, 'clips'), path.join(LIBRARY_DIR, 'music'), USER_SKILLS_DIR, PROJECTS_DIR]) fs.mkdirSync(d, { recursive: true });

const SETTINGS_FILE = path.join(HOME_DIR, 'settings.json');
const DEFAULT_SETTINGS: Settings = {
  defaultAgent: 'claude',
  permissionMode: 'auto',
  parallelTasks: 3,
  subagents: true,
  maxSubagents: 3,
  renderWorkers: Math.max(2, Math.min(6, os.cpus().length - 2)),
  transcribeModel: 'Xenova/whisper-base',
};
export function getSettings(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
    if (!['auto', 'acceptEdits', 'bypassPermissions'].includes(s.permissionMode)) s.permissionMode = 'auto';
    return s;
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s: Partial<Settings>) {
  const next = { ...getSettings(), ...s };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

const RECENTS_FILE = path.join(HOME_DIR, 'recent.json');
export function getRecents(): string[] {
  try { return JSON.parse(fs.readFileSync(RECENTS_FILE, 'utf8')).filter((p: string) => fs.existsSync(path.join(p, 'project.json'))); } catch { return []; }
}
export function pushRecent(dir: string) {
  const list = [dir, ...getRecents().filter((d) => d !== dir)].slice(0, 12);
  fs.writeFileSync(RECENTS_FILE, JSON.stringify(list, null, 2));
}
