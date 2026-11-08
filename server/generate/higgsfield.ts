// Higgsfield API. Verified 2026-11-08: https://docs.higgsfield.ai/docs/llms.txt, /docs/openapi.json (v2.0.0),
// /docs/authentication.md, /docs/concepts/requests.md, /docs/concepts/file-uploads.md, /docs/concepts/billing-and-retention.md,
// /docs/models/soul-2/generate.md, /docs/models/cinema-studio-4/generate.md, SDK github.com/higgsfield-ai/higgsfield-client:
//   base https://api.higgsfield.ai, header Authorization: Key <KEY_ID>:<KEY_SECRET> (not Bearer)
//   POST /{endpoint} → {request_id, status_url, cancel_url}; GET /requests/{id}/status → queued|in_progress|completed{images[]|video}|
//   failed|nsfw|canceled; POST /requests/{id}/cancel (202, 400 once started); POST /estimate/{endpoint} → {usd} (free);
//   POST /files/generate-upload-url {content_type} → {public_url, upload_url, upload_headers} then PUT the bytes.
//   Prepaid USD balance; only successful generations are charged. Prices: https://higgsfield.ai/higgsfield-api (indicative).
import fs from 'node:fs';
import { json, request, genError } from './http.ts';
import { needKey, base } from './keys.ts';
import type { Provider, ModelSpec, JobRef, PollResult, GenImageInput, GenRequest } from './types.ts';

const P = 'Higgsfield';
const API = () => base('STUDIO_HIGGSFIELD_BASE', 'https://api.higgsfield.ai');
const PRICES = 'https://higgsfield.ai/higgsfield-api';
export const HIGGSFIELD_CAMERAS = ['dolly-in', 'dolly-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'crane-up', 'crane-down', 'drone-orbit', 'dolly-zoom', 'crush-zoom', 'bullet-time', 'whip-pan', 'handheld', 'tracking', 'arc-left', 'arc-right', 'truck-left', 'truck-right', 'slow-zoom-in', 'slow-zoom-out', 'static-shot', 'pov', 'snorricam', 'robot-arm', 'rack-focus', 'helicopter-shot', 'aerial-pullback', 'side-tracking', 'pedestal-up', 'pedestal-down', 'slider-left', 'slider-right'];

const MODELS: ModelSpec[] = [
  {
    id: 'cinema-studio-4', provider: 'higgsfield', kind: 'video', title: 'Higgsfield Cinema Studio 4.0', text: true, image: true, audio: true,
    durations: Array.from({ length: 27 }, (_, i) => i + 4), aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9'], resolutions: ['480p', '720p'], cameras: HIGGSFIELD_CAMERAS,
    price: { unit: 'second', usd: 0.21, note: 'indicative (sale prices change); exact cost from /estimate', source: PRICES },
    notes: 'native camera moves (camera = one of the presets); extra: camera_lens, light, genre, era, pacing, color_palette',
    route: { endpoint: 'higgsfield/cinema-studio/4.0', images: 'image_urls' },
  },
  {
    id: 'kling-2.5-turbo-pro', provider: 'higgsfield', kind: 'video', title: 'Kling 2.5 Turbo Pro (Higgsfield)', text: true, image: true, negative: true, durations: [5, 10],
    price: { unit: 'second', usd: 0.042, note: 'list price; often on sale', source: PRICES },
    route: { t2v: 'kling-video/v2.5-turbo/pro/text-to-video', i2v: 'kling-video/v2.5-turbo/pro/image-to-video' },
  },
  {
    id: 'hailuo-2.3', provider: 'higgsfield', kind: 'video', title: 'Hailuo 2.3 (Higgsfield)', text: true, image: true, durations: [6, 10],
    price: { unit: 'second', usd: 0.02, note: 'indicative', source: PRICES },
    route: { t2v: 'minimax/hailuo-2.3/standard/text-to-video', i2v: 'minimax/hailuo-2.3/standard/image-to-video' },
  },
  {
    id: 'soul-2', provider: 'higgsfield', kind: 'image', title: 'Higgsfield Soul 2', text: true, image: false, seed: true, maxCount: 4,
    aspects: ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2'], resolutions: ['720p', '1080p'],
    price: { unit: 'image', usd: 0.01, note: 'indicative', source: PRICES }, notes: 'fashion/photographic look; batch_size 1 or 4',
    route: { endpoint: 'higgsfield-ai/soul/v2/standard' },
  },
  {
    id: 'soul', provider: 'higgsfield', kind: 'image', title: 'Higgsfield Soul (2K/4K)', text: true, image: false, maxCount: 4,
    aspects: ['1:1', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '16:9', '9:16', '21:9'], resolutions: ['2K', '4K'],
    price: { unit: 'image', usd: 0.094, note: 'indicative', source: PRICES }, route: { endpoint: 'higgsfield-ai/soul/standard' },
  },
];

const auth = (k: string) => ({ authorization: 'Key ' + k, 'content-type': 'application/json' });

async function upload(i: GenImageInput, key: string, signal: AbortSignal): Promise<string> {
  const j = await json<any>(API() + '/files/generate-upload-url', { method: 'POST', headers: auth(key), body: JSON.stringify({ content_type: i.mime }) }, { provider: P, retries: 2, signal });
  await request(j.upload_url, { method: 'PUT', headers: { ...(j.upload_headers || {}), 'content-type': i.mime }, body: fs.readFileSync(i.abs) }, { provider: P, retries: 2, timeoutMs: 120_000, signal });
  return j.public_url;
}

function endpointOf(req: GenRequest): string {
  const r = req.model.route || {};
  if (r.endpoint) return r.endpoint;
  if (req.image) return r.i2v || req.model.id;
  return r.t2v || req.model.id;
}

async function bodyOf(req: GenRequest, key: string, signal: AbortSignal) {
  const m = req.model, r = m.route || {};
  const b: Record<string, unknown> = { prompt: req.prompt };
  if (m.kind === 'image') {
    if (m.id === 'soul-2') { b.batch_size = req.count >= 4 ? 4 : 1; if (req.seed != null) b.seed = Math.max(1, req.seed % 1_000_000); }
    else b.num_images = req.count;
    if (req.aspect) b.aspect_ratio = req.aspect;
    if (req.resolution) b.resolution = req.resolution;
  } else {
    if (req.duration) b.duration = req.duration;
    if (req.negative && m.negative) b.negative_prompt = req.negative;
    if (r.images) {
      if (req.image) b[r.images] = [await upload(req.image, key, signal), ...(req.endImage ? [await upload(req.endImage, key, signal)] : [])];
      b.aspect_ratio = req.aspect;
      if (req.resolution) b.resolution = req.resolution;
      if (m.audio) b.generate_audio = !!req.audio;
      if (req.camera) { if (HIGGSFIELD_CAMERAS.includes(req.camera)) b.camera_movement = req.camera; else b.prompt += `. Camera: ${req.camera}.`; }
    } else {
      if (req.image) b.image_url = await upload(req.image, key, signal);
      if (req.camera) b.prompt += `. Camera: ${req.camera}.`;
    }
  }
  return { ...b, ...(req.extra || {}) };
}

export const higgsfield: Provider = {
  id: 'higgsfield',
  title: P,
  needsKey: true,
  keyField: 'higgsfieldKey',
  envKeys: ['HF_KEY', 'HF_CREDENTIALS'],
  keyUrl: 'https://console.higgsfield.ai',
  docs: 'https://docs.higgsfield.ai/docs/quickstart',
  note: 'Higgsfield API — key is "KEY_ID:KEY_SECRET" from console.higgsfield.ai (prepaid USD balance). Cinema Studio 4.0 takes native camera moves (camera: dolly-in, crane-up, drone-orbit, whip-pan…). Any other catalog endpoint id can be passed as model.',
  async checkKey(key) {
    try {
      // no dedicated key endpoint: a random request id → 404 with a valid key, 401 with a bad one
      const r = await fetch(`${API()}/requests/00000000-0000-4000-8000-000000000000/status`, { headers: auth(needKey(this, key)), signal: AbortSignal.timeout(15000) });
      if (r.status === 401) return { ok: false, detail: 'Higgsfield: invalid credentials (use KEY_ID:KEY_SECRET)' };
      if (r.status === 403) return { ok: false, detail: 'Higgsfield: key disabled or no balance' };
      return { ok: r.status === 404 || r.ok, detail: r.status === 404 || r.ok ? 'key ok' : `HTTP ${r.status}` };
    } catch (e: any) { return { ok: false, detail: e.message }; }
  },
  models: () => MODELS,
  defaultModel: (kind) => (kind === 'image' ? 'soul-2' : 'cinema-studio-4'),
  rawModel(id, kind) {
    if (!id.includes('/')) return undefined;
    return { id, provider: 'higgsfield', kind, title: id, text: true, image: true, negative: true, maxCount: 1, price: kind === 'video' ? { unit: 'second', usd: 0.2, note: 'unlisted endpoint — conservative guess (exact cost from /estimate)' } : { unit: 'image', usd: 0.1, note: 'unlisted endpoint — conservative guess' }, route: { endpoint: id } };
  },
  async submit(req, ctx): Promise<JobRef> {
    const key = needKey(this);
    const ep = endpointOf(req);
    const body = await bodyOf(req, key, ctx.signal);
    let usd: number | undefined;
    try { const e = await json<any>(`${API()}/estimate/${ep}`, { method: 'POST', headers: auth(key), body: JSON.stringify(body) }, { provider: P, retries: 0, timeoutMs: 15000, signal: ctx.signal }); usd = Number(e.usd); if (!Number.isFinite(usd)) usd = undefined; } catch {}
    const j = await json<any>(`${API()}/${ep}`, { method: 'POST', headers: auth(key), body: JSON.stringify(body) }, { provider: P, retries: 1, timeoutMs: 120_000, signal: ctx.signal, model: ep });
    if (!j.request_id) throw genError('provider_error', { provider: P, detail: 'no request id' });
    return { provider: 'higgsfield', id: j.request_id, data: { kind: req.kind, status: j.status_url, cancel: j.cancel_url, usd } };
  },
  async poll(ref, ctx): Promise<PollResult> {
    const j = await json<any>(ref.data?.status || `${API()}/requests/${ref.id}/status`, { headers: auth(needKey(this)) }, { provider: P, retries: 4, timeoutMs: 30000, signal: ctx.signal });
    switch (j.status) {
      case 'queued': return { status: 'queued' };
      case 'in_progress': return { status: 'running' };
      case 'completed': {
        const outs = ref.data?.kind === 'image' ? (j.images || []).map((x: any) => ({ kind: 'image' as const, url: x.url })) : j.video?.url ? [{ kind: 'video' as const, url: j.video.url }] : [];
        return { status: 'done', costUsd: ref.data?.usd, outputs: outs };
      }
      case 'nsfw': return { status: 'failed', error: genError('content_policy', { provider: P, detail: 'flagged as NSFW (not charged)' }) };
      case 'canceled': return { status: 'cancelled', error: genError('cancelled', {}) };
      default: return { status: 'failed', error: genError('provider_error', { provider: P, detail: String(j.error || j.status || 'failed') }) };
    }
  },
  async cancel(ref) {
    try { await request(ref.data?.cancel || `${API()}/requests/${ref.id}/cancel`, { method: 'POST', headers: auth(needKey(this)) }, { provider: P, retries: 0, timeoutMs: 15000 }); return true; } catch { return false; }
  },
};
