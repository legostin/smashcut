import { chromium, type Browser, type Page } from 'playwright-core';
import { getSettings } from '../config.ts';

let browserP: Promise<Browser> | null = null;
export function getBrowser(): Promise<Browser> {
  if (!browserP) {
    browserP = chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--font-render-hinting=none'] });
    browserP.then((b) => b.on('disconnected', () => { browserP = null; })).catch(() => { browserP = null; });
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
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    return await fn(page, errors);
  } finally {
    await ctx.close().catch(() => {});
    sem.release();
  }
}

export async function closeBrowser() { if (browserP) (await browserP).close().catch(() => {}); }
