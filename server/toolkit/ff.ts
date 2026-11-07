import { bin } from '../bin.ts';
// ffmpeg / ffprobe helpers shared by the toolkit ops: probing, alpha-aware decoding,
// encoder presets and a runner with progress + cancellation.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { uerr } from '../i18n.ts';
import { run } from '../util.ts';
import type { OpContext } from './registry.ts';

export interface Probe {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** the video stream carries alpha (VP9 alpha_mode, ProRes 4444, PNG/WebP RGBA…) */
  alpha: boolean;
  codec: string;
  pixFmt: string;
  sampleRate: number;
  /** audio channels (0 = no audio) */
  channels: number;
}

export async function probe(abs: string): Promise<Probe> {
  const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', abs]);
  if (r.code !== 0) throw uerr('Cannot read media file {file}: {error}', { file: path.basename(abs), error: r.stderr.trim().slice(-300) });
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s: any) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1);
  const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
  const rate = (s?: string) => { const [n, d] = String(s || '0/1').split('/').map(Number); return d ? n / d : n || 0; };
  const pixFmt = v?.pix_fmt || '';
  const alpha = !!v && (v.tags?.alpha_mode === '1' || v.tags?.ALPHA_MODE === '1' || /^(yuva|rgba|bgra|argb|abgr|ya|gbrap|pal8)/.test(pixFmt) || v.codec_name === 'prores' && /4444/.test(v.profile || ''));
  return {
    duration: Number(j.format?.duration) || Number(v?.duration) || Number(a?.duration) || 0,
    width: v?.width || 0,
    height: v?.height || 0,
    fps: rate(v?.avg_frame_rate) || rate(v?.r_frame_rate) || 30,
    hasVideo: !!v,
    hasAudio: !!a,
    alpha,
    codec: v?.codec_name || a?.codec_name || '',
    pixFmt,
    sampleRate: Number(a?.sample_rate) || 0,
    channels: Number(a?.channels) || 0,
  };
}

/** `-i` args for an input; VP9 with alpha must be decoded by libvpx or the alpha plane is dropped */
export function inputArgs(abs: string, info?: Pick<Probe, 'alpha' | 'codec'>): string[] {
  if (info?.alpha && info.codec === 'vp9') return ['-c:v', 'libvpx-vp9', '-i', abs];
  if (info?.alpha && info.codec === 'vp8') return ['-c:v', 'libvpx', '-i', abs];
  return ['-i', abs];
}

/** H.264 MP4 for opaque video; yuv420p needs even dimensions */
export const MP4 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
export const MP4_AUDIO = ['-c:a', 'aac', '-b:a', '192k'];
/** VP9 WebM with alpha (what the editor plays for transparent footage) */
export const WEBM_ALPHA = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '28', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1'];
export const WEBM_AUDIO = ['-c:a', 'libopus', '-b:a', '160k'];
/** ProRes 4444 with alpha (for NLEs: Premiere / Resolve / Final Cut) */
export const PRORES_4444 = ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0'];
export const PRORES_AUDIO = ['-c:a', 'pcm_s16le'];
export const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

/** encoder for a video op's output: keeps alpha (WebM VP9) when the source had it, else H.264 MP4 */
export function videoEncoder(alpha: boolean, withAudio: boolean) {
  return alpha
    ? { ext: 'webm', args: [...WEBM_ALPHA, ...(withAudio ? WEBM_AUDIO : ['-an'])], pixFmt: 'yuva420p' }
    : { ext: 'mp4', args: [...MP4, ...(withAudio ? MP4_AUDIO : ['-an'])], pixFmt: 'yuv420p' };
}

/** audio encoder that matches the source extension (lossless stays lossless) */
export function audioEncoder(srcExt: string) {
  const e = srcExt.toLowerCase().replace('.', '');
  if (e === 'wav') return { ext: 'wav', args: ['-c:a', 'pcm_s16le'] };
  if (e === 'flac') return { ext: 'flac', args: ['-c:a', 'flac'] };
  if (e === 'mp3') return { ext: 'mp3', args: ['-c:a', 'libmp3lame', '-q:a', '2'] };
  if (e === 'ogg') return { ext: 'ogg', args: ['-c:a', 'libopus', '-b:a', '160k'] };
  return { ext: 'm4a', args: ['-c:a', 'aac', '-b:a', '192k'] };
}

export interface FfOpts {
  /** expected output duration in seconds (for progress) */
  duration?: number;
  /** progress sub-range of this ffmpeg run within the whole op, default [0, 1] */
  range?: [number, number];
  stage?: string;
}

/** run ffmpeg with progress reporting; killed when the op is cancelled */
export function ffmpeg(ctx: OpContext, args: string[], o: FfOpts = {}): Promise<{ stderr: string }> {
  const [a, b] = o.range || [0, 1];
  if (o.stage) ctx.progress(a, o.stage);
  return new Promise((resolve, reject) => {
    if (ctx.signal.aborted) return reject(ctx.signal.reason);
    const p = spawn(bin('ffmpeg'), ['-hide_banner', '-nostdin', '-y', '-v', 'error', '-progress', 'pipe:1', '-nostats', ...args]);
    let err = '', buf = '';
    const kill = () => p.kill('SIGKILL');
    ctx.signal.addEventListener('abort', kill, { once: true });
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && o.duration) ctx.progress(a + (b - a) * Math.min(1, Number(m[1]) / 1e6 / o.duration));
      }
    });
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('error', (e) => { ctx.signal.removeEventListener('abort', kill); reject(e); });
    p.on('close', (code) => {
      ctx.signal.removeEventListener('abort', kill);
      if (ctx.signal.aborted) return reject(ctx.signal.reason);
      if (code === 0) { ctx.progress(b); resolve({ stderr: err }); }
      else reject(uerr('ffmpeg failed: {error}', { error: err.trim().split('\n').slice(-6).join(' | ').slice(-800) || 'exit ' + code }, 500));
    });
  });
}

/** ffmpeg with info-level logging, returning stderr (for analysis filters like loudnorm / silencedetect) */
export function ffmpegAnalyze(ctx: OpContext, args: string[], o: FfOpts = {}): Promise<string> {
  return ffmpeg(ctx, ['-v', 'info', ...args], o).then((r) => r.stderr);
}

/** "16:9" / "9:16" / "1.85" → ratio w/h */
export function parseAspect(s: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(s);
  const r = m ? Number(m[1]) / Number(m[2]) : Number(s);
  if (!Number.isFinite(r) || r <= 0.1 || r > 10) throw uerr('Aspect must look like 9:16, 1:1 or 1.85 (got {value})', { value: s });
  return r;
}
export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** '#rrggbb[aa]' → ffmpeg colour '0xRRGGBB[@a]' */
export function ffColor(hex: string) {
  const h = hex.replace('#', '');
  return h.length === 8 ? `0x${h.slice(0, 6)}@${(parseInt(h.slice(6), 16) / 255).toFixed(3)}` : `0x${h}`;
}
