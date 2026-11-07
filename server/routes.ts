import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import type { Comment, Item, Project, PackageManifest } from '../shared/types.ts';
import { ROOT, GALLERY_DIR, LIBRARY_DIR, PROJECTS_DIR, getSettings, saveSettings, getRecents, HOME_DIR } from './config.ts';
import { cur, hasProject, openProject, ProjectStore, MEDIA_EXT } from './project.ts';
import { bus } from './bus.ts';
import { nid, readJson, writeJson, copyDir, slug, safeJoin, run } from './util.ts';
import { log as gitLog, restore as gitRestore, exportAt, commit } from './git.ts';
import { listGallery, galleryThumb, useTemplate, saveToLibrary, deleteFromLibrary } from './gallery.ts';
import { listSkills, syncSkills } from './skills.ts';
import { probeMedia, analyzeMedia, transcribeMedia } from './media.ts';
import { renderMusic, musicPeaks } from './render/music.ts';
import { clipUrl, itemInput, renderClipFrames } from './render/clips.ts';
import { compositeFrame, sheet, annotate, startExport, getJobs, cancelExport } from './render/compose.ts';
import { getTiming, recomputeTiming } from './timing.ts';
import { spectrogram, loudnessSparkline, type AudioAnalysis } from './audio/analyze.ts';
import { startTask, followUp, cancelTask, listTasks, taskEvent, setFocus } from './agents/runner.ts';
import { getScript, saveScript, patchScene, STAGES } from './script.ts';
import { getDesign, saveDesign } from './design.ts';
import { boardFrame } from './render/board.ts';
import { listVoices, tts, MODELS, apiKey } from './voice/elevenlabs.ts';
import { commentTaskPrompt, chatTaskPrompt } from './agents/prompts.ts';
import * as permissions from './permissions.ts';

const SKELETONS = path.join(ROOT, 'server', 'skeletons');

function trackFor(p: Project, kind: Item['kind'], ref: string): string {
  let want: string[] = ['graphics'];
  if (kind === 'music') want = ['music', 'audio'];
  if (kind === 'media') {
    const t = MEDIA_EXT[path.extname(ref).toLowerCase()];
    want = t === 'audio' ? ['audio', 'music'] : ['video', 'graphics'];
  }
  for (const k of want) { const tr = p.tracks.find((t) => t.kind === k); if (tr) return tr.id; }
  return p.tracks[0].id;
}

function defaultDuration(kind: Item['kind'], ref: string): number {
  const store = cur();
  if (kind === 'clip') return store.clipInfo(ref)?.duration || 5;
  if (kind === 'music') { const m = store.musicInfo(ref); return m.meta ? m.meta.duration + (m.meta.tail || 0) : m.duration || 10; }
  const mi = store.mediaInfo(ref);
  return mi.duration || 5;
}

export function state() {
  if (!hasProject()) return { project: null, recents: getRecents(), projectsDir: PROJECTS_DIR, settings: { ...getSettings(), elevenlabsKey: '' } };
  const store = cur();
  return {
    dir: store.dir,
    project: store.project,
    comments: store.comments,
    clips: store.listClips(),
    music: store.listMusic(),
    media: store.listMedia(),
    tasks: listTasks(),
    settings: (() => { const st = getSettings(); return { ...st, elevenlabsKey: st.elevenlabsKey ? '••••' + st.elevenlabsKey.slice(-4) : '', hasElevenlabsKey: !!apiKey() }; })(),
    skills: listSkills(),
    jobs: getJobs(),
    permissions: permissions.list(),
    script: getScript(),
    design: getDesign(),
    exports: listExports(),
    recents: getRecents(),
    projectsDir: PROJECTS_DIR,
    repo: ROOT,
  };
}

function listExports() {
  const dir = cur().p('.studio', 'exports');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(mp4|mov|webm|gif)$/.test(f)).map((f) => ({ file: `.studio/exports/${f}`, size: fs.statSync(path.join(dir, f)).size, mtime: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
}

function createClipPackage(id: string, name: string, description = '', duration = 4) {
  const store = cur();
  const cid = slug(id);
  const dir = store.p('clips', cid);
  if (fs.existsSync(dir)) throw new Error(`clip ${cid} already exists`);
  copyDir(path.join(SKELETONS, 'clip'), dir);
  writeJson(path.join(dir, 'manifest.json'), { id: cid, kind: 'clip', name, description, category: 'custom', tags: [], duration } satisfies PackageManifest);
  const js = fs.readFileSync(path.join(dir, 'clip.js'), 'utf8').replace('duration: 4', `duration: ${duration}`);
  fs.writeFileSync(path.join(dir, 'clip.js'), js);
  return cid;
}

async function renderClipSheet(clipId: string, opts: { times?: number[]; count?: number; itemId?: string }) {
  const store = cur();
  const p = store.project;
  const info = store.clipInfo(clipId);
  if (!info) throw new Error('clip not found: ' + clipId);
  const item = opts.itemId ? p.items.find((i) => i.id === opts.itemId) : p.items.find((i) => i.kind === 'clip' && i.ref === clipId);
  const input = item ? itemInput(item, p) : { width: p.width, height: p.height, fps: p.fps, duration: info.duration };
  const duration = item ? item.duration + item.in : info.duration || 5;
  const count = opts.count || 8;
  const times = opts.times?.length ? opts.times : Array.from({ length: count }, (_, i) => +((duration * (i + 0.5)) / count).toFixed(2));
  const r = await renderClipFrames(clipUrl(clipId, input), { width: p.width, height: p.height }, times);
  const png = await sheet(r.frames.map((f, i) => ({ png: f, caption: `t=${times[i].toFixed(2)}s` })), { cols: times.length === 1 ? 1 : times.length <= 4 ? 2 : 4, width: times.length === 1 ? 1280 : 1600 });
  const file = `.studio/frames/${clipId}-${Date.now().toString(36)}.png`;
  fs.writeFileSync(store.p(file), png);
  return { png, times, duration, errors: r.errors, file };
}

async function renderFrames(times: number[]) {
  const store = cur();
  const shots = [];
  const errors: string[] = [];
  for (const t of times) {
    const r = await compositeFrame(t);
    shots.push({ png: r.png, caption: `t=${t.toFixed(2)}s` });
    errors.push(...r.errors);
  }
  const png = shots.length === 1 ? shots[0].png : await sheet(shots, { cols: shots.length <= 4 ? 2 : 3, checker: false });
  const file = `.studio/frames/frame-${Date.now().toString(36)}.png`;
  fs.writeFileSync(store.p(file), png);
  return { png, times, errors: [...new Set(errors)], file };
}

/** fraction of pixels whose RGBA differs by more than a small tolerance */
async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  if (a.equals(b)) return 0;
  const raw = async (png: Buffer) => (await new Promise<Buffer>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=480:-1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
    const out: Buffer[] = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', reject);
    p.on('close', () => resolve(Buffer.concat(out)));
    p.stdin.end(png);
  }));
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  if (ra.length !== rb.length || !ra.length) return 1;
  let bad = 0;
  for (let i = 0; i < ra.length; i += 4) {
    if (Math.abs(ra[i] - rb[i]) > 12 || Math.abs(ra[i + 1] - rb[i + 1]) > 12 || Math.abs(ra[i + 2] - rb[i + 2]) > 12 || Math.abs(ra[i + 3] - rb[i + 3]) > 12) bad++;
  }
  return bad / (ra.length / 4);
}

async function lintClip(clipId: string) {
  const store = cur();
  const dir = store.p('clips', clipId);
  if (!fs.existsSync(dir)) throw new Error('clip not found');
  const issues: string[] = [];
  const files = fs.readdirSync(dir).filter((f) => /\.(js|html|css)$/.test(f));
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const checks: [RegExp, string][] = [
      [/Date\.now\(|new Date\(\)/, 'uses wall-clock time (Date) — derive everything from t'],
      [/requestAnimationFrame\s*\(/, 'uses requestAnimationFrame — animate on ctx.tl or in render(t)'],
      [/set(Timeout|Interval)\s*\(/, 'uses timers — not allowed in a pure function of time'],
      [/Math\.random\s*\(/, 'uses Math.random — use studio.random(seed) for explicit seeding'],
      [/\bfetch\s*\(|XMLHttpRequest/, 'does network requests'],
      [/https?:\/\/(?!www\.w3\.org)/, 'references remote URLs — bundle assets in assets/'],
      [/gsap\.(to|from|fromTo)\(/, 'creates free-standing gsap tweens — put them on ctx.tl (or studio.track() them), else they won\'t be seekable'],
    ];
    for (const [re, msg] of checks) if (re.test(src)) issues.push(`${f}: ${msg}`);
  }
  if (!/studio\.clip\s*\(/.test(fs.readFileSync(path.join(dir, 'clip.js'), 'utf8') || '')) issues.push('clip.js: never calls studio.clip({...})');
  try { JSON.parse(fs.readFileSync(path.join(dir, 'params.json'), 'utf8')); } catch { issues.push('params.json missing or invalid JSON'); }
  const info = store.clipInfo(clipId)!;
  const p = store.project;
  const d = info.duration || 5;
  // seek forward, jump to the end, back to the start, then return to the middle: a pure function of t gives the same pixels
  const mid = +(d * 0.47).toFixed(3);
  const r = await renderClipFrames(clipUrl(clipId, { width: p.width, height: p.height, fps: p.fps, duration: d }), { width: p.width, height: p.height }, [mid, d - 0.05, 0.05, mid]);
  if (r.errors.length) issues.push(...r.errors.map((e) => 'runtime: ' + e));
  const diff = await pixelDiff(r.frames[0], r.frames[3]);
  if (diff > 0.003) issues.push(`non-deterministic: t=${mid}s rendered before and after seeking around differs in ${(diff * 100).toFixed(2)}% of pixels — state leaks between frames`);
  if (r.frames[2].equals(r.frames[0]) && r.frames[0].equals(r.frames[1])) issues.push('frames at start, middle and end are identical — is anything animating?');
  return { clipId, ok: issues.length === 0, issues };
}

function overview() {
  const store = cur();
  const p = store.project;
  const timing = getTiming();
  const open = store.comments.filter((c) => c.status === 'draft' || c.status === 'sent');
  return {
    project: { name: p.name, width: p.width, height: p.height, fps: p.fps, duration: p.duration, background: p.background, dir: store.dir },
    tracks: p.tracks.map((t, i) => ({ ...t, layer: i === 0 ? 'top' : undefined })),
    items: p.items.map((i) => ({ id: i.id, track: i.track, kind: i.kind, ref: i.ref, start: i.start, end: +(i.start + i.duration).toFixed(3), in: i.in, label: i.label, params: i.params, opacity: i.opacity, volume: i.volume })),
    clips: store.listClips().map((c) => ({ id: c.id, name: c.name, duration: c.duration, params: Object.keys(c.schema), source: c.source })),
    music: store.listMusic().map((m) => ({ id: m.id, name: m.name, bpm: m.meta?.bpm, duration: m.meta?.duration, sections: m.meta?.sections, error: m.renderError })),
    media: store.listMedia().map((m) => ({ file: m.file, type: m.type, duration: m.duration, size: m.width ? `${m.width}x${m.height}` : undefined, transcript: !!m.transcript })),
    openComments: open.map((c) => ({ id: c.id, time: c.time, clipId: c.clipId, text: c.text, status: c.status })),
    timing: { bpm: timing.bpm, beats: timing.beats.length, sections: timing.sections, markers: timing.markers, words: timing.words.length },
    design: getDesign(),
    script: (() => { const sc = getScript(); return { stage: sc.stage, brief: sc.brief, scenes: sc.scenes.map((x) => ({ id: x.id, title: x.title, start: x.start, end: +(x.start + x.duration).toFixed(2), status: x.status })) }; })(),
    galleryDir: GALLERY_DIR,
    libraryDir: LIBRARY_DIR,
  };
}

async function sendComments(ids: string[] | undefined, agent?: 'claude' | 'codex') {
  const store = cur();
  const p = store.project;
  const drafts = store.comments.filter((c) => c.status === 'draft' && (!ids || ids.includes(c.id)));
  if (!drafts.length) throw new Error('no draft comments to send');
  const groups = new Map<string, Comment[]>();
  for (const c of drafts) { const k = c.itemId || c.clipId || '__timeline'; groups.set(k, [...(groups.get(k) || []), c]); }
  const created = [];
  for (const [key, list] of groups) {
    const item = p.items.find((i) => i.id === key) || (list[0].itemId ? p.items.find((i) => i.id === list[0].itemId) : undefined);
    const clipId = list[0].clipId || (item?.kind === 'clip' ? item.ref : undefined);
    // annotated snapshots per distinct time
    const byTime = new Map<string, Comment[]>();
    list.forEach((c) => { const k = c.time.toFixed(2); byTime.set(k, [...(byTime.get(k) || []), c]); });
    const snapshots: string[] = [];
    let n = 1;
    const numbering = new Map(list.map((c, i) => [c.id, i + 1]));
    for (const [tk, cs] of byTime) {
      const { png } = await compositeFrame(Number(tk));
      const ann = await annotate(png, { width: p.width, height: p.height }, cs.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h, n: numbering.get(c.id)!, text: c.text })));
      const rel = `.studio/comments/${slug(key)}-${tk.replace('.', '_')}-${nid()}.png`;
      fs.writeFileSync(store.p(rel), ann);
      snapshots.push(rel);
      for (const c of cs) c.snapshot = rel;
      n++;
    }
    const prompt = commentTaskPrompt({ clipId, item, project: p, comments: list, snapshots });
    const task = startTask({ agent, title: `${list.length} comment${list.length > 1 ? 's' : ''} on ${clipId || 'timeline'}`, prompt, clipId, commentIds: list.map((c) => c.id), images: snapshots.map((s) => store.p(s)) });
    await store.updateComments((all) => { for (const c of all) { const m = list.find((x) => x.id === c.id); if (m) { c.status = 'sent'; c.taskId = task.id; c.snapshot = m.snapshot; c.updatedAt = new Date().toISOString(); } } });
    created.push(task);
  }
  return created;
}

export async function registerRoutes(app: FastifyInstance) {
  const taskOf = (req: { headers: Record<string, unknown> }) => String(req.headers['x-studio-task'] || '');
  const need = () => { if (!hasProject()) throw Object.assign(new Error('no project open'), { statusCode: 409 }); return cur(); };

  // ---------- state & projects ----------
  app.get('/api/state', async () => state());
  app.get('/api/projects', async () => {
    const dirs = fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR).map((d) => path.join(PROJECTS_DIR, d)).filter((d) => ProjectStore.exists(d)) : [];
    return { current: hasProject() ? cur().dir : null, recents: getRecents(), projects: [...new Set([...getRecents(), ...dirs])], projectsDir: PROJECTS_DIR };
  });
  app.post<{ Body: { path: string } }>('/api/projects/open', async (req) => {
    const dir = path.resolve(req.body.path.replace(/^~/, process.env.HOME || ''));
    if (!ProjectStore.exists(dir)) throw Object.assign(new Error('not a project folder (no project.json): ' + dir), { statusCode: 400 });
    openProject(dir);
    return state();
  });
  app.post<{ Body: { name: string; path?: string; width?: number; height?: number; fps?: number } }>('/api/projects/create', async (req) => {
    const name = req.body.name || 'Untitled';
    const dir = path.resolve((req.body.path || path.join(PROJECTS_DIR, slug(name))).replace(/^~/, process.env.HOME || ''));
    if (ProjectStore.exists(dir)) throw Object.assign(new Error('project already exists at ' + dir), { statusCode: 400 });
    await ProjectStore.create(dir, { name, width: req.body.width, height: req.body.height, fps: req.body.fps });
    syncSkills(dir, name);
    await commit(dir, 'Add agent skills');
    openProject(dir);
    return state();
  });

  // ---------- project & items ----------
  app.get('/api/project', async () => need().project);
  app.post('/api/undo', async () => { const st = need(); const ok = st.undo(); if (ok) recomputeTiming(); return { ok, ...st.history() }; });
  app.post('/api/redo', async () => { const st = need(); const ok = st.redo(); if (ok) recomputeTiming(); return { ok, ...st.history() }; });
  app.put<{ Body: Project }>('/api/project', async (req) => need().saveProject(req.body));
  app.patch<{ Body: Partial<Project> }>('/api/project', async (req) => need().update((p) => { Object.assign(p, req.body); }));
  app.post<{ Body: Partial<Item> & { kind: Item['kind']; ref: string } }>('/api/items', async (req) => {
    const store = need();
    const b = req.body;
    const id = 'i' + nid();
    await store.update((p) => {
      const it: Item = {
        id, kind: b.kind, ref: b.ref, track: b.track || trackFor(p, b.kind, b.ref), start: Math.max(0, Number(b.start) || 0), in: Number(b.in) || 0,
        duration: Number(b.duration) || defaultDuration(b.kind, b.ref), label: b.label, params: b.params, opacity: b.opacity, volume: b.volume, transform: b.transform,
      };
      p.items.push(it);
      p.duration = Math.max(p.duration, Math.ceil(it.start + it.duration));
    });
    if (b.kind === 'music') renderMusic(b.ref).catch(() => {});
    recomputeTiming();
    return store.project.items.find((i) => i.id === id);
  });
  app.patch<{ Params: { id: string }; Body: Partial<Item> }>('/api/items/:id', async (req) => {
    const store = need();
    await store.update((p) => {
      const it = p.items.find((i) => i.id === req.params.id);
      if (!it) throw Object.assign(new Error('item not found'), { statusCode: 404 });
      const { params, ...rest } = req.body;
      Object.assign(it, rest);
      if (params) it.params = { ...(it.params || {}), ...params };
      p.duration = Math.max(p.duration, Math.ceil(it.start + it.duration));
    });
    recomputeTiming();
    return store.project.items.find((i) => i.id === req.params.id);
  });
  app.delete<{ Params: { id: string } }>('/api/items/:id', async (req) => {
    const store = need();
    await store.update((p) => { p.items = p.items.filter((i) => i.id !== req.params.id); });
    recomputeTiming();
    return { ok: true };
  });
  app.post<{ Params: { id: string }; Body: { time: number } }>('/api/items/:id/split', async (req) => {
    const store = need();
    await store.update((p) => {
      const it = p.items.find((i) => i.id === req.params.id);
      const t = req.body.time;
      if (!it || t <= it.start + 0.04 || t >= it.start + it.duration - 0.04) return;
      const right: Item = { ...JSON.parse(JSON.stringify(it)), id: 'i' + nid(), start: t, in: it.in + (t - it.start), duration: it.start + it.duration - t };
      it.duration = t - it.start;
      p.items.push(right);
    });
    return { ok: true };
  });
  app.get('/api/timing', async () => (hasProject() ? getTiming() : { bpm: 120, beats: [], bars: [], sections: [], markers: [], words: [] }));

  // ---------- media ----------
  app.post('/api/media/upload', async (req) => {
    const store = need();
    const out: string[] = [];
    for await (const part of req.files()) {
      let name = path.basename(part.filename).replace(/[^\w.\-а-яё ]+/gi, '_');
      if (!MEDIA_EXT[path.extname(name).toLowerCase()]) { part.file.resume(); continue; }
      let n = 2;
      while (fs.existsSync(store.p('media', name))) name = name.replace(/(\.[^.]+)$/, `-${n++}$1`);
      await pipeline(part.file, fs.createWriteStream(store.p('media', name)));
      out.push(name);
    }
    const infos = [];
    for (const f of out) infos.push(await probeMedia(f));
    return infos;
  });
  app.post<{ Params: { file: string }; Body: { language?: string } }>('/api/media/:file/transcribe', async (req) => {
    need();
    transcribeMedia(req.params.file, req.body?.language).catch((e) => bus.send({ type: 'notice', level: 'error', text: 'Transcription failed: ' + e.message }));
    return { started: true };
  });
  app.post<{ Params: { file: string } }>('/api/media/:file/analyze', async (req) => { need(); return analyzeMedia(req.params.file); });
  app.delete<{ Params: { file: string } }>('/api/media/:file', async (req) => {
    const store = need();
    if (store.project.items.some((i) => i.kind === 'media' && i.ref === req.params.file)) throw Object.assign(new Error('media is used on the timeline'), { statusCode: 400 });
    fs.rmSync(safeJoin(store.p('media'), req.params.file), { force: true });
    return { ok: true };
  });

  // ---------- clips & music ----------
  app.get('/api/clips', async () => need().listClips());
  app.post<{ Body: { id: string; name: string; description?: string; duration?: number } }>('/api/clips', async (req) => {
    need();
    const id = createClipPackage(req.body.id || req.body.name, req.body.name || req.body.id, req.body.description, req.body.duration);
    return { id, path: `clips/${id}/`, files: ['index.html', 'clip.js', 'style.css', 'params.json', 'manifest.json'] };
  });
  app.post<{ Params: { id: string } }>('/api/clips/:id/duplicate', async (req) => {
    const store = need();
    const src = store.p('clips', req.params.id);
    let id = req.params.id + '-copy', n = 2;
    while (fs.existsSync(store.p('clips', id))) id = `${req.params.id}-copy${n++}`;
    copyDir(src, store.p('clips', id));
    const mf = store.p('clips', id, 'manifest.json');
    writeJson(mf, { ...readJson<PackageManifest>(mf, {} as PackageManifest), id });
    return { id };
  });
  app.delete<{ Params: { id: string } }>('/api/clips/:id', async (req) => {
    const store = need();
    await store.update((p) => { p.items = p.items.filter((i) => !(i.kind === 'clip' && i.ref === req.params.id)); });
    fs.rmSync(safeJoin(store.p('clips'), req.params.id), { recursive: true, force: true });
    return { ok: true };
  });
  app.post<{ Body: { id: string; name: string; description?: string } }>('/api/music', async (req) => {
    const store = need();
    const id = slug(req.body.id || req.body.name);
    const dir = store.p('music', id);
    if (fs.existsSync(dir)) throw new Error('music exists: ' + id);
    copyDir(path.join(SKELETONS, 'music'), dir);
    writeJson(path.join(dir, 'manifest.json'), { id, kind: 'music', name: req.body.name || id, description: req.body.description || '' });
    return { id, path: `music/${id}/score.js` };
  });
  app.post<{ Params: { id: string } }>('/api/music/:id/render', async (req) => { need(); return renderMusic(req.params.id, true); });
  app.get<{ Params: { id: string } }>('/api/music/:id/peaks', async (req) => { const store = need(); const p = musicPeaks(req.params.id); return p ? readJson(store.p(p), []) : []; });
  app.delete<{ Params: { id: string } }>('/api/music/:id', async (req) => {
    const store = need();
    await store.update((p) => { p.items = p.items.filter((i) => !(i.kind === 'music' && i.ref === req.params.id)); });
    fs.rmSync(safeJoin(store.p('music'), req.params.id), { recursive: true, force: true });
    return { ok: true };
  });

  // ---------- gallery & library ----------
  app.get('/api/gallery', async () => listGallery());
  app.get<{ Params: { origin: 'builtin' | 'library'; id: string } }>('/api/gallery/thumb/:origin/:id', async (req, reply) => {
    const f = await galleryThumb(req.params.origin, req.params.id);
    reply.header('cache-control', 'max-age=60').type('image/png');
    return fs.createReadStream(f);
  });
  app.post<{ Body: { origin: 'builtin' | 'library'; kind: 'clip' | 'music'; id: string; newId?: string; place?: { track?: string; start: number; duration?: number; params?: Record<string, unknown> } } }>('/api/gallery/use', async (req) => {
    const store = need();
    const b = req.body;
    const id = useTemplate(b.origin, b.kind, b.id, b.newId);
    let item: Item | undefined;
    if (b.place) {
      const iid = 'i' + nid();
      await store.update((p) => {
        const kind = b.kind === 'clip' ? 'clip' : 'music';
        p.items.push({ id: iid, kind, ref: id, track: b.place!.track || trackFor(p, kind, id), start: b.place!.start, in: 0, duration: b.place!.duration || defaultDuration(kind, id), params: b.place!.params });
        p.duration = Math.max(p.duration, Math.ceil(b.place!.start + (b.place!.duration || 5)));
      });
      item = store.project.items.find((i) => i.id === iid);
    }
    if (b.kind === 'music') renderMusic(id).catch(() => {});
    return { id, item };
  });
  app.post<{ Body: { kind: 'clip' | 'music'; id: string; name?: string } }>('/api/library', async (req) => { need(); return saveToLibrary(req.body.kind, req.body.id, req.body.name); });
  app.delete<{ Params: { kind: 'clip' | 'music'; id: string } }>('/api/library/:kind/:id', async (req) => { deleteFromLibrary(req.params.kind, req.params.id); return { ok: true }; });
  app.get('/api/skills', async () => listSkills());
  app.post('/api/skills/sync', async () => { const s = need(); syncSkills(s.dir, s.project.name); return listSkills(); });

  // ---------- comments ----------
  app.get('/api/comments', async () => need().comments);
  app.post<{ Body: Partial<Comment> }>('/api/comments', async (req) => {
    const store = need();
    const c: Comment = { id: 'c' + nid(), time: Number(req.body.time) || 0, x: req.body.x ?? 0.5, y: req.body.y ?? 0.5, w: req.body.w, h: req.body.h, text: req.body.text || '', itemId: req.body.itemId, clipId: req.body.clipId, status: 'draft', createdAt: new Date().toISOString() };
    await store.updateComments((l) => { l.push(c); });
    return c;
  });
  app.patch<{ Params: { id: string }; Body: Partial<Comment> }>('/api/comments/:id', async (req) => {
    const store = need();
    await store.updateComments((l) => { const c = l.find((x) => x.id === req.params.id); if (c) Object.assign(c, req.body, { updatedAt: new Date().toISOString() }); });
    return store.comments.find((c) => c.id === req.params.id);
  });
  app.delete<{ Params: { id: string } }>('/api/comments/:id', async (req) => { const store = need(); await store.updateComments((l) => l.filter((c) => c.id !== req.params.id)); return { ok: true }; });
  app.post<{ Params: { id: string }; Body: { note: string; taskId?: string } }>('/api/comments/:id/resolve', async (req) => {
    const store = need();
    let found = false;
    await store.updateComments((l) => { const c = l.find((x) => x.id === req.params.id); if (c) { found = true; c.status = 'resolved'; c.resolution = req.body.note; c.updatedAt = new Date().toISOString(); } });
    if (!found) throw Object.assign(new Error('comment not found: ' + req.params.id), { statusCode: 404 });
    return { ok: true, id: req.params.id, status: 'resolved' };
  });
  app.post<{ Body: { ids?: string[]; agent?: 'claude' | 'codex' } }>('/api/comments/send', async (req) => { need(); return sendComments(req.body?.ids, req.body?.agent); });

  // ---------- tasks ----------
  app.get('/api/tasks', async () => listTasks());
  app.post<{ Body: { prompt: string; agent?: 'claude' | 'codex'; clipId?: string; itemId?: string; playhead?: number } }>('/api/tasks', async (req) => {
    const store = need();
    const b = req.body;
    const item = b.itemId ? store.project.items.find((i) => i.id === b.itemId) : undefined;
    const clipId = b.clipId || (item?.kind === 'clip' ? item.ref : undefined);
    const prompt = chatTaskPrompt({ prompt: b.prompt, project: store.project, playhead: b.playhead, item, clipId, hasScript: getScript().scenes.length > 0 });
    return startTask({ agent: b.agent, title: b.prompt.split('\n')[0].slice(0, 80), prompt, clipId: undefined });
  });
  app.post<{ Params: { id: string }; Body: { prompt: string } }>('/api/tasks/:id/message', async (req) => followUp(req.params.id, req.body.prompt));
  app.post<{ Params: { id: string } }>('/api/tasks/:id/cancel', async (req) => { cancelTask(req.params.id); return { ok: true }; });
  app.get('/api/agents/check', async () => {
    const check = async (cmd: string) => { try { const r = await run(cmd, ['--version']); return r.code === 0 ? r.stdout.trim().split('\n')[0] : null; } catch { return null; } };
    return { claude: await check('claude'), codex: await check('codex') };
  });

  // ---------- permission prompts (forwarded from agents) ----------
  app.post<{ Body: { taskId?: string; tool: string; input: unknown } }>('/api/agent/permission', async (req) => {
    const taskId = req.body.taskId || String(req.headers['x-studio-task'] || '');
    return permissions.request(taskId, req.body.tool, req.body.input);
  });
  app.get<{ Params: { id: string } }>('/api/agent/permission/:id', async (req) => ({ decision: permissions.poll(req.params.id) }));
  app.get('/api/permissions', async () => permissions.list());
  app.post<{ Params: { id: string }; Body: { allow: boolean; always?: boolean; message?: string } }>('/api/permissions/:id', async (req) => {
    if (!permissions.decide(req.params.id, !!req.body.allow, { always: req.body.always, message: req.body.message })) throw Object.assign(new Error('permission request not found'), { statusCode: 404 });
    return { ok: true };
  });

  // ---------- voice-over (ElevenLabs) ----------
  app.get<{ Querystring: { refresh?: string } }>('/api/voice/voices', async (req) => ({ voices: await listVoices(!!req.query.refresh), models: MODELS }));
  /** generate speech; optionally place it on the timeline (at a scene start or a time) */
  app.post<{ Body: any }>('/api/voice/tts', async (req) => {
    const store = need();
    const b = (req.body || {}) as any;
    const tid = taskOf(req);
    let text: string = b.text || '';
    let start: number | undefined = b.start;
    let name: string | undefined = b.name;
    const script = getScript();
    const sc = b.sceneId ? script.scenes.find((x) => x.id === b.sceneId) : undefined;
    if (b.sceneId && !sc) throw Object.assign(new Error('scene not found'), { statusCode: 404 });
    if (sc) { text = text || sc.voiceover || ''; start = start ?? sc.start; name = name || `scene-${script.scenes.indexOf(sc) + 1}`; if (tid) setFocus(tid, { kind: 'script', id: sc.id, at: Date.now() }); }
    const i = sc ? script.scenes.indexOf(sc) : -1;
    const r = await tts({ text, voiceId: b.voiceId, modelId: b.modelId, name, speed: b.speed, stability: b.stability, style: b.style,
      previousText: i > 0 ? script.scenes[i - 1].voiceover : undefined, nextText: i >= 0 && i < script.scenes.length - 1 ? script.scenes[i + 1].voiceover : undefined });
    await probeMedia(r.file, true);
    let item: Item | undefined;
    if (b.place !== false && start != null) {
      // one voice-over per scene: replace a previous VO item at that scene
      const p = store.project;
      let track = p.tracks.find((t) => t.kind === 'audio' && /озвуч|voice|vo/i.test(t.name)) || p.tracks.find((t) => t.kind === 'audio');
      if (!track) { track = { id: 'vo', kind: 'audio', name: 'Озвучка' }; }
      const tr = track;
      const iid = 'i' + nid();
      await store.update((pp) => {
        if (!pp.tracks.some((t) => t.id === tr.id)) pp.tracks.push(tr);
        if (sc) pp.items = pp.items.filter((x) => !(x.track === tr.id && x.kind === 'media' && x.label === `VO: ${sc.title}`));
        pp.items.push({ id: iid, kind: 'media', ref: r.file, track: tr.id, start: +start!.toFixed(3), duration: +(r.duration + 0.05).toFixed(3), in: 0, label: sc ? `VO: ${sc.title}` : 'VO', volume: 1 });
        pp.duration = Math.max(pp.duration, Math.ceil(start! + r.duration));
      });
      item = store.project.items.find((x) => x.id === iid);
      if (sc) await patchScene(sc.id, { itemIds: [...new Set([...(sc.itemIds || []), iid])] });
      recomputeTiming();
    }
    const overflow = sc ? +(r.duration - sc.duration).toFixed(2) : 0;
    return { file: r.file, duration: r.duration, words: r.words.length, cached: r.cached, voiceId: r.voiceId, modelId: r.modelId, item, sceneDuration: sc?.duration, overflow: overflow > 0 ? overflow : 0 };
  });

  // ---------- design system ----------
  app.get('/api/design', async () => (hasProject() ? getDesign() : { colors: [], type: [], motion: [], spacing: [] }));
  app.put<{ Body: any }>('/api/design', async (req) => { need(); const tid = taskOf(req); if (tid) setFocus(tid, { kind: 'design', at: Date.now() }); return saveDesign(req.body as any); });

  // ---------- board (canvas) frames ----------
  app.get<{ Querystring: { t: string; w?: string } }>('/api/board/frame', async (req, reply) => {
    need();
    const file = await boardFrame(Number(req.query.t) || 0, Math.min(960, Number(req.query.w) || 480));
    reply.header('cache-control', 'max-age=3600').type('image/jpeg');
    return fs.createReadStream(file);
  });

  // ---------- script / storyboard ----------
  app.get('/api/script', async () => { need(); return { ...getScript(), stages: STAGES }; });
  app.put<{ Body: any }>('/api/script', async (req) => { need(); const tid = taskOf(req); if (tid) setFocus(tid, { kind: 'script', at: Date.now() }); return saveScript(req.body as any); });
  app.patch<{ Body: any }>('/api/script', async (req) => { need(); return saveScript(req.body as any); });
  app.post<{ Body: any }>('/api/script/scenes', async (req) => {
    need();
    const s = getScript();
    const b = (req.body || {}) as any;
    const last = s.scenes[s.scenes.length - 1];
    const scene = { id: 's' + nid(), title: b.title || `Сцена ${s.scenes.length + 1}`, start: b.start ?? (last ? last.start + last.duration : 0), duration: b.duration ?? 4, voiceover: b.voiceover || '', visual: b.visual || '', notes: '', status: 'todo' as const, itemIds: [] };
    return saveScript({ scenes: [...s.scenes, scene] });
  });
  app.patch<{ Params: { id: string }; Body: any }>('/api/script/scenes/:id', async (req) => { need(); const tid = taskOf(req); if (tid) setFocus(tid, { kind: 'script', id: req.params.id, at: Date.now() }); return patchScene(req.params.id, req.body as any); });
  app.delete<{ Params: { id: string } }>('/api/script/scenes/:id', async (req) => { need(); const s = getScript(); return saveScript({ scenes: s.scenes.filter((x) => x.id !== req.params.id) }); });

  // ---------- versions ----------
  app.get<{ Querystring: { path?: string } }>('/api/versions', async (req) => gitLog(need().dir, req.query.path || undefined));
  app.post<{ Body: { sha: string; path: string } }>('/api/versions/restore', async (req) => {
    const store = need();
    await commit(store.dir, 'Snapshot before restore');
    await gitRestore(store.dir, req.body.sha, req.body.path);
    const sha = await commit(store.dir, `Restore ${req.body.path} to ${req.body.sha}`);
    if (req.body.path === 'project.json') { store.reload(); bus.send({ type: 'project', project: store.project }); }
    return { ok: true, sha };
  });
  app.post<{ Body: { sha: string; clipId: string } }>('/api/versions/materialize', async (req) => {
    const store = need();
    const out = store.p('.studio', 'versions', req.body.sha);
    await exportAt(store.dir, req.body.sha, `clips/${req.body.clipId}`, out);
    return { base: `/p/.studio/versions/${req.body.sha}/clips` };
  });

  // ---------- export ----------
  app.post<{ Body: any }>('/api/export', async (req) => { need(); return startExport((req.body || {}) as any); });
  app.post<{ Params: { id: string } }>('/api/export/:id/cancel', async (req) => ({ ok: cancelExport(req.params.id) }));
  app.get('/api/exports', async () => listExports());

  // ---------- settings ----------
  const publicSettings = () => { const s = getSettings(); const k = s.elevenlabsKey || ''; return { ...s, elevenlabsKey: k ? '••••' + k.slice(-4) : '', hasElevenlabsKey: !!apiKey() }; };
  app.get('/api/settings', async () => publicSettings());
  app.patch<{ Body: Record<string, unknown> }>('/api/settings', async (req) => {
    const b = { ...(req.body as any) };
    if (typeof b.elevenlabsKey === 'string' && b.elevenlabsKey.startsWith('••••')) delete b.elevenlabsKey;
    saveSettings(b);
    return publicSettings();
  });

  // ---------- agent (MCP bridge) ----------
  app.get('/api/agent/overview', async () => { need(); return overview(); });
  app.get<{ Querystring: { status?: string; clipId?: string } }>('/api/agent/comments', async (req) => {
    const store = need();
    let l = store.comments;
    const st = req.query.status;
    if (st === 'open') l = l.filter((c) => c.status === 'draft' || c.status === 'sent');
    else if (st) l = l.filter((c) => c.status === st);
    if (req.query.clipId) l = l.filter((c) => c.clipId === req.query.clipId);
    return l.map((c) => {
      const item = c.itemId ? store.project.items.find((i) => i.id === c.itemId) : undefined;
      return { ...c, clipLocalTime: item ? +(c.time - item.start + item.in).toFixed(3) : undefined, snapshot: c.snapshot ? store.p(c.snapshot) : undefined };
    });
  });
  app.post<{ Body: { clipId: string; times?: number[]; count?: number; itemId?: string } }>('/api/agent/render-clip', async (req) => {
    need();
    const r = await renderClipSheet(req.body.clipId, req.body);
    const tid = taskOf(req);
    if (tid) { taskEvent(tid, { kind: 'image', src: '/p/' + r.file, text: `${req.body.clipId} · ${r.times.length} кадр.` }); setFocus(tid, { kind: 'clip', id: req.body.clipId, at: Date.now() }); }
    return { ...r, png: r.png.toString('base64'), file: cur().p(r.file) };
  });
  app.post<{ Body: { times: number[] } }>('/api/agent/render-frame', async (req) => {
    need();
    const r = await renderFrames(req.body.times);
    const tid = taskOf(req);
    if (tid) taskEvent(tid, { kind: 'image', src: '/p/' + r.file, text: `кадр ${req.body.times.map((t) => t.toFixed(1) + 's').join(', ')}` });
    return { ...r, png: r.png.toString('base64'), file: cur().p(r.file) };
  });
  app.post<{ Body: { clipId: string } }>('/api/agent/lint-clip', async (req) => { need(); return lintClip(req.body.clipId); });
  app.get<{ Querystring: { kind?: string; q?: string } }>('/api/agent/templates', async (req) => {
    const q = (req.query.q || '').toLowerCase();
    return listGallery().filter((g) => (!req.query.kind || g.kind === req.query.kind) && (!q || JSON.stringify(g).toLowerCase().includes(q)))
      .map((g) => ({ origin: g.origin, kind: g.kind, id: g.id, name: g.name, category: g.category, description: g.description, duration: g.duration, sourceDir: path.join(g.origin === 'builtin' ? GALLERY_DIR : LIBRARY_DIR, g.kind === 'clip' ? 'clips' : 'music', g.id) }));
  });
  app.post<{ Body: { musicId: string } }>('/api/agent/render-music', async (req) => {
    const store = need();
    const info = await renderMusic(req.body.musicId, true);
    if (info.renderError) throw new Error(info.renderError);
    const a = readJson<AudioAnalysis | null>(store.p('.studio', 'analysis', `music-${req.body.musicId}.json`), null);
    const spec = store.p('.studio', 'frames', `spec-${req.body.musicId}.png`);
    await spectrogram(store.p(info.rendered!), spec);
    { const tid = taskOf(req); if (tid) taskEvent(tid, { kind: 'image', src: `/p/.studio/frames/spec-${req.body.musicId}.png?v=${Date.now()}`, text: `спектр трека ${req.body.musicId}` }); }
    return {
      summary: { ...info.meta, rendered: info.rendered, peakDbfs: a ? +(20 * Math.log10(a.peak + 1e-9)).toFixed(1) : null, loudness: a ? loudnessSparkline(a.loudness) : null, loudnessNote: 'one char ≈ ' + (a ? (a.duration / Math.min(80, a.loudness.length)).toFixed(2) : '?') + 's, ▁ quiet → █ loud', accents: a?.accents, detectedBpm: a?.bpm },
      spectrogram: fs.readFileSync(spec).toString('base64'),
    };
  });
  app.post<{ Body: { file: string } }>('/api/agent/analyze-audio', async (req) => {
    const store = need();
    const a = await analyzeMedia(req.body.file);
    const spec = store.p('.studio', 'frames', `spec-${slug(req.body.file)}.png`);
    await spectrogram(store.p('media', req.body.file), spec);
    return { summary: { duration: a.duration, bpm: a.bpm, firstBeats: a.beats.slice(0, 16), beatCount: a.beats.length, accents: a.accents, peakDbfs: +(20 * Math.log10(a.peak + 1e-9)).toFixed(1), loudness: loudnessSparkline(a.loudness) }, spectrogram: fs.readFileSync(spec).toString('base64') };
  });
  app.post<{ Body: { file: string; language?: string } }>('/api/agent/transcribe', async (req) => {
    need();
    const t = await transcribeMedia(req.body.file, req.body.language);
    return { text: t.text, words: t.words.length, sample: t.words.slice(0, 40) };
  });
  app.get<{ Querystring: { from?: string; to?: string } }>('/api/agent/timing', async (req) => {
    need();
    const t = getTiming();
    const a = req.query.from ? Number(req.query.from) : -Infinity, b = req.query.to ? Number(req.query.to) : Infinity;
    const inR = (x: number) => x >= a && x <= b;
    return { bpm: t.bpm, beats: t.beats.filter(inR).slice(0, 400), bars: t.bars.filter(inR), sections: t.sections, markers: t.markers.filter((m) => inR(m.time)), words: t.words.filter((w) => inR(w.start)).slice(0, 600) };
  });
  void HOME_DIR;
}
