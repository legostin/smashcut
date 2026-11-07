import fs from 'node:fs';
import path from 'node:path';
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

/** render PNG frames of a clip at the given local times */
export async function renderClipFrames(url: string, size: { width: number; height: number }, times: number[]): Promise<{ frames: Buffer[]; errors: string[] }> {
  return withPage(size, async (page, errors) => {
    await openClip(page, url, errors);
    const frames: Buffer[] = [];
    for (const t of times) {
      await page.evaluate((t) => (window as any).__studio.seek(t), t);
      frames.push(await page.screenshot({ type: 'png', omitBackground: true }));
    }
    const rt = await page.evaluate(() => (window as any).__studio.errors as string[]);
    return { frames, errors: [...new Set([...errors, ...rt])] };
  });
}

/** load a clip page and wait until the runtime is ready (bounded) */
export async function openClip(page: import('playwright-core').Page, url: string, errors: string[]) {
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

/**
 * Render the full frame sequence of a timeline clip item into the cache.
 * Returns the directory containing 000000.png … (frame i at local time (in + i/fps)).
 */
export async function renderItemSequence(item: Item, project: Project, onProgress?: (done: number, total: number) => void): Promise<{ dir: string; count: number; errors: string[] }> {
  const store = cur();
  const clipDir = store.p('clips', item.ref);
  const input = itemInput(item, project);
  const key = sha1(hashDir(clipDir) + rtHash() + JSON.stringify({ input, in: item.in, timing: fs.existsSync(store.p('.studio', 'timing.json')) ? fs.readFileSync(store.p('.studio', 'timing.json'), 'utf8') : '' }));
  const dir = store.p('.studio', 'cache', 'clips', `${item.ref}-${key}`);
  const count = Math.max(1, Math.round(item.duration * project.fps));
  if (fs.existsSync(path.join(dir, '.done'))) { onProgress?.(count, count); return { dir, count, errors: [] }; }
  fs.mkdirSync(dir, { recursive: true });
  const url = clipUrl(item.ref, input);
  const chunk = Math.max(30, Math.ceil(count / 4));
  const chunks: [number, number][] = [];
  for (let s = 0; s < count; s += chunk) chunks.push([s, Math.min(count, s + chunk)]);
  let done = 0;
  const errors: string[] = [];
  await Promise.all(chunks.map(([a, b]) => withPage({ width: project.width, height: project.height }, async (page, errs) => {
    await openClip(page, url, errs);
    for (let i = a; i < b; i++) {
      const t = item.in + i / project.fps;
      await page.evaluate((t) => (window as any).__studio.seek(t), t);
      await page.screenshot({ type: 'png', omitBackground: true, path: path.join(dir, String(i).padStart(6, '0') + '.png') });
      done++;
      if (done % 5 === 0) onProgress?.(done, count);
    }
    errors.push(...errs, ...(await page.evaluate(() => (window as any).__studio.errors as string[])));
  })));
  fs.writeFileSync(path.join(dir, '.done'), String(count));
  onProgress?.(count, count);
  return { dir, count, errors: [...new Set(errors)] };
}
