import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Project, Script } from '../shared/types.ts';
import { getRecents, PROJECTS_DIR } from './config.ts';
import { ProjectStore, projectId, openStores } from './project.ts';
import { readJson } from './util.ts';
import { uerr } from './i18n.ts';

/**
 * Home screen data across projects — read straight from the folders (projects are NOT opened, so no watchers,
 * skill sync or agent recovery are started just to show a list).
 */
function knownDirs() {
  const inFolder = fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR).map((d) => path.join(PROJECTS_DIR, d)) : [];
  return [...new Set([...getRecents(), ...inFolder])].filter((d) => ProjectStore.exists(d));
}

const mtime = (f: string) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };

function newestFile(dir: string, re: RegExp) {
  if (!fs.existsSync(dir)) return null;
  let best: { f: string; t: number } | null = null;
  for (const f of fs.readdirSync(dir)) { if (!re.test(f)) continue; const t = mtime(path.join(dir, f)); if (!best || t > best.t) best = { f, t }; }
  return best?.f || null;
}

export function homeData() {
  const open = new Set(openStores().map((s) => s.dir));
  const recents = getRecents();
  const projects = knownDirs().map((dir) => {
    const p = readJson<Project | null>(path.join(dir, 'project.json'), null);
    const sc = readJson<Script | null>(path.join(dir, 'script.json'), null);
    const scenes = sc?.scenes || [];
    const end = p ? Math.max(0, ...p.items.map((i) => i.start + i.duration)) : 0;
    // poster: the newest cached storyboard frame, else the newest export's sibling? (kept simple: board cache)
    const poster = newestFile(path.join(dir, '.studio', 'board'), /\.jpg$/);
    const touched = Math.max(mtime(path.join(dir, 'project.json')), mtime(path.join(dir, 'script.json')), mtime(path.join(dir, '.studio', 'history.json')));
    const variant = readJson<{ label?: string } | null>(path.join(dir, '.studio', 'variant.json'), null);
    return {
      id: projectId(dir), dir, name: p?.name || path.basename(dir), width: p?.width || 1920, height: p?.height || 1080,
      duration: +(end || p?.duration || 0).toFixed(1), items: p?.items.length || 0,
      scenes: { total: scenes.length, done: scenes.filter((s) => s.status === 'done' || s.status === 'approved').length, review: scenes.filter((s) => s.status === 'review').length },
      updatedAt: touched || mtime(dir), open: open.has(dir), recentRank: recents.indexOf(dir), version: variant?.label || null,
      poster: poster ? `/api/home/file?dir=${encodeURIComponent(dir)}&rel=${encodeURIComponent('.studio/board/' + poster)}` : null,
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
  const renders = projects.flatMap((pr) => {
    const d = path.join(pr.dir, '.studio', 'exports');
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter((f) => /\.(mp4|mov|webm|gif)$/i.test(f)).map((f) => {
      const st = fs.statSync(path.join(d, f));
      return { projectId: pr.id, project: pr.name, file: f, size: st.size, mtime: st.mtimeMs, width: pr.width, height: pr.height, url: `/api/home/file?dir=${encodeURIComponent(pr.dir)}&rel=${encodeURIComponent('.studio/exports/' + f)}` };
    });
  }).sort((a, b) => b.mtime - a.mtime).slice(0, 24);
  return { projects, renders, projectsDir: PROJECTS_DIR };
}

export async function registerHomeRoutes(app: FastifyInstance) {
  app.get('/api/home', async () => homeData());
  /** a file of a known project (posters, renders) — only inside known project folders */
  app.get<{ Querystring: { dir: string; rel: string } }>('/api/home/file', async (req, reply) => {
    const dir = path.resolve(req.query.dir || '');
    if (!knownDirs().includes(dir)) throw uerr('Not found', {}, 404);
    const rel = path.normalize(req.query.rel || '');
    if (rel.startsWith('..') || path.isAbsolute(rel) || !/^\.studio[\\/](board|exports)[\\/]/.test(rel)) throw uerr('Not found', {}, 404);
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) throw uerr('Not found', {}, 404);
    reply.header('cache-control', 'max-age=60');
    return reply.sendFile(path.basename(abs), path.dirname(abs));
  });
}
