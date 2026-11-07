import { msg, fill } from '../i18n.ts';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ExportJob, Item, Project } from '../../shared/types.ts';
import { cur, pbase } from '../project.ts';
import { bus } from '../bus.ts';
import { nid, slug, sha1, runOk } from '../util.ts';
import { bin, filterComplexFileArgs } from '../bin.ts';
import { BASE_URL, getSettings } from '../config.ts';

import { withPage } from './browser.ts';
import { renderMusic } from './music.ts';


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

// ---------------- browser compositor (same Player as the editor) ----------------
interface Manifest { project: Project; frames: Record<string, { base: string; srcIn: number; fps: number; count: number }>; transparent?: boolean; clips: unknown[]; music: unknown[]; media: unknown[] }
const manifests = new Map<string, Manifest>();
export function getManifest(id: string) { return manifests.get(id); }

/** extract JPEG frames of a video item for the window [srcIn, srcIn+dur] (cached by content) */
async function videoFrames(it: Item, p: Project, srcIn: number, dur: number) {
  const store = cur();
  const f = mediaFile(it);
  const src = store.p('media', f);
  const st = fs.statSync(src);
  const key = sha1(JSON.stringify([f, st.mtimeMs, +srcIn.toFixed(3), +dur.toFixed(3), p.fps, p.width, p.height]));
  const rel = `.studio/cache/vframes/${key}`;
  const dir = store.p(rel);
  const doneFile = path.join(dir, '.done');
  if (!fs.existsSync(doneFile)) {
    fs.mkdirSync(dir, { recursive: true });
    await runOk('ffmpeg', ['-y', '-v', 'error', '-ss', srcIn.toFixed(3), '-t', Math.max(1 / p.fps, dur).toFixed(3), '-i', src,
      '-vf', `fps=${p.fps},scale=${p.width}:${p.height}:force_original_aspect_ratio=decrease:flags=lanczos`, '-q:v', '2', '-start_number', '1', path.join(dir, '%06d.jpg')]);
    fs.writeFileSync(doneFile, '1');
  }
  const count = fs.readdirSync(dir).filter((x) => x.endsWith('.jpg')).length;
  return { base: `${pbase()}/${rel}`, srcIn, fps: p.fps, count };
}

/** build a render manifest for the time window [from, to] */
async function makeManifest(from: number, to: number, opts: { transparent?: boolean } = {}): Promise<string> {
  const store = cur();
  const p0 = store.project;
  // transparent output = graphics only (to composite over footage elsewhere)
  // only layers that touch the window are mounted in the renderer (fast single frames)
  const touches = (i: Item) => i.start < to + 0.25 && i.start + i.duration > from - 0.25;
  const project: Project = { ...p0, items: p0.items.filter((i) => touches(i) && (!opts.transparent || i.kind === 'clip')) };
  const frames: Manifest['frames'] = {};
  for (const it of visualLayers(project)) {
    if (it.kind !== 'media' && it.kind !== 'generated') continue;
    const f = mediaFile(it);
    if (isImage(f)) continue;
    const s = Math.max(it.start, from), e = Math.min(it.start + it.duration, to);
    if (e < s) continue;
    frames[it.id] = await videoFrames(it, project, it.in + (s - it.start), e - s + 1 / project.fps);
  }
  const id = nid();
  manifests.set(id, { project, frames, transparent: opts.transparent, clips: store.listClips(), music: store.listMusic(), media: store.listMedia() });
  setTimeout(() => manifests.delete(id), 6 * 3600_000);
  return id;
}

/** open the renderer page for a manifest and run fn with a frame grabber */
async function withRenderer<T>(manifestId: string, size: { width: number; height: number }, fn: (seek: (t: number) => Promise<void>, grab: (fmt: 'png' | 'jpeg') => Promise<Buffer>, errors: string[]) => Promise<T>): Promise<T> {
  return withPage(size, async (page, errors) => {
    await page.goto(`${BASE_URL}/render.html?m=${manifestId}&p=${cur().id}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => (window as any).__render, null, { timeout: 20000 });
    await page.evaluate(() => (window as any).__render.ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const grab = async (fmt: 'png' | 'jpeg') => Buffer.from((await cdp.send('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpeg' ? 95 : undefined, optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false })).data, 'base64');
    const seek = (t: number) => page.evaluate((t) => (window as any).__render.seek(t), t);
    return fn(seek, grab, errors);
  });
}

/** composite the whole timeline at project time t → PNG (exactly what the viewer and export show) */
export async function compositeFrame(t: number): Promise<{ png: Buffer; errors: string[] }> {
  const p = cur().project;
  const id = await makeManifest(t, t + 1 / p.fps);
  try {
    return await withRenderer(id, { width: p.width, height: p.height }, async (seek, grab, errors) => {
      await seek(t);
      return { png: await grab('png'), errors };
    });
  } finally { manifests.delete(id); }
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
/** export jobs of the current project */
export function getJobs() { const id = cur().id; return [...jobs.values()].filter((j) => !j.project || j.project === id); }
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
  const job: ExportJob = { id: nid(), project: store.id, status: 'running', progress: 0, stage: 'preparing', stageKey: 'preparing', from, to };
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
      job.output = await exportRange({ ...opts, from, to, name: opts.name || p.name }, (stage, prog, params) => { job.stage = fill(stage, params); job.stageKey = stage; job.stageParams = params; job.progress = prog; emit(); }, signal);
      job.status = 'done'; job.progress = 1; job.stage = 'done'; job.stageKey = 'done'; job.stageParams = undefined;
    } catch (e) {
      job.status = 'error';
      job.error = signal.aborted ? 'Cancelled' : (e as Error).message.slice(-2000);
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
    bus.send({ type: 'notice', level: 'info', ...msg('Resuming the export interrupted by a restart (finished frames come from the cache)') });
    return startExport(opts);
  } catch { fs.rmSync(f, { force: true }); return null; }
}

const QUALITY = { high: 15, standard: 19, small: 26 } as const;

export async function exportRange(o: ExportOptions & { from: number; to: number; name: string }, progress: (stage: string, p: number, params?: Record<string, string | number>) => void = () => {}, signal: { aborted: boolean; kill?: () => void } = { aborted: false }): Promise<string> {
  const store = cur();
  const p = store.project;
  const { from, to } = o;
  const format: ExportFormat = o.format || 'mp4';
  const alphaOut = (format === 'prores' || format === 'webm') && !!o.transparent;
  const N = Math.max(1, Math.min(16, Math.round(o.motionBlur || 1)));
  const shutter = 0.5;
  const scale = o.scale && o.scale > 0 ? o.scale : 1;
  const D = Math.max(1 / p.fps, to - from);
  const fps = p.fps;
  const check = () => { if (signal.aborted) throw new Error('cancelled'); };

  // 1) music + video frames
  progress('music', 0.02);
  const inWin = (it: Item) => it.start < to && it.start + it.duration > from;
  for (const it of p.items.filter((i) => i.kind === 'music' && inWin(i))) { check(); await renderMusic(it.ref); }
  progress('video frames', 0.04);
  const manifestId = await makeManifest(from, to, { transparent: alphaOut });
  check();

  // 2) compose every frame with the editor's own Player (parallel pages, resumable)
  const total = Math.max(1, Math.round(D * fps)) * N;
  const ext = alphaOut || format === 'gif' ? 'png' : 'jpg';
  const workDir = store.p('.studio', 'cache', 'composite', sha1(JSON.stringify({ from, to, N, alphaOut, ext, p: JSON.stringify(p), m: manifests.get(manifestId)?.frames, design: fs.existsSync(store.p('design.json')) ? fs.readFileSync(store.p('design.json'), 'utf8') : '' })));
  fs.mkdirSync(workDir, { recursive: true });
  const timeOf = (j: number) => from + Math.floor(j / N) / fps + (N > 1 ? ((j % N) / N) * (shutter / fps) : 0);
  const workers = Math.max(1, getSettings().renderWorkers);
  const chunk = Math.ceil(total / workers);
  let done = 0;
  const report = () => progress(N > 1 ? 'frames {done}/{total} (motion blur ×{n})' : 'frames {done}/{total}', 0.06 + 0.64 * (done / total), { done, total, n: N });
  const renderChunk = async (a: number, b: number, attempt = 0): Promise<void> => {
    let s0 = a;
    while (s0 < b && fs.existsSync(path.join(workDir, `${String(s0).padStart(6, '0')}.${ext}`))) { s0++; if (attempt === 0) done++; }
    if (s0 >= b) return;
    try {
      await withRenderer(manifestId, { width: p.width, height: p.height }, async (seek, grab) => {
        for (let j = s0; j < b; j++) {
          check();
          await seek(timeOf(j));
          const buf = await grab(ext === 'png' ? 'png' : 'jpeg');
          const f = path.join(workDir, `${String(j).padStart(6, '0')}.${ext}`);
          fs.writeFileSync(f + '.tmp', buf);
          fs.renameSync(f + '.tmp', f);
          done++;
          if (done % 5 === 0) report();
        }
      });
    } catch (e) {
      if ((e as Error).message === 'cancelled' || attempt >= 2) throw e;
      return renderChunk(a, b, attempt + 1);
    }
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => renderChunk(w * chunk, Math.min(total, (w + 1) * chunk))));
  manifests.delete(manifestId);
  check();

  // 3) encode (+ audio mix with fades)
  progress('encoding', 0.72);
  const args: string[] = ['-y', '-v', 'error', '-progress', 'pipe:1', '-nostats'];
  const filters: string[] = [];
  args.push('-framerate', String(fps * N), '-start_number', '0', '-i', path.join(workDir, `%06d.${ext}`));
  let v = '[0:v]format=rgba';
  if (N > 1) v += `${alphaOut ? ',premultiply=inplace=1' : ''},tmix=frames=${N},select='eq(mod(n\\,${N})\\,${N - 1})'${alphaOut ? ',unpremultiply=inplace=1' : ''},setpts=PTS-STARTPTS,fps=${fps}`;
  const outW = Math.round((p.width * scale) / 2) * 2, outH = Math.round((p.height * scale) / 2) * 2;
  if (scale !== 1) v += `,scale=${outW}:${outH}:flags=lanczos`;
  const tags709 = ',setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';
  if (format === 'mp4') filters.push(`${v},scale=out_color_matrix=bt709:out_range=tv,format=yuv420p${tags709}[vout]`);
  else if (format === 'prores') filters.push(`${v},scale=out_color_matrix=bt709:out_range=tv,format=${alphaOut ? 'yuva444p10le' : 'yuv422p10le'}${tags709}[vout]`);
  else if (format === 'webm') filters.push(`${v},scale=out_color_matrix=bt709:out_range=tv,format=${alphaOut ? 'yuva420p' : 'yuv420p'}${tags709}[vout]`);
  else filters.push(`${v},fps=${Math.min(fps, 20)},split[g1][g2];[g1]palettegen=stats_mode=diff:max_colors=256[pal];[g2][pal]paletteuse=dither=sierra2_4a:diff_mode=rectangle[vout]`);

  let n = 1;
  const audioIns: string[] = [];
  if (format !== 'gif') {
    const mutedTracks = new Set(p.tracks.filter((t) => t.muted).map((t) => t.id));
    for (const it of p.items) {
      if (mutedTracks.has(it.track) || !inWin(it)) continue;
      const s = Math.max(it.start, from), e = Math.min(it.start + it.duration, to);
      const w = { start: s - from, dur: e - s, srcIn: it.in + (s - it.start) };
      let src: string | null = null;
      if (it.kind === 'music') { const info = store.musicInfo(it.ref); if (info.rendered) src = store.p(info.rendered); }
      else if (it.kind === 'media' || it.kind === 'generated') {
        const f = mediaFile(it);
        const mi = store.mediaInfo(f);
        if (mi.type === 'audio' || (mi.type === 'video' && mi.hasAudio)) src = store.p('media', f);
      }
      if (!src || !fs.existsSync(src)) continue;
      const idx = n++;
      args.push('-ss', w.srcIn.toFixed(3), '-t', w.dur.toFixed(3), '-i', src);
      const ms = Math.round(w.start * 1000);
      filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=eval=frame:volume='${gainExpr(it, s - it.start)}',adelay=${ms}:all=1[a${audioIns.length}]`);
      audioIns.push(`[a${audioIns.length}]`);
    }
    if (audioIns.length) filters.push(`${audioIns.join('')}amix=inputs=${audioIns.length}:normalize=0:dropout_transition=0,alimiter=limit=0.97,apad,atrim=0:${D.toFixed(3)}[aout]`);
    else { args.push('-f', 'lavfi', '-t', D.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'); filters.push(`[${n++}:a]anull[aout]`); }
  }

  const outDir = store.p('.studio', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const oext = { mp4: 'mp4', prores: 'mov', webm: 'webm', gif: 'gif' }[format];
  const out = path.join(outDir, `${slug(o.name)}-${stamp}${alphaOut ? '-alpha' : ''}.${oext}`);
  const filterFile = path.join(store.p('.studio'), `filter-${nid()}.txt`);
  fs.writeFileSync(filterFile, filters.join(';\n'));
  args.push(...filterComplexFileArgs(filterFile), '-map', '[vout]');
  if (format !== 'gif') args.push('-map', '[aout]');
  const tags = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  if (format === 'mp4') args.push('-c:v', 'libx264', '-preset', o.quality === 'small' ? 'medium' : 'slow', '-crf', String(QUALITY[o.quality || 'standard']), '-profile:v', 'high', ...tags, '-r', String(fps), '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart');
  if (format === 'prores') args.push('-c:v', 'prores_ks', '-profile:v', alphaOut ? '4444' : '3', '-vendor', 'apl0', ...(alphaOut ? ['-alpha_bits', '16'] : []), ...tags, '-r', String(fps), '-c:a', 'pcm_s16le');
  if (format === 'webm') args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(o.quality === 'small' ? 38 : o.quality === 'high' ? 24 : 30), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', ...(alphaOut ? ['-auto-alt-ref', '0'] : []), ...tags, '-r', String(fps), '-c:a', 'libopus', '-b:a', '192k');
  if (format === 'gif') args.push('-loop', '0');
  args.push('-t', D.toFixed(3), out);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin('ffmpeg'), args);
    signal.kill = () => proc.kill('SIGKILL');
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.stdout.on('data', (d) => {
      const m = /out_time_ms=(\d+)/.exec(String(d));
      if (m) progress('encoding', 0.72 + 0.28 * Math.min(1, Number(m[1]) / 1e6 / D));
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(signal.aborted ? 'cancelled' : 'ffmpeg failed: ' + err.slice(-3000)))));
  });
  fs.rmSync(filterFile, { force: true });
  if (signal.aborted) { fs.rmSync(out, { force: true }); throw new Error('cancelled'); }
  if (!process.env.STUDIO_KEEP_FRAMES) fs.rmSync(workDir, { recursive: true, force: true });
  return path.relative(store.dir, out).split(path.sep).join('/');
}

/** ffmpeg volume expression reproducing audioGain(): fades / dips of in/out transitions (t is window-local) */
function gainExpr(it: Item, offset: number): string {
  const vol = (it.volume ?? 1).toFixed(4);
  const parts = [vol];
  const x = (expr: string) => `max(0,min(1,${expr}))`;
  const gainy = (tp?: string) => tp === 'fade' || tp === 'dip-black' || tp === 'dip-white';
  const fin = it.fx?.in, fout = it.fx?.out;
  if (fin && gainy(fin.type) && fin.duration > 0) { const d = Math.min(fin.duration, it.duration); parts.push(`(1-pow(1-${x(`(t+${offset.toFixed(4)})/${d.toFixed(4)}`)},3))`); }
  if (fout && gainy(fout.type) && fout.duration > 0) { const d = Math.min(fout.duration, it.duration); parts.push(`pow(${x(`(${it.duration.toFixed(4)}-(t+${offset.toFixed(4)}))/${d.toFixed(4)}`)},3)`); }
  return parts.join('*').replace(/,/g, '\\,');
}
