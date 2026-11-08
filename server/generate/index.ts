// Generative footage: provider registry + the generation pipeline used by the generate_image /
// generate_video toolkit ops (server/generate/ops.ts) and the REST routes (server/generate/routes.ts).
//
//   resolve provider & model → snap aspect/duration/count to what the model supports → estimate cost →
//   budget.reserve (refuses over the daily limit) → submit (≤ 1 retry: it's paid) → poll (progress, queue
//   position; cancel → provider cancel) → download outputs into the op's staged media files → budget.commit.
import fs from 'node:fs';
import path from 'node:path';
import { getSettings } from '../config.ts';
import { cur, hasProject } from '../project.ts';
import { uerr } from '../i18n.ts';
import { slug } from '../util.ts';
import type { OpContext } from '../toolkit/registry.ts';
import type { GenKind, GenProviderInfo } from '../../shared/types.ts';
import type { Provider, ModelSpec, GenRequest, GenOutput, JobRef, PollResult } from './types.ts';
import { request, genError, sleep, EXT_BY_TYPE, MIME_BY_EXT, extFromUrl } from './http.ts';
import { keyInfo } from './keys.ts';
import * as budget from './budget.ts';
import { fal } from './fal.ts';
import { runway } from './runway.ts';
import { replicate } from './replicate.ts';
import { openai } from './openai.ts';
import { google } from './google.ts';
import { comfy } from './comfy.ts';
import { higgsfield } from './higgsfield.ts';

export const PROVIDERS: Provider[] = [fal, runway, replicate, higgsfield, openai, google, comfy];
export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id);

export function providerInfo(p: Provider): GenProviderInfo {
  const k = p.needsKey ? keyInfo(p) : { key: '', source: undefined };
  let models: ModelSpec[] = [];
  try { models = p.models(); } catch {}
  return {
    id: p.id, title: p.title, needsKey: p.needsKey, hasKey: !p.needsKey || !!k.key, keySource: k.source, keyUrl: p.keyUrl, docs: p.docs, note: p.note,
    models: models.map(({ route, ...m }) => { void route; return m; }),
  };
}
export function listGenerators() {
  const s = getSettings();
  return {
    providers: PROVIDERS.map(providerInfo),
    unavailable: [{ id: 'openai-video', title: 'OpenAI Sora', note: 'Sora 2 / Videos API shut down 2026-09-24' }, { id: 'google-veo', title: 'Veo / Imagen in the Gemini API', note: 'shut down (Oct / Aug 2026) — use gemini-omni-1.2-flash / gemini-nano-banana-2.1, or Veo 3.1 via Runway / Replicate / fal' }],
    defaults: s.genDefaults || {},
    budget: budget.spendReport(),
    notes: 'Prices are estimates from the providers\' public pricing pages (late 2026) — the provider invoice is authoritative. generate_image / generate_video accept {dryRun:true} to get the estimate without spending.',
  };
}

/** provider for a request: explicit → settings default for the kind → first paid provider with a key → ComfyUI */
function resolveProvider(id: string | undefined, kind: GenKind): Provider {
  if (id && id !== 'auto') {
    const p = getProvider(id);
    if (!p) throw uerr('Unknown generator provider "{id}". Known: {list}', { id, list: PROVIDERS.map((x) => x.id).join(', ') });
    return p;
  }
  const d = getSettings().genDefaults?.[kind]?.provider;
  if (d && getProvider(d)) return getProvider(d)!;
  const withKey = PROVIDERS.find((p) => p.needsKey && keyInfo(p).key && p.models().some((m) => m.kind === kind));
  if (withKey) return withKey;
  throw uerr('No generator is set up: add a fal.ai (or other) API key in Settings → Generators, or pass provider:"comfy" for a local ComfyUI.');
}

function resolveModel(p: Provider, id: string | undefined, kind: GenKind, withImage: boolean): ModelSpec {
  const all = p.models();
  if (!id) {
    const d = getSettings().genDefaults?.[kind];
    const want = d?.provider === p.id && d?.model ? d.model : p.defaultModel(kind, withImage);
    id = want;
  }
  if (!id) throw uerr('{provider} has no {kind} model — pass model (see list_generators)', { provider: p.title, kind });
  const m = all.find((x) => x.id === id) || p.rawModel?.(id, kind);
  if (!m) throw uerr('Unknown {provider} model "{model}". {kind} models: {list}', { provider: p.title, model: id, kind, list: all.filter((x) => x.kind === kind).map((x) => x.id).join(', ') || '—' });
  if (m.kind !== kind) throw uerr('{model} makes {got}s, not {kind}s — use generate_{got}', { model: m.id, got: m.kind, kind });
  return m;
}

const RATIOS: Record<string, number> = { '21:9': 21 / 9, '16:9': 16 / 9, '3:2': 1.5, '4:3': 4 / 3, '5:4': 1.25, '1:1': 1, '4:5': 0.8, '3:4': 0.75, '2:3': 2 / 3, '9:16': 9 / 16, '9:21': 9 / 21 };
const ratioOf = (a: string) => { if (RATIOS[a]) return RATIOS[a]; const [w, h] = a.split(/[:x]/).map(Number); return w && h ? w / h : 16 / 9; };
const nearest = <T>(list: T[], f: (x: T) => number) => list.reduce((b, x) => (f(x) < f(b) ? x : b), list[0]);
/** default w×h for an aspect (≈1 MP, multiples of 64) */
export function sizeFor(aspect: string, mp = 1.05e6) { const r = ratioOf(aspect); const h = Math.sqrt(mp / r); return { width: Math.round((h * r) / 64) * 64, height: Math.round(h / 64) * 64 }; }

export interface GenParams {
  provider?: string; model?: string; prompt: string; negative?: string; image?: string; endImage?: string;
  aspect?: string; width?: number; height?: number; duration?: number; resolution?: string; seed?: number;
  count?: number; camera?: string; audio?: boolean; name?: string; extra?: string; dryRun?: boolean; conform?: boolean;
}

/** a prepared request + its estimate (no side effects); used by dry runs and the real run */
export function prepare(kind: GenKind, p: GenParams, dir: string) {
  const provider = resolveProvider(p.provider, kind);
  const model = resolveModel(provider, p.model, kind, !!p.image);
  const notes: string[] = [];
  if (!p.prompt?.trim() && !(p.image && model.image)) throw uerr('prompt is required');
  if (p.image && !model.image) throw uerr('{model} does not take an input image — pick an image-to-{kind} model (list_generators) or drop image', { model: model.id, kind });
  if (!p.image && !model.text) throw uerr('{model} needs an input image (image=media/…): it is an image-to-{kind} model', { model: model.id, kind });
  if (p.endImage && !model.endImage) throw uerr('{model} does not support an end frame (endImage) — see list_generators for first/last-frame models', { model: model.id });
  if (p.endImage && !p.image) throw uerr('endImage needs image (the first frame) too');
  // aspect
  let aspect = p.aspect && p.aspect !== 'project' ? p.aspect : '';
  if (!aspect) {
    const pr = hasProject() ? cur().project : null;
    const r = pr ? pr.width / pr.height : 16 / 9;
    const cands = model.aspects?.length ? model.aspects.filter((a) => RATIOS[a] || /^\d+:\d+$/.test(a)) : ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
    aspect = nearest(cands.length ? cands : ['16:9'], (a) => Math.abs(Math.log(ratioOf(a) / r)));
  } else if (model.aspects?.length && !model.aspects.includes(aspect)) {
    throw uerr('{model} supports aspect {list} (got {aspect})', { model: model.id, list: model.aspects.join(' | '), aspect });
  }
  // duration
  let duration = kind === 'video' ? p.duration || model.durations?.[0] || 5 : undefined;
  if (kind === 'video' && model.durations?.length && !model.durations.includes(duration!)) {
    const d = nearest(model.durations, (x) => Math.abs(x - duration!));
    notes.push(`duration ${duration}s → ${d}s (${model.id} allows ${model.durations.join('/')} s)`);
    duration = d;
  }
  if (p.resolution && model.resolutions?.length && !model.resolutions.includes(p.resolution)) throw uerr('{model} supports resolution {list} (got {res})', { model: model.id, list: model.resolutions.join(' | '), res: p.resolution });
  const count = Math.max(1, Math.min(4, Math.round(p.count || 1)));
  if (kind === 'video' && count > 1) throw uerr('generate_video makes one shot per call (count 1) — call it again with another seed for more takes');
  let { width, height } = p;
  if (kind === 'image' && (!width || !height)) ({ width, height } = sizeFor(aspect));
  let extra: Record<string, unknown> | undefined;
  if (p.extra) { try { extra = JSON.parse(p.extra); } catch { throw uerr('extra must be a JSON object of provider-specific fields, e.g. {"cfg_scale":0.5}'); } if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw uerr('extra must be a JSON object of provider-specific fields, e.g. {"cfg_scale":0.5}'); }
  let seed = p.seed;
  if (seed == null && model.seed !== false && model.seed) seed = Math.floor(Math.random() * 2 ** 31); // recorded → reproducible
  const audio = !!(p.audio && model.audio);
  if (p.audio && !model.audio) notes.push(`${model.id} has no native audio — generated silent`);
  const img = (rel?: string) => rel ? { rel, abs: path.join(dir, rel), mime: MIME_BY_EXT[path.extname(rel).slice(1).toLowerCase()] || 'image/png' } : undefined;
  const req: GenRequest = {
    kind, model, prompt: (p.prompt || '').trim(), negative: p.negative || undefined, image: img(p.image), endImage: img(p.endImage),
    aspect, width, height, duration, resolution: p.resolution || undefined, seed, count, camera: p.camera || undefined, audio, extra,
  };
  const perCall = model.maxCount || 1;
  const calls = Math.ceil(count / perCall);
  const usd = budget.estimate(model.price, { kind, count, duration, resolution: req.resolution, width, height, audio });
  return { provider, model, req, calls, perCall, usd, notes };
}

async function download(p: Provider, o: GenOutput, signal: AbortSignal): Promise<{ data: Buffer; ext: string }> {
  if (o.data) return { data: o.data, ext: o.ext || (o.kind === 'video' ? 'mp4' : 'png') };
  if (p.download) { const r = await p.download(o, { signal }); return { data: r.data, ext: o.ext || EXT_BY_TYPE[(r.contentType || '').split(';')[0]] || extFromUrl(o.url!) || (o.kind === 'video' ? 'mp4' : 'png') }; }
  if (!o.url) throw genError('provider_error', { provider: p.title, detail: 'output without url' });
  if (o.url.startsWith('data:')) {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(o.url);
    if (!m) throw genError('provider_error', { provider: p.title, detail: 'bad data url' });
    return { data: Buffer.from(m[3], m[2] ? 'base64' : 'utf8'), ext: o.ext || EXT_BY_TYPE[m[1]] || 'png' };
  }
  const r = await request(o.url, { headers: o.headers }, { provider: p.title, retries: 4, timeoutMs: 10 * 60_000, signal });
  const data = Buffer.from(await r.arrayBuffer());
  return { data, ext: o.ext || extFromUrl(o.url) || EXT_BY_TYPE[(r.headers.get('content-type') || '').split(';')[0]] || (o.kind === 'video' ? 'mp4' : 'png') };
}

/** run one provider job to completion: submit → poll → outputs. Cancels at the provider on abort. */
async function runJob(provider: Provider, req: GenRequest, ctx: OpContext, onState: (s: PollResult) => void): Promise<{ ref: JobRef; res: PollResult; wasRunning: boolean }> {
  const ref = await provider.submit(req, { signal: ctx.signal });
  let wasRunning = false;
  const every = (provider.pollEvery || 3) * 1000;
  try {
    for (let i = 0; ; i++) {
      const res = await provider.poll(ref, { signal: ctx.signal });
      if (res.status === 'running') wasRunning = true;
      if (res.status === 'done' || res.status === 'failed' || res.status === 'cancelled') return { ref, res, wasRunning };
      onState(res);
      await sleep(Math.min(every * (1 + Math.floor(i / 20)), 10_000), ctx.signal);
    }
  } catch (e) {
    if (ctx.signal.aborted) { const ok = await provider.cancel(ref).catch(() => false); throw Object.assign(ctx.signal.reason instanceof Error ? ctx.signal.reason : new Error('cancelled'), { providerCancelled: ok, wasRunning, ref }); }
    throw Object.assign(e as Error, { ref, wasRunning });
  }
}

/** the generate_image / generate_video op body */
export async function generate(ctx: OpContext, kind: GenKind, p: GenParams): Promise<Record<string, string | object>> {
  const prep = prepare(kind, p, ctx.dir);
  const { provider, model, req, usd, notes } = prep;
  const label = `${provider.id}:${model.id}`;
  const estimate = { usd, estimated: true, price: model.price, calls: prep.calls };
  if (p.dryRun) {
    const b = budget.spendReport();
    return { cost: { ...estimate, dryRun: true, budgetUsd: b.budgetUsd, spentTodayUsd: b.spentUsd, remainingUsd: b.remainingUsd }, generation: { provider: provider.id, model: model.id, aspect: req.aspect, duration: req.duration, resolution: req.resolution, seed: req.seed, notes } };
  }
  if (provider.needsKey && !keyInfo(provider).key) throw genError('no_key', { provider: provider.title, url: provider.keyUrl || '' }, 400);
  const rid = ctx.jobId;
  budget.reserve(rid, usd, `${label}${req.duration ? ` ${req.duration}s` : ''}`);
  const base = slug(p.name || 'gen-' + (req.prompt || path.basename(p.image || 'image')).split(/\s+/).slice(0, 6).join(' '));
  const files: string[] = [];
  const requestIds: string[] = [];
  let charged = 0, reportedCost = false;
  const seeds: number[] = [];
  try {
    for (let c = 0; c < prep.calls; c++) {
      const n = Math.min(prep.perCall, req.count - c * prep.perCall);
      const sub: GenRequest = { ...req, count: n, seed: req.seed != null ? req.seed + c : undefined };
      const callUsd = usd / prep.calls;
      ctx.progress(0.02 + (c / prep.calls) * 0.9, `submitting to ${provider.title}`);
      let job: Awaited<ReturnType<typeof runJob>>;
      try {
        job = await runJob(provider, sub, ctx, (s) => {
          const frac = s.progress != null ? s.progress : s.status === 'running' ? 0.5 : 0.05;
          ctx.progress(0.05 + ((c + frac * 0.85) / prep.calls) * 0.9, s.status === 'queued' ? `queued at ${provider.title}${s.position != null ? ` (position ${s.position})` : ''}` : `generating with ${model.id}`);
        });
      } catch (e: any) {
        // cancelled after the provider started (or couldn't confirm the cancel): count it — it may be billed
        if (ctx.signal.aborted && e?.ref && (e.wasRunning || !e.providerCancelled) && usd > 0) {
          budget.commit(rid, { provider: provider.id, model: model.id, kind, usd: charged + callUsd, estimate: true, status: 'cancelled', project: hasProject() ? cur().id : undefined, job: ctx.jobId, requestId: e.ref.id });
          charged = -1;
        }
        throw e;
      }
      const { ref, res } = job;
      requestIds.push(ref.id);
      if (res.status !== 'done') throw res.error || genError('provider_error', { provider: provider.title, detail: res.status });
      if (res.costUsd != null) reportedCost = true;
      charged += res.costUsd ?? callUsd;
      if (res.seed != null) seeds.push(res.seed); else if (sub.seed != null) seeds.push(sub.seed);
      ctx.progress(0.05 + ((c + 0.9) / prep.calls) * 0.9, 'downloading');
      const outs = (res.outputs || []).filter((o) => o.kind === kind);
      if (!outs.length) throw genError('provider_error', { provider: provider.title, detail: `finished without ${kind} output` });
      for (const o of outs.slice(0, n)) {
        const { data, ext } = await download(provider, o, ctx.signal);
        const rel = ctx.outAs(base, ext);
        fs.writeFileSync(ctx.abs(rel), data);
        files.push(rel);
        if (o.seed != null && !seeds.includes(o.seed)) seeds.push(o.seed);
      }
    }
  } catch (e) {
    if (charged > 0) budget.commit(rid, { provider: provider.id, model: model.id, kind, usd: charged, estimate: !reportedCost, status: 'failed', project: hasProject() ? cur().id : undefined, job: ctx.jobId, requestId: requestIds.join(',') });
    else budget.release(rid);
    throw e;
  }
  budget.commit(rid, { provider: provider.id, model: model.id, kind, usd: charged, estimate: !reportedCost, status: 'done', project: hasProject() ? cur().id : undefined, job: ctx.jobId, requestId: requestIds.join(',') });

  // video: conform to the project fps (keeps a straight cut grid on the timeline)
  let info: { fps?: number; width?: number; height?: number; duration?: number; sourceFps?: number } = {};
  if (kind === 'video') info = await conformVideo(ctx, files, p.conform !== false, notes);
  const cost = { usd: +charged.toFixed(4), estimated: !reportedCost, price: model.price };
  const generation = { provider: provider.id, model: model.id, prompt: req.prompt, negative: req.negative, seed: seeds.length ? seeds[0] : req.seed, seeds, aspect: req.aspect, width: req.width, height: req.height, duration: req.duration, resolution: req.resolution, camera: req.camera, image: p.image, endImage: p.endImage, extra: req.extra, requestIds, cost, notes, ...info };
  ctx.provenance({ generated: generation });
  return kind === 'image'
    ? { image: files[0], images: files, cost, generation }
    : { video: files[0], cost, generation };
}

async function conformVideo(ctx: OpContext, files: string[], conform: boolean, notes: string[]) {
  const { probe, ffmpeg, MP4, MP4_AUDIO } = await import('../toolkit/ff.ts');
  let rel = files[0];
  const abs = ctx.abs(rel);
  let pr;
  try { pr = await probe(abs); } catch (e: any) { throw uerr('The generated video cannot be read: {error}', { error: e.message }); }
  const fps = hasProject() ? cur().project.fps : 0;
  const out = { fps: pr.fps, width: pr.width, height: pr.height, duration: +pr.duration.toFixed(3), sourceFps: pr.fps };
  const isMp4 = /\.mp4$/i.test(rel);
  const needFps = conform && !!fps && Math.abs(pr.fps - fps) >= 0.01;
  if (!needFps && (isMp4 || !conform)) return out;
  // re-encode: to the project fps and/or from WebM/MOV/GIF (ComfyUI) to H.264 MP4
  const target = isMp4 ? rel : ctx.outAs(path.basename(rel).replace(/\.[^.]+$/, ''), 'mp4');
  const tmp = path.join(ctx.tmp(), 'conform.mp4');
  try {
    await ffmpeg(ctx, ['-i', abs, ...(needFps ? ['-vf', `fps=${fps}`] : []), ...MP4, ...(pr.hasAudio ? MP4_AUDIO : ['-an']), tmp], { duration: pr.duration, range: [0.95, 0.99], stage: needFps ? `conforming ${pr.fps.toFixed(2)} → ${fps} fps` : 'converting to mp4' });
    fs.renameSync(tmp, ctx.abs(target));
    if (target !== rel) { fs.rmSync(abs, { force: true }); files[0] = rel = target; }
    if (needFps) notes.push(`conformed ${pr.fps.toFixed(3)} → ${fps} fps`); else notes.push('converted to mp4');
    return needFps ? { ...out, fps } : out;
  } catch (e: any) {
    if (ctx.signal.aborted) throw e;
    notes.push(`re-encode failed (${e.message}); kept the original ${pr.fps.toFixed(3)} fps file`);
    return out;
  }
}

export { budget };
