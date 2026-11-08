// import_url: bring images / video / audio from the web into media/ (direct files, the images of a web page, or
// video pages through yt-dlp when it is installed). Every file keeps its source URL in provenance.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { defineOp, type OpContext } from '../registry.ts';
import { uerr } from '../../i18n.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Smashcut';
const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB per file
const VIDEO_HOSTS = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|twitter\.com|x\.com|dailymotion\.com|twitch\.tv|reddit\.com|facebook\.com|bilibili\.com|loom\.com|streamable\.com)$/i;
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
};
const KNOWN_EXT = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov|m4v|mp3|m4a|wav|ogg|flac)$/i;

function checkUrl(u: string) {
  let url: URL;
  try { url = new URL(String(u).trim()); } catch { throw uerr('Not a valid URL: {url}', { url: u }); }
  if (!/^https?:$/.test(url.protocol)) throw uerr('Only http(s) links can be imported');
  return url;
}

const slugName = (s: string) => s.toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'web';

/** stream a URL to a file with a size cap; returns the content type */
async function download(url: string, file: string, signal: AbortSignal, referer?: string): Promise<{ type: string; bytes: number }> {
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try { res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', ...(referer ? { referer } : {}) }, redirect: 'follow', signal }); break; }
    catch (e: any) {
      // flaky networks (TLS resets): retry twice, then say what actually failed
      if (signal.aborted || attempt >= 2) throw uerr('Download failed: {error} for {url}', { error: e?.cause?.code || e?.cause?.message || e?.message, url });
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  if (!res.ok || !res.body) throw uerr('Download failed: HTTP {status} for {url}', { status: res.status, url });
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw uerr('File is larger than 1 GB: {url}', { url });
  const out = fs.createWriteStream(file);
  let bytes = 0;
  try {
    for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw uerr('File is larger than 1 GB: {url}', { url });
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    }
  } finally { await new Promise((r) => out.end(r)); }
  return { type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), bytes };
}

/** images (and videos) referenced by an HTML page, best candidates first */
export function pageMedia(html: string, base: string) {
  const abs = (u: string) => { try { return new URL(u.replace(/&amp;/g, '&').trim(), base).href; } catch { return null; } };
  const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(2).find((x) => x != null) ?? null;
  const og: string[] = [], imgs: { url: string; hint: number; alt: string }[] = [], videos: string[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(m[0], 'property') || attr(m[0], 'name') || '').toLowerCase();
    const c = attr(m[0], 'content');
    if (!c) continue;
    if (/^(og:image(:secure_url|:url)?|twitter:image(:src)?)$/.test(key)) { const u = abs(c); if (u) og.push(u); }
    if (/^og:video(:secure_url|:url)?$/.test(key)) { const u = abs(c); if (u) videos.push(u); }
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    // the largest srcset candidate, else src / data-src
    const srcset = attr(m[0], 'srcset') || attr(m[0], 'data-srcset');
    let best: string | null = null, hint = Number(attr(m[0], 'width')) || 0;
    if (srcset) {
      for (const part of srcset.split(',')) {
        const [u, d] = part.trim().split(/\s+/);
        const w = d?.endsWith('w') ? parseInt(d) : d?.endsWith('x') ? parseFloat(d) * 1000 : 0;
        if (u && w >= hint) { hint = w; best = u; }
      }
    }
    const u = abs(best || attr(m[0], 'src') || attr(m[0], 'data-src') || '');
    if (u && !u.startsWith('data:')) imgs.push({ url: u, hint, alt: attr(m[0], 'alt') || '' });
  }
  for (const m of html.matchAll(/<(video|source)\b[^>]*>/gi)) { const s = attr(m[0], 'src'); const u = s && abs(s); if (u && /\.(mp4|webm|mov)(\?|$)/i.test(u)) videos.push(u); }
  const seen = new Set<string>();
  const uniq = <T extends { url: string }>(xs: T[]) => xs.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
  return { og: uniq(og.map((url) => ({ url }))).map((x) => x.url), images: uniq(imgs), videos: [...new Set(videos)] };
}

/** nominal size of an SVG (width/height attributes, else the viewBox) — icons are tiny, illustrations big */
function svgSize(svg: string) {
  const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] || '';
  const num = (n: string) => parseFloat(new RegExp(`\\b${n}\\s*=\\s*["']?([\\d.]+)`, 'i').exec(tag)?.[1] || '0');
  const vb = /viewBox\s*=\s*["']?\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  return { width: num('width') || (vb ? +vb[1] : 0), height: num('height') || (vb ? +vb[2] : 0) };
}

function ytdlpBin() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['yt-dlp'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n')[0].trim() : null;
}

async function ytdlp(ctx: OpContext, url: string, audioOnly: boolean, maxHeight: number) {
  const bin = ytdlpBin();
  if (!bin) throw uerr('Video pages (YouTube, Vimeo, TikTok…) need yt-dlp: brew install yt-dlp (or pipx install yt-dlp)');
  const dir = ctx.tmp();
  const args = audioOnly
    ? ['-f', 'bestaudio/best', '-x', '--audio-format', 'm4a']
    : ['-f', `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]/b[height<=${maxHeight}][ext=mp4]/bv*[height<=${maxHeight}]+ba/b`, '--merge-output-format', 'mp4'];
  await new Promise<void>((resolve, reject) => {
    const p = spawn(bin, [...args, '--no-playlist', '--no-progress', '--newline', '-o', path.join(dir, '%(title).60s.%(ext)s'), url]);
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.stdout.on('data', (d) => { const m = /(\d+(?:\.\d+)?)%/.exec(String(d)); if (m) ctx.progress(Math.min(0.95, +m[1] / 100), 'downloading'); });
    ctx.signal.addEventListener('abort', () => p.kill('SIGTERM'), { once: true });
    p.on('close', (code) => (code === 0 ? resolve() : reject(uerr('yt-dlp failed: {error}', { error: err.trim().split('\n').slice(-2).join(' ') }))));
  });
  const file = fs.readdirSync(dir).find((f) => KNOWN_EXT.test(f));
  if (!file) throw uerr('yt-dlp produced no media file');
  return { tmp: path.join(dir, file), title: file.replace(/\.[^.]+$/, '') };
}

defineOp({
  id: 'import_url',
  title: 'Import from a link',
  category: 'convert',
  cost: 'medium',
  version: 1,
  cache: false,
  description: 'Download from the web into media/: a direct image / video / audio link; a web page (pick=auto takes its share image or the largest picture, pick=all every picture ≥ minSize px, pick=video the page video); or a video page (YouTube, Vimeo, TikTok, X, Instagram… via yt-dlp, up to maxHeight; audioOnly for the sound). The source URL is kept with each file. Use it for references, logos, product shots and footage the user points to — mind the rights before publishing anything you did not get from the user.',
  inputs: {
    url: { type: 'string', label: 'Link', required: true },
    pick: { type: 'enum', label: 'From a page', values: ['auto', 'og', 'largest', 'all', 'video'], default: 'auto', description: 'what to take when the link is a web page' },
    max: { type: 'number', label: 'Max files', min: 1, max: 40, step: 1, default: 12, description: 'pick=all' },
    minSize: { type: 'number', label: 'Min size, px', min: 0, max: 4000, default: 300, description: 'skip icons and thumbnails smaller than this (longest side)' },
    name: { type: 'string', label: 'File name', default: '', description: 'base name in media/ (default: from the link)' },
    audioOnly: { type: 'boolean', label: 'Audio only', default: false, description: 'video pages: keep just the sound (m4a)' },
    maxHeight: { type: 'number', label: 'Max video height', min: 144, max: 4320, step: 1, default: 1080 },
  },
  outputs: { files: { kind: 'json', description: '{files:[media/…], source, kind}' } },
  async run(ctx, p: any) {
    const url = checkUrl(p.url);
    const base = p.name ? slugName(p.name) : slugName(path.basename(url.pathname) || url.hostname);
    const prov = (from: string) => ctx.provenance({ source: from, page: url.href, fetchedAt: new Date().toISOString(), rights: 'unknown — check before publishing' });
    const save = async (tmp: string, ext: string, nameBase = base) => {
      if (ext === 'avif') { await sharp(tmp).png().toFile(tmp + '.png'); tmp += '.png'; ext = 'png'; } // media/ shows png/jpg/webp/gif/svg
      const rel = ctx.outAs(nameBase, ext);
      fs.renameSync(tmp, ctx.abs(rel));
      return rel;
    };

    // video pages → yt-dlp
    if (VIDEO_HOSTS.test(url.hostname) && !KNOWN_EXT.test(url.pathname)) {
      ctx.progress(0.02, 'downloading');
      const r = await ytdlp(ctx, url.href, !!p.audioOnly, p.maxHeight || 1080);
      prov(url.href);
      return { files: { files: [await save(r.tmp, path.extname(r.tmp).slice(1), p.name ? base : slugName(r.title))], source: url.href, kind: p.audioOnly ? 'audio' : 'video' } };
    }

    ctx.progress(0.05, 'downloading');
    const first = path.join(ctx.tmp(), 'dl');
    const { type } = await download(url.href, first, ctx.signal);
    const ext = EXT_BY_TYPE[type] || (KNOWN_EXT.exec(url.pathname)?.[1] || '').toLowerCase().replace('jpeg', 'jpg');
    if (ext && type !== 'text/html') {
      prov(url.href);
      return { files: { files: [await save(first, ext)], source: url.href, kind: type.split('/')[0] || 'file' } };
    }
    if (!/html|xml/.test(type)) throw uerr('Unsupported content at {url} ({type})', { url: url.href, type: type || 'unknown' });

    // a web page: pick its media
    const html = fs.readFileSync(first, 'utf8').slice(0, 5_000_000);
    const found = pageMedia(html, url.href);
    if (p.pick === 'video') {
      if (found.videos.length) {
        const v = path.join(ctx.tmp(), 'v');
        const { type: vt } = await download(found.videos[0], v, ctx.signal, url.href);
        prov(found.videos[0]);
        return { files: { files: [await save(v, EXT_BY_TYPE[vt] || 'mp4')], source: found.videos[0], kind: 'video' } };
      }
      if (ytdlpBin()) { const r = await ytdlp(ctx, url.href, !!p.audioOnly, p.maxHeight || 1080); prov(url.href); return { files: { files: [await save(r.tmp, path.extname(r.tmp).slice(1))], source: url.href, kind: 'video' } }; }
      throw uerr('No video found on {url}', { url: url.href });
    }
    const candidates = p.pick === 'og' ? found.og : p.pick === 'auto' ? [...found.og, ...found.images.map((x) => x.url)] : found.images.sort((a, b) => b.hint - a.hint).map((x) => x.url).concat(found.og);
    if (!candidates.length) throw uerr('No images found on {url}', { url: url.href });
    const want = p.pick === 'all' ? p.max || 12 : 1;
    const picked: { tmp: string; ext: string; w: number; h: number; src: string }[] = [];
    let tried = 0;
    for (const src of candidates) {
      if (picked.length >= (p.pick === 'largest' ? 40 : want) || tried >= 60) break;
      tried++;
      ctx.progress(0.1 + 0.8 * (tried / Math.min(60, candidates.length)), 'downloading');
      const tmp = path.join(ctx.tmp(), 'img' + tried);
      try {
        const { type: it } = await download(src, tmp, ctx.signal, url.href);
        const e = EXT_BY_TYPE[it] || (KNOWN_EXT.exec(new URL(src).pathname)?.[1] || '').toLowerCase().replace('jpeg', 'jpg');
        if (!e || !/^(png|jpg|webp|gif|svg|avif)$/.test(e)) continue;
        const m = e === 'svg' ? svgSize(fs.readFileSync(tmp, 'utf8')) : await sharp(tmp).metadata();
        const w = m.width || 0, h = m.height || 0;
        if (Math.max(w, h) < (p.minSize ?? 300)) continue;
        picked.push({ tmp, ext: e, w, h, src });
        if (p.pick === 'auto' || p.pick === 'og') break;
      } catch { /* skip broken candidates */ }
    }
    if (!picked.length) throw uerr('No images of at least {px}px found on {url}', { px: p.minSize ?? 300, url: url.href });
    const keep = p.pick === 'largest' ? [picked.sort((a, b) => b.w * b.h - a.w * a.h)[0]] : picked.slice(0, want);
    prov(keep.length === 1 ? keep[0].src : url.href);
    const files: string[] = [];
    for (const [i, k] of keep.entries()) files.push(await save(k.tmp, k.ext, keep.length > 1 ? `${base}-${i + 1}` : base));
    return { files: { files, source: url.href, kind: 'image', sizes: keep.map((k) => `${k.w}×${k.h}`) } };
  },
});
