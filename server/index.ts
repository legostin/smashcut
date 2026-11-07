import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import { ROOT, RUNTIME_DIR, GALLERY_DIR, LIBRARY_DIR, WEB_DIST, PORT, HOST, PROJECTS_DIR, getRecents, BASE_URL } from './config.ts';
import { bus } from './bus.ts';
import { cur, hasProject, openProject, onProjectOpen, ProjectStore } from './project.ts';
import { registerRoutes } from './routes.ts';
import { syncSkills } from './skills.ts';
import { loadTasks } from './agents/runner.ts';
import { renderMusic } from './render/music.ts';
import { probeMedia } from './media.ts';
import { recomputeTiming } from './timing.ts';
import { closeBrowser } from './render/browser.ts';
import { resumeExport } from './render/compose.ts';
import { createDemoProject } from './demo.ts';
import { onScriptFileChanged } from './script.ts';
import { onDesignFileChanged } from './design.ts';

const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });
await app.register(fastifyWebsocket);
await app.register(fastifyMultipart, { limits: { fileSize: 8 * 1024 * 1024 * 1024 } });
await app.register(fastifyStatic, { root: WEB_DIST, prefix: '/', serve: true, wildcard: true, index: ['index.html'] });

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
serveFrom('/fonts/', () => path.join(ROOT, 'node_modules', '@fontsource'), { 'cache-control': 'max-age=86400' });
serveFrom('/vendor/gsap/', () => path.join(ROOT, 'node_modules', 'gsap', 'dist'), { 'cache-control': 'max-age=86400' });
app.get('/vendor/gsap.min.js', (_req, reply) => reply.header('cache-control', 'max-age=86400').sendFile('gsap.min.js', path.join(ROOT, 'node_modules', 'gsap', 'dist')));
app.get('/vendor/Tone.js', (_req, reply) => reply.header('cache-control', 'max-age=86400').sendFile('Tone.js', path.join(ROOT, 'node_modules', 'tone', 'build')));
serveFrom('/p/', () => { if (!hasProject()) throw new Error('no project'); return cur().dir; });

app.register(async (f) => {
  f.get('/ws', { websocket: true }, (socket) => {
    const onEv = (ev: unknown) => { try { socket.send(JSON.stringify(ev)); } catch {} };
    bus.on('event', onEv);
    socket.on('close', () => bus.off('event', onEv));
  });
});

app.setErrorHandler((err: any, _req, reply) => {
  reply.code(err.statusCode && err.statusCode >= 400 ? err.statusCode : 500).send({ error: err.message });
});

await registerRoutes(app);

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
    clearTimeout(musicTimers.get(id));
    musicTimers.set(id, setTimeout(() => renderMusic(id).catch((e) => console.error('music', e.message)), 400));
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

console.log(`\n  Agent Video Studio  →  ${BASE_URL}\n  project: ${cur().dir}\n`);
if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) console.log('  (web UI not built — run `npm run dev` and open http://localhost:5173, or `npm start`)\n');

// agents run detached and keep working while the editor restarts; only the render browser closes
const shutdown = async () => { await closeBrowser(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
