import type { Scene, Script, StageId } from '../shared/types.ts';
import { cur } from './project.ts';
import { bus } from './bus.ts';
import { readJson, writeJson, nid, Mutex } from './util.ts';

/** script.json — the brief, the production stage and the scene list (storyboard) of the video. */
export const STAGES: { id: StageId; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'script', label: 'Script' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'production', label: 'Production' },
  { id: 'review', label: 'Review' },
  { id: 'export', label: 'Export' },
];

const EMPTY: Script = { brief: '', stage: 'brief', scenes: [] };
const mutex = new Mutex();
let lastWrite = 0;

export function getScript(): Script {
  const s = readJson<Script>(cur().p('script.json'), EMPTY);
  return normalize(s);
}

function normalize(s: Partial<Script>): Script {
  const scenes = (s.scenes || []).map((x, i) => ({
    id: x.id || 's' + nid(),
    title: x.title || `Scene ${i + 1}`,
    start: Math.max(0, Number(x.start) || 0),
    duration: Math.max(0.1, Number(x.duration) || 3),
    voiceover: x.voiceover || '',
    visual: x.visual || '',
    notes: x.notes || '',
    status: (['todo', 'doing', 'done'].includes(x.status as string) ? x.status : 'todo') as Scene['status'],
    itemIds: x.itemIds || [],
  }));
  scenes.sort((a, b) => a.start - b.start);
  const stage = STAGES.some((st) => st.id === s.stage) ? (s.stage as StageId) : 'brief';
  return { brief: s.brief || '', stage, scenes, updatedAt: s.updatedAt };
}

export function saveScript(next: Partial<Script>) {
  return mutex.run(async () => {
    const s = normalize({ ...getScript(), ...next, updatedAt: new Date().toISOString() });
    lastWrite = Date.now();
    writeJson(cur().p('script.json'), s);
    bus.send({ type: 'script', script: s });
    return s;
  });
}

export function patchScene(id: string, patch: Partial<Scene>) {
  return mutex.run(async () => {
    const s = getScript();
    const sc = s.scenes.find((x) => x.id === id);
    if (!sc) throw Object.assign(new Error('scene not found: ' + id), { statusCode: 404 });
    Object.assign(sc, patch, { id });
    const out = normalize({ ...s, updatedAt: new Date().toISOString() });
    lastWrite = Date.now();
    writeJson(cur().p('script.json'), out);
    bus.send({ type: 'script', script: out });
    return out;
  });
}

/** called by the file watcher when script.json changes on disk (e.g. edited by an agent directly) */
export function onScriptFileChanged() {
  if (Date.now() - lastWrite < 800) return;
  bus.send({ type: 'script', script: getScript() });
}
