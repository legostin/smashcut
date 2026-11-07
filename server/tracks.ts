import fs from 'node:fs';
import path from 'node:path';
import type { Item, Project } from '../shared/types.ts';
import { readJson, writeJson } from './util.ts';

/**
 * Object tracks (track_object): tracks/<name>.json in the project — boxes in normalised SOURCE coordinates over SOURCE time.
 * For clips they are mapped onto the edit: project time and frame pixels of every timeline item that uses the source
 * (item start / in, fit contain|cover, transform x/y/scale/rotate around the origin) → studio.track(name, t).
 */
export interface TrackPoint { t: number; x: number; y: number; w: number; h: number; score?: number; lost?: boolean }
export interface TrackFile {
  name: string; kind?: 'object' | 'camera' | 'plane'; source: string; fps: number; width: number; height: number; query?: string;
  /** object tracks: boxes */ points: TrackPoint[];
  /** camera: H maps normalised coords of the reference frame → frame t; plane: corners (normalised) */
  frames?: { t: number; H?: number[]; corners?: number[][]; inliers?: number }[];
  createdAt: string;
}

const file = (dir: string, name: string) => path.join(dir, 'tracks', `${name.replace(/[^a-z0-9а-яё_-]/gi, '-')}.json`);
export const readTrack = (dir: string, name: string) => readJson<TrackFile | null>(file(dir, name), null);
export const writeTrack = (dir: string, t: TrackFile) => writeJson(file(dir, t.name), t);
export function listTracks(dir: string): TrackFile[] {
  const d = path.join(dir, 'tracks');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => readJson<TrackFile | null>(path.join(d, f), null)).filter((x): x is TrackFile => !!x);
}

export interface PlacedPoint { t: number; x: number; y: number; w: number; h: number; lost?: boolean }
export interface Placement { itemId: string; start: number; end: number; points: PlacedPoint[] }

/** affine matrix: normalised source coords → frame px for a timeline item (fit contain|cover, transform about its origin) */
function itemMatrix(p: Project, it: Item, tr: TrackFile): number[] {
  const W = p.width, H = p.height;
  const fit = it.transform?.fit || 'contain';
  const s = fit === 'cover' ? Math.max(W / tr.width, H / tr.height) : Math.min(W / tr.width, H / tr.height);
  const dw = tr.width * s, dh = tr.height * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  const T = it.transform || {};
  const ox = ((T.ox ?? 50) / 100) * W, oy = ((T.oy ?? 50) / 100) * H;
  const k = T.scale ?? 1, rad = ((T.rotate || 0) * Math.PI) / 180, c = Math.cos(rad) * k, sn = Math.sin(rad) * k;
  // p' = R·k·(fitted - O) + O + t
  const a = c * dw, b = -sn * dh, e = sn * dw, d = c * dh;
  const tx = c * (dx - ox) - sn * (dy - oy) + ox + (T.x || 0), ty = sn * (dx - ox) + c * (dy - oy) + oy + (T.y || 0);
  return [a, b, tx, e, d, ty, 0, 0, 1];
}
const mul = (a: number[], b: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]; return r; };
function inv(m: number[]) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-12;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
const ap = (m: number[], x: number, y: number) => { const w = m[6] * x + m[7] * y + m[8] || 1e-12; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; };

/** map a source-normalised box into frame pixels for a timeline item */
function mapper(p: Project, it: Item, tr: TrackFile) {
  const W = p.width, H = p.height;
  const fit = it.transform?.fit || 'contain';
  const s = fit === 'cover' ? Math.max(W / tr.width, H / tr.height) : Math.min(W / tr.width, H / tr.height);
  const dw = tr.width * s, dh = tr.height * s, dx = (W - dw) / 2, dy = (H - dh) / 2;
  const T = it.transform || {};
  const ox = ((T.ox ?? 50) / 100) * W, oy = ((T.oy ?? 50) / 100) * H;
  const k = T.scale ?? 1, rad = ((T.rotate || 0) * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const pt = (u: number, v: number) => {
    const x = dx + u * dw - ox, y = dy + v * dh - oy;
    const sx = x * k, sy = y * k;
    return [sx * cos - sy * sin + ox + (T.x || 0), sx * sin + sy * cos + oy + (T.y || 0)];
  };
  return (q: TrackPoint): PlacedPoint => {
    const [cx, cy] = pt(q.x + q.w / 2, q.y + q.h / 2);
    const w = q.w * dw * k, h = q.h * dh * k;
    return { t: 0, x: +(cx - w / 2).toFixed(1), y: +(cy - h / 2).toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1), ...(q.lost ? { lost: true } : {}) };
  };
}

export interface PlanePlacement { itemId: string; start: number; end: number; frames: { t: number; corners: number[][] }[] }
export interface CameraPlacement { itemId: string; start: number; end: number; frames: { t: number; H: number[] }[] }

/** all tracks of the project mapped onto the edit: objects (boxes), planes (corners), cameras (frame-px homographies) */
export function projectTracks(dir: string, p: Project) {
  const objects: Record<string, Placement[]> = {}, planes: Record<string, PlanePlacement[]> = {}, cameras: Record<string, CameraPlacement[]> = {};
  for (const tr of listTracks(dir)) {
    const src = path.basename(tr.source);
    const items = p.items.filter((it) => it.kind === 'media' && it.ref === src);
    const inRange = (it: Item, t: number) => t >= it.in - 0.5 && t <= it.in + it.duration + 0.5;
    const toProject = (it: Item, t: number) => +(it.start + (t - it.in)).toFixed(4);
    if (tr.kind === 'plane') {
      planes[tr.name] = items.map((it) => {
        const A = itemMatrix(p, it, tr);
        return { itemId: it.id, start: it.start, end: it.start + it.duration, frames: (tr.frames || []).filter((f) => inRange(it, f.t)).map((f) => ({ t: toProject(it, f.t), corners: (f.corners || []).map(([u, v]) => ap(A, u, v).map((z) => +z.toFixed(2))) })) };
      }).filter((x) => x.frames.length);
    } else if (tr.kind === 'camera') {
      cameras[tr.name] = items.map((it) => {
        const A = itemMatrix(p, it, tr), Ai = inv(A);
        // reference-frame px → frame px at t
        return { itemId: it.id, start: it.start, end: it.start + it.duration, frames: (tr.frames || []).filter((f) => inRange(it, f.t)).map((f) => ({ t: toProject(it, f.t), H: mul(mul(A, f.H as number[]), Ai).map((z) => +z.toFixed(8)) })) };
      }).filter((x) => x.frames.length);
    } else {
      objects[tr.name] = items.map((it) => {
        const map = mapper(p, it, tr);
        return { itemId: it.id, start: it.start, end: it.start + it.duration, points: tr.points.filter((q) => inRange(it, q.t)).map((q) => ({ ...map(q), t: toProject(it, q.t) })) };
      }).filter((x) => x.points.length);
    }
  }
  return { objects, planes, cameras };
}
