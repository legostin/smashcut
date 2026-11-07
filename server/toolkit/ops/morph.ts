// Morph ops: morph_images (two stills → morph/dissolve clip) and morph_video_cut (bridge between two shots).
// "morph" = motion-compensated interpolation (ffmpeg minterpolate mci) between two frames: shapes flow
// into each other where the motion estimator finds correspondences, otherwise it degrades to a soft blend.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { probe, inputArgs, ffmpeg, MP4, MP4_AUDIO, even } from '../ff.ts';

const IMG = ['image'] as ('image')[];
const VID = ['video'] as ('video')[];

/** fit an image into W×H (cover crop), flattened onto black, as PNG */
async function fitTo(src: string, dst: string, W: number, H: number) {
  await sharp(src, { animated: false }).rotate().resize(W, H, { fit: 'cover' }).flatten({ background: '#000000' }).png().toFile(dst);
}

/** A.png → B.png over `dur` seconds at `fps` (mode morph | dissolve), with `hold` seconds of A before and B after */
async function morphPair(ctx: OpContext, a: string, b: string, out: string, o: { dur: number; fps: number; hold: number; mode: string; range?: [number, number] }) {
  const total = o.dur + 2 * o.hold;
  if (o.mode === 'dissolve') {
    await ffmpeg(ctx, ['-loop', '1', '-framerate', String(o.fps), '-t', String(o.hold + o.dur), '-i', a, '-loop', '1', '-framerate', String(o.fps), '-t', String(o.hold + o.dur), '-i', b,
      '-filter_complex', `[0:v]format=yuv420p,setsar=1[x];[1:v]format=yuv420p,setsar=1[y];[x][y]xfade=transition=fade:duration=${o.dur}:offset=${o.hold},tpad=stop_mode=clone:stop_duration=${o.hold}[v]`,
      '-map', '[v]', '-t', String(total), ...MP4, '-an', out], { duration: total, range: o.range, stage: 'dissolving' });
    return;
  }
  // two-frame sequence: A at t=0, B at t=dur (and B again at 2·dur so the last interpolated span is closed)
  const dir = path.dirname(a);
  const seq = path.join(dir, 'seq');
  fs.mkdirSync(seq, { recursive: true });
  fs.copyFileSync(a, path.join(seq, '0.png'));
  fs.copyFileSync(b, path.join(seq, '1.png'));
  fs.copyFileSync(b, path.join(seq, '2.png'));
  await ffmpeg(ctx, ['-framerate', `1/${o.dur}`, '-i', path.join(seq, '%d.png'),
    '-filter_complex', `[0:v]format=yuv420p,minterpolate=fps=${o.fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:vsbmc=1:scd=none,trim=duration=${o.dur},setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=${o.hold}:stop_mode=clone:stop_duration=${o.hold + 1 / o.fps},setsar=1[v]`,
    '-map', '[v]', '-t', String(total), '-r', String(o.fps), ...MP4, '-an', out], { duration: total, range: o.range, stage: 'interpolating' });
}

defineOp({
  id: 'morph_images',
  title: 'Morph two images',
  category: 'video',
  cost: 'medium',
  description: 'Make a short video that transforms image A into image B. mode=morph uses motion-compensated frame interpolation (shapes flow/warp into each other — best when the two images are similar in layout: same product from two angles, before/after, face to face); mode=dissolve is a clean cross-fade. B is cover-cropped to A\'s size. hold adds still time before and after. Output: H.264 MP4.',
  limits: 'width ≤ 1920',
  inputs: {
    imageA: { type: 'file', label: 'Image A', accept: IMG, required: true },
    imageB: { type: 'file', label: 'Image B', accept: IMG, required: true },
    duration: { type: 'number', label: 'Transition s', min: 0.2, max: 10, step: 0.1, default: 1.5 },
    mode: { type: 'enum', label: 'Mode', values: ['morph', 'dissolve'], default: 'morph' },
    hold: { type: 'number', label: 'Hold s', min: 0, max: 5, step: 0.1, default: 0.5 },
    fps: { type: 'number', label: 'fps', min: 12, max: 60, default: 30 },
    width: { type: 'number', label: 'Width', min: 0, max: 1920, default: 0, description: '0 = width of A (max 1920)' },
  },
  outputs: { video: { kind: 'video' } },
  async run(ctx, p: any) {
    const ma = await sharp(ctx.abs(p.imageA)).rotate().metadata();
    const aw = (ma.autoOrient?.width || ma.width || 1280), ah = (ma.autoOrient?.height || ma.height || 720);
    const W = even(p.width || Math.min(1920, aw)), H = even((W * ah) / aw);
    const t = ctx.tmp();
    const a = path.join(t, 'a.png'), b = path.join(t, 'b.png');
    await fitTo(ctx.abs(p.imageA), a, W, H);
    await fitTo(ctx.abs(p.imageB), b, W, H);
    const video = ctx.out(p.mode === 'morph' ? 'morph' : 'dissolve', 'mp4');
    await morphPair(ctx, a, b, ctx.abs(video), { dur: p.duration, fps: p.fps, hold: p.hold, mode: p.mode });
    return { video };
  },
});

defineOp({
  id: 'morph_video_cut',
  title: 'Morph cut between two clips',
  category: 'video',
  cost: 'medium',
  description: 'Smooth transition between the END of clip A and the START of clip B as a short bridge clip (place it between A and B on the timeline). mode=morph interpolates from A\'s last frame to B\'s first frame (motion-compensated — hides jump cuts in interviews/talking heads, or "flows" one shot into a similar one); mode=dissolve cross-fades A\'s last `duration` seconds with B\'s first seconds (motion continues during the fade). join=true also renders the full A→bridge→B sequence (for dissolve the overlap is consumed, so it is shorter by `duration`). B is scaled/cropped to A\'s size.',
  inputs: {
    videoA: { type: 'file', label: 'Clip A (outgoing)', accept: VID, required: true },
    videoB: { type: 'file', label: 'Clip B (incoming)', accept: VID, required: true },
    duration: { type: 'number', label: 'Transition s', min: 0.2, max: 4, step: 0.1, default: 0.8 },
    mode: { type: 'enum', label: 'Mode', values: ['morph', 'dissolve'], default: 'morph' },
    join: { type: 'boolean', label: 'Also render A+bridge+B', default: false },
  },
  outputs: { bridge: { kind: 'video', description: 'the transition clip only' }, joined: { kind: 'video', optional: true, description: 'A → transition → B (join=true)' } },
  async run(ctx, p: any) {
    const A = await probe(ctx.abs(p.videoA)), B = await probe(ctx.abs(p.videoB));
    if (!A.hasVideo || !B.hasVideo) throw uerr('Both inputs must be videos');
    const d = p.duration;
    if (p.mode === 'dissolve' && (A.duration < d || B.duration < d)) throw uerr('Both clips must be longer than the transition ({d}s)', { d });
    const W = even(A.width), H = even(A.height), fps = Math.round(A.fps) || 30;
    const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},format=yuv420p,setsar=1`;
    const inA = inputArgs(ctx.abs(p.videoA), A), inB = inputArgs(ctx.abs(p.videoB), B);
    const bridge = ctx.out(p.mode === 'morph' ? 'morphcut' : 'dissolvecut', 'mp4');
    const joinR: [number, number] = p.join ? [0, 0.5] : [0, 1];
    if (p.mode === 'morph') {
      const t = ctx.tmp();
      const fa = path.join(t, 'a.png'), fb = path.join(t, 'b.png');
      await ffmpeg(ctx, ['-sseof', String(-Math.min(0.5, A.duration)), ...inA, '-vf', norm.replace(',format=yuv420p', ''), '-update', '1', fa]);
      await ffmpeg(ctx, [...inB, '-frames:v', '1', '-vf', norm.replace(',format=yuv420p', ''), fb]);
      await morphPair(ctx, fa, fb, ctx.abs(bridge), { dur: d, fps, hold: 0, mode: 'morph', range: joinR });
    } else {
      await ffmpeg(ctx, ['-ss', String(Math.max(0, A.duration - d)), ...inA, '-t', String(d), ...inB,
        '-filter_complex', `[0:v]${norm},trim=duration=${d},setpts=PTS-STARTPTS[a];[1:v]${norm},trim=duration=${d},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${d}:offset=0[v]`,
        '-map', '[v]', '-t', String(d), ...MP4, '-an', ctx.abs(bridge)], { duration: d, range: joinR, stage: 'dissolving' });
    }
    const out: Record<string, string> = { bridge };
    if (p.join) {
      const joined = ctx.out('joined', 'mp4');
      const audio = A.hasAudio && B.hasAudio;
      let fc: string, total: number;
      if (p.mode === 'morph') {
        total = A.duration + d + B.duration;
        fc = `[0:v]${norm}[a];[1:v]${norm}[m];[2:v]${norm}[b];[a][m][b]concat=n=3:v=1:a=0[v]`
          + (audio ? `;[0:a]aresample=48000,aformat=channel_layouts=stereo[x];anullsrc=r=48000:cl=stereo,atrim=duration=${d}[s];[2:a]aresample=48000,aformat=channel_layouts=stereo[y];[x][s][y]concat=n=3:v=0:a=1[aout]` : '');
      } else {
        total = A.duration + B.duration - d;
        fc = `[0:v]${norm},trim=duration=${(A.duration - d).toFixed(4)},setpts=PTS-STARTPTS[a];[1:v]${norm}[m];[2:v]${norm},trim=start=${d},setpts=PTS-STARTPTS[b];[a][m][b]concat=n=3:v=1:a=0[v]`
          + (audio ? `;[0:a]aresample=48000,aformat=channel_layouts=stereo[x];[2:a]aresample=48000,aformat=channel_layouts=stereo[y];[x][y]acrossfade=d=${d}[aout]` : '');
      }
      await ffmpeg(ctx, [...inA, '-i', ctx.abs(bridge), ...inB, '-filter_complex', fc, '-map', '[v]', ...(audio ? ['-map', '[aout]', ...MP4_AUDIO] : ['-an']), ...MP4, ctx.abs(joined)], { duration: total, range: [0.5, 1], stage: 'joining' });
      out.joined = joined;
    }
    return out;
  },
});
