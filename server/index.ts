import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import { RUNTIME_DIR, GALLERY_DIR, LIBRARY_DIR, WEB_DIST, PORT, HOST, PROJECTS_DIR, getRecents, BASE_URL, moduleDir } from './config.ts';
import { bus } from './bus.ts';
import { cur, hasProject, openProject, onProjectOpen, ProjectStore, projectCtx, storeById } from './project.ts';
import { taskProject } from './agents/runner.ts';
import { registerRoutes } from './routes.ts';
import { registerHomeRoutes } from './home.ts';
import { syncSkills } from './skills.ts';
import { loadTasks } from './agents/runner.ts';
import { renderMusic } from './render/music.ts';
import { probeMedia } from './media.ts';
import { recomputeTiming } from './timing.ts';
import { closeBrowser, ensureBrowser } from './render/browser.ts';
import { runDoctor, formatDoctor } from './doctor.ts';
import { exposeBundledBins } from './bin.ts';
import { resumeExport } from './render/compose.ts';
import { createDemoProject } from './demo.ts';
import { onScriptFileChanged } from './script.ts';
import { onDesignFileChanged } from './design.ts';
import { SAMPLES_DIR, sampleIndexJson } from './samples.ts';

exposeBundledBins();

const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });
await app.register(fastifyWebsocket);
await app.register(fastifyMultipart, { limits: { fileSize: 8 * 1024 * 1024 * 1024 } });
await app.register(fastifyStatic, { root: WEB_DIST, prefix: '/', serve: true, wildcard: true, index: ['index.html'] });

// ---------- which project a request belongs to (several can be open in different tabs) ----------
const PID_PATH = /^\/p\/([0-9a-f]{10})(?:\/|$)/;
function pidFromUrl(u: string): string | undefined {
  const m = PID_PATH.exec(u.split('?')[0]);
  if (m) return m[1];
  const q = /[?&]p=([0-9a-f]{10})\b/.exec(u);
  return q?.[1];
}
function resolveStore(req: { headers: Record<string, any>; url: string }): ProjectStore | undefined {
  const h = req.headers['x-studio-project'];
  const byHeader = storeById(Array.isArray(h) ? h[0] : h);
  if (byHeader) return byHeader;
  const task = req.headers['x-studio-task'];
  const byTask = task ? taskProject(String(task)) : undefined;
  if (byTask) return byTask;
  const byUrl = storeById(pidFromUrl(req.url));
  if (byUrl) return byUrl;
  const ref = req.headers.referer;
  if (ref) { try { const r = new URL(String(ref)); return storeById(pidFromUrl(r.pathname + r.search)); } catch {} }
}
app.addHook('preHandler', (req, _reply, done) => {
  const store = resolveStore(req);
  if (store) projectCtx.run(store, done); else done();
});

const noCache = { 'cache-control': 'no-store' };
function serveFrom(prefix: string, root: () => string, headers: Record<string, string> = noCache) {
  app.get(prefix + '*', (req, reply) => {
    const rel = decodeURIComponent((req.params as any)['*'] || '');
    if (rel.includes('..')) return reply.code(400).send('bad path');
    for (const [k, v] of Object.entries(headers)) reply.header(k, v);
    return reply.sendFile(rel, root());
  });
}
serveFrom('/runtime/', () => RUNTIME_DIR);
serveFrom('/gallery/', () => GALLERY_DIR);
serveFrom('/library/', () => LIBRARY_DIR);
// instrument samples (downloaded on first music render, see server/samples.ts); the index is always valid JSON
app.get('/samples/index.json', (_req, reply) => reply.header('cache-control', 'no-store').type('application/json').send(sampleIndexJson()));
serveFrom('/samples/', () => SAMPLES_DIR, { 'cache-control': 'max-age=86400' });
const FONTS_DIR = path.dirname(moduleDir('@fontsource/inter'));
const GSAP_DIST = path.join(moduleDir('gsap'), 'dist');
const TONE_BUILD = path.join(moduleDir('tone'), 'build');
serveFrom('/fonts/', () => FONTS_DIR, { 'cache-control': 'max-age=86400' });
serveFrom('/vendor/gsap/', () => GSAP_DIST, { 'cache-control': 'max-age=86400' });
app.get('/vendor/gsap.min.js', (_req, reply) => reply.header('cache-control', 'max-age=86400').sendFile('gsap.min.js', GSAP_DIST));
app.get('/vendor/Tone.js', (_req, reply) => reply.header('cache-control', 'max-age=86400').sendFile('Tone.js', TONE_BUILD));
// Three.js for 3D clips: /vendor/three/build/three.module.js + /vendor/three/examples/jsm/… (addons), opentype for 3D text
const THREE_DIR = moduleDir('three');
const OPENTYPE_DIST = path.join(moduleDir('opentype.js'), 'dist');
serveFrom('/vendor/three/', () => THREE_DIR, { 'cache-control': 'max-age=86400' });
app.get('/vendor/opentype.module.js', (_req, reply) => reply.header('cache-control', 'max-age=86400').type('text/javascript').sendFile('opentype.module.js', OPENTYPE_DIST));
app.get('/api/doctor', async () => runDoctor({ serverRunning: true }));
// project files: /p/<projectId>/… (legacy /p/… resolves through the request's project)
app.get('/p/*', (req, reply) => {
  let rel = decodeURIComponent((req.params as any)['*'] || '');
  if (rel.includes('..')) return reply.code(400).send('bad path');
  const m = /^([0-9a-f]{10})(?:\/|$)/.exec(rel);
  const store = (m && storeById(m[1])) || (hasProject() ? cur() : null);
  if (!store) return reply.code(404).send('no project');
  if (m && store.id === m[1]) rel = rel.slice(m[0].length);
  for (const [k, v] of Object.entries(noCache)) reply.header(k, v);
  return reply.sendFile(rel, store.dir);
});

app.register(async (f) => {
  f.get('/ws', { websocket: true }, (socket, req) => {
    // a tab subscribes to its project (?p=<id>); events of other projects are not sent to it
    const pid = (req.query as any)?.p as string | undefined;
    const onEv = (ev: any) => {
      if (pid && ev.pid && ev.pid !== pid) return;
      try { socket.send(JSON.stringify(ev)); } catch {}
    };
    bus.on('event', onEv);
    socket.on('close', () => bus.off('event', onEv));
  });
});

app.setErrorHandler((err: any, _req, reply) => {
  reply.code(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500).send({ error: err.message, key: err.key, params: err.params });
});

await registerRoutes(app);
await registerHomeRoutes(app);

// SPA fallback
app.setNotFoundHandler((req, reply) => {
  const pathname = req.url.split('?')[0];
  if (req.method === 'GET' && !/^\/(api|p|runtime|gallery|library|vendor|fonts)\//.test(pathname) && !/\.[a-z0-9]+$/i.test(pathname) && fs.existsSync(path.join(WEB_DIST, 'index.html'))) return reply.sendFile('index.html', WEB_DIST);
  reply.code(404).send({ error: 'not found' });
});

// ---------- project lifecycle ----------
bus.on('event', (ev: any) => { if (ev.type === 'project') recomputeTiming(); });
const musicTimers = new Map<string, NodeJS.Timeout>();
onProjectOpen((store) => {
  syncSkills(store.dir, store.project.name);
  loadTasks();
  store.listeners.music = (id) => {
    clearTimeout(musicTimers.get(store.id + id));
    musicTimers.set(store.id + id, setTimeout(() => renderMusic(id).catch((e) => console.error('music', e.message)), 400));
  };
  store.listeners.script = () => onScriptFileChanged();
  store.listeners.design = () => onDesignFileChanged();
  store.listeners.media = (file) => { probeMedia(file).catch((e) => console.error('probe', e.message)); };
  // warm up: probe media, render music
  setTimeout(async () => {
    for (const m of store.listMedia()) await probeMedia(m.file).catch(() => {});
    for (const m of store.listMusic()) await renderMusic(m.id).catch(() => {});
    recomputeTiming();
    resumeExport();
  }, 300);
});

// ---------- boot ----------
const argv = process.argv.slice(2);
const argProject = argv.find((a) => !a.startsWith('-'));
await app.listen({ port: PORT, host: HOST });

let target = argProject ? path.resolve(argProject) : getRecents()[0];
if (target && !ProjectStore.exists(target)) {
  if (argProject) { await ProjectStore.create(target, { name: path.basename(target) }); }
  else target = undefined as any;
}
if (!target) target = await createDemoProject(path.join(PROJECTS_DIR, 'demo'));
openProject(target);

// render looping gallery previews in the background (cached; once per technique version)
setTimeout(() => { import('./gallery.ts').then((g) => g.warmPreviews()).catch(() => {}); }, 15000);
console.log(`\n  Smashcut  →  ${BASE_URL}\n  project: ${cur().dir}\n`);
if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) console.log('  (web UI not built — run `npm run dev` and open http://localhost:5173, or `npm start`)\n');
// first-run checks: compact summary; fetch the render browser in the background if there is none
runDoctor({ serverRunning: true }).then((checks) => console.log(formatDoctor(checks, { compact: true }) + '\n')).catch(() => {});
ensureBrowser().catch((e) => console.error('  render browser:', e.message));

// agents run detached and keep working while the editor restarts; only the render browser closes
const shutdown = async () => { await closeBrowser(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
