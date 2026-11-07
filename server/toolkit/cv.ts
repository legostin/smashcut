// OpenCV (WebAssembly build, no Python) for scene-aware tracking: features, optical flow, homographies.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { bin } from '../bin.ts';
import { inputArgs, even, type Probe } from './ff.ts';
import { uerr } from '../i18n.ts';
import type { OpContext } from './registry.ts';

// NB: the Emscripten module is a "thenable" — resolving a promise with it makes the runtime adopt it forever and
// hangs the event loop. Keep it inside a wrapper object.
let cvP: Promise<{ cv: any }> | null = null;
export function loadCv(): Promise<{ cv: any }> {
  if (!cvP) {
    cvP = new Promise((resolve, reject) => {
      const cv = createRequire(import.meta.url)('@techstark/opencv-js');
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (cv.Mat && cv.calcOpticalFlowPyrLK) { clearInterval(iv); resolve({ cv }); }
        else if (Date.now() - t0 > 30000) { clearInterval(iv); reject(new Error('OpenCV (wasm) did not initialise')); }
      }, 10);
    });
  }
  return cvP;
}

/** decode gray frames (analysis width `aw`) at `fps` as one buffer per frame */
export function grayFrames(ctx: OpContext, abs: string, info: Probe, start: number, dur: number, fps: number, aw: number): Promise<{ frames: Uint8Array[]; w: number; h: number }> {
  const ah = even(Math.round((aw * info.height) / info.width));
  return new Promise((resolve, reject) => {
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-ss', String(start), '-t', String(dur), ...inputArgs(abs, info), '-an', '-vf', `fps=${fps},scale=${aw}:${ah}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
    const chunks: Buffer[] = [];
    p.stdout.on('data', (d) => chunks.push(d));
    let err = ''; p.stderr.on('data', (d) => (err += d));
    ctx.signal.addEventListener('abort', () => p.kill('SIGKILL'));
    p.on('close', (code) => {
      if (code !== 0) return reject(uerr('ffmpeg failed: {error}', { error: err.slice(-400) }));
      const all = Buffer.concat(chunks), size = aw * ah, frames: Uint8Array[] = [];
      for (let o = 0; o + size <= all.length; o += size) frames.push(new Uint8Array(all.buffer.slice(all.byteOffset + o, all.byteOffset + o + size)));
      resolve({ frames, w: aw, h: ah });
    });
  });
}

export type Mat3 = number[]; // row-major 3×3
export const I3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function mul3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}
export function inv3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
export function apply3(m: Mat3, x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8] || 1e-12;
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
/** normalise so m[8] = 1 */
export const norm3 = (m: Mat3): Mat3 => m.map((v) => +(v / (m[8] || 1)).toFixed(8));

/** inside a convex quad (corners in order) */
export function inQuad(q: [number, number][], x: number, y: number) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
    const c = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (c !== 0) { const s = Math.sign(c); if (sign && s !== sign) return false; sign = s; }
  }
  return true;
}

/**
 * KLT pipeline: track feature points frame to frame and estimate, for every frame k, the homography from frame 0
 * (the reference) to frame k using only points inside `region(k)` (or outside `exclude(k)`); features are re-seeded
 * when too few survive. Returns H[k] in analysis pixels and inlier counts.
 */
export async function trackHomographies(frames: Uint8Array[], w: number, h: number, o: {
  region?: (k: number, H: Mat3) => [number, number][] | null; // quad (analysis px) in frame k that the points must lie in
  maxCorners?: number; progress?: (p: number) => void; signal?: AbortSignal; refIndex?: number;
}) {
  const { cv } = await loadCv();
  const n = frames.length;
  const ref = o.refIndex || 0;
  const Hs: Mat3[] = new Array(n);
  const inl: number[] = new Array(n).fill(0);
  Hs[ref] = I3.slice(); inl[ref] = 999;
  const mats = new Map<number, any>();
  const mat = (k: number) => { let m = mats.get(k); if (!m) { m = new cv.Mat(h, w, cv.CV_8UC1); m.data.set(frames[k]); mats.set(k, m); } return m; };
  const drop = (k: number) => { const m = mats.get(k); if (m) { m.delete(); mats.delete(k); } };
  const maxC = o.maxCorners || 400;

  const seed = (k: number, H: Mat3): { pts: Float32Array; refPts: Float32Array } => {
    const q = o.region?.(k, H) || null;
    const mask = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(q ? 0 : 255));
    if (q) {
      const poly = cv.matFromArray(4, 1, cv.CV_32SC2, q.flatMap(([x, y]) => [Math.round(x), Math.round(y)]));
      const v = new cv.MatVector(); v.push_back(poly);
      cv.fillPoly(mask, v, new cv.Scalar(255));
      poly.delete(); v.delete();
    }
    const corners = new cv.Mat();
    cv.goodFeaturesToTrack(mat(k), corners, maxC, 0.01, Math.max(4, Math.round(w / 80)), mask, 5);
    mask.delete();
    const pts = new Float32Array(corners.data32F);
    corners.delete();
    // reference coordinates of these points (back through H: frame k → frame ref)
    const Hi = inv3(H), refPts = new Float32Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) { const [x, y] = apply3(Hi, pts[i], pts[i + 1]); refPts[i] = x; refPts[i + 1] = y; }
    return { pts, refPts };
  };

  for (const dir of [1, -1]) {
    let cur = seed(ref, I3);
    let H = I3.slice();
    for (let k = ref + dir; k >= 0 && k < n; k += dir) {
      if (o.signal?.aborted) throw uerr('cancelled');
      // let the server breathe: wasm runs on the main thread
      if (Math.abs(k - ref) % 8 === 0) await new Promise((r) => setImmediate(r));
      const prevK = k - dir;
      if (cur.pts.length < 16) cur = seed(prevK, H);
      const p0 = cv.matFromArray(cur.pts.length / 2, 1, cv.CV_32FC2, Array.from(cur.pts));
      const p1 = new cv.Mat(), st = new cv.Mat(), er = new cv.Mat();
      cv.calcOpticalFlowPyrLK(mat(prevK), mat(k), p0, p1, st, er, new cv.Size(21, 21), 3, new cv.TermCriteria(cv.TermCriteria_EPS | cv.TermCriteria_COUNT, 30, 0.01));
      const next: number[] = [], nextRef: number[] = [];
      for (let i = 0; i < st.rows; i++) if (st.data[i] === 1) {
        const x = p1.data32F[i * 2], y = p1.data32F[i * 2 + 1];
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        next.push(x, y); nextRef.push(cur.refPts[i * 2], cur.refPts[i * 2 + 1]);
      }
      p0.delete(); p1.delete(); st.delete(); er.delete();
      if (next.length >= 8) {
        const src = cv.matFromArray(nextRef.length / 2, 1, cv.CV_32FC2, nextRef), dst = cv.matFromArray(next.length / 2, 1, cv.CV_32FC2, next);
        const mask = new cv.Mat();
        const Hm = cv.findHomography(src, dst, cv.RANSAC, 2.5, mask);
        if (!Hm.empty()) {
          H = Array.from(Hm.data64F) as Mat3;
          let c = 0; const keep: number[] = [], keepRef: number[] = [];
          for (let i = 0; i < mask.rows; i++) if (mask.data[i]) { c++; keep.push(next[i * 2], next[i * 2 + 1]); keepRef.push(nextRef[i * 2], nextRef[i * 2 + 1]); }
          inl[k] = c;
          cur = { pts: new Float32Array(keep), refPts: new Float32Array(keepRef) };
        }
        Hm.delete(); mask.delete(); src.delete(); dst.delete();
      } else { cur = { pts: new Float32Array(next), refPts: new Float32Array(nextRef) }; inl[k] = next.length / 2; }
      Hs[k] = H.slice();
      drop(prevK - dir * 2);
      o.progress?.(Math.abs(k - ref) / n);
    }
    for (const k of [...mats.keys()]) if (k !== ref) drop(k);
  }
  drop(ref);
  return { Hs, inliers: inl };
}

/** similarity components of a homography around the frame centre: dx, dy (px), scale, rotation (deg) */
export function decompose(H: Mat3, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const [x0, y0] = apply3(H, cx, cy), [x1, y1] = apply3(H, cx + 100, cy);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  return { dx: x0 - cx, dy: y0 - cy, scale: Math.hypot(x1 - x0, y1 - y0) / 100, rot: (ang * 180) / Math.PI };
}
