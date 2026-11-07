import fs from 'node:fs';
import path from 'node:path';
import { cur } from '../project.ts';
import { sha1, hashDir, runOk } from '../util.ts';
import { compositeFrame, visualLayers } from './compose.ts';

const inflight = new Map<string, Promise<string>>();

/** small JPEG of the composited timeline at project time t (cached by content) — for the board/storyboard */
export function boardFrame(t: number, w: number): Promise<string> {
  const store = cur();
  const p = store.project;
  const layers = visualLayers(p, t);
  const clipHashes = layers.filter((i) => i.kind === 'clip').map((i) => hashDir(store.p('clips', i.ref))).join(',');
  const design = fs.existsSync(store.p('design.json')) ? fs.readFileSync(store.p('design.json'), 'utf8') : '';
  const key = sha1(JSON.stringify({ t: +t.toFixed(3), w, layers, size: [p.width, p.height, p.background], clipHashes, design }));
  const out = store.p('.studio', 'board', `${key}.jpg`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (inflight.has(key)) return inflight.get(key)!;
  const job = (async () => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const { png } = await compositeFrame(t);
    const tmp = out + '.png';
    fs.writeFileSync(tmp, png);
    await runOk('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-vf', `scale=${w}:-2:flags=lanczos`, '-q:v', '3', out]);
    fs.rmSync(tmp, { force: true });
    return out;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
