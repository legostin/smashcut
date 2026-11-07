import { uerr } from '../i18n.ts';
import fs from 'node:fs';
import path from 'node:path';
import type { Voice } from '../../shared/types.ts';
import { getSettings } from '../config.ts';
import { cur } from '../project.ts';
import { slug, sha1, writeJson } from '../util.ts';

/** ElevenLabs text-to-speech with character timestamps → mp3 in media/ + word-level transcript. */
const API = 'https://api.elevenlabs.io/v1';
export const DEFAULT_MODEL = 'eleven_multilingual_v2';
export const MODELS = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2 — best quality, 29 languages' },
  { id: 'eleven_v3', name: 'Eleven v3 — most expressive' },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5 — fast & cheap' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5' },
];

export function apiKey() {
  return getSettings().elevenlabsKey || process.env.ELEVENLABS_API_KEY || '';
}
function need() {
  const k = apiKey();
  if (!k) throw uerr('No ElevenLabs key: add it in Settings (or set ELEVENLABS_API_KEY).');
  return k;
}

async function call(pathname: string, init: RequestInit = {}) {
  const res = await fetch(API + pathname, { ...init, headers: { 'xi-api-key': need(), ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const j: any = await res.json(); msg = j?.detail?.message || j?.detail?.status || (typeof j?.detail === 'string' ? j.detail : JSON.stringify(j?.detail || j)); } catch {}
    throw Object.assign(new Error('ElevenLabs: ' + msg), { statusCode: res.status === 401 ? 400 : 502 });
  }
  return res;
}

let voicesCache: { key: string; at: number; voices: Voice[] } | null = null;
export async function listVoices(force = false): Promise<Voice[]> {
  const key = need();
  if (!force && voicesCache && voicesCache.key === key && Date.now() - voicesCache.at < 10 * 60_000) return voicesCache.voices;
  const j: any = await (await call('/voices')).json();
  const voices: Voice[] = (j.voices || []).map((v: any) => ({
    id: v.voice_id, name: v.name, category: v.category, labels: v.labels || {}, preview: v.preview_url,
    languages: (v.verified_languages || []).map((l: any) => l.language).filter(Boolean),
  }));
  voicesCache = { key, at: Date.now(), voices };
  return voices;
}

export interface TtsOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  name?: string;
  stability?: number;
  similarity?: number;
  style?: number;
  speed?: number;
  previousText?: string;
  nextText?: string;
}
export interface TtsResult { file: string; duration: number; words: { text: string; start: number; end: number }[]; cached: boolean; voiceId: string; modelId: string }

/** generate speech; cached by (text, voice, model, settings) */
export async function tts(o: TtsOptions): Promise<TtsResult> {
  const store = cur();
  const s = getSettings();
  const voiceId = o.voiceId || s.elevenlabsVoiceId;
  if (!voiceId) throw uerr('No ElevenLabs voice selected: choose one in Settings.');
  const modelId = o.modelId || s.elevenlabsModel || DEFAULT_MODEL;
  const text = o.text.trim();
  if (!text) throw uerr('Nothing to voice: the text is empty');
  const voiceSettings = { stability: o.stability ?? 0.45, similarity_boost: o.similarity ?? 0.8, style: o.style ?? 0.15, use_speaker_boost: true, ...(o.speed ? { speed: o.speed } : {}) };
  const key = sha1(JSON.stringify({ text, voiceId, modelId, voiceSettings, p: o.previousText, n: o.nextText }));
  const file = `vo-${slug(o.name || text.slice(0, 32))}-${key.slice(0, 6)}.mp3`;
  const dst = store.p('media', file);
  const trFile = store.p('.studio', 'transcripts', file + '.json');
  if (fs.existsSync(dst) && fs.existsSync(trFile)) {
    const tr = JSON.parse(fs.readFileSync(trFile, 'utf8'));
    return { file, duration: tr.duration, words: tr.words, cached: true, voiceId, modelId };
  }
  const body: any = { text, model_id: modelId, voice_settings: voiceSettings };
  if (o.previousText) body.previous_text = o.previousText;
  if (o.nextText) body.next_text = o.nextText;
  const res = await call(`/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', body: JSON.stringify(body) });
  const j: any = await res.json();
  if (!j.audio_base64) throw uerr('ElevenLabs returned an empty response');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(j.audio_base64, 'base64'));
  const al = j.alignment || j.normalized_alignment;
  const words = al ? alignmentToWords(al.characters, al.character_start_times_seconds, al.character_end_times_seconds) : [];
  const duration = al?.character_end_times_seconds?.length ? al.character_end_times_seconds[al.character_end_times_seconds.length - 1] : 0;
  writeJson(trFile, { text, words, model: `elevenlabs:${modelId}`, voiceId, duration });
  return { file, duration, words, cached: false, voiceId, modelId };
}

export function alignmentToWords(chars: string[], starts: number[], ends: number[]) {
  const words: { text: string; start: number; end: number }[] = [];
  let buf = '', ws = 0, we = 0;
  const flush = () => { const t = buf.trim(); if (t) words.push({ text: t, start: +ws.toFixed(3), end: +we.toFixed(3) }); buf = ''; };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) { flush(); continue; }
    if (!buf) ws = starts[i];
    buf += c;
    we = ends[i];
  }
  flush();
  return words;
}
