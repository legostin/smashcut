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
        if (v) { info.width = v.width; info.height = v.height; info.codec = v.codec_name; (info as any).pixFmt = v.pix_fmt; }
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
    if (type === 'video' && needsProxy(info)) {
      const rel = `.studio/proxies/${file}.mp4`;
      if (fs.existsSync(store.p(rel)) && fs.statSync(store.p(rel)).mtimeMs >= stat.mtimeMs) { info.proxy = rel; info.proxyStatus = 'ready'; }
      else { info.proxyStatus = 'pending'; makeProxy(file, rel); }
    }
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

/** browsers choke on 4K / ProRes / HEVC / 10-bit — preview from a light H.264 copy instead */
function needsProxy(info: MediaInfo & { pixFmt?: string }) {
  const okCodec = ['h264', 'vp8', 'vp9', 'av1'].includes(info.codec || '');
  const okPix = ['yuv420p', 'yuvj420p'].includes(info.pixFmt || 'yuv420p');
  return !okCodec || !okPix || (info.width || 0) * (info.height || 0) > 2560 * 1440;
}

const proxyJobs = new Set<string>();
function makeProxy(file: string, rel: string) {
  if (proxyJobs.has(file)) return;
  proxyJobs.add(file);
  const store = cur();
  const out = store.p(rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  bus.send({ type: 'notice', level: 'info', text: `Готовлю превью-прокси для ${file}…` });
  run('ffmpeg', ['-y', '-v', 'error', '-i', store.p('media', file), '-vf', "scale='min(1280,iw)':-2:flags=bicubic,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out + '.tmp.mp4'])
    .then(async (r) => {
      proxyJobs.delete(file);
      if (r.code !== 0) { bus.send({ type: 'notice', level: 'error', text: `Прокси для ${file} не удалось: ${r.stderr.slice(-300)}` }); return; }
      fs.renameSync(out + '.tmp.mp4', out);
      await probeMedia(file, true);
    })
    .catch(() => proxyJobs.delete(file));
}
