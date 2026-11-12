import type { Item, Scene } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { patchScene } from '../script.ts';
import { recomputeTiming } from '../timing.ts';
import { nid } from '../util.ts';

/** the voice-over track: an audio track named like one, else the first audio track, else a new one */
export function voiceTrack() {
  const p = cur().project;
  return p.tracks.find((t) => t.kind === 'audio' && /озвуч|voice|vo/i.test(t.name)) || p.tracks.find((t) => t.kind === 'audio') || { id: 'vo', kind: 'audio' as const, name: 'Voice-over' };
}

/** put a voice file on the voice-over track; a scene has one voice item — the previous one is replaced */
export async function placeVoice(file: string, duration: number, start: number, sc?: Scene): Promise<Item | undefined> {
  const store = cur();
  const tr = voiceTrack();
  const iid = 'i' + nid();
  const label = sc ? `VO: ${sc.title}` : 'VO';
  let removed: string[] = [];
  await store.update((pp) => {
    if (!pp.tracks.some((t) => t.id === tr.id)) pp.tracks.push(tr);
    if (sc) {
      removed = pp.items.filter((x) => x.track === tr.id && x.kind === 'media' && x.label === label).map((x) => x.id);
      pp.items = pp.items.filter((x) => !removed.includes(x.id));
    }
    pp.items.push({ id: iid, kind: 'media', ref: file, track: tr.id, start: +start.toFixed(3), duration: +(duration + 0.05).toFixed(3), in: 0, label, volume: 1 });
    pp.duration = Math.max(pp.duration, Math.ceil(start + duration));
  });
  if (sc) await patchScene(sc.id, { itemIds: [...new Set([...(sc.itemIds || []).filter((x) => !removed.includes(x)), iid])] });
  recomputeTiming();
  return store.project.items.find((x) => x.id === iid);
}

/** take the scene's voice item off the timeline */
export async function unplaceVoice(sc: Scene) {
  const store = cur();
  const tr = voiceTrack();
  const label = `VO: ${sc.title}`;
  const ids = store.project.items.filter((x) => x.track === tr.id && x.kind === 'media' && x.label === label).map((x) => x.id);
  if (!ids.length) return;
  await store.update((pp) => { pp.items = pp.items.filter((x) => !ids.includes(x.id)); });
  await patchScene(sc.id, { itemIds: (sc.itemIds || []).filter((x) => !ids.includes(x)) });
  recomputeTiming();
}
