import { useSyncExternalStore } from 'react';
import { t, tn, getLocale, fmtNumber } from './i18n';
import type { Project, Comment, ClipInfo, MusicInfo, MediaInfo, Task, Settings, ExportJob, GalleryItem, Timing, ServerEvent, Item, AgentKind, PermissionRequest, Script, DesignSystem, BoardNote, Scene, Reference } from '../../shared/types';

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
  view: View;
  /** home screen (projects, renders, start) or the editor */
  screen: 'home' | 'editor';
  references: Reference[];
  render3d: Extract<ServerEvent, { type: 'render3d' }>['job'][];
  /** scenes selected on the storyboard / scene strip (ids) */
  sceneSelection: string[];
  /** full timeline expanded (otherwise the compact scene strip) */
  timelineOpen: boolean;
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
  libraryTab: 'inspiration' | 'templates' | 'media' | 'project';
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
  dialog: null | 'projects' | 'settings' | 'export' | 'version' | { compare: { clipId: string; sha: string } };
  agent: AgentKind;
  /** model per agent and reasoning effort picked in the chat ('' = the Settings default) */
  chatModel: { claude: string; codex: string };
  chatEffort: '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** autopilot: agents never ask, they decide (else they may ask with drafts) */
  chatAutopilot: boolean;
  chatDraft: string;
}

const initial: State = {
  connected: false, project: null, comments: [], clips: [], music: [], media: [], tasks: [], skills: [], jobs: [], exports: [], gallery: [], recents: [],
  timing: { bpm: 120, beats: [], bars: [], sections: [], markers: [], words: [] }, notices: [], agents: null, permissions: [], libraryOpen: false, libraryTab: 'templates',
  script: { brief: '', stage: 'brief', scenes: [] }, design: { colors: [], type: [], motion: [], spacing: [] },
  view: (() => { try { const v = localStorage.getItem('view'); return v === 'board' || v === 'edit' || v === 'nodes' ? v : 'story'; } catch { return 'story'; } })() as View,
  screen: new URLSearchParams(location.search).get('p') || /render\.html$/.test(location.pathname) ? 'editor' : 'home', references: [], render3d: [], sceneSelection: [], chatModel: (() => { try { return { claude: '', codex: '', ...JSON.parse(localStorage.getItem('chatModel') || '{}') }; } catch { return { claude: '', codex: '' }; } })(), chatEffort: (() => { try { return (localStorage.getItem('chatEffort') || '') as any; } catch { return ''; } })(), chatAutopilot: (() => { try { return localStorage.getItem('autopilot') === '1'; } catch { return false; } })(), timelineOpen: (() => { try { return localStorage.getItem('tlopen') === '1'; } catch { return false; } })(), sideTab: 'agent', followAgent: (() => { try { return localStorage.getItem('follow') !== '0'; } catch { return true; } })(), lightbox: null, chatContext: [], boardSelection: [], boardNotes: [], recordJobs: [],
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

// ---------- which project this tab works on (several tabs can edit different projects) ----------
let pid = new URLSearchParams(location.search).get('p') || '';
export const projectId = () => pid;
/** URL prefix of this tab's project files */
export const projectBase = () => (pid ? `/p/${pid}` : '/p');
/** URL of a project file (path relative to the project folder) */
export const pfile = (rel: string) => `${projectBase()}/${rel}`;
export const projectHeaders = (): Record<string, string> => (pid ? { 'x-studio-project': pid } : {});
let switching = false;
function setProjectId(id?: string) {
  if (!id || id === pid) return;
  pid = id;
  if (!/render\.html$/.test(location.pathname) && getState().screen === 'editor') syncUrl();
  // re-subscribe to this project's events
  if (ws && ws.readyState <= 1) { switching = true; ws.close(); }
}
/** keep the address bar in sync: ?p=<id> in the editor, / on the home screen */
export function syncUrl() {
  if (/render\.html$/.test(location.pathname)) return;
  const u = new URL(location.href);
  if (getState().screen === 'home') u.searchParams.delete('p'); else if (pid) u.searchParams.set('p', pid);
  history.replaceState(null, '', u);
}
export function goHome() { setState({ screen: 'home' }); syncUrl(); document.title = 'Smashcut'; }
/** open a project in a new browser tab */
export function openInNewTab(id: string) { window.open(`${location.pathname}?p=${id}`, '_blank'); }

// ---------- API ----------
export type View = 'story' | 'edit' | 'board' | 'nodes';

export async function api<T = any>(method: string, url: string, body?: unknown, opts: { stay?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { ...projectHeaders() };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === 'string' ? data : data.key ? t(data.key, data.params) : data.error || res.statusText;
    notify('error', msg);
    throw new Error(msg);
  }
  // responses that switch the tab to another project (open / create / new version) carry its state
  if (data && typeof data === 'object' && !opts.stay) {
    const st = (data as any).project !== undefined ? data : (data as any).state;
    if (st && typeof st.pid === 'string') setProjectId(st.pid);
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
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${pid ? `?p=${pid}` : ''}`);
  ws.onopen = () => {
    setState({ connected: true });
    // came back after the server restarted: pull fresh state, nothing is lost
    if (everConnected && lostAt) { void refresh(); void refreshGallery(); if (Date.now() - lostAt > 1500) notify('info', t('Connection to the editor restored')); }
    everConnected = true;
    lostAt = 0;
  };
  ws.onclose = () => {
    if (switching) { switching = false; connect(); return; }
    if (!lostAt) lostAt = Date.now();
    setState({ connected: false });
    setTimeout(connect, 1000);
  };
  ws.onmessage = (m) => onEvent(JSON.parse(m.data));
}

let listsTimer: any = null;
let timingTimer: any = null;
function scheduleLists() { clearTimeout(listsTimer); listsTimer = setTimeout(refreshLists, 250); }
function scheduleTiming() { clearTimeout(timingTimer); timingTimer = setTimeout(refreshTiming, 400); }

function onEvent(ev: ServerEvent) {
  if (ev.pid && pid && ev.pid !== pid) return; // another project's event (tab is switching)
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
    case 'references': setState({ references: ev.references }); break;
    case 'render3d': setState((s) => ({ render3d: [...s.render3d.filter((j) => j.id !== ev.job.id), ev.job].slice(-20) })); if (ev.job.status === 'done') scheduleLists(); break;
    case 'record': setState((s) => ({ recordJobs: [...s.recordJobs.filter((j) => j.id !== ev.job.id), ev.job] })); if (ev.job.status === 'done') scheduleLists(); break;
    case 'permissions': {
      const prev = new Set(getState().permissions.map((p) => p.id));
      // prompts are global; this tab shows only its own project's agents
      const mine = ev.permissions.filter((p) => getState().tasks.some((x) => x.id === p.taskId));
      setState({ permissions: mine });
      const fresh = mine.find((p) => !prev.has(p.id));
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
/** chat model / effort for a follow-up of this task (only when the user picked something for its agent) */
function modelOpts(taskId: string) {
  const st = getState();
  const task = st.tasks.find((x) => x.id === taskId);
  const agent = task?.agent || st.agent;
  const model = st.chatModel[agent], effort = st.chatEffort;
  return { ...(model !== undefined ? { model } : {}), ...(effort !== undefined ? { effort } : {}), autopilot: st.chatAutopilot };
}

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
    const res = await fetch('/api/media/upload', { method: 'POST', body: fd, headers: projectHeaders() });
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
    const st = getState();
    const task = await api<Task>('POST', '/api/tasks', { prompt, agent: st.agent, itemId: ctx.itemId || undefined, clipId: ctx.clipId, playhead: time.get(), lang: getLocale(), model: st.chatModel[st.agent] || undefined, effort: st.chatEffort || undefined, autopilot: st.chatAutopilot });
    setState({ selectedTaskId: task.id, selectedItemId: null, sideTab: 'agent' });
    return task;
  },
  followUp(taskId: string, prompt: string) { return api('POST', `/api/tasks/${taskId}/message`, { prompt, lang: getLocale(), ...modelOpts(taskId) }); },
  interrupt(taskId: string, prompt: string) { return api('POST', `/api/tasks/${taskId}/interrupt`, { prompt, lang: getLocale(), ...modelOpts(taskId) }); },
  /** model / effort for the chat (remembered per browser); applies to new tasks and the next message of the current one */
  setChatModel(agent: 'claude' | 'codex', model: string) { const m = { ...getState().chatModel, [agent]: model }; try { localStorage.setItem('chatModel', JSON.stringify(m)); } catch {} setState({ chatModel: m }); },
  setAutopilot(on: boolean) {
    try { localStorage.setItem('autopilot', on ? '1' : '0'); } catch {}
    setState({ chatAutopilot: on });
    // applies at once to the task open in the chat if it is working
    const st = getState(), task = st.tasks.find((x) => x.id === st.selectedTaskId);
    if (task && (task.status === 'running' || task.status === 'queued')) api('POST', `/api/tasks/${task.id}/options`, { autopilot: on }).catch(() => {});
  },
  answer(taskId: string, answer: string) { return api('POST', `/api/tasks/${taskId}/answer`, { answer }); },
  setChatEffort(effort: State['chatEffort']) { try { localStorage.setItem('chatEffort', effort); } catch {} setState({ chatEffort: effort }); },
  /** message for a working agent that does not stop it — it sees it at its next step */
  steer(taskId: string, prompt: string, images: string[] = []) { return api('POST', `/api/tasks/${taskId}/steer`, { prompt, images }); },
  cancelTask(taskId: string) { return api('POST', `/api/tasks/${taskId}/cancel`); },
  setView(v: View) { try { localStorage.setItem('view', v); } catch {} setState({ view: v }); },
  setTimelineOpen(open: boolean) { try { localStorage.setItem('tlopen', open ? '1' : '0'); } catch {} setState({ timelineOpen: open }); },
  /** select scenes: plain click = only this one (or clear if it was the only one), shift/cmd = toggle */
  selectScene(id: string, additive: boolean) {
    setState((s) => {
      const has = s.sceneSelection.includes(id);
      if (additive) return { sceneSelection: has ? s.sceneSelection.filter((x) => x !== id) : [...s.sceneSelection, id] };
      return { sceneSelection: has && s.sceneSelection.length === 1 ? [] : [id] };
    });
  },
  async patchScenes(ids: string[], patch: Partial<Scene>) {
    for (const id of ids) await api('PATCH', `/api/script/scenes/${id}`, patch);
  },
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
    if (r.pace?.flagged > 0) notify('error', t('Voice pace is uneven in {n} places — ask the agent to fix the speech text', { n: r.pace.flagged }));
    notify(r.overflow > 0 ? 'error' : 'info', r.overflow > 0 ? t('Voiceover is {s}s longer than the scene — lengthen the scene or shorten the text', { s: fmtNumber(r.overflow, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }) : t(r.cached ? 'Voiced: {s}s (cached)' : 'Voiced: {s}s', { s: fmtNumber(r.duration, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }));
    return r;
  },
  addScene() { return api('POST', '/api/script/scenes', {}); },
  /** add a reference to the project; bound to the selected scenes (if any) */
  async addReference(r: Partial<Reference>) {
    const sceneIds = getState().sceneSelection;
    await api('POST', '/api/references', { ...r, sceneIds });
    const n = sceneIds.length;
    notify('info', n ? t('Added to references for {n} selected scenes', { n }) : t('Added to the project references'));
  },
  removeReference(id: string) { return api('DELETE', `/api/references/${id}`); },
  patchReference(id: string, patch: Partial<Reference>) { return api('PATCH', `/api/references/${id}`, patch); },
  deleteScene(id: string) { return api('DELETE', `/api/script/scenes/${id}`); },
  decidePermission(id: string, allow: boolean, always = false) { return api('POST', `/api/permissions/${id}`, { allow, always }); },
};

export function useSelectedItem() {
  return useStore((s) => s.project?.items.find((i) => i.id === s.selectedItemId) || null);
}

export function clipInput(item: Item, p: Project) {
  return { params: item.params || {}, offset: item.start - item.in, duration: item.duration + item.in, width: p.width, height: p.height, fps: p.fps };
}

/** transport timecode HH:MM:SS:FF (frames) — four groups, so 33 s never reads as 33 minutes */
export const fmtTime = (t: number, fps = 30) => {
  const x = Math.max(0, t);
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60), f = Math.floor((x % 1) * fps + 1e-6);
  return [h, m, s, f].map((v) => String(v).padStart(2, '0')).join(':');
};
/** short human time for scenes and lists: 0:03, 0:04.5, 1:12 */
export const fmtShort = (t: number) => {
  const x = Math.max(0, Math.round(t * 10) / 10);
  const m = Math.floor(x / 60), s = x - m * 60;
  const whole = Math.floor(s), tenth = Math.round((s - whole) * 10);
  return `${m}:${String(whole).padStart(2, '0')}${tenth ? '.' + tenth : ''}`;
};
