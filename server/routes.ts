import { msg, uerr } from './i18n.ts';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import type { Comment, Item, Project, PackageManifest, AgentKind, Reference, Task } from '../shared/types.ts';
import { ROOT, GALLERY_DIR, LIBRARY_DIR, PROJECTS_DIR, getSettings, saveSettings, getRecents, HOME_DIR, maskSettings, unmaskPatch } from './config.ts';
import { cur, hasProject, openProject, ProjectStore, MEDIA_EXT, pbase, runIn, openStores, projectId } from './project.ts';
import { bus } from './bus.ts';
import { nid, readJson, writeJson, copyDir, slug, safeJoin, run, sha1 } from './util.ts';
import sharp from 'sharp';
import { bin } from './bin.ts';
import { log as gitLog, restore as gitRestore, exportAt, commit } from './git.ts';
import { listGallery, galleryThumb, galleryPreview, previewPath, useTemplate, saveToLibrary, deleteFromLibrary } from './gallery.ts';
import { listSkills, syncSkills } from './skills.ts';
import { probeMedia, analyzeMedia, transcribeMedia } from './media.ts';
import { renderMusic, musicPeaks } from './render/music.ts';
import { clipUrl, itemInput, renderClipFrames } from './render/clips.ts';
import { compositeFrame, compositeFrames, sheet, annotate, startExport, getJobs, cancelExport, getManifest } from './render/compose.ts';
import { getTiming, recomputeTiming } from './timing.ts';
import { spectrogram, loudnessSparkline, type AudioAnalysis } from './audio/analyze.ts';
import { startReview, reviewStatus, doneGate } from './taste/critic.ts';
import { itemBefore, itemAfter, designEdit, exported } from './taste/signals.ts';
import { getTask } from './agents/runner.ts';
import { rateTask } from './agents/runner.ts';
import { recordTaste, sceneTaste, tasteStatus, saveTasteProfile, distillTaste, forgetTaste } from './taste/memory.ts';
import { startTask, followUp, cancelTask, listTasks, taskEvent, setFocus, interruptTask, steerTask, takeSteer, setTaskOptions, askUser, answerOf, answerQuestion, delegateTask, waitSubagents, children } from './agents/runner.ts';
import { getScript, saveScript, patchScene, STAGES } from './script.ts';
import { getDesign, saveDesign } from './design.ts';
import { boardFrame } from './render/board.ts';
import { listVoices, tts, MODELS, apiKey } from './voice/elevenlabs.ts';
import { voiceScene, cleanupTakes, voicePace } from './voice/voiceover.ts';
import { listInspiration, getInspiration, inspirationThumb, inspirationPreview, inspirationPreviewPath, searchInspiration, inspirationCategories } from './inspiration.ts';
import { projectTracks } from './tracks.ts';
import { blenderBin, listScenes3d, getScene3d, createScene3d, render3d, listJobs3d, openInBlender } from './blender.ts';
import { paceReport } from './voice/speech.ts';
import { TRANSITIONS, EFFECTS, MASKS, BLENDS } from '../shared/fx.ts';
import { recordWeb, defaultWebActions, recordJobs, emitJob, type RecordJob } from './record/web.ts';
import { recordScreen, listApps } from './record/screen.ts';
import { registerWebSessionRoutes } from './record/session.ts';
import { createVariant, family, variantPrompt } from './variants.ts';
import { commentTaskPrompt, chatTaskPrompt } from './agents/prompts.ts';
import * as permissions from './permissions.ts';
import { registerToolkitRoutes } from './toolkit/routes.ts'; // media toolkit (server/toolkit)
import { runOpAndWait } from './toolkit/index.ts';
import { pageMedia } from './toolkit/ops/web.ts';
import { musicReportFor } from './audio/report.ts'; // music QA report (server/audio/report.ts)
import { registerGenerateRoutes } from './generate/routes.ts'; // generative footage (server/generate)

const SKELETONS = path.join(ROOT, 'server', 'skeletons');

const LANG_NAMES: Record<string, string> = { en: 'English', ru: 'Russian', es: 'Spanish', de: 'German', fr: 'French', pt: 'Portuguese', zh: 'Chinese (Simplified)', ja: 'Japanese' };
/** agents work in English but talk to the user in the UI language */
function langLine(code?: string) {
  if (!code || code === 'en' || !LANG_NAMES[code]) return '';
  return `\n\n(Write your replies and summaries for the user in ${LANG_NAMES[code]}. Keep code, file names, ids and tool arguments in English unless the content itself must be in another language. Text the user sees in the editor — params.json "label"s, scene titles, track and item labels — is in ${LANG_NAMES[code]} too.)`;
}

/** the track a new item goes to: the first compatible track that is free over [start, start + duration) — so an item
 *  added on top of another doesn't land on the same track and hide it — else the first compatible one */
function trackFor(p: Project, kind: Item['kind'], ref: string, span?: { start: number; duration: number }): string {
  let want: string[] = ['graphics'];
  if (kind === 'music') want = ['music', 'audio'];
  if (kind === 'media') {
    const t = MEDIA_EXT[path.extname(ref).toLowerCase()];
    want = t === 'audio' ? ['audio', 'music'] : ['video', 'graphics'];
  }
  if (span) {
    const free = (id: string) => !p.items.some((i) => i.track === id && i.start < span.start + span.duration - 1e-3 && i.start + i.duration > span.start + 1e-3);
    for (const k of want) { const tr = p.tracks.find((t) => t.kind === k && free(t.id)); if (tr) return tr.id; }
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
  if (!hasProject()) return { project: null, recents: getRecents(), projectsDir: PROJECTS_DIR, settings: { ...maskSettings(getSettings()), elevenlabsKey: '' } };
  const store = cur();
  return {
    pid: store.id,
    dir: store.dir,
    project: store.project,
    comments: store.comments,
    clips: store.listClips(),
    music: store.listMusic(),
    media: store.listMedia(),
    tasks: listTasks(),
    settings: { ...maskSettings(getSettings()), hasElevenlabsKey: !!apiKey() },
    skills: listSkills(),
    jobs: getJobs(),
    permissions: (() => { const own = new Set(listTasks().map((x) => x.id)); return permissions.list().filter((x) => own.has(x.taskId)); })(),
    script: getScript(),
    design: getDesign(),
    boardNotes: readJson<{ notes: any[] }>(cur().p('board.json'), { notes: [] }).notes,
    references: readJson<{ references: any[] }>(cur().p('references.json'), { references: [] }).references,
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

function createClipPackage(id: string, name: string, description = '', duration = 4, template: '2d' | '3d' = '2d') {
  const store = cur();
  const cid = slug(id);
  const dir = store.p('clips', cid);
  if (fs.existsSync(dir)) throw new Error(`clip ${cid} already exists`);
  copyDir(path.join(SKELETONS, template === '3d' ? 'clip3d' : 'clip'), dir);
  writeJson(path.join(dir, 'manifest.json'), { id: cid, kind: 'clip', name, description, category: 'custom', tags: template === '3d' ? ['3d'] : [], duration } satisfies PackageManifest);
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
  // one batch through a couple of renderer pages (not a fresh page per time)
  const r = await compositeFrames(times, { fmt: 'png', workers: 2 });
  const shots = r.frames.map((png, i) => ({ png, caption: `t=${times[i].toFixed(2)}s` }));
  const errors = r.errors;
  const png = shots.length === 1 ? shots[0].png : await sheet(shots, { cols: shots.length <= 4 ? 2 : 3, checker: false });
  const file = `.studio/frames/frame-${Date.now().toString(36)}.png`;
  fs.writeFileSync(store.p(file), png);
  return { png, times, errors: [...new Set(errors)], file };
}

/** fraction of pixels whose RGBA differs by more than a small tolerance */
async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  if (a.equals(b)) return 0;
  const raw = async (png: Buffer) => (await new Promise<Buffer>((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=480:-1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
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

async function sendComments(ids: string[] | undefined, agent?: 'claude' | 'codex', lang = '') {
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
    const prompt = commentTaskPrompt({ clipId, item, project: p, comments: list, snapshots }) + lang;
    const task = startTask({ agent, title: `${list.length} comment${list.length > 1 ? 's' : ''} on ${clipId || 'timeline'}`, prompt, clipId, commentIds: list.map((c) => c.id), images: snapshots.map((s) => store.p(s)) });
    await store.updateComments((all) => { for (const c of all) { const m = list.find((x) => x.id === c.id); if (m) { c.status = 'sent'; c.taskId = task.id; c.snapshot = m.snapshot; c.updatedAt = new Date().toISOString(); } } });
    created.push(task);
  }
  return created;
}

/** model / effort from the chat: aliases or full ids (letters, digits, . - _ :), effort from the known levels */
const cleanModel = (m?: string) => (m && /^[\w.:-]{1,80}$/.test(m) ? m : undefined);
const cleanEffort = (e?: string) => (['low', 'medium', 'high', 'xhigh', 'max'].includes(String(e)) ? (e as Task['effort']) : undefined);
function setTaskModel(id: string, b: { model?: string; effort?: string; autopilot?: boolean }) {
  if (b.model === undefined && b.effort === undefined && b.autopilot === undefined) return;
  setTaskOptions(id, { model: b.model === undefined ? undefined : b.model === '' ? '' : cleanModel(b.model), effort: b.effort === undefined ? undefined : b.effort === '' ? '' : cleanEffort(b.effort), autopilot: b.autopilot === undefined ? undefined : !!b.autopilot });
}

export async function registerRoutes(app: FastifyInstance) {
  const taskOf = (req: { headers: Record<string, unknown> }) => String(req.headers['x-studio-task'] || '');
  const need = () => { if (!hasProject()) throw Object.assign(new Error('no project open'), { statusCode: 409 }); return cur(); };
  // the art director only looks: it may render and read, never change the project
  const CRITIC_OK = /^\/api\/agent\/(render-clip|render-frame|taste-audit|inspiration|steer|lint-clip|watch-video)\b/;
  app.addHook('preHandler', async (req) => {
    const tid = req.headers['x-studio-task'];
    if (!tid || req.method === 'GET' || CRITIC_OK.test(req.url.replace(/^\/p\/[^/]+/, ''))) return;
    if (getTask(String(tid))?.role === 'critic') throw Object.assign(new Error('The art director only reviews — it cannot change the project. Put the change into your verdict.'), { statusCode: 403 });
  });

  // ---------- state & projects ----------
  app.get('/api/state', async () => state());
  app.get('/api/projects', async () => {
    const dirs = fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR).map((d) => path.join(PROJECTS_DIR, d)).filter((d) => ProjectStore.exists(d)) : [];
    const all = [...new Set([...getRecents(), ...dirs])];
    return { current: hasProject() ? cur().dir : null, open: openStores().map((s) => s.dir), ids: Object.fromEntries(all.map((d) => [d, projectId(d)])), recents: getRecents(), projects: [...new Set([...getRecents(), ...dirs])], projectsDir: PROJECTS_DIR };
  });
  app.post<{ Body: { path: string } }>('/api/projects/open', async (req) => {
    const dir = path.resolve(req.body.path.replace(/^~/, process.env.HOME || ''));
    if (!ProjectStore.exists(dir)) throw Object.assign(new Error('not a project folder (no project.json): ' + dir), { statusCode: 400 });
    // the response describes the newly opened project (the tab switches to it)
    return runIn(openProject(dir), state);
  });
  app.post<{ Body: { name: string; path?: string; width?: number; height?: number; fps?: number } }>('/api/projects/create', async (req) => {
    const name = req.body.name || 'Untitled';
    const dir = path.resolve((req.body.path || path.join(PROJECTS_DIR, slug(name))).replace(/^~/, process.env.HOME || ''));
    if (ProjectStore.exists(dir)) throw Object.assign(new Error('project already exists at ' + dir), { statusCode: 400 });
    await ProjectStore.create(dir, { name, width: req.body.width, height: req.body.height, fps: req.body.fps });
    syncSkills(dir, name);
    await commit(dir, 'Add agent skills');
    return runIn(openProject(dir), state);
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
      const start = Math.max(0, Number(b.start) || 0), duration = Number(b.duration) || defaultDuration(b.kind, b.ref);
      const it: Item = {
        id, kind: b.kind, ref: b.ref, track: b.track || trackFor(p, b.kind, b.ref, { start, duration }), start, in: Number(b.in) || 0,
        duration, label: b.label, params: b.params, opacity: b.opacity, volume: b.volume, transform: b.transform,
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
    const byUser = !taskOf(req);
    if (byUser) itemBefore(store.project.items.find((i) => i.id === req.params.id));
    await store.update((p) => {
      const it = p.items.find((i) => i.id === req.params.id);
      if (!it) throw Object.assign(new Error('item not found'), { statusCode: 404 });
      const { params, ...rest } = req.body;
      Object.assign(it, rest);
      if (params) it.params = { ...(it.params || {}), ...params };
      p.duration = Math.max(p.duration, Math.ceil(it.start + it.duration));
    });
    recomputeTiming();
    const after = store.project.items.find((i) => i.id === req.params.id);
    if (byUser) itemAfter(after); // taste: what the user changes by hand
    return after;
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
  app.get('/api/tracks', async () => (hasProject() ? projectTracks(cur().dir, cur().project) : {}));
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
  app.post<{ Body: { id: string; name: string; description?: string; duration?: number; template?: '2d' | '3d' } }>('/api/clips', async (req) => {
    need();
    const id = createClipPackage(req.body.id || req.body.name, req.body.name || req.body.id, req.body.description, req.body.duration, req.body.template === '3d' ? '3d' : '2d');
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
  // ---------- 3D (Blender): scenes as code, rendered in stages mock → look → final ----------
  app.get('/api/3d', async () => { need(); return { blender: blenderBin(), scenes: listScenes3d(), jobs: listJobs3d() }; });
  app.post<{ Body: any }>('/api/3d', async (req) => { need(); const tid = taskOf(req); const r = createScene3d((req.body || {}) as any); if (tid) setFocus(tid, { kind: 'clip', id: r.manifest.id, at: Date.now() }); return r; });
  app.get<{ Params: { id: string } }>('/api/3d/:id', async (req) => { need(); return getScene3d(req.params.id); });
  app.post<{ Params: { id: string }; Body: { quality?: 'mock' | 'look' | 'final'; mode?: 'stills' | 'animation'; times?: number[]; place?: any; wait?: boolean } }>('/api/3d/:id/render', async (req) => {
    need();
    const tid = taskOf(req);
    const b = req.body || {};
    const { job, done } = render3d(req.params.id, b);
    if (b.wait === false) return job;
    const r = await done;
    if (r.status === 'error') throw uerr('3D render failed: {error}', { error: r.error || '' });
    if (tid && r.sheet) taskEvent(tid, { kind: 'image', src: pbase() + '/' + r.sheet + '?v=' + Date.now(), ...msg('3D {id} · {q}', { id: req.params.id, q: r.quality }) });
    return { ...r, image: r.sheet ? fs.readFileSync(cur().p(r.sheet)).toString('base64') : undefined };
  });
  app.get<{ Params: { jid: string } }>('/api/3d/jobs/:jid', async (req) => { need(); const j = listJobs3d().find((x) => x.id === req.params.jid); if (!j) throw uerr('Not found', {}, 404); return j; });
  app.post<{ Params: { id: string } }>('/api/3d/:id/open', async (req) => { need(); return openInBlender(req.params.id); });

  // ---------- inspiration (curated real-world motion: link + breakdown) ----------
  app.get('/api/inspiration', async () => listInspiration().map(({ breakdown, ...x }) => ({ ...x, breakdown: breakdown.slice(0, 280) })));
  // for agents: search the inspiration library (motion graphics + editing) — to learn principles, never to copy
  app.get<{ Querystring: { q?: string; group?: string; category?: string; limit?: string } }>('/api/agent/inspiration', async (req) => ({
    rule: 'Learn the principle (pacing, structure, technique, why it works) and apply it in THIS project\'s own style, story and design system. Never recreate a piece 1:1: no copied shots, layouts, copy, characters, music, logos or brand assets.',
    categories: inspirationCategories(),
    results: searchInspiration({ query: req.query.q, group: req.query.group, category: req.query.category, limit: Number(req.query.limit) || undefined }),
  }));
  app.get<{ Params: { id: string } }>('/api/inspiration/:id', async (req) => { const x = getInspiration(req.params.id); if (!x) throw uerr('Not found', {}, 404); return x; });
  // the still of our mini-scene (the frame that shows what we take)
  app.get<{ Params: { id: string } }>('/api/inspiration/:id/thumb', async (req, reply) => {
    const f = await inspirationThumb(req.params.id);
    if (!f) return reply.code(404).send({ error: 'no preview' });
    reply.header('cache-control', 'max-age=60').type('image/png');
    return fs.createReadStream(f);
  });
  /** looping preview of a moving mini-scene; 202 while it is being rendered (the UI shows the still meanwhile), 404 for a still-only entry */
  app.get<{ Params: { id: string } }>('/api/inspiration/:id/preview', async (req, reply) => {
    const f = inspirationPreviewPath(req.params.id);
    if (!f) return reply.code(404).send({ error: 'no loop' });
    if (fs.existsSync(f)) { reply.header('cache-control', 'max-age=86400'); return reply.sendFile(path.basename(f), path.dirname(f)); }
    inspirationPreview(req.params.id, true).catch(() => {});
    return reply.code(202).send({ pending: true });
  });

  /** looping preview video for the live gallery; 202 while it is being rendered (the UI shows the still meanwhile) */
  app.get<{ Params: { origin: 'builtin' | 'library'; id: string } }>('/api/gallery/preview/:origin/:id', async (req, reply) => {
    const f = previewPath(req.params.origin, req.params.id);
    if (fs.existsSync(f)) { reply.header('cache-control', 'max-age=86400'); return reply.sendFile(path.basename(f), path.dirname(f)); }
    galleryPreview(req.params.origin, req.params.id, true).catch(() => {});
    return reply.code(202).send({ pending: true });
  });
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
        const mf = readJson<any>(store.p(kind === 'clip' ? 'clips' : 'music', id, 'manifest.json'), {});
        const duration = b.place!.duration || defaultDuration(kind, id);
        p.items.push({ id: iid, kind, ref: id, track: b.place!.track || trackFor(p, kind, id, { start: b.place!.start, duration }), start: b.place!.start, in: 0, duration, params: b.place!.params, ...(mf.transform ? { transform: mf.transform } : {}), ...(mf.fx ? { fx: mf.fx } : {}) });
        p.duration = Math.max(p.duration, Math.ceil(b.place!.start + (b.place!.duration || 5)));
      });
      item = store.project.items.find((i) => i.id === iid);
    }
    if (b.kind === 'music') renderMusic(id).catch(() => {});
    return { id, item };
  });
  app.post<{ Body: { kind: 'clip' | 'music'; id: string; name?: string } }>('/api/library', async (req) => { need(); return saveToLibrary(req.body.kind, req.body.id, req.body.name); });
  /** save a timeline item's current settings as a reusable style (template copy with these params as defaults) */
  app.post<{ Body: { itemId: string; name?: string } }>('/api/library/style', async (req) => {
    const store = need();
    const it = store.project.items.find((i) => i.id === req.body.itemId);
    if (!it || it.kind !== 'clip') throw Object.assign(new Error('select a graphics clip'), { statusCode: 400 });
    const info = store.clipInfo(it.ref)!;
    const id = slug(`${it.ref}-style-${nid().slice(0, 4)}`);
    const dst = path.join(LIBRARY_DIR, 'clips', id);
    copyDir(store.p('clips', it.ref), dst);
    const pf = path.join(dst, 'params.json');
    const pj = readJson<{ schema: Record<string, any> }>(pf, { schema: {} });
    for (const [k, v] of Object.entries(it.params || {})) {
      if (pj.schema[k]) pj.schema[k] = { ...pj.schema[k], default: v };
      else if (k.startsWith('__')) pj.schema[k] = { type: 'number', default: v, hidden: true };
    }
    writeJson(pf, pj);
    const name = req.body.name || `${info.name} · my style`;
    writeJson(path.join(dst, 'manifest.json'), { ...readJson(path.join(dst, 'manifest.json'), {}), id, kind: 'clip', name, source: `style:${it.ref}`, duration: +(it.duration).toFixed(2), transform: it.transform, fx: it.fx });
    return { id, name };
  });
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
  app.post<{ Params: { id: string }; Body: { reason: string } }>('/api/comments/:id/dismiss', async (req) => {
    const store = need();
    const c = store.comments.find((x) => x.id === req.params.id);
    if (!c) throw Object.assign(new Error('comment not found: ' + req.params.id), { statusCode: 404 });
    await store.updateComments((l) => l.filter((x) => x.id !== c.id));
    bus.send({ type: 'notice', level: 'info', ...msg('The agent removed the obsolete note “{note}”: {reason}', { note: c.text.slice(0, 60), reason: req.body.reason }) });
    return { ok: true, id: c.id, deleted: true };
  });
  app.post<{ Body: { ids?: string[]; agent?: 'claude' | 'codex'; lang?: string } }>('/api/comments/send', async (req) => {
    need();
    for (const c of cur().comments.filter((x) => x.status === 'draft' && x.text.trim() && (!req.body?.ids || req.body.ids.includes(x.id)))) recordTaste({ kind: 'comment', text: `The user's note on the frame at ${c.time.toFixed(1)} s${c.clipId ? ` (clip ${c.clipId})` : ''}: “${c.text.trim()}”` });
    return sendComments(req.body?.ids, req.body?.agent, langLine(req.body?.lang)); });

  // ---------- tasks ----------
  app.get('/api/tasks', async () => listTasks());
  app.post<{ Body: { prompt: string; agent?: 'claude' | 'codex'; clipId?: string; itemId?: string; playhead?: number; model?: string; effort?: Task['effort'] } }>('/api/tasks', async (req) => {
    const store = need();
    const b = req.body;
    const item = b.itemId ? store.project.items.find((i) => i.id === b.itemId) : undefined;
    const clipId = b.clipId || (item?.kind === 'clip' ? item.ref : undefined);
    const prompt = chatTaskPrompt({ prompt: b.prompt, project: store.project, playhead: b.playhead, item, clipId, hasScript: getScript().scenes.length > 0 });
    return startTask({ agent: b.agent, title: b.prompt.split('\n')[0].slice(0, 80), prompt: prompt + langLine((b as any).lang), clipId: undefined, model: cleanModel(b.model), effort: cleanEffort(b.effort), autopilot: !!(b as any).autopilot });
  });
  app.post<{ Params: { id: string }; Body: { prompt: string; images?: string[]; lang?: string; model?: string; effort?: Task['effort'] } }>('/api/tasks/:id/message', async (req) => { setTaskModel(req.params.id, req.body); return followUp(req.params.id, req.body.prompt + langLine(req.body.lang), req.body.images || []); });
  app.post<{ Params: { id: string }; Body: { prompt: string; images?: string[]; lang?: string; model?: string; effort?: Task['effort'] } }>('/api/tasks/:id/interrupt', async (req) => { setTaskModel(req.params.id, req.body); return interruptTask(req.params.id, req.body.prompt + langLine(req.body.lang), req.body.images || []); });
  // a message for the running agent that does NOT stop it: delivered at its next step (hook / next studio tool result)
  app.post<{ Params: { id: string }; Body: { prompt: string; images?: string[] } }>('/api/tasks/:id/steer', async (req) => steerTask(req.params.id, req.body.prompt, req.body.images || []));
  app.get('/api/agent/steer', async (req) => { const tid = taskOf(req); return { text: tid ? takeSteer(tid) : '' }; });
  // ask_user: the agent asks (with draft options); the MCP bridge polls for the answer
  app.post<{ Body: { question: string; options?: { label: string; description?: string; image?: string }[]; multi?: boolean } }>('/api/agent/ask', async (req) => {
    const tid = taskOf(req);
    if (!tid) throw uerr('ask_user works only inside an editor task');
    return askUser(tid, req.body || ({} as any));
  });
  app.get<{ Params: { qid: string } }>('/api/agent/ask/:qid', async (req) => { const tid = taskOf(req); return { answer: tid ? answerOf(tid, req.params.qid) : 'no task' }; });
  // switch a task to / from autopilot while it runs (an open question is then answered with "you decide")
  app.post<{ Params: { id: string }; Body: { autopilot?: boolean } }>('/api/tasks/:id/options', async (req) => {
    setTaskModel(req.params.id, { autopilot: req.body?.autopilot });
    const t = listTasks().find((x) => x.id === req.params.id);
    if (req.body?.autopilot && t?.question && t.question.answer == null) answerQuestion(req.params.id, '');
    return { ok: true };
  });
  app.post<{ Params: { id: string }; Body: { answer: string } }>('/api/tasks/:id/answer', async (req) => answerQuestion(req.params.id, String(req.body?.answer ?? '')));
  // 👍 / 👎 on a finished task — stored on the task and learned by the taste memory
  app.post<{ Params: { id: string }; Body: { value: number; note?: string } }>('/api/tasks/:id/rate', async (req) => {
    const v = Number(req.body?.value);
    if (v !== 1 && v !== -1) throw Object.assign(new Error('value must be 1 or -1'), { statusCode: 400 });
    return rateTask(req.params.id, v, req.body?.note ? String(req.body.note) : undefined);
  });
  // ---------- taste memory (global, learned from the user's choices) ----------
  app.get('/api/taste', async () => tasteStatus());
  app.put<{ Body: { profile: string } }>('/api/taste', async (req) => saveTasteProfile(String(req.body?.profile ?? '')));
  app.post('/api/taste/distill', async () => { const r = await distillTaste(true); return { ...tasteStatus(), distilled: r.events }; });
  app.delete('/api/taste', async () => forgetTaste());
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
  app.get<{ Params: { id: string } }>('/api/agent/permission/:id', async (req) => { const d = permissions.poll(req.params.id); return d === 'unknown' ? { decision: null, unknown: true } : { decision: d }; });
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
    let r: Awaited<ReturnType<typeof tts>>;
    let pace: Awaited<ReturnType<typeof voiceScene>> | undefined;
    if (sc && !b.text) {
      // scene: speech text + takes + pace check (see server/voice/voiceover.ts)
      pace = await voiceScene(sc, script.scenes, { voiceId: b.voiceId, modelId: b.modelId, name, speed: b.speed, stability: b.stability, style: b.style, maxTakes: b.takes });
      r = pace.take;
      cleanupTakes(r.file, pace.takes);
    } else {
      r = await tts({ text, voiceId: b.voiceId, modelId: b.modelId, name, speed: b.speed, stability: b.stability, style: b.style });
    }
    await probeMedia(r.file, true);
    let item: Item | undefined;
    if (b.place !== false && start != null) {
      // one voice-over per scene: replace a previous VO item at that scene
      const p = store.project;
      let track = p.tracks.find((t) => t.kind === 'audio' && /озвуч|voice|vo/i.test(t.name)) || p.tracks.find((t) => t.kind === 'audio');
      if (!track) { track = { id: 'vo', kind: 'audio', name: 'Voice-over' }; }
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
    if (sc && pace) await patchScene(sc.id, { vo: { file: r.file, rate: pace.report.rate, flagged: pace.report.flagged, takes: pace.takes.length, at: new Date().toISOString() } });
    return {
      file: r.file, duration: r.duration, words: r.words.length, cached: r.cached, voiceId: r.voiceId, modelId: r.modelId, item, sceneDuration: sc?.duration, overflow: overflow > 0 ? overflow : 0,
      ...(pace ? { pace: { rate: pace.report.rate, projectRate: pace.ref, flagged: pace.report.flagged, takes: pace.takes, sentences: pace.report.sentences.filter((x) => x.flag).map((x) => ({ text: x.text, rate: x.rate, dev: x.dev, flag: x.flag })), gaps: pace.report.gaps, usedSpeechText: !!sc?.speech } } : {}),
    };
  });
  /** pace report for the voice-over already generated for each scene (from the saved word timings) */
  app.get('/api/voice/report', async () => {
    need();
    const ref = voicePace();
    return getScript().scenes.map((sc, n) => {
      const tr = sc.vo ? readJson<any>(cur().p('.studio', 'transcripts', sc.vo.file + '.json'), null) : null;
      const rep = tr ? paceReport(tr.spokenWords || tr.words, ref) : null;
      return { sceneId: sc.id, n: n + 1, title: sc.title, hasSpeech: !!sc.speech, file: sc.vo?.file, rate: rep?.rate, projectRate: ref, flagged: rep?.flagged, sentences: rep?.sentences.filter((x) => x.flag), gaps: rep?.gaps };
    });
  });

  // ---------- design system ----------
  app.get('/api/design', async () => (hasProject() ? getDesign() : { colors: [], type: [], motion: [], spacing: [] }));
  app.put<{ Body: any }>('/api/design', async (req) => { need(); const tid = taskOf(req); if (tid) setFocus(tid, { kind: 'design', at: Date.now() }); else designEdit(getDesign(), req.body || {}); return saveDesign(req.body as any); });

  app.get('/api/fx', async () => ({ transitions: TRANSITIONS, effects: EFFECTS.map((e) => ({ type: e.type, name: e.name, group: e.group, params: e.params.map((p) => ({ key: p.key, min: p.min, max: p.max, default: p.def })), options: e.options })), masks: MASKS, blends: BLENDS.map((b) => b.mode) }));

  // ---------- board notes (comments on board objects) ----------
  // ---------- references (techniques, images/videos, links the video should follow) ----------
  const refsFile = () => cur().p('references.json');
  const readRefs = () => readJson<{ references: Reference[] }>(refsFile(), { references: [] }).references;
  const writeRefs = (list: Reference[]) => { writeJson(refsFile(), { references: list }); bus.send({ type: 'references', references: list }); return list; };
  app.get('/api/references', async () => { need(); return readRefs(); });
  app.post<{ Body: Partial<Reference> }>('/api/references', async (req) => {
    need();
    const b = req.body || {};
    if (!b.kind || !b.ref) throw uerr('kind and ref are required');
    const list = readRefs();
    const same = list.find((r) => r.kind === b.kind && r.ref === b.ref);
    if (same) {
      // adding again binds it to more scenes
      const sceneIds = [...new Set([...(same.sceneIds || []), ...(b.sceneIds || [])])];
      return writeRefs(list.map((r) => (r === same ? { ...r, sceneIds, note: b.note || r.note } : r)));
    }
    const r: Reference = { id: 'r' + nid(), kind: b.kind as Reference['kind'], ref: String(b.ref), origin: b.origin, title: b.title || String(b.ref), note: b.note || '', sceneIds: b.sceneIds || [], thumb: b.thumb, addedAt: new Date().toISOString() };
    return writeRefs([...list, r]);
  });
  /** a link dropped into the chat / references: direct images & videos are downloaded into media/, pages are kept as links (title + share image) */
  app.post<{ Body: { url: string; sceneIds?: string[]; note?: string } }>('/api/references/link', async (req) => {
    need();
    let url: URL;
    try { url = new URL(String(req.body?.url || '').trim()); } catch { throw uerr('Not a valid URL: {url}', { url: req.body?.url }); }
    if (!/^https?:$/.test(url.protocol)) throw uerr('Only http(s) links can be imported');
    const sceneIds = req.body.sceneIds || [];
    const direct = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|m4v|mp3|m4a|wav)$/i.test(url.pathname);
    const videoPage = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/i.test(url.hostname);
    if (direct) {
      const j = await runOpAndWait('import_url', { url: url.href });
      const file = String((j.outputs as any)?.files?.files?.[0] || '').replace(/^media\//, '');
      if (file) { await probeMedia(file); return writeRefs([...readRefs(), { id: 'r' + nid(), kind: 'media', ref: file, title: file, note: req.body.note || '', sceneIds, addedAt: new Date().toISOString() } as Reference]); }
    }
    // a page: keep the link, with its title and share image for the card
    let title = url.hostname + url.pathname.replace(/\/$/, ''), thumb: string | undefined;
    try {
      const res = await fetch(url.href, { headers: { 'user-agent': 'Mozilla/5.0 Smashcut', accept: 'text/html' }, signal: AbortSignal.timeout(8000) });
      const html = (await res.text()).slice(0, 2_000_000);
      const t = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i.exec(html)?.[1] || /<title[^>]*>([^<]{1,200})/i.exec(html)?.[1];
      if (t) title = t.trim().replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').slice(0, 120);
      const og = pageMedia(html, url.href).og[0];
      if (og) {
        // keep a small local copy: many sites refuse hot-linking their share images
        const img = await fetch(og, { headers: { 'user-agent': 'Mozilla/5.0 Smashcut', referer: url.href }, signal: AbortSignal.timeout(8000) });
        if (img.ok) {
          const rel = `.studio/refs/${sha1(og).slice(0, 12)}.jpg`;
          fs.mkdirSync(cur().p('.studio', 'refs'), { recursive: true });
          await sharp(Buffer.from(await img.arrayBuffer())).resize(320, 320, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(cur().p(rel));
          thumb = `/p/${cur().id}/${rel}`;
        }
      }
    } catch { /* offline or blocked: a plain link */ }
    const list = readRefs();
    if (list.some((r) => r.kind === 'link' && r.ref === url.href)) return list;
    return writeRefs([...list, { id: 'r' + nid(), kind: 'link', ref: url.href, title, thumb, note: (videoPage ? 'video page — watch_video {url} watches it (edit, motion, sound). ' : '') + (req.body.note || ''), sceneIds, addedAt: new Date().toISOString() } as Reference]);
  });
  app.patch<{ Params: { id: string }; Body: Partial<Reference> }>('/api/references/:id', async (req) => { need(); return writeRefs(readRefs().map((r) => (r.id === req.params.id ? { ...r, ...req.body, id: r.id } : r))); });
  app.delete<{ Params: { id: string } }>('/api/references/:id', async (req) => { need(); return writeRefs(readRefs().filter((r) => r.id !== req.params.id)); });
  /** for agents: references with what to read for each */
  app.get('/api/agent/references', async () => {
    need();
    const scenes = getScript().scenes;
    return readRefs().map((r) => ({
      id: r.id, kind: r.kind, title: r.title, note: r.note || undefined,
      scenes: (r.sceneIds || []).map((id) => { const i = scenes.findIndex((s) => s.id === id); return i >= 0 ? `${i + 1}:${scenes[i].title} (${id})` : id; }),
      appliesTo: r.sceneIds?.length ? 'listed scenes' : 'the whole video',
      ...(r.kind === 'inspiration' ? (() => { const x = getInspiration(r.ref); return x ? { by: x.by, year: x.year, url: x.url, take: x.take, techniques: x.techniques, breakdown: x.breakdown, demo: `gallery/inspiration/${x.id}/clip.js` } : {}; })() : {}),
      howToRead: r.kind === 'inspiration' ? '`take` is the ONE thing to borrow from this piece; `demo` is our own mini-scene that re-creates just that (a clip package: read its clip.js to see how it is built). The breakdown describes the whole piece — apply the technique in the project style (never copy the brand/assets). If the URL is a video link, watch_video {url} lets you see its edit and motion.' : r.kind === 'technique' ? `get_technique {id: "${r.ref}"}` : r.kind === 'music-technique' ? `get_technique {id: "${r.ref}", kind: "music"}` : r.kind === 'media' ? (/\.(mp4|mov|webm|mkv|m4v)$/i.test(r.ref) ? `video: watch_video {file:"media/${r.ref}"} — shots, contact sheet, motion strips, sound and the rhythm of the edit` : `Read media/${r.ref} (look at it)`) : `WebFetch ${r.ref} to read the page; run_media_tool {op:"import_url", params:{url:"${r.ref}"}} brings its image (pick=all: every picture, pick=video / video sites: the video) into media/ to look at or use; a video link / page with a video: watch_video {url:"${r.ref}"} to see its edit, motion and sound`,
    }));
  });

  const notesFile = () => cur().p('board.json');
  const readNotes = () => readJson<{ notes: any[] }>(notesFile(), { notes: [] }).notes;
  const writeNotes = (notes: any[]) => { writeJson(notesFile(), { notes }); bus.send({ type: 'board', notes } as any); return notes; };
  app.get('/api/board/notes', async () => { need(); return readNotes(); });
  app.post<{ Body: any }>('/api/board/notes', async (req) => {
    need();
    const b = req.body as any;
    const note = { id: 'n' + nid(), anchors: b.anchors || [], labels: b.labels || [], text: String(b.text || ''), taskId: b.taskId, createdAt: new Date().toISOString() };
    writeNotes([...readNotes(), note]);
    if (!taskOf(req) && note.text.trim()) recordTaste({ kind: 'comment', text: `The user's note on the board${note.labels.length ? ` about ${note.labels.slice(0, 4).join(', ')}` : ''}: “${note.text.trim()}”` });
    return note;
  });
  app.patch<{ Params: { id: string }; Body: any }>('/api/board/notes/:id', async (req) => { need(); return writeNotes(readNotes().map((n) => (n.id === req.params.id ? { ...n, ...(req.body as any), id: n.id } : n))); });
  app.delete<{ Params: { id: string } }>('/api/board/notes/:id', async (req) => { need(); return writeNotes(readNotes().filter((n) => n.id !== req.params.id)); });
  // agent side: resolve (fixed) or delete (obsolete) a board note, always with a reason the user can read
  app.post<{ Params: { id: string }; Body: { note: string } }>('/api/board/notes/:id/resolve', async (req) => {
    need();
    const n = readNotes().find((x) => x.id === req.params.id);
    if (!n) throw Object.assign(new Error('board note not found: ' + req.params.id), { statusCode: 404 });
    writeNotes(readNotes().map((x) => (x.id === n.id ? { ...x, status: 'resolved', resolution: req.body.note } : x)));
    bus.send({ type: 'notice', level: 'info', ...msg('The agent resolved “{note}”: {resolution}', { note: n.text.slice(0, 60), resolution: req.body.note }) });
    return { ok: true, id: n.id, status: 'resolved' };
  });
  app.post<{ Params: { id: string }; Body: { reason: string } }>('/api/board/notes/:id/dismiss', async (req) => {
    need();
    const n = readNotes().find((x) => x.id === req.params.id);
    if (!n) throw Object.assign(new Error('board note not found: ' + req.params.id), { statusCode: 404 });
    writeNotes(readNotes().filter((x) => x.id !== n.id));
    bus.send({ type: 'notice', level: 'info', ...msg('The agent removed the obsolete comment “{note}”: {reason}', { note: n.text.slice(0, 60), reason: req.body.reason }) });
    return { ok: true, id: n.id, deleted: true };
  });
  app.get('/api/agent/board-notes', async () => {
    need();
    return readNotes().map((n) => ({ ...n, status: n.status || 'open' }));
  });

  // ---------- video versions (language / aspect / length variants) ----------
  app.get('/api/variants', async () => { need(); return family(); });
  app.post<{ Body: any }>('/api/variants', async (req) => {
    const store = need();
    const b = req.body as any;
    if (!b.label?.trim()) throw uerr('Name the version');
    const parentName = store.project.name, parentSize = { width: store.project.width, height: store.project.height };
    const { dir } = await createVariant(b);
    syncSkills(dir, path.basename(dir));
    return runIn(openProject(dir), () => {
      const task = startTask({ agent: b.agent, title: `Version: ${b.label}`, prompt: variantPrompt(b, parentName, parentSize) + langLine(b.lang) });
      return { dir, task, state: state() };
    });
  });

  // ---------- footage recording (web pages, macOS apps) ----------
  const placeRecording = async (file: string, duration: number, place?: { start?: number; track?: string }) => {
    if (!place) return undefined;
    const store = cur();
    const iid = 'i' + nid();
    await store.update((p) => {
      const track = place.track || trackFor(p, 'media', file, { start: Math.max(0, place.start ?? 0), duration });
      p.items.push({ id: iid, kind: 'media', ref: file, track, start: Math.max(0, place.start ?? 0), in: 0, duration: +duration.toFixed(3) });
      p.duration = Math.max(p.duration, Math.ceil((place.start ?? 0) + duration));
    });
    return store.project.items.find((i) => i.id === iid);
  };
  const runRecording = (kind: 'web' | 'screen', label: string, fn: (job: RecordJob) => Promise<{ file: string; duration: number }>, place?: { start?: number; track?: string }) => {
    const job: RecordJob = { id: 'r' + nid(), project: cur().id, kind, status: 'running', stage: 'preparing', label };
    emitJob(job);
    const done = (async () => {
      try {
        const r = await fn(job);
        job.status = 'done'; job.stage = 'done'; job.file = r.file; job.duration = r.duration;
        const item = await placeRecording(r.file, r.duration, place);
        emitJob(job);
        bus.send({ type: 'notice', level: 'info', ...msg(item ? 'Footage recorded: {file} ({seconds} s) — added to the timeline' : 'Footage recorded: {file} ({seconds} s)', { file: r.file, seconds: r.duration.toFixed(1) }) });
        return { ...r, item };
      } catch (e) {
        job.status = 'error'; job.error = (e as Error).message; emitJob(job);
        bus.send({ type: 'notice', level: 'error', ...msg('Recording failed: {error}', { error: job.error! }) });
        throw e;
      }
    })();
    return { job, done };
  };
  app.get('/api/record/apps', async () => ({ apps: await listApps() }));
  registerWebSessionRoutes(app);
  app.get('/api/record/jobs', async () => recordJobs());
  app.post<{ Body: any }>('/api/record/web', async (req) => {
    need();
    const b = { ...(req.body as any) };
    if (!b.url) throw uerr('Enter a URL');
    if (!/^https?:\/\//.test(b.url)) b.url = 'https://' + b.url;
    if (!b.actions || !b.actions.length) b.actions = defaultWebActions(b.seconds || 10);
    const { job, done } = runRecording('web', b.url, (j) => recordWeb(b, j), b.place);
    done.catch(() => {});
    return job;
  });
  app.post<{ Body: any }>('/api/record/screen', async (req) => {
    need();
    const b = req.body as any;
    const { job, done } = runRecording('screen', b.app || 'screen', () => recordScreen(b), b.place);
    done.catch(() => {});
    return job;
  });
  // MCP: synchronous variants (the agent waits for the file)
  app.post<{ Body: any }>('/api/agent/record-web', async (req) => {
    need();
    const b = { ...(req.body as any) };
    if (!/^https?:\/\//.test(b.url)) b.url = 'https://' + b.url;
    if (!b.actions || !b.actions.length) b.actions = defaultWebActions(b.seconds || 10);
    const { done } = runRecording('web', b.url, (j) => recordWeb(b, j), b.place);
    return done;
  });
  app.post<{ Body: any }>('/api/agent/record-screen', async (req) => {
    need();
    const b = req.body as any;
    const { done } = runRecording('screen', b.app || 'screen', () => recordScreen(b), b.place);
    return done;
  });

  // ---------- renderer manifests (headless Player) ----------
  app.get<{ Params: { id: string } }>('/api/render/manifest/:id', async (req) => {
    const m = getManifest(req.params.id);
    if (!m) throw Object.assign(new Error('manifest not found'), { statusCode: 404 });
    return m;
  });

  // ---------- board (canvas) frames ----------
  app.get<{ Querystring: { t: string; w?: string } }>('/api/board/frame', async (req, reply) => {
    need();
    const file = await boardFrame(Number(req.query.t) || 0, Math.min(960, Number(req.query.w) || 480));
    reply.header('cache-control', 'max-age=3600').type('image/jpeg');
    return fs.createReadStream(file);
  });

  // ---------- script / storyboard ----------
  app.get('/api/script', async () => { need(); return { ...getScript(), stages: STAGES }; });
  /** agents can't approve or (un)lock scenes — those are the user's; keep them when an agent rewrites the script */
  const guardScenes = (body: any) => {
    if (!Array.isArray(body?.scenes)) return body;
    const prev = new Map(getScript().scenes.map((s) => [s.id, s]));
    return { ...body, scenes: body.scenes.map((s: any) => {
      const old = s.id ? prev.get(s.id) : undefined;
      const { locked, ...rest } = s;
      return { ...rest, ...(old?.locked ? { locked: true } : {}), status: old?.status === 'approved' ? 'approved' : (rest.status === 'approved' ? 'done' : rest.status) };
    }) };
  };
  app.put<{ Body: any }>('/api/script', async (req) => { need(); const tid = taskOf(req); if (tid) setFocus(tid, { kind: 'script', at: Date.now() }); return saveScript(tid ? guardScenes(req.body) : (req.body as any)); });
  app.patch<{ Body: any }>('/api/script', async (req) => {
    need();
    const prev = taskOf(req) || !Array.isArray((req.body as any)?.scenes) ? null : new Map(getScript().scenes.map((x) => [x.id, { ...x }]));
    const out = await saveScript(req.body as any);
    if (prev) for (const sc of (req.body as any).scenes) sceneTaste(prev.get(sc?.id), sc); // the user approved / sent back scenes
    return out;
  });
  app.post<{ Body: any }>('/api/script/scenes', async (req) => {
    need();
    const s = getScript();
    const b = (req.body || {}) as any;
    const last = s.scenes[s.scenes.length - 1];
    const scene = { id: 's' + nid(), title: b.title || `Scene ${s.scenes.length + 1}`, start: b.start ?? (last ? last.start + last.duration : 0), duration: b.duration ?? 4, voiceover: b.voiceover || '', visual: b.visual || '', notes: '', status: 'todo' as const, itemIds: [] };
    return saveScript({ scenes: [...s.scenes, scene] });
  });
  app.patch<{ Params: { id: string }; Body: any }>('/api/script/scenes/:id', async (req) => {
    need();
    const tid = taskOf(req);
    let body = req.body as any;
    if (tid) {
      setFocus(tid, { kind: 'script', id: req.params.id, at: Date.now() });
      const { locked, force, reason, review, ...rest } = body || {};
      const cur0 = getScript().scenes.find((s) => s.id === req.params.id);
      body = rest;
      if (body.status === 'approved' || cur0?.status === 'approved') delete body.status;
      // the art director gate: a scene is done when a fresh-eyes review passed it (or its rounds are used up)
      if (body.status === 'done' && cur0?.status !== 'done') {
        const gate = doneGate(req.params.id);
        if (gate && !(force && String(reason || '').trim())) throw Object.assign(new Error(gate), { statusCode: 409 });
        if (gate) taskEvent(tid, { kind: 'status', text: `marked done without art-director review: ${String(reason).slice(0, 200)}` });
      }
    } else if ((body?.status === 'todo' || body?.status === 'doing') && body?.review === undefined) {
      body = { ...body, review: undefined }; // the user sent it back: it needs a fresh review
    }
    const sc0 = tid ? undefined : getScript().scenes.find((x) => x.id === req.params.id);
    const before = sc0 && { ...sc0 };
    return patchScene(req.params.id, body).then((r) => { sceneTaste(before, body); return r; }); // taste: the user approved / sent back a scene
  });
  app.delete<{ Params: { id: string } }>('/api/script/scenes/:id', async (req) => { need(); const s = getScript(); return saveScript({ scenes: s.scenes.filter((x) => x.id !== req.params.id) }); });

  // ---------- versions ----------
  app.get<{ Querystring: { path?: string } }>('/api/versions', async (req) => gitLog(need().dir, req.query.path || undefined));
  app.post<{ Body: { sha: string; path: string } }>('/api/versions/restore', async (req) => {
    const store = need();
    await commit(store.dir, 'Snapshot before restore');
    // taste: which agent tasks does this undo? (agent commits newer than the restored version)
    const hist = await gitLog(store.dir, req.body.path, 200).catch(() => []);
    const at = hist.findIndex((v) => v.sha.startsWith(String(req.body.sha)) || String(req.body.sha).startsWith(v.sha));
    const undone = (at > 0 ? hist.slice(0, at) : []).map((v) => /^agent\([a-z]+\): (.*)$/.exec(v.message)?.[1]).filter(Boolean) as string[];
    await gitRestore(store.dir, req.body.sha, req.body.path);
    const sha = await commit(store.dir, `Restore ${req.body.path} to ${req.body.sha}`);
    if (undone.length) recordTaste({ kind: 'revert', text: `The user reverted ${req.body.path} to an earlier version, undoing the agent's work from: ${[...new Set(undone)].slice(0, 5).map((x) => `“${x}”`).join(', ')}.` });
    if (req.body.path === 'project.json') { store.reload(); bus.send({ type: 'project', project: store.project }); }
    return { ok: true, sha };
  });
  app.post<{ Body: { sha: string; clipId: string } }>('/api/versions/materialize', async (req) => {
    const store = need();
    const out = store.p('.studio', 'versions', req.body.sha);
    await exportAt(store.dir, req.body.sha, `clips/${req.body.clipId}`, out);
    return { base: `${pbase()}/.studio/versions/${req.body.sha}/clips` };
  });

  // ---------- export ----------
  app.post<{ Body: any }>('/api/export', async (req) => { need(); if (!taskOf(req)) exported(); return startExport((req.body || {}) as any); });
  app.post<{ Params: { id: string } }>('/api/export/:id/cancel', async (req) => ({ ok: cancelExport(req.params.id) }));
  app.get('/api/exports', async () => listExports());

  // ---------- settings ----------
  const publicSettings = () => ({ ...maskSettings(getSettings()), hasElevenlabsKey: !!apiKey() }); // secrets masked (config.ts SECRET_KEYS)
  app.get('/api/settings', async () => publicSettings());
  app.patch<{ Body: Record<string, unknown> }>('/api/settings', async (req) => {
    const b = { ...(req.body as any) };
    unmaskPatch(b);
    saveSettings(b);
    return publicSettings();
  });

  // ---------- agent (MCP bridge) ----------
  app.get('/api/agent/overview', async () => { need(); return overview(); });
  // sub-agents: the lead agent (x-studio-task) delegates assignments that run in parallel
  app.post<{ Body: { title: string; prompt: string; clipId?: string; agent?: AgentKind } }>('/api/agent/subagents', async (req) => {
    need();
    const tid = taskOf(req);
    if (!tid) throw uerr('Only an agent task can start sub-agents');
    const t = delegateTask(tid, req.body);
    return { taskId: t.id, title: t.title, status: t.status };
  });
  app.post<{ Body: { ids?: string[] } }>('/api/agent/subagents/wait', async (req) => {
    const tid = taskOf(req);
    if (!tid) throw uerr('Only an agent task can wait for sub-agents');
    if (!children(tid).length) return { subagents: [], note: 'no sub-agents were started by this task' };
    return { subagents: await waitSubagents(tid, req.body?.ids) };
  });
  app.post<{ Body: { id: string; text: string } }>('/api/agent/subagents/message', async (req) => {
    const tid = taskOf(req);
    if (!children(tid).some((c) => c.id === req.body.id)) throw uerr('Not your sub-agent: {id}', { id: req.body.id });
    const t = followUp(req.body.id, req.body.text);
    return { id: t.id, status: t.status };
  });
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
    if (tid) { taskEvent(tid, { kind: 'image', src: pbase() + '/' + r.file, ...msg('{clip} · {n} frames', { clip: req.body.clipId, n: r.times.length }) }); setFocus(tid, { kind: 'clip', id: req.body.clipId, at: Date.now() }); }
    return { ...r, png: r.png.toString('base64'), file: cur().p(r.file) };
  });
  app.post<{ Body: { times: number[] } }>('/api/agent/render-frame', async (req) => {
    need();
    const r = await renderFrames(req.body.times);
    const tid = taskOf(req);
    if (tid) taskEvent(tid, { kind: 'image', src: pbase() + '/' + r.file, ...msg('frame {times}', { times: req.body.times.map((t) => t.toFixed(1) + 's').join(', ') }) });
    return { ...r, png: r.png.toString('base64'), file: cur().p(r.file) };
  });
  // art director: a fresh-eyes critic reviews a scene / range (async: poll the verdict)
  app.post<{ Body: { sceneId?: string; film?: boolean; start?: number; end?: number; focus?: string } }>('/api/agent/art-director', async (req) => {
    need();
    const tid = taskOf(req);
    if (tid && getTask(tid)?.role === 'critic') throw uerr('The art director cannot call itself');
    return startReview({ caller: tid || undefined, ...(req.body || {}) });
  });
  app.get<{ Params: { id: string } }>('/api/agent/art-director/:id', async (req) => { need(); return reviewStatus(req.params.id); });
  app.post<{ Params: { id: string }; Body: { lang?: string } }>('/api/script/scenes/:id/review', async (req) => { need(); return startReview({ sceneId: req.params.id, force: true, language: LANG_NAMES[req.body?.lang || ''] }); });
  app.post<{ Body: { lang?: string } }>('/api/script/review', async (req) => { need(); return startReview({ film: true, force: true, language: LANG_NAMES[req.body?.lang || ''] }); });
  app.post<{ Body: { clipId: string } }>('/api/agent/lint-clip', async (req) => { need(); return lintClip(req.body.clipId); });
  // taste audit (server/taste/audit.ts): measured craft checks — a scene / a project range / one clip
  app.post<{ Body: { sceneId?: string; start?: number; end?: number; clipId?: string; itemId?: string } }>('/api/agent/taste-audit', async (req) => {
    const store = need();
    const { auditRange, auditClip } = await import('./taste/audit.ts');
    const b = req.body || {};
    if (b.clipId) return auditClip(b.clipId, { itemId: b.itemId });
    if (b.sceneId) {
      const sc = getScript().scenes.find((x) => x.id === b.sceneId);
      if (!sc) throw Object.assign(new Error('scene not found: ' + b.sceneId), { statusCode: 404 });
      return auditRange({ start: sc.start, end: sc.start + sc.duration });
    }
    const it = b.itemId ? store.project.items.find((i) => i.id === b.itemId) : undefined;
    if (it) return auditRange({ start: it.start, end: it.start + it.duration });
    const filmEnd = Math.max(0, ...store.project.items.map((i) => i.start + i.duration)) || store.project.duration;
    return auditRange({ start: Number(b.start ?? 0), end: Number(b.end ?? filmEnd) });
  });
  app.get<{ Querystring: { kind?: string; q?: string } }>('/api/agent/templates', async (req) => {
    const q = (req.query.q || '').toLowerCase();
    return listGallery().filter((g) => (!req.query.kind || g.kind === req.query.kind) && (!q || JSON.stringify(g).toLowerCase().includes(q)))
      .map((g) => ({ origin: g.origin, kind: g.kind, id: g.id, name: g.name, category: g.category, description: g.description, duration: g.duration, sourceDir: path.join(g.origin === 'builtin' ? GALLERY_DIR : LIBRARY_DIR, g.kind === 'clip' ? 'clips' : 'music', g.id) }));
  });
  /** a technique: TECHNIQUE.md (how this kind of clip/score is made) + the reference source file list */
  app.get<{ Params: { kind: string; id: string } }>('/api/agent/techniques/:kind/:id', async (req) => {
    const kind = req.params.kind === 'music' ? 'music' : 'clips';
    const id = req.params.id.replace(/[^a-z0-9_-]/gi, '');
    for (const base of [GALLERY_DIR, LIBRARY_DIR]) {
      const dir = path.join(base, kind, id);
      if (!fs.existsSync(dir)) continue;
      const doc = path.join(dir, 'TECHNIQUE.md');
      return { id, kind, dir, technique: fs.existsSync(doc) ? fs.readFileSync(doc, 'utf8') : null, files: fs.readdirSync(dir).filter((f) => !f.startsWith('.')) };
    }
    throw uerr('Technique not found: {id}', { id }, 404);
  });
  app.post<{ Body: { musicId: string } }>('/api/agent/render-music', async (req) => {
    const store = need();
    const info = await renderMusic(req.body.musicId, true);
    if (info.renderError) throw new Error(info.renderError);
    const a = readJson<AudioAnalysis | null>(store.p('.studio', 'analysis', `music-${req.body.musicId}.json`), null);
    const spec = store.p('.studio', 'frames', `spec-${req.body.musicId}.png`);
    await spectrogram(store.p(info.rendered!), spec);
    { const tid = taskOf(req); if (tid) taskEvent(tid, { kind: 'image', src: `${pbase()}/.studio/frames/spec-${req.body.musicId}.png?v=${Date.now()}`, ...msg('spectrogram of {track}', { track: req.body.musicId }) }); }
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

  // ---------- music QA report (server/audio/report.ts) ----------
  // POST {musicId | file, genre?, targetLufs?, vo?} → loudness/spectrum/dynamics/static checks, flags with API fixes, one-line verdict
  app.post<{ Body: { musicId?: string; file?: string; genre?: string; targetLufs?: number; vo?: boolean } }>('/api/agent/music-report', async (req) => { need(); return musicReportFor(req.body || {}); });
  // ---------- end music QA report ----------

  // ---------- media toolkit (server/toolkit/routes.ts: /api/toolkit, /run, /jobs) ----------
  await registerToolkitRoutes(app);
  await registerGenerateRoutes(app); // generative footage (server/generate/routes.ts)
}
