import fs from 'node:fs';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Project, Comment, ClipInfo, MusicInfo, MediaInfo, PackageManifest, Item, Track } from '../shared/types.ts';
import { bus } from './bus.ts';
import { readJson, writeJson, nid, Mutex } from './util.ts';
import { gitInit } from './git.ts';
import { pushRecent } from './config.ts';

export const MEDIA_EXT: Record<string, MediaInfo['type']> = {
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video', '.m4v': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.ogg': 'audio', '.flac': 'audio',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.svg': 'image',
};

export const DEFAULT_TRACKS: Track[] = [
  { id: 'g2', kind: 'graphics', name: 'Graphics 2' },
  { id: 'g1', kind: 'graphics', name: 'Graphics 1' },
  { id: 'v1', kind: 'video', name: 'Video' },
  { id: 'a1', kind: 'audio', name: 'Audio' },
  { id: 'm1', kind: 'music', name: 'Music' },
];

const PROJECT_GITIGNORE = `.studio/
media/
.DS_Store
`;

export class ProjectStore {
  dir: string;
  project!: Project;
  comments: Comment[] = [];
  private watcher?: FSWatcher;
  private selfWrites = new Map<string, number>();
  private mutex = new Mutex();
  listeners: { music?: (id: string) => void; media?: (file: string) => void; clip?: (id: string) => void; script?: () => void } = {};

  constructor(dir: string) {
    this.dir = path.resolve(dir);
    this.reload();
    this.ensureDirs();
  }

  static exists(dir: string) { return fs.existsSync(path.join(dir, 'project.json')); }

  static async create(dir: string, opts: Partial<Project> = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const project: Project = {
      version: 1,
      name: opts.name || path.basename(dir),
      width: opts.width || 1920,
      height: opts.height || 1080,
      fps: opts.fps || 30,
      duration: opts.duration || 30,
      background: opts.background || '#000000',
      tracks: opts.tracks || DEFAULT_TRACKS.map((t) => ({ ...t })),
      items: opts.items || [],
      markers: opts.markers || [],
    };
    writeJson(path.join(dir, 'project.json'), project);
    if (!fs.existsSync(path.join(dir, 'comments.json'))) writeJson(path.join(dir, 'comments.json'), []);
    for (const d of ['clips', 'music', 'media', '.studio']) fs.mkdirSync(path.join(dir, d), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gitignore'), PROJECT_GITIGNORE);
    await gitInit(dir);
    return new ProjectStore(dir);
  }

  ensureDirs() {
    for (const d of ['clips', 'music', 'media', '.studio/cache', '.studio/exports', '.studio/tasks', '.studio/comments', '.studio/media', '.studio/frames']) fs.mkdirSync(path.join(this.dir, d), { recursive: true });
  }

  reload() {
    const p = readJson<Project | null>(path.join(this.dir, 'project.json'), null);
    if (!p) throw new Error('project.json missing or invalid in ' + this.dir);
    this.project = normalize(p);
    this.comments = readJson<Comment[]>(path.join(this.dir, 'comments.json'), []);
  }

  p(...rel: string[]) { return path.join(this.dir, ...rel); }

  private markSelf(file: string) { this.selfWrites.set(file, Date.now()); }
  private isSelf(file: string) { const t = this.selfWrites.get(file); return t != null && Date.now() - t < 800; }

  saveProject(next: Project, emit = true) {
    this.project = normalize(next);
    this.markSelf(this.p('project.json'));
    writeJson(this.p('project.json'), this.project);
    if (emit) bus.send({ type: 'project', project: this.project });
    return this.project;
  }

  /** atomic read-modify-write */
  update(fn: (p: Project) => void | Project) {
    return this.mutex.run(async () => {
      const draft: Project = JSON.parse(JSON.stringify(this.project));
      const r = fn(draft);
      return this.saveProject(r || draft);
    });
  }

  saveComments(list: Comment[]) {
    this.comments = list;
    this.markSelf(this.p('comments.json'));
    writeJson(this.p('comments.json'), list);
    bus.send({ type: 'comments', comments: list });
  }
  updateComments(fn: (c: Comment[]) => Comment[] | void) {
    return this.mutex.run(async () => {
      const draft = JSON.parse(JSON.stringify(this.comments));
      this.saveComments(fn(draft) || draft);
      return this.comments;
    });
  }

  // ---------- packages ----------
  listClips(): ClipInfo[] {
    const base = this.p('clips');
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => this.clipInfo(e.name)).filter(Boolean) as ClipInfo[];
  }
  clipInfo(id: string): ClipInfo | null {
    const dir = this.p('clips', id);
    if (!fs.existsSync(path.join(dir, 'index.html'))) return null;
    const m = readJson<Partial<PackageManifest>>(path.join(dir, 'manifest.json'), {});
    const params = readJson<{ schema?: ClipInfo['schema'] }>(path.join(dir, 'params.json'), {});
    let updatedAt = 0;
    for (const f of fs.readdirSync(dir)) { try { updatedAt = Math.max(updatedAt, fs.statSync(path.join(dir, f)).mtimeMs); } catch {} }
    return { id, kind: 'clip', name: m.name || id, description: m.description, category: m.category, tags: m.tags, duration: m.duration || 5, source: m.source, schema: params.schema || {}, updatedAt };
  }
  listMusic(): MusicInfo[] {
    const base = this.p('music');
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'score.js'))).map((e) => this.musicInfo(e.name));
  }
  musicInfo(id: string): MusicInfo {
    const dir = this.p('music', id);
    const m = readJson<Partial<PackageManifest>>(path.join(dir, 'manifest.json'), {});
    const state = readJson<{ meta?: MusicInfo['meta']; rendered?: string; renderError?: string }>(this.p('.studio', 'music', id + '.json'), {});
    let updatedAt = 0;
    try { updatedAt = fs.statSync(path.join(dir, 'score.js')).mtimeMs; } catch {}
    return { id, kind: 'music', name: m.name || id, description: m.description, category: m.category, tags: m.tags, duration: state.meta?.duration || m.duration, source: m.source, meta: state.meta, rendered: state.rendered, renderError: state.renderError, updatedAt };
  }
  listMedia(): MediaInfo[] {
    const base = this.p('media');
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base).filter((f) => MEDIA_EXT[path.extname(f).toLowerCase()]).map((f) => this.mediaInfo(f));
  }
  mediaInfo(file: string): MediaInfo {
    const meta = readJson<MediaInfo | null>(this.p('.studio', 'media', file + '.json'), null);
    return meta || { file, type: MEDIA_EXT[path.extname(file).toLowerCase()] || 'video', duration: 0 };
  }

  // ---------- items ----------
  addItem(item: Omit<Item, 'id'> & { id?: string }) {
    return this.update((p) => {
      const it: Item = { ...item, id: item.id || 'i' + nid() } as Item;
      p.items.push(it);
      p.duration = Math.max(p.duration, Math.ceil(it.start + it.duration));
    });
  }

  // ---------- watching ----------
  watch() {
    this.watcher?.close();
    const w = chokidar.watch(this.dir, {
      ignoreInitial: true,
      ignored: (p: string) => /(^|[\/\\])(\.git|\.studio|node_modules|\.DS_Store)([\/\\]|$)/.test(path.relative(this.dir, p) || 'x') || p.endsWith('.tmp'),
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
    });
    let pending = new Set<string>();
    let timer: NodeJS.Timeout | null = null;
    const flush = () => {
      timer = null;
      const paths = [...pending];
      pending = new Set();
      const rels = paths.map((p) => path.relative(this.dir, p).split(path.sep).join('/'));
      if (paths.some((p) => p === this.p('project.json') && !this.isSelf(p))) {
        try { this.reload(); bus.send({ type: 'project', project: this.project }); } catch (e) { bus.send({ type: 'notice', level: 'error', text: 'project.json invalid: ' + (e as Error).message }); }
      }
      if (paths.some((p) => p === this.p('comments.json') && !this.isSelf(p))) {
        this.comments = readJson<Comment[]>(this.p('comments.json'), this.comments);
        bus.send({ type: 'comments', comments: this.comments });
      }
      if (rels.includes('script.json')) this.listeners.script?.();
      const musicIds = new Set(rels.filter((r) => r.startsWith('music/')).map((r) => r.split('/')[1]).filter(Boolean));
      for (const id of musicIds) this.listeners.music?.(id);
      const mediaFiles = new Set(rels.filter((r) => r.startsWith('media/') && r.split('/').length === 2).map((r) => r.split('/')[1]));
      for (const f of mediaFiles) if (fs.existsSync(this.p('media', f))) this.listeners.media?.(f);
      const clipIds = new Set(rels.filter((r) => r.startsWith('clips/')).map((r) => r.split('/')[1]).filter(Boolean));
      for (const id of clipIds) this.listeners.clip?.(id);
      const other = rels.filter((r) => r !== 'project.json' && r !== 'comments.json' && r !== 'script.json');
      if (other.length) bus.send({ type: 'files', paths: other });
    };
    w.on('all', (_ev, p) => {
      pending.add(p);
      if (!timer) timer = setTimeout(flush, 150);
    });
    this.watcher = w;
  }
  close() { this.watcher?.close(); }
}

function normalize(p: Project): Project {
  const out: Project = {
    version: 1,
    name: p.name || 'Untitled',
    width: Number(p.width) || 1920,
    height: Number(p.height) || 1080,
    fps: Number(p.fps) || 30,
    duration: Number(p.duration) || 30,
    background: p.background || '#000000',
    tracks: Array.isArray(p.tracks) && p.tracks.length ? p.tracks : DEFAULT_TRACKS.map((t) => ({ ...t })),
    items: (p.items || []).map((i) => ({ ...i, id: i.id || 'i' + nid(), start: Number(i.start) || 0, duration: Math.max(0.04, Number(i.duration) || 1), in: Number(i.in) || 0 })),
    markers: p.markers || [],
  };
  return out;
}

// ---------- current project singleton ----------
let current: ProjectStore | null = null;
const openListeners: ((p: ProjectStore) => void)[] = [];
export function onProjectOpen(fn: (p: ProjectStore) => void) { openListeners.push(fn); }
export function cur(): ProjectStore {
  if (!current) throw new Error('No project open');
  return current;
}
export function hasProject() { return !!current; }
export function openProject(dir: string) {
  current?.close();
  current = new ProjectStore(dir);
  current.watch();
  pushRecent(current.dir);
  for (const fn of openListeners) fn(current);
  bus.send({ type: 'project', project: current.project });
  return current;
}
