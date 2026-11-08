// OpenAI Images (gpt-image-2.x). Synchronous: submit performs the call, poll returns the stored result.
//
// Verified 2026-11-08:
//   https://developers.openai.com/api/reference/resources/images/methods/generate   POST /v1/images/generations
//   https://developers.openai.com/api/reference/resources/images/methods/edit       POST /v1/images/edits (JSON images[{image_url}])
//   https://developers.openai.com/api/docs/deprecations   gpt-image-1 shut down 2026-10-23; 1.5 / 1-mini on 2026-12-01;
//                                                          Sora 2 + Videos API shut down 2026-09-24 (no OpenAI video provider)
//   https://developers.openai.com/api/docs/pricing         2.5/2.6: image output $30 / 1M tokens, image input $8, text input $5
// Response: data[].b64_json + usage (tokens) → the exact cost is computed from usage.
import fs from 'node:fs';
import { request, genError } from './http.ts';
import { needKey, keyInfo, base } from './keys.ts';
import type { Provider, ModelSpec, JobRef, PollResult, GenRequest } from './types.ts';

const P = 'OpenAI';
const API = () => base('STUDIO_OPENAI_BASE', 'https://api.openai.com');
const PRICING = 'https://developers.openai.com/api/docs/pricing';
const QUAL = ['low', 'medium', 'high'];
const ASPECTS = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9'];

const tokenModel = (id: string, title: string, notes: string): ModelSpec => ({
  id, provider: 'openai', kind: 'image', title, text: true, image: true, negative: false, seed: false, maxCount: 4, aspects: ASPECTS, resolutions: QUAL,
  // estimate from ~272 / 1056 / 4160 output tokens per 1 MP image at $30 / 1M (+ input) — exact cost comes from usage
  price: { unit: 'image', usd: 0.04, by: { low: 0.01, medium: 0.04, high: 0.13 }, note: 'token-billed ($30/1M image output tokens); resolution = quality low|medium|high; exact cost from usage', source: PRICING },
  notes, route: { tokens: { out: 30, imgIn: 8, textIn: 5 } },
});
const MODELS: ModelSpec[] = [
  tokenModel('gpt-image-2.6-flare', 'GPT Image 2.6 Flare', 'fast everyday generation; strong text rendering; edits with a reference image'),
  tokenModel('gpt-image-2.6-sunburst', 'GPT Image 2.6 Sunburst', 'precise editing (reference image → edit), best instruction following'),
  {
    id: 'gpt-image-2', provider: 'openai', kind: 'image', title: 'GPT Image 2', text: true, image: true, seed: false, maxCount: 4, aspects: ASPECTS, resolutions: QUAL,
    price: { unit: 'image', usd: 0.053, by: { low: 0.006, medium: 0.053, high: 0.211 }, note: 'per 1024² image by quality', source: 'https://developers.openai.com/api/docs/guides/image-generation' },
  },
];

const done = new Map<string, PollResult>();
const r16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
function sizeOf(req: GenRequest): string {
  const std: Record<string, string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };
  if (!req.width || !req.height) return std[req.aspect] || 'auto';
  let w = r16(req.width), h = r16(req.height);
  const s = Math.min(1, 3840 / Math.max(w, h), 2160 / Math.min(w, h));
  w = r16(w * s); h = r16(h * s);
  return `${w}x${h}`;
}
const dataUrl = (abs: string, mime: string) => `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;

export const openai: Provider = {
  id: 'openai',
  title: P,
  needsKey: true,
  keyField: 'openaiKey',
  envKeys: ['OPENAI_API_KEY'],
  keyUrl: 'https://platform.openai.com/api-keys',
  docs: 'https://developers.openai.com/api/docs/guides/image-generation',
  note: 'Images only (gpt-image-2.x) — OpenAI shut down the Sora 2 / Videos API on 2026-09-24. Best for stills with legible text and precise edits of a reference image.',
  async checkKey(key) {
    try {
      const r = await request(API() + '/v1/models', { headers: { authorization: 'Bearer ' + needKey(this, key) } }, { provider: P, retries: 1, timeoutMs: 15000 });
      const j: any = await r.json();
      const img = (j.data || []).filter((m: any) => /^gpt-image/.test(m.id)).map((m: any) => m.id);
      return { ok: true, detail: img.length ? `key ok · ${img.slice(0, 4).join(', ')}` : 'key ok' };
    } catch (e: any) { return { ok: false, detail: e.message }; }
  },
  models: () => MODELS,
  defaultModel: (kind) => (kind === 'image' ? 'gpt-image-2.6-flare' : undefined),
  rawModel(id, kind) { return kind === 'image' && /^gpt-image|^chatgpt-image/.test(id) ? { ...MODELS[0], id, title: id } : undefined; },
  async submit(req, ctx): Promise<JobRef> {
    const key = needKey(this);
    const quality = req.resolution && QUAL.includes(req.resolution) ? req.resolution : 'medium';
    const prompt = req.prompt + (req.negative ? `\nAvoid: ${req.negative}` : '');
    const body: any = { model: req.model.id, prompt, n: req.count, size: sizeOf(req), quality, ...(req.extra || {}) };
    let url = API() + '/v1/images/generations';
    if (req.image) {
      url = API() + '/v1/images/edits';
      body.images = [req.image, req.endImage].filter(Boolean).map((i) => ({ image_url: dataUrl(i!.abs, i!.mime) }));
    }
    // paid: at most one retry (only for 429 rate-limit / 5xx before the image is made)
    const r = await request(url, { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) }, { provider: P, retries: 1, timeoutMs: 6 * 60_000, signal: ctx.signal, model: req.model.id });
    const j: any = await r.json();
    const imgs = (j.data || []).filter((d: any) => d.b64_json);
    if (!imgs.length) throw genError('provider_error', { provider: P, detail: 'no image in the response' });
    const t = req.model.route?.tokens;
    let costUsd: number | undefined;
    if (t && j.usage) {
      const it = j.usage.input_tokens_details || {};
      const imgIn = it.image_tokens ?? 0, textIn = it.text_tokens ?? Math.max(0, (j.usage.input_tokens || 0) - imgIn);
      costUsd = ((j.usage.output_tokens || 0) * t.out + imgIn * t.imgIn + textIn * t.textIn) / 1e6;
    }
    const ext = body.output_format === 'jpeg' ? 'jpg' : body.output_format || 'png';
    const id = 'oai-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    done.set(id, { status: 'done', costUsd, outputs: imgs.map((d: any) => ({ kind: 'image', data: Buffer.from(d.b64_json, 'base64'), ext })) });
    return { provider: 'openai', id };
  },
  async poll(ref) { const r = done.get(ref.id); done.delete(ref.id); return r || { status: 'failed', error: genError('provider_error', { provider: P, detail: 'result lost' }) }; },
  async cancel() { return false; },
};
void keyInfo;
