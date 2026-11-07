#!/usr/bin/env node
// agent-videostudio [projectDir] — build the UI if needed and start the server.
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(root, 'web', 'dist', 'index.html')) || !fs.existsSync(path.join(root, 'web', 'dist', 'render.html'))) {
  console.log('Building the editor UI…');
  const r = spawnSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}
const args = process.argv.slice(2).map((a) => (a.startsWith('-') ? a : path.resolve(a)));
const child = spawn('npx', ['tsx', path.join(root, 'server', 'index.ts'), ...args], { cwd: root, stdio: 'inherit' });
const port = process.env.STUDIO_PORT || 4317;
if (!process.env.STUDIO_NO_OPEN) setTimeout(() => spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [`http://127.0.0.1:${port}`], { stdio: 'ignore', detached: true }).unref(), 2500);
child.on('exit', (c) => process.exit(c ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
