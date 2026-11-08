// REST for generative footage (mounted from server/routes.ts).
//   GET  /api/generators          providers, key status (never the keys), models with inputs & cost estimates, defaults, budget
//   POST /api/generators/check    {provider, key?} → {ok, detail}  (free key / reachability check; key = unsaved value from the UI)
//   GET  /api/generators/spend    today's spend vs the daily budget, recent entries
//   POST /api/generators/estimate {kind, params} → {usd, …}  (same validation as the ops, nothing is generated)
import type { FastifyInstance } from 'fastify';
import { MASK } from '../config.ts';
import { cur, hasProject } from '../project.ts';
import { listGenerators, getProvider, prepare, PROVIDERS, budget, type GenParams } from './index.ts';

export async function registerGenerateRoutes(app: FastifyInstance) {
  app.get('/api/generators', async () => listGenerators());
  app.get('/api/generators/spend', async () => budget.spendReport());
  app.post<{ Body: { provider?: string; key?: string } }>('/api/generators/check', async (req) => {
    const { provider, key } = req.body || {};
    const p = getProvider(String(provider || ''));
    if (!p) throw Object.assign(new Error(`unknown provider; known: ${PROVIDERS.map((x) => x.id).join(', ')}`), { statusCode: 400 });
    const k = typeof key === 'string' && key.trim() && !key.startsWith(MASK) ? key.trim() : undefined;
    return p.checkKey(k);
  });
  app.post<{ Body: { kind?: 'image' | 'video'; params?: GenParams } }>('/api/generators/estimate', async (req) => {
    const kind = req.body?.kind === 'video' ? 'video' : 'image';
    const pr = prepare(kind, { ...(req.body?.params || ({} as GenParams)), image: undefined, endImage: undefined, ...(req.body?.params?.image ? { image: req.body.params.image } : {}) }, hasProject() ? cur().dir : process.cwd());
    return { provider: pr.provider.id, model: pr.model.id, usd: pr.usd, estimated: true, calls: pr.calls, aspect: pr.req.aspect, duration: pr.req.duration, notes: pr.notes, budget: budget.spendReport() };
  });
}
