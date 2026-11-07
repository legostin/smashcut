import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ExportJob, Item, Project } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { bus } from '../bus.ts';
import { nid, slug } from '../util.ts';
import { clipUrl, itemInput, renderClipFrames, renderItemSequence } from './clips.ts';
import { withPage } from './browser.ts';
import { renderMusic } from './music.ts';
import { extractVideoFrame } from '../media.ts';

const VISUAL = new Set(['video', 'graphics']);

/** visual items bottom → top that are visible at time t */
export function visualLayers(p: Project, t?: number): Item[] {
  const out: Item[] = [];
  for (const tr of [...p.tracks].reverse()) {
    if (!VISUAL.has(tr.kind) || tr.hidden) continue;
    const items = p.items.filter((i) => i.track === tr.id && (i.kind === 'clip' || i.kind === 'media' || (i.kind === 'generated' && i.generated?.output)) && (t == null || (t >= i.start && t < i.start + i.duration)));
    out.push(...items.sort((a, b) => a.start - b.start));
  }
  return out;
}

function mediaFile(i: Item) { return i.kind === 'generated' ? i.generated!.output! : i.ref; }
function isImage(f: string) { return /\.(png|jpe?g|webp|gif|svg)$/i.test(f); }

/** composite the whole timeline at project time t → PNG buffer (what the viewer shows) */
export async function compositeFrame(t: number): Promise<{ png: Buffer; errors: string[] }> {
  const store = cur();
  const p = store.project;
  const layers = visualLayers(p, t);
  const errors: string[] = [];
  const imgs: { src: string; item: Item; full: boolean }[] = [];
  for (const it of layers) {
    const local = t - it.start + it.in;
    if (it.kind === 'clip') {
      const r = await renderClipFrames(clipUrl(it.ref, itemInput(it, p)), { width: p.width, height: p.height }, [local]);
      errors.push(...r.errors.map((e) => `[${it.ref}] ${e}`));
      imgs.push({ src: 'data:image/png;base64,' + r.frames[0].toString('base64'), item: it, full: true });
    } else {
      const f = mediaFile(it);
      const src = store.p('media', f);
      if (!fs.existsSync(src)) continue;
      if (isImage(f)) {
        const ext = path.extname(f).slice(1).replace('jpg', 'jpeg').replace('svg', 'svg+xml');
        imgs.push({ src: `data:image/${ext};base64,` + fs.readFileSync(src).toString('base64'), item: it, full: false });
      } else {
        const out = store.p('.studio', 'frames', `v-${nid()}.png`);
        try {
          await extractVideoFrame(f, local, out);
          imgs.push({ src: 'data:image/png;base64,' + fs.readFileSync(out).toString('base64'), item: it, full: false });
        } catch (e) { errors.push((e as Error).message); }
        fs.rmSync(out, { force: true });
      }
    }
  }
  const png = await withPage({ width: p.width, height: p.height }, async (page) => {
    const html = `<body style="margin:0;width:${p.width}px;height:${p.height}px;overflow:hidden;position:relative;background:${p.background}">${imgs.map(({ src, item, full }) => {
      const tr = item.transform || {};
      const style = full
        ? `position:absolute;inset:0;width:100%;height:100%;opacity:${item.opacity ?? 1}`
        : `position:absolute;left:0;top:0;width:100%;height:100%;object-fit:${tr.fit || 'contain'};transform:translate(${tr.x || 0}px,${tr.y || 0}px) scale(${tr.scale ?? 1});opacity:${item.opacity ?? 1}`;
      return `<img style="${style}" src="${src}">`;
    }).join('')}</body>`;
    await page.setContent(html, { waitUntil: 'load' });
    return page.screenshot({ type: 'png' });
  });
  return { png, errors };
}

/** grid of images with captions → PNG (used for contact sheets, before/after) */
export async function sheet(cells: { png: Buffer; caption: string }[], opts: { cols?: number; width?: number; checker?: boolean; bg?: string } = {}) {
  const cols = opts.cols || Math.min(4, cells.length);
  const width = opts.width || 1600;
  return withPage({ width, height: 200 }, async (page) => {
    const bgCell = opts.checker !== false ? 'background:repeating-conic-gradient(#1d1d22 0 25%,#2a2a31 0 50%) 0 0/20px 20px' : `background:${opts.bg || '#000'}`;
    await page.setContent(`<body style="margin:0;background:#0b0b0d;font:600 15px/1.3 ui-monospace,monospace;color:#c9c9d1"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;padding:8px">${cells.map((c) => `<div><div style="${bgCell}"><img style="width:100%;display:block" src="data:image/png;base64,${c.png.toString('base64')}"></div><div style="padding:4px 2px">${c.caption}</div></div>`).join('')}</div></body>`, { waitUntil: 'load' });
    return page.screenshot({ type: 'png', fullPage: true });
  });
}

/** draw comment annotations (pin, rect, number) on a frame */
export async function annotate(png: Buffer, size: { width: number; height: number }, marks: { x: number; y: number; w?: number; h?: number; n: number; text: string }[]) {
  return withPage(size, async (page) => {
    await page.setContent(`<body style="margin:0;position:relative;width:${size.width}px;height:${size.height}px;overflow:hidden;font:700 28px system-ui">
      <img style="position:absolute;inset:0;width:100%;height:100%" src="data:image/png;base64,${png.toString('base64')}">
      ${marks.map((m) => `
        ${m.w && m.h ? `<div style="position:absolute;left:${m.x * 100}%;top:${m.y * 100}%;width:${m.w * 100}%;height:${m.h * 100}%;border:5px solid #ff2d55;border-radius:6px;box-shadow:0 0 0 3px rgba(0,0,0,.6)"></div>` : ''}
        <div style="position:absolute;left:${m.x * 100}%;top:${m.y * 100}%;transform:translate(-50%,-50%);width:54px;height:54px;border-radius:50%;background:#ff2d55;color:#fff;display:flex;align-items:center;justify-content:center;border:4px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.6)">${m.n}</div>
        <div style="position:absolute;left:calc(${m.x * 100}% + 40px);top:calc(${m.y * 100}% - 20px);max-width:40%;background:rgba(0,0,0,.82);color:#fff;padding:8px 14px;border-radius:8px;font:600 24px/1.25 system-ui">${escapeHtml(m.text)}</div>`).join('')}
    </body>`, { waitUntil: 'load' });
    return page.screenshot({ type: 'png' });
  });
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------------- export ----------------
export type ExportFormat = 'mp4' | 'prores' | 'webm' | 'gif';
export interface ExportOptions {
  from?: number;
  to?: number;
  name?: string;
  format?: ExportFormat;
  /** output scale (0.5 / 1 / 2) */
  scale?: number;
  quality?: 'high' | 'standard' | 'small';
  /** motion blur: sub-frames per frame (1 = off, 4–8 typical) */
  motionBlur?: number;
  /** transparent background (prores/webm only): drops the project background colour */
  transparent?: boolean;
}

const jobs = new Map<string, ExportJob>();
const aborts = new Map<string, { aborted: boolean; kill?: () => void }>();
export function getJobs() { return [...jobs.values()]; }
export function cancelExport(id: string) {
  const a = aborts.get(id);
  if (!a) return false;
  a.aborted = true;
  a.kill?.();
  return true;
}

export function startExport(opts: ExportOptions = {}): ExportJob {
  const store = cur();
  const p = store.project;
  const end = Math.max(0, ...p.items.map((i) => i.start + i.duration));
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(opts.to ?? (end || p.duration), end || p.duration);
  const job: ExportJob = { id: nid(), status: 'running', progress: 0, stage: 'подготовка', from, to };
  jobs.set(job.id, job);
  const signal = { aborted: false } as { aborted: boolean; kill?: () => void };
  aborts.set(job.id, signal);
  const emit = () => bus.send({ type: 'export', job: { ...job } });
  emit();
  // remember the unfinished export so it resumes after an editor restart (cached frames are reused)
  const activeFile = store.p('.studio', 'exports', 'active.json');
  fs.mkdirSync(path.dirname(activeFile), { recursive: true });
  fs.writeFileSync(activeFile, JSON.stringify({ ...opts, from, to }));
  (async () => {
    try {
      job.output = await exportRange({ ...opts, from, to, name: opts.name || p.name }, (stage, prog) => { job.stage = stage; job.progress = prog; emit(); }, signal);
      job.status = 'done'; job.progress = 1; job.stage = 'готово';
    } catch (e) {
      job.status = 'error';
      job.error = signal.aborted ? 'Отменено' : (e as Error).message.slice(-2000);
    }
    aborts.delete(job.id);
    try { fs.rmSync(activeFile, { force: true }); } catch {}
    emit();
  })();
  return job;
}

/** resume an export that was running when the editor stopped */
export function resumeExport() {
  const f = cur().p('.studio', 'exports', 'active.json');
  if (!fs.existsSync(f)) return null;
  try {
    const opts = JSON.parse(fs.readFileSync(f, 'utf8'));
    bus.send({ type: 'notice', level: 'info', text: 'Продолжаю экспорт, прерванный перезапуском (готовые кадры берутся из кэша)' });
    return startExport(opts);
  } catch { fs.rmSync(f, { force: true }); return null; }
}

const QUALITY = { high: 15, standard: 19, small: 26 } as const;

export async function exportRange(o: ExportOptions & { from: number; to: number; name: string }, progress: (stage: string, p: number) => void = () => {}, signal: { aborted: boolean; kill?: () => void } = { aborted: false }): Promise<string> {
  const store = cur();
  const p = store.project;
  const { from, to } = o;
  const format: ExportFormat = o.format || 'mp4';
  const alphaOut = (format === 'prores' || format === 'webm') && !!o.transparent;
  const N = Math.max(1, Math.min(16, Math.round(o.motionBlur || 1)));
  const scale = o.scale && o.scale > 0 ? o.scale : 1;
  const D = Math.max(1 / p.fps, to - from);
  const W = p.width, H = p.height, fps = format === 'gif' ? Math.min(p.fps, 20) : p.fps;
  const check = () => { if (signal.aborted) throw new Error('cancelled'); };

  // clip an item to the export window
  const win = (it: Item) => {
    const s = Math.max(it.start, from), e = Math.min(it.start + it.duration, to);
    if (e <= s) return null;
    return { start: s - from, dur: e - s, srcIn: it.in + (s - it.start) };
  };

  // 1) music
  progress('музыка', 0.02);
  for (const it of p.items.filter((i) => i.kind === 'music' && win(i))) { check(); await renderMusic(it.ref); }

  // 2) clip sequences (with sub-frames for motion blur)
  // transparent export = graphics only (to composite over footage in another editor)
  const layers = visualLayers(p).filter((i) => win(i) && (!alphaOut || i.kind === 'clip'));
  const clipItems = layers.filter((i) => i.kind === 'clip');
  const seqs = new Map<string, { dir: string; count: number; subframes: number }>();
  const totalFrames = clipItems.reduce((a, i) => a + Math.round(i.duration * p.fps) * N, 0) || 1;
  const prog = new Map<string, number>();
  await Promise.all(clipItems.map(async (it) => {
    const r = await renderItemSequence(it, p, (d) => {
      prog.set(it.id, d);
      const sum = [...prog.values()].reduce((a, b) => a + b, 0);
      progress(`графика ${sum}/${totalFrames} кадров${N > 1 ? ` (motion blur ×${N})` : ''}`, 0.04 + 0.62 * (sum / totalFrames));
    }, { subframes: N, signal });
    seqs.set(it.id, r);
  }));
  check();

  // 3) ffmpeg graph
  progress('кодирование', 0.66);
  const args: string[] = ['-y', '-v', 'error', '-progress', 'pipe:1', '-nostats'];
  const filters: string[] = [];
  let n = 0;
  // note: lavfi `color=c=black@0` is NOT transparent — zero the alpha explicitly
  const bg = alphaOut ? 'black' : p.background.replace('#', '0x');
  args.push('-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:r=${p.fps}:d=${D.toFixed(3)}`);
  let base = alphaOut ? '[0:v]format=rgba,colorchannelmixer=aa=0[base0]' : '[0:v]format=rgba[base0]';
  filters.push(base);
  base = '[base0]';
  n++;
  let li = 0;
  for (const it of layers) {
    const w = win(it)!;
    const op = it.opacity ?? 1;
    const idx = n++;
    let chain = '';
    if (it.kind === 'clip') {
      const seq = seqs.get(it.id)!;
      const S = seq.subframes;
      const startNum = Math.round((w.srcIn - it.in) * p.fps) * S;
      args.push('-framerate', String(p.fps * S), '-start_number', String(startNum), '-i', path.join(seq.dir, '%06d.png'));
      chain = `[${idx}:v]format=rgba`;
      // accumulate sub-frames in premultiplied space (no dark fringes), keep the last sample of each group
      if (S > 1) chain += `,premultiply=inplace=1,tmix=frames=${S},select='eq(mod(n\\,${S})\\,${S - 1})',unpremultiply=inplace=1`;
      chain += `,setpts=PTS-STARTPTS,fps=${p.fps},trim=duration=${w.dur.toFixed(3)},setpts=PTS-STARTPTS+${w.start.toFixed(3)}/TB`;
    } else {
      const f = mediaFile(it);
      const src = store.p('media', f);
      const tr = it.transform || {};
      if (isImage(f)) args.push('-loop', '1', '-framerate', String(p.fps), '-t', w.dur.toFixed(3), '-i', src);
      else args.push('-ss', w.srcIn.toFixed(3), '-t', w.dur.toFixed(3), '-i', src);
      const fit = tr.fit === 'cover' ? 'increase' : 'decrease';
      const s = tr.scale ?? 1;
      chain = `[${idx}:v]fps=${p.fps},scale=${W}:${H}:force_original_aspect_ratio=${fit}:flags=lanczos${s !== 1 ? `,scale=iw*${s}:ih*${s}:flags=lanczos` : ''},format=rgba,setpts=PTS-STARTPTS+${w.start.toFixed(3)}/TB`;
    }
    if (op < 1) chain += `,colorchannelmixer=aa=${op}`;
    const tr = it.transform || {};
    const x = it.kind === 'clip' ? '0' : `(main_w-overlay_w)/2+${tr.x || 0}`;
    const y = it.kind === 'clip' ? '0' : `(main_h-overlay_h)/2+${tr.y || 0}`;
    filters.push(`${chain}[l${li}]`);
    filters.push(`${base}[l${li}]overlay=x=${x}:y=${y}:format=rgb:eof_action=pass:enable='between(t,${w.start.toFixed(3)},${(w.start + w.dur).toFixed(3)})'[b${li}]`);
    base = `[b${li}]`;
    li++;
  }
  const outW = Math.round((W * scale) / 2) * 2, outH = Math.round((H * scale) / 2) * 2;
  const scaleF = scale !== 1 ? `scale=${outW}:${outH}:flags=lanczos,` : '';
  // colour: convert RGB → YUV with BT.709 (HD) and tag it, so every player shows what the preview showed
  if (format === 'mp4') filters.push(`${base}${scaleF}scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[vout]`);
  else if (format === 'prores') filters.push(`${base}${scaleF}scale=out_color_matrix=bt709:out_range=tv,format=${alphaOut ? 'yuva444p10le' : 'yuv422p10le'},setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[vout]`);
  else if (format === 'webm') filters.push(`${base}${scaleF}scale=out_color_matrix=bt709:out_range=tv,format=${alphaOut ? 'yuva420p' : 'yuv420p'},setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[vout]`);
  else filters.push(`${base}${scaleF}fps=${fps},split[g1][g2];[g1]palettegen=stats_mode=diff:max_colors=256[pal];[g2][pal]paletteuse=dither=sierra2_4a:diff_mode=rectangle[vout]`);

  // audio
  const audioIns: string[] = [];
  if (format !== 'gif') {
    const mutedTracks = new Set(p.tracks.filter((t) => t.muted).map((t) => t.id));
    for (const it of p.items) {
      if (mutedTracks.has(it.track)) continue;
      const w = win(it);
      if (!w) continue;
      let src: string | null = null;
      if (it.kind === 'music') {
        const info = store.musicInfo(it.ref);
        if (info.rendered) src = store.p(info.rendered);
      } else if (it.kind === 'media' || it.kind === 'generated') {
        const f = mediaFile(it);
        const mi = store.mediaInfo(f);
        if (mi.type === 'audio' || (mi.type === 'video' && mi.hasAudio)) src = store.p('media', f);
      }
      if (!src || !fs.existsSync(src)) continue;
      const idx = n++;
      args.push('-ss', w.srcIn.toFixed(3), '-t', w.dur.toFixed(3), '-i', src);
      const ms = Math.round(w.start * 1000);
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${it.volume ?? 1},adelay=${ms}:all=1[a${audioIns.length}]`);
      audioIns.push(`[a${audioIns.length}]`);
    }
    if (audioIns.length) filters.push(`${audioIns.join('')}amix=inputs=${audioIns.length}:normalize=0:dropout_transition=0,alimiter=limit=0.97,apad,atrim=0:${D.toFixed(3)}[aout]`);
    else {
      args.push('-f', 'lavfi', '-t', D.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
      filters.push(`[${n++}:a]anull[aout]`);
    }
  }

  const outDir = store.p('.studio', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = { mp4: 'mp4', prores: 'mov', webm: 'webm', gif: 'gif' }[format];
  const out = path.join(outDir, `${slug(o.name)}-${stamp}${alphaOut ? '-alpha' : ''}.${ext}`);
  const filterFile = path.join(store.p('.studio'), `filter-${nid()}.txt`);
  fs.writeFileSync(filterFile, filters.join(';\n'));
  args.push('-/filter_complex', filterFile, '-map', '[vout]');
  if (format !== 'gif') args.push('-map', '[aout]');
  const tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  if (format === 'mp4') args.push('-c:v', 'libx264', '-preset', o.quality === 'small' ? 'medium' : 'slow', '-crf', String(QUALITY[o.quality || 'standard']), '-profile:v', 'high', ...tags, '-r', String(p.fps), '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart');
  if (format === 'prores') args.push('-c:v', 'prores_ks', '-profile:v', alphaOut ? '4444' : '3', '-vendor', 'apl0', ...(alphaOut ? ['-alpha_bits', '16'] : []), ...tags, '-r', String(p.fps), '-c:a', 'pcm_s16le');
  if (format === 'webm') args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(o.quality === 'small' ? 38 : o.quality === 'high' ? 24 : 30), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', ...(alphaOut ? ['-auto-alt-ref', '0'] : []), ...tags, '-r', String(p.fps), '-c:a', 'libopus', '-b:a', '192k');
  if (format === 'gif') args.push('-loop', '0');
  args.push('-t', D.toFixed(3), out);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    signal.kill = () => proc.kill('SIGKILL');
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.stdout.on('data', (d) => {
      const m = /out_time_ms=(\d+)/.exec(String(d));
      if (m) progress('кодирование', 0.66 + 0.34 * Math.min(1, Number(m[1]) / 1e6 / D));
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(signal.aborted ? 'cancelled' : 'ffmpeg failed: ' + err.slice(-3000)))));
  });
  fs.rmSync(filterFile, { force: true });
  if (signal.aborted) { fs.rmSync(out, { force: true }); throw new Error('cancelled'); }
  return path.relative(store.dir, out).split(path.sep).join('/');
}
