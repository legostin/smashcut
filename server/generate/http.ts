// HTTP for provider adapters: per-request timeout, cancellation, bounded retries with backoff on
// 429 / 5xx / network errors (Retry-After honoured), and errors classified into clear, translatable
// messages (bad key, no credits, content policy, model unavailable, invalid input, rate limit).
import { uerr } from '../i18n.ts';

export type GenErrorCode = 'no_key' | 'bad_key' | 'no_credits' | 'content_policy' | 'model_unavailable' | 'bad_input' | 'rate_limited' | 'timeout' | 'provider_error' | 'cancelled';

const MESSAGES: Record<GenErrorCode, string> = {
  no_key: '{provider}: no API key. Add it in Settings → Generators (get one at {url}).',
  bad_key: '{provider}: the API key was rejected ({detail}). Check it in Settings → Generators.',
  no_credits: '{provider}: not enough credits or balance ({detail}). Top up your account with the provider.',
  content_policy: '{provider}: blocked by the content policy ({detail}). Rephrase the prompt or use another reference image.',
  model_unavailable: '{provider}: model not available ({detail}).',
  bad_input: '{provider}: invalid input ({detail}).',
  rate_limited: '{provider}: rate limited ({detail}). Try again in a minute.',
  timeout: '{provider}: no answer within {s} s.',
  provider_error: '{provider}: {detail}',
  cancelled: 'cancelled',
};

export function genError(code: GenErrorCode, params: Record<string, string | number>, status = 502): Error {
  const statusCode = code === 'no_key' || code === 'bad_key' || code === 'bad_input' || code === 'content_policy' ? 400 : code === 'no_credits' ? 402 : code === 'rate_limited' ? 429 : status;
  return Object.assign(uerr(MESSAGES[code], { detail: '', url: '', ...params }, statusCode), { code });
}

const POLICY = /content[ _-]?polic|safety|moderat|nsfw|flagged|sensitive|blocked|prohibited|not allowed|inappropriate|rai_?media|responsible ai/i;
const CREDIT = /balance|credit|insufficient|quota|billing|payment|exhausted|top.?up|funds|limit reached|locked|spend(ing)?[ _]limit|usage[ _]limit/i;
const MODEL = /model.*(not found|not available|unavailable|deprecated|does not exist|disabled)|no such model|unknown model|application.*not found/i;

/** short human detail from an error body (JSON or text) */
export function detailOf(body: unknown, fallback: string): string {
  if (!body) return fallback;
  if (typeof body === 'string') return body.replace(/\s+/g, ' ').trim().slice(0, 300) || fallback;
  const b: any = body;
  const pick = (v: any): string | undefined => {
    if (!v) return undefined;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map((x) => pick(x?.msg ?? x?.message ?? x)).filter(Boolean).join('; ');
    if (typeof v === 'object') return pick(v.message ?? v.msg ?? v.detail ?? v.error ?? v.title) ?? JSON.stringify(v);
    return String(v);
  };
  return (pick(b.error?.message ?? b.error ?? b.detail ?? b.message ?? b.failure ?? b.title ?? b) || fallback).slice(0, 300);
}

/** map an HTTP failure to a GenError */
export function classify(provider: string, status: number, body: unknown, model?: string): Error {
  const detail = detailOf(body, `HTTP ${status}`);
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  if (status === 402 || (CREDIT.test(text) && [400, 403, 429].includes(status) && !/rate/i.test(detail))) return genError('no_credits', { provider, detail });
  if (status === 401 || status === 403) return genError('bad_key', { provider, detail });
  if (POLICY.test(text) && status >= 400 && status < 500) return genError('content_policy', { provider, detail });
  if (status === 404 || MODEL.test(text)) return genError('model_unavailable', { provider, detail: model ? `${model}: ${detail}` : detail });
  if (status === 429) return genError('rate_limited', { provider, detail });
  if (status >= 400 && status < 500) return genError('bad_input', { provider, detail });
  return genError('provider_error', { provider, detail: `HTTP ${status}: ${detail}` });
}

export interface ReqOpts {
  provider: string;
  /** retries after the first attempt for 429 / 5xx / network errors (paid submits: ≤ 1) */
  retries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  model?: string;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  if (signal?.aborted) return rej(signal.reason);
  const t = setTimeout(() => { signal?.removeEventListener('abort', ab); res(); }, ms);
  const ab = () => { clearTimeout(t); rej(signal!.reason); };
  signal?.addEventListener('abort', ab, { once: true });
});
export { sleep };

/** fetch with timeout + retries; returns an ok Response or throws a classified error */
export async function request(url: string, init: RequestInit, o: ReqOpts): Promise<Response> {
  const retries = o.retries ?? 3;
  const timeoutMs = o.timeoutMs ?? 60_000;
  for (let attempt = 0; ; attempt++) {
    if (o.signal?.aborted) throw o.signal.reason;
    const ac = new AbortController();
    const onAbort = () => ac.abort(o.signal!.reason);
    o.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ac.abort(genError('timeout', { provider: o.provider, s: Math.round(timeoutMs / 1000) }, 504)), timeoutMs);
    let res: Response | undefined;
    let netErr: any;
    try { res = await fetch(url, { ...init, signal: ac.signal }); } catch (e) { netErr = ac.signal.aborted ? ac.signal.reason : e; }
    finally { clearTimeout(timer); o.signal?.removeEventListener('abort', onAbort); }
    if (o.signal?.aborted) throw o.signal.reason;
    if (res?.ok) return res;
    let body: unknown = null;
    if (res) { const t = await res.text().catch(() => ''); try { body = JSON.parse(t); } catch { body = t; } }
    const quota = res?.status === 429 && CREDIT.test(JSON.stringify(body ?? '')) && !/rate/i.test(detailOf(body, ''));
    const transient = !res || res.status === 429 && !quota || res.status >= 500 || res.status === 408;
    if (!transient || attempt >= retries) {
      if (!res) throw (netErr as any)?.code ? netErr : genError('provider_error', { provider: o.provider, detail: String(netErr?.cause?.message || netErr?.message || netErr) });
      throw classify(o.provider, res.status, body, o.model);
    }
    const ra = Number(res?.headers.get('retry-after'));
    const wait = Number.isFinite(ra) && ra > 0 ? Math.min(30_000, ra * 1000) : Math.min(20_000, 1000 * 2 ** attempt + Math.random() * 400);
    await sleep(wait, o.signal);
  }
}

export async function json<T = any>(url: string, init: RequestInit, o: ReqOpts): Promise<T> {
  const r = await request(url, init, o);
  const t = await r.text();
  try { return JSON.parse(t) as T; } catch { throw genError('provider_error', { provider: o.provider, detail: 'unexpected response: ' + t.slice(0, 200) }); }
}

export const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'image/avif': 'avif' };
export const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
export function extFromUrl(u: string): string | undefined {
  try { const m = /\.([a-z0-9]{2,4})$/i.exec(new URL(u).pathname); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : undefined; } catch { return undefined; }
}
