import { uerr } from '../i18n.ts';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import sharp from 'sharp';
import { chromium, type Page, type CDPSession, type Locator } from 'playwright-core';
import { cur } from '../project.ts';
import { bus } from '../bus.ts';
import { nid, slug, writeJson } from '../util.ts';
import { bin } from '../bin.ts';
import { probeMedia } from '../media.ts';
import { ensureBrowser } from '../render/browser.ts';
import { getSession } from './session.ts';

/**
 * Programmatic web-page footage for product demos.
 *
 * Capture is deterministic by default: the page runs on Chrome's virtual time (timers, Date, performance.now and
 * <video> advance only when we say so), requestAnimationFrame gets the virtual timestamp and CSS/WAAPI animations are
 * scrubbed to it — so every output frame is exactly 1/fps apart, with no dropped or doubled frames however heavy the
 * page is. Frames are PNG screenshots at the native output resolution (the browser itself renders at the right device
 * scale — text is never upscaled) and the camera (auto-zoom) is a clip of the page re-rendered at the zoomed scale,
 * so zoomed text stays vector-sharp. Cursor, scroll, typing and camera moves are computed per frame here.
 * `realtime: true` falls back to a live screencast (native resolution, frames picked by timestamp; no camera).
 */
type Target = { selector?: string; text?: string; x?: number; y?: number };
export type WebAction =
  | { type: 'wait'; ms?: number; selector?: string; text?: string; idle?: boolean; timeout?: number; cut?: boolean }
  | { type: 'goto'; url: string }
  | ({ type: 'scroll'; to?: number | 'bottom' | 'top'; by?: number; screens?: number; duration?: number } & Target)
  | ({ type: 'click'; zoom?: number | false } & Target)
  | ({ type: 'hover'; zoom?: number | false } & Target)
  | ({ type: 'type'; text: string; delay?: number; clear?: boolean; zoom?: number | false } & Omit<Target, 'text'> & { target?: string })
  | { type: 'press'; key: string }
  | ({ type: 'highlight'; ms?: number } & Target)
  | { type: 'move'; x: number; y: number; duration?: number }
  | ({ type: 'zoom'; level?: number; duration?: number } & Target)
  | ({ type: 'swipe'; direction?: 'up' | 'down' | 'left' | 'right'; distance?: number; duration?: number } & Target);

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
  /** camera: zoom into what is clicked / typed into and ease back out (true = 1.8×, or a number 1.2–3) */
  autoZoom?: boolean | number;
  /** a login saved with the "Log in for recordings" window (.studio/sessions/<name>.json) */
  session?: string;
  /** hide cookie banners and chat widgets (default true) */
  clean?: boolean;
  /** extra CSS selectors to hide */
  hide?: string[];
  /** render at 2× and downsample (sharper photos / thin lines; slower) */
  hidpi?: boolean;
  /** live screencast instead of deterministic frames (fallback for pages that misbehave on virtual time) */
  realtime?: boolean;
}

export interface RecordJob { id: string; kind: 'web' | 'screen'; status: 'running' | 'done' | 'error'; stage: string; file?: string; duration?: number; error?: string; label: string; project?: string }
const jobs = new Map<string, RecordJob>();
export const recordJobs = () => { const id = cur().id; return [...jobs.values()].filter((j) => !j.project || j.project === id); };
export function emitJob(j: RecordJob) { jobs.set(j.id, j); bus.send({ type: 'record', job: { ...j } } as any); }

// ---------- in-page helpers (strings: the TS toolchain would inject helpers the page lacks) ----------
/** rAF gets the (virtual) performance.now; __studio.frame() scrubs CSS/WAAPI animations to it and applies cursor/scroll */
export const PAGE_JS = `(() => {
  if (window.__studio) return;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => cb(performance.now()));
  const own = new WeakMap();
  let scroller = null, cursorOn = false, cx = -100, cy = -100, frameNo = 0;
  const el = (id) => document.getElementById(id);
  const install = () => {
    if (el('__studio_cursor') || !document.documentElement) return;
    const st = document.createElement('style');
    st.id = '__studio_style';
    st.textContent = '@keyframes __studio_ripple{from{transform:translate(-50%,-50%) scale(.15);opacity:.6}to{transform:translate(-50%,-50%) scale(1);opacity:0}}';
    document.documentElement.appendChild(st);
    const c = document.createElement('div');
    c.id = '__studio_cursor';
    c.innerHTML = '<svg width="28" height="32" viewBox="0 0 28 32"><path d="M3 2.5v23.2l6.1-5.6 3.9 9.2 4.3-1.9-3.9-9h8.3z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-200px,-200px)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))', transformOrigin: '3px 2px', display: 'none' });
    document.documentElement.appendChild(c);
    const f = document.createElement('div');
    f.id = '__studio_finger';
    Object.assign(f.style, { position: 'fixed', left: '0', top: '0', width: '46px', height: '46px', margin: '-23px 0 0 -23px', borderRadius: '50%', background: 'rgba(255,255,255,.55)', border: '2px solid rgba(255,255,255,.9)', boxShadow: '0 2px 10px rgba(0,0,0,.35)', zIndex: 2147483647, pointerEvents: 'none', opacity: '0' });
    document.documentElement.appendChild(f);
  };
  const ripple = (x, y, size) => {
    const r = document.createElement('div');
    Object.assign(r.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px', borderRadius: '50%', background: 'rgba(255,255,255,.85)', boxShadow: '0 0 0 2px rgba(0,0,0,.22)', zIndex: 2147483646, pointerEvents: 'none', animation: '__studio_ripple .55s cubic-bezier(.2,.7,.3,1) forwards' });
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
  };
  const canScroll = (e) => { if (e.scrollHeight <= e.clientHeight + 4) return false; const s = getComputedStyle(e).overflowY; return s === 'auto' || s === 'scroll' || s === 'overlay'; };
  const mainScroller = () => {
    const se = document.scrollingElement || document.documentElement;
    if (se.scrollHeight > innerHeight + 4) return se;
    let best = null, area = 0, n = 0;
    for (const e of document.body ? document.body.querySelectorAll('*') : []) {
      if (++n > 6000) break;
      if (!canScroll(e)) continue;
      const r = e.getBoundingClientRect(), a = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (a > area) { area = a; best = e; }
    }
    return best || se;
  };
  const scrollerOf = (node) => { for (let e = node && node.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) if (canScroll(e)) return e; return document.scrollingElement || document.documentElement; };
  const isDoc = (s) => s === document.scrollingElement || s === document.documentElement || s === document.body;
  window.__studio = {
    /** pick the scroller (the element's nearest, or the page's main one); returns its scroll state */
    scroller(node) {
      scroller = node ? scrollerOf(node) : mainScroller();
      const doc = isDoc(scroller), h = doc ? innerHeight : scroller.clientHeight;
      const top = doc ? 0 : scroller.getBoundingClientRect().top;
      const out = { y: scroller.scrollTop, max: Math.max(0, scroller.scrollHeight - h), h, top };
      if (node) { const r = node.getBoundingClientRect(); out.elTop = r.top - top; out.elH = r.height; }
      return out;
    },
    /** one frame: apply cursor / scroll / finger, then scrub animations to the virtual clock */
    frame(s) {
      install();
      if (s.scroll != null && scroller) { if (isDoc(scroller)) window.scrollTo({ left: scrollX, top: s.scroll, behavior: 'instant' }); else scroller.scrollTo({ top: s.scroll, behavior: 'instant' }); }
      const c = el('__studio_cursor');
      if (c && s.cursor) { cx = s.cursor[0]; cy = s.cursor[1]; cursorOn = s.cursor[2] !== 0; c.style.display = cursorOn ? 'block' : 'none'; c.style.transform = 'translate(' + (cx - 3) + 'px,' + (cy - 2) + 'px) scale(' + (s.cursor[3] || 1) + ')'; }
      const f = el('__studio_finger');
      if (f && s.finger) { f.style.transform = 'translate(' + s.finger[0] + 'px,' + s.finger[1] + 'px) scale(' + (s.finger[3] || 1) + ')'; f.style.opacity = String(s.finger[2]); }
      if (s.ripple) ripple(s.ripple[0], s.ripple[1], s.ripple[2] || 64);
      if (s.sync) {
        // scrub to the virtual clock. Animations are kept *running* at a crawl (a paused one can stall Chrome's
        // screenshot under virtual time) and re-seeked every frame; a page pause / resume rebases them.
        const v = performance.now(), fc = ++frameNo;
        for (const a of document.getAnimations()) {
          // scroll-driven animations follow the scroll we set; only clock-driven ones are scrubbed
          if (a.playState !== 'running' || a.timeline !== document.timeline || typeof a.currentTime !== 'number') continue;
          let st = own.get(a);
          if (!st || st.seen !== fc - 1) {
            const rate = st ? st.rate : (a.playbackRate || 1);
            st = { rate, base: v - (a.currentTime || 0) / rate, seen: fc };
            own.set(a, st);
            a.playbackRate = rate > 0 ? 0.02 : -0.02;
          }
          st.seen = fc;
          try { a.currentTime = (v - st.base) * st.rate; } catch (e) {}
        }
      }
      return [scrollX, scrollY];
    },
    ready() {
      const imgs = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 2 && i.loading !== 'lazy'; });
      return document.readyState === 'complete' && (!document.fonts || document.fonts.status === 'loaded') && imgs.every((i) => i.complete);
    },
  };
})();`;

const HIDE_SCROLLBARS = '::-webkit-scrollbar{display:none!important}*{scrollbar-width:none!important}';
/** common cookie / consent banners and chat launchers — they cover the product in every shot */
const CLEAN_SELECTORS = ['#onetrust-consent-sdk', '#onetrust-banner-sdk', '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay', '#usercentrics-root', '#usercentrics-cmp-ui', '.qc-cmp2-container', '#didomi-host', '#truste-consent-track', '.truste_overlay', '.truste_box_overlay', '.osano-cm-window', '#hs-eu-cookie-confirmation', '.fc-consent-root', '#cmpbox', '#cmpbox2', '.cc-window', '.cc-banner', '.cookie-banner', '#cookie-banner', '#cookieBanner', '.cookie-consent', '#cookie-consent', '#cookie-notice', '.cookie-notice', '#gdpr-cookie-message', '.gdpr-banner', '[id^="sp_message_container"]', '[aria-label="cookieconsent"]', '[data-testid="cookie-policy-banner"]', '#intercom-container', '.intercom-lightweight-app', '#intercom-frame', '#hubspot-messages-iframe-container', '.crisp-client', '#drift-widget-container', '#drift-frame-controller', 'iframe#launcher', '#launcher-frame', '.tawk-min-container', '#fc_frame', '[class*="CookieBanner"]', '[class*="cookie-banner"]', '[id*="cookie-banner"]'];
const styleScript = (css: string) => `(() => { const add = () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); })()`;

// ---------- easing / helpers ----------
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
/** a finger flick: accelerate with the finger, then decelerate like momentum scrolling (C1-continuous) */
const FLICK_A = 0.22, FLICK_C = (3 * FLICK_A) / (2 + FLICK_A);
const flick = (k: number) => (k < FLICK_A ? FLICK_C * (k / FLICK_A) ** 2 : FLICK_C + (1 - FLICK_C) * easeOutCubic((k - FLICK_A) / (1 - FLICK_A)));
function prng(seed: string) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEBUG = !!process.env.STUDIO_REC_DEBUG;
/** a CDP call that must not hang the recording */
function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let to: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, rej) => { to = setTimeout(() => rej(new Error(what + ' timed out')), ms); })]).finally(() => clearTimeout(to));
}
const desktopUA = (version: string) => {
  const major = (version.match(/\d+/) || ['140'])[0];
  const os = process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
};
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// ---------- encoder: RGB frames → H.264 (yuv420p, BT.709, CRF 16, 1 s GOP for snappy scrubbing) ----------
class Encoder {
  private proc: ChildProcess;
  private err = '';
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private fade: { from: Buffer; n: number; i: number } | null = null;
  private failure: Error | null = null;
  last: Buffer | null = null;
  frames = 0;
  private closed: Promise<number>;
  constructor(out: string, private W: number, private H: number, fps: number) {
    this.proc = spawn(bin('ffmpeg'), ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-framerate', String(fps), '-i', 'pipe:0',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-g', String(Math.round(fps)),
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.proc.stderr!.on('data', (d) => { this.err = (this.err + d).slice(-2000); });
    this.proc.stdin!.on('error', () => {});
    this.closed = new Promise((res) => { this.proc.on('close', (c) => res(c ?? 1)); this.proc.on('error', (e) => { this.err += String(e.message); res(1); }); });
  }
  /** decode (PNG/JPEG), fit to the frame, optional crossfade, write — pipelined with the next capture */
  push(img: Buffer): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    this.pending++;
    this.chain = this.chain.then(async () => {
      if (this.failure) return;
      let raw = await sharp(img).removeAlpha().resize(this.W, this.H, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer();
      if (this.fade) {
        const { from, n } = this.fade, a = easeInOut((++this.fade.i) / (n + 1));
        const mix = Buffer.allocUnsafe(raw.length);
        for (let i = 0; i < raw.length; i++) mix[i] = from[i] + (raw[i] - from[i]) * a;
        if (this.fade.i >= n) this.fade = null;
        raw = mix;
      }
      await this.write(raw);
    }).catch((e) => { this.failure ??= e; }).finally(() => { this.pending--; });
    return this.pending > 3 ? this.chain.then(() => { if (this.failure) throw this.failure; }) : Promise.resolve();
  }
  private async write(raw: Buffer) {
    this.last = raw; this.frames++;
    if (this.proc.exitCode != null || this.proc.stdin!.destroyed) throw new Error('ffmpeg stopped: ' + this.err.trim().split('\n').slice(-2).join(' '));
    if (!this.proc.stdin!.write(raw)) await Promise.race([new Promise<void>((r) => this.proc.stdin!.once('drain', () => r())), this.closed]);
  }
  /** the next n pushed frames blend in from the last written one */
  async crossfade(n: number) { await this.chain; if (this.last && n > 0) this.fade = { from: this.last, n, i: 0 }; }
  async end() {
    await this.chain;
    if (this.failure) throw this.failure;
    this.proc.stdin!.end();
    const code = await this.closed;
    if (code !== 0) throw new Error('ffmpeg: ' + this.err.trim().split('\n').slice(-3).join(' '));
  }
  kill() { try { this.proc.kill('SIGKILL'); } catch {} }
}

export async function recordWeb(o: WebRecordOptions, job?: RecordJob): Promise<{ file: string; duration: number }> {
  const store = cur();
  const p = store.project;
  let W = Math.round((o.width || p.width) / 2) * 2, H = Math.round((o.height || p.height) / 2) * 2;
  const fps = clamp(Math.round(o.fps || p.fps || 30), 10, 60);
  const dt = 1 / fps;
  const mobile = o.device === 'mobile' || (o.device == null && H > W);
  // a phone in a landscape project: record a portrait 9:16 clip at the project's long side (frame it on the timeline)
  if (mobile && W > H && !o.width && !o.height) { H = W; W = Math.round((H * 9) / 16 / 2) * 2; }
  const uiZoom = clamp(o.zoom ?? 1.5, 0.5, 3);
  // CSS viewport; the browser renders at exactly W/vw device px per CSS px, so frames are native, never upscaled
  const vw = mobile ? 390 : Math.round(W / uiZoom);
  const dsf = W / vw;
  const camW = vw, camH = H / dsf, vh = Math.ceil(camH - 1e-6);
  const maxT = Math.min(180, o.maxSeconds || 120);
  const showPointer = o.cursor !== false;
  const realtime = !!o.realtime;
  const ss = o.hidpi && !realtime ? 2 : 1;
  const autoZ = realtime ? 0 : o.autoZoom === true ? 1.8 : typeof o.autoZoom === 'number' && o.autoZoom > 1 ? clamp(o.autoZoom, 1.1, 3) : 0;
  const stage = (s: string) => { if (job) { job.stage = s; emitJob(job); } };
  const session = o.session ? getSession(o.session) : null;

  const info = await ensureBrowser();
  const browser = await chromium.launch({
    executablePath: info.executablePath,
    args: ['--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--font-render-hinting=none',
      `--window-size=${vw},${vh}`, `--force-device-scale-factor=${dsf}`,
      // every frame is fully rastered before it is drawn: no checkerboard tiles, and screenshots don't stall on virtual time
      ...(realtime ? [] : ['--run-all-compositor-stages-before-draw'])],
  });
  const dir = store.p('.studio', 'cache', 'rec', nid());
  const name = `rec-${slug(o.name || new URL(o.url).hostname.replace(/^www\./, ''))}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.mp4`;
  const out = store.p('media', name);
  let enc: Encoder | null = null;
  let DEBUG_WD: NodeJS.Timeout | null = null;
  const wallStart = Date.now();
  try {
    const ctx = await browser.newContext({
      viewport: null, hasTouch: mobile, colorScheme: o.dark ? 'dark' : 'light', locale: o.locale || 'en-US',
      userAgent: mobile ? MOBILE_UA : session?.userAgent || desktopUA(browser.version()),
      storageState: session?.file,
    });
    await ctx.addInitScript(PAGE_JS);
    const hideCss = [...(o.clean !== false ? CLEAN_SELECTORS : []), ...(o.hide || [])];
    if (hideCss.length) await ctx.addInitScript(styleScript(hideCss.join(',') + '{display:none!important;visibility:hidden!important}'));
    if (o.hideScrollbars !== false) await ctx.addInitScript(styleScript(HIDE_SCROLLBARS));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    if (mobile) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 0, mobile: true });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }

    // network activity (for "idle" waits) and main-frame navigations (hidden, then crossfaded in)
    let inflight = 0, lastNet = Date.now(), navAt = 0, popupUrl: string | null = null;
    page.on('request', (r) => { inflight++; lastNet = Date.now(); if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navAt = Date.now(); });
    const done = () => { inflight = Math.max(0, inflight - 1); lastNet = Date.now(); };
    page.on('requestfinished', done); page.on('requestfailed', done);
    // links that open a new tab: follow them in the recorded tab
    ctx.on('page', async (pp) => {
      if (pp === page) return;
      try { await pp.waitForURL((u) => u.href !== 'about:blank', { timeout: 8000, waitUntil: 'commit' }); popupUrl = pp.url(); } catch {}
      pp.close().catch(() => {});
    });

    const evalPage = async <T>(expr: string, fallback: T): Promise<T> => {
      try { const r: any = await within(cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }), 5000, 'evaluate'); return r.exceptionDetails ? fallback : (r.result?.value ?? fallback); } catch { return fallback; }
    };
    let vtOn = false;
    const advance = (ms: number) => new Promise<void>((res) => {
      if (!vtOn) return res();
      const to = setTimeout(res, 3000);
      cdp.once('Emulation.virtualTimeBudgetExpired', () => { clearTimeout(to); res(); });
      cdp.send('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms }).catch(() => { clearTimeout(to); res(); });
    });
    const netIdle = () => (inflight === 0 && Date.now() - lastNet > 500) || Date.now() - lastNet > 1500;
    /** invisible: let the page load / settle (virtual time keeps ticking at ~real pace), no frames recorded */
    const settle = async (maxMs = 12000, minMs = 400) => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        if (vtOn) await advance(40); await sleep(30);
        if (Date.now() - t0 > minMs && netIdle() && await evalPage('window.__studio ? __studio.ready() : document.readyState === "complete"', false)) break;
      }
      for (let i = 0; i < 8; i++) { if (vtOn) await advance(40); await sleep(30); }
    };

    stage('loading the page');
    await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { if (!/timeout/i.test(String(e?.message))) throw e; });
    await settle(15000, 800);
    await page.evaluate('1').catch(() => {}); // warm up Playwright's execution contexts before the clock stops

    // ---------- recording state ----------
    let t = 0, frames = 0;
    const cur0 = { x: camW * 0.62, y: camH * 0.7 };
    const ptr = { x: cur0.x, y: cur0.y, press: 1, visible: showPointer && !mobile };
    const finger = { x: camW / 2, y: camH * 0.7, o: 0, s: 1 };
    let kickDebt = 0;
    let scrollSet: number | null = null, rippleAt: [number, number, number] | null = null, mouseAt = { x: -1, y: -1 }, lastScroll: [number, number] = [0, 0];
    // camera (centre in viewport CSS px, zoom) eased by a critically damped spring
    const cam = { x: camW / 2, y: camH / 2, z: 1, vx: 0, vy: 0, vz: 0 }, camT = { x: camW / 2, y: camH / 2, z: 1 };
    let camHold = false, lastAct = 0;
    const camStep = () => {
      if (autoZ && !camHold && camT.z > 1 && t - lastAct > 1.8) Object.assign(camT, { x: camW / 2, y: camH / 2, z: 1 });
      const w = 7, k = Math.min(dt, 0.05);
      for (const [p, v, tg] of [['x', 'vx', camT.x], ['y', 'vy', camT.y], ['z', 'vz', camT.z]] as const) {
        const a = w * w * (tg - cam[p]) - 2 * w * cam[v];
        cam[v] += a * k; cam[p] += cam[v] * k;
      }
      if (Math.abs(cam.z - 1) < 0.002 && camT.z === 1) cam.z = 1;
    };
    const clipFor = (sx: number, sy: number) => {
      const z = Math.max(1, cam.z), cw = camW / z, ch = camH / z;
      const x = clamp(cam.x - cw / 2, 0, camW - cw), y = clamp(cam.y - ch / 2, 0, camH - ch);
      const snap = (v: number) => Math.round(v * dsf) / dsf;
      return { x: snap(sx + x), y: snap(sy + y), width: cw, height: ch, scale: (W / (cw * dsf)) * ss };
    };

    // live mode: a screencast at native resolution, frames picked by timestamp afterwards
    const live: { ts: number; file: string }[] = [];
    let liveT0 = 0;
    if (realtime) {
      fs.mkdirSync(dir, { recursive: true });
      let n = 0;
      cdp.on('Page.screencastFrame', (f: any) => {
        const file = path.join(dir, `${String(n++).padStart(6, '0')}.jpg`);
        fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
        live.push({ ts: f.metadata.timestamp * 1000, file });
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
    } else {
      enc = new Encoder(out, W, H, fps);
      await cdp.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });
      vtOn = true;
    }

    /** render one output frame (deterministic) or wait for the next frame slot (live) */
    let step = 'start', stepAt = Date.now();
    const mark = (s: string) => { step = s; stepAt = Date.now(); };
    DEBUG_WD = DEBUG ? setInterval(() => { if (Date.now() - stepAt > 8000) console.log(`[rec] STUCK at ${step} for ${Date.now() - stepAt}ms`); }, 4000) : null;
    const frame = async () => {
      mark('frame-begin');
      const st: any = { sync: vtOn, cursor: [ptr.x, ptr.y, ptr.visible ? 1 : 0, ptr.press], finger: mobile ? [finger.x, finger.y, finger.o, finger.s] : undefined };
      if (scrollSet != null) { st.scroll = Math.round(scrollSet * dsf) / dsf; scrollSet = null; }
      if (rippleAt) { st.ripple = rippleAt; rippleAt = null; }
      if (!mobile && (Math.abs(ptr.x - mouseAt.x) > 0.3 || Math.abs(ptr.y - mouseAt.y) > 0.3)) { mouseAt = { x: ptr.x, y: ptr.y }; await within(page.mouse.move(ptr.x, ptr.y), 3000, 'mouse').catch(() => {}); }
      if (realtime) {
        await evalPage(`__studio.frame(${JSON.stringify(st)})`, null);
        frames++;
        const due = liveT0 + frames * dt * 1000;
        await sleep(Math.max(0, due - Date.now()));
        t = (Date.now() - liveT0) / 1000;
        return;
      }
      mark('advance');
      const ta = Date.now();
      { const pay = Math.min(kickDebt, dt * 500); await advance(dt * 1000 - pay); kickDebt -= pay; }
      const tb = Date.now();
      mark('eval');
      const [sx, sy] = lastScroll = await evalPage<[number, number]>(`__studio.frame(${JSON.stringify(st)})`, lastScroll);
      camStep();
      const tc = Date.now();
      mark('shot');
      const t1 = Date.now();
      // now and then Chrome holds a screenshot until virtual time moves: nudge it (2, 4, 8… ms; repaid by the next frames)
      let shot: any = null, failed: any = null;
      const shotP = cdp.send('Page.captureScreenshot', { format: 'png', clip: clipFor(sx, sy), optimizeForSpeed: true }).then((r) => { shot = r; }, (e) => { failed = e; });
      for (let w = 0; !shot && !failed; w++) {
        await Promise.race([shotP, sleep(w ? 150 : 400)]);
        if (shot || failed) break;
        if (Date.now() - t1 > 20000) throw new Error('screenshot timed out');
        if (DEBUG) console.log(`[rec] frame ${frames} kick after ${Date.now() - t1}ms`);
        const kick = Math.min(64, 2 ** w); await advance(kick); kickDebt += kick;
      }
      if (failed) throw failed;
      if (DEBUG) console.log(`[rec] frame ${frames} t=${t.toFixed(2)} adv ${tb - ta}ms eval ${tc - tb}ms shot ${Date.now() - t1}ms kick ${kickDebt} scroll ${sx},${sy} z ${cam.z.toFixed(2)}`);
      mark('push');
      await enc!.push(Buffer.from(shot.data, 'base64'));
      mark('after-frame');
      frames++; t = frames * dt;
      if (Date.now() - wallStart > 20 * 60_000) throw uerr('The recording took too long — try fewer or shorter steps');
    };
    const hold = async (ms: number) => { const end = t + ms / 1000; while (t < end - 1e-6 && t < maxT) await frame(); };
    /** hold, but stop the moment a navigation starts (its first paint can be blank — it is crossfaded in instead) */
    const holdUnlessNav = async (ms: number, since: number) => { const end = t + ms / 1000; while (t < end - 1e-6 && t < maxT && navAt <= since && !popupUrl) await frame(); };
    const animate = async (ms: number, fn: (k: number) => void) => {
      const t0 = t, d = Math.max(dt, ms / 1000);
      for (;;) { const k = Math.min(1, (t - t0) / d); fn(k); await frame(); if (k >= 1 || t >= maxT) break; }
    };
    /** a navigation happened: wait for the new page off-camera, then crossfade into it (no white flash) */
    const afterNav = async () => {
      await settle(12000, 300);
      await page.evaluate('1').catch(() => {});
      ptr.press = 1;
      if (enc) await enc.crossfade(Math.round(fps * 0.3));
    };
    const navigatedSince = async (since: number) => {
      if (popupUrl) { const u = popupUrl; popupUrl = null; await page.goto(u, { waitUntil: 'commit', timeout: 30000 }).catch(() => {}); return true; }
      return navAt > since;
    };

    // ---------- targets ----------
    const locate = async (a: Target, label: string): Promise<Locator> => {
      const cands: Locator[] = [];
      if (a.selector) cands.push(page.locator(a.selector).filter({ visible: true }), page.locator(a.selector));
      else if (a.text) {
        const tx = a.text;
        cands.push(page.getByRole('button', { name: tx, exact: true }), page.getByRole('link', { name: tx, exact: true }), page.getByText(tx, { exact: true }),
          page.getByRole('button', { name: tx }), page.getByRole('link', { name: tx }), page.getByLabel(tx), page.getByPlaceholder(tx), page.getByText(tx));
      }
      const deadline = Date.now() + 10000;
      for (;;) {
        for (const c of cands) {
          const l = a.selector ? c.first() : c.filter({ visible: true }).first();
          if (await l.count().catch(() => 0)) return l;
        }
        if (Date.now() > deadline) throw uerr('Element not found: {target}', { target: label });
        if (realtime) await sleep(100); else await frame();
      }
    };
    /** smooth-scroll the element into a comfortable spot if needed; returns its centre in viewport CSS px */
    const bring = async (a: Target, label: string) => {
      if (a.x != null && a.y != null) return { x: a.x, y: a.y, w: 0, h: 0 };
      const loc = await locate(a, label);
      let b = await loc.boundingBox().catch(() => null);
      if (!b) throw uerr('Element not found: {target}', { target: label });
      if (b.y < 0 || b.y + Math.min(b.height, camH * 0.5) > camH * 0.92) {
        const s = await loc.evaluate((el) => (window as any).__studio.scroller(el)).catch(() => null) as any;
        if (s) {
          const to = clamp(s.y + s.elTop - Math.max(camH * 0.12, (s.h - Math.min(s.elH, s.h * 0.6)) * 0.4), 0, s.max);
          await scrollAnim(s.y, to);
          b = (await loc.boundingBox().catch(() => null)) || b;
        }
      }
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
    };
    const focusCam = (r: { x: number; y: number; w: number; h: number }, level?: number | false) => {
      const want = level === false ? 0 : level || autoZ;
      if (!want || realtime) return;
      const z = clamp(Math.min(want, (camW * 0.7) / Math.max(1, r.w), (camH * 0.7) / Math.max(1, r.h)), 1, 3);
      if (z < 1.15) return;
      Object.assign(camT, { x: r.x, y: r.y, z });
      lastAct = t + 1.2; // stay zoomed while the cursor travels there
    };
    const zoomOut = () => { camHold = false; Object.assign(camT, { x: camW / 2, y: camH / 2, z: 1 }); };

    // ---------- motions ----------
    async function scrollAnim(from: number, to: number, ms?: number) {
      const dist = to - from;
      if (Math.abs(dist) < 1) return;
      if (autoZ && !camHold) zoomOut();
      const d = ms ?? clamp(450 + Math.abs(dist) * 1.05, 700, 4500);
      if (mobile && showPointer) {
        // flicks: the finger drags the page, lifts, momentum carries it on
        const steps = Math.max(1, Math.ceil(Math.abs(dist) / (camH * 1.1)));
        const per = d / steps;
        for (let i = 0; i < steps; i++) {
          const a0 = from + (dist * i) / steps, a1 = from + (dist * (i + 1)) / steps, sgn = Math.sign(dist);
          const fy0 = sgn > 0 ? camH * 0.72 : camH * 0.3;
          await animate(per, (k) => {
            const pos = flick(k);
            scrollSet = a0 + (a1 - a0) * pos;
            const drag = Math.min(1, k / FLICK_A);
            finger.x = camW * 0.55; finger.y = fy0 - sgn * Math.min(camH * 0.42, Math.abs(a1 - a0) * FLICK_C) * drag ** 2;
            finger.o = k < FLICK_A ? Math.min(1, k / 0.05) : Math.max(0, 1 - (k - FLICK_A) / 0.12);
            finger.s = k < FLICK_A ? 1 : 1 + (k - FLICK_A) * 0.6;
          });
          if (i < steps - 1) await hold(120);
        }
        finger.o = 0;
        return;
      }
      await animate(d, (k) => { scrollSet = from + dist * easeInOut(k); });
    }
    async function moveCursor(x: number, y: number, ms?: number) {
      if (mobile) return;
      const x0 = ptr.x, y0 = ptr.y, dist = Math.hypot(x - x0, y - y0);
      if (dist < 1) { ptr.x = x; ptr.y = y; return; }
      const d = ms ?? clamp(380 + dist * 0.55, 450, 1100);
      // a gentle arc, like a hand
      const mx = (x0 + x) / 2 + (y - y0) * 0.1, my = (y0 + y) / 2 - (x - x0) * 0.1;
      await animate(d, (k) => {
        const e = easeInOut(k);
        ptr.x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * mx + e * e * x;
        ptr.y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * my + e * e * y;
      });
    }
    async function press(x: number, y: number) {
      if (mobile) {
        Object.assign(finger, { x, y, o: 0, s: 1.25 });
        await animate(140, (k) => { finger.o = k; finger.s = 1.25 - 0.25 * k; });
        rippleAt = showPointer ? [x, y, 70] : null;
        await page.touchscreen.tap(x, y).catch(() => page.mouse.click(x, y));
        await animate(220, (k) => { finger.o = 1 - k; });
        return;
      }
      await animate(90, (k) => { ptr.press = 1 - 0.14 * k; });
      if (showPointer) rippleAt = [x, y, 64];
      await page.mouse.down();
      await hold(40);
      await page.mouse.up();
      await animate(110, (k) => { ptr.press = 0.86 + 0.14 * k; });
      lastAct = t;
    }
    if (!mobile) await page.mouse.move(ptr.x, ptr.y).catch(() => {});
    if (realtime) { await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 }); liveT0 = Date.now(); }
    stage('recording');

    const actions = o.actions || [];
    for (let i = 0; i < actions.length && t < maxT; i++) {
      const a: any = actions[i];
      const label = `step ${i + 1} (${a.type}${a.text ? ` “${String(a.text).slice(0, 40)}”` : a.selector ? ` ${a.selector}` : ''})`;
      const wallBefore = Date.now();
      switch (a.type) {
        case 'wait': {
          if (a.selector || a.text || a.idle) {
            const until = Date.now() + clamp(a.timeout ?? 15000, 500, 60000);
            const ok = async () => a.idle ? netIdle() : await (a.selector ? page.locator(a.selector) : page.getByText(a.text)).filter({ visible: true }).count().catch(() => 0) > 0;
            if (a.cut && !realtime) {
              while (Date.now() < until && !(await ok())) { await advance(40); await sleep(30); }
              await afterNav();
            } else {
              while (Date.now() < until && t < maxT && !(await ok())) await frame();
              if (a.ms) await hold(a.ms);
            }
          } else await hold(clamp(a.ms ?? 1000, 0, maxT * 1000));
          break;
        }
        case 'goto': {
          if (autoZ) zoomOut();
          await page.goto(a.url, { waitUntil: 'commit', timeout: 45000 }).catch(() => {});
          await afterNav();
          break;
        }
        case 'scroll': {
          const s: any = await (a.selector || a.text ? (await locate(a, label)).evaluate((el) => (window as any).__studio.scroller(el)) : evalPage('__studio.scroller()', null)).catch(() => null);
          if (!s) break;
          if (a.screens) {
            // screen by screen with short reading pauses
            const n = Math.max(1, Math.round(a.screens)), stepPx = s.h * 0.82, per = a.duration ? Math.max(500, a.duration / n - 450) : 1300;
            let y = s.y;
            for (let k = 0; k < n && y < s.max - 1 && t < maxT; k++) { const to = Math.min(s.max, y + stepPx); await scrollAnim(y, to, per); y = to; if (k < n - 1) await hold(450); }
            break;
          }
          let to: number;
          if (a.selector || a.text) to = s.y + s.elTop - s.h * 0.15;
          else if (a.by != null) to = s.y + Number(a.by);
          else if (a.to === 'bottom') to = s.max;
          else if (a.to === 'top') to = 0;
          else to = Number(a.to || 0);
          await scrollAnim(s.y, clamp(to, 0, s.max), a.duration);
          break;
        }
        case 'move': await moveCursor(a.x, a.y, a.duration); lastAct = t; break;
        case 'hover': {
          const r = await bring(a, label);
          focusCam(r, a.zoom);
          await moveCursor(r.x, r.y);
          lastAct = t; await hold(450);
          break;
        }
        case 'click': {
          const r = await bring(a, label);
          focusCam(r, a.zoom);
          await moveCursor(r.x, r.y);
          await hold(80);
          await press(r.x, r.y);
          lastAct = t;
          await holdUnlessNav(450, wallBefore);
          if (await navigatedSince(wallBefore)) await afterNav();
          break;
        }
        case 'type': {
          if (a.selector || a.target) {
            const r = await bring({ selector: a.selector, text: a.target }, label);
            focusCam({ ...r, w: Math.min(r.w, camW * 0.5) }, a.zoom);
            await moveCursor(r.x, r.y);
            await press(r.x, r.y);
            await hold(200);
          }
          if (a.clear) { await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await hold(120); }
          const rnd = prng(String(a.text));
          const base = clamp(a.delay ?? 75, 0, 1000);
          for (const ch of String(a.text)) {
            await page.keyboard.type(ch).catch(() => {});
            lastAct = t;
            let d = base * (0.6 + rnd() * 0.8);
            if (/[\s,.;:!?]/.test(ch)) d += base * 0.9;
            if (base) await hold(d);
          }
          await hold(250);
          break;
        }
        case 'press': {
          await page.keyboard.press(a.key);
          lastAct = t;
          await holdUnlessNav(300, wallBefore);
          if (await navigatedSince(wallBefore)) await afterNav();
          break;
        }
        case 'highlight': {
          await bring(a, label);
          const ms = a.ms ?? 1600;
          await (await locate(a, label)).evaluate((el, ms) => {
            const r = el.getBoundingClientRect(), h = document.createElement('div');
            Object.assign(h.style, { position: 'fixed', left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px', border: '3px solid #ff5a36', borderRadius: '12px', boxShadow: '0 0 0 9999px rgba(0,0,0,.35)', zIndex: '2147483645', pointerEvents: 'none', opacity: '0', transition: 'opacity .3s' });
            document.documentElement.appendChild(h);
            setTimeout(() => { h.style.opacity = '1'; }, 30);
            setTimeout(() => { h.style.opacity = '0'; setTimeout(() => h.remove(), 350); }, ms);
            return 1;
          }, ms).catch(() => {});
          await hold(ms + 400);
          break;
        }
        case 'zoom': {
          if (realtime) break;
          const at = !!(a.selector || a.text || a.x != null), level = a.level ?? (at ? 2 : 1);
          if (level <= 1) zoomOut();
          else if (at) { const r = await bring(a, label); camHold = true; Object.assign(camT, { x: r.x, y: r.y, z: clamp(level, 1, 3) }); }
          else { camHold = true; camT.z = clamp(level, 1, 3); }
          await hold(a.duration ?? 900);
          break;
        }
        case 'swipe': {
          const dir = a.direction || 'left', horiz = dir === 'left' || dir === 'right';
          const r = a.selector || a.text || a.x != null ? await bring(a, label) : { x: camW / 2, y: camH / 2, w: 0, h: 0 };
          const dist = a.distance ?? (horiz ? camW * 0.6 : camH * 0.45), sx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, sy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
          const x0 = horiz ? r.x - (sx * dist) / 2 : r.x, y0 = horiz ? r.y : r.y - (sy * dist) / 2;
          const pt = (k: number) => ({ x: x0 + sx * dist * easeInOut(k), y: y0 + sy * dist * easeInOut(k) });
          if (mobile) {
            Object.assign(finger, { x: x0, y: y0, o: 1, s: 1 });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
            await animate(a.duration ?? 450, (k) => { const q = pt(k); finger.x = q.x; finger.y = q.y; void cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x, y: q.y }] }).catch(() => {}); });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await animate(200, (k) => { finger.o = 1 - k; });
          } else {
            await moveCursor(x0, y0);
            await page.mouse.down();
            await animate(a.duration ?? 600, (k) => { const q = pt(k); ptr.x = q.x; ptr.y = q.y; });
            await page.mouse.up();
          }
          lastAct = t;
          await hold(400);
          break;
        }
        default: throw uerr('Unknown step type: {type}', { type: String(a.type) });
      }
    }
    if (autoZ && !camHold) { zoomOut(); }
    await hold(Math.max(300, (o.tail ?? 1) * 1000));

    stage('encoding');
    if (realtime) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await sleep(150);
      if (!live.length) throw uerr('The page produced no frames');
      live.sort((a, b) => a.ts - b.ts);
      // the screencast only sends a frame when something changed: for each output slot take the latest frame at or before it
      const start = liveT0;
      const total = Math.max(1, Math.round(t * fps));
      enc = new Encoder(out, W, H, fps);
      let j = 0;
      for (let k = 0; k < total; k++) {
        const due = start + (k + 0.5) * dt * 1000;
        while (j + 1 < live.length && live[j + 1].ts <= due) j++;
        await enc.push(fs.readFileSync(live[j].file));
      }
    }
    await enc!.end();
    enc = null;
    const meta = await probeMedia(name, true);
    writeJson(store.p('.studio', 'media', name + '.source.json'), { kind: 'web', ...o });
    return { file: name, duration: meta.duration };
  } catch (e) {
    enc?.kill();
    fs.rmSync(out, { force: true });
    throw e;
  } finally {
    if (DEBUG_WD) clearInterval(DEBUG_WD);
    await within(browser.close(), 8000, 'close').catch(() => { try { (browser as any).process?.()?.kill('SIGKILL'); } catch {} });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** a sensible default scenario: load, hold, then read down the page screen by screen */
export function defaultWebActions(seconds = 10): WebAction[] {
  const s = Math.max(4, seconds);
  const screens = Math.max(1, Math.round((s - 2.2) / 1.75));
  return [{ type: 'wait', ms: 1000 }, { type: 'scroll', screens, duration: (s - 2.2) * 1000 }];
}
