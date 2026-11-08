import { uerr } from '../i18n.ts';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { cur } from '../project.ts';
import { bus } from '../bus.ts';
import { nid, slug, runOk, writeJson } from '../util.ts';
import { probeMedia } from '../media.ts';

/**
 * Programmatic web-page footage: a scripted Chromium session recorded through the CDP screencast
 * (real timestamps → constant-fps H.264). Optional demo cursor with smooth moves and click ripples.
 */
export type WebAction =
  | { type: 'wait'; ms: number }
  | { type: 'goto'; url: string }
  | { type: 'scroll'; to?: number | 'bottom' | 'top'; selector?: string; by?: number; duration?: number }
  | { type: 'click'; selector?: string; text?: string; x?: number; y?: number }
  | { type: 'hover'; selector?: string; text?: string; x?: number; y?: number }
  | { type: 'type'; selector?: string; text: string; delay?: number }
  | { type: 'press'; key: string }
  | { type: 'highlight'; selector?: string; text?: string; ms?: number }
  | { type: 'move'; x: number; y: number; duration?: number };

export interface WebRecordOptions {
  url: string;
  actions?: WebAction[];
  /** output frame (defaults to the project size) */
  width?: number;
  height?: number;
  fps?: number;
  device?: 'desktop' | 'mobile';
  /** UI zoom for desktop (1.5 = page laid out at 1280px wide for a 1920px video — bigger, crisper text) */
  zoom?: number;
  dark?: boolean;
  cursor?: boolean;
  hideScrollbars?: boolean;
  /** seconds to hold after the last action */
  tail?: number;
  name?: string;
  maxSeconds?: number;
  /** browser locale for the page (sites pick their language from it), default en-US */
  locale?: string;
}

export interface RecordJob { id: string; kind: 'web' | 'screen'; status: 'running' | 'done' | 'error'; stage: string; file?: string; duration?: number; error?: string; label: string; project?: string }
const jobs = new Map<string, RecordJob>();
export const recordJobs = () => { const id = cur().id; return [...jobs.values()].filter((j) => !j.project || j.project === id); };
export function emitJob(j: RecordJob) { jobs.set(j.id, j); bus.send({ type: 'record', job: { ...j } } as any); }

const CURSOR_JS = `(() => {
  if (window.__studioCursor) return;
  const install = () => {
    if (document.getElementById('__studio_cursor')) return;
    const c = document.createElement('div');
    c.id = '__studio_cursor';
    c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2l20 11.5-9 2.2L8.6 27z" fill="#111" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.35))', willChange: 'transform' });
    document.documentElement.appendChild(c);
    const st = document.createElement('style');
    st.textContent = '@keyframes __studio_ripple{from{transform:translate(-50%,-50%) scale(.2);opacity:.55}to{transform:translate(-50%,-50%) scale(1);opacity:0}}';
    document.documentElement.appendChild(st);
  };
  let x = -100, y = -100;
  window.__studioCursor = {
    get pos() { return { x, y }; },
    set(nx, ny) { install(); x = nx; y = ny; document.getElementById('__studio_cursor').style.transform = 'translate(' + (x - 3) + 'px,' + (y - 2) + 'px)'; },
    move(nx, ny, ms) {
      install();
      return new Promise((res) => {
        const x0 = x, y0 = y, t0 = performance.now();
        const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        // gentle arc for a human feel
        const mx = (x0 + nx) / 2 + (ny - y0) * 0.12, my = (y0 + ny) / 2 - (nx - x0) * 0.12;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / ms), e = ease(k);
          const ax = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * mx + e * e * nx;
          const ay = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * my + e * e * ny;
          window.__studioCursor.set(ax, ay);
          if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
    },
    click() {
      install();
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,255,255,.9)', boxShadow: '0 0 0 2px rgba(0,0,0,.25)', zIndex: 2147483646, pointerEvents: 'none', animation: '__studio_ripple .5s ease-out forwards' });
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 600);
      const c = document.getElementById('__studio_cursor');
      c.animate([{ transform: c.style.transform + ' scale(1)' }, { transform: c.style.transform + ' scale(.85)' }, { transform: c.style.transform + ' scale(1)' }], { duration: 220 });
    },
  };
})();`;

const HIDE_SCROLLBARS = '::-webkit-scrollbar{display:none!important}html{scrollbar-width:none!important}';

async function target(page: Page, a: { selector?: string; text?: string; x?: number; y?: number }) {
  if (a.x != null && a.y != null) return { x: a.x, y: a.y };
  const loc = a.selector ? page.locator(a.selector).first() : page.getByText(a.text || '', { exact: false }).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const b = await loc.boundingBox({ timeout: 8000 });
  if (!b) throw uerr('Element not found: {target}', { target: String(a.selector || a.text) });
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, loc };
}

// page scripts are passed as strings: the TS toolchain would otherwise inject helpers (__name) that the page lacks
const SMOOTH_SCROLL_JS = `(async ({ to, duration }) => {
  const y0 = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
  const y1 = Math.max(0, Math.min(max, to));
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  await new Promise((res) => {
    const step = (now) => { const k = Math.min(1, (now - t0) / duration); window.scrollTo(0, y0 + (y1 - y0) * ease(k)); if (k < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
})`;
async function smoothScroll(page: Page, to: number, duration: number) {
  await page.evaluate(`${SMOOTH_SCROLL_JS}(${JSON.stringify({ to, duration })})`);
}

export async function recordWeb(o: WebRecordOptions, job?: RecordJob): Promise<{ file: string; duration: number }> {
  const store = cur();
  const p = store.project;
  const W = Math.round((o.width || p.width) / 2) * 2, H = Math.round((o.height || p.height) / 2) * 2;
  const fps = o.fps || p.fps;
  const mobile = o.device === 'mobile' || (o.device == null && H > W);
  const zoom = mobile ? W / 390 : Math.max(0.5, Math.min(3, o.zoom ?? 1.5));
  const viewport = { width: Math.round(W / zoom), height: Math.round(H / zoom) };
  const maxMs = Math.min(180, o.maxSeconds || 120) * 1000;
  const stage = (s: string) => { if (job) { job.stage = s; emitJob(job); } };

  const browser = await chromium.launch({ args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
  const dir = store.p('.studio', 'cache', 'rec', nid());
  fs.mkdirSync(dir, { recursive: true });
  try {
    const ctx = await browser.newContext({
      viewport, deviceScaleFactor: zoom, isMobile: mobile, hasTouch: mobile,
      colorScheme: o.dark ? 'dark' : 'light', locale: o.locale || 'en-US',
      userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : undefined,
    });
    if (o.cursor !== false && !mobile) await ctx.addInitScript(CURSOR_JS);
    if (o.hideScrollbars !== false) await ctx.addInitScript(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(HIDE_SCROLLBARS)}; (document.head || document.documentElement).appendChild(s); })()`);
    const page = await ctx.newPage();
    stage('loading the page');
    await page.goto(o.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.waitForLoadState('load'));
    await page.waitForTimeout(600);
    if (o.cursor !== false && !mobile) await page.evaluate(({ width, height }) => (window as any).__studioCursor?.set(width * 0.62, height * 0.7), viewport);

    // screencast
    const cdp = await ctx.newCDPSession(page);
    const frames: { ts: number; file: string }[] = [];
    let n = 0;
    cdp.on('Page.screencastFrame', async (f: any) => {
      const file = path.join(dir, `${String(n++).padStart(6, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      frames.push({ ts: f.metadata.timestamp, file });
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    const t0 = Date.now();
    stage('recording');

    const cursor = o.cursor !== false && !mobile;
    const moveTo = async (x: number, y: number, ms = 700) => { if (cursor) await page.evaluate(({ x, y, ms }) => (window as any).__studioCursor?.move(x, y, ms), { x, y, ms }); else await page.mouse.move(x, y); };
    for (const a of o.actions || []) {
      if (Date.now() - t0 > maxMs) break;
      switch (a.type) {
        case 'wait': await page.waitForTimeout(Math.min(a.ms, maxMs)); break;
        case 'goto': await page.goto(a.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {}); break;
        case 'scroll': {
          const dur = a.duration ?? 1800;
          let to: number;
          if (a.selector) { const b = await page.locator(a.selector).first().boundingBox(); to = (await page.evaluate(() => scrollY)) + (b ? b.y - viewport.height * 0.2 : 0); }
          else if (a.by != null) to = (await page.evaluate(() => scrollY)) + a.by;
          else if (a.to === 'bottom') to = await page.evaluate(() => document.documentElement.scrollHeight);
          else if (a.to === 'top') to = 0;
          else to = Number(a.to || 0);
          await smoothScroll(page, to, dur);
          break;
        }
        case 'move': await moveTo(a.x, a.y, a.duration ?? 700); break;
        case 'hover': { const t = await target(page, a); await moveTo(t.x, t.y); await page.mouse.move(t.x, t.y); await page.waitForTimeout(250); break; }
        case 'click': {
          const t = await target(page, a);
          await moveTo(t.x, t.y);
          await page.mouse.move(t.x, t.y);
          await page.waitForTimeout(120);
          if (cursor) await page.evaluate(() => (window as any).__studioCursor?.click());
          await page.mouse.click(t.x, t.y);
          await page.waitForTimeout(450);
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          break;
        }
        case 'type': {
          if (a.selector) { const t = await target(page, a); await moveTo(t.x, t.y); if (cursor) await page.evaluate(() => (window as any).__studioCursor?.click()); await page.mouse.click(t.x, t.y); }
          await page.keyboard.type(a.text, { delay: a.delay ?? 70 });
          break;
        }
        case 'press': await page.keyboard.press(a.key); await page.waitForTimeout(300); break;
        case 'highlight': {
          const t = await target(page, a);
          await t.loc?.evaluate((el: Element, ms: number) => {
            const r = el.getBoundingClientRect();
            const h = document.createElement('div');
            Object.assign(h.style, { position: 'fixed', left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px', border: '3px solid #ff5a36', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,.35)', zIndex: '2147483645', pointerEvents: 'none', transition: 'opacity .3s' });
            document.documentElement.appendChild(h);
            setTimeout(() => { h.style.opacity = '0'; setTimeout(() => h.remove(), 350); }, ms);
          }, a.ms ?? 1600);
          await page.waitForTimeout((a.ms ?? 1600) + 400);
          break;
        }
      }
    }
    await page.waitForTimeout(Math.max(300, (o.tail ?? 1) * 1000));
    await cdp.send('Page.stopScreencast').catch(() => {});
    await page.waitForTimeout(150);
    const tEnd = Date.now();
    if (!frames.length) throw uerr('The page produced no frames');

    // constant-fps video from timestamped frames
    stage('encoding');
    frames.sort((a, b) => a.ts - b.ts);
    const endTs = frames[0].ts + (tEnd - t0) / 1000;
    const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.001, (frames[i + 1]?.ts ?? endTs) - f.ts).toFixed(4)}`).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`;
    fs.writeFileSync(path.join(dir, 'list.txt'), list);
    const name = `rec-${slug(o.name || new URL(o.url).hostname)}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.mp4`;
    const out = store.p('media', name);
    await runOk('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
      '-vf', `fps=${fps},scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out]);
    const info = await probeMedia(name, true);
    writeJson(store.p('.studio', 'media', name + '.source.json'), { kind: 'web', ...o });
    return { file: name, duration: info.duration };
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** a sensible default scenario: load, hold, scroll to the bottom smoothly, back to the top */
export function defaultWebActions(seconds = 10): WebAction[] {
  const s = Math.max(4, seconds);
  return [{ type: 'wait', ms: 1200 }, { type: 'scroll', to: 'bottom', duration: (s - 3.5) * 650 }, { type: 'wait', ms: 600 }, { type: 'scroll', to: 'top', duration: (s - 3.5) * 350 }];
}
