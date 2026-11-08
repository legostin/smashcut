// Image ops: remove_background, transform, adjust, sticker, palette, convert (sharp + local ML).
import path from 'node:path';
import sharp from 'sharp';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';
import { matte, detectObjects, BG_MODELS, type BgModel } from '../ml.ts';

const IMG = ['image'] as ('image')[];
const sameExt = (rel: string) => { const e = path.extname(rel).toLowerCase().slice(1); return e === 'jpeg' ? 'jpg' : ['png', 'jpg', 'webp'].includes(e) ? e : 'png'; };
type Sharp = ReturnType<typeof sharp>;
type Overlay = Exclude<Parameters<Sharp['composite']>[0], undefined>[number];
function encode(s: Sharp, ext: string, quality = 92) {
  if (ext === 'jpg') return s.jpeg({ quality, mozjpeg: true });
  if (ext === 'webp') return s.webp({ quality, alphaQuality: 100 });
  return s.png({ compressionLevel: 8 });
}
const rgba = (hex: string) => {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
};
const check = (ctx: OpContext) => { if (ctx.signal.aborted) throw ctx.signal.reason; };

/** decode any input image (EXIF-rotated, first frame of GIF, rasterised SVG) to raw RGBA */
async function readRGBA(abs: string) {
  const { data, info } = await sharp(abs, { animated: false }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
function hasTransparency(data: Buffer) { for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true; return false; }

/** cut out the subject: returns RGBA with the matte multiplied into the existing alpha */
async function cutout(ctx: OpContext, abs: string, model: BgModel, threshold = 0) {
  const src = path.join(ctx.tmp(), 'src.png');
  await sharp(abs, { animated: false }).rotate().png().toFile(src);
  ctx.progress(0.1, `loading model ${model} (first run downloads ${BG_MODELS[model].size})`);
  const m = await matte(src, model);
  check(ctx);
  const img = await readRGBA(src);
  if (img.width !== m.width || img.height !== m.height) throw new Error('matte size mismatch');
  const t = threshold * 255;
  for (let i = 0; i < m.mask.length; i++) {
    let a = m.mask[i];
    if (threshold > 0) a = a >= t ? 255 : 0;
    img.data[i * 4 + 3] = Math.round((img.data[i * 4 + 3] * a) / 255);
  }
  return { ...img, mask: m.mask };
}

defineOp({
  id: 'remove_background',
  title: 'Remove background',
  category: 'image',
  cost: 'slow',
  description: 'Cut the subject (product, person, object) out of a photo → PNG with transparent background, plus the grey-scale mask. Local ML: model "isnet" (default, general objects) or "modnet" (portraits, faster). First run downloads the model (isnet 176 MB / modnet 25 MB), then works offline. Use before sticker or to place a cut-out over a clip/footage. Struggles with hair against busy backgrounds and with transparent objects (glass).',
  limits: 'any resolution; inference runs at 1024 px and the matte is upscaled',
  inputs: {
    image: { type: 'file', label: 'Image', accept: IMG, required: true },
    model: { type: 'enum', label: 'Model', values: ['isnet', 'modnet'], default: 'isnet', description: 'isnet = objects/products/people; modnet = portrait matting (people only, fast)' },
    threshold: { type: 'number', label: 'Hard edge threshold', min: 0, max: 1, step: 0.05, default: 0, description: '0 = keep the soft matte; 0.5 = binary cut (no semi-transparent fringe)' },
    trim: { type: 'boolean', label: 'Trim to subject', default: false, description: 'crop away empty transparent borders' },
  },
  outputs: { image: { kind: 'image', description: 'PNG with alpha' }, mask: { kind: 'image', description: 'grey-scale matte (white = subject)' } },
  async run(ctx, p: { image: string; model: BgModel; threshold: number; trim: boolean }) {
    const c = await cutout(ctx, ctx.abs(p.image), p.model, p.threshold);
    ctx.progress(0.85, 'encoding');
    let left = 0, top = 0, w = c.width, h = c.height;
    if (p.trim) {
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (c.data[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) throw uerr('No subject found in {file}', { file: p.image });
      left = x0; top = y0; w = x1 - x0 + 1; h = y1 - y0 + 1;
    }
    const image = ctx.out('nobg', 'png');
    const mask = ctx.out('mask', 'png');
    await sharp(c.data, { raw: { width: c.width, height: c.height, channels: 4 } }).extract({ left, top, width: w, height: h }).png().toFile(ctx.abs(image));
    await sharp(Buffer.from(c.mask), { raw: { width: c.width, height: c.height, channels: 1 } }).extract({ left, top, width: w, height: h }).png().toFile(ctx.abs(mask));
    return { image, mask };
  },
});

defineOp({
  id: 'transform',
  title: 'Resize / crop / rotate / flip',
  category: 'image',
  cost: 'fast',
  description: 'Geometric edits of an image in one step, applied in this order: crop (px rectangle) → rotate (degrees, any angle) → flip → resize (width/height with fit). Leave a value at 0 to skip that step. For a different aspect ratio of footage use reframe instead.',
  inputs: {
    image: { type: 'file', label: 'Image', accept: IMG, required: true },
    cropX: { type: 'number', label: 'Crop x', min: 0, default: 0 },
    cropY: { type: 'number', label: 'Crop y', min: 0, default: 0 },
    cropW: { type: 'number', label: 'Crop width', min: 0, default: 0, description: '0 = no crop' },
    cropH: { type: 'number', label: 'Crop height', min: 0, default: 0 },
    rotate: { type: 'number', label: 'Rotate °', min: -360, max: 360, default: 0 },
    flip: { type: 'enum', label: 'Flip', values: ['none', 'horizontal', 'vertical', 'both'], default: 'none' },
    width: { type: 'number', label: 'Width', min: 0, max: 16384, default: 0, description: '0 = auto' },
    height: { type: 'number', label: 'Height', min: 0, max: 16384, default: 0, description: '0 = auto' },
    fit: { type: 'enum', label: 'Fit', values: ['inside', 'cover', 'contain', 'fill'], default: 'inside', description: 'inside = keep aspect within the box; cover = fill & crop; contain = letterbox with background; fill = stretch' },
    background: { type: 'color', label: 'Background', default: '#00000000', description: 'for rotate corners and contain padding (transparent by default; jpg flattens it)' },
    format: { type: 'enum', label: 'Format', values: ['same', 'png', 'jpg', 'webp'], default: 'same' },
  },
  outputs: { image: { kind: 'image' } },
  async run(ctx, p: any) {
    const meta = await sharp(ctx.abs(p.image)).rotate().toBuffer({ resolveWithObject: true });
    let s = sharp(meta.data);
    const W = meta.info.width, H = meta.info.height;
    if (p.cropW > 0 && p.cropH > 0) {
      if (p.cropX + p.cropW > W || p.cropY + p.cropH > H) throw uerr('Crop {w}×{h}+{x}+{y} is outside the {W}×{H} image', { w: p.cropW, h: p.cropH, x: p.cropX, y: p.cropY, W, H });
      s = sharp(await s.extract({ left: Math.round(p.cropX), top: Math.round(p.cropY), width: Math.round(p.cropW), height: Math.round(p.cropH) }).toBuffer());
    }
    const bg = rgba(p.background);
    if (p.rotate % 360 !== 0) s = sharp(await s.ensureAlpha().rotate(p.rotate, { background: bg }).toBuffer());
    if (p.flip === 'horizontal' || p.flip === 'both') s = s.flop();
    if (p.flip === 'vertical' || p.flip === 'both') s = s.flip();
    if (p.width > 0 || p.height > 0) s = s.resize({ width: p.width || undefined, height: p.height || undefined, fit: p.fit, background: bg });
    const ext = p.format === 'same' ? sameExt(p.image) : p.format;
    if (ext === 'jpg') s = s.flatten({ background: { ...bg, alpha: undefined } as any });
    const image = ctx.out('t', ext);
    await encode(s, ext).toFile(ctx.abs(image));
    return { image };
  },
});

type Box = { x: number; y: number; w: number; h: number };
/** "16:9" / "9:16" / "1.91" / "original" / "free" → width/height ratio (null = keep the box as is) */
function parseAspect(a: string, W: number, H: number): number | null {
  const v = String(a || 'free').trim().toLowerCase();
  if (!v || v === 'free') return null;
  if (v === 'original') return W / H;
  const m = /^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/.exec(v);
  if (m) return +m[1] / +m[2];
  if (+v > 0) return +v;
  throw uerr('Bad aspect “{a}” — use e.g. 16:9, 9:16, 1:1, 4:5, original or free', { a });
}
/** grow a box to an aspect around its centre, then fit it inside the image (shrinking if needed, keeping the aspect) */
function toAspect(b: Box, r: number | null, W: number, H: number): Box {
  let { w, h } = b;
  if (r) { if (w / h < r) w = h * r; else h = w / r; }
  const k = Math.min(1, W / w, H / h);
  w *= k; h *= k;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const x = Math.min(Math.max(0, cx - w / 2), W - w), y = Math.min(Math.max(0, cy - h / 2), H - h);
  return { x, y, w, h };
}
const pad = (b: Box, f: number): Box => ({ x: b.x - b.w * f, y: b.y - b.h * f, w: b.w * (1 + 2 * f), h: b.h * (1 + 2 * f) });

/** where the interesting stuff is: edge energy + saturation on a small copy, best box of (bw,bh) by integral image */
async function saliencyBox(buf: Buffer, W: number, H: number, bw: number, bh: number): Promise<Box> {
  const S = 160 / Math.max(W, H);
  const w = Math.max(8, Math.round(W * S)), h = Math.max(8, Math.round(H * S));
  const { data } = await sharp(buf).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const lum = new Float32Array(w * h), e = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = 0.299 * data[i * 3] + 0.587 * data[i * 3 + 1] + 0.114 * data[i * 3 + 2];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = lum[i + 1] - lum[i - 1], gy = lum[i + w] - lum[i - w];
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    e[i] = Math.hypot(gx, gy) + 0.35 * sat;
  }
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += e[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  const sw = Math.max(1, Math.round(bw * S)), sh = Math.max(1, Math.round(bh * S));
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y + sh <= h; y++) for (let x = 0; x + sw <= w; x++) {
    const sum = I[(y + sh) * (w + 1) + x + sw] - I[y * (w + 1) + x + sw] - I[(y + sh) * (w + 1) + x] + I[y * (w + 1) + x];
    // slight centre bias so flat images still crop to the middle
    const cx = (x + sw / 2) / w - 0.5, cy = (y + sh / 2) / h - 0.5;
    const score = sum * (1 - 0.25 * (cx * cx + cy * cy));
    if (score > best) { best = score; bx = x; by = y; }
  }
  return { x: Math.min(W - bw, bx / S), y: Math.min(H - bh, by / S), w: bw, h: bh };
}

defineOp({
  id: 'crop',
  title: 'Crop (smart)',
  category: 'image',
  cost: 'fast',
  version: 1,
  description: 'Crop an image the easy way. mode=aspect: the biggest frame of `aspect` (16:9, 9:16, 1:1, 4:5…) placed by `focus` (center, top, bottom, left, right, top-left…, "x,y" as 0–1 fractions, or auto = where the detail is), `zoom` > 1 crops tighter. mode=object: crop to a thing you name in `query` ("the red car", "a person\'s face", "the logo") — zero-shot detection. mode=subject: crop to the main subject (cut-out mask). mode=trim: cut away flat borders / transparent margins. mode=rect: `rect` = "x,y,w,h" in px, or 0–1 fractions. object/subject/trim add `padding` and can be forced to `aspect`. Optional output width/height.',
  inputs: {
    image: { type: 'file', label: 'Image', accept: IMG, required: true },
    mode: { type: 'enum', label: 'Mode', values: ['aspect', 'object', 'subject', 'trim', 'rect'], default: 'aspect' },
    aspect: { type: 'string', label: 'Aspect', default: '1:1', description: '16:9 · 9:16 · 1:1 · 4:5 · original · free' },
    focus: { type: 'string', label: 'Focus', default: 'auto', description: 'auto · center · top · bottom · left · right · top-left … · "0.3,0.4"' },
    zoom: { type: 'number', label: 'Zoom', min: 1, max: 10, step: 0.05, default: 1 },
    query: { type: 'string', label: 'Object', default: '', description: 'mode=object: what to crop to, in words (English works best)' },
    rect: { type: 'string', label: 'Rect', default: '', description: 'mode=rect: x,y,w,h (px, or 0–1 fractions)' },
    padding: { type: 'number', label: 'Padding', min: 0, max: 2, step: 0.01, default: 0.08, description: 'object/subject/trim: margin around the box, as a fraction of its size' },
    width: { type: 'number', label: 'Out width', min: 0, max: 16384, default: 0, description: '0 = crop size' },
    height: { type: 'number', label: 'Out height', min: 0, max: 16384, default: 0 },
    format: { type: 'enum', label: 'Format', values: ['same', 'png', 'jpg', 'webp'], default: 'same' },
  },
  outputs: { image: { kind: 'image' }, box: { kind: 'json', description: '{x,y,w,h} of the crop in source pixels, + detection score for mode=object' } },
  async run(ctx, p: any) {
    const src = ctx.abs(p.image);
    const { data: buf, info } = await sharp(src, { animated: false }).rotate().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;
    const r = parseAspect(p.mode === 'aspect' && (!p.aspect || p.aspect === 'free') ? 'original' : p.aspect, W, H);
    let box: Box, extra: Record<string, unknown> = {};
    if (p.mode === 'rect') {
      const v = String(p.rect || '').split(/[,\s]+/).map(Number);
      if (v.length !== 4 || v.some((x) => !(x >= 0))) throw uerr('rect must be x,y,w,h');
      const frac = v.every((x) => x <= 1);
      box = frac ? { x: v[0] * W, y: v[1] * H, w: v[2] * W, h: v[3] * H } : { x: v[0], y: v[1], w: v[2], h: v[3] };
    } else if (p.mode === 'aspect') {
      // the largest box of that aspect, shrunk by zoom, placed by focus
      let bw = W, bh = W / r!;
      if (bh > H) { bh = H; bw = H * r!; }
      bw /= p.zoom || 1; bh /= p.zoom || 1;
      const f = String(p.focus || 'auto').trim().toLowerCase();
      if (f === 'auto') box = await saliencyBox(buf, W, H, bw, bh);
      else {
        const xy = /^(\d*\.?\d+)\s*,\s*(\d*\.?\d+)$/.exec(f);
        const fx = xy ? +xy[1] : f.includes('left') ? 0 : f.includes('right') ? 1 : 0.5;
        const fy = xy ? +xy[2] : f.includes('top') ? 0 : f.includes('bottom') ? 1 : 0.5;
        box = { x: (W - bw) * Math.min(1, Math.max(0, fx)), y: (H - bh) * Math.min(1, Math.max(0, fy)), w: bw, h: bh };
      }
    } else {
      check(ctx);
      if (p.mode === 'object') {
        if (!String(p.query || '').trim()) throw uerr('mode=object needs query: what to crop to');
        ctx.progress(0.1, 'detecting');
        const tmp = ctx.tmp() + '/in.png';
        await sharp(buf).png().toFile(tmp);
        const hits = await detectObjects(tmp, [String(p.query).trim()], 0.03);
        if (!hits.length) throw uerr('Could not find “{q}” in the image — describe it differently or use mode=rect', { q: p.query });
        const b = hits[0].box;
        box = { x: b.xmin, y: b.ymin, w: b.xmax - b.xmin, h: b.ymax - b.ymin };
        extra = { label: hits[0].label, score: +hits[0].score.toFixed(3) };
      } else if (p.mode === 'subject') {
        ctx.progress(0.1, 'segmenting');
        const tmp = ctx.tmp() + '/in.png';
        await sharp(buf).png().toFile(tmp);
        const m = await matte(tmp, 'isnet');
        let x0 = m.width, y0 = m.height, x1 = -1, y1 = -1;
        for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (m.mask[y * m.width + x] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) throw uerr('No clear subject found — try mode=object with a query');
        const sx = W / m.width, sy = H / m.height;
        box = { x: x0 * sx, y: y0 * sy, w: (x1 - x0 + 1) * sx, h: (y1 - y0 + 1) * sy };
      } else {
        const t = await sharp(buf).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
        box = { x: -(t.info.trimOffsetLeft || 0), y: -(t.info.trimOffsetTop || 0), w: t.info.width, h: t.info.height };
      }
      box = toAspect(pad(box, p.padding ?? 0.08), p.aspect && p.aspect !== 'free' ? r : null, W, H);
    }
    // clamp & round
    let x = Math.max(0, Math.round(box.x)), y = Math.max(0, Math.round(box.y));
    let w = Math.round(Math.min(box.w, W - x)), h = Math.round(Math.min(box.h, H - y));
    if (w < 2 || h < 2) throw uerr('Crop is empty — check the parameters');
    let s = sharp(buf).extract({ left: x, top: y, width: w, height: h });
    if (p.width > 0 || p.height > 0) s = sharp(await s.toBuffer()).resize({ width: p.width || undefined, height: p.height || undefined, fit: 'cover' });
    const ext = p.format === 'same' ? sameExt(p.image) : p.format;
    if (ext === 'jpg') s = s.flatten({ background: '#000000' });
    const image = ctx.out('crop', ext);
    await encode(s, ext).toFile(ctx.abs(image));
    return { image, box: { x, y, w, h, ...extra } };
  },
});

defineOp({
  id: 'adjust',
  title: 'Adjust colour / blur / sharpen',
  category: 'image',
  cost: 'fast',
  description: 'Colour and detail corrections of an image: brightness, contrast, saturation (−1…1, 0 = unchanged), hue rotation (degrees), gaussian blur and sharpen. Alpha is preserved. Use for matching a still to the look of a video or for blurred backgrounds.',
  inputs: {
    image: { type: 'file', label: 'Image', accept: IMG, required: true },
    brightness: { type: 'number', label: 'Brightness', min: -1, max: 1, step: 0.05, default: 0 },
    contrast: { type: 'number', label: 'Contrast', min: -1, max: 1, step: 0.05, default: 0 },
    saturation: { type: 'number', label: 'Saturation', min: -1, max: 1, step: 0.05, default: 0, description: '−1 = greyscale' },
    hue: { type: 'number', label: 'Hue °', min: -180, max: 180, default: 0 },
    blur: { type: 'number', label: 'Blur (px σ)', min: 0, max: 100, step: 0.5, default: 0 },
    sharpen: { type: 'number', label: 'Sharpen', min: 0, max: 10, step: 0.1, default: 0 },
    format: { type: 'enum', label: 'Format', values: ['same', 'png', 'jpg', 'webp'], default: 'same' },
  },
  outputs: { image: { kind: 'image' } },
  async run(ctx, p: any) {
    let s = sharp(ctx.abs(p.image), { animated: false }).rotate();
    if (p.brightness || p.saturation || p.hue) s = s.modulate({ brightness: 1 + p.brightness, saturation: 1 + p.saturation, hue: Math.round(p.hue) });
    if (p.contrast) { const a = 1 + p.contrast; s = s.linear([a, a, a], [128 * (1 - a), 128 * (1 - a), 128 * (1 - a)]); }
    if (p.blur >= 0.3) s = s.blur(p.blur);
    if (p.sharpen > 0) s = s.sharpen({ sigma: 0.5 + p.sharpen * 0.5, m1: 1, m2: 2 + p.sharpen });
    const ext = p.format === 'same' ? sameExt(p.image) : p.format;
    const image = ctx.out('adj', ext);
    await encode(s, ext).toFile(ctx.abs(image));
    return { image };
  },
});

/** exact Euclidean distance (px) from every pixel to the nearest "inside" pixel (Felzenszwalb & Huttenlocher) */
function distanceToShape(inside: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = inside[i] ? 0 : INF;
  const pass = (n: number) => {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = grid[y * w + x]; pass(h); for (let y = 0; y < h; y++) grid[y * w + x] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = grid[y * w + x]; pass(w); for (let x = 0; x < w; x++) grid[y * w + x] = d[x]; }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

defineOp({
  id: 'sticker',
  title: 'Sticker (outline + shadow)',
  category: 'image',
  cost: 'medium',
  description: 'Turn a cut-out into a die-cut sticker: solid outline that follows the shape + soft drop shadow, on a transparent PNG with room for both. Input should already have a transparent background (remove_background output); with autoCut=true an opaque photo is cut out first. Great for product shots, faces and logos placed over footage.',
  inputs: {
    image: { type: 'file', label: 'Cut-out image', accept: IMG, required: true },
    outline: { type: 'number', label: 'Outline px', min: 0, max: 200, default: 14 },
    outlineColor: { type: 'color', label: 'Outline colour', default: '#ffffff' },
    shadow: { type: 'number', label: 'Shadow opacity', min: 0, max: 1, step: 0.05, default: 0.45 },
    shadowBlur: { type: 'number', label: 'Shadow blur px', min: 0, max: 100, default: 14 },
    shadowX: { type: 'number', label: 'Shadow x', min: -200, max: 200, default: 0 },
    shadowY: { type: 'number', label: 'Shadow y', min: -200, max: 200, default: 10 },
    shadowColor: { type: 'color', label: 'Shadow colour', default: '#000000' },
    autoCut: { type: 'boolean', label: 'Auto cut-out', default: true, description: 'if the image has no transparency, remove its background first (isnet)' },
  },
  outputs: { image: { kind: 'image', description: 'PNG with alpha' } },
  async run(ctx, p: any) {
    let img = await readRGBA(ctx.abs(p.image));
    if (!hasTransparency(img.data)) {
      if (!p.autoCut) throw uerr('{file} has no transparent background — run remove_background first or set autoCut', { file: p.image });
      img = await cutout(ctx, ctx.abs(p.image), 'isnet');
    }
    check(ctx);
    ctx.progress(0.6, 'outline');
    const blurPad = p.shadow > 0 ? Math.ceil(p.shadowBlur * 2) : 0;
    const pad = Math.ceil(p.outline + 2 + Math.max(blurPad + Math.max(Math.abs(p.shadowX), Math.abs(p.shadowY)), 0));
    const W = img.width + pad * 2, H = img.height + pad * 2;
    // shape alpha on the padded canvas
    const alpha = new Uint8Array(W * H);
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) alpha[(y + pad) * W + x + pad] = img.data[(y * img.width + x) * 4 + 3];
    const inside = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) inside[i] = alpha[i] >= 128 ? 1 : 0;
    const dist = distanceToShape(inside, W, H);
    check(ctx);
    // outline alpha: 1 inside radius, anti-aliased 1 px edge; union with the soft original alpha
    const r = p.outline;
    const outA = Buffer.alloc(W * H);
    for (let i = 0; i < W * H; i++) outA[i] = Math.max(alpha[i], r > 0 ? Math.round(Math.max(0, Math.min(1, r - dist[i] + 0.5)) * 255) : 0);
    const oc = rgba(p.outlineColor);
    const solid = (c: { r: number; g: number; b: number }, a: Buffer, mul = 1) => {
      const b = Buffer.alloc(W * H * 4);
      for (let i = 0; i < W * H; i++) { b[i * 4] = c.r; b[i * 4 + 1] = c.g; b[i * 4 + 2] = c.b; b[i * 4 + 3] = Math.round(a[i] * mul); }
      return sharp(b, { raw: { width: W, height: H, channels: 4 } });
    };
    const layers: Overlay[] = [];
    if (p.shadow > 0) {
      const sh = await solid(rgba(p.shadowColor), outA, p.shadow).png().toBuffer();
      const shifted = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: sh, left: Math.round(p.shadowX), top: Math.round(p.shadowY) }]).png().toBuffer();
      layers.push({ input: p.shadowBlur >= 0.3 ? await sharp(shifted).blur(p.shadowBlur / 2).png().toBuffer() : shifted });
    }
    if (r > 0) layers.push({ input: await solid(oc, outA).png().toBuffer() });
    layers.push({ input: await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer(), left: pad, top: pad });
    ctx.progress(0.85, 'compositing');
    const image = ctx.out('sticker', 'png');
    await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers).png().toFile(ctx.abs(image));
    return { image };
  },
});

defineOp({
  id: 'palette',
  title: 'Extract colour palette',
  category: 'image',
  cost: 'fast',
  description: 'Find the N dominant colours of an image (k-means, transparent pixels ignored) → JSON [{hex, rgb, share}] sorted by share, plus a swatch PNG. Use to derive design tokens (set_design colors) from a brand photo, logo or key frame (extract_frames first for video).',
  inputs: {
    image: { type: 'file', label: 'Image', accept: IMG, required: true },
    count: { type: 'number', label: 'Colours', min: 2, max: 16, step: 1, default: 6 },
  },
  outputs: { colors: { kind: 'json', description: '{colors:[{hex,rgb:[r,g,b],share}]}' }, swatch: { kind: 'image' } },
  async run(ctx, p: { image: string; count: number }) {
    const { data } = await sharp(ctx.abs(p.image), { animated: false }).rotate().resize(96, 96, { fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const px: number[][] = [];
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) px.push([data[i], data[i + 1], data[i + 2]]);
    if (!px.length) throw uerr('{file} is fully transparent', { file: p.image });
    const k = Math.min(Math.round(p.count), px.length);
    // deterministic k-means++-style init: start at the most "average" pixel, then repeatedly the farthest one
    const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const mean = [0, 1, 2].map((c) => px.reduce((s, x) => s + x[c], 0) / px.length);
    let centers = [px.reduce((best, x) => (d2(x, mean) < d2(best, mean) ? x : best))].map((x) => [...x]);
    while (centers.length < k) {
      let far = px[0], fd = -1;
      for (const x of px) { const m = Math.min(...centers.map((c) => d2(x, c))); if (m > fd) { fd = m; far = x; } }
      centers.push([...far]);
    }
    const assign = new Int32Array(px.length);
    for (let it = 0; it < 24; it++) {
      const sum = centers.map(() => [0, 0, 0, 0]);
      px.forEach((x, i) => { let bi = 0, bd = Infinity; centers.forEach((c, j) => { const dd = d2(x, c); if (dd < bd) { bd = dd; bi = j; } }); assign[i] = bi; const s = sum[bi]; s[0] += x[0]; s[1] += x[1]; s[2] += x[2]; s[3]++; });
      const next = sum.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centers[j]));
      const moved = next.some((c, j) => d2(c, centers[j]) > 0.25);
      centers = next;
      if (!moved) break;
    }
    const counts = centers.map((_, j) => assign.filter((a) => a === j).length);
    const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const colors = centers.map((c, j) => ({ hex: hex(c), rgb: c.map(Math.round), share: +(counts[j] / px.length).toFixed(3) })).filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
    const sw = 96;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw * colors.length}" height="${sw}">${colors.map((c, i) => `<rect x="${i * sw}" y="0" width="${sw}" height="${sw}" fill="${c.hex}"/>`).join('')}</svg>`;
    const swatch = ctx.out('palette', 'png');
    await sharp(Buffer.from(svg)).png().toFile(ctx.abs(swatch));
    return { colors: { colors }, swatch };
  },
});

defineOp({
  id: 'convert',
  title: 'Convert image format',
  category: 'convert',
  cost: 'fast',
  description: 'Convert an image to PNG (lossless, keeps alpha), JPG (smallest for photos; transparency is flattened onto `background`) or WebP (small, keeps alpha). Optionally limit the longest side.',
  inputs: {
    image: { type: 'file', label: 'Image', accept: IMG, required: true },
    format: { type: 'enum', label: 'Format', values: ['png', 'jpg', 'webp'], default: 'webp' },
    quality: { type: 'number', label: 'Quality', min: 1, max: 100, default: 90 },
    maxSize: { type: 'number', label: 'Max side px', min: 0, max: 16384, default: 0, description: '0 = keep size' },
    background: { type: 'color', label: 'Background (jpg)', default: '#ffffff' },
  },
  outputs: { image: { kind: 'image' } },
  async run(ctx, p: any) {
    let s = sharp(ctx.abs(p.image), { animated: false }).rotate();
    if (p.maxSize > 0) s = s.resize({ width: p.maxSize, height: p.maxSize, fit: 'inside', withoutEnlargement: true });
    if (p.format === 'jpg') { const b = rgba(p.background); s = s.flatten({ background: { r: b.r, g: b.g, b: b.b } }); }
    const image = ctx.out('conv', p.format);
    await encode(s, p.format, p.quality).toFile(ctx.abs(image));
    return { image };
  },
});
