import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright-core';
import type { Item, Project } from '../../shared/types.ts';
import { BASE_URL, RUNTIME_DIR } from '../config.ts';
import { cur } from '../project.ts';
import { hashDir, sha1 } from '../util.ts';
import { withPage } from './browser.ts';

export interface ClipInput { params?: Record<string, unknown>; offset?: number; duration?: number; width: number; height: number; fps: number; timing?: boolean; t?: number }

export function clipUrl(clipId: string, input: ClipInput, base = '/p/clips') {
  return `${BASE_URL}${base}/${encodeURIComponent(clipId)}/index.html#${encodeURIComponent(JSON.stringify(input))}`;
}
export function itemInput(item: Item, project: Project): ClipInput {
  return { params: item.params || {}, offset: item.start - item.in, duration: item.duration + item.in, width: project.width, height: project.height, fps: project.fps };
}

/**
 * Fast transparent frame capture through CDP (≈1.7× faster than page.screenshot):
 * transparent default background + optimizeForSpeed PNG encoding.
 */
export async function makeCapturer(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  return async (): Promise<Buffer> => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false });
    return Buffer.from(r.data, 'base64');
  };
}

const seekTo = (page: Page, t: number) => page.evaluate((t) => (window as any).__studio.seek(t), t);

/** render PNG frames of a clip at the given local times */
export async function renderClipFrames(url: string, size: { width: number; height: number }, times: number[]): Promise<{ frames: Buffer[]; errors: string[] }> {
  return withPage(size, async (page, errors) => {
    await openClip(page, url, errors);
    const capture = await makeCapturer(page);
    const frames: Buffer[] = [];
    for (const t of times) {
      await seekTo(page, t);
      frames.push(await capture());
    }
    const rt = await page.evaluate(() => (window as any).__studio.errors as string[]);
    return { frames, errors: [...new Set([...errors, ...rt])] };
  });
}

/** load a clip page and wait until the runtime is ready (bounded) */
export async function openClip(page: Page, url: string, errors: string[]) {
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  try {
    await page.waitForFunction(() => (window as any).__studio, null, { timeout: 10000 });
    await page.evaluate(() => Promise.race([(window as any).__studio.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('clip not ready after 15s')), 15000))]));
  } catch (e) {
    errors.push('clip failed to become ready: ' + (e as Error).message.split('\n')[0]);
    await page.evaluate(() => { (window as any).__studio = (window as any).__studio || { seek: async () => 0, errors: [] }; }).catch(() => {});
  }
}

let runtimeHash = '';
function rtHash() {
  if (!runtimeHash) runtimeHash = hashDir(RUNTIME_DIR);
  return runtimeHash;
}

export interface SequenceOptions {
  /** motion blur: sub-frames per frame (1 = off) */
  subframes?: number;
  /** shutter as a fraction of the frame interval (0.5 = 180°) */
  shutter?: number;
  signal?: { aborted: boolean };
}

/**
 * Render the full frame sequence of a timeline clip item into the cache.
 * With subframes = N the sequence holds N samples per frame spread over the shutter interval
 * (index j → frame ⌊j/N⌋, sample j mod N), ready for accumulation (tmix) in ffmpeg.
 */
export async function renderItemSequence(item: Item, project: Project, onProgress?: (done: number, total: number) => void, opts: SequenceOptions = {}): Promise<{ dir: string; count: number; errors: string[]; subframes: number }> {
  const store = cur();
  const N = Math.max(1, Math.round(opts.subframes || 1));
  const shutter = opts.shutter ?? 0.5;
  const clipDir = store.p('clips', item.ref);
  const input = itemInput(item, project);
  const extra = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const key = sha1(hashDir(clipDir) + rtHash() + JSON.stringify({ input, in: item.in, N, shutter: N > 1 ? shutter : 0, timing: extra(store.p('.studio', 'timing.json')), design: extra(store.p('design.json')) }));
  const dir = store.p('.studio', 'cache', 'clips', `${item.ref}-${key}`);
  const frames = Math.max(1, Math.round(item.duration * project.fps));
  const count = frames * N;
  if (fs.existsSync(path.join(dir, '.done'))) { onProgress?.(count, count); return { dir, count, errors: [], subframes: N }; }
  fs.mkdirSync(dir, { recursive: true });
  const url = clipUrl(item.ref, input);
  const timeOf = (j: number) => item.in + Math.floor(j / N) / project.fps + (N > 1 ? ((j % N) / N) * (shutter / project.fps) : 0);
  const chunk = Math.max(30 * N, Math.ceil(count / 4));
  const chunks: [number, number][] = [];
  for (let s = 0; s < count; s += chunk) chunks.push([s, Math.min(count, s + chunk)]);
  let done = 0;
  const errors: string[] = [];

  const renderChunk = async ([a, b]: [number, number], attempt = 0): Promise<void> => {
    // resume: skip frames already written by a previous (crashed) attempt
    let start = a;
    while (start < b && fs.existsSync(path.join(dir, String(start).padStart(6, '0') + '.png'))) start++;
    if (start >= b) return;
    try {
      await withPage({ width: project.width, height: project.height }, async (page, errs) => {
        await openClip(page, url, errs);
        const capture = await makeCapturer(page);
        for (let j = start; j < b; j++) {
          if (opts.signal?.aborted) throw new Error('cancelled');
          await seekTo(page, timeOf(j));
          const png = await capture();
          const f = path.join(dir, String(j).padStart(6, '0') + '.png');
          fs.writeFileSync(f + '.tmp', png);
          fs.renameSync(f + '.tmp', f);
          done++;
          if (done % 5 === 0) onProgress?.(done, count);
        }
        errors.push(...errs, ...(await page.evaluate(() => (window as any).__studio.errors as string[])));
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'cancelled' || attempt >= 2) throw e;
      errors.push(`render retry (${attempt + 1}) after: ${msg.split('\n')[0]}`);
      return renderChunk([a, b], attempt + 1);
    }
  };

  await Promise.all(chunks.map((c) => renderChunk(c)));
  fs.writeFileSync(path.join(dir, '.done'), String(count));
  onProgress?.(count, count);
  return { dir, count, errors: [...new Set(errors)], subframes: N };
}
