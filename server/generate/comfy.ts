// ComfyUI (local, free, no key) — runs the user's own API-format workflows.
//
// Workflows: `${HOME_DIR}/comfy-workflows/*.json` (every project) and `<project>/workflows/*.json` (this project;
// wins on a name clash). The model id is the file name without .json. Parameters are injected into string
// values: a value that is exactly "{{seed}}" becomes the typed value (number for seed/width/height/steps/frames/
// fps/duration/count/cfg), "{{name|default}}" falls back to the default, and placeholders inside longer strings
// are interpolated. Known names: prompt, negative, seed, width, height, image, endImage, frames, fps, duration,
// count, steps, cfg — plus any key of `extra`. An optional top-level "_smashcut" object describes the workflow
// ({ kind, title, description, needs }) and is removed before the workflow is queued.
//
// API (verified against ComfyUI server.py): POST /prompt {prompt, client_id} → {prompt_id, number, node_errors};
// GET /history/{id} → {id: {outputs: {node: {images|gifs|videos: [{filename, subfolder, type}]}}, status}};
// GET /queue → {queue_running, queue_pending}; GET /view?filename&subfolder&type; POST /upload/image (multipart
// "image"); POST /queue {delete:[id]} and POST /interrupt to cancel; GET /system_stats for a health check.
import fs from 'node:fs';
import path from 'node:path';
import { HOME_DIR, getSettings } from '../config.ts';
import { cur, hasProject } from '../project.ts';
import { uerr } from '../i18n.ts';
import { nid } from '../util.ts';
import { request, json, genError, detailOf } from './http.ts';
import type { Provider, ModelSpec, GenRequest, JobRef, PollResult, GenOutput, GenKind } from './types.ts';
import { TEMPLATES } from './comfy-templates.ts';

export const COMFY_HOME = path.join(HOME_DIR, 'comfy-workflows');
const P = 'ComfyUI';
const url = () => (getSettings().comfyUrl || process.env.STUDIO_COMFY_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
const CLIENT = 'smashcut-' + nid();

/** write the example workflows into ~/.smashcut/comfy-workflows once (never overwrites the user's edits) */
export function seedTemplates() {
  fs.mkdirSync(COMFY_HOME, { recursive: true });
  for (const [name, wf] of Object.entries(TEMPLATES)) {
    const f = path.join(COMFY_HOME, name + '.json');
    if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(wf, null, 2));
  }
}

function workflowDirs(): string[] {
  const d = [COMFY_HOME];
  if (hasProject()) d.push(cur().p('workflows'));
  return d;
}

export function listWorkflows(): { name: string; file: string; wf: any }[] {
  const out = new Map<string, { name: string; file: string; wf: any }>();
  for (const dir of workflowDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try { out.set(f.slice(0, -5), { name: f.slice(0, -5), file: path.join(dir, f), wf: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }); } catch {}
    }
  }
  return [...out.values()];
}

const VIDEO_NODES = /SaveVideo|VHS_VideoCombine|SaveAnimatedWEBP|SaveWEBM|CreateVideo/;
function specOf(name: string, wf: any): ModelSpec {
  const meta = wf?._smashcut || {};
  const text = JSON.stringify(wf);
  const kind: GenKind = meta.kind === 'video' || meta.kind === 'image' ? meta.kind : VIDEO_NODES.test(text) ? 'video' : 'image';
  const has = (k: string) => new RegExp(`\\{\\{${k}(\\|[^}]*)?\\}\\}`).test(text);
  return {
    id: name, provider: 'comfy', kind, title: meta.title || name,
    text: true, image: has('image'), endImage: has('endImage'), negative: has('negative'), seed: has('seed'),
    maxCount: has('count') ? 4 : 1,
    price: { unit: 'free', usd: 0, note: 'runs on your machine' },
    notes: [meta.description, meta.needs?.length ? `needs: ${meta.needs.join(', ')}` : ''].filter(Boolean).join(' — ') || undefined,
  };
}

const NUMERIC = new Set(['seed', 'width', 'height', 'steps', 'frames', 'fps', 'duration', 'count', 'cfg']);
/** replace {{placeholders}} in a workflow (pure; exported for tests) */
export function injectWorkflow(wf: any, vars: Record<string, unknown>): any {
  const missing = new Set<string>();
  const val = (name: string, dflt?: string) => {
    const v = vars[name];
    if (v === undefined || v === null || v === '') {
      if (dflt !== undefined) return NUMERIC.has(name) && dflt !== '' && Number.isFinite(Number(dflt)) ? Number(dflt) : dflt;
      missing.add(name);
      return '';
    }
    return v;
  };
  const walk = (x: any): any => {
    if (typeof x === 'string') {
      const whole = /^\{\{(\w+)(?:\|([^}]*))?\}\}$/.exec(x);
      if (whole) {
        const v = val(whole[1], whole[2]);
        return NUMERIC.has(whole[1]) && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v;
      }
      return x.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_m, k, d) => String(val(k, d)));
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).filter(([k]) => k !== '_smashcut').map(([k, v]) => [k, walk(v)]));
    return x;
  };
  const out = walk(wf);
  // an image placeholder without an image is a hard error (the workflow can't run); text ones become ''
  for (const k of ['image', 'endImage']) if (missing.has(k)) throw uerr('Workflow needs an input image for {{{name}}}: pass {param}', { name: k, param: k === 'image' ? 'image=media/…' : 'endImage=media/…' });
  return out;
}

async function upload(img: { abs: string; mime: string }, signal: AbortSignal): Promise<string> {
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(img.abs)], { type: img.mime }), 'smashcut-' + path.basename(img.abs));
  fd.append('overwrite', 'true');
  fd.append('type', 'input');
  const j = await json<{ name: string; subfolder?: string }>(url() + '/upload/image', { method: 'POST', body: fd }, { provider: P, signal, retries: 2 });
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

function wfError(body: any): Error {
  const parts: string[] = [];
  if (body?.error?.message) parts.push(body.error.message + (body.error.details ? ': ' + body.error.details : ''));
  for (const [node, ne] of Object.entries<any>(body?.node_errors || {})) for (const e of ne.errors || []) parts.push(`node ${node} (${ne.class_type}): ${e.message}${e.details ? ' — ' + e.details : ''}`);
  const detail = (parts.join('; ') || detailOf(body, 'invalid workflow')).slice(0, 600);
  if (/not in list|not found|missing/i.test(detail)) return genError('model_unavailable', { provider: P, detail: detail + ' — install the model/custom node in ComfyUI or edit the workflow' });
  return genError('bad_input', { provider: P, detail });
}

export const comfy: Provider = {
  id: 'comfy',
  title: P,
  needsKey: false,
  docs: 'https://docs.comfy.org/development/comfyui-server/comms_routes',
  note: 'Local ComfyUI — free, runs your own API-format workflows from ~/.smashcut/comfy-workflows/ or the project workflows/ folder (Workflow → Export (API) in ComfyUI). Placeholders: {{prompt}}, {{negative}}, {{seed}}, {{width}}, {{height}}, {{image}}, {{endImage}}, {{frames}}, {{fps}}, {{name|default}}.',
  pollEvery: 1.5,
  async checkKey() {
    try {
      const j = await json<any>(url() + '/system_stats', {}, { provider: P, retries: 0, timeoutMs: 5000 });
      const dev = j?.devices?.[0];
      return { ok: true, detail: `ComfyUI ${j?.system?.comfyui_version || ''} at ${url()}${dev ? ` · ${dev.name}` : ''} · ${listWorkflows().length} workflow(s)`.replace(/\s+/g, ' ') };
    } catch (e: any) { return { ok: false, detail: `not reachable at ${url()} (${e.message}) — start ComfyUI or set its URL` }; }
  },
  models() { seedTemplates(); return listWorkflows().map((w) => specOf(w.name, w.wf)); },
  defaultModel(kind, withImage) {
    const ms = this.models().filter((m) => m.kind === kind && (!withImage || m.image));
    return (ms.find((m) => !m.id.startsWith('example-')) || ms[0])?.id;
  },
  async submit(req: GenRequest, ctx) {
    const w = listWorkflows().find((x) => x.name === req.model.id);
    if (!w) throw genError('model_unavailable', { provider: P, detail: `no workflow "${req.model.id}" in ${workflowDirs().join(' or ')}` });
    const meta = w.wf?._smashcut || {};
    let { width, height } = req;
    if (!width || !height) { // video: ~0.9 MP in the requested aspect, multiples of 32 (Wan wants /32)
      const [aw, ah] = req.aspect.split(':').map(Number); const r = aw && ah ? aw / ah : 16 / 9; const px = req.kind === 'video' ? 1280 * 704 : 1024 * 1024;
      height = Math.round(Math.sqrt(px / r) / 32) * 32; width = Math.round((height * r) / 32) * 32;
    }
    const vars: Record<string, unknown> = {
      prompt: req.prompt + (req.camera ? `, ${req.camera}` : ''), negative: req.negative ?? undefined, seed: req.seed, width, height,
      count: req.count, duration: req.duration, fps: (req.extra?.fps as number) ?? meta.fps ?? (hasProject() ? cur().project.fps : 24),
      ...(req.extra || {}),
    };
    // video models want 4n+1 frames (Wan, LTX, Hunyuan)
    if (vars.frames == null && req.duration) vars.frames = Math.round((Number(vars.fps) * req.duration) / 4) * 4 + 1;
    if (req.image) vars.image = await upload(req.image, ctx.signal);
    if (req.endImage) vars.endImage = await upload(req.endImage, ctx.signal);
    const prompt = injectWorkflow(w.wf, vars);
    const res = await fetch(url() + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, client_id: CLIENT }), signal: ctx.signal })
      .catch((e) => { throw genError('provider_error', { provider: P, detail: `not reachable at ${url()} (${e.cause?.message || e.message})` }); });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body.prompt_id) throw wfError(body);
    if (body.node_errors && Object.keys(body.node_errors).length) throw wfError(body);
    return { provider: 'comfy', id: body.prompt_id, data: { file: w.file } };
  },
  async poll(ref, ctx): Promise<PollResult> {
    const h = await json<any>(`${url()}/history/${encodeURIComponent(ref.id)}`, {}, { provider: P, signal: ctx.signal, retries: 3 });
    const e = h?.[ref.id];
    if (!e) {
      const q = await json<any>(url() + '/queue', {}, { provider: P, signal: ctx.signal, retries: 3 });
      if ((q.queue_running || []).some((x: any[]) => x[1] === ref.id)) return { status: 'running' };
      const pend = (q.queue_pending || []).map((x: any[]) => x[1]);
      const i = pend.indexOf(ref.id);
      if (i >= 0) return { status: 'queued', position: i + 1 };
      return { status: 'running' }; // between queue and history
    }
    if (e.status?.status_str === 'error') {
      const m = (e.status.messages || []).find((x: any[]) => x[0] === 'execution_error')?.[1];
      return { status: 'failed', error: genError('provider_error', { provider: P, detail: m ? `${m.node_type || 'node'}: ${m.exception_message || ''}`.trim() : 'execution error' }) };
    }
    if (e.status && e.status.completed === false && e.status.status_str !== 'success') return { status: 'running' };
    const outputs: GenOutput[] = [];
    for (const node of Object.values<any>(e.outputs || {})) {
      for (const key of ['images', 'gifs', 'videos', 'video', 'animated']) {
        const list = Array.isArray(node?.[key]) ? node[key] : [];
        for (const f of list) {
          if (!f?.filename || f.type === 'temp') continue;
          const ext = path.extname(f.filename).slice(1).toLowerCase();
          const kind: GenKind = /^(mp4|webm|mov|gif|mkv)$/.test(ext) || key !== 'images' && ext !== 'png' ? 'video' : 'image';
          outputs.push({ kind, ext, url: `${url()}/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || '')}&type=${encodeURIComponent(f.type || 'output')}` });
        }
      }
    }
    if (!outputs.length) return { status: 'failed', error: genError('provider_error', { provider: P, detail: 'the workflow finished without saved outputs (add a SaveImage / SaveVideo node)' }) };
    return { status: 'done', outputs };
  },
  async cancel(ref) {
    try {
      const q = await json<any>(url() + '/queue', {}, { provider: P, retries: 0, timeoutMs: 5000 });
      if ((q.queue_pending || []).some((x: any[]) => x[1] === ref.id)) {
        await request(url() + '/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delete: [ref.id] }) }, { provider: P, retries: 0, timeoutMs: 5000 });
        return true;
      }
      if ((q.queue_running || []).some((x: any[]) => x[1] === ref.id)) {
        await request(url() + '/interrupt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt_id: ref.id }) }, { provider: P, retries: 0, timeoutMs: 5000 });
        return true;
      }
    } catch {}
    return false;
  },
};

export type { JobRef };
