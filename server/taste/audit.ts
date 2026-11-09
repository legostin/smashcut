// Taste audit — measured craft checks on rendered video (skills/studio-craft/SKILL.md, the numbers).
// Facts, not vibes: DOM probes of every clip page (text, fonts, motion) at ~15 samples/s, plus a grid of
// composited frames (~3/s) for pixels (contrast, dead stretches, flicker, seams, palette, frame 0).
// Every check prefers a miss over a false positive: anything it cannot verify is skipped.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Page } from 'playwright-core';
import type { Item, Project } from '../../shared/types.ts';
import { RUNTIME_DIR } from '../config.ts';
import { cur } from '../project.ts';
import { withPage } from '../render/browser.ts';
import { clipUrl, itemInput, openClip, makeCapturer, type ClipInput } from '../render/clips.ts';
import { compositeFrames, visualLayers } from '../render/compose.ts';

export interface TasteIssue { t?: number; severity: 'P0' | 'P1' | 'P2'; rule: string; where: string; problem: string; fix: string }
export interface TasteAudit { issues: TasteIssue[]; metrics: Record<string, unknown>; ms: number }

// ---------------------------------------------------------------- thresholds (SKILL.md §3–§5, §9)
const MIN_TEXT = 0.026; // of the short side: nothing readable below (P1), below 2.0% P0
const MIN_TEXT_P0 = 0.02;
const TITLE_MIN = 0.04, TITLE_MAX = 0.09; // of the frame height (P2 hint)
const READ_BASE = 0.5, READ_PER_WORD = 0.3, FINAL_LINE = 2;
const CONTRAST_P0 = 3, CONTRAST_P1 = 4.5;
const BURST_WINDOW = 0.15, BURST_MAX = 3; // > 3 independent things starting within 150 ms
const DEAD_STRETCH = 3; // s without any pixel change
const WOBBLE_MIN = 1.5; // s of small oscillation after landing
const MAX_HUES = 4;
const DOM_RATE = 15; // DOM probes per second
const FRAME_STEP = 1 / 3; // composite grid step (s)
const MAX_PER_RULE = 6;
const PROBE_BUDGET_MS = 12000; // per clip page; slower pages are probed on the composite grid only

// ---------------------------------------------------------------- in-page probe (plain JS: no transpiler helpers)
const PROBE_JS = String.raw`(() => {
  if (window.__taste) return;
  const ids = new WeakMap(); let next = 1;
  const refs = new Map();
  const idOf = (el) => { let i = ids.get(el); if (!i) { i = next++; ids.set(el, i); refs.set(i, new WeakRef(el)); } return i; };
  const descs = new WeakMap();
  const desc = (el) => {
    let d = descs.get(el); if (d) return d;
    const cls = String((el.getAttribute && el.getAttribute('class')) || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    d = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls.length ? '.' + cls.join('.') : '');
    descs.set(el, d); return d;
  };
  const GENERIC = new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','ui-rounded','emoji','math','fangsong','-apple-system','blinkmacsystemfont','inherit','initial']);
  const cv = document.createElement('canvas').getContext('2d');
  const fcache = new Map();
  const fams = (s) => String(s || '').split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  function avail(f, w, st, sample) {
    const k = f + '|' + w + '|' + st + '|' + sample;
    if (fcache.has(k)) return fcache.get(k);
    const m = (g) => { cv.font = st + ' ' + w + ' 64px "' + f + '", ' + g; const a = cv.measureText(sample).width; cv.font = st + ' ' + w + ' 64px ' + g; return Math.abs(a - cv.measureText(sample).width) > 0.05; };
    const r = m('monospace') || m('serif');
    fcache.set(k, r); return r;
  }
  function font(cs, text) {
    const list = fams(cs.fontFamily);
    const sample = text.slice(0, 32) || 'abc';
    const first = list[0] || 'serif';
    if (GENERIC.has(first.toLowerCase())) return [first.toLowerCase(), first.toLowerCase(), 0];
    if (avail(first, cs.fontWeight, cs.fontStyle, sample)) return [first, first, 0];
    let resolved = 'browser default';
    for (const f of list.slice(1)) {
      if (GENERIC.has(f.toLowerCase())) { resolved = f.toLowerCase(); break; }
      if (avail(f, cs.fontWeight, cs.fontStyle, sample)) { resolved = f; break; }
    }
    return [first, resolved, 1];
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const transparent = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const SHAPE = /^(img|canvas|video|path|rect|circle|ellipse|line|polyline|polygon|image|use|text)$/i;
  function ownText(el) { let s = ''; for (const c of el.childNodes) if (c.nodeType === 3) s += c.textContent; return s.replace(/\s+/g, ' ').trim(); }
  function paints(el, cs, txt) {
    if (txt) return 1;
    if (SHAPE.test(el.tagName)) return 1;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return 1;
    if (!transparent(cs.backgroundColor)) return 1;
    if (parseFloat(cs.borderTopWidth) + parseFloat(cs.borderLeftWidth) > 0 && !transparent(cs.borderTopColor)) return 1;
    if (cs.boxShadow && cs.boxShadow !== 'none') return 1;
    return 0;
  }
  const lastMeta = new Map();
  function probe() {
    const root = document.getElementById('stage') || document.body;
    const W = innerWidth, H = innerHeight;
    const opP = new Map();
    let base = 1;
    for (let a = root; a; a = a.parentElement) base *= Number(getComputedStyle(a).opacity) || 0;
    opP.set(root, base);
    const els = [], texts = [];
    const all = root.querySelectorAll('*');
    const range = document.createRange();
    for (let i = 0; i < all.length && i < 2500; i++) {
      const el = all[i];
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|defs|clipPath|mask|linearGradient|radialGradient|stop|filter|title)$/i.test(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const op = Number(cs.opacity);
      const prod = op * (opP.has(el.parentElement) ? opP.get(el.parentElement) : base);
      opP.set(el, prod);
      const eff = cs.visibility === 'hidden' ? 0 : prod;
      const r = el.getBoundingClientRect();
      const id = idOf(el);
      const pid = el.parentElement && el.parentElement !== root ? idOf(el.parentElement) : 0;
      const txt = ownText(el);
      const svg = el instanceof SVGElement;
      let geo = '';
      if (svg) for (const a of ['transform','x','y','cx','cy','r','rx','width','height','d','points','x1','y1','x2','y2']) { const v = el.getAttribute(a); if (v) geo += a + v; }
      const sig = hash([cs.transform, cs.translate, cs.scale, cs.rotate, cs.opacity, cs.filter, cs.clipPath, cs.visibility, cs.strokeDashoffset,
        svg ? hash(geo) : el.offsetLeft + ',' + el.offsetTop + ',' + el.offsetWidth + ',' + el.offsetHeight].join('|'));
      let rot = 0;
      if (cs.transform && cs.transform !== 'none') { try { const m = new DOMMatrixReadOnly(cs.transform); rot = Math.atan2(m.b, m.a) * 180 / Math.PI; } catch (e) {} }
      const full = r.width >= W * 0.98 && r.height >= H * 0.98 ? 1 : 0;
      if (els.length < 1500) els.push([id, pid, sig, +(r.left + r.width / 2).toFixed(2), +(r.top + r.height / 2).toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2), +rot.toFixed(2), +op.toFixed(3), +eff.toFixed(3), paints(el, cs, txt), full, hash(el.tagName + '.' + String((el.getAttribute && el.getAttribute('class')) || '').trim().split(/\s+/)[0])]);
      if (!txt || texts.length >= 250) continue;
      // text: union of the own text nodes' line boxes
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of el.childNodes) {
        if (c.nodeType !== 3 || !c.textContent.trim()) continue;
        range.selectNodeContents(c);
        for (const q of range.getClientRects()) { if (q.width < 0.5 || q.height < 0.5) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
      }
      if (!isFinite(x0)) continue;
      const css = parseFloat(cs.fontSize) || 0;
      let s = 1;
      if (svg && el.getScreenCTM) { const m = el.getScreenCTM(); if (m) s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); }
      else if (el.offsetWidth > 0 && el.offsetHeight > 0) s = Math.min(r.width / el.offsetWidth, r.height / el.offsetHeight);
      let b = el;
      if (!svg) while (b !== root && b.parentElement && b.parentElement !== root && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
      else b = el.closest('text') || el;
      const fill = svg ? cs.fill : (cs.webkitTextFillColor || cs.color);
      const clipText = !svg && /text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '');
      const [intended, resolved, fallback] = font(cs, txt);
      const meta = { text: txt.slice(0, 120), desc: desc(el), block: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100), bdesc: desc(b), intended, resolved, fallback, weight: cs.fontWeight };
      const mj = JSON.stringify(meta);
      const changed = lastMeta.get(id) !== mj;
      if (changed) lastMeta.set(id, mj);
      texts.push([id, idOf(b), +(css * s).toFixed(2), css, clipText || transparent(fill) ? '' : fill, +x0.toFixed(1), +y0.toFixed(1), +(x1 - x0).toFixed(1), +(y1 - y0).toFixed(1), +eff.toFixed(3), changed ? meta : 0, txt.length]);
    }
    return { els, texts };
  }
  function describe(list) {
    const out = {};
    for (const i of list) {
      const el = refs.get(i) && refs.get(i).deref();
      if (!el) continue;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const r = el.getBoundingClientRect();
      out[i] = desc(el) + (t ? ' "' + (t.length > 40 ? t.slice(0, 38) + '…' : t) + '"' : ' ' + Math.round(r.width) + '×' + Math.round(r.height) + 'px');
    }
    return out;
  }
  window.__taste = { probe, describe };
})()`;

// ---------------------------------------------------------------- types
type ElRec = [id: number, pid: number, sig: number, cx: number, cy: number, w: number, h: number, rot: number, op: number, eff: number, paints: number, full: number, kind: number];
type TxtMeta = { text: string; desc: string; block: string; bdesc: string; intended: string; resolved: string; fallback: number; weight: string };
type TxtRec = [id: number, block: number, px: number, css: number, color: string, x: number, y: number, w: number, h: number, eff: number, meta: TxtMeta | 0, chars: number];
interface Sample { t: number; els: Map<number, ElRec>; texts: TxtRec[] }
interface Box { x: number; y: number; w: number; h: number }

interface Source {
  idx: number;
  clipId: string;
  item?: Item;
  input: ClipInput;
  /** audited span in report time */
  t0: number; t1: number;
  /** report time → clip-local time */
  local: (t: number) => number;
  /** clip page px → frame px */
  map: (x: number, y: number) => [number, number];
  scale: number;
  opMul: number;
  /** the span is cut by the audit range (something visible at that edge may have started earlier / last longer) */
  openStart: boolean; openEnd: boolean;
}
interface Probed { src: Source; samples: Sample[]; fine: Sample[][]; meta: Map<number, TxtMeta>; frames: { t: number; png: Buffer }[]; names: Map<number, string>; errors: string[]; step: number; probeMs?: number }

interface Frame { t: number; buf: Buffer; luma: number; std: number; small: Buffer; sw: number; sh: number; flat: number; hasMedia: boolean }

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtT = (t: number) => `${t.toFixed(2)}s`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const LIN = Array.from({ length: 256 }, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const relLum = (r: number, g: number, b: number) => 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
function parseColor(c: string): [number, number, number, number] | null {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return null;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.slice(0, 3).some((x) => !isFinite(x))) return null;
  return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2]), p.length > 3 && isFinite(p[3]) ? p[3] : 1];
}
const hex = (rgb: number[]) => '#' + rgb.slice(0, 3).map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const quote = (s: string) => `"${s.length > 48 ? s.slice(0, 46) + '…' : s}"`;

function bgRgb(p: Project): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(p.background || '#000000');
  const n = m ? parseInt(m[1], 16) : 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

let bundled: string[] | null = null;
function bundledFonts() {
  if (!bundled) {
    try { bundled = [...new Set([...fs.readFileSync(path.join(RUNTIME_DIR, 'fonts.css'), 'utf8').matchAll(/font-family:'([^']+)'/g)].map((m) => m[1]))]; } catch { bundled = []; }
  }
  return bundled;
}

// ---------------------------------------------------------------- probing a clip page
async function probeSource(src: Source, p: Project, o: { times: number[]; step: number; grid: (k: number) => boolean; capture: boolean }): Promise<Probed> {
  const url = clipUrl(src.clipId, src.input);
  return withPage({ width: p.width, height: p.height }, async (page: Page, errors) => {
    await openClip(page, url, errors);
    await page.evaluate(PROBE_JS);
    const capture = o.capture ? await makeCapturer(page) : null;
    const meta = new Map<number, TxtMeta>();
    const run = async (t: number): Promise<Sample> => {
      const r = await page.evaluate(async (lt) => { await (window as any).__studio.seek(lt); return (window as any).__taste.probe(); }, src.local(t)) as { els: ElRec[]; texts: TxtRec[] };
      for (const x of r.texts) if (x[10]) meta.set(x[0], x[10] as TxtMeta);
      return { t, els: new Map(r.els.map((e) => [e[0], e])), texts: r.texts };
    };
    const samples: Sample[] = [];
    const frames: { t: number; png: Buffer }[] = [];
    // heavy pages (software WebGL: ~0.3 s per seek) fall back to the composite grid only, so a range stays within budget
    let step = o.step, coarse = false;
    const t0 = Date.now();
    for (let k = 0; k < o.times.length; k++) {
      if (coarse && !o.grid(k)) continue;
      samples.push(await run(o.times[k]));
      if (capture && o.grid(k)) frames.push({ t: o.times[k], png: await capture() });
      if (k === 5 && !coarse && ((Date.now() - t0) / 6) * (o.times.length - 6) > PROBE_BUDGET_MS) { coarse = true; step = o.times.length > 1 ? (o.times.findIndex((_, i) => i > 0 && o.grid(i)) || 1) * o.step : o.step; }
    }
    if (coarse) { // keep a uniform clock: drop the dense head samples that are off the grid
      const keep = new Set(o.times.filter((_, k) => o.grid(k)));
      samples.splice(0, samples.length, ...samples.filter((x) => keep.has(x.t)));
    }
    // refine candidate "everything at once" bursts at the project frame rate (one frame of context before)
    const fine: Sample[][] = [];
    for (const k of coarse ? [] : burstCandidates(samples).slice(0, 6)) {
      const a = Math.max(src.t0, samples[Math.max(0, k - 1)].t - 1 / p.fps), b = Math.min(src.t1 - 1e-3, samples[k].t + BURST_WINDOW + 2 / DOM_RATE);
      const seq: Sample[] = [];
      for (let t = a; t <= b + 1e-9; t += 1 / p.fps) seq.push(await run(t));
      fine.push(seq);
    }
    // names for everything that ever changed (for the report)
    const movedIds = new Set<number>();
    for (let k = 1; k < samples.length; k++) for (const [id, e] of samples[k].els) { const q = samples[k - 1].els.get(id); if (q && q[2] !== e[2]) movedIds.add(id); }
    const names = new Map<number, string>(Object.entries(await page.evaluate((ids) => (window as any).__taste.describe(ids), [...movedIds].slice(0, 400)).catch(() => ({})) as Record<string, string>).map(([k, v]) => [Number(k), v]));
    const rt = await page.evaluate(() => (window as any).__studio.errors as string[]).catch(() => []);
    return { src, samples, fine, meta, frames, names, errors: [...new Set([...errors, ...rt])], step, probeMs: Date.now() - t0 };
  });
}

// ---------------------------------------------------------------- motion helpers
const changed = (a: Sample | undefined, b: Sample, id: number) => { const x = a?.els.get(id), y = b.els.get(id); return !!x && !!y && x[2] !== y[2]; };

/** ids whose subtree paints something */
function contentIds(s: Sample): Set<number> {
  const out = new Set<number>();
  for (const e of s.els.values()) if (e[10]) { let id = e[0]; while (id && !out.has(id)) { out.add(id); id = s.els.get(id)?.[1] || 0; } }
  return out;
}

const offFrame = (e: ElRec, W: number, H: number) => e[3] + e[5] / 2 < 0 || e[3] - e[5] / 2 > W || e[4] + e[6] / 2 < 0 || e[4] - e[6] / 2 > H;
/** movers starting at sample k (was at rest at k-1), ignoring ambient movers; fine sequences need a known previous state (k ≥ 2) */
function startsAt(samples: Sample[], k: number, ambient: Set<number>, content: Set<number>, W: number, H: number, needPrev = false): number[] {
  const s = samples[k], prev = samples[k - 1], pp = samples[k - 2];
  if (!prev || (needPrev && !pp)) return [];
  const out: number[] = [];
  for (const e of s.els.values()) {
    const id = e[0];
    if (ambient.has(id) || !content.has(id) || !changed(prev, s, id)) continue;
    if (pp && changed(pp, prev, id)) continue; // already moving
    const pe = prev.els.get(id)!;
    const later = Math.max(samples[k + 1]?.els.get(id)?.[9] ?? 0, samples[k + 2]?.els.get(id)?.[9] ?? 0);
    if (Math.max(e[9], pe[9], later) < 0.05) continue; // invisible throughout
    if (e[5] * e[6] < 4 && pe[5] * pe[6] < 4) continue;
    if (offFrame(e, W, H) && offFrame(pe, W, H)) continue;
    out.push(id);
  }
  return out;
}
/** the element is on its way out: ~0.5 s after t it is gone or invisible (a shared exit is not "everything at once") */
function exiting(coarse: Sample[], t: number, id: number, W: number, H: number) {
  const s = coarse.find((x) => x.t >= t + 0.5) || coarse[coarse.length - 1];
  const before = [...coarse].reverse().find((x) => x.t < t - 1e-6)?.els.get(id);
  const e = s?.els.get(id);
  return !e || e[9] < 0.1 || (!!before && e[9] < 0.5 * before[9]) || offFrame(e, W, H);
}
function absorb(ids: number[], s: Sample): number[] {
  const set = new Set(ids);
  return ids.filter((id) => { let p = s.els.get(id)?.[1] || 0; while (p) { if (set.has(p)) return false; p = s.els.get(p)?.[1] || 0; } return true; });
}
function ambientIds(samples: Sample[]): Set<number> {
  const moving = new Map<number, number>();
  for (let k = 1; k < samples.length; k++) for (const id of samples[k].els.keys()) if (changed(samples[k - 1], samples[k], id)) moving.set(id, (moving.get(id) || 0) + 1);
  const out = new Set<number>();
  for (const [id, n] of moving) if (n >= 0.85 * (samples.length - 1) && samples.length > 6) out.add(id);
  return out;
}
function burstCandidates(samples: Sample[]): number[] {
  if (samples.length < 3) return [];
  const amb = ambientIds(samples);
  const W = 1e9, H = 1e9;
  const out: number[] = [];
  const step = samples[1].t - samples[0].t;
  const span = Math.ceil(BURST_WINDOW / step) + 1;
  const starts = samples.map((_, k) => (k ? absorb(startsAt(samples, k, amb, contentIds(samples[k]), W, H).filter((id) => !exiting(samples, samples[k].t, id, 1e9, 1e9)), samples[k]) : []));
  for (let k = 1; k < samples.length; k++) {
    if (out.length && k - out[out.length - 1] <= span + 1) continue;
    const ids = new Set<number>();
    for (let j = k; j < Math.min(samples.length, k + span); j++) starts[j].forEach((id) => ids.add(id));
    if (absorb([...ids], samples[Math.min(samples.length - 1, k + span - 1)]).length > BURST_MAX) out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------- pixels
async function analyzeFrame(t: number, buf: Buffer, bg: { r: number; g: number; b: number }, hasMedia: boolean): Promise<Frame> {
  const { data, info } = await sharp(buf).flatten({ background: bg }).resize({ width: 240 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let sum = 0, sq = 0;
  const lum = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 3) { const l = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255; lum[i] = l; sum += l; sq += l * l; }
  const mean = sum / n;
  // flatness: share of pixels far from the median colour
  const mr = median(Array.from({ length: Math.min(n, 4000) }, (_, i) => data[Math.floor((i * n) / Math.min(n, 4000)) * 3]));
  const mg = median(Array.from({ length: Math.min(n, 4000) }, (_, i) => data[Math.floor((i * n) / Math.min(n, 4000)) * 3 + 1]));
  const mb = median(Array.from({ length: Math.min(n, 4000) }, (_, i) => data[Math.floor((i * n) / Math.min(n, 4000)) * 3 + 2]));
  let off = 0;
  for (let j = 0; j < data.length; j += 3) if (Math.max(Math.abs(data[j] - mr), Math.abs(data[j + 1] - mg), Math.abs(data[j + 2] - mb)) > 24) off++;
  return { t, buf, luma: mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)), small: data, sw: info.width, sh: info.height, flat: off / n, hasMedia };
}
function diffFrac(a: Frame, b: Frame) {
  if (a.small.length !== b.small.length) return 1;
  let d = 0;
  for (let j = 0; j < a.small.length; j += 3) if (Math.abs(a.small[j] - b.small[j]) > 10 || Math.abs(a.small[j + 1] - b.small[j + 1]) > 10 || Math.abs(a.small[j + 2] - b.small[j + 2]) > 10) d++;
  return d / (a.small.length / 3);
}
const HUE_NAMES = ['red', 'red-orange', 'orange', 'amber', 'yellow', 'lime', 'green', 'green', 'green', 'spring green', 'cyan', 'cyan', 'azure', 'sky blue', 'blue', 'blue', 'indigo', 'violet', 'purple', 'magenta', 'magenta', 'pink', 'rose', 'crimson'];
function hueClusters(frames: Frame[]) {
  const bins = new Float64Array(24);
  let total = 0;
  for (const f of frames) {
    const d = f.small;
    for (let j = 0; j < d.length; j += 3) {
      total++;
      const r = d[j] / 255, g = d[j + 1] / 255, b = d[j + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
      if (mx < 0.3 || c / (mx || 1) < 0.45 || c < 0.18) continue;
      let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
      h = (h * 60 + 360) % 360;
      bins[Math.floor(h / 15) % 24]++;
    }
  }
  if (!total) return [];
  const on = Array.from(bins, (v) => v / total >= 0.001);
  // contiguous (circular) runs of active bins = one hue family
  const clusters: { share: number; name: string }[] = [];
  const startAt = on.findIndex((x) => !x);
  if (startAt < 0) return [{ share: 1, name: 'rainbow' }];
  let curC: number[] = [];
  for (let s = 1; s <= 24; s++) {
    const i = (startAt + s) % 24;
    if (on[i]) curC.push(i);
    if ((!on[i] || s === 24) && curC.length) {
      const share = curC.reduce((a, b) => a + bins[b], 0) / total;
      const peak = curC.reduce((a, b) => (bins[b] > bins[a] ? b : a), curC[0]);
      if (share >= 0.0025) clusters.push({ share, name: HUE_NAMES[peak] });
      curC = [];
    }
  }
  return clusters.sort((a, b) => b.share - a.share);
}

/** WCAG contrast of text (pixels near its colour) vs the background around it, from a composited frame */
async function measureContrast(buf: Buffer, bg: { r: number; g: number; b: number }, box: Box, color: [number, number, number], W: number, H: number) {
  const pad = Math.max(6, Math.round(box.h * 0.35));
  const L = clamp(Math.floor(box.x - pad), 0, W - 1), T = clamp(Math.floor(box.y - pad), 0, H - 1);
  const R = clamp(Math.ceil(box.x + box.w + pad), L + 1, W), B = clamp(Math.ceil(box.y + box.h + pad), T + 1, H);
  const ix0 = clamp(Math.floor(box.x), 0, W), iy0 = clamp(Math.floor(box.y), 0, H), ix1 = clamp(Math.ceil(box.x + box.w), 0, W), iy1 = clamp(Math.ceil(box.y + box.h), 0, H);
  if (ix1 - ix0 < 2 || iy1 - iy0 < 2) return null;
  const { data, info } = await sharp(buf).flatten({ background: bg }).extract({ left: L, top: T, width: R - L, height: B - T }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const dist = (j: number, c: number[]) => Math.max(Math.abs(data[j] - c[0]), Math.abs(data[j + 1] - c[1]), Math.abs(data[j + 2] - c[2]));
  const inner: number[] = [], far: number[] = [], ringFar: number[] = [], ringAll: number[] = [];
  let near = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const j = (y * info.width + x) * 3;
    const d = dist(j, color);
    const gx = x + L, gy = y + T;
    if (gx >= ix0 && gx < ix1 && gy >= iy0 && gy < iy1) { inner.push(j); if (d <= 40) near++; else far.push(j); }
    else { ringAll.push(j); if (d > 40) ringFar.push(j); }
  }
  if (!inner.length || near < Math.max(3, 0.02 * inner.length)) return null; // text colour not found → occluded / filtered: can't verify
  const bgPx = far.length >= 0.25 * inner.length ? far : ringFar.length >= 0.25 * ringAll.length && ringFar.length > 10 ? ringFar : ringAll.length ? ringAll : far;
  const med = (js: number[], o: number) => median(js.map((j) => data[j + o]));
  const bgc = bgPx.length ? [med(bgPx, 0), med(bgPx, 1), med(bgPx, 2)] : color;
  // text pixels: near the text colour and nearer to it than to the background
  const txt = inner.filter((j) => { const d = dist(j, color); return d <= 40 && d < dist(j, bgc); });
  const lt = txt.length >= 3 ? median(txt.map((j) => relLum(data[j], data[j + 1], data[j + 2]))) : relLum(color[0], color[1], color[2]);
  const lb = relLum(bgc[0], bgc[1], bgc[2]);
  return { ratio: ratio(lt, lb), lt, lb, bg: hex(bgc) };
}

// ---------------------------------------------------------------- the audit
interface Ctx {
  p: Project;
  mode: 'range' | 'clip';
  a: number; b: number;
  /** span ends at the end of the film → final-line rule */
  endsFilm: boolean;
  /** span starts at project t=0 → frame-0 rule */
  startsFilm: boolean;
  boundaries: { t: number; dip: boolean }[];
  label: (src: Source) => string;
}

async function runAudit(ctx: Ctx, sources: Source[], getFrames: (times: number[]) => Promise<{ frames: { t: number; buf: Buffer; hasMedia: boolean }[]; errors: string[] }>): Promise<TasteAudit> {
  const t00 = Date.now();
  const { p } = ctx;
  const W = p.width, H = p.height, short = Math.min(W, H);
  const bg = bgRgb(p);
  const issues: TasteIssue[] = [];
  const add = (i: TasteIssue) => issues.push({ ...i, t: i.t == null ? undefined : r2(i.t) });
  const domStep = Math.max(1 / DOM_RATE, (ctx.b - ctx.a) / 450);
  const frameEvery = Math.max(1, Math.round(Math.max(FRAME_STEP, (ctx.b - ctx.a) / 90) / domStep));
  const frameStep = frameEvery * domStep;

  // 1) DOM probes (clip pages) and composite grid in parallel
  // one global sample clock: DOM probes every domStep, composite grid every frameEvery-th probe (so they line up)
  const clock: number[] = [];
  for (let k = 0; ctx.a + k * domStep < ctx.b - 0.5 / p.fps; k++) clock.push(+(ctx.a + k * domStep).toFixed(4));
  const gridTimes = clock.filter((_, k) => k % frameEvery === 0);
  const seamTimes: number[] = [];
  for (const s of ctx.boundaries.slice(0, 8)) for (const d of [-2, -1, 0, 1]) { const t = s.t + d / p.fps; if (t >= ctx.a && t < ctx.b) seamTimes.push(+t.toFixed(4)); }
  const tp = Date.now();
  const [probed, comp] = await Promise.all([
    Promise.all(sources.map((s) => {
      const ks = clock.map((t, k) => [t, k] as const).filter(([t]) => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6);
      return probeSource(s, p, { times: ks.map((x) => x[0]), step: domStep, grid: (i) => ks[i][1] % frameEvery === 0, capture: ctx.mode === 'clip' })
        .catch((e) => ({ src: s, samples: [], fine: [], meta: new Map(), frames: [], names: new Map(), errors: ['probe failed: ' + (e as Error).message.split('\n')[0]], step: domStep } as Probed));
    })),
    getFrames([...gridTimes, ...seamTimes]),
  ]);
  const probeMs = Date.now() - tp;
  const errors = [...new Set([...probed.flatMap((x) => x.errors), ...comp.errors])];
  let frames: Frame[] = [];
  const allFrames = ctx.mode === 'clip' ? probed.flatMap((x) => x.frames.map((f) => ({ t: f.t, buf: f.png, hasMedia: false }))) : comp.frames;
  const ta = Date.now();
  frames = await Promise.all(allFrames.map((f) => analyzeFrame(f.t, f.buf, bg, f.hasMedia)));
  const grid = frames.filter((f) => !seamTimes.includes(f.t) || gridTimes.includes(f.t)).sort((x, y) => x.t - y.t);
  const frameAt = (t: number) => grid.find((f) => Math.abs(f.t - t) < 2e-3);

  // 2) TEXT -----------------------------------------------------------------
  interface BlockSample { k: number; t: number; vis: boolean; rest: boolean; box: Box | null; minPx: number; minCss: number; eff: number; groups: Map<string, Box> }
  interface Block { key: string; src: Source; id: number; text: string; desc: string; words: number; s: BlockSample[]; hidden?: boolean }
  const blocks = new Map<string, Block>();
  const fontUse = new Map<string, { n: number; where: string; t: number; fallback?: string }>();
  let minTextPx = Infinity, minTextWhere = '';
  const mapBox = (src: Source, x: number, y: number, w: number, h: number): Box => {
    const pts = [src.map(x, y), src.map(x + w, y), src.map(x, y + h), src.map(x + w, y + h)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  const union = (a: Box | null, b: Box): Box => (a ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) } : { ...b });
  const inFrame = (b: Box) => { const ix = Math.max(0, Math.min(W, b.x + b.w) - Math.max(0, b.x)), iy = Math.max(0, Math.min(H, b.y + b.h) - Math.max(0, b.y)); return b.w * b.h > 0 && (ix * iy) / (b.w * b.h) >= 0.5; };

  for (const pr of probed) {
    const { src, samples, meta } = pr;
    samples.forEach((s, k) => {
      const per = new Map<number, { vis: number; all: number; box: Box | null; minPx: number; minCss: number; eff: number; groups: Map<string, Box> }>();
      for (const x of s.texts) {
        const m = meta.get(x[0]);
        if (!m) continue;
        const eff = x[9] * src.opMul;
        const box = mapBox(src, x[5], x[6], x[7], x[8]);
        const px = x[2] * src.scale;
        const vis = eff >= 0.5 && inFrame(box) && px >= 3;
        let a = per.get(x[1]);
        if (!a) per.set(x[1], (a = { vis: 0, all: 0, box: null, minPx: Infinity, minCss: Infinity, eff: 0, groups: new Map() }));
        a.all += x[11];
        if (!vis) continue;
        a.vis += x[11];
        a.box = union(a.box, box);
        if (px < a.minPx) { a.minPx = px; a.minCss = x[3]; }
        a.eff = Math.max(a.eff, eff);
        if (x[4] && eff >= 0.9) a.groups.set(x[4], union(a.groups.get(x[4]) || null, box));
        // fonts
        const fam = m.intended;
        const u = fontUse.get(fam) || { n: 0, where: `${ctx.label(src)} · ${m.desc} ${quote(m.text)}`, t: s.t };
        u.n++;
        if (m.fallback) u.fallback = m.resolved;
        fontUse.set(fam, u);
      }
      for (const [bid, a] of per) {
        const key = `${src.idx}:${bid}`;
        let bl = blocks.get(key);
        const anyMeta = [...s.texts].reverse().find((x) => x[1] === bid);
        const m = anyMeta ? meta.get(anyMeta[0]) : undefined;
        if (!bl) blocks.set(key, (bl = { key, src, id: bid, text: m?.block || m?.text || '', desc: m?.bdesc || '', words: 0, s: [] }));
        if (m?.block && a.vis) { bl.text = m.block; bl.desc = m.bdesc; }
        const vis = a.all > 0 && a.vis >= 0.6 * a.all;
        if (vis) bl.words = Math.max(bl.words, words(bl.text));
        bl.s.push({ k, t: s.t, vis, rest: false, box: a.box, minPx: a.minPx, minCss: a.minCss, eff: a.eff, groups: a.groups });
      }
    });
    // rest = same box & opacity as the previous sample
    for (const bl of blocks.values()) {
      if (bl.src !== src) continue;
      for (let i = 1; i < bl.s.length; i++) {
        const x = bl.s[i], y = bl.s[i - 1];
        x.rest = x.vis && y.vis && y.k === x.k - 1 && !!x.box && !!y.box && Math.abs(x.box.x - y.box.x) < 0.75 && Math.abs(x.box.y - y.box.y) < 0.75 && Math.abs(x.box.w - y.box.w) < 0.75 && Math.abs(x.eff - y.eff) < 0.02;
      }
    }
  }

  // contrast (pixels) — on grid frames where the block is visible & at rest
  let worstContrast = Infinity, contrastChecked = 0;
  for (const bl of blocks.values()) {
    const cand = bl.s.filter((x) => x.rest && x.groups.size && frameAt(x.t));
    if (!cand.length) continue;
    // up to 3 spread samples; the median ratio (a one-off overlay or flash must not decide)
    const picks = [...new Set([0.5, 0.2, 0.8].map((q) => cand[Math.min(cand.length - 1, Math.floor(cand.length * q))]))];
    const results: { ratio: number; lb: number; color: string; bg: string; t: number }[] = [];
    let unverified = 0;
    for (const pick of picks) {
      const f = frameAt(pick.t)!;
      let worstHere: (typeof results)[number] | null = null;
      for (const [color, box] of pick.groups) {
        const c = parseColor(color);
        if (!c || c[3] < 0.5) continue;
        const m = await measureContrast(f.buf, bg, box, [c[0], c[1], c[2]], W, H);
        if (!m) { unverified++; continue; }
        contrastChecked++;
        if (!worstHere || m.ratio < worstHere.ratio) worstHere = { ratio: m.ratio, lb: m.lb, color: hex(c), bg: m.bg, t: pick.t };
      }
      if (worstHere) results.push(worstHere);
    }
    results.sort((x, y) => x.ratio - y.ratio);
    const worst = results.length ? results[(results.length - 1) >> 1] : null;
    const pick = worst ? { t: worst.t } : picks[0];
    // the text's colour is nowhere in its box and a layer sits above it → probably covered: don't judge this block
    if (!worst && unverified && ctx.mode === 'range' && bl.src.item) {
      const layers = visualLayers(p, pick.t);
      const idx = layers.findIndex((x) => x.id === bl.src.item!.id);
      if (idx >= 0 && idx < layers.length - 1) bl.hidden = true;
    }
    if (!worst) continue;
    worstContrast = Math.min(worstContrast, worst.ratio);
    if (worst.ratio < CONTRAST_P1) {
      const white = ratio(1, worst.lb), black = ratio(0, worst.lb);
      const better = white >= black ? `#ffffff (${white.toFixed(1)}:1)` : `#111111 (${black.toFixed(1)}:1)`;
      add({ t: pick.t, severity: worst.ratio < CONTRAST_P0 ? 'P0' : 'P1', rule: 'text.contrast', where: `${ctx.label(bl.src)} · ${bl.desc} ${quote(bl.text)}`,
        problem: `contrast ${worst.ratio.toFixed(2)}:1 (text ${worst.color} on ≈${worst.bg} measured) — needs ≥ ${CONTRAST_P1}:1`,
        fix: `make the text ${better}, or put a scrim sized to the text behind it (e.g. rgba(0,0,0,.6) on light footage)` });
    }
  }

  const blockList = [...blocks.values()].filter((b) => !b.hidden && b.s.some((x) => x.vis));
  for (const bl of blockList) {
    const where = `${ctx.label(bl.src)} · ${bl.desc} ${quote(bl.text)}`;
    const visS = bl.s.filter((x) => x.vis);
    const restS = visS.filter((x) => x.rest);
    const landed = restS.length ? restS : visS;
    // size: the landed size (largest at rest)
    const best = landed.reduce((a, x) => (x.minPx > a.minPx ? x : a), landed[0]);
    const px = best.minPx;
    if (px < minTextPx) { minTextPx = px; minTextWhere = where; }
    if (px < MIN_TEXT * short) {
      const need = Math.ceil(MIN_TEXT * short);
      const css = Math.ceil((best.minCss * need) / px);
      add({ t: best.t, severity: px < MIN_TEXT_P0 * short ? 'P0' : 'P1', rule: 'text.min-size', where,
        problem: `text renders at ${px.toFixed(1)}px — under ${(MIN_TEXT * 100).toFixed(1)}% of the ${short}px short side (${need}px), unreadable on a phone`,
        fix: `font-size ≥ ${css}px (currently ${r2(best.minCss)}px css → ${need}px on screen), or cut the text` });
    }
    // safe areas — at rest; skip giant background type (> 20% of height)
    if (restS.length && px <= 0.2 * H) {
      const s = restS.reduce((a, x) => (x.eff > a.eff ? x : a), restS[0]);
      const b = s.box!;
      const vertical = W / H < 0.7;
      if (b.x < -2 || b.y < -2 || b.x + b.w > W + 2 || b.y + b.h > H + 2) {
        add({ t: s.t, severity: 'P0', rule: 'text.cut-off', where, problem: `text box ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)} runs off the ${W}×${H} frame while it holds`, fix: 'move or wrap it fully inside the frame (inside the safe area)' });
      } else if (vertical) {
        const zones: string[] = [];
        if (b.y < 0.13 * H) zones.push(`top 15% (y < ${Math.round(0.15 * H)}px; text starts at y=${Math.round(b.y)})`);
        if (b.y + b.h > 0.70 * H) zones.push(`bottom 35% UI zone (y > ${Math.round(0.65 * H)}px; text ends at y=${Math.round(b.y + b.h)})`);
        if (b.x + b.w > 0.87 * W) zones.push(`right 15% button rail (x > ${Math.round(0.85 * W)}px; text ends at x=${Math.round(b.x + b.w)})`);
        if (zones.length) add({ t: s.t, severity: 'P1', rule: 'text.safe-area', where, problem: `9:16 platform UI covers it: ${zones.join('; ')}`, fix: `keep text within y ${Math.round(0.15 * H)}–${Math.round(0.65 * H)}px and x ≤ ${Math.round(0.85 * W)}px (captions ~600–700 px above the bottom)` });
      } else {
        const mx = 0.05 * W, my = 0.05 * H, tol = 0.005 * Math.max(W, H);
        if (b.x < mx - tol || b.y < my - tol || b.x + b.w > W - mx + tol || b.y + b.h > H - my + tol) {
          add({ t: s.t, severity: 'P1', rule: 'text.safe-area', where, problem: `outside title-safe 90% (box ${Math.round(b.x)},${Math.round(b.y)}–${Math.round(b.x + b.w)},${Math.round(b.y + b.h)})`, fix: `keep text inside ${Math.round(mx)}–${Math.round(W - mx)}px × ${Math.round(my)}–${Math.round(H - my)}px` });
        }
      }
    }
    // read time — visibility intervals (gaps of one sample merged)
    const iv: [number, number, number, number][] = []; // [tFirst, tLast, kFirst, kLast]
    for (const x of visS) {
      const last = iv[iv.length - 1];
      if (last && x.k - last[3] <= 2) { last[1] = x.t; last[3] = x.k; } else iv.push([x.t, x.t, x.k, x.k]);
    }
    const pq = probed.find((q) => q.src === bl.src)!;
    const nSamples = pq.samples.length, st = pq.step;
    const need = READ_BASE + READ_PER_WORD * Math.max(1, bl.words);
    for (const [t0, t1, k0, k1] of iv) {
      const openA = k0 === 0 && bl.src.openStart, openB = k1 === nSamples - 1 && bl.src.openEnd;
      if (openA || openB) continue;
      const dur = t1 - t0 + st;
      const isFinal = k1 === nSamples - 1 && ctx.endsFilm && Math.abs(bl.src.t1 - ctx.b) < 0.05;
      if (isFinal && dur < FINAL_LINE - st / 2) {
        add({ t: t0, severity: 'P1', rule: 'text.final-line', where, problem: `the final line is on screen ${dur.toFixed(2)} s — the last line needs ≥ ${FINAL_LINE} s`, fix: `bring it in ≥ ${(FINAL_LINE - dur).toFixed(1)} s earlier or extend the end hold` });
      } else if (dur < need - st / 2) {
        add({ t: t0, severity: dur < need / 2 && bl.words >= 2 ? 'P0' : 'P1', rule: 'text.read-time', where,
          problem: `${bl.words} word${bl.words === 1 ? '' : 's'} on screen ${dur.toFixed(2)} s — needs ≥ ${need.toFixed(1)} s (0.5 s + 0.3 s/word)`,
          fix: `hold it ≥ ${(need - dur).toFixed(1)} s longer, or cut it to ${Math.max(1, Math.floor((dur - READ_BASE) / READ_PER_WORD))} word(s)` });
      }
    }
  }
  // title size (P2 hint): the biggest multi-word line
  const titles = blockList.filter((b) => b.words >= 2 && b.words <= 8).map((b) => { const l = b.s.filter((x) => x.vis && x.rest); const m = l.length ? Math.max(...l.map((x) => x.minPx)) : 0; return { b, px: m, t: l[0]?.t }; }).filter((x) => x.px > 0).sort((x, y) => y.px - x.px);
  if (titles.length) {
    const tt = titles[0], pct = tt.px / H;
    if (pct < TITLE_MIN && tt.px >= MIN_TEXT * short) add({ t: tt.t, severity: 'P2', rule: 'text.title-size', where: `${ctx.label(tt.b.src)} · ${tt.b.desc} ${quote(tt.b.text)}`, problem: `the largest line is ${(pct * 100).toFixed(1)}% of frame height — titles read at 4–9%`, fix: `title font-size ≈ ${Math.round(0.06 * H)}px (6% of ${H})` });
    if (pct > TITLE_MAX * 1.15) add({ t: tt.t, severity: 'P2', rule: 'text.title-size', where: `${ctx.label(tt.b.src)} · ${tt.b.desc} ${quote(tt.b.text)}`, problem: `a ${tt.b.words}-word line at ${(pct * 100).toFixed(1)}% of frame height — titles sit at 4–9%`, fix: `≈ ${Math.round(0.08 * H)}px unless it is a deliberate one-word/number hero` });
  }
  // fonts
  for (const [fam, u] of fontUse) if (u.fallback) add({ t: u.t, severity: 'P0', rule: 'text.font-fallback', where: u.where, problem: `font "${fam}" never loaded — the text renders in ${u.fallback} (fallback)`, fix: `ship the font in the clip (assets/ + @font-face) or use a bundled family: ${bundledFonts().join(', ')}` });
  const fams = [...fontUse.keys()];
  if (fams.length > 2) add({ severity: 'P1', rule: 'text.font-count', where: fams.map((f) => `"${f}"`).join(', '), problem: `${fams.length} font families in ${ctx.mode === 'clip' ? 'one clip' : 'this range'} — max 2 (display + text)`, fix: `keep the design system's 2 families; replace ${fams.slice(2).map((f) => `"${f}"`).join(', ')}` });

  // 3) MOTION ---------------------------------------------------------------
  let maxStarters = 0;
  for (const pr of probed) {
    const S = pr.samples;
    if (S.length < 4 || pr.step > 0.1) continue; // too coarse to judge motion
    const amb = ambientIds(S);
    const label = ctx.label(pr.src);
    const descOf = (id: number) => pr.names.get(id) || `element #${id}`;
    // a) everything at once — refined bursts at the frame rate
    for (const seq of pr.fine) {
      if (seq.length < 4) continue;
      const last = seq[seq.length - 1];
      const content = contentIds(last);
      const first = new Map<number, number>(); // id → first frame it changed after rest
      for (let k = 2; k < seq.length; k++) for (const id of startsAt(seq, k, amb, content, W, H, true)) if (!first.has(id) && !exiting(S, seq[k].t, id, W, H)) first.set(id, k);
      const ks = [...new Set(first.values())].sort((x, y) => x - y);
      for (const k0 of ks) {
        const win = [...first].filter(([, k]) => k >= k0 && seq[k].t - seq[k0].t <= BURST_WINDOW + 1e-6).map(([id]) => id);
        const top = absorb(win, last);
        // look-alike siblings (same parent + tag/class) starting on different frames = one stagger; a field of ≥ 8 = one thing
        const groups = new Map<string, number[]>();
        for (const id of top) { const e = last.els.get(id) || seq[k0].els.get(id); const g = `${e?.[1] ?? 0}:${e?.[12] ?? 0}`; groups.set(g, [...(groups.get(g) || []), id]); }
        let things = 0;
        const parts: string[] = [];
        for (const ids of groups.values()) {
          const distinct = new Set(ids.map((id) => first.get(id))).size;
          const one = ids.length >= 8 || (ids.length > 1 && distinct > 1);
          things += one ? 1 : ids.length;
          if (one) parts.push(`${descOf(ids[0])} (+${ids.length - 1} ${distinct > 1 ? 'staggered' : 'alike'})`);
          else parts.push(...ids.map(descOf));
        }
        maxStarters = Math.max(maxStarters, things);
        if (things > BURST_MAX) {
          add({ t: seq[k0].t, severity: 'P1', rule: 'motion.all-at-once', where: `${label} · ${parts.slice(0, 5).join(' · ')}${parts.length > 5 ? ` · +${parts.length - 5} more` : ''}`,
            problem: `${things} independent elements start moving within ${Math.round(BURST_WINDOW * 1000)} ms — the eye can't track them (one focal motion at a time)`,
            fix: 'lead with the focal element; bring the others in after it is 30–50% done (staggers 60–120 ms, whole group ≤ 0.5 s) or keep them still' });
          break;
        }
      }
    }
    // per-element series
    const ids = new Set<number>();
    for (const s of S) for (const id of s.els.keys()) ids.add(id);
    const content = new Set<number>();
    for (const s of S) contentIds(s).forEach((id) => content.add(id));
    const textual = new Set<number>();
    for (const s of S) for (const x of s.texts) { let q = x[0]; while (q && !textual.has(q)) { textual.add(q); q = s.els.get(q)?.[1] || 0; } }
    let linearN = 0, wobbleN = 0;
    const winN = Math.ceil(WOBBLE_MIN / domStep) + 1;
    for (const id of ids) {
      if (!content.has(id)) continue;
      const mv = S.map((s, k) => (k ? changed(S[k - 1], s, id) : false));
      if (!mv.some(Boolean)) continue;
      // b) linear entrance: rest → constant-velocity move (≥ 4 interior intervals, ≤ 1.5 s) → rest, landed visible
      for (let k = 1; k < S.length && linearN < 2; k++) {
        if (!mv[k] || mv[k - 1]) continue;
        let e = k; while (e + 1 < S.length && mv[e + 1]) e++;
        const landed = e + 1 < S.length && (S[e].els.get(id)?.[9] ?? 0) >= 0.5;
        const dur = S[e].t - S[k - 1].t;
        if (landed && dur <= 1.5 && e - k + 1 >= 6 && !amb.has(id)) {
          const v: number[] = [];
          let uniform = true;
          for (let j = k + 1; j <= e - 1; j++) {
            const x = S[j - 1].els.get(id), y = S[j].els.get(id);
            if (!x || !y) { uniform = false; break; }
            const dw = Math.abs(y[5] - x[5]) / Math.max(1, x[5]), dh = Math.abs(y[6] - x[6]) / Math.max(1, x[6]);
            if (Math.abs(dw - dh) > 0.01 + 0.25 * Math.max(dw, dh)) { uniform = false; break; } // one-axis growth (progress bars) is not an entrance
            v.push(Math.hypot(y[3] - x[3], y[4] - x[4]) + 0.5 * (Math.abs(y[5] - x[5]) + Math.abs(y[6] - x[6])));
          }
          if (uniform && v.length >= 4 && Math.min(...v) > 0.5 && Math.max(...v) / Math.min(...v) <= 1.15) {
            linearN++;
            add({ t: S[k - 1].t, severity: 'P2', rule: 'motion.linear-entrance', where: `${label} · ${descOf(id)}`, problem: `enters at constant speed (${(median(v) / pr.step).toFixed(0)} px/s ±${(((Math.max(...v) - Math.min(...v)) / 2 / median(v)) * 100).toFixed(0)}%) over ${dur.toFixed(2)} s — linear easing`, fix: 'ease the entrance with expo.out / power4.out (linear only for constant motion: rotation, progress, scroll)' });
          }
        }
        k = e;
      }
      // c) idle wobble: a ≥ 1.5 s window of small back-and-forth (no big move inside it), visible
      if (wobbleN >= 2 || S.length < winN) continue;
      const area = (r: ElRec) => r[5] * r[6];
      const osc = (seg: ElRec[]) => {
        const ch = (f: (r: ElRec) => number, eps: number) => {
          const xs = seg.map(f);
          let rev = 0, dir = 0;
          for (let j = 1; j < xs.length; j++) { const d = xs[j] - xs[j - 1]; if (Math.abs(d) < eps) continue; const sg = Math.sign(d); if (dir && sg !== dir) rev++; dir = sg; }
          return { amp: Math.max(...xs) - Math.min(...xs), rev };
        };
        const size = Math.max(1, median(seg.map((r) => Math.max(r[5], r[6]))));
        const cx = ch((r) => r[3], 0.15), cy = ch((r) => r[4], 0.15), sc = ch((r) => Math.max(r[5], r[6]) / size, 0.0015), rt = ch((r) => r[7], 0.05), op = ch((r) => r[8], 0.005);
        if (cx.amp > 0.04 * short || cy.amp > 0.04 * short || sc.amp > 0.12 || rt.amp > 10) return null; // a real move, not a wobble
        const out = [
          cx.rev >= 2 && cx.amp >= 1 ? `x ±${(cx.amp / 2).toFixed(1)}px` : '', cy.rev >= 2 && cy.amp >= 1 ? `y ±${(cy.amp / 2).toFixed(1)}px` : '',
          sc.rev >= 2 && sc.amp >= 0.006 ? `scale ±${((sc.amp / 2) * 100).toFixed(1)}%` : '', rt.rev >= 2 && rt.amp >= 0.3 ? `rotate ±${(rt.amp / 2).toFixed(1)}°` : '',
          op.rev >= 2 && op.amp >= 0.04 && op.amp <= 0.6 ? `opacity ±${(op.amp / 2).toFixed(2)}` : '',
        ].filter(Boolean);
        return out.length ? out : null;
      };
      for (let k = 1; k + winN <= S.length; k++) {
        const segK = S.slice(k, k + winN);
        const seg = segK.map((s) => s.els.get(id)).filter(Boolean) as ElRec[];
        if (seg.length < winN || seg.some((r) => r[9] < 0.3)) continue;
        if (mv.slice(k, k + winN).filter(Boolean).length < 0.7 * winN) continue;
        if (!textual.has(id) && median(seg.map(area)) < 0.01 * W * H) continue;
        const o1 = osc(seg);
        if (!o1) continue;
        // extend while it keeps wobbling
        let e = k + winN;
        while (e < S.length && mv[e] && S[e].els.get(id) && osc(S.slice(k, e + 1).map((s) => s.els.get(id)!).filter(Boolean))) e++;
        const dur = S[e - 1].t - S[k].t;
        wobbleN++;
        add({ t: S[k].t, severity: 'P1', rule: 'motion.idle-wobble', where: `${label} · ${descOf(id)}`, problem: `keeps oscillating for ${dur.toFixed(1)} s (${o1.join(', ')}) — idle breathing/floating; landed elements hold dead still`, fix: 'remove the loop once it has landed; if something must move, make it a staged reveal or a camera move with intent (a beat pulse = one hit, then settle)' });
        break;
      }
    }
  }

  // 4) FRAMES ---------------------------------------------------------------
  const dead: [number, number][] = [];
  const diffs: number[] = [];
  for (let i = 1; i < grid.length; i++) diffs.push(diffFrac(grid[i - 1], grid[i]));
  {
    let s = -1;
    for (let i = 0; i <= diffs.length; i++) {
      const still = i < diffs.length && diffs[i] < 0.0005;
      if (still && s < 0) s = i;
      if (!still && s >= 0) {
        const t0 = grid[s].t, t1 = grid[i].t;
        if (t1 - t0 >= DEAD_STRETCH - 1e-6) dead.push([t0, t1]);
        s = -1;
      }
    }
  }
  for (const [t0, t1] of dead) {
    const atEnd = ctx.endsFilm && t1 >= grid[grid.length - 1].t - 1e-3;
    const isEnd = atEnd && t1 - t0 <= 4.5;
    const blank = frameAt(t0)!.flat < 0.003;
    add({ t: t0, severity: isEnd ? 'P2' : 'P1', rule: 'motion.dead-stretch', where: `${fmtT(t0)}–${fmtT(t1)}${blank ? ' (empty frame)' : ''}`,
      problem: `nothing changes for ${(t1 - t0).toFixed(1)}${atEnd ? '+' : ''} s${isEnd ? ' (end card — 2–3 s is enough)' : ''} — max 3 s without change`,
      fix: isEnd ? 'trim the end hold to 2–3 s' : 'cut the hold to ≤ 3 s or add a meaningful change in it (staged reveal on a VO word, a camera move with intent, the UI working)' });
  }
  // frame 0 = the thumbnail
  let frame0: Record<string, number> | undefined;
  if (ctx.startsFilm && grid.length) {
    const f = grid[0];
    frame0 = { luma: r2(f.luma), busy: r2(f.flat) };
    if (f.luma < 0.05 && f.std < 0.03) add({ t: f.t, severity: 'P0', rule: 'frame.first-frame', where: 'frame 0', problem: `frame 0 is near-black (mean luma ${f.luma.toFixed(3)}) — frame 0 is the thumbnail`, fix: 'open on the result, the pain, a bold number or a question — fully visible at t=0 (no fade-in from black)' });
    else if (f.flat < 0.003) add({ t: f.t, severity: 'P0', rule: 'frame.first-frame', where: 'frame 0', problem: `frame 0 is an empty flat colour (${(f.flat * 100).toFixed(2)}% of pixels differ) — frame 0 is the thumbnail`, fix: 'have the hook already on screen at t=0 (start entrances at ~their landed state or at t<0)' });
  }
  // flicker: a luma spike that returns, away from item boundaries
  const nearBoundary = (t0: number, t1: number) => ctx.boundaries.some((b) => b.t >= t0 - 1 / p.fps && b.t <= t1 + 1 / p.fps);
  for (let i = 1; i + 1 < grid.length; i++) {
    const a = grid[i - 1].luma, m = grid[i].luma, c = grid[i + 1].luma;
    if (Math.abs(m - a) > 0.18 && Math.abs(m - c) > 0.18 && Math.sign(m - a) === Math.sign(m - c) && Math.abs(c - a) < 0.06 && !nearBoundary(grid[i - 1].t, grid[i + 1].t)) {
      add({ t: grid[i].t, severity: 'P1', rule: 'frame.flicker', where: `${fmtT(grid[i - 1].t)}–${fmtT(grid[i + 1].t)}`, problem: `mean luminance jumps ${a.toFixed(2)} → ${m.toFixed(2)} → ${c.toFixed(2)} — a flash/flicker inside a shot`, fix: `render_frame around t=${grid[i].t.toFixed(2)}s and remove the one-off jump (opacity/visibility toggle, background swap, unloaded asset)` });
    }
  }
  // seams: a 1–2 frame flash at a cut
  if (ctx.mode === 'range') {
    for (const s of ctx.boundaries.slice(0, 8)) {
      if (s.dip) continue;
      const fs4 = [-2, -1, 0, 1].map((d) => frames.find((f) => Math.abs(f.t - (s.t + d / p.fps)) < 1e-3));
      if (fs4.some((f) => !f)) continue;
      const [a, x, y, c] = fs4 as Frame[];
      const side = Math.max(a.luma, c.luma), mid = Math.max(x.luma, y.luma);
      if (mid - side > 0.2) add({ t: s.t, severity: 'P1', rule: 'frame.seam-flash', where: `cut at ${fmtT(s.t)}`, problem: `a ${mid > 0.7 ? 'white ' : ''}flash at the seam (luma ${a.luma.toFixed(2)} → ${mid.toFixed(2)} → ${c.luma.toFixed(2)})`, fix: 'give both clips an opaque stage background and make the outgoing/incoming frames continuous (no blank frame at the cut)' });
    }
  }
  // palette: strongly saturated hue families (graphics frames only)
  const pal = hueClusters(grid.filter((f) => !f.hasMedia));
  if (pal.length > MAX_HUES) add({ severity: 'P2', rule: 'color.palette', where: pal.map((h) => `${h.name} ${(h.share * 100).toFixed(1)}%`).join(', '), problem: `${pal.length} strongly saturated hue families — accent colour everywhere`, fix: 'one accent on the key word / payoff / end card; move the other saturated colours to neutrals from the design system' });

  // ---------------------------------------------------------------- result
  const rank = { P0: 0, P1: 1, P2: 2 } as const;
  issues.sort((x, y) => rank[x.severity] - rank[y.severity] || (x.t ?? -1) - (y.t ?? -1));
  const perRule = new Map<string, number>();
  const kept: TasteIssue[] = [];
  let dropped = 0;
  for (const i of issues) { const n = perRule.get(i.rule) || 0; if (n >= MAX_PER_RULE) { dropped++; continue; } perRule.set(i.rule, n + 1); kept.push(i); }
  const domSamples = probed.reduce((a, x) => a + x.samples.length + x.fine.reduce((b, s) => b + s.length, 0), 0);
  const metrics: Record<string, unknown> = {
    mode: ctx.mode, timeBase: ctx.mode === 'clip' ? 'clip-local seconds' : 'project seconds', span: [r2(ctx.a), r2(ctx.b)], frame: `${W}x${H}`,
    clips: sources.map((s) => s.clipId),
    counts: { P0: kept.filter((i) => i.severity === 'P0').length, P1: kept.filter((i) => i.severity === 'P1').length, P2: kept.filter((i) => i.severity === 'P2').length, ...(dropped ? { droppedRepeats: dropped } : {}) },
    text: { blocks: blockList.length, minPx: isFinite(minTextPx) ? r2(minTextPx) : null, minPctShort: isFinite(minTextPx) ? r2((minTextPx / short) * 100) : null, minWhere: minTextWhere || undefined, worstContrast: isFinite(worstContrast) ? r2(worstContrast) : null, contrastChecks: contrastChecked },
    fonts: Object.fromEntries([...fontUse].map(([f, u]) => [f, u.fallback ? `FALLBACK→${u.fallback}` : 'ok'])),
    motion: { maxSimultaneousStarts: maxStarters, burstWindowsRefined: probed.reduce((a, x) => a + x.fine.length, 0) },
    frames: { deadStretches: dead.map(([a, b]) => [r2(a), r2(b)]), hues: pal.length, hueFamilies: pal.map((h) => h.name), ...(frame0 ? { frame0 } : {}), maxDiffStep: r2(frameStep) },
    samples: { dom: domSamples, domStep: r2(domStep), frames: frames.length, ...(probed.some((x) => x.step > domStep + 1e-6) ? { coarseClips: probed.filter((x) => x.step > domStep + 1e-6).map((x) => x.src.clipId) } : {}) },
    timings: { probeAndCompositeMs: probeMs, analysisMs: Date.now() - ta },
    ...(errors.length ? { errors: errors.slice(0, 4) } : {}),
  };
  return { issues: kept, metrics, ms: Date.now() - t00 };
}

// ---------------------------------------------------------------- public API
function layerMap(item: Item | undefined, p: Project) {
  const tr = item?.transform || {};
  const s = tr.scale ?? 1, rot = ((tr.rotate || 0) * Math.PI) / 180;
  const ox = ((tr.ox ?? 50) / 100) * p.width, oy = ((tr.oy ?? 50) / 100) * p.height;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const map = (x: number, y: number): [number, number] => {
    const dx = (x - ox) * s, dy = (y - oy) * s;
    return [ox + (tr.x || 0) + dx * cos - dy * sin, oy + (tr.y || 0) + dx * sin + dy * cos];
  };
  return { map, scale: s };
}

/** audit the composited timeline range [start, end] (project seconds) */
export async function auditRange(o: { start: number; end: number }): Promise<TasteAudit> {
  const store = cur();
  const p = store.project;
  const filmEnd = Math.max(0, ...p.items.map((i) => i.start + i.duration)) || p.duration;
  const a = Math.max(0, Math.min(o.start, o.end)), b = Math.min(Math.max(o.start, o.end), filmEnd || Math.max(o.start, o.end));
  if (!(b - a > 0.05)) throw new Error(`empty range ${a}–${b} (the timeline ends at ${filmEnd.toFixed(2)} s)`);
  const items = visualLayers(p).filter((i) => i.start < b && i.start + i.duration > a);
  const sources: Source[] = items.filter((i) => i.kind === 'clip' && store.clipInfo(i.ref)).map((i, idx) => {
    const { map, scale } = layerMap(i, p);
    const t0 = Math.max(a, i.start), t1 = Math.min(b, i.start + i.duration);
    return { idx, clipId: i.ref, item: i, input: itemInput(i, p), t0, t1, local: (t: number) => t - i.start + i.in, map, scale, opMul: i.opacity ?? 1, openStart: t0 > i.start + 1e-3, openEnd: t1 < i.start + i.duration - 1e-3 };
  }).filter((s) => s.t1 - s.t0 > 0.05);
  const dipTypes = /dip|flash|fade|white|burn/i;
  const boundaries: { t: number; dip: boolean }[] = [];
  for (const i of items) for (const [t, fx] of [[i.start, i.fx?.in], [i.start + i.duration, i.fx?.out]] as const) {
    if (t > a + 2 / p.fps && t < b - 2 / p.fps && !boundaries.some((x) => Math.abs(x.t - t) < 1 / p.fps)) boundaries.push({ t, dip: !!fx && dipTypes.test(String(fx.type)) });
  }
  boundaries.sort((x, y) => x.t - y.t);
  return runAudit({ p, mode: 'range', a, b, endsFilm: Math.abs(b - filmEnd) < 0.1, startsFilm: a < 0.5 / p.fps, boundaries, label: (s) => s.clipId }, sources, async (times) => {
    const r = await compositeFrames(times, { fmt: 'jpeg', workers: 2 });
    return { frames: times.map((t, i) => ({ t, buf: r.frames[i], hasMedia: visualLayers(p, t).some((x) => x.kind !== 'clip') })), errors: r.errors };
  });
}

/** audit one clip on its own (clip-local seconds); with itemId the clip gets that timeline item's params/trim */
export async function auditClip(clipId: string, o: { itemId?: string } = {}): Promise<TasteAudit> {
  const store = cur();
  const p = store.project;
  const info = store.clipInfo(clipId);
  if (!info) throw new Error('clip not found: ' + clipId);
  const item = o.itemId ? p.items.find((i) => i.id === o.itemId) : p.items.find((i) => i.kind === 'clip' && i.ref === clipId);
  if (o.itemId && !item) throw new Error('item not found: ' + o.itemId);
  const input: ClipInput = item ? itemInput(item, p) : { width: p.width, height: p.height, fps: p.fps, duration: info.duration || 5 };
  const a = item ? item.in : 0, b = item ? item.in + item.duration : info.duration || 5;
  const filmEnd = Math.max(0, ...p.items.map((i) => i.start + i.duration));
  const src: Source = { idx: 0, clipId, item, input, t0: a, t1: b, local: (t) => t, map: (x, y) => [x, y], scale: 1, opMul: 1, openStart: false, openEnd: false };
  return runAudit({ p, mode: 'clip', a, b, endsFilm: !!item && Math.abs(item.start + item.duration - filmEnd) < 0.1, startsFilm: !!item && item.start < 0.5 / p.fps && item.in < 0.5 / p.fps, boundaries: [], label: () => clipId }, [src], async () => ({ frames: [], errors: [] }));
}
