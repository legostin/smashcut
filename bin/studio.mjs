#!/usr/bin/env node
// agent-videostudio — start the local editor and open it in the browser.
// Runs the prebuilt server (dist/server) in an installed package, or the TypeScript sources via tsx in a dev checkout.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const HELP = `
  Agent Video Studio ${pkg.version} — local-first agentic motion graphics & video editor

  Usage
    agent-videostudio [projectDir] [options]   start the editor (opens or creates projectDir;
                                               default: the last project, or a demo in ~/AgentVideoStudio)
    agent-videostudio doctor [--json]          check ffmpeg, the render browser, claude/codex logins… and exit

  Options
    -p, --port <n>   port to listen on (default 4317, env STUDIO_PORT)
    --no-open        do not open the browser (env STUDIO_NO_OPEN=1)
    -v, --version    print the version
    -h, --help       this help

  Environment
    STUDIO_HOME      settings, library, render browser (default ~/.agent-videostudio)
    STUDIO_PROJECTS  where new projects go (default ~/AgentVideoStudio)
    STUDIO_HOST      bind address (default 127.0.0.1)
    STUDIO_CHROMIUM, STUDIO_FFMPEG, STUDIO_FFPROBE   explicit binaries

  A project folder literally named "doctor": pass it as ./doctor
`;

// ---------- args ----------
const argv = process.argv.slice(2);
const pass = [];
let sub = null, json = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '-v' || a === '--version') { console.log(pkg.version); process.exit(0); }
  else if (a === '-p' || a === '--port') { process.env.STUDIO_PORT = argv[++i]; }
  else if (a.startsWith('--port=')) { process.env.STUDIO_PORT = a.slice(7); }
  else if (a === '--no-open') { process.env.STUDIO_NO_OPEN = '1'; }
  else if (a === '--json') { json = true; }
  else if (a === 'doctor' && !sub && !pass.length) { sub = 'doctor'; }
  else if (a.startsWith('-')) { console.error(`Unknown option ${a}\n${HELP}`); process.exit(2); }
  else pass.push(path.resolve(a));
}
if (process.env.STUDIO_PORT && !/^\d+$/.test(process.env.STUDIO_PORT)) { console.error(`Invalid port: ${process.env.STUDIO_PORT}`); process.exit(2); }

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) {
  console.error(`Agent Video Studio needs Node.js 20 or newer (this is ${process.version}). Install it from https://nodejs.org or with \`brew install node\`.`);
  process.exit(1);
}

// ---------- how to run the server: dev checkout (tsx + sources) or prebuilt bundle ----------
const req = createRequire(path.join(root, 'package.json'));
const hasTsx = (() => { try { req.resolve('tsx'); return true; } catch { return false; } })();
const devCheckout = fs.existsSync(path.join(root, 'server', 'index.ts')) && hasTsx && !process.env.STUDIO_USE_DIST;
const entry = (name) => devCheckout
  ? ['--import', 'tsx', path.join(root, 'server', name === 'doctor' ? 'doctor-cli.ts' : 'index.ts')]
  : [path.join(root, 'dist', 'server', `${name}.js`)];
if (!devCheckout && !fs.existsSync(path.join(root, 'dist', 'server', 'index.js'))) {
  console.error('The server bundle is missing (dist/server). In a checkout run `npm install && npm run build`.');
  process.exit(1);
}

if (sub === 'doctor') {
  const r = spawnSync(process.execPath, [...entry('doctor'), ...(json ? ['--json'] : [])], { cwd: root, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const port = Number(process.env.STUDIO_PORT || 4317);
const url = `http://127.0.0.1:${port}`;
const openBrowser = () => {
  if (process.env.STUDIO_NO_OPEN && process.env.STUDIO_NO_OPEN !== '0') return;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true });
    p.on('error', () => console.log(`  Open ${url} in your browser.`));
    p.unref();
  } catch { console.log(`  Open ${url} in your browser.`); }
};
async function probe() {
  try {
    const r = await fetch(url + '/api/state', { signal: AbortSignal.timeout(1500) });
    const j = await r.json();
    return r.ok && j && typeof j === 'object' && 'project' in j ? 'studio' : 'other';
  } catch (e) { return e?.cause?.code === 'ECONNREFUSED' || e?.code === 'ECONNREFUSED' ? 'free' : 'other'; }
}

// already running on this port? just open it
const state = await probe();
if (state === 'studio') {
  console.log(`\n  Agent Video Studio is already running → ${url}\n`);
  if (pass.length) console.log('  (open the project from the editor, or stop the running instance first)\n');
  openBrowser();
  process.exit(0);
}
if (state === 'other') {
  // something answers but is not the studio (or does not answer HTTP) — let the server try anyway only if the port is free
  const net = await import('node:net');
  const free = await new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(port, process.env.STUDIO_HOST || '127.0.0.1', () => s.close(() => res(true))); });
  if (!free) { console.error(`\n  Port ${port} is used by another program. Start on another port:  agent-videostudio --port ${port + 1}\n`); process.exit(1); }
}

// dev checkout: build the UI on first start
if (devCheckout && !(fs.existsSync(path.join(root, 'web', 'dist', 'index.html')) && fs.existsSync(path.join(root, 'web', 'dist', 'render.html')))) {
  console.log('Building the editor UI…');
  const r = spawnSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

const home = process.env.STUDIO_HOME || path.join(os.homedir(), '.agent-videostudio');
if (!fs.existsSync(home)) console.log(`\n  Welcome! First run: setting up ${home}${pass.length ? '' : ` and a demo project in ${process.env.STUDIO_PROJECTS || '~/AgentVideoStudio'}`}…`);

const child = spawn(process.execPath, [...entry('index'), ...pass], { cwd: root, stdio: 'inherit', env: process.env });
child.on('exit', (c, sig) => process.exit(c ?? (sig ? 1 : 0)));
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => child.kill(s));

// open the editor once the server answers
(async () => {
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (child.exitCode != null) return;
    if ((await probe()) === 'studio') return openBrowser();
  }
})();
