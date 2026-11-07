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
const jobs = new Map<string, ExportJob>();
export function getJobs() { return [...jobs.values()]; }

export function startExport(opts: { from?: number; to?: number; name?: string } = {}): ExportJob {
  const store = cur();
  const p = store.project;
  const end = Math.max(0, ...p.items.map((i) => i.start + i.duration));
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(opts.to ?? (end || p.duration), end || p.duration);
  const job: ExportJob = { id: nid(), status: 'running', progress: 0, stage: 'preparing', from, to };
  jobs.set(job.id, job);
  const emit = () => bus.send({ type: 'export', job: { ...job } });
  emit();
  (async () => {
    try {
      job.output = await exportRange(from, to, opts.name || p.name, (stage, prog) => { job.stage = stage; job.progress = prog; emit(); });
      job.status = 'done'; job.progress = 1; job.stage = 'done';
    } catch (e) {
      job.status = 'error'; job.error = (e as Error).message.slice(-2000);
    }
    emit();
  })();
  return job;
}

export async function exportRange(from: number, to: number, name: string, progress: (stage: string, p: number) => void = () => {}): Promise<string> {
  const store = cur();
  const p = store.project;
  const D = Math.max(1 / p.fps, to - from);
  const W = p.width, H = p.height, fps = p.fps;

  // clip an item to the export window
  const win = (it: Item) => {
    const s = Math.max(it.start, from), e = Math.min(it.start + it.duration, to);
    if (e <= s) return null;
    return { start: s - from, dur: e - s, srcIn: it.in + (s - it.start) };
  };

  // 1) music
  progress('rendering music', 0.02);
  const musicItems = p.items.filter((i) => i.kind === 'music' && win(i));
  for (const it of musicItems) await renderMusic(it.ref);

  // 2) clip sequences
  const layers = visualLayers(p).filter((i) => win(i));
  const clipItems = layers.filter((i) => i.kind === 'clip');
  const seqs = new Map<string, { dir: string; count: number }>();
  let doneClips = 0;
  const totalFrames = clipItems.reduce((a, i) => a + Math.round(i.duration * fps), 0) || 1;
  const prog = new Map<string, number>();
  await Promise.all(clipItems.map(async (it) => {
    const r = await renderItemSequence(it, p, (d) => {
      prog.set(it.id, d);
      const sum = [...prog.values()].reduce((a, b) => a + b, 0);
      progress(`rendering graphics ${sum}/${totalFrames} frames`, 0.05 + 0.6 * (sum / totalFrames));
    });
    seqs.set(it.id, r);
    doneClips++;
  }));

  // 3) ffmpeg graph
  progress('encoding', 0.66);
  const args: string[] = ['-y', '-v', 'error', '-progress', 'pipe:1', '-nostats'];
  const filters: string[] = [];
  let n = 0;
  args.push('-f', 'lavfi', '-i', `color=c=${p.background.replace('#', '0x')}:s=${W}x${H}:r=${fps}:d=${D.toFixed(3)}`);
  let base = '[0:v]';
  n++;
  let li = 0;
  for (const it of layers) {
    const w = win(it)!;
    const op = it.opacity ?? 1;
    const idx = n++;
    let chain = '';
    if (it.kind === 'clip') {
      const seq = seqs.get(it.id)!;
      const startNum = Math.round((w.srcIn - it.in) * fps);
      args.push('-framerate', String(fps), '-start_number', String(startNum), '-i', path.join(seq.dir, '%06d.png'));
      chain = `[${idx}:v]format=rgba,trim=duration=${w.dur.toFixed(3)},setpts=PTS-STARTPTS+${w.start.toFixed(3)}/TB`;
    } else {
      const f = mediaFile(it);
      const src = store.p('media', f);
      const tr = it.transform || {};
      if (isImage(f)) args.push('-loop', '1', '-framerate', String(fps), '-t', w.dur.toFixed(3), '-i', src);
      else args.push('-ss', w.srcIn.toFixed(3), '-t', w.dur.toFixed(3), '-i', src);
      const fit = tr.fit === 'cover' ? 'increase' : 'decrease';
      const s = tr.scale ?? 1;
      chain = `[${idx}:v]fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=${fit}${s !== 1 ? `,scale=iw*${s}:ih*${s}` : ''},format=rgba,setpts=PTS-STARTPTS+${w.start.toFixed(3)}/TB`;
    }
    if (op < 1) chain += `,colorchannelmixer=aa=${op}`;
    const tr = it.transform || {};
    const x = it.kind === 'clip' ? '0' : `(main_w-overlay_w)/2+${tr.x || 0}`;
    const y = it.kind === 'clip' ? '0' : `(main_h-overlay_h)/2+${tr.y || 0}`;
    filters.push(`${chain}[l${li}]`);
    filters.push(`${base}[l${li}]overlay=x=${x}:y=${y}:eof_action=pass:enable='between(t,${w.start.toFixed(3)},${(w.start + w.dur).toFixed(3)})'[b${li}]`);
    base = `[b${li}]`;
    li++;
  }
  filters.push(`${base}format=yuv420p[vout]`);

  // audio
  const audioIns: string[] = [];
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

  const outDir = store.p('.studio', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(outDir, `${slug(name)}-${stamp}.mp4`);
  const filterFile = path.join(store.p('.studio'), `filter-${nid()}.txt`);
  fs.writeFileSync(filterFile, filters.join(';\n'));
  args.push('-/filter_complex', filterFile, '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-t', D.toFixed(3), '-movflags', '+faststart', out);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let err = '';
    proc.stderr.on('data', (d) => (err += d));
    proc.stdout.on('data', (d) => {
      const m = /out_time_ms=(\d+)/.exec(String(d));
      if (m) progress('encoding', 0.66 + 0.34 * Math.min(1, Number(m[1]) / 1e6 / D));
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg failed: ' + err.slice(-3000)))));
  });
  fs.rmSync(filterFile, { force: true });
  void doneClips;
  return path.relative(store.dir, out).split(path.sep).join('/');
}
