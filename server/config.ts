import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Settings } from '../shared/types.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
