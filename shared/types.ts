// Shared types between server and web.
import type { ItemFx } from './fx';
export type { ItemFx } from './fx';

export type TrackKind = 'video' | 'graphics' | 'audio' | 'music';
export type ItemKind = 'clip' | 'media' | 'music' | 'generated';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

export interface Item {
  id: string;
  track: string;
  kind: ItemKind;
  /** clip id (clips/<id>), media file name (media/<file>), music id (music/<id>) */
  ref: string;
  /** project time (s) where the item starts */
  start: number;
  /** length on the timeline (s) */
  duration: number;
  /** trim-in: offset (s) into the source */
  in: number;
  label?: string;
  /** clip parameter overrides */
  params?: Record<string, unknown>;
  opacity?: number;
  volume?: number;
  /** media placement: fit + scale + offset in px of the project frame */
  /** layer transform (all visual items): offset px, uniform scale, rotation °, origin in % of the frame */
  transform?: { fit?: 'contain' | 'cover'; scale?: number; x?: number; y?: number; rotate?: number; ox?: number; oy?: number };
  /** transitions in/out, effects, mask, blend mode (see shared/fx.ts) */
  fx?: ItemFx;
  /** reserved for video generators (Higgsfield & co) */
  generated?: { provider: string; prompt: string; jobId?: string; status?: string; output?: string };
}

export interface Marker { id: string; time: number; label: string; color?: string }

export interface Project {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: string;
  /** first track = top layer */
  tracks: Track[];
  items: Item[];
  markers: Marker[];
}

export type CommentStatus = 'draft' | 'sent' | 'resolved' | 'done';
export interface Comment {
  id: string;
  /** project time (s) */
  time: number;
  /** normalized 0..1 position of the pin */
  x: number;
  y: number;
  /** optional normalized rect (from x,y) */
  w?: number;
  h?: number;
  text: string;
  itemId?: string;
  clipId?: string;
  status: CommentStatus;
  taskId?: string;
  resolution?: string;
  snapshot?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ParamSpec {
  type: 'text' | 'textarea' | 'color' | 'number' | 'select' | 'boolean';
  label?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface PackageManifest {
  id: string;
  kind: 'clip' | 'music';
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  duration?: number;
  source?: string;
}

export interface ClipInfo extends PackageManifest {
  schema: Record<string, ParamSpec>;
  updatedAt: number;
}

export interface MusicMeta {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  duration: number;
  tail: number;
  sections: { name: string; start: number; end: number }[];
  markers: { name: string; time: number }[];
  title?: string;
}

export interface MusicInfo extends PackageManifest {
  meta?: MusicMeta;
  rendered?: string;
  renderError?: string;
  updatedAt: number;
}

export interface MediaInfo {
  file: string;
  type: 'video' | 'audio' | 'image';
  duration: number;
  /** file modification time (ms) — versions the URL so a rewritten file is never served from a stale cache */
  mtime?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  thumb?: string;
  peaks?: string;
  transcript?: string;
  analysis?: string;
  codec?: string;
  /** lightweight H.264 copy for in-browser preview (4K / ProRes / HEVC / 10-bit); export uses the original */
  proxy?: string;
  proxyStatus?: 'pending' | 'ready' | 'error';
}

export interface GalleryItem extends PackageManifest {
  origin: 'builtin' | 'library';
  url: string;
  thumb?: string;
}

export type AgentKind = 'claude' | 'codex';
export type TaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface AgentEvent {
  t: number;
  kind: 'user' | 'text' | 'thinking' | 'tool' | 'tool_result' | 'status' | 'error' | 'result' | 'image';
  /** translatable form of `text` (English key + params) */
  key?: string;
  params?: Record<string, string | number>;
  /** for kind=image: URL of a frame the agent rendered to look at */
  src?: string;
  text?: string;
  tool?: string;
  input?: unknown;
  ok?: boolean;
}

export interface Task {
  id: string;
  agent: AgentKind;
  title: string;
  /** set on sub-agent tasks: the task that delegated this assignment */
  parentId?: string;
  prompt: string;
  clipId?: string;
  commentIds: string[];
  status: TaskStatus;
  sessionId?: string;
  events: AgentEvent[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  commitBefore?: string;
  commitAfter?: string;
  costUsd?: number;
  /** process & stream bookkeeping (survives server restarts) */
  pid?: number;
  logFile?: string;
  logOffset?: number;
  /** prompt/images waiting to run (queued tasks survive restarts) */
  pending?: { prompt: string; images: string[] };
  resumes?: number;
  /** user interrupted the running agent with this message (applied when the process stops) */
  interrupt?: { prompt: string; images: string[] };
  /** messages to send after the current run finishes */
  later?: { prompt: string; images: string[]; steered?: boolean }[];
  /** messages the user typed while the agent works — delivered into the running session at its next step (no stop) */
  steer?: { id: string; text: string; images: string[]; at: string; delivered?: string }[];
  /** a lead agent blocked in wait_subagents (idle: not counted against the agents-at-once limit) */
  waiting?: boolean;
  /** model / reasoning effort chosen in the chat for this task (else the Settings defaults) */
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** what the agent is working on right now (derived from its tool calls) */
  focus?: { kind: 'clip' | 'music' | 'timeline' | 'script' | 'design'; id?: string; at: number };
}

/** a comment pinned to objects on the board (sent to the agent as a chat message) */
export interface BoardNote { id: string; anchors: string[]; labels: string[]; text: string; taskId?: string; createdAt: string; status?: 'open' | 'resolved'; resolution?: string }

export interface DesignSystem {
  name?: string;
  /** colour tokens → CSS var(--color-<name>) */
  colors: { name: string; value: string; role?: string }[];
  /** type roles → CSS var(--font-<role>), var(--weight-<role>), var(--size-<role>) */
  type: { role: string; family: string; weight: number; size: number; tracking?: number; sample?: string }[];
  /** motion tokens → CSS var(--ease-<name>) / var(--dur-<name>) and studio.design.motion */
  motion: { name: string; ease: string; duration: number }[];
  /** spacing / radius tokens → CSS var(--space-<name>) */
  spacing?: { name: string; value: number }[];
  notes?: string;
  updatedAt?: string;
}

export type StageId = 'brief' | 'script' | 'storyboard' | 'production' | 'review' | 'export';
/** todo → doing (agent works) → review (waits for the user) / done (agent finished) → approved (user signed off) */
export type SceneStatus = 'todo' | 'doing' | 'review' | 'done' | 'approved';
export interface Scene {
  id: string;
  title: string;
  /** project seconds */
  start: number;
  duration: number;
  /** narration / on-screen copy */
  voiceover?: string;
  /** speech text for the voice (numbers/dates as words, stress marks, [pause 0.5], {display|spoken}) — see server/voice/speech.ts */
  speech?: string;
  /** last voice-over check: pace (syllables/s), flagged sentences, takes */
  vo?: { file: string; rate: number; flagged: number; takes: number; at: string };
  /** what we see: visual idea, motion, style */
  visual?: string;
  notes?: string;
  status: SceneStatus;
  /** locked by the user: agents must not change this scene (its items, clips, timing, copy) */
  locked?: boolean;
  /** timeline items that realise this scene */
  itemIds?: string[];
}
export interface Script {
  brief: string;
  stage: StageId;
  scenes: Scene[];
  updatedAt?: string;
}

export interface Timing {
  bpm: number;
  beats: number[];
  bars: number[];
  sections: { name: string; start: number; end: number }[];
  markers: { name: string; time: number }[];
  words: { text: string; start: number; end: number }[];
  /** loudness of the project's music/audio, 0..1, sampled at `levelsRate` Hz from project time 0 */
  levels?: number[];
  levelsRate?: number;
}

export interface Settings {
  defaultAgent: AgentKind;
  claudeModel?: string;
  codexModel?: string;
  /** claude permission mode for spawned sessions */
  permissionMode: 'auto' | 'acceptEdits' | 'bypassPermissions';
  /** how many independent agent tasks (chats) may run at the same time; the rest wait in a queue */
  parallelTasks: number;
  /** let an agent split its work: it hands assignments to sub-agents that run in parallel (shown under the parent task) */
  subagents: boolean;
  /** max sub-agents one task may run at the same time (they don't use the parallelTasks slots) */
  maxSubagents: number;
  /** spawned agents load the user's own Claude Code / Codex setup (global MCP servers, hooks, plugins). Off = only the studio tools */
  agentUserConfig?: boolean;
  /** the user's standing instructions for every project: visual style, direction, colours */
  houseStyle?: { style?: string; direction?: string; colors?: string };
  renderWorkers: number;
  transcribeModel: string;
  /** ElevenLabs: API key (stored locally; masked when sent to the UI), default voice & model */
  elevenlabsKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModel?: string;
  /** path to the Blender executable (default: /Applications/Blender.app or `blender` in PATH) */
  blenderPath?: string;
  /** voice-over: max takes per scene when the pace check fails (each take costs ElevenLabs characters) */
  voiceMaxTakes?: number;
  /** generative footage (server/generate): API keys of the pay-per-use providers (stored locally; masked when sent to the UI) */
  falKey?: string;
  runwayKey?: string;
  replicateKey?: string;
  openaiKey?: string;
  googleKey?: string;
  /** Higgsfield: "KEY_ID:KEY_SECRET" */
  higgsfieldKey?: string;
  /** local ComfyUI server (no key), default http://127.0.0.1:8188 */
  comfyUrl?: string;
  /** daily spending limit for paid generations in USD (default 10; 0 = paid generation off) */
  genBudgetUsd?: number;
  /** default generator per kind: { image: { provider, model }, video: { provider, model } } */
  genDefaults?: { image?: { provider?: string; model?: string }; video?: { provider?: string; model?: string } };
}

export interface Voice { id: string; name: string; category?: string; labels?: Record<string, string>; preview?: string; languages?: string[] }

export interface PermissionRequest {
  id: string;
  taskId: string;
  tool: string;
  input: unknown;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  /** id of the project being exported */
  project?: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  stage: string;
  stageKey?: string;
  stageParams?: Record<string, string | number>;
  output?: string;
  error?: string;
  from: number;
  to: number;
}

/** a curated real-world motion piece (link + our breakdown of the technique); see gallery/inspiration.json */
export interface Inspiration {
  id: string; title: string; by: string; year?: number; url: string; platform: string; license?: string;
  thumb?: string; category: string; tags?: string[]; techniques?: string[]; breakdown: string; durationHint?: string;
}

/** a reference attached to the project: a technique from the library, an image/video from media, or a link */
export interface Reference {
  id: string;
  kind: 'technique' | 'music-technique' | 'media' | 'link' | 'inspiration';
  /** technique id (gallery/library), media file name, or URL */
  ref: string;
  origin?: 'builtin' | 'library';
  title: string;
  /** what to take from it ("the motion of the title", "this palette") */
  note?: string;
  /** scenes it applies to (empty = the whole video) */
  sceneIds?: string[];
  thumb?: string;
  addedAt: string;
}

/** every event is tagged with the id of the project it belongs to (`pid`, absent = global) */
export type ServerEvent = (
  | { type: 'project'; project: Project }
  | { type: 'files'; paths: string[] }
  | { type: 'comments'; comments: Comment[] }
  | { type: 'task'; task: Task }
  | { type: 'task-event'; taskId: string; event: AgentEvent }
  | { type: 'export'; job: ExportJob }
  | { type: 'music'; music: MusicInfo }
  | { type: 'media'; media: MediaInfo }
  | { type: 'permissions'; permissions: PermissionRequest[] }
  | { type: 'script'; script: Script }
  | { type: 'design'; design: DesignSystem }
  | { type: 'board'; notes: BoardNote[] }
  | { type: 'references'; references: Reference[] }
  | { type: 'render3d'; job: { id: string; sceneId: string; quality: 'mock' | 'look' | 'final'; mode: 'stills' | 'animation'; status: 'running' | 'done' | 'error'; progress: number; output?: string; sheet?: string; error?: string } }
  | { type: 'record'; job: { id: string; kind: 'web' | 'screen'; status: 'running' | 'done' | 'error'; stage: string; file?: string; duration?: number; error?: string; label: string } }
  | { type: 'toolkit-job'; job: ToolkitJob }
  | { type: 'notice'; level: 'info' | 'error'; text: string; key?: string; params?: Record<string, string | number> }) & { pid?: string };

// ---------- media toolkit (server/toolkit) ----------
// JSON-serialisable descriptions of the programmatic media operations, so the UI can render forms
// and a node-pipeline engine can type-check connections.

export type ToolMediaKind = 'image' | 'video' | 'audio';
export type ToolCategory = 'image' | 'video' | 'audio' | 'convert' | 'generate';

/** one input parameter of a toolkit op */
export interface ToolParamSpec {
  type: 'file' | 'number' | 'string' | 'boolean' | 'color' | 'enum';
  label: string;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  /** allowed values for type=enum */
  values?: string[];
  /** media kinds a type=file param accepts */
  accept?: ToolMediaKind[];
  required?: boolean;
  description?: string;
}

/** one output of a toolkit op; file outputs are project-relative paths (media/…), json outputs are objects */
export interface ToolOutputSpec {
  kind: ToolMediaKind | 'file' | 'json';
  /** the output's media kind follows this file input (e.g. trim: audio in → audio out) */
  sameAs?: string;
  /** not produced for every parameter combination */
  optional?: boolean;
  description?: string;
}

/** the serialisable part of a ToolOp (GET /api/toolkit) */
export interface ToolOpInfo {
  id: string;
  title: string;
  category: ToolCategory;
  description: string;
  inputs: Record<string, ToolParamSpec>;
  outputs: Record<string, ToolOutputSpec>;
  /** hard limits worth showing (e.g. max input seconds) */
  limits?: string;
  /** rough cost hint for schedulers/UI: fast (< 2 s) · medium · slow (ML / frame interpolation) */
  cost?: 'fast' | 'medium' | 'slow';
}

export interface ToolkitJob {
  id: string;
  op: string;
  /** id of the project it runs in */
  project: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  stage: string;
  params: Record<string, unknown>;
  outputs?: Record<string, string | object>;
  error?: string;
  /** outputs reused from an identical earlier run */
  cached?: boolean;
  startedAt: string;
  endedAt?: string;
}

/** GET /api/doctor — one entry per machine requirement (also printed at boot and by `smashcut doctor`) */
export type DoctorStatus = 'ok' | 'warn' | 'missing';
export interface DoctorCheck {
  /** node | ffmpeg | ffprobe | git | browser | claude | codex | home | disk | port */
  id: string;
  title: string;
  status: DoctorStatus;
  /** what was found (version, path, free space…) */
  detail: string;
  /** human instruction or a shell command that fixes it; present when status ≠ ok */
  fix?: string;
}

// ---------- generative footage (server/generate) ----------
export type GenKind = 'image' | 'video';
/** how a model is priced (USD). All prices are estimates copied from the provider's pricing page. */
export interface GenPrice {
  unit: 'image' | 'second' | 'video' | 'megapixel' | 'free';
  usd: number;
  /** price per unit by resolution / quality (overrides usd), e.g. { '1080p': 0.5 } */
  by?: Record<string, number>;
  /** extra per unit when native audio is generated */
  audioUsd?: number;
  note?: string;
  source?: string;
}
export interface GenModelInfo {
  /** model id to pass as `model` */
  id: string;
  provider: string;
  kind: GenKind;
  title: string;
  /** text → image/video, and/or (reference/first-frame) image → image/video */
  text: boolean;
  image: boolean;
  /** first + last frame */
  endImage?: boolean;
  negative?: boolean;
  seed?: boolean;
  /** allowed durations in seconds (video) */
  durations?: number[];
  aspects?: string[];
  resolutions?: string[];
  /** max images per call */
  maxCount?: number;
  /** native camera presets (otherwise camera text is added to the prompt) */
  cameras?: string[];
  /** generates sound with the picture */
  audio?: boolean;
  price: GenPrice;
  notes?: string;
}
export interface GenProviderInfo {
  id: string;
  title: string;
  needsKey: boolean;
  /** key configured (settings or env) */
  hasKey: boolean;
  keySource?: 'settings' | 'env';
  /** where to get a key / docs */
  keyUrl?: string;
  docs?: string;
  models: GenModelInfo[];
  note?: string;
}
export interface GenSpendEntry {
  at: string;
  day: string;
  provider: string;
  model: string;
  kind: GenKind;
  usd: number;
  /** usd is an estimate from the price table (not the provider's invoice) */
  estimate: boolean;
  status: 'done' | 'cancelled' | 'failed';
  project?: string;
  job?: string;
  requestId?: string;
}
