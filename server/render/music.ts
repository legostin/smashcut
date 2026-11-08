import fs from 'node:fs';
import path from 'node:path';
import type { MusicInfo } from '../../shared/types.ts';
import { BASE_URL } from '../config.ts';
import { cur, pbase } from '../project.ts';
import { bus } from '../bus.ts';
import { hashDir, writeJson, readJson } from '../util.ts';
import { withPage } from './browser.ts';
import { decodePcm, computePeaks, analyzePcm } from '../audio/analyze.ts';
import { recomputeTiming } from '../timing.ts';
import { ensureSamples, soundStamp } from '../samples.ts';

const inflight = new Map<string, Promise<MusicInfo>>();

/** render music/<id>/score.js → WAV (cached by content hash) + beat map + peaks + analysis */
export function renderMusic(id: string, force = false): Promise<MusicInfo> {
  const key = cur().id + ':' + id;
  if (inflight.has(key)) return inflight.get(key)!;
  const p = (async () => {
    const store = cur();
    const dir = store.p('music', id);
    if (!fs.existsSync(path.join(dir, 'score.js'))) throw new Error('music not found: ' + id);
    await ensureSamples(); // instrument samples: fetched once, never throws (synth fallbacks when offline)
    const hash = hashDir(dir, soundStamp());
    const rel = `.studio/cache/music/${id}-${hash}.wav`;
    const stateFile = store.p('.studio', 'music', id + '.json');
    const state = readJson<{ rendered?: string; hash?: string }>(stateFile, {});
    if (!force && state.hash === hash && state.rendered && fs.existsSync(store.p(state.rendered))) return store.musicInfo(id);
    fs.mkdirSync(path.dirname(store.p(rel)), { recursive: true });
    try {
      const r = await withPage({ width: 400, height: 300 }, async (page, errors) => {
        await page.goto(`${BASE_URL}/runtime/music.html?src=${encodeURIComponent(`${pbase()}/music/${id}/score.js`)}`, { waitUntil: 'load' });
        // render timeout scales with the piece: max(180 s, 4× its length) — offline renders are slower than real time under CPU load
        const len = await Promise.race([page.evaluate(async () => { const m = await (window as any).__music.meta(); return m.duration + m.tail; }), new Promise<number>((r) => setTimeout(() => r(60), 15000))]).catch(() => 60);
        const timeoutMs = Math.max(180, 4 * (Number(len) || 60)) * 1000;
        const res = await Promise.race([
          page.evaluate(async () => (window as any).__music.render(48000)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('music render timeout (did the score call studio.music()?) ' + errors.join('; '))), timeoutMs)),
        ]) as { meta: any; peak: number; wav: string };
        const rtErr: string[] = await page.evaluate(() => (window as any).__music.errors);
        if (rtErr.length || errors.length) throw new Error([...rtErr, ...errors].join('\n'));
        return res;
      });
      fs.writeFileSync(store.p(rel), Buffer.from(r.wav, 'base64'));
      const pcm = await decodePcm(store.p(rel), 22050);
      const peaksRel = `.studio/cache/music/${id}-${hash}.peaks.json`;
      writeJson(store.p(peaksRel), computePeaks(pcm, 22050, 50));
      const analysis = analyzePcm(pcm, 22050);
      writeJson(store.p('.studio', 'analysis', `music-${id}.json`), analysis);
      writeJson(stateFile, { meta: r.meta, rendered: rel, peaks: peaksRel, hash, peak: r.peak, renderedAt: new Date().toISOString() });
    } catch (e) {
      writeJson(stateFile, { ...state, renderError: (e as Error).message });
      const info = store.musicInfo(id);
      bus.send({ type: 'music', music: info });
      bus.send({ type: 'notice', level: 'error', text: `Music "${id}" failed: ${(e as Error).message.slice(0, 300)}` });
      return info;
    }
    const info = store.musicInfo(id);
    recomputeTiming();
    bus.send({ type: 'music', music: info });
    return info;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function musicPeaks(id: string): string | undefined {
  return readJson<{ peaks?: string }>(cur().p('.studio', 'music', id + '.json'), {}).peaks;
}
void BASE_URL;
