// REST for the media toolkit (registered from server/routes.ts).
//   GET  /api/toolkit                  catalog {ops:[ToolOpInfo]}
//   POST /api/toolkit/run              {op, params, wait?} → ToolkitJob (wait=true: resolves when finished, ≤ 10 min)
//   GET  /api/toolkit/jobs             jobs of the current project (newest first)
//   GET  /api/toolkit/jobs/:id         one job (poll this)
//   POST /api/toolkit/jobs/:id/cancel  {ok}
// Calls carrying x-studio-task (agents) get their image results (and video thumbnails) pushed into the agent feed.
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { cur, hasProject, pbase, MEDIA_EXT } from '../project.ts';
import { msg } from '../i18n.ts';
import { taskEvent } from '../agents/runner.ts';
import { catalog, runOp, listJobs, getJob, cancelJob, getOp } from './index.ts';
import type { ToolkitJob } from '../../shared/types.ts';

const need = () => { if (!hasProject()) throw Object.assign(new Error('no project open'), { statusCode: 409 }); return cur(); };

/** show finished outputs in the agent's feed: images directly, videos by their library thumbnail */
function feed(tid: string, base: string, job: ToolkitJob) {
  if (job.status !== 'done' || !job.outputs) return;
  const op = getOp(job.op);
  for (const [name, v] of Object.entries(job.outputs)) {
    if (typeof v !== 'string' || !v.startsWith('media/')) continue;
    const kind = MEDIA_EXT[path.extname(v).toLowerCase()];
    const label = msg('{op} → {file}', { op: job.op, file: path.basename(v) });
    if (kind === 'image' || op?.outputs[name]?.kind === 'image') taskEvent(tid, { kind: 'image', src: `${base}/${v}`, ...label });
    else if (kind === 'video') {
      const info = cur().mediaInfo(v.slice('media/'.length));
      if (info.thumb) taskEvent(tid, { kind: 'image', src: `${base}/${info.thumb}`, ...label });
    }
  }
}

export async function registerToolkitRoutes(app: FastifyInstance) {
  app.get('/api/toolkit', async () => ({ ops: catalog() }));
  app.get('/api/toolkit/jobs', async () => { need(); return listJobs(); });
  app.get<{ Params: { id: string } }>('/api/toolkit/jobs/:id', async (req) => {
    const j = getJob(req.params.id);
    if (!j) throw Object.assign(new Error('no such toolkit job'), { statusCode: 404 });
    return j;
  });
  app.post<{ Params: { id: string } }>('/api/toolkit/jobs/:id/cancel', async (req) => ({ ok: cancelJob(req.params.id) }));
  app.post<{ Body: { op: string; params?: Record<string, unknown>; wait?: boolean } }>('/api/toolkit/run', async (req) => {
    need();
    const { op, params, wait } = req.body || ({} as any);
    if (!op) throw Object.assign(new Error('op is required'), { statusCode: 400 });
    const h = runOp(op, params || {});
    const tid = String(req.headers['x-studio-task'] || '');
    if (tid) { const base = pbase(); h.done.then((j) => feed(tid, base, j)).catch(() => {}); }
    if (!wait) return h.job;
    return Promise.race([h.done, new Promise<ToolkitJob>((r) => setTimeout(() => r(getJob(h.job.id) || h.job), 10 * 60 * 1000))]);
  });
}
