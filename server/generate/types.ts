// Generative footage — the provider adapter contract.
//
//   Provider.submit(req)  → JobRef           (one paid generation; never auto-retried more than once)
//   Provider.poll(ref)    → PollResult       (queued / running / done{outputs} / failed{error})
//   Provider.cancel(ref)                     (best effort)
//   Provider.download(o)  → bytes            (optional; default = GET o.url, or o.data)
//
// server/generate/index.ts drives it: resolve model → estimate cost → budget.reserve → submit → poll → download
// into the op's staged outputs → budget.commit. Providers only translate a GenRequest into their API.
import type { GenKind, GenModelInfo, GenPrice } from '../../shared/types.ts';

export type { GenKind, GenModelInfo, GenPrice };

/** a model in a provider's curated catalog (GenModelInfo + adapter-private routing) */
export interface ModelSpec extends GenModelInfo {
  /** provider-specific: endpoint ids by mode (fal: text-to-video vs image-to-video endpoints), field names… */
  route?: Record<string, any>;
}

export interface GenImageInput {
  /** absolute path of the project file */
  abs: string;
  /** project-relative path (media/…) */
  rel: string;
  mime: string;
}

/** normalised request handed to a provider */
export interface GenRequest {
  kind: GenKind;
  model: ModelSpec;
  prompt: string;
  negative?: string;
  image?: GenImageInput;
  endImage?: GenImageInput;
  /** '16:9' | '9:16' | '1:1' | … (already snapped to what the model supports) */
  aspect: string;
  width?: number;
  height?: number;
  /** seconds (video; already snapped to an allowed value) */
  duration?: number;
  resolution?: string;
  seed?: number;
  count: number;
  camera?: string;
  audio?: boolean;
  /** provider-specific input fields passed through as-is (JSON object given by the agent) */
  extra?: Record<string, unknown>;
}

export interface JobRef {
  provider: string;
  id: string;
  /** anything the provider needs to poll / cancel / download (urls, operation name, model id…) */
  data?: Record<string, any>;
}

export interface GenOutput {
  kind: GenKind;
  /** remote url to download, or inline bytes */
  url?: string;
  data?: Buffer;
  /** file extension without dot ('png', 'mp4'); guessed from url / content-type when missing */
  ext?: string;
  /** extra headers for the download (e.g. Google's x-goog-api-key) */
  headers?: Record<string, string>;
  /** seed the provider actually used, if it reports it */
  seed?: number;
}

export interface PollResult {
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  /** 0..1 when the provider reports it */
  progress?: number;
  /** position in the provider's queue */
  position?: number;
  outputs?: GenOutput[];
  /** cost the provider reports for this job (USD) — overrides the estimate */
  costUsd?: number;
  /** seed reported by the provider */
  seed?: number;
  error?: Error;
}

export interface CheckResult { ok: boolean; detail: string }

export interface PollCtx { signal: AbortSignal; log?: (s: string) => void }

export interface Provider {
  id: string;
  title: string;
  needsKey: boolean;
  /** Settings field holding the key */
  keyField?: 'falKey' | 'runwayKey' | 'replicateKey' | 'openaiKey' | 'googleKey' | 'higgsfieldKey';
  /** env variables used when the settings key is empty */
  envKeys?: string[];
  keyUrl?: string;
  docs?: string;
  note?: string;
  /** validate the key (or reachability) without spending money */
  checkKey(key?: string): Promise<CheckResult>;
  models(): ModelSpec[];
  /** default model id per kind and mode */
  defaultModel(kind: GenKind, withImage: boolean): string | undefined;
  /** resolve a model id not in the catalog (raw endpoint / owner/name:version passthrough) */
  rawModel?(id: string, kind: GenKind): ModelSpec | undefined;
  submit(req: GenRequest, ctx: PollCtx): Promise<JobRef>;
  poll(ref: JobRef, ctx: PollCtx): Promise<PollResult>;
  cancel(ref: JobRef): Promise<boolean>;
  download?(o: GenOutput, ctx: PollCtx): Promise<{ data: Buffer; contentType?: string }>;
  /** seconds between polls (default 3) */
  pollEvery?: number;
}
