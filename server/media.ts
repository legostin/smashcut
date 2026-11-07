import fs from 'node:fs';
import path from 'node:path';
import type { MediaInfo } from '../shared/types.ts';
import { cur, MEDIA_EXT } from './project.ts';
import { bus } from './bus.ts';
import { run, runOk, writeJson, readJson } from './util.ts';
import { decodePcm, computePeaks, analyzePcm, type AudioAnalysis } from './audio/analyze.ts';
import { transcribe, type Transcript } from './audio/transcribe.ts';
import { recomputeTiming } from './timing.ts';

const inflight = new Map<string, Promise<MediaInfo>>();

export function probeMedia(file: string, force = false): Promise<MediaInfo> {
  const key = file;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    const store = cur();
    const src = store.p('media', file);
    const metaFile = store.p('.studio', 'media', file + '.json');
    const stat = fs.statSync(src);
    const prev = readJson<(MediaInfo & { mtime?: number }) | null>(metaFile, null);
    if (!force && prev && prev.mtime === stat.mtimeMs) return prev;
    const type = MEDIA_EXT[path.extname(file).toLowerCase()];
    const info: MediaInfo & { mtime: number } = { file, type, duration: 0, mtime: stat.mtimeMs };
    if (type !== 'image' || file.endsWith('.gif')) {
      const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', src]);
      if (r.code === 0) {
        const j = JSON.parse(r.stdout);
        info.duration = Number(j.format?.duration) || 0;
        const v = (j.streams || []).find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
        const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
        if (v) { info.width = v.width; info.height = v.height; }
        info.hasAudio = !!a;
      }
    }
    if (type === 'image') {
      const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', src]);
      try { const s = JSON.parse(r.stdout).streams[0]; info.width = s.width; info.height = s.height; } catch {}
      info.duration = 5;
      info.thumb = `media/${file}`;
    }
    const thumbRel = `.studio/media/${file}.jpg`;
    if (type === 'video') {
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.min(1, info.duration / 3)), '-i', src, '-frames:v', '1', '-vf', 'scale=320:-2', store.p(thumbRel)]);
      if (fs.existsSync(store.p(thumbRel))) info.thumb = thumbRel;
    }
    if (info.hasAudio || type === 'audio') {
      try {
        const pcm = await decodePcm(src, 22050);
        writeJson(store.p('.studio', 'media', file + '.peaks.json'), computePeaks(pcm, 22050, 50));
        info.peaks = `.studio/media/${file}.peaks.json`;
        if (type === 'audio') {
          writeJson(store.p('.studio', 'analysis', file + '.json'), analyzePcm(pcm, 22050));
          info.analysis = `.studio/analysis/${file}.json`;
        }
      } catch (e) { /* no audio */ }
    }
    if (fs.existsSync(store.p('.studio', 'transcripts', file + '.json'))) info.transcript = `.studio/transcripts/${file}.json`;
    writeJson(metaFile, info);
    bus.send({ type: 'media', media: info });
    if (info.analysis) recomputeTiming();
    return info;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function analyzeMedia(file: string): Promise<AudioAnalysis> {
  const store = cur();
  const out = store.p('.studio', 'analysis', file + '.json');
  const prev = readJson<AudioAnalysis | null>(out, null);
  if (prev) return prev;
  const pcm = await decodePcm(store.p('media', file), 22050);
  const a = analyzePcm(pcm, 22050);
  writeJson(out, a);
  await probeMedia(file, true);
  recomputeTiming();
  return a;
}

const transcribing = new Map<string, Promise<Transcript>>();
export function transcribeMedia(file: string, language?: string): Promise<Transcript> {
  if (transcribing.has(file)) return transcribing.get(file)!;
  const p = (async () => {
    const store = cur();
    const out = store.p('.studio', 'transcripts', file + '.json');
    const prev = readJson<Transcript | null>(out, null);
    if (prev) return prev;
    bus.send({ type: 'notice', level: 'info', text: `Transcribing ${file}… (first run downloads the Whisper model)` });
    const t = await transcribe(store.p('media', file), { language });
    writeJson(out, t);
    await probeMedia(file, true);
    recomputeTiming();
    bus.send({ type: 'notice', level: 'info', text: `Transcript ready: ${file} (${t.words.length} words)` });
    return t;
  })().finally(() => transcribing.delete(file));
  transcribing.set(file, p);
  return p;
}

export async function extractVideoFrame(file: string, t: number, out: string) {
  await runOk('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.max(0, t)), '-i', cur().p('media', file), '-frames:v', '1', out]);
  return out;
}
