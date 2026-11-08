// Replicate (generic: curated official models + any owner/name[:version] passthrough).
// Verified 2026-11-08: https://replicate.com/docs/reference/http, https://api.replicate.com/openapi.json,
// https://replicate.com/docs/topics/predictions/input-files, /lifecycle, /rate-limits and each model's page (/api/schema):
//   Authorization: Bearer r8_…; POST /v1/models/{owner}/{name}/predictions {input} (official models) or
//   POST /v1/predictions {version, input}; GET /v1/predictions/{id} → status starting|processing|succeeded|failed|canceled|aborted,
//   output (uri string or array), logs (free text — progress parsed from "NN%"); POST /v1/predictions/{id}/cancel;
//   data URIs for files ≤ 256 KB, else POST /v1/files (multipart "content") → urls.get; GET /v1/account validates the key.
import fs from 'node:fs';
import path from 'node:path';
import { json, request, genError } from './http.ts';
import { needKey, base } from './keys.ts';
import type { Provider, ModelSpec, JobRef, PollResult, GenImageInput, GenRequest } from './types.ts';

const P = 'Replicate';
const API = () => base('STUDIO_REPLICATE_BASE', 'https://api.replicate.com');
const page = (m: string) => `https://replicate.com/${m}`;

// route.fields: our field → the model's input name; route.res: our resolution → {field, value}
const MODELS: ModelSpec[] = [
  {
    id: 'google/veo-3.1-fast', provider: 'replicate', kind: 'video', title: 'Veo 3.1 Fast', text: true, image: true, endImage: true, negative: true, seed: true, audio: true,
    durations: [4, 6, 8], aspects: ['16:9', '9:16'], resolutions: ['720p', '1080p'],
    price: { unit: 'second', usd: 0.10, audioUsd: 0.05, note: '$0.15/s with audio', source: page('google/veo-3.1-fast') },
    route: { fields: { image: 'image', endImage: 'last_frame', negative: 'negative_prompt', aspect: 'aspect_ratio', duration: 'duration', resolution: 'resolution', seed: 'seed', audio: 'generate_audio' } },
  },
  {
    id: 'google/veo-3.1', provider: 'replicate', kind: 'video', title: 'Veo 3.1', text: true, image: true, endImage: true, negative: true, seed: true, audio: true,
    durations: [4, 6, 8], aspects: ['16:9', '9:16'], resolutions: ['720p', '1080p'],
    price: { unit: 'second', usd: 0.20, audioUsd: 0.20, note: '$0.40/s with audio', source: page('google/veo-3.1') },
    route: { fields: { image: 'image', endImage: 'last_frame', negative: 'negative_prompt', aspect: 'aspect_ratio', duration: 'duration', resolution: 'resolution', seed: 'seed', audio: 'generate_audio' } },
  },
  {
    id: 'kwaivgi/kling-v3-video', provider: 'replicate', kind: 'video', title: 'Kling 3.0', text: true, image: true, endImage: true, negative: true, audio: true,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], aspects: ['16:9', '9:16', '1:1'], resolutions: ['720p', '1080p', '4k'],
    price: { unit: 'second', usd: 0.224, by: { '720p': 0.168, '1080p': 0.224, '4k': 0.42 }, audioUsd: 0.112, note: 'resolution → mode standard/pro/4k', source: page('kwaivgi/kling-v3-video') },
    route: { fields: { image: 'start_image', endImage: 'end_image', negative: 'negative_prompt', aspect: 'aspect_ratio', duration: 'duration', audio: 'generate_audio' }, res: { field: 'mode', map: { '720p': 'standard', '1080p': 'pro', '4k': '4k' } } },
  },
  {
    id: 'bytedance/seedance-2.0', provider: 'replicate', kind: 'video', title: 'Seedance 2.0', text: true, image: true, endImage: true, seed: true, audio: true,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], resolutions: ['480p', '720p', '1080p', '4k'],
    price: { unit: 'second', usd: 0.18, by: { '480p': 0.08, '720p': 0.18, '1080p': 0.45, '4k': 1.0 }, source: page('bytedance/seedance-2.0') },
    route: { fields: { image: 'image', endImage: 'last_frame_image', aspect: 'aspect_ratio', duration: 'duration', resolution: 'resolution', seed: 'seed', audio: 'generate_audio' } },
  },
  {
    id: 'alibaba/wan-3', provider: 'replicate', kind: 'video', title: 'Wan 3', text: true, image: true, negative: true, seed: true,
    durations: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30], aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], resolutions: ['480p', '720p', '1080p'],
    price: { unit: 'second', usd: 0.14, by: { '480p': 0.035, '720p': 0.07, '1080p': 0.14 }, source: page('alibaba/wan-3') }, notes: 'cheap drafts at 480p/720p',
    route: { fields: { image: 'image', negative: 'negative_prompt', aspect: 'aspect_ratio', duration: 'duration', resolution: 'resolution', seed: 'seed' } },
  },
  {
    id: 'minimax/hailuo-2.3', provider: 'replicate', kind: 'video', title: 'Hailuo 2.3', text: true, image: true, durations: [6, 10], resolutions: ['768p', '1080p'],
    price: { unit: 'second', usd: 0.056, by: { '768p': 0.056, '1080p': 0.082 }, note: '768p $0.28/6 s, $0.56/10 s; 1080p $0.49/6 s', source: page('minimax/hailuo-2.3') },
    notes: 'aspect follows the first frame; 10 s only at 768p', route: { fields: { image: 'first_frame_image', duration: 'duration', resolution: 'resolution' }, noAspect: true },
  },
  {
    id: 'black-forest-labs/flux-2-pro', provider: 'replicate', kind: 'image', title: 'FLUX.2 pro', text: true, image: true, seed: true, maxCount: 1,
    aspects: ['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '3:4', '21:9', '9:21'],
    price: { unit: 'megapixel', usd: 0.03, note: '$0.015/run + $0.015 per input & output MP', source: page('black-forest-labs/flux-2-pro') },
    route: { fields: { aspect: 'aspect_ratio', seed: 'seed' }, imageList: 'input_images' },
  },
  {
    id: 'black-forest-labs/flux-1.1-pro-ultra', provider: 'replicate', kind: 'image', title: 'FLUX 1.1 pro ultra', text: true, image: true, seed: true, maxCount: 1,
    aspects: ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '9:21'],
    price: { unit: 'image', usd: 0.06, source: page('black-forest-labs/flux-1.1-pro-ultra') }, notes: 'photoreal 4 MP; image = image prompt (style/composition reference)',
    route: { fields: { image: 'image_prompt', aspect: 'aspect_ratio', seed: 'seed' } },
  },
  {
    id: 'google/nano-banana-pro', provider: 'replicate', kind: 'image', title: 'Nano Banana Pro', text: true, image: true, maxCount: 1,
    aspects: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'], resolutions: ['1K', '2K', '4K'],
    price: { unit: 'image', usd: 0.15, by: { '1K': 0.15, '2K': 0.15, '4K': 0.3 }, source: page('google/nano-banana-pro') },
    route: { fields: { aspect: 'aspect_ratio', resolution: 'resolution' }, imageList: 'image_input' },
  },
];

async function fileInput(i: GenImageInput, key: string, signal: AbortSignal): Promise<string> {
  const buf = fs.readFileSync(i.abs);
  if (buf.length <= 256 * 1024) return `data:${i.mime};base64,${buf.toString('base64')}`;
  const fd = new FormData();
  fd.append('content', new Blob([buf], { type: i.mime }), path.basename(i.abs));
  const j = await json<any>(API() + '/v1/files', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: fd }, { provider: P, retries: 2, timeoutMs: 120_000, signal });
  if (!j.urls?.get) throw genError('provider_error', { provider: P, detail: 'file upload returned no url' });
  return j.urls.get;
}

async function buildInput(req: GenRequest, key: string, signal: AbortSignal) {
  const r = req.model.route || { fields: { image: 'image', negative: 'negative_prompt', aspect: 'aspect_ratio', duration: 'duration', resolution: 'resolution', seed: 'seed' } };
  const f = r.fields || {};
  const input: Record<string, unknown> = { prompt: req.prompt + (req.camera ? `. Camera: ${req.camera}.` : '') };
  if (req.image) { const u = await fileInput(req.image, key, signal); if (r.imageList) input[r.imageList] = [u]; else if (f.image) input[f.image] = u; }
  if (req.endImage && f.endImage) input[f.endImage] = await fileInput(req.endImage, key, signal);
  if (req.negative) { if (f.negative) input[f.negative] = req.negative; else input.prompt += `. Avoid: ${req.negative}`; }
  if (f.aspect && !r.noAspect) input[f.aspect] = req.aspect;
  if (req.kind === 'video' && f.duration && req.duration) input[f.duration] = req.duration;
  if (req.resolution) { if (r.res) input[r.res.field] = r.res.map[req.resolution] ?? req.resolution; else if (f.resolution) input[f.resolution] = req.resolution; }
  if (req.seed != null && f.seed) input[f.seed] = req.seed;
  if (f.audio && req.model.audio) input[f.audio] = !!req.audio;
  return { ...input, ...(req.extra || {}) };
}

export const replicate: Provider = {
  id: 'replicate',
  title: P,
  needsKey: true,
  keyField: 'replicateKey',
  envKeys: ['REPLICATE_API_TOKEN'],
  keyUrl: 'https://replicate.com/account/api-tokens',
  docs: 'https://replicate.com/docs/reference/http',
  note: 'Curated models below, or pass any model as model:"owner/name" or "owner/name:version" — then prompt/image/aspect/duration/seed map to the usual input names and `extra` (JSON) passes the model\'s own fields. Cost of unlisted models is a conservative guess.',
  async checkKey(key) {
    try { const j = await json<any>(API() + '/v1/account', { headers: { authorization: 'Bearer ' + needKey(this, key) } }, { provider: P, retries: 1, timeoutMs: 15000 }); return { ok: true, detail: `key ok · ${j.username || j.name || ''}`.trim() }; }
    catch (e: any) { return { ok: false, detail: e.message }; }
  },
  models: () => MODELS,
  defaultModel: (kind) => (kind === 'image' ? 'black-forest-labs/flux-2-pro' : 'google/veo-3.1-fast'),
  rawModel(id, kind) {
    if (!/^[\w.-]+\/[\w.-]+(:[0-9a-f]{64})?$/.test(id)) return undefined;
    return {
      id, provider: 'replicate', kind, title: id, text: true, image: true, endImage: false, negative: true, seed: true, maxCount: 1,
      price: kind === 'video' ? { unit: 'second', usd: 0.3, note: 'unlisted model — conservative guess, check the model page' } : { unit: 'image', usd: 0.08, note: 'unlisted model — conservative guess' },
    };
  },
  async submit(req, ctx): Promise<JobRef> {
    const key = needKey(this);
    const input = await buildInput(req, key, ctx.signal);
    const [model, version] = req.model.id.split(':');
    const url = version ? API() + '/v1/predictions' : `${API()}/v1/models/${model}/predictions`;
    const body = version ? { version, input } : { input };
    const j = await json<any>(url, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) }, { provider: P, retries: 1, timeoutMs: 120_000, signal: ctx.signal, model: req.model.id });
    if (!j.id) throw genError('provider_error', { provider: P, detail: 'no prediction id' });
    return { provider: 'replicate', id: j.id, data: { kind: req.kind, get: j.urls?.get, cancel: j.urls?.cancel } };
  },
  async poll(ref, ctx): Promise<PollResult> {
    const key = needKey(this);
    const j = await json<any>(ref.data?.get || `${API()}/v1/predictions/${ref.id}`, { headers: { authorization: 'Bearer ' + key } }, { provider: P, retries: 4, timeoutMs: 30000, signal: ctx.signal });
    const pct = [...String(j.logs || '').matchAll(/(\d{1,3})%\|/g)].pop();
    switch (j.status) {
      case 'starting': return { status: 'queued' };
      case 'processing': return { status: 'running', progress: pct ? Math.min(1, Number(pct[1]) / 100) : undefined };
      case 'succeeded': {
        const urls = (Array.isArray(j.output) ? j.output : [j.output]).filter((u: unknown) => typeof u === 'string' && /^(https?:|data:)/.test(u));
        return { status: 'done', outputs: urls.map((u: string) => ({ kind: ref.data?.kind || 'image', url: u })) };
      }
      case 'canceled': case 'aborted': return { status: 'cancelled', error: genError('cancelled', {}) };
      default: {
        const detail = String(j.error || 'failed').slice(0, 400);
        return { status: 'failed', error: /nsfw|safety|sensitive|flagged|policy/i.test(detail) ? genError('content_policy', { provider: P, detail }) : genError('provider_error', { provider: P, detail }) };
      }
    }
  },
  async cancel(ref) {
    try { await request(ref.data?.cancel || `${API()}/v1/predictions/${ref.id}/cancel`, { method: 'POST', headers: { authorization: 'Bearer ' + needKey(this) } }, { provider: P, retries: 1, timeoutMs: 15000 }); return true; } catch { return false; }
  },
};
