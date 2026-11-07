import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type Browser, type Page } from 'playwright-core';
import { getSettings, moduleDir, BROWSERS_DIR } from '../config.ts';
import { which } from '../bin.ts';

// ---------- which Chromium renders frames ----------
// 1. STUDIO_CHROMIUM (explicit executable)
// 2. Playwright's Chrome Headless Shell of the exact revision this playwright-core expects — in ~/.smashcut/browsers,
//    PLAYWRIGHT_BROWSERS_PATH or the default ms-playwright cache
// 3. an installed Google Chrome / Chromium (skipped with STUDIO_NO_SYSTEM_CHROME=1)
// 4. otherwise download Chrome Headless Shell into ~/.smashcut/browsers (once, with progress in the console)
export interface BrowserInfo { source: 'env' | 'playwright' | 'system' | 'missing'; executablePath?: string; detail: string }

const PW_DIR = moduleDir('playwright-core');
function headlessShellRevision(): string | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(PW_DIR, 'browsers.json'), 'utf8'));
    return j.browsers.find((b: any) => b.name === 'chromium-headless-shell')?.revision || null;
  } catch { return null; }
}
function defaultPlaywrightCache() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ms-playwright');
}
function headlessShellExe(dir: string): string | null {
  const arm = os.arch() === 'arm64';
  const sub = process.platform === 'darwin' ? (arm ? 'chrome-headless-shell-mac-arm64' : 'chrome-headless-shell-mac-x64')
    : process.platform === 'linux' ? (arm ? 'chrome-headless-shell-linux-arm64' : 'chrome-headless-shell-linux64')
    : process.platform === 'win32' ? 'chrome-headless-shell-win64' : null;
  if (!sub) return null;
  const p = path.join(dir, sub, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
  return fs.existsSync(p) && fs.existsSync(path.join(dir, 'INSTALLATION_COMPLETE')) ? p : null;
}
function systemChrome(): string | null {
  const cands: string[] = [];
  if (process.platform === 'darwin') {
    for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      cands.push(path.join(base, 'Google Chrome.app/Contents/MacOS/Google Chrome'), path.join(base, 'Chromium.app/Contents/MacOS/Chromium'));
    }
  } else if (process.platform === 'linux') {
    for (const n of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) { const p = which(n); if (p) cands.push(p); }
    cands.push('/opt/google/chrome/chrome');
  } else if (process.platform === 'win32') {
    for (const base of [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) if (base) cands.push(path.join(base, 'Google/Chrome/Application/chrome.exe'));
  }
  for (const c of cands) {
    try {
      const real = fs.realpathSync(c);
      if (real.includes('/snap/')) continue; // snap-confined Chromium cannot be driven reliably
      if (fs.statSync(real).isFile()) return c;
    } catch {}
  }
  return null;
}

export function findBrowser(): BrowserInfo {
  const env = process.env.STUDIO_CHROMIUM;
  if (env && fs.existsSync(env)) return { source: 'env', executablePath: env, detail: `STUDIO_CHROMIUM=${env}` };
  const rev = headlessShellRevision();
  if (rev) {
    for (const root of [BROWSERS_DIR, process.env.PLAYWRIGHT_BROWSERS_PATH, defaultPlaywrightCache()]) {
      if (!root) continue;
      const exe = headlessShellExe(path.join(root, `chromium_headless_shell-${rev}`));
      if (exe) return { source: 'playwright', executablePath: exe, detail: `Chrome Headless Shell r${rev} (${root})` };
    }
  }
  const sys = process.env.STUDIO_NO_SYSTEM_CHROME ? null : systemChrome();
  if (sys) return { source: 'system', executablePath: sys, detail: sys };
  return { source: 'missing', detail: 'no Chromium found' };
}

let installP: Promise<BrowserInfo> | null = null;
export let browserInstalling = false;
export let lastLaunchError: string | null = null;

/** find a render browser, downloading Chrome Headless Shell into the studio home when there is none */
export function ensureBrowser(): Promise<BrowserInfo> {
  const found = findBrowser();
  if (found.source !== 'missing') return Promise.resolve(found);
  if (!installP) {
    installP = new Promise<BrowserInfo>((resolve, reject) => {
      browserInstalling = true;
      console.log(`  Downloading Chrome Headless Shell for rendering (~100 MB, once) → ${BROWSERS_DIR}`);
      fs.mkdirSync(BROWSERS_DIR, { recursive: true });
      const p = spawn(process.execPath, [path.join(PW_DIR, 'cli.js'), 'install', 'chromium-headless-shell'], {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR }, stdio: ['ignore', 'inherit', 'inherit'],
      });
      p.on('error', reject);
      p.on('close', (code) => {
        const b = findBrowser();
        if (code === 0 && b.source !== 'missing') { console.log(`  Render browser ready: ${b.detail}`); resolve(b); }
        else reject(new Error(`Chromium download failed (exit ${code}). Retry with: PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_DIR} npx playwright-core install chromium-headless-shell — or install Google Chrome, or set STUDIO_CHROMIUM=/path/to/chrome`));
      });
    }).finally(() => { browserInstalling = false; installP = null; });
  }
  return installP;
}

let browserP: Promise<Browser> | null = null;
export function getBrowser(): Promise<Browser> {
  if (!browserP) {
    browserP = (async () => {
      const info = await ensureBrowser();
      return chromium.launch({
        executablePath: info.executablePath,
        args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--font-render-hinting=none'],
      });
    })();
    browserP.then((b) => { lastLaunchError = null; b.on('disconnected', () => { browserP = null; }); })
      .catch((e) => { lastLaunchError = String(e?.message || e).split('\n').slice(0, 6).join('\n'); browserP = null; });
  }
  return browserP;
}

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: () => number) {}
  async acquire() {
    if (this.active < this.max()) { this.active++; return; }
    await new Promise<void>((r) => this.queue.push(r));
    this.active++;
  }
  release() { this.active--; const n = this.queue.shift(); if (n) n(); }
}
const sem = new Semaphore(() => getSettings().renderWorkers);

/** run fn with a fresh page of the given viewport; limited by renderWorkers */
export async function withPage<T>(viewport: { width: number; height: number }, fn: (page: Page, errors: string[]) => Promise<T>): Promise<T> {
  await sem.acquire();
  let ctx: Awaited<ReturnType<Browser['newContext']>> | undefined;
  try {
    const b = await getBrowser();
    ctx = await b.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    return await fn(page, errors);
  } finally {
    await ctx?.close().catch(() => {});
    sem.release();
  }
}

export async function closeBrowser() { if (browserP) (await browserP.catch(() => null))?.close().catch(() => {}); }
