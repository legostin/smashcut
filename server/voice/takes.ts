// The author's own voice: takes recorded with the teleprompter (or narration files attached to a scene).
//   raw recording  → media/rec-scene-<n>-<id>.wav            (never changed)
//   processed take → media/rec-scene-<n>-<id>.voice.wav      (toolkit op voice_polish; what goes on the timeline)
//   word timings   → .studio/transcripts/<file>.json         (an estimate at once, Whisper-aligned to the script a moment later)
//   registry       → .studio/voice/takes.json
// One active take per scene sits on the voice-over track as "VO: <scene title>", exactly where a synthetic voice would.
import fs from 'node:fs';
import path from 'node:path';
import type { PrompterScene, Scene, VoiceProcessReport, VoiceTake } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { bus } from '../bus.ts';
import { uerr } from '../i18n.ts';
import { getScript, patchScene } from '../script.ts';
import { readJson, writeJson, nid, run, Mutex } from '../util.ts';
import { probeMedia } from '../media.ts';
import { recomputeTiming } from '../timing.ts';
import { runOpAndWait } from '../toolkit/index.ts';
import { transcribe } from '../audio/transcribe.ts';
import { parseSpeech, displayWords, paceReport, prompterTokens } from './speech.ts';
import { speechOf } from './voiceover.ts';
import { voiceLevels, type VoiceLevels } from './levels.ts';
import { estimateWords, alignWords, type W } from './align.ts';
import { placeVoice, unplaceVoice } from './place.ts';

const takesFile = () => cur().p('.studio', 'voice', 'takes.json');
const mutex = new Mutex();
const load = (): VoiceTake[] => readJson<{ takes: VoiceTake[] }>(takesFile(), { takes: [] }).takes;
function save(takes: VoiceTake[]) { writeJson(takesFile(), { takes }); bus.send({ type: 'voice-takes' }); }
/** change the registry under a lock; returns the (possibly updated) take */
const edit = <T>(fn: (takes: VoiceTake[]) => T) => mutex.run(async () => { const takes = load(); const r = fn(takes); save(takes); return r; });

export const listTakes = (sceneId?: string) => load().filter((t) => !sceneId || t.sceneId === sceneId);
const sceneOf = (id: string): { sc: Scene; n: number } => {
  const scenes = getScript().scenes;
  const i = scenes.findIndex((x) => x.id === id);
  if (i < 0) throw uerr('Scene not found: {id}', { id }, 404);
  return { sc: scenes[i], n: i + 1 };
};
const spokenOf = (sc: Scene) => prompterTokens(speechOf(sc)).map((t) => t.text);
const transcriptFile = (file: string) => cur().p('.studio', 'transcripts', file + '.json');

/** word timings of the take → captions (display text) + what was said (pace checks) */
function writeWords(file: string, sc: Scene, words: W[], model: string, duration: number, extra: Record<string, unknown> = {}) {
  const parsed = parseSpeech(speechOf(sc));
  let display = words;
  try { display = displayWords(words, parsed); } catch {}
  writeJson(transcriptFile(file), { text: parsed.plain, words: display, spokenWords: words, model, duration, ...extra });
}

async function polish(raw: string, options: Record<string, unknown> | false | undefined): Promise<{ file: string; report?: VoiceProcessReport }> {
  if (options === false) return { file: raw };
  const job = await runOpAndWait('voice_polish', { ...(options || {}), media: 'media/' + raw });
  return { file: String(job.outputs!.media).replace(/^media\//, ''), report: job.outputs!.report as VoiceProcessReport };
}

/** the take goes on the voice-over track at its scene and becomes the scene's voice */
async function activate(take: VoiceTake) {
  const { sc } = sceneOf(take.sceneId);
  await placeVoice(take.file, take.duration, sc.start, sc);
  const tr = readJson<{ spokenWords?: W[] } | null>(transcriptFile(take.file), null);
  const rep = take.align.status === 'aligned' && tr?.spokenWords ? paceReport(tr.spokenWords) : null;
  await patchScene(sc.id, { vo: { file: take.file, rate: rep?.rate ?? 0, flagged: rep?.flagged ?? 0, takes: listTakes(sc.id).length, at: take.at, source: 'mic', takeId: take.id } });
}

function wpmOf(words: number, lv: VoiceLevels) {
  const voiced = lv.voiced.reduce((a, [s, e]) => a + (e - s), 0);
  return voiced > 0.5 && words ? Math.round(words / (voiced / 60)) : undefined;
}

/** measure the take's file, write provisional word timings, register it as the scene's active take */
async function register(base: Pick<VoiceTake, 'id' | 'sceneId' | 'raw'> & { options?: Record<string, unknown> | false; align?: boolean; /** a new recording must never be lost: if processing fails, keep it unprocessed */ keepOnError?: boolean }): Promise<VoiceTake> {
  const store = cur();
  const { sc } = sceneOf(base.sceneId);
  let error: string | undefined;
  const { file, report } = await polish(base.raw, base.options).catch((e) => {
    if (!base.keepOnError) throw e;
    error = String(e?.message || e).slice(0, 300);
    return { file: base.raw, report: undefined };
  });
  const info = await probeMedia(file, true);
  const lv = await voiceLevels(store.p('media', file));
  const duration = info.duration || lv.duration;
  const spoken = spokenOf(sc);
  writeWords(file, sc, estimateWords(spoken, lv), 'estimate', duration);
  const take: VoiceTake = {
    id: base.id, sceneId: base.sceneId, raw: base.raw, file, duration: +duration.toFixed(3), at: new Date().toISOString(), active: true,
    ...(base.options !== false && !error ? { options: base.options || {} } : {}), ...(report ? { report } : {}), ...(error ? { error } : {}),
    align: { status: spoken.length && base.align !== false ? 'aligning' : 'estimate', total: spoken.length },
    overflow: +Math.max(0, duration - sc.duration).toFixed(2), wpm: wpmOf(spoken.length, lv),
  };
  await edit((takes) => {
    const old = takes.findIndex((t) => t.id === take.id);
    if (old >= 0) takes.splice(old, 1);
    for (const t of takes) if (t.sceneId === take.sceneId) t.active = false;
    takes.push(take);
  });
  await activate(take);
  if (take.align.status === 'aligning') void alignTake(take.id);
  return take;
}

/** a new take from an uploaded recording (any format ffmpeg reads) or from a file already in media/ */
export async function addTake(input: { sceneId: string; upload?: string; media?: string; options?: Record<string, unknown> | false; /** false = keep the estimated word timings, don't run Whisper */ align?: boolean }): Promise<VoiceTake> {
  const store = cur();
  const { n } = sceneOf(input.sceneId);
  const id = nid().slice(0, 6);
  let raw: string;
  if (input.media) {
    raw = input.media.replace(/^media\//, '');
    if (!fs.existsSync(store.p('media', raw))) throw uerr('File not found in media/: {file}', { file: raw }, 404);
  } else {
    raw = `rec-scene-${n}-${id}.wav`;
    fs.mkdirSync(store.p('media'), { recursive: true });
    const r = await run('ffmpeg', ['-y', '-v', 'error', '-i', input.upload!, '-vn', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', store.p('media', raw)]);
    if (r.code !== 0) throw uerr('Could not read the recording: {error}', { error: r.stderr.trim().slice(-300) });
  }
  // a muted or wrong input device: say so instead of saving a silent take
  const heard = await voiceLevels(store.p('media', raw));
  if (!heard.voiced.length || heard.speechDb < -70) {
    if (!input.media) fs.rmSync(store.p('media', raw), { force: true });
    throw uerr('Nothing was recorded: the microphone is silent. Check the input device and its level.');
  }
  await probeMedia(raw, true);
  return register({ id, sceneId: input.sceneId, raw, options: input.options, align: input.align, keepOnError: true });
}

/** run the processing chain again with other settings (the raw recording is the source every time) */
export async function reprocessTake(id: string, options: Record<string, unknown> | false): Promise<VoiceTake> {
  const old = load().find((t) => t.id === id);
  if (!old) throw uerr('Take not found: {id}', { id }, 404);
  // register() makes it the scene's active take — that is what "process this take" means
  const take = await register({ id, sceneId: old.sceneId, raw: old.raw, options });
  if (old.file !== take.file && old.file !== old.raw) dropFile(old.file);
  return take;
}

export async function useTake(id: string): Promise<VoiceTake> {
  const take = await edit((takes) => {
    const t = takes.find((x) => x.id === id);
    if (!t) throw uerr('Take not found: {id}', { id }, 404);
    for (const x of takes) if (x.sceneId === t.sceneId) x.active = x.id === id;
    return t;
  });
  await activate(take);
  return take;
}

function dropFile(file: string) {
  const store = cur();
  if (store.project.items.some((i) => i.kind === 'media' && i.ref === file)) return;
  for (const f of [store.p('media', file), store.p('.studio', 'media', file + '.json'), store.p('.studio', 'media', file + '.peaks.json'), store.p('.studio', 'media', file + '.source.json'), store.p('.studio', 'analysis', file + '.json'), transcriptFile(file)]) fs.rmSync(f, { force: true });
}

export async function deleteTake(id: string) {
  const take = load().find((t) => t.id === id);
  if (!take) throw uerr('Take not found: {id}', { id }, 404);
  await edit((takes) => { const i = takes.findIndex((t) => t.id === id); if (i >= 0) takes.splice(i, 1); });
  if (take.active) {
    // the scene falls back to its most recent remaining take; with none left the voice comes off the timeline
    const prev = listTakes(take.sceneId).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (prev) await useTake(prev.id);
    else {
      const { sc } = sceneOf(take.sceneId);
      await unplaceVoice(sc);
      if (sc.vo?.takeId === id) await patchScene(sc.id, { vo: undefined });
    }
  }
  if (take.file !== take.raw) dropFile(take.file);
  // the raw file is ours only when the teleprompter recorded it; an attached file stays in the library
  if (/^rec-scene-\d+-[a-z0-9]+\.wav$/.test(take.raw)) dropFile(take.raw);
  return { ok: true };
}

/** a synthetic voice replaced the scene's recording: the takes stay in the list, none is active */
export const deactivateTakes = (sceneId: string) => edit((takes) => { for (const t of takes) if (t.sceneId === sceneId) t.active = false; });

// ---------- alignment (one at a time: Whisper is heavy) ----------
let queue: Promise<unknown> = Promise.resolve();
function alignTake(id: string) {
  const store = cur();
  const job = queue.then(async () => {
    const take = load().find((t) => t.id === id);
    if (!take) return;
    try {
      const { sc } = sceneOf(take.sceneId);
      const spoken = spokenOf(sc);
      const abs = store.p('media', take.file);
      const lv = await voiceLevels(abs);
      const text = spoken.join(' ');
      const language = /[а-яё]/i.test(text) ? 'russian' : /^[\x00-\x7f]+$/.test(text) ? 'english' : undefined;
      const heard = await transcribe(abs, { language });
      const { words, stats } = alignWords(spoken, heard.words, lv);
      if (!fs.existsSync(abs)) return; // deleted meanwhile
      writeWords(take.file, sc, words, 'aligned:' + heard.model, take.duration, { heard: heard.words });
      const t = await edit((takes) => { const x = takes.find((y) => y.id === id); if (x) x.align = { status: 'aligned', ...stats }; return x; });
      await probeMedia(take.file, true);
      if (t?.active) await activate(t);
      recomputeTiming();
    } catch (e: any) {
      await edit((takes) => { const x = takes.find((y) => y.id === id); if (x) x.align = { ...x.align, status: 'failed', error: String(e?.message || e).slice(0, 300) }; });
    }
  });
  queue = job.catch(() => {});
  return job;
}

/** what the teleprompter shows: the narrated scenes with their words to read and their takes */
export function prompterScenes(): PrompterScene[] {
  const p = cur().project;
  const takes = load();
  return getScript().scenes.map((sc, i) => {
    const hasItem = (sc.itemIds || []).some((id) => p.items.some((x) => x.id === id && x.label?.startsWith('VO')));
    return {
      id: sc.id, n: i + 1, title: sc.title, start: sc.start, duration: sc.duration, tokens: prompterTokens(speechOf(sc)),
      voiced: (hasItem ? (sc.vo?.source === 'mic' ? 'mic' : 'tts') : null) as PrompterScene['voiced'],
      takes: takes.filter((t) => t.sceneId === sc.id).sort((a, b) => a.at.localeCompare(b.at)),
    };
  }).filter((s) => s.tokens.length);
}

export const uploadDir = () => { const d = cur().p('.studio', 'voice', 'tmp'); fs.mkdirSync(d, { recursive: true }); return d; };
export const takeExt = (name: string, mime: string) => path.extname(name).toLowerCase() || (/wav/.test(mime) ? '.wav' : /mp4|aac|m4a/.test(mime) ? '.m4a' : /ogg/.test(mime) ? '.ogg' : '.webm');
