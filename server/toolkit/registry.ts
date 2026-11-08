// Media toolkit — registry of small, programmatic media operations ("ops").
//
// One contract, three callers: REST (/api/toolkit), MCP (list_media_tools / run_media_tool) and,
// later, a node-pipeline engine that chains ops (an op's file outputs feed another op's file inputs).
//
//   ToolOp      = serialisable description (ToolOpInfo: id, title, category, description, inputs, outputs)
//                 + run(ctx, params). Ops live in server/toolkit/ops/*.ts and call defineOp().
//   ParamSpec   = JSON form field (type file|number|string|boolean|color|enum, label, default, min/max…).
//   File values = project-relative paths ('media/photo.png'). Inputs may also be given as a bare file
//                 name in media/ ('photo.png'); run() always receives the normalised 'media/…' form.
//   runOp()     = validate params → (cache hit? reuse outputs) → job → run → commit staged outputs into
//                 media/ → provenance (.studio/media/<file>.source.json) → probeMedia → bus event.
//
// Ops never write into media/ directly: ctx.out() reserves a unique derived name and ctx.abs() of that
// name points into a staging dir; the files are moved into media/ only when run() resolves, so a failed
// or cancelled op leaves nothing half-written in the library (and originals are never overwritten).
import fs from 'node:fs';
import path from 'node:path';
import type { ToolCategory, ToolOpInfo, ToolOutputSpec, ToolParamSpec, ToolkitJob } from '../../shared/types.ts';
import { cur, MEDIA_EXT } from '../project.ts';
import { bus } from '../bus.ts';
import { uerr } from '../i18n.ts';
import { nid, readJson, writeJson, safeJoin, sha1 } from '../util.ts';
import { probeMedia } from '../media.ts';

export type { ToolCategory, ToolOpInfo, ToolOutputSpec, ToolkitJob };
export type ParamSpec = ToolParamSpec;

/** what an op gets while it runs */
export interface OpContext {
  /** absolute project directory */
  dir: string;
  /** id of the job (for logs / temp names) */
  jobId: string;
  /** absolute path of a project-relative path. For paths reserved with out() this is the staging file —
   *  write your output there; it is moved into media/ when run() resolves. */
  abs(rel: string): string;
  /** reserve a unique derived output path in media/: '<stem of the main input>.<name>.<ext>'
   *  (e.g. out('nobg','png') → 'media/photo.nobg.png'; '-2', '-3' … appended if taken). Returns the project-relative path. */
  out(name: string, ext: string): string;
  /** like out() but with an exact base name: outAs('gen-red-fox','png') → 'media/gen-red-fox.png' ('-2'… if taken) */
  outAs(base: string, ext: string): string;
  /** extra fields merged into the provenance of every output (.studio/media/<file>.source.json), e.g. generator/model/seed/cost */
  provenance(extra: Record<string, unknown>): void;
  /** report progress 0..1 and an optional short English stage key ('decoding', 'segmenting {n}/{total}') */
  progress(p: number, stageKey?: string): void;
  /** aborted on cancel / timeout — kill child processes, stop loops */
  signal: AbortSignal;
  /** a private scratch dir for this job (deleted afterwards) */
  tmp(): string;
}

export interface ToolOp<P extends Record<string, any> = Record<string, any>> extends ToolOpInfo {
  /** bump when the op's output for the same params changes (invalidates the cache) */
  version?: number;
  /** hard timeout in seconds (default 900) */
  timeoutSec?: number;
  /** reuse results of identical runs (default true); a function decides per call (e.g. not for live status / dry runs) */
  cache?: boolean | ((params: P) => boolean);
  /** params are validated & normalised (defaults applied, numbers clamped, files → 'media/…');
   *  return file outputs as project-relative paths and json outputs as plain objects */
  run(ctx: OpContext, params: P): Promise<Record<string, string | object>>;
}

const ops = new Map<string, ToolOp>();

/** register an op (ops/*.ts call this at import time) */
export function defineOp<P extends Record<string, any>>(op: ToolOp<P>): ToolOp<P> {
  if (ops.has(op.id)) throw new Error('duplicate toolkit op ' + op.id);
  ops.set(op.id, op as unknown as ToolOp);
  return op;
}
export function getOp(id: string) { return ops.get(id); }
/** serialisable catalog (no run functions) */
export function catalog(): ToolOpInfo[] {
  return [...ops.values()].map(({ id, title, category, description, inputs, outputs, limits, cost }) => ({ id, title, category, description, inputs, outputs, limits, cost }));
}

// ---------- params ----------
const kindOf = (rel: string) => MEDIA_EXT[path.extname(rel).toLowerCase()];
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000', red: '#ff0000', green: '#00ff00', blue: '#0000ff', yellow: '#ffff00', transparent: '#00000000' };
export function normColor(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (NAMED[s]) return NAMED[s];
  const m = HEX.exec(s.replace(/^0x/, '#'));
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h;
}

/** resolve a user-given file reference to 'media/<file>' (bare names are looked up in media/) */
export function normFile(dir: string, v: string): string {
  let rel = String(v).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.isAbsolute(rel)) {
    const r = path.relative(dir, rel);
    if (r.startsWith('..') || path.isAbsolute(r)) throw uerr('File must be inside the project (media/…): {file}', { file: v });
    rel = r.split(path.sep).join('/');
  }
  if (!rel.includes('/')) rel = 'media/' + rel;
  safeJoin(dir, rel);
  return rel;
}

export function validateParams(op: ToolOpInfo, raw: Record<string, unknown>, dir: string): Record<string, any> {
  const out: Record<string, any> = {};
  const unknown = Object.keys(raw || {}).filter((k) => !op.inputs[k]);
  if (unknown.length) throw uerr('Unknown parameter(s) for {op}: {names}. Valid: {valid}', { op: op.id, names: unknown.join(', '), valid: Object.keys(op.inputs).join(', ') });
  for (const [k, spec] of Object.entries(op.inputs)) {
    let v = raw?.[k];
    if (v === '' || v === null) v = undefined;
    if (v === undefined) v = spec.default;
    if (v === undefined) {
      if (spec.required) throw uerr('Missing required parameter "{name}" for {op}', { name: k, op: op.id });
      continue;
    }
    switch (spec.type) {
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) throw uerr('Parameter "{name}" must be a number', { name: k });
        if (spec.min != null && n < spec.min) throw uerr('Parameter "{name}" must be ≥ {min} (got {value})', { name: k, min: spec.min, value: n });
        if (spec.max != null && n > spec.max) throw uerr('Parameter "{name}" must be ≤ {max} (got {value})', { name: k, max: spec.max, value: n });
        out[k] = n;
        break;
      }
      case 'boolean': out[k] = v === true || v === 'true' || v === 1 || v === '1'; break;
      case 'string': out[k] = String(v); break;
      case 'color': {
        const c = normColor(v);
        if (!c) throw uerr('Parameter "{name}" must be a colour like #00ff00 (got {value})', { name: k, value: String(v) });
        out[k] = c;
        break;
      }
      case 'enum': {
        const s = String(v);
        if (!spec.values?.includes(s)) throw uerr('Parameter "{name}" must be one of {values} (got {value})', { name: k, values: (spec.values || []).join('|'), value: s });
        out[k] = s;
        break;
      }
      case 'file': {
        const rel = normFile(dir, String(v));
        const abs = path.join(dir, rel);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw uerr('File not found: {file} (give a path in the project, e.g. media/photo.png)', { file: rel });
        const kind = kindOf(rel);
        if (spec.accept?.length && (!kind || !spec.accept.includes(kind))) throw uerr('Parameter "{name}" expects {kinds}, got {file}', { name: k, kinds: spec.accept.join('/'), file: rel });
        out[k] = rel;
        break;
      }
    }
  }
  return out;
}

// ---------- jobs ----------
type Job = ToolkitJob & { _ac?: AbortController };
const jobs = new Map<string, Job>();
const reserved = new Set<string>(); // absolute final paths reserved by running jobs
const pub = (j: Job): ToolkitJob => { const { _ac, ...rest } = j; void _ac; return rest; };
function emit(j: Job) { bus.send({ type: 'toolkit-job', job: pub(j) }); }

/** toolkit jobs of the current project, newest first */
export function listJobs(): ToolkitJob[] {
  const pid = cur().id;
  return [...jobs.values()].filter((j) => j.project === pid).reverse().map(pub);
}
export function getJob(id: string): ToolkitJob | undefined { const j = jobs.get(id); return j && pub(j); }
export function cancelJob(id: string): boolean {
  const j = jobs.get(id);
  if (!j || j.status !== 'running') return false;
  j._ac?.abort(new Error('cancelled'));
  return true;
}

// a small FIFO so heavy ops (ML, frame interpolation) don't all fight for the CPU at once
const MAX_PARALLEL = Math.max(1, Number(process.env.STUDIO_TOOLKIT_PARALLEL) || 2);
let active = 0;
const waiting: (() => void)[] = [];
async function slot(signal: AbortSignal) {
  if (active < MAX_PARALLEL) { active++; return; }
  await new Promise<void>((res, rej) => {
    const go = () => { signal.removeEventListener('abort', ab); active++; res(); };
    const ab = () => { const i = waiting.indexOf(go); if (i >= 0) waiting.splice(i, 1); rej(signal.reason); };
    waiting.push(go);
    signal.addEventListener('abort', ab, { once: true });
  });
}
function release() { active--; waiting.shift()?.(); }

const cacheFile = () => cur().p('.studio', 'toolkit', 'cache.json');
const mediaPaths = (v: unknown, acc: string[] = []): string[] => {
  if (typeof v === 'string') { if (v.startsWith('media/')) acc.push(v); }
  else if (Array.isArray(v)) v.forEach((x) => mediaPaths(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => mediaPaths(x, acc));
  return acc;
};

export interface RunHandle { job: ToolkitJob; done: Promise<ToolkitJob> }

/** start an op in the current project. `done` resolves with the finished job (never rejects). */
export function runOp(id: string, rawParams: Record<string, unknown> = {}): RunHandle {
  const op = ops.get(id);
  if (!op) throw uerr('Unknown media tool "{op}". Call list_media_tools for the catalog.', { op: id }, 404);
  const store = cur();
  const params = validateParams(op, rawParams, store.dir);
  const fileInputs = Object.entries(op.inputs).filter(([k, s]) => s.type === 'file' && params[k]).map(([k]) => k);
  const now = new Date().toISOString();
  const job: Job = { id: nid(), op: id, project: store.id, status: 'running', progress: 0, stage: 'queued', params, startedAt: now };

  // cache: same op version + params + input file mtimes/sizes, and every output still on disk
  const key = sha1(JSON.stringify({ op: id, v: op.version || 1, params, files: fileInputs.map((k) => { const st = fs.statSync(store.p(params[k])); return [params[k], st.mtimeMs, st.size]; }) }));
  const cache = readJson<Record<string, { outputs: Record<string, string | object>; at: string }>>(cacheFile(), {});
  const cacheable = typeof op.cache === 'function' ? op.cache(params as any) : op.cache !== false;
  const hit = cacheable ? cache[key] : undefined;
  if (hit && mediaPaths(hit.outputs).every((f) => fs.existsSync(store.p(f)))) {
    Object.assign(job, { status: 'done', progress: 1, stage: 'cached', outputs: hit.outputs, cached: true, endedAt: now });
    jobs.set(job.id, job);
    emit(job);
    return { job: pub(job), done: Promise.resolve(pub(job)) };
  }

  jobs.set(job.id, job);
  if (jobs.size > 200) for (const [k, j] of jobs) { if (jobs.size <= 150) break; if (j.status !== 'running') jobs.delete(k); }
  const ac = new AbortController();
  job._ac = ac;
  const timeout = setTimeout(() => ac.abort(uerr('{op} timed out after {s} s', { op: id, s: op.timeoutSec || 900 })), (op.timeoutSec || 900) * 1000);
  const work = store.p('.studio', 'toolkit', 'tmp', job.id);
  const stage = path.join(work, 'stage');
  fs.mkdirSync(stage, { recursive: true });
  const staged = new Map<string, string>(); // project-relative final path → staging file
  const mainInput = fileInputs[0] ? params[fileInputs[0]] as string : '';
  const stem = mainInput ? path.basename(mainInput).replace(/\.[^.]+$/, '') : id;

  let lastEmit = 0;
  const extra: Record<string, unknown> = {};
  const ctx: OpContext = {
    dir: store.dir,
    jobId: job.id,
    abs: (rel) => staged.get(rel) ?? safeJoin(store.dir, rel),
    out: (name, ext) => ctx.outAs(`${stem}.${name}`, ext),
    outAs: (rawBase, ext) => {
      const base = rawBase.replace(/[^\w.\-а-яё ]+/gi, '_');
      ext = ext.replace(/^\./, '');
      for (let n = 1; ; n++) {
        const rel = `media/${base}${n > 1 ? '-' + n : ''}.${ext}`;
        const abs = store.p(rel);
        if (staged.has(rel) || reserved.has(abs) || fs.existsSync(abs)) continue;
        reserved.add(abs);
        staged.set(rel, path.join(stage, `${staged.size}-${path.basename(rel)}`));
        return rel;
      }
    },
    progress: (p, stageKey) => {
      job.progress = Math.max(0, Math.min(1, p));
      if (stageKey) job.stage = stageKey;
      const t = Date.now();
      if (t - lastEmit > 250) { lastEmit = t; emit(job); }
    },
    signal: ac.signal,
    tmp: () => { const d = path.join(work, 'tmp'); fs.mkdirSync(d, { recursive: true }); return d; },
    provenance: (x) => { Object.assign(extra, x); },
  };

  const done = (async () => {
    try {
      emit(job);
      await slot(ac.signal);
      try {
        job.stage = 'running';
        emit(job);
        const outputs = await op.run(ctx, params);
        if (ac.signal.aborted) throw ac.signal.reason;
        // commit staged files into media/
        const committed: string[] = [];
        for (const [rel, file] of staged) {
          if (!fs.existsSync(file)) continue;
          fs.renameSync(file, store.p(rel));
          committed.push(rel);
        }
        const missing = mediaPaths(outputs).filter((f) => !fs.existsSync(store.p(f)));
        if (missing.length) throw new Error(`${id} did not produce ${missing.join(', ')}`);
        const at = new Date().toISOString();
        const inputs = Object.fromEntries(fileInputs.map((k) => [k, params[k]]));
        for (const rel of committed) {
          const file = rel.slice('media/'.length);
          writeJson(store.p('.studio', 'media', file + '.source.json'), { kind: 'toolkit', op: id, params, inputs, at, job: job.id, ...extra });
          if (MEDIA_EXT[path.extname(file).toLowerCase()]) await probeMedia(file, true).catch(() => {});
        }
        if (cacheable) {
          const c = readJson<typeof cache>(cacheFile(), {});
          c[key] = { outputs, at };
          writeJson(cacheFile(), c);
        }
        Object.assign(job, { status: 'done', progress: 1, stage: 'done', outputs });
      } finally { release(); }
    } catch (e: any) {
      const reason = ac.signal.aborted ? ac.signal.reason : e;
      job.status = 'error';
      job.error = String(reason?.message || reason || 'failed');
      job.stage = job.error === 'cancelled' ? 'cancelled' : 'error';
    } finally {
      clearTimeout(timeout);
      for (const rel of staged.keys()) reserved.delete(store.p(rel));
      fs.rmSync(work, { recursive: true, force: true });
      job.endedAt = new Date().toISOString();
      delete job._ac;
      emit(job);
    }
    return pub(job);
  })();
  return { job: pub(job), done };
}

/** run and wait (for tests, pipelines and internal callers); throws on error */
export async function runOpAndWait(id: string, params: Record<string, unknown> = {}): Promise<ToolkitJob> {
  const j = await runOp(id, params).done;
  if (j.status === 'error') throw new Error(j.error);
  return j;
}
