// Runway API (official). Verified 2026-11-08 against https://docs.dev.runwayml.com/openapi.json (version 2024-11-06),
// https://docs.dev.runwayml.com/guides/models.md, /guides/pricing.md, /assets/inputs.md, /errors/task-failures.md:
//   base https://api.dev.runwayml.com, headers Authorization: Bearer key_…, X-Runway-Version: 2024-11-06
//   POST /v1/image_to_video | /v1/text_to_video | /v1/text_to_image → {id}; GET /v1/tasks/{id} → status PENDING|THROTTLED|
//   RUNNING{progress}|SUCCEEDED{output[], cost.credits}|FAILED{failure, failureCode}|CANCELLED; DELETE /v1/tasks/{id} cancels.
//   promptImage: https URL or data URI (≤ 5 MB encoded) or [{uri, position:'first'|'last'}] (veo3.1 first+last).
//   GET /v1/organization (free) validates the key. 1 credit = $0.01.
import fs from 'node:fs';
import sharp from 'sharp';
import { request, json, genError } from './http.ts';
import { needKey, base } from './keys.ts';
import type { Provider, ModelSpec, JobRef, PollResult, GenImageInput } from './types.ts';

const P = 'Runway';
const API = () => base('STUDIO_RUNWAY_BASE', 'https://api.dev.runwayml.com');
const VERSION = '2024-11-06';
const PRICING = 'https://docs.dev.runwayml.com/guides/pricing.md';
const GEN_RATIOS = ['1280:720', '720:1280', '1104:832', '960:960', '832:1104', '1584:672'];
const VEO_RATIOS = ['1280:720', '720:1280', '1920:1080', '1080:1920'];
const IMG_RATIOS = ['1920:1080', '1080:1920', '1024:1024', '1080:1080', '1360:768', '1440:1080', '1080:1440', '1808:768', '1280:720', '720:1280', '720:720', '960:720', '720:960', '1168:880', '2112:912', '1680:720'];
const d2_10 = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const MODELS: ModelSpec[] = [
  {
    id: 'gen4.5', provider: 'runway', kind: 'video', title: 'Runway Gen-4.5', text: true, image: true, seed: true, durations: d2_10,
    aspects: ['16:9', '9:16', '4:3', '1:1', '3:4', '21:9'],
    price: { unit: 'second', usd: 0.12, note: '12 credits/s', source: PRICING }, notes: 'text-to-video only in 16:9 / 9:16; strong motion & physics',
    route: { ratios: GEN_RATIOS, t2vRatios: ['1280:720', '720:1280'] },
  },
  {
    id: 'gen4_turbo', provider: 'runway', kind: 'video', title: 'Runway Gen-4 Turbo (image → video)', text: false, image: true, seed: true, durations: d2_10,
    aspects: ['16:9', '9:16', '4:3', '1:1', '3:4', '21:9'],
    price: { unit: 'second', usd: 0.05, note: '5 credits/s', source: PRICING }, notes: 'fast & cheap; needs a first frame',
    route: { ratios: GEN_RATIOS, i2vOnly: true },
  },
  {
    id: 'veo3.1', provider: 'runway', kind: 'video', title: 'Veo 3.1 (via Runway)', text: true, image: true, endImage: true, negative: true, seed: true, audio: true,
    durations: [4, 6, 8], aspects: ['16:9', '9:16'], resolutions: ['720p', '1080p'],
    price: { unit: 'second', usd: 0.2, audioUsd: 0.2, note: '20 credits/s, 40 with audio', source: PRICING }, notes: 'first + last frame keyframes; native audio',
    route: { ratios: VEO_RATIOS },
  },
  {
    id: 'veo3.1_fast', provider: 'runway', kind: 'video', title: 'Veo 3.1 Fast (via Runway)', text: true, image: true, endImage: true, negative: true, seed: true, audio: true,
    durations: [4, 6, 8], aspects: ['16:9', '9:16'], resolutions: ['720p', '1080p'],
    price: { unit: 'second', usd: 0.1, audioUsd: 0.05, note: '10 credits/s, 15 with audio', source: PRICING },
    route: { ratios: VEO_RATIOS },
  },
  {
    id: 'gen4_image', provider: 'runway', kind: 'image', title: 'Runway Gen-4 Image', text: true, image: true, seed: true, maxCount: 1,
    aspects: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], resolutions: ['720p', '1080p'],
    price: { unit: 'image', usd: 0.08, by: { '720p': 0.05, '1080p': 0.08 }, note: '5 credits 720p / 8 credits 1080p', source: PRICING },
    notes: 'reference image keeps a character/product consistent (referenceImages)', route: { ratios: IMG_RATIOS },
  },
];

const ratioNum = (r: string) => { const [w, h] = r.split(':').map(Number); return w / h; };
const aspectNum = (a: string) => { const [w, h] = a.split(':').map(Number); return w / h; };
function pickRatio(list: string[], aspect: string, res?: string) {
  const want = aspectNum(aspect);
  const target = res === '1080p' ? 1080 : res === '720p' ? 720 : 0;
  let best = list[0], score = Infinity;
  for (const r of list) {
    const [w, h] = r.split(':').map(Number);
    const s = Math.abs(Math.log(ratioNum(r) / want)) * 10 + (target ? Math.abs(Math.min(w, h) - target) / 1000 : 0);
    if (s < score) { score = s; best = r; }
  }
  return best;
}

/** data URI ≤ 5 MB encoded (recompress large frames as JPEG) */
async function dataUri(i: GenImageInput): Promise<string> {
  let buf = fs.readFileSync(i.abs), mime = i.mime;
  if (buf.length > 3.3e6 || !/png|jpeg|webp/.test(mime)) { buf = await sharp(buf).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(); mime = 'image/jpeg'; }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const headers = (key: string) => ({ authorization: 'Bearer ' + key, 'x-runway-version': VERSION, 'content-type': 'application/json' });

export const runway: Provider = {
  id: 'runway',
  title: P,
  needsKey: true,
  keyField: 'runwayKey',
  envKeys: ['RUNWAYML_API_SECRET'],
  keyUrl: 'https://dev.runwayml.com/',
  docs: 'https://docs.dev.runwayml.com/',
  note: 'Official Runway API (developer portal credits, separate from a runwayml.com subscription). Gen-4.5 / Gen-4 Turbo image-to-video, Veo 3.1 with first+last frames.',
  pollEvery: 5,
  async checkKey(key) {
    try {
      const j = await json<any>(API() + '/v1/organization', { headers: headers(needKey(this, key)) }, { provider: P, retries: 1, timeoutMs: 15000 });
      return { ok: true, detail: `key ok · ${j.creditBalance ?? '?'} credits (~$${((j.creditBalance || 0) / 100).toFixed(2)})` };
    } catch (e: any) { return { ok: false, detail: e.message }; }
  },
  models: () => MODELS,
  defaultModel: (kind, withImage) => (kind === 'image' ? 'gen4_image' : withImage ? 'gen4_turbo' : 'gen4.5'),
  async submit(req, ctx): Promise<JobRef> {
    const key = needKey(this);
    const m = req.model;
    const promptText = (req.prompt + (req.camera ? ` Camera: ${req.camera}.` : '')).slice(0, 1000);
    let path: string, body: any;
    if (req.kind === 'image') {
      path = '/v1/text_to_image';
      body = { model: m.id, promptText, ratio: pickRatio(m.route!.ratios, req.aspect, req.resolution), ...(req.seed != null ? { seed: req.seed } : {}) };
      if (req.image) body.referenceImages = [{ uri: await dataUri(req.image), tag: 'ref' }];
    } else {
      const ratios = !req.image && m.route?.t2vRatios ? m.route.t2vRatios : m.route!.ratios;
      body = { model: m.id, ratio: pickRatio(ratios, req.aspect, req.resolution), duration: req.duration, ...(promptText ? { promptText } : {}), ...(req.seed != null ? { seed: req.seed } : {}) };
      if (m.negative && req.negative) body.negativePrompt = req.negative;
      if (m.audio) body.audio = !!req.audio;
      if (req.image) {
        path = '/v1/image_to_video';
        body.promptImage = req.endImage
          ? [{ uri: await dataUri(req.image), position: 'first' }, { uri: await dataUri(req.endImage), position: 'last' }]
          : await dataUri(req.image);
      } else path = '/v1/text_to_video';
    }
    Object.assign(body, req.extra || {});
    const j = await json<any>(API() + path, { method: 'POST', headers: headers(key), body: JSON.stringify(body) }, { provider: P, retries: 1, timeoutMs: 120_000, signal: ctx.signal, model: m.id });
    if (!j.id) throw genError('provider_error', { provider: P, detail: 'no task id' });
    return { provider: 'runway', id: j.id, data: { kind: req.kind } };
  },
  async poll(ref, ctx): Promise<PollResult> {
    const t = await json<any>(`${API()}/v1/tasks/${ref.id}`, { headers: headers(needKey(this)) }, { provider: P, retries: 4, timeoutMs: 30000, signal: ctx.signal });
    const costUsd = t.cost?.credits != null ? t.cost.credits / 100 : undefined;
    switch (t.status) {
      case 'PENDING': return { status: 'queued' };
      case 'THROTTLED': return { status: 'queued', position: undefined };
      case 'RUNNING': return { status: 'running', progress: typeof t.progress === 'number' ? t.progress : undefined };
      case 'SUCCEEDED': return { status: 'done', costUsd, outputs: (t.output || []).map((u: string) => ({ kind: ref.data?.kind || 'video', url: u })) };
      case 'CANCELLED': return { status: 'cancelled', costUsd, error: genError('cancelled', {}) };
      default: {
        const code = String(t.failureCode || '');
        const detail = `${t.failure || 'failed'}${code ? ` [${code}]` : ''}`;
        const err = /SAFETY/.test(code) ? genError('content_policy', { provider: P, detail }) : code === 'ASSET.INVALID' ? genError('bad_input', { provider: P, detail }) : genError('provider_error', { provider: P, detail });
        return { status: 'failed', costUsd, error: err };
      }
    }
  },
  async cancel(ref) {
    try { await request(`${API()}/v1/tasks/${ref.id}`, { method: 'DELETE', headers: headers(needKey(this)) }, { provider: P, retries: 1, timeoutMs: 15000 }); return true; } catch { return false; }
  },
};
