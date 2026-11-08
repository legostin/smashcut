// Generative footage test: boots its own server (port 4441, temp STUDIO_HOME / STUDIO_PROJECTS — never 4317 or the
// user's projects) plus a MOCK fal.ai (queue submit/status/result/cancel + storage upload + platform API) and a MOCK
// ComfyUI (/prompt, /history, /queue, /view, /upload/image, /interrupt, /system_stats) on localhost. The adapters are
// pointed at the mocks via STUDIO_FAL_BASE / STUDIO_FAL_REST / STUDIO_FAL_API and the comfyUrl setting.
// Covers: key masking, key check, image (count 2) + reference edit + video end-to-end into media/ with provenance
// and cost, fps conform, dry run, budget refusal, bad key / no credits / content policy errors, cancel, ComfyUI
// placeholder injection (+ image upload, video output), list_generators, the MCP catalog.
// Real providers can't be exercised without the user's keys (and money) — this tests our side of the contract.
// Run: npx tsx test/generate.ts
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-generate-'));
const PORT = Number(process.env.GEN_TEST_PORT || 4441);
const BASE = `http://127.0.0.1:${PORT}`;
const PROJ = path.join(tmp, 'projects', 'gen');
let failures = 0;
const ok = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };
async function step(name: string, fn: () => Promise<void>) { try { await fn(); } catch (e) { ok(name, false, (e as Error).message.slice(0, 500)); } }

function sh(cmd: string, args: string[]) {
  return new Promise<{ code: number; out: string; err: string }>((res) => {
    const p = spawn(cmd, args); let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); p.on('close', (code) => res({ code: code ?? 1, out, err }));
  });
}
async function probe(abs: string) {
  const r = await sh('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', abs]);
  const j = JSON.parse(r.out); const v = j.streams.find((s: any) => s.codec_type === 'video');
  const [n, d] = String(v.avg_frame_rate).split('/').map(Number);
  return { fps: n / (d || 1), width: v.width, height: v.height, codec: v.codec_name, duration: Number(j.format.duration) };
}

// ---------- fixtures ----------
const FIX = path.join(tmp, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
const PNG = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#3366ff' } }).png().toBuffer();
const MP4_24 = path.join(FIX, 'shot24.mp4');
const WEBM = path.join(FIX, 'shot.webm');
{
  const a = await sh('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', MP4_24]);
  const b = await sh('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=16:duration=1', '-c:v', 'libvpx-vp9', '-b:v', '200k', WEBM]);
  if (a.code || b.code) throw new Error('ffmpeg fixtures failed: ' + a.err + b.err);
}

// ---------- mock fal.ai ----------
interface FalReq { id: string; endpoint: string; input: any; polls: number; cancelled: boolean; slow: boolean }
const fal = { submits: [] as FalReq[], uploads: 0, uploadsPut: 0, cancels: 0, byId: new Map<string, FalReq>() };
let falPort = 0;
const body = (req: http.IncomingMessage) => new Promise<Buffer>((r) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const send = (res: http.ServerResponse, code: number, j: unknown, type = 'application/json') => { res.writeHead(code, { 'content-type': type }); res.end(typeof j === 'string' || Buffer.isBuffer(j) ? j : JSON.stringify(j)); };
const falServer = http.createServer(async (req, res) => {
  const u = new URL(req.url!, 'http://x');
  const key = String(req.headers.authorization || '');
  const raw = await body(req);
  if (u.pathname.startsWith('/files/')) { // CDN downloads (no auth)
    if (u.pathname.endsWith('.png')) return send(res, 200, PNG, 'image/png');
    if (u.pathname.endsWith('.mp4')) return send(res, 200, fs.readFileSync(MP4_24), 'video/mp4');
    return send(res, 404, { detail: 'no file' });
  }
  if (u.pathname === '/upload-target') { fal.uploadsPut++; return send(res, 200, {}); }
  if (key === 'Key bad-key') return send(res, 401, { detail: 'Invalid API key' });
  if (key === 'Key broke-key') return send(res, 403, { detail: 'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.' });
  if (key !== 'Key good-key') return send(res, 401, { detail: 'Missing or invalid authorization' });
  if (u.pathname === '/v1/models') return send(res, 200, { models: [], has_more: false });
  if (u.pathname === '/storage/upload/initiate') { fal.uploads++; return send(res, 200, { upload_url: `http://127.0.0.1:${falPort}/upload-target`, file_url: `http://127.0.0.1:${falPort}/files/uploaded-${fal.uploads}.png` }); }
  const m = /^\/([\w.-]+\/[\w.-]+)\/requests\/([\w-]+)(\/status|\/cancel)?$/.exec(u.pathname);
  if (m) {
    const r = fal.byId.get(m[2]);
    if (!r) return send(res, 404, { detail: 'Request not found' });
    if (m[3] === '/cancel') { fal.cancels++; r.cancelled = true; return send(res, 200, { status: 'OK' }); } // queued → removed
    if (m[3] === '/status') {
      r.polls++;
      if (r.slow || r.polls < 2) return send(res, 200, { status: 'IN_QUEUE', queue_position: 0 });
      if (r.polls < 3) return send(res, 200, { status: 'IN_PROGRESS', logs: [{ message: '50%' }] });
      return send(res, 200, { status: 'COMPLETED' });
    }
    // result
    if (/forbidden/.test(r.input.prompt || '')) return send(res, 422, { detail: [{ loc: ['body', 'prompt'], msg: 'The content could not be processed because it contained material flagged by a content checker (content_policy_violation).', type: 'content_policy_violation' }] });
    const video = /video/.test(r.endpoint);
    if (video) return send(res, 200, { video: { url: `http://127.0.0.1:${falPort}/files/out.mp4`, content_type: 'video/mp4' }, seed: 777 });
    const n = r.input.num_images || 1;
    return send(res, 200, { images: Array.from({ length: n }, (_, i) => ({ url: `http://127.0.0.1:${falPort}/files/img-${i}.png`, content_type: 'image/png' })), seed: r.input.seed ?? 4242 });
  }
  if (req.method === 'POST') {
    const endpoint = u.pathname.slice(1);
    const input = JSON.parse(raw.toString() || '{}');
    const id = 'req-' + (fal.submits.length + 1);
    const app = endpoint.split('/').slice(0, 2).join('/');
    const r: FalReq = { id, endpoint, input, polls: 0, cancelled: false, slow: /slow-model/.test(endpoint) };
    fal.submits.push(r); fal.byId.set(id, r);
    const q = `http://127.0.0.1:${falPort}/${app}/requests/${id}`;
    return send(res, 200, { request_id: id, status_url: q + '/status', response_url: q, cancel_url: q + '/cancel', queue_position: 0 });
  }
  send(res, 404, { detail: 'not found ' + u.pathname });
});

// ---------- mock ComfyUI ----------
const comfy = { prompts: [] as any[], uploads: [] as string[], history: new Map<string, any>(), interrupts: 0 };
let comfyPort = 0;
const comfyServer = http.createServer(async (req, res) => {
  const u = new URL(req.url!, 'http://x');
  const raw = await body(req);
  if (u.pathname === '/system_stats') return send(res, 200, { system: { comfyui_version: '0.9.9-mock' }, devices: [{ name: 'mock-gpu' }] });
  if (u.pathname === '/upload/image') { const name = /filename="([^"]+)"/.exec(raw.toString('latin1'))?.[1] || 'x.png'; comfy.uploads.push(name); return send(res, 200, { name, subfolder: '', type: 'input' }); }
  if (u.pathname === '/prompt') {
    const j = JSON.parse(raw.toString());
    comfy.prompts.push(j.prompt);
    if (Object.values<any>(j.prompt).some((n) => !n.class_type)) return send(res, 400, { error: { type: 'invalid_prompt', message: 'Cannot execute because a node is missing the class_type property.' }, node_errors: {} });
    const id = 'p-' + comfy.prompts.length;
    const video = Object.values<any>(j.prompt).some((n) => n.class_type === 'SaveWEBM');
    comfy.history.set(id, video
      ? { outputs: { 9: { images: [{ filename: 'wan_00001_.webm', subfolder: 'smashcut', type: 'output' }], animated: [true] } }, status: { status_str: 'success', completed: true } }
      : { outputs: { 9: { images: [{ filename: 'sdxl_00001_.png', subfolder: '', type: 'output' }, { filename: 'preview.png', subfolder: '', type: 'temp' }] } }, status: { status_str: 'success', completed: true } });
    return send(res, 200, { prompt_id: id, number: comfy.prompts.length, node_errors: {} });
  }
  const h = /^\/history\/(.+)$/.exec(u.pathname);
  if (h) { const e = comfy.history.get(h[1]); return send(res, 200, e ? { [h[1]]: e } : {}); }
  if (u.pathname === '/queue') return send(res, 200, { queue_running: [], queue_pending: [] });
  if (u.pathname === '/interrupt') { comfy.interrupts++; return send(res, 200, {}); }
  if (u.pathname === '/view') { const f = u.searchParams.get('filename') || ''; return f.endsWith('.webm') ? send(res, 200, fs.readFileSync(WEBM), 'video/webm') : send(res, 200, PNG, 'image/png'); }
  send(res, 404, { error: 'not found' });
});

const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as any).port)));
falPort = await listen(falServer);
comfyPort = await listen(comfyServer);

// ---------- the editor ----------
const env: Record<string, string> = { ...process.env as Record<string, string>, STUDIO_PORT: String(PORT), STUDIO_HOME: path.join(tmp, 'home'), STUDIO_PROJECTS: path.join(tmp, 'projects'),
  STUDIO_FAL_BASE: `http://127.0.0.1:${falPort}`, STUDIO_FAL_REST: `http://127.0.0.1:${falPort}`, STUDIO_FAL_API: `http://127.0.0.1:${falPort}` };
for (const k of ['FAL_KEY', 'RUNWAYML_API_SECRET', 'REPLICATE_API_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'HF_KEY', 'HF_CREDENTIALS', 'STUDIO_COMFY_URL']) delete env[k];
const server = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'server/index.ts'), PROJ], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));

async function api(method: string, url: string, b?: unknown) {
  const r = await fetch(BASE + url, { method, headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(`${method} ${url}: ${r.status} ${JSON.stringify(j)}`), { status: r.status, body: j });
  return j;
}
const run = (op: string, params: Record<string, unknown>) => api('POST', '/api/toolkit/run', { op, params, wait: true });
const prov = (rel: string) => JSON.parse(fs.readFileSync(path.join(PROJ, '.studio', 'media', rel.replace(/^media\//, '') + '.source.json'), 'utf8'));

try {
  for (let i = 0; i < 120; i++) { try { const j = await (await fetch(BASE + '/api/state')).json(); if (j.project) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const st = await api('GET', '/api/state');
  ok('server up on its own port with a temp project', !!st.project && st.dir.startsWith(tmp), st.dir);
  const fps = st.project.fps;
  fs.writeFileSync(path.join(PROJ, 'media', 'ref.png'), PNG);

  let gens: any;
  await step('catalog', async () => {
    gens = await api('GET', '/api/generators');
    const ids = gens.providers.map((p: any) => p.id);
    ok('GET /api/generators lists providers', ['fal', 'runway', 'replicate', 'higgsfield', 'openai', 'google', 'comfy'].every((x) => ids.includes(x)), ids.join(','));
    const f = gens.providers.find((p: any) => p.id === 'fal');
    ok('fal has curated image + video models with prices', f.models.some((m: any) => m.kind === 'video') && f.models.some((m: any) => m.kind === 'image') && f.models.every((m: any) => m.price && typeof m.price.usd === 'number'), `${f.models.length} models`);
    ok('no key → hasKey false', f.hasKey === false);
    ok('ComfyUI example workflows seeded', gens.providers.find((p: any) => p.id === 'comfy').models.some((m: any) => m.id === 'example-sdxl-txt2img') && fs.existsSync(path.join(tmp, 'home', 'comfy-workflows', 'example-wan22-img2vid.json')));
    const tk = await api('GET', '/api/toolkit');
    ok('ops registered in category generate', ['generate_image', 'generate_video', 'list_generators'].every((id) => tk.ops.some((o: any) => o.id === id && o.category === 'generate')));
  });
  const falModels = () => gens.providers.find((p: any) => p.id === 'fal').models;
  const imgModel = () => falModels().find((m: any) => m.kind === 'image' && (m.maxCount || 1) >= 2 && m.text).id;
  const editModel = () => falModels().find((m: any) => m.kind === 'image' && m.image).id;
  const vidModel = () => falModels().find((m: any) => m.kind === 'video' && m.image && m.price.unit === 'second').id;

  await step('no key', async () => {
    const j = await run('generate_image', { provider: 'fal', prompt: 'a red fox in snow' });
    ok('generate without a key → clear "no API key" error', j.status === 'error' && /no API key/i.test(j.error), j.error);
    ok('nothing submitted without a key', fal.submits.length === 0);
  });

  await step('settings masking', async () => {
    await api('PATCH', '/api/settings', { falKey: 'good-key', genBudgetUsd: 5 });
    const s = await api('GET', '/api/settings');
    ok('falKey masked in GET /api/settings', s.falKey === '••••-key' && !JSON.stringify(s).includes('good-key'), s.falKey);
    const st2 = await api('GET', '/api/state');
    ok('falKey masked in /api/state', !JSON.stringify(st2.settings).includes('good-key'));
    await api('PATCH', '/api/settings', { falKey: '••••-key' });
    const raw = JSON.parse(fs.readFileSync(path.join(tmp, 'home', 'settings.json'), 'utf8'));
    ok('a masked value does not overwrite the stored key', raw.falKey === 'good-key');
  });

  await step('key check', async () => {
    const a = await api('POST', '/api/generators/check', { provider: 'fal' });
    const b = await api('POST', '/api/generators/check', { provider: 'fal', key: 'bad-key' });
    ok('check: stored key ok, unsaved bad key ✗', a.ok === true && b.ok === false, `${a.detail} / ${b.detail}`);
  });

  let spent = 0;
  await step('image', async () => {
    const j = await run('generate_image', { provider: 'fal', model: imgModel(), prompt: 'a red fox in fresh snow, golden hour, 85mm', count: 2, seed: 11, aspect: '16:9', name: 'fox' });
    ok('generate_image done', j.status === 'done', j.error || '');
    const imgs: string[] = j.outputs.images;
    ok('2 images in media/ (fox.png, fox-2.png)', imgs.length === 2 && imgs.every((f) => fs.existsSync(path.join(PROJ, f))) && imgs[0] === 'media/fox.png', imgs.join(','));
    const sub = fal.submits.at(-1)!;
    ok('request carries prompt / seed / count / aspect', sub.input.prompt.includes('red fox') && sub.input.seed === 11 && sub.input.num_images === 2, JSON.stringify(sub.input).slice(0, 200));
    const p = prov(imgs[0]);
    ok('provenance: provider, model, prompt, seed, cost', p.generated?.provider === 'fal' && p.generated.model === imgModel() && /red fox/.test(p.generated.prompt) && p.generated.seed === 11 && p.generated.cost.usd > 0, JSON.stringify(p.generated).slice(0, 160));
    ok('cost in outputs (estimated)', j.outputs.cost.usd > 0 && j.outputs.cost.estimated === true, JSON.stringify(j.outputs.cost.usd));
    spent += j.outputs.cost.usd;
    const again = await run('generate_image', { provider: 'fal', model: imgModel(), prompt: 'a red fox in fresh snow, golden hour, 85mm', count: 2, seed: 11, aspect: '16:9', name: 'fox' });
    ok('identical re-run is cached (free, no new submit)', again.cached === true && fal.submits.length === 1);
  });

  await step('reference edit', async () => {
    const n0 = fal.uploads;
    const j = await run('generate_image', { provider: 'fal', model: editModel(), prompt: 'same product on a marble table', image: 'media/ref.png' });
    ok('edit with a reference image uploads it to fal storage', j.status === 'done' && fal.uploads === n0 + 1 && fal.uploadsPut >= 1, j.error || '');
    const sub = fal.submits.at(-1)!;
    ok('the uploaded file url is in the request', JSON.stringify(sub.input).includes('/files/uploaded-'), JSON.stringify(sub.input).slice(0, 200));
    if (j.status === 'done') spent += j.outputs.cost.usd;
  });

  await step('dry run', async () => {
    const n0 = fal.submits.length;
    const j = await run('generate_video', { provider: 'fal', model: vidModel(), prompt: 'slow push-in', image: 'media/ref.png', duration: 5, dryRun: true });
    ok('dryRun returns an estimate, submits nothing', j.status === 'done' && j.outputs.cost.usd > 0 && j.outputs.cost.dryRun && fal.submits.length === n0, JSON.stringify(j.outputs?.cost || j.error).slice(0, 160));
  });

  await step('video', async () => {
    const j = await run('generate_video', { provider: 'fal', model: vidModel(), prompt: 'the product slowly rotates, soft studio light', camera: 'slow dolly-in', image: 'media/ref.png', duration: 5, aspect: '16:9', name: 'spin' });
    ok('generate_video done', j.status === 'done', j.error || '');
    const v = j.outputs.video as string;
    ok('mp4 in media/', /^media\/spin\.mp4$/.test(v) && fs.existsSync(path.join(PROJ, v)), v);
    const pr = await probe(path.join(PROJ, v));
    ok(`conformed 24 → ${fps} fps`, Math.abs(pr.fps - fps) < 0.01, `${pr.fps} fps ${pr.width}x${pr.height}`);
    const p = prov(v);
    ok('video provenance: model, seed (provider-reported), duration, sourceFps, cost', p.generated.model === vidModel() && p.generated.seed != null && p.generated.duration > 0 && Math.abs(p.generated.sourceFps - 24) < 0.01 && p.generated.cost.usd > 0, JSON.stringify(p.generated).slice(0, 200));
    const sub = fal.submits.at(-1)!;
    ok('camera move reaches the request', JSON.stringify(sub.input).includes('dolly-in'));
    ok('library knows the clip (probed)', (await api('GET', '/api/state')).media.some((m: any) => (m.file || m.name || m.id) === 'spin.mp4' || JSON.stringify(m).includes('spin.mp4')));
    spent += j.outputs.cost.usd;
  });

  await step('spend', async () => {
    const s = await api('GET', '/api/generators/spend');
    ok('spend tracked in gen-spend.json', Math.abs(s.spentUsd - spent) < 0.001 && fs.existsSync(path.join(tmp, 'home', 'gen-spend.json')), `${s.spentUsd} vs ${spent.toFixed(4)}`);
  });

  await step('budget refusal', async () => {
    await api('PATCH', '/api/settings', { genBudgetUsd: Math.round((spent + 0.01) * 100) / 100 });
    const n0 = fal.submits.length;
    const j = await run('generate_video', { provider: 'fal', model: vidModel(), prompt: 'another shot', image: 'media/ref.png', duration: 5, seed: 5 });
    ok('over budget → refused with a clear error, nothing submitted', j.status === 'error' && /budget/i.test(j.error) && fal.submits.length === n0, j.error);
    await api('PATCH', '/api/settings', { genBudgetUsd: 0 });
    const k = await run('generate_image', { provider: 'fal', model: imgModel(), prompt: 'x', seed: 99 });
    ok('budget 0 → paid generation off', k.status === 'error' && /off/i.test(k.error), k.error);
    await api('PATCH', '/api/settings', { genBudgetUsd: 50 });
  });

  await step('errors', async () => {
    const c = await run('generate_image', { provider: 'fal', model: imgModel(), prompt: 'forbidden thing', seed: 3 });
    ok('content policy → clear error', c.status === 'error' && /content policy/i.test(c.error), c.error);
    await api('PATCH', '/api/settings', { falKey: 'bad-key' });
    const b = await run('generate_image', { provider: 'fal', model: imgModel(), prompt: 'a cat', seed: 1 });
    ok('bad key → "API key was rejected"', b.status === 'error' && /rejected/i.test(b.error), b.error);
    await api('PATCH', '/api/settings', { falKey: 'broke-key' });
    const n = await run('generate_image', { provider: 'fal', model: imgModel(), prompt: 'a cat', seed: 2 });
    ok('exhausted balance → "not enough credits"', n.status === 'error' && /credits|balance/i.test(n.error), n.error);
    await api('PATCH', '/api/settings', { falKey: 'good-key' });
    const u = await run('generate_video', { provider: 'fal', model: 'no-such-model', prompt: 'x' });
    ok('unknown model → lists the valid ones', u.status === 'error' && /Unknown fal\.ai model/.test(u.error), u.error.slice(0, 120));
  });

  await step('cancel', async () => {
    const before = (await api('GET', '/api/generators/spend')).spentUsd;
    const job = await api('POST', '/api/toolkit/run', { op: 'generate_video', params: { provider: 'fal', model: 'fal-ai/slow-model/video', prompt: 'never finishes', duration: 5 } });
    for (let i = 0; i < 40 && !fal.submits.some((s) => s.slow); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 600));
    await api('POST', `/api/toolkit/jobs/${job.id}/cancel`);
    let j = job;
    for (let i = 0; i < 50 && j.status === 'running'; i++) { await new Promise((r) => setTimeout(r, 100)); j = await api('GET', `/api/toolkit/jobs/${job.id}`); }
    ok('cancel → job cancelled and the provider request cancelled', j.status === 'error' && j.stage === 'cancelled' && fal.cancels === 1 && fal.submits.find((s) => s.slow)!.cancelled, `${j.status}/${j.stage} cancels=${fal.cancels}`);
    const after = (await api('GET', '/api/generators/spend')).spentUsd;
    ok('cancelled while queued → not charged', Math.abs(after - before) < 1e-6, `${before} → ${after}`);
    ok('no half-written file in media/', !fs.readdirSync(path.join(PROJ, 'media')).some((f) => f.startsWith('gen-never')));
  });

  await step('comfy', async () => {
    await api('PATCH', '/api/settings', { comfyUrl: `http://127.0.0.1:${comfyPort}` });
    const c = await api('POST', '/api/generators/check', { provider: 'comfy' });
    ok('ComfyUI check', c.ok && /mock/.test(c.detail), c.detail);
    fs.mkdirSync(path.join(PROJ, 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(PROJ, 'workflows', 'my-flux.json'), JSON.stringify({
      _smashcut: { kind: 'image', title: 'test' },
      1: { class_type: 'LoadImage', inputs: { image: '{{image}}' } },
      2: { class_type: 'CLIPTextEncode', inputs: { text: 'photo of {{prompt}}, highly detailed' } },
      3: { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps|20}}', cfg: '{{cfg|3.5}}', denoise: 1 } },
      4: { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}', batch_size: '{{count|1}}' } },
      5: { class_type: 'CLIPTextEncode', inputs: { text: '{{negative|blurry}}' } },
      9: { class_type: 'SaveImage', inputs: { filename_prefix: 'x' } },
    }));
    const j = await run('generate_image', { provider: 'comfy', model: 'my-flux', prompt: 'a cat', seed: 42, width: 768, height: 512, image: 'media/ref.png', extra: '{"cfg":2}' });
    ok('ComfyUI image done (free)', j.status === 'done' && j.outputs.cost.usd === 0 && fs.existsSync(path.join(PROJ, j.outputs.image)), j.error || j.outputs?.image);
    const wf = comfy.prompts.at(-1);
    ok('placeholders injected with types', wf['2'].inputs.text === 'photo of a cat, highly detailed' && wf['3'].inputs.seed === 42 && wf['3'].inputs.steps === 20 && wf['3'].inputs.cfg === 2 && wf['4'].inputs.width === 768 && wf['4'].inputs.batch_size === 1 && wf['5'].inputs.text === 'blurry', JSON.stringify(wf).slice(0, 300));
    ok('_smashcut meta stripped, image uploaded and referenced', !wf._smashcut && comfy.uploads.length === 1 && wf['1'].inputs.image === comfy.uploads[0], wf['1'].inputs.image);
    ok('temp previews skipped (one output)', j.outputs.images.length === 1);
    const v = await run('generate_video', { provider: 'comfy', model: 'example-wan22-img2vid', prompt: 'waves roll in', image: 'media/ref.png', duration: 2, seed: 7 });
    ok('ComfyUI video (example workflow) → mp4 at project fps', v.status === 'done' && /\.mp4$/.test(v.outputs.video) && Math.abs((await probe(path.join(PROJ, v.outputs.video))).fps - fps) < 0.01, v.error || v.outputs?.video);
    const vw = comfy.prompts.at(-1);
    ok('Wan frames = 4n+1 at the workflow fps (24): 2 s → 49', vw['55'].inputs.length === 49 && vw['55'].inputs.width % 32 === 0, `${vw['55'].inputs.length} ${vw['55'].inputs.width}x${vw['55'].inputs.height}`);
    const miss = await run('generate_video', { provider: 'comfy', model: 'example-wan22-img2vid', prompt: 'no image', duration: 2 });
    ok('image placeholder without an image → clear error', miss.status === 'error' && /image/i.test(miss.error), miss.error);
  });

  await step('list_generators op', async () => {
    const j = await run('list_generators', { kind: 'video', configured: true });
    const ids = j.outputs.generators.providers.map((p: any) => p.id);
    ok('list_generators (configured, video)', j.status === 'done' && ids.includes('fal') && ids.includes('comfy') && !ids.includes('runway') && j.outputs.generators.budget.budgetUsd === 50, ids.join(','));
    const k = await run('list_generators', { kind: 'video', configured: true });
    ok('list_generators is not cached', !k.cached);
  });

  await step('mcp', async () => {
    const tr = new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'server/mcp/stdio.mjs')], env: { ...env, STUDIO_URL: BASE } as Record<string, string> });
    const client = new Client({ name: 'gen-test', version: '0' });
    await client.connect(tr);
    const r: any = await client.callTool({ name: 'list_media_tools', arguments: { category: 'generate' } });
    const txt = r.content[0].text;
    ok('MCP list_media_tools {category:generate}', /generate_video/.test(txt) && /generate_image/.test(txt) && /list_generators/.test(txt));
    const g: any = await client.callTool({ name: 'run_media_tool', arguments: { op: 'generate_image', params: { provider: 'fal', model: imgModel(), prompt: 'mcp test still', seed: 5 } } });
    ok('MCP run_media_tool generate_image', !g.isError && /media\/gen-mcp-test-still\.png/.test(g.content[0].text), g.content[0].text.slice(0, 200));
    await client.close();
  });
} catch (e) {
  ok('test run', false, (e as Error).stack || String(e));
} finally {
  server.kill();
  falServer.close(); comfyServer.close();
  if (failures) console.log('\n--- server log (tail) ---\n' + log.slice(-3000));
  console.log(`\n${failures ? `✗ ${failures} failed` : '✓ all generate checks passed'}  (tmp ${tmp})`);
  if (!failures) fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
