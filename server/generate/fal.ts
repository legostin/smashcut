// fal.ai — one key, many models, via the Queue API.
//   POST {queue}/{endpoint}          → {request_id, status_url, response_url, cancel_url}
//   GET  status_url?logs=1           → {status: IN_QUEUE{queue_position} | IN_PROGRESS{logs} | COMPLETED}
//   GET  response_url                → the model's output ({images:[{url}]} / {video:{url}})
//   PUT  cancel_url                  → 200 {status:'OK'} = removed from the queue; 202 CANCELLATION_REQUESTED = already
//                                      running (may still be billed); 400 ALREADY_COMPLETED
//   Authorization: Key <FAL_KEY>.  A failed request is also COMPLETED (with error) — the result call then returns the
//   4xx/5xx with {detail} (422 detail[].type content_policy_violation…).
// Input images: uploaded to fal storage (POST rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3 → PUT upload_url →
// file_url); data URIs are the fallback. Key check: GET api.fal.ai/v1/models?limit=1 (bad key → 401, free).
// Verified 2026-11-08: https://fal.ai/docs/api-reference/inference-api/index.md (+ queue/submit|status|result|cancel),
// https://fal.ai/docs/documentation/model-apis/errors.md, fal-js libs/client/src/storage.ts. Catalog: fal-models.ts.
import fs from 'node:fs';
import path from 'node:path';
import { request, json, genError } from './http.ts';
import { needKey, base } from './keys.ts';
import type { Provider, ModelSpec, JobRef, PollResult, GenImageInput, GenRequest, GenOutput } from './types.ts';
import { FAL_MODELS, FAL_DOCS } from './fal-models.ts';

const P = 'fal.ai';
const QUEUE = () => base('STUDIO_FAL_BASE', 'https://queue.fal.run');
const REST = () => base('STUDIO_FAL_REST', 'https://rest.fal.ai');
const PLATFORM = () => base('STUDIO_FAL_API', 'https://api.fal.ai');
const auth = (k: string) => ({ authorization: 'Key ' + k });

async function upload(i: GenImageInput, key: string, signal: AbortSignal): Promise<string> {
  const buf = fs.readFileSync(i.abs);
  try {
    const init = await json<any>(`${REST()}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
      method: 'POST', headers: { ...auth(key), 'content-type': 'application/json' }, body: JSON.stringify({ content_type: i.mime, file_name: path.basename(i.abs) }),
    }, { provider: P, retries: 2, timeoutMs: 30000, signal });
    if (!init.upload_url || !init.file_url) throw new Error('no upload url');
    await request(init.upload_url, { method: 'PUT', headers: { 'content-type': i.mime }, body: buf }, { provider: P, retries: 2, timeoutMs: 120_000, signal });
    return init.file_url;
  } catch (e: any) {
    if (signal.aborted || e?.code === 'bad_key' || e?.code === 'no_credits') throw e;
    // fal endpoints also accept base64 data URIs
    return `data:${i.mime};base64,${buf.toString('base64')}`;
  }
}

/** map a GenRequest onto the model's input fields (route.fields) */
async function inputOf(req: GenRequest, key: string, signal: AbortSignal): Promise<{ endpoint: string; input: Record<string, unknown> }> {
  const m = req.model, r = m.route || {};
  const f: Record<string, string> = { prompt: 'prompt', image: 'image_url', endImage: 'end_image_url', negative: 'negative_prompt', aspect: 'aspect_ratio', duration: 'duration', resolution: 'resolution', seed: 'seed', count: 'num_images', audio: 'generate_audio', ...(r.fields || {}) };
  const endpoint: string = req.image ? r.image || r.text || m.id : r.text || m.id;
  if (req.image && !r.image && !r.imageOnSame && r.text) throw genError('bad_input', { provider: P, detail: `${m.id} has no image input` });
  const input: Record<string, unknown> = { ...(r.defaults || {}) };
  let prompt = req.prompt;
  if (req.camera && !(r.cameras && f.camera)) prompt += `. Camera: ${req.camera}.`;
  if (req.negative && !m.negative) prompt += `. Avoid: ${req.negative}.`;
  if (prompt) input[f.prompt] = prompt;
  if (req.image) {
    const u = await upload(req.image, key, signal);
    if (r.imageList) input[r.imageList] = [u]; else input[f.image] = u;
  }
  if (req.endImage) input[f.endImage] = await upload(req.endImage, key, signal);
  if (req.negative && m.negative) input[f.negative] = req.negative;
  if (req.aspect && !r.noAspect && !(req.image && r.aspectFromImage)) input[f.aspect] = r.aspectMap?.[req.aspect] ?? req.aspect;
  if (req.kind === 'image' && r.size) input[r.size] = r.sizePreset ? r.sizePreset[req.aspect] ?? { width: req.width, height: req.height } : { width: req.width, height: req.height };
  if (req.kind === 'video' && req.duration) input[f.duration] = r.durationAs === 'string' ? String(req.duration) : r.durationAs === 's' ? `${req.duration}s` : req.duration;
  if (req.resolution) input[f.resolution] = r.resMap?.[req.resolution] ?? req.resolution;
  if (req.seed != null && m.seed) input[f.seed] = req.seed;
  if (req.kind === 'image' && (m.maxCount || 1) > 1) input[f.count] = req.count;
  if (m.audio && f.audio) input[f.audio] = !!req.audio;
  if (req.camera && r.cameras && f.camera) input[f.camera] = req.camera;
  return { endpoint, input: { ...input, ...(req.extra || {}) } };
}

function outputsOf(j: any, kind: 'image' | 'video'): GenOutput[] {
  const seed = typeof j?.seed === 'number' ? j.seed : undefined;
  if (kind === 'image') {
    const list = Array.isArray(j?.images) ? j.images : j?.image ? [j.image] : [];
    return list.filter((x: any) => x?.url).map((x: any) => ({ kind: 'image', url: x.url, seed, ext: x.content_type ? x.content_type.split('/')[1]?.replace('jpeg', 'jpg') : undefined }));
  }
  const v = j?.video || (Array.isArray(j?.videos) ? j.videos[0] : undefined);
  return v?.url ? [{ kind: 'video', url: v.url, seed }] : [];
}

export const fal: Provider = {
  id: 'fal',
  title: P,
  needsKey: true,
  keyField: 'falKey',
  envKeys: ['FAL_KEY'],
  keyUrl: 'https://fal.ai/dashboard/keys',
  docs: FAL_DOCS,
  note: 'One key → many models (Kling 4, Gemini Omni, MiniMax H3, Wan 3, Luma Ray 3.2, Seedance 2.5, FLUX 3 Max, PixVerse video; Nano Banana 2.1, FLUX, Seedream 5, GPT Image 2.6, Ideogram, Recraft stills). Any other fal endpoint id can be passed as model (fields via extra).',
  pollEvery: 2,
  async checkKey(key) {
    try {
      // free: the platform model search answers 401 for a bad key (200 with a valid one; balance is not checked)
      await request(`${PLATFORM()}/v1/models?limit=1`, { headers: auth(needKey(this, key)) }, { provider: P, retries: 1, timeoutMs: 15000 });
      return { ok: true, detail: 'key ok (balance is checked when you generate)' };
    } catch (e: any) { return { ok: false, detail: e.message }; }
  },
  models: () => FAL_MODELS,
  defaultModel: (kind) => (kind === 'image' ? 'nano-banana-2.1' : 'kling-4'),
  rawModel(id, kind) {
    if (!/^[\w-]+\/[\w./-]+$/.test(id)) return undefined;
    return {
      id, provider: 'fal', kind, title: id, text: true, image: true, endImage: true, negative: true, seed: true, maxCount: kind === 'image' ? 4 : 1,
      price: kind === 'video' ? { unit: 'second', usd: 0.3, note: 'unlisted endpoint — conservative guess, see the model page' } : { unit: 'image', usd: 0.08, note: 'unlisted endpoint — conservative guess' },
      route: { text: id, imageOnSame: true },
    };
  },
  async submit(req, ctx): Promise<JobRef> {
    const key = needKey(this);
    const { endpoint, input } = await inputOf(req, key, ctx.signal);
    const j = await json<any>(`${QUEUE()}/${endpoint}`, { method: 'POST', headers: { ...auth(key), 'content-type': 'application/json' }, body: JSON.stringify(input) }, { provider: P, retries: 1, timeoutMs: 120_000, signal: ctx.signal, model: endpoint });
    if (!j.request_id) throw genError('provider_error', { provider: P, detail: 'no request id' });
    // status/result live under the app id (owner/name), not the full sub-path — prefer the URLs fal returns
    const app = endpoint.split('/').slice(0, 2).join('/');
    const q = `${QUEUE()}/${app}/requests/${j.request_id}`;
    return { provider: 'fal', id: j.request_id, data: { kind: req.kind, endpoint, status: j.status_url || q + '/status', response: j.response_url || q, cancel: j.cancel_url || q + '/cancel' } };
  },
  async poll(ref, ctx): Promise<PollResult> {
    const key = needKey(this);
    const s = await json<any>(`${ref.data!.status}${ref.data!.status.includes('?') ? '&' : '?'}logs=1`, { headers: auth(key) }, { provider: P, retries: 4, timeoutMs: 30000, signal: ctx.signal });
    if (s.status === 'IN_QUEUE') return { status: 'queued', position: typeof s.queue_position === 'number' ? s.queue_position + 1 : undefined };
    if (s.status === 'IN_PROGRESS') {
      const pct = [...(s.logs || [])].map((l: any) => /(\d{1,3})%/.exec(String(l?.message || ''))?.[1]).filter(Boolean).pop();
      return { status: 'running', progress: pct ? Math.min(1, Number(pct) / 100) : undefined };
    }
    if (s.status !== 'COMPLETED') return { status: 'running' };
    // the result: errors of the model (validation, content policy) come back here as 4xx
    try {
      const r = await json<any>(ref.data!.response, { headers: auth(key) }, { provider: P, retries: 4, timeoutMs: 60000, signal: ctx.signal, model: ref.data!.endpoint });
      const outputs = outputsOf(r, ref.data!.kind);
      if (!outputs.length && s.error) return { status: 'failed', error: genError(/polic|safety|nsfw/i.test(String(s.error)) ? 'content_policy' : 'provider_error', { provider: P, detail: String(s.error).slice(0, 300) }) };
      if (!outputs.length) return { status: 'failed', error: genError('provider_error', { provider: P, detail: 'no output in the result: ' + JSON.stringify(r).slice(0, 200) }) };
      return { status: 'done', outputs, seed: typeof r.seed === 'number' ? r.seed : undefined };
    } catch (e: any) {
      if (ctx.signal.aborted) throw e;
      return { status: 'failed', error: e };
    }
  },
  async cancel(ref) {
    try {
      const r = await fetch(ref.data!.cancel, { method: 'PUT', headers: auth(needKey(this)), signal: AbortSignal.timeout(15000) });
      if (!r.ok) return false;
      const j: any = await r.json().catch(() => ({}));
      // only 'OK' means it never ran (not billed); CANCELLATION_REQUESTED = already running
      return r.status === 200 && (!j.status || j.status === 'OK');
    } catch { return false; }
  },
};

