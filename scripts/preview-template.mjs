#!/usr/bin/env node
// Standalone preview of a clip or music template without the editor server.
//   node scripts/preview-template.mjs gallery/clips/<id> [out.png] [frames=8]
//   node scripts/preview-template.mjs gallery/music/<id> [out.wav]
// Serves /runtime, /vendor, /fonts and the repo, renders a contact sheet (clips) or WAV (music),
// prints runtime errors. Exit code 1 if the template reported errors.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!target) { console.error('usage: preview-template.mjs <dir> [out] [frames]'); process.exit(2); }
const dir = path.resolve(target);
const rel = path.relative(ROOT, dir).split(path.sep).join('/');
const isMusic = fs.existsSync(path.join(dir, 'score.js'));
const out = path.resolve(process.argv[3] || path.join(dir, isMusic ? 'preview.wav' : 'preview.png'));
const frames = Number(process.argv[4] || 8);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
function resolveUrl(u) {
  const p = decodeURIComponent(u.split('?')[0].split('#')[0]);
  if (p.startsWith('/runtime/')) return path.join(ROOT, p);
  if (p === '/vendor/gsap.min.js' || p.startsWith('/vendor/gsap/')) return path.join(ROOT, 'node_modules/gsap/dist', p === '/vendor/gsap.min.js' ? 'gsap.min.js' : p.slice('/vendor/gsap/'.length));
  if (p === '/vendor/Tone.js') return path.join(ROOT, 'node_modules/tone/build/Tone.js');
  if (p.startsWith('/fonts/')) return path.join(ROOT, 'node_modules/@fontsource', p.slice('/fonts/'.length));
  return path.join(ROOT, p);
}
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/design')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"colors":[],"type":[],"motion":[],"spacing":[]}'); }
  if (req.url.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  const f = resolveUrl(req.url);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = false;
try {
  if (isMusic) {
    const page = await browser.newPage();
    page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));
    page.on('pageerror', (e) => { failed = true; console.error('[pageerror]', e.message); });
    await page.goto(`${base}/runtime/music.html?src=/${rel}/score.js`);
    const r = await page.evaluate(async () => window.__music.render(44100));
    fs.writeFileSync(out, Buffer.from(r.wav, 'base64'));
    console.log(JSON.stringify({ ...r.meta, peak: r.peak, out }, null, 2));
    if (r.peak < 0.01) { failed = true; console.error('silent output'); }
  } else {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const W = 1920, H = 1080;
    const duration = manifest.duration || 5;
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));
    page.on('pageerror', (e) => { failed = true; console.error('[pageerror]', e.message); });
    const hash = encodeURIComponent(JSON.stringify({ width: W, height: H, fps: 30, duration, timing: false }));
    await page.goto(`${base}/${rel}/index.html#${hash}`);
    await page.evaluate(() => window.__studio.ready);
    const shots = [];
    for (let i = 0; i < frames; i++) {
      const t = (duration * (i + 0.5)) / frames;
      await page.evaluate((t) => window.__studio.seek(t), t);
      shots.push({ t, b64: (await page.screenshot({ type: 'png', omitBackground: true })).toString('base64') });
    }
    const errs = await page.evaluate(() => window.__studio.errors);
    if (errs.length) { failed = true; console.error('runtime errors:', errs); }
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 100 } });
    const cols = 4;
    await sheet.setContent(`<body style="margin:0;background:#0b0b0d;font:14px monospace;color:#aaa"><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${shots.map((s) => `<div><div style="background:repeating-conic-gradient(#222 0 25%,#2c2c2c 0 50%) 0 0/24px 24px"><img style="width:100%;display:block" src="data:image/png;base64,${s.b64}"></div><div>t=${s.t.toFixed(2)}s</div></div>`).join('')}</div></body>`);
    await sheet.waitForLoadState('load');
    await sheet.screenshot({ path: out, fullPage: true });
    console.log(JSON.stringify({ id: manifest.id, duration, frames, out }));
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
