import { useSyncExternalStore } from 'react';
import { t, tn, getLocale, fmtNumber } from './i18n';
import type { Project, Comment, ClipInfo, MusicInfo, MediaInfo, Task, Settings, ExportJob, GalleryItem, Timing, ServerEvent, Item, AgentKind, PermissionRequest, Script, DesignSystem, BoardNote } from '../../shared/types';

export interface SkillInfo { name: string; description: string; origin: string; path: string }
export interface State {
  connected: boolean;
  dir?: string;
  project: Project | null;
  comments: Comment[];
  clips: ClipInfo[];
  music: MusicInfo[];
  media: MediaInfo[];
  tasks: Task[];
  settings?: Settings;
  skills: SkillInfo[];
  jobs: ExportJob[];
  exports: { file: string; size: number; mtime: number }[];
  gallery: GalleryItem[];
  recents: string[];
  projectsDir?: string;
  timing: Timing;
  notices: { id: number; level: 'info' | 'error'; text: string }[];
  agents: { claude: string | null; codex: string | null } | null;
  permissions: PermissionRequest[];
  repo?: string;
  script: Script;
  design: DesignSystem;
  view: 'edit' | 'board';
  sideTab: 'agent' | 'script';
  followAgent: boolean;
  lightbox: string | null;
  /** objects selected on the board, attached to the next chat message */
  chatContext: { key: string; label: string; text: string }[];
  boardSelection: string[];
  boardNotes: BoardNote[];
  recordJobs: { id: string; kind: 'web' | 'screen'; status: 'running' | 'done' | 'error'; stage: string; file?: string; duration?: number; error?: string; label: string }[];
  // ui
  libraryOpen: boolean;
  libraryTab: 'templates' | 'media' | 'project';
  selectedItemId: string | null;
  selectedCommentId: string | null;
  selectedTaskId: string | null;
  commentMode: boolean;
  rightTab: 'inspector' | 'comments' | 'agent';
  leftTab: 'gallery' | 'project' | 'media' | 'skills';
  zoom: number;
  snap: boolean;
  fileVersion: Record<string, number>;
  clipErrors: Record<string, string[]>;
  /** param → design token the runtime bound it to (per timeline item) */
  clipBindings: Record<string, Record<string, string>>;
  playing: boolean;
  dialog: null | 'projects' | 'settings' | 'export' | { compare: { clipId: string; sha: string } };
  agent: AgentKind;
  chatDraft: string;
}

const initial: State = {
  connected: false, project: null, comments: [], clips: [], music: [], media: [], tasks: [], skills: [], jobs: [], exports: [], gallery: [], recents: [],
  timing: { bpm: 120, beats: [], bars: [], sections: [], markers: [], words: [] }, notices: [], agents: null, permissions: [], libraryOpen: false, libraryTab: 'templates',
  script: { brief: '', stage: 'brief', scenes: [] }, design: { colors: [], type: [], motion: [], spacing: [] },
  view: (() => { try { return localStorage.getItem('view') === 'board' ? 'board' : 'edit'; } catch { return 'edit'; } })() as 'edit' | 'board', sideTab: 'agent', followAgent: (() => { try { return localStorage.getItem('follow') !== '0'; } catch { return true; } })(), lightbox: null, chatContext: [], boardSelection: [], boardNotes: [], recordJobs: [],
  selectedItemId: null, selectedCommentId: null, selectedTaskId: null, commentMode: false, rightTab: 'agent', leftTab: 'gallery', zoom: 60, snap: true,
  fileVersion: {}, clipErrors: {}, clipBindings: {}, playing: false, dialog: null, agent: 'claude', chatDraft: '',
};

let state: State = initial;
const subs = new Set<() => void>();
export function getState() { return state; }
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}

// ---------- playhead (high-frequency, separate store) ----------
let playhead = 0;
const timeSubs = new Set<(t: number) => void>();
export const time = {
  get: () => playhead,
  set(t: number) { playhead = Math.max(0, t); timeSubs.forEach((f) => f(playhead)); },
  sub(f: (t: number) => void) { timeSubs.add(f); return () => { timeSubs.delete(f); }; },
};
export function usePlayhead(): number {
  return useSyncExternalStore((cb) => time.sub(cb), () => playhead);
}

let raf = 0;
let t0 = 0, p0 = 0;
export function play() {
  const s = getState();
  if (!s.project) return;
  if (playhead >= projectEnd(s.project) - 0.05) time.set(0);
  t0 = performance.now(); p0 = playhead;
  setState({ playing: true });
  const tick = () => {
    const t = p0 + (performance.now() - t0) / 1000;
    const end = projectEnd(getState().project!);
    if (t >= end) { time.set(end); pause(); return; }
    time.set(t);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}
export function pause() { cancelAnimationFrame(raf); setState({ playing: false }); }
export function togglePlay() { getState().playing ? pause() : play(); }
export function seek(t: number) {
  const s = getState();
  const fps = s.project?.fps || 30;
  const snapped = Math.round(t * fps) / fps;
  if (s.playing) { p0 = snapped; t0 = performance.now(); }
  time.set(snapped);
}
export function projectEnd(p: Project) {
  return Math.max(1, ...p.items.map((i) => i.start + i.duration));
}

// ---------- API ----------
export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : data.error || res.statusText;
    notify('error', msg);
    throw new Error(msg);
  }
  return data as T;
}
let noticeId = 0;
export function notify(level: 'info' | 'error', text: string) {
  const id = ++noticeId;
  setState((s) => ({ notices: [...s.notices.slice(-4), { id, level, text }] }));
  setTimeout(() => setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), level === 'error' ? 9000 : 4500);
}

export async function refresh() {
  const s = await api('GET', '/api/state');
  setState({ ...s, project: s.project, timing: getState().timing });
  if (s.project) await refreshTiming();
  if (s.settings) setState({ agent: s.settings.defaultAgent });
}
export async function refreshTiming() { setState({ timing: await api('GET', '/api/timing') }); }
export async function refreshGallery() { setState({ gallery: await api('GET', '/api/gallery') }); }
async function refreshLists() {
  const s = await api('GET', '/api/state');
  setState({ clips: s.clips, music: s.music, media: s.media, exports: s.exports });
}

let ws: WebSocket | null = null;
let everConnected = false;
let lostAt = 0;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    setState({ connected: true });
    // came back after the server restarted: pull fresh state, nothing is lost
    if (everConnected && lostAt) { void refresh(); void refreshGallery(); if (Date.now() - lostAt > 1500) notify('info', t('Connection to the editor restored')); }
    everConnected = true;
    lostAt = 0;
  };
  ws.onclose = () => { if (!lostAt) lostAt = Date.now(); setState({ connected: false }); setTimeout(connect, 1000); };
  ws.onmessage = (m) => onEvent(JSON.parse(m.data));
}

let listsTimer: any = null;
let timingTimer: any = null;
function scheduleLists() { clearTimeout(listsTimer); listsTimer = setTimeout(refreshLists, 250); }
function scheduleTiming() { clearTimeout(timingTimer); timingTimer = setTimeout(refreshTiming, 400); }

function onEvent(ev: ServerEvent) {
  switch (ev.type) {
    case 'project': {
      const prevDir = getState().project?.name;
      setState({ project: ev.project });
      scheduleTiming();
      if (prevDir !== ev.project.name) void refresh();
      break;
    }
    case 'comments': setState({ comments: ev.comments }); break;
    case 'task': setState((s) => {
      const exists = s.tasks.some((t) => t.id === ev.task.id);
      return { tasks: exists ? s.tasks.map((t) => (t.id === ev.task.id ? ev.task : t)) : [ev.task, ...s.tasks] };
    }); break;
    case 'task-event': setState((s) => ({ tasks: s.tasks.map((t) => (t.id === ev.taskId ? { ...t, events: [...t.events, ev.event] } : t)) })); break;
    case 'export': setState((s) => ({ jobs: [...s.jobs.filter((j) => j.id !== ev.job.id), ev.job] })); if (ev.job.status === 'done') { scheduleLists(); notify('info', t('Export finished')); } if (ev.job.status === 'error') notify('error', t('Export failed: {error}', { error: ev.job.error?.slice(0, 300) })); break;
    case 'music': setState((s) => ({ music: s.music.some((m) => m.id === ev.music.id) ? s.music.map((m) => (m.id === ev.music.id ? ev.music : m)) : [...s.music, ev.music], fileVersion: { ...s.fileVersion, ['music:' + ev.music.id]: Date.now() } })); scheduleTiming(); break;
    case 'media': setState((s) => ({ media: s.media.some((m) => m.file === ev.media.file) ? s.media.map((m) => (m.file === ev.media.file ? ev.media : m)) : [...s.media, ev.media] })); scheduleTiming(); break;
    case 'files': {
      const bump: Record<string, number> = {};
      for (const p of ev.paths) {
        const [top, id] = p.split('/');
        if (top === 'clips' && id) bump[id] = Date.now();
      }
      if (Object.keys(bump).length) setState((s) => ({ fileVersion: { ...s.fileVersion, ...bump } }));
      scheduleLists();
      break;
    }
    case 'notice': notify(ev.level, ev.key ? t(ev.key, ev.params) : ev.text); break;
    case 'script': setState({ script: ev.script }); break;
    case 'design': setState({ design: ev.design }); break;
    case 'board': setState({ boardNotes: ev.notes }); break;
    case 'record': setState((s) => ({ recordJobs: [...s.recordJobs.filter((j) => j.id !== ev.job.id), ev.job] })); if (ev.job.status === 'done') scheduleLists(); break;
    case 'permissions': {
      const prev = new Set(getState().permissions.map((p) => p.id));
      setState({ permissions: ev.permissions });
      const fresh = ev.permissions.find((p) => !prev.has(p.id));
      if (fresh) { notify('info', t('Agent requests permission: {tool}', { tool: fresh.tool })); setState({ selectedTaskId: fresh.taskId, selectedItemId: null, sideTab: 'agent' }); }
      break;
    }
  }
}

export async function boot() {
  connect();
  await refresh().catch(() => {});
  refreshGallery().catch(() => {});
  api('GET', '/api/agents/check').then((a) => setState({ agents: a })).catch(() => {});
}

// ---------- actions ----------
export const actions = {
  async addItem(body: Partial<Item> & { kind: Item['kind']; ref: string }) {
    const it = await api<Item>('POST', '/api/items', body);
    setState({ selectedItemId: it.id });
    return it;
  },
  updateItem(id: string, patch: Partial<Item>) {
    // optimistic
    setState((s) => s.project ? ({ project: { ...s.project, items: s.project.items.map((i) => (i.id === id ? { ...i, ...patch, params: patch.params ? { ...(i.params || {}), ...patch.params } : i.params } : i)) } }) : {});
    return api('PATCH', `/api/items/${id}`, patch);
  },
  async removeItem(id: string) {
    setState((s) => s.project ? ({ project: { ...s.project, items: s.project.items.filter((i) => i.id !== id) }, selectedItemId: null }) : {});
    await api('DELETE', `/api/items/${id}`);
  },
  split(id: string, t: number) { return api('POST', `/api/items/${id}/split`, { time: t }); },
  patchProject(patch: Partial<Project>) {
    setState((s) => s.project ? ({ project: { ...s.project, ...patch } }) : {});
    return api('PATCH', '/api/project', patch);
  },
  async useTemplate(g: GalleryItem, start: number, track?: string) {
    const r = await api<{ id: string; item?: Item }>('POST', '/api/gallery/use', { origin: g.origin, kind: g.kind, id: g.id, place: { start, track } });
    if (r.item) setState({ selectedItemId: r.item.id });
    return r;
  },
  async upload(files: FileList | File[]) {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('file', f, f.name);
    notify('info', tn(Array.from(files).length, 'Uploading {n} file…', 'Uploading {n} files…'));
    const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
    if (!res.ok) { notify('error', t('Upload failed')); return []; }
    const infos = await res.json();
    await refreshLists();
    return infos as MediaInfo[];
  },
  async addComment(c: Partial<Comment>) {
    const created = await api<Comment>('POST', '/api/comments', c);
    setState({ selectedCommentId: created.id });
    return created;
  },
  updateComment(id: string, patch: Partial<Comment>) { return api('PATCH', `/api/comments/${id}`, patch); },
  deleteComment(id: string) { return api('DELETE', `/api/comments/${id}`); },
  async sendComments(ids?: string[]) {
    notify('info', t('Preparing frame snapshots and starting agents…'));
    const tasks = await api<Task[]>('POST', '/api/comments/send', { ids, agent: getState().agent, lang: getLocale() });
    setState({ selectedItemId: null, selectedTaskId: tasks[0]?.id || null, sideTab: 'agent' });
  },
  async startTask(prompt: string, ctx: { itemId?: string | null; clipId?: string } = {}) {
    const task = await api<Task>('POST', '/api/tasks', { prompt, agent: getState().agent, itemId: ctx.itemId || undefined, clipId: ctx.clipId, playhead: time.get(), lang: getLocale() });
    setState({ selectedTaskId: task.id, selectedItemId: null, sideTab: 'agent' });
    return task;
  },
  followUp(taskId: string, prompt: string) { return api('POST', `/api/tasks/${taskId}/message`, { prompt, lang: getLocale() }); },
  interrupt(taskId: string, prompt: string) { return api('POST', `/api/tasks/${taskId}/interrupt`, { prompt, lang: getLocale() }); },
  cancelTask(taskId: string) { return api('POST', `/api/tasks/${taskId}/cancel`); },
  setView(v: 'edit' | 'board') { try { localStorage.setItem('view', v); } catch {} setState({ view: v }); },
  setFollow(v: boolean) { try { localStorage.setItem('follow', v ? '1' : '0'); } catch {} setState({ followAgent: v }); },
  saveScript(patch: Partial<Script>) { setState((s) => ({ script: { ...s.script, ...patch } })); return api('PATCH', '/api/script', patch); },
  patchScene(id: string, patch: Partial<Script['scenes'][number]>) {
    setState((s) => ({ script: { ...s.script, scenes: s.script.scenes.map((x) => (x.id === id ? { ...x, ...patch } : x)) } }));
    return api('PATCH', `/api/script/scenes/${id}`, patch);
  },
  async voiceScene(sceneId: string) {
    const st = getState().settings as any;
    if (!st?.hasElevenlabsKey || !st?.elevenlabsVoiceId) { notify('error', t('Set up ElevenLabs: key and voice in Settings')); setState({ dialog: 'settings' }); throw new Error('no voice'); }
    const r = await api<any>('POST', '/api/voice/tts', { sceneId });
    notify(r.overflow > 0 ? 'error' : 'info', r.overflow > 0 ? t('Voiceover is {s}s longer than the scene — lengthen the scene or shorten the text', { s: fmtNumber(r.overflow, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }) : t(r.cached ? 'Voiced: {s}s (cached)' : 'Voiced: {s}s', { s: fmtNumber(r.duration, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }));
    return r;
  },
  addScene() { return api('POST', '/api/script/scenes', {}); },
  deleteScene(id: string) { return api('DELETE', `/api/script/scenes/${id}`); },
  decidePermission(id: string, allow: boolean, always = false) { return api('POST', `/api/permissions/${id}`, { allow, always }); },
};

export function useSelectedItem() {
  return useStore((s) => s.project?.items.find((i) => i.id === s.selectedItemId) || null);
}

export function clipInput(item: Item, p: Project) {
  return { params: item.params || {}, offset: item.start - item.in, duration: item.duration + item.in, width: p.width, height: p.height, fps: p.fps };
}

export const fmtTime = (t: number, fps = 30) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t % 1) * fps + 1e-6);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
};
