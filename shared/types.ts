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
  later?: { prompt: string; images: string[] }[];
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
export type SceneStatus = 'todo' | 'doing' | 'done';
export interface Scene {
  id: string;
  title: string;
  /** project seconds */
  start: number;
  duration: number;
  /** narration / on-screen copy */
  voiceover?: string;
  /** what we see: visual idea, motion, style */
  visual?: string;
  notes?: string;
  status: SceneStatus;
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
  parallelTasks: number;
  renderWorkers: number;
  transcribeModel: string;
  /** ElevenLabs: API key (stored locally; masked when sent to the UI), default voice & model */
  elevenlabsKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModel?: string;
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
  status: 'running' | 'done' | 'error';
  progress: number;
  stage: string;
  output?: string;
  error?: string;
  from: number;
  to: number;
}

export type ServerEvent =
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
  | { type: 'notice'; level: 'info' | 'error'; text: string };
