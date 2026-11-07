import fs from 'node:fs';
import type { Scene } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { getSettings } from '../config.ts';
import { readJson, writeJson } from '../util.ts';
import { tts, type TtsResult } from './elevenlabs.ts';
import { parseSpeech, paceReport, displayWords, type PaceReport } from './speech.ts';

/**
 * Natural, steady voice-over for a scene:
 *  - speaks the scene's speech text (markup → words, stress, pauses), captions keep the display text;
 *  - neighbours' speech goes in as previous/next text so intonation flows across scene cuts;
 *  - steady settings (higher stability, low style, fixed speed) and a seed per take;
 *  - every take is checked for pace (syllables/s per sentence vs the project's voice pace); a take that speeds up,
 *    slows down or has odd gaps is re-rolled; a scene that is uniformly too fast/slow gets a speed correction.
 */
export interface VoiceSceneOptions { voiceId?: string; modelId?: string; stability?: number; style?: number; speed?: number; maxTakes?: number; name?: string }
export interface VoiceSceneResult { take: TtsResult; report: PaceReport; takes: { file: string; rate: number; flagged: number; speed: number }[]; ref?: number }

const paceFile = () => cur().p('.studio', 'voice', 'pace.json');
type PaceStore = { scenes: Record<string, { rate: number; voiceId: string }> };
export function voicePace(voiceId?: string): number | undefined {
  const st = readJson<PaceStore>(paceFile(), { scenes: {} });
  const rates = Object.values(st.scenes).filter((x) => !voiceId || x.voiceId === voiceId).map((x) => x.rate).sort((a, b) => a - b);
  return rates.length ? rates[Math.floor(rates.length / 2)] : undefined;
}
function rememberPace(sceneId: string, rate: number, voiceId: string) {
  const st = readJson<PaceStore>(paceFile(), { scenes: {} });
  st.scenes[sceneId] = { rate, voiceId };
  writeJson(paceFile(), st);
}

export const speechOf = (sc?: Scene) => (sc ? sc.speech?.trim() || sc.voiceover?.trim() || '' : '');

export async function voiceScene(sc: Scene, scenes: Scene[], o: VoiceSceneOptions = {}): Promise<VoiceSceneResult> {
  const s = getSettings();
  const markup = speechOf(sc);
  const parsed = parseSpeech(markup);
  const i = scenes.indexOf(sc);
  const prev = i > 0 ? parseSpeech(speechOf(scenes[i - 1])).plain : undefined;
  const next = i >= 0 && i < scenes.length - 1 ? parseSpeech(speechOf(scenes[i + 1])).plain : undefined;
  const voiceId = o.voiceId || s.elevenlabsVoiceId || '';
  const ref = voicePace(voiceId);
  const maxTakes = Math.max(1, Math.min(4, o.maxTakes ?? s.voiceMaxTakes ?? 2));
  // steady delivery: stability ≥ 0.5 keeps the pace even; style low avoids rushed "acting"
  const base = { stability: o.stability ?? 0.55, style: o.style ?? 0.1 };
  let speed = o.speed ?? 1;
  const takes: VoiceSceneResult['takes'] = [];
  let best: { take: TtsResult; report: PaceReport; score: number } | null = null;
  const seed0 = (sc.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 97) % 100000;
  for (let k = 0; k < maxTakes; k++) {
    const take = await tts({ text: parsed.tts, voiceId: o.voiceId, modelId: o.modelId, name: o.name, speed: speed !== 1 ? +speed.toFixed(2) : undefined, ...base,
      previousText: prev, nextText: next, seed: seed0 + k * 7919, mapWords: (w) => displayWordsSafe(w, parsed) });
    const report = paceReport(take.spokenWords, ref);
    const overall = ref && report.rate ? Math.abs(report.rate - ref) / ref : 0;
    const score = report.flagged * 10 + overall * 20;
    takes.push({ file: take.file, rate: report.rate, flagged: report.flagged, speed });
    if (!best || score < best.score) best = { take, report, score };
    const steady = report.flagged === 0 && overall < 0.1;
    if (steady) break;
    // a uniformly fast/slow take: correct the speed for the next attempt (ElevenLabs range 0.7–1.2)
    if (ref && report.rate && overall >= 0.1 && report.flagged === 0) speed = Math.max(0.8, Math.min(1.15, speed * (ref / report.rate)));
  }
  rememberPace(sc.id, best!.report.rate, voiceId);
  return { take: best!.take, report: best!.report, takes, ref };
}

function displayWordsSafe(w: { text: string; start: number; end: number }[], parsed: ReturnType<typeof parseSpeech>) {
  try { return displayWords(w, parsed); } catch { return w; }
}

/** remove takes we didn't keep (only files this module generated for the scene) */
export function cleanupTakes(keep: string, takes: { file: string }[]) {
  for (const t of takes) if (t.file !== keep) { try { fs.rmSync(cur().p('media', t.file), { force: true }); } catch {} }
}
