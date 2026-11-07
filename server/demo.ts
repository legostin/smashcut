import fs from 'node:fs';
import path from 'node:path';
import { GALLERY_DIR } from './config.ts';
import { ProjectStore } from './project.ts';
import { copyDir, readJson, writeJson, run } from './util.ts';
import { syncSkills } from './skills.ts';
import { commit } from './git.ts';
import type { Item, PackageManifest } from '../shared/types.ts';

/** a ready-to-play demo project built from the built-in gallery */
export async function createDemoProject(dir: string): Promise<string> {
  if (ProjectStore.exists(dir)) return dir;
  const store = await ProjectStore.create(dir, { name: 'Demo — Smashcut', duration: 20 });
  // background footage: generated animated gradient (so the demo works offline)
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'gradients=s=1920x1080:d=20:speed=0.01:type=radial:c0=0x161a4d:c1=0x0a3a4a:c2=0x1e0c33:nb_colors=3:r=30,format=yuv420p,noise=alls=3:allf=t', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', store.p('media', 'demo-background.mp4')]);
  const items: Item[] = [];
  const has = (kind: string, id: string) => fs.existsSync(path.join(GALLERY_DIR, kind, id));
  const addClip = (id: string, track: string, start: number, duration: number, params?: Record<string, unknown>) => {
    if (!has('clips', id)) return;
    copyDir(path.join(GALLERY_DIR, 'clips', id), store.p('clips', id));
    const mf = store.p('clips', id, 'manifest.json');
    writeJson(mf, { ...readJson<PackageManifest>(mf, {} as PackageManifest), source: `builtin:${id}` });
    items.push({ id: `i-${id}`, kind: 'clip', ref: id, track, start, duration, in: 0, params });
  };
  if (fs.existsSync(store.p('media', 'demo-background.mp4'))) items.push({ id: 'i-bg', kind: 'media', ref: 'demo-background.mp4', track: 'v1', start: 0, duration: 20, in: 0 });
  addClip('beat-pulse-shapes', 'g1', 0, 4.5);
  addClip('title-kinetic-words', 'g2', 0.5, 4);
  addClip('lower-third-slide', 'g2', 5, 5);
  addClip('caption-karaoke', 'g1', 10.5, 5);
  addClip('counter-stat', 'g2', 10.5, 5);
  addClip('logo-reveal', 'g2', 16, 4);
  if (has('music', 'pulse-120')) {
    copyDir(path.join(GALLERY_DIR, 'music', 'pulse-120'), store.p('music', 'pulse-120'));
    items.push({ id: 'i-music', kind: 'music', ref: 'pulse-120', track: 'm1', start: 0, duration: 20, in: 0, volume: 0.8 });
  }
  store.saveProject({ ...store.project, items }, false);
  syncSkills(dir, store.project.name);
  for (const f of fs.readdirSync(store.p('clips'))) fs.rmSync(store.p('clips', f, 'preview.png'), { force: true });
  await commit(dir, 'Demo project');
  return dir;
}
