// Shot ops: detect_shots (cut detection + contact sheet + rhythm analysis), split_shots (one file per shot).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { probe, inputArgs, ffmpeg, videoEncoder } from '../ff.ts';
import { decodePcm, analyzePcm } from '../../audio/analyze.ts';

const VID = ['video'] as ('video')[];

export interface Shot { i: number; start: number; end: number; duration: number; color?: string }

/**
 * Cut detection: ffmpeg's scene-change score on a downscaled copy (fast), cuts above `threshold`,
 * shots shorter than `minShot` merged into their neighbour.
 */
async function detect(ctx: OpContext, abs: string, threshold: number, minShot: number, duration: number): Promise<Shot[]> {
  const info = await probe(abs);
  // scene score for every frame, then an adaptive decision: a hard cut (score ≥ threshold) or a soft one —
  // a spike well above the local background (similar-looking shots, colour-matched cuts)
  // scores go to a file: stderr is capped, and a long video has tens of thousands of frames
  const scoresFile = path.join(ctx.tmp(), `scores-${Date.now()}.txt`);
  const esc = scoresFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  await ffmpeg(ctx, [...inputArgs(abs, info), '-an', '-vf', `scale=320:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file='${esc}'`, '-f', 'null', '-'], { duration, range: [0, 0.6], stage: 'finding cuts' });
  const log = fs.existsSync(scoresFile) ? fs.readFileSync(scoresFile, 'utf8') : '';
  const frames: { t: number; s: number }[] = [];
  let lastT = 0;
  for (const line of log.split('\n')) {
    const mt = /pts_time:([\d.]+)/.exec(line); if (mt) { lastT = +mt[1]; continue; }
    const ms = /lavfi\.scene_score=([\d.]+)/.exec(line); if (ms) frames.push({ t: lastT, s: +ms[1] });
  }
  return shotsFromScores(frames, threshold, minShot, duration);
}

/** the cut decision (shared with watch_video): per-frame scene scores → shots. A hard cut (score ≥ threshold) or a soft
 *  one — a spike well above the local background (similar-looking shots, colour-matched cuts); too-short shots merge. */
export function shotsFromScores(frames: { t: number; s: number }[], threshold: number, minShot: number, duration: number): Shot[] {
  const cuts: number[] = [];
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    if (f.t <= 0.05 || f.t >= duration - 0.05) continue;
    const win = frames.slice(Math.max(0, k - 15), k).concat(frames.slice(k + 1, k + 16)).map((x) => x.s).sort((a, b) => a - b);
    const bg = win.length ? win[Math.floor(win.length / 2)] : 0;
    const isPeak = f.s >= (frames[k - 1]?.s ?? 0) && f.s >= (frames[k + 1]?.s ?? 0);
    if (isPeak && (f.s >= threshold || (f.s >= threshold * 0.5 && f.s >= Math.max(0.06, bg * 5)))) cuts.push(+f.t.toFixed(3));
  }
  const bounds = [0, ...cuts, duration];
  let shots: Shot[] = [];
  for (let k = 0; k < bounds.length - 1; k++) shots.push({ i: 0, start: bounds[k], end: bounds[k + 1], duration: +(bounds[k + 1] - bounds[k]).toFixed(3) });
  // merge flashes / too-short shots into the previous one
  const merged: Shot[] = [];
  for (const s of shots) {
    const last = merged[merged.length - 1];
    if (last && s.duration < minShot) { last.end = s.end; last.duration = +(last.end - last.start).toFixed(3); }
    else merged.push({ ...s });
  }
  if (merged.length > 1 && merged[0].duration < minShot) { merged[1].start = 0; merged[1].duration = +(merged[1].end).toFixed(3); merged.shift(); }
  shots = merged.map((s, i) => ({ ...s, i: i + 1 }));
  return shots;
}

const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

defineOp({
  id: 'detect_shots',
  version: 2,
  title: 'Detect shots (cuts) + rhythm',
  category: 'video',
  cost: 'medium',
  description: 'Find the cuts in a video and list its shots with timecodes, plus a contact sheet (one frame per shot, numbered) and a rhythm analysis: shot count, average/median/shortest/longest shot, cuts per minute, each shot\'s dominant colour, and — if the video has sound — tempo and how many cuts land on a beat. Use it to study a reference edit ("cut it like this"), or before split_shots. Lower `threshold` finds softer cuts (dissolves, similar shots); raise it if motion inside a shot is detected as a cut.',
  limits: '≤ 20 min of video; ≤ 120 shots in the sheet',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    threshold: { type: 'number', label: 'Sensitivity (scene score)', min: 0.05, max: 0.8, step: 0.01, default: 0.3, description: '0.2 = sensitive, 0.4 = only hard cuts' },
    minShot: { type: 'number', label: 'Min shot, s', min: 0.05, max: 5, step: 0.05, default: 0.3, description: 'shorter "shots" (flashes) merge into the previous one' },
  },
  outputs: { shots: { kind: 'json', description: '{shots:[{i,start,end,duration,color}], rhythm:{…}}' }, sheet: { kind: 'image', description: 'contact sheet, one frame per shot' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    if (!info.hasVideo) throw uerr('{file} has no video stream', { file: p.video });
    if (info.duration > 1200) throw uerr('Videos up to 20 minutes — trim it first');
    const shots = await detect(ctx, abs, p.threshold, p.minShot, info.duration);
    // one frame per shot (middle) → dominant colour + contact sheet
    const show = shots.slice(0, 120);
    const tw = 288, th = Math.max(2, Math.round((tw * (info.height || 9)) / (info.width || 16)));
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    const cols = Math.min(6, Math.ceil(Math.sqrt(show.length * 1.6)));
    const tmp = ctx.tmp();
    for (let k = 0; k < show.length; k++) {
      const s = show[k];
      const f = path.join(tmp, `s${k}.jpg`);
      await ffmpeg(ctx, ['-ss', String(s.start + Math.min(s.duration / 2, 1.5)), ...inputArgs(abs, info), '-frames:v', '1', '-vf', `scale=${tw}:${th}:out_range=full,format=yuvj420p`, '-q:v', '3', f]);
      if (!fs.existsSync(f)) continue;
      const st = await sharp(f).stats();
      const d = st.dominant; s.color = '#' + [d.r, d.g, d.b].map((x) => x.toString(16).padStart(2, '0')).join('');
      const label = Buffer.from(`<svg width="${tw}" height="${th}"><rect x="0" y="${th - 26}" width="${tw}" height="26" fill="rgba(0,0,0,.62)"/><text x="8" y="${th - 8}" font-family="Helvetica, Arial" font-size="14" fill="#fff">${s.i} · ${tc(s.start)} · ${s.duration.toFixed(2)}s</text><rect x="${tw - 22}" y="${th - 20}" width="14" height="14" rx="3" fill="${s.color}" stroke="#fff" stroke-width="1"/></svg>`);
      tiles.push({ input: await sharp(f).composite([{ input: label }]).png().toBuffer(), left: (k % cols) * (tw + 4), top: Math.floor(k / cols) * (th + 4) });
      ctx.progress(0.6 + 0.3 * ((k + 1) / show.length), `shot ${k + 1}/${show.length}`);
    }
    const rows = Math.ceil(show.length / cols);
    const sheet = ctx.out('shots', 'jpg');
    await sharp({ create: { width: Math.max(1, cols * (tw + 4) - 4), height: Math.max(1, rows * (th + 4) - 4), channels: 3, background: '#111111' } }).composite(tiles).jpeg({ quality: 84 }).toFile(ctx.abs(sheet));
    // rhythm
    const ds = shots.map((s) => s.duration).sort((a, b) => a - b);
    const rhythm: Record<string, unknown> = {
      shots: shots.length, duration: +info.duration.toFixed(2),
      avgShot: +(info.duration / shots.length).toFixed(2), medianShot: ds[Math.floor(ds.length / 2)], shortest: ds[0], longest: ds[ds.length - 1],
      cutsPerMinute: +(((shots.length - 1) / info.duration) * 60).toFixed(1),
      pacing: info.duration / shots.length < 1.2 ? 'very fast (social / trailer)' : info.duration / shots.length < 2.5 ? 'fast (promo)' : info.duration / shots.length < 5 ? 'medium (explainer)' : 'slow (cinematic / interview)',
    };
    if (info.hasAudio) {
      try {
        const pcm = await decodePcm(abs, 22050, 0, Math.min(info.duration, 600));
        const a = analyzePcm(pcm, 22050);
        const cuts = shots.slice(1).map((s) => s.start);
        const beat = a.bpm ? 60 / a.bpm : 0;
        const onBeat = beat ? cuts.filter((c) => a.beats.some((b) => Math.abs(b - c) < Math.min(0.08, beat / 6))).length : 0;
        Object.assign(rhythm, { bpm: a.bpm ? Math.round(a.bpm) : null, cutsOnBeat: cuts.length ? `${onBeat}/${cuts.length}` : '0/0', beatsPerShot: beat ? +((info.duration / shots.length) / beat).toFixed(2) : null });
      } catch { /* audio analysis is best-effort */ }
    }
    ctx.progress(1, 'done');
    return { shots: { shots, rhythm }, sheet };
  },
});

defineOp({
  id: 'split_shots',
  version: 2,
  title: 'Split into shots',
  category: 'video',
  cost: 'slow',
  description: 'Cut a video into separate files, one per shot (detected cuts, or your own list of ranges), frame-accurate, keeping sound and alpha. Files are named <video>.shot01.mp4 … Then place the ones you need with timeline_add. Use detect_shots first to check the cut list and threshold.',
  limits: '≤ 60 shots per run; ≤ 20 min of video',
  inputs: {
    video: { type: 'file', label: 'Video', accept: VID, required: true },
    threshold: { type: 'number', label: 'Sensitivity', min: 0.05, max: 0.8, step: 0.01, default: 0.3 },
    minShot: { type: 'number', label: 'Min shot, s', min: 0.05, max: 5, step: 0.05, default: 0.3 },
    ranges: { type: 'string', label: 'Own ranges', default: '', description: 'optional "start-end, start-end" in seconds (e.g. "0-2.4, 5.1-7") — overrides detection' },
    only: { type: 'string', label: 'Only shots', default: '', description: 'optional shot numbers to export, e.g. "1,3,5-7"' },
    handles: { type: 'number', label: 'Trim edges, s', min: 0, max: 0.5, step: 0.01, default: 0.04, description: 'cut this much off both ends to avoid flash frames from the neighbouring shot' },
  },
  outputs: { files: { kind: 'json', description: '{files:[media/…], shots:[{i,start,end,duration}]}' } },
  async run(ctx, p: any) {
    const abs = ctx.abs(p.video);
    const info = await probe(abs);
    if (!info.hasVideo) throw uerr('{file} has no video stream', { file: p.video });
    if (info.duration > 1200) throw uerr('Videos up to 20 minutes — trim it first');
    let shots: Shot[];
    if (String(p.ranges || '').trim()) {
      shots = String(p.ranges).split(',').map((r) => r.trim()).filter(Boolean).map((r, k) => {
        const [a, b] = r.split('-').map(Number);
        if (!(a >= 0) || !(b > a)) throw uerr('Bad range “{r}” — use start-end in seconds', { r });
        const end = Math.min(b, info.duration);
        return { i: k + 1, start: a, end, duration: +(end - a).toFixed(3) };
      });
    } else shots = await detect(ctx, abs, p.threshold, p.minShot, info.duration);
    if (String(p.only || '').trim()) {
      const want = new Set<number>();
      for (const part of String(p.only).split(',')) { const [a, b] = part.split('-').map((x) => parseInt(x.trim(), 10)); if (a) for (let n = a; n <= (b || a); n++) want.add(n); }
      shots = shots.filter((s) => want.has(s.i));
    }
    if (!shots.length) throw uerr('No shots to export');
    if (shots.length > 60) throw uerr('{n} shots — export at most 60 per run (use “only”)', { n: shots.length });
    const enc = videoEncoder(!!info.alpha, !!info.hasAudio);
    const files: string[] = [];
    for (let k = 0; k < shots.length; k++) {
      const s = shots[k];
      const h = Math.min(p.handles || 0, s.duration / 4);
      const start = s.start + h, dur = Math.max(0.04, s.duration - 2 * h);
      const out = ctx.out(`shot${String(s.i).padStart(2, '0')}`, enc.ext);
      await ffmpeg(ctx, ['-ss', String(start), '-t', String(dur), ...inputArgs(abs, info), ...enc.args, ctx.abs(out)], { duration: dur, range: [k / shots.length, (k + 1) / shots.length], stage: `shot ${k + 1}/${shots.length}` });
      files.push(out);
    }
    return { files: { files, shots } };
  },
});
