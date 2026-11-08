// Google Gemini API — Nano Banana images and Gemini Omni Flash video through the Interactions API.
//
// Verified 2026-11-08 (ai.google.dev/gemini-api/docs/* now redirects to aistudio.google.com/docs/*):
//   https://aistudio.google.com/docs/deprecations      all Veo models (Oct 22 2026) and Imagen 4 (Aug 17 2026) are shut down in
//                                                       the Gemini API → replacements gemini-omni-1.2-flash / gemini-nano-banana-2.1
//   https://aistudio.google.com/docs/omni               POST /v1beta/interactions {model, input, response_format:{type:'video',
//                                                       aspect_ratio 16:9|9:16, resolution 360p|720p|1080p|4k, duration '3s'…'15s'}}
//   https://aistudio.google.com/docs/image-generation   same endpoint, header Api-Revision: 2026-05-20, response_format
//                                                       {type:'image', aspect_ratio, image_size 1K|2K|4K}
//   output: steps[type=model_output].content[type=image|video].data (base64) or .uri (delivery:'uri' → files/{id}:download)
//   https://aistudio.google.com/docs/pricing            nano-banana-2.1 1K $0.0336 / 2K $0.0504 / 4K $0.113; omni 720p ≈ $0.07/s
// The call is synchronous (the video arrives in the response) — submit performs it, poll returns the stored result.
import fs from 'node:fs';
import { request, genError, detailOf } from './http.ts';
import { needKey, base } from './keys.ts';
import type { Provider, ModelSpec, JobRef, PollResult, GenOutput } from './types.ts';

const P = 'Google Gemini';
const API = () => base('STUDIO_GOOGLE_BASE', 'https://generativelanguage.googleapis.com');
const PRICING = 'https://aistudio.google.com/docs/pricing';
const IMG_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];

const MODELS: ModelSpec[] = [
  {
    id: 'gemini-nano-banana-2.1', provider: 'google', kind: 'image', title: 'Nano Banana 2.1', text: true, image: true, seed: false, maxCount: 1,
    aspects: IMG_ASPECTS, resolutions: ['1K', '2K', '4K'],
    price: { unit: 'image', usd: 0.0336, by: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 }, source: PRICING },
    notes: 'great at editing a reference image (keep subject, change scene), up to 14 references via extra; resolution = image_size',
  },
  {
    id: 'gemini-3-pro-image', provider: 'google', kind: 'image', title: 'Gemini 3 Pro Image', text: true, image: true, seed: false, maxCount: 1,
    aspects: IMG_ASPECTS, resolutions: ['1K', '2K', '4K'],
    price: { unit: 'image', usd: 0.134, by: { '1K': 0.134, '2K': 0.134, '4K': 0.24 }, source: PRICING }, notes: 'premium quality, complex scenes and text',
  },
  {
    id: 'gemini-omni-1.2-flash', provider: 'google', kind: 'video', title: 'Gemini Omni 1.2 Flash (video)', text: true, image: true, seed: false, audio: true,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], aspects: ['16:9', '9:16'], resolutions: ['360p', '720p', '1080p', '4k'],
    price: { unit: 'second', usd: 0.07, by: { '360p': 0.023, '720p': 0.07, '1080p': 0.104, '4k': 0.209 }, note: 'token-billed video output; audio included', source: PRICING },
    notes: 'successor of Veo in the Gemini API; generates audio by default (steer it in the prompt); 1080p/4k are upscaled',
  },
];

const done = new Map<string, PollResult>();
const b64 = (abs: string) => fs.readFileSync(abs).toString('base64');

function outputsOf(j: any, kind: 'image' | 'video', key: string): GenOutput[] {
  const outs: GenOutput[] = [];
  for (const st of j?.steps || []) {
    if (st?.type !== 'model_output') continue;
    for (const c of st.content || []) {
      if (c?.type !== kind) continue;
      const ext = (c.mime_type || '').split('/')[1]?.replace('jpeg', 'jpg') || (kind === 'video' ? 'mp4' : 'png');
      if (c.data) outs.push({ kind, ext, data: Buffer.from(c.data, 'base64') });
      else if (c.uri) {
        const m = /files\/([\w-]+)/.exec(c.uri);
        outs.push({ kind, ext, url: m ? `${API()}/v1beta/files/${m[1]}:download?alt=media` : c.uri, headers: { 'x-goog-api-key': key } });
      }
    }
  }
  return outs;
}
const textOf = (j: any) => (j?.steps || []).flatMap((s: any) => (s.type === 'model_output' ? s.content || [] : [])).filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ').trim();

export const google: Provider = {
  id: 'google',
  title: P,
  needsKey: true,
  keyField: 'googleKey',
  envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  keyUrl: 'https://aistudio.google.com/apikey',
  docs: 'https://aistudio.google.com/docs/omni',
  note: 'Gemini API: Nano Banana images and Gemini Omni Flash video (Veo and Imagen are shut down in the Gemini API since Oct/Aug 2026). No seeds, no negative prompts (added to the prompt as "Avoid: …").',
  async checkKey(key) {
    try {
      const r = await request(API() + '/v1beta/models?pageSize=50', { headers: { 'x-goog-api-key': needKey(this, key) } }, { provider: P, retries: 1, timeoutMs: 15000 });
      const j: any = await r.json();
      const ids = (j.models || []).map((m: any) => String(m.name || '').replace(/^models\//, '')).filter((n: string) => /omni|banana|image/.test(n));
      return { ok: true, detail: ids.length ? `key ok · ${ids.slice(0, 4).join(', ')}` : 'key ok' };
    } catch (e: any) { return { ok: false, detail: e.message }; }
  },
  models: () => MODELS,
  defaultModel: (kind) => (kind === 'image' ? 'gemini-nano-banana-2.1' : 'gemini-omni-1.2-flash'),
  rawModel(id, kind) { const t = MODELS.find((m) => m.kind === kind); return t && /^gemini-/.test(id) ? { ...t, id, title: id } : undefined; },
  async submit(req, ctx): Promise<JobRef> {
    const key = needKey(this);
    const text = req.prompt + (req.camera ? ` Camera: ${req.camera}.` : '') + (req.negative ? ` Avoid: ${req.negative}.` : '');
    const input: any[] = [];
    for (const i of [req.image, req.endImage]) if (i) input.push({ type: 'image', mime_type: i.mime, data: b64(i.abs) });
    input.push({ type: 'text', text });
    const response_format = req.kind === 'image'
      ? { type: 'image', mime_type: 'image/png', aspect_ratio: req.aspect, ...(req.resolution ? { image_size: req.resolution } : {}) }
      : { type: 'video', aspect_ratio: req.aspect, resolution: req.resolution || '720p', duration: `${Math.round(req.duration || 8)}s` };
    const body = { model: req.model.id, input, response_format, ...(req.extra || {}) };
    const r = await request(API() + '/v1beta/interactions', {
      method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json', 'api-revision': '2026-05-20' }, body: JSON.stringify(body),
    }, { provider: P, retries: 1, timeoutMs: (req.kind === 'video' ? 15 : 4) * 60_000, signal: ctx.signal, model: req.model.id });
    const j: any = await r.json();
    const outs = outputsOf(j, req.kind, key);
    const id = j.id || 'g-' + Date.now().toString(36);
    if (!outs.length) {
      const why = textOf(j) || j.status || detailOf(j, 'no output');
      const blocked = /safety|blocked|prohibit|policy|cannot|can't|unable/i.test(why);
      done.set(id, { status: 'failed', error: genError(blocked ? 'content_policy' : 'provider_error', { provider: P, detail: String(why).slice(0, 300) }) });
    } else done.set(id, { status: 'done', outputs: outs });
    return { provider: 'google', id };
  },
  async poll(ref) { const r = done.get(ref.id); done.delete(ref.id); return r || { status: 'failed', error: genError('provider_error', { provider: P, detail: 'result lost' }) }; },
  async cancel() { return false; },
};
