import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../shared/types.ts';
import { cur, ProjectStore } from './project.ts';
import { PROJECTS_DIR } from './config.ts';
import { readJson, writeJson, slug } from './util.ts';
import { gitInit, commit } from './git.ts';
import { uerr } from './i18n.ts';

/**
 * Video versions: a derived project (another language, aspect ratio, length…) that inherits the script,
 * design system, clips, music and edit of its parent. Media are hard-linked (no extra disk space).
 */
export interface VariantSpec {
  label: string;
  prompt?: string;
  width?: number;
  height?: number;
  /** target language for texts / voice-over (BCP-47 code or English name) */
  language?: string;
  /** target total duration in seconds */
  duration?: number;
}
export interface VariantInfo { dir: string; name: string; label?: string; parent?: string; root?: string; width: number; height: number; current?: boolean }

const SKIP_TOP = new Set(['.git', '.studio', 'node_modules']);

function copyTree(src: string, dst: string, link = false) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d, link);
    else if (link) { try { fs.linkSync(s, d); } catch { fs.copyFileSync(s, d); } }
    else fs.copyFileSync(s, d);
  }
}

export async function createVariant(spec: VariantSpec): Promise<{ dir: string; project: Project }> {
  const store = cur();
  const parent = store.project;
  const label = spec.label.trim() || 'Version';
  const base = path.join(path.dirname(store.dir) === PROJECTS_DIR ? PROJECTS_DIR : path.dirname(store.dir), `${slug(path.basename(store.dir))}-${slug(label)}`);
  let dir = base, n = 2;
  while (fs.existsSync(dir)) dir = `${base}-${n++}`;
  fs.mkdirSync(dir, { recursive: true });
  for (const e of fs.readdirSync(store.dir, { withFileTypes: true })) {
    if (SKIP_TOP.has(e.name)) continue;
    const s = path.join(store.dir, e.name), d = path.join(dir, e.name);
    if (e.isDirectory()) copyTree(s, d, e.name === 'media');
    else fs.copyFileSync(s, d);
  }
  // keep generated media metadata (thumbs, transcripts, analysis) so the copy is instantly usable
  for (const sub of ['media', 'transcripts', 'analysis', 'music']) {
    const s = store.p('.studio', sub);
    if (fs.existsSync(s)) copyTree(s, path.join(dir, '.studio', sub), true);
  }
  const lineage = readJson<{ root?: string }>(store.p('.studio', 'variant.json'), {});
  const rootDir = lineage.root || store.dir;
  const project: Project = {
    ...parent,
    name: `${parent.name.replace(/ — .*$/, '')} — ${label}`,
    width: spec.width || parent.width,
    height: spec.height || parent.height,
  };
  writeJson(path.join(dir, 'project.json'), project);
  writeJson(path.join(dir, '.studio', 'variant.json'), { label, parent: store.dir, root: rootDir, spec, createdAt: new Date().toISOString() });
  // remember the family on the root so every member can list siblings
  const famFile = path.join(rootDir, '.studio', 'family.json');
  const fam = readJson<{ members: string[] }>(famFile, { members: [] });
  writeJson(famFile, { members: [...new Set([...fam.members, dir])] });
  await gitInit(dir);
  await commit(dir, `Version “${label}” of ${parent.name}`);
  return { dir, project };
}

export function family(): VariantInfo[] {
  const store = cur();
  const me = readJson<{ root?: string; label?: string; parent?: string }>(store.p('.studio', 'variant.json'), {});
  const rootDir = me.root || store.dir;
  const fam = readJson<{ members: string[] }>(path.join(rootDir, '.studio', 'family.json'), { members: [] });
  const out: VariantInfo[] = [];
  for (const d of [rootDir, ...fam.members]) {
    if (!ProjectStore.exists(d)) continue;
    const p = readJson<Project | null>(path.join(d, 'project.json'), null);
    const v = readJson<{ label?: string; parent?: string }>(path.join(d, '.studio', 'variant.json'), {});
    if (!p) continue;
    out.push({ dir: d, name: p.name, label: v.label || 'Original', parent: v.parent, root: rootDir, width: p.width, height: p.height, current: d === store.dir });
  }
  return out;
}

/** the agent brief for adapting a fresh version */
export function variantPrompt(spec: VariantSpec, parentName: string, parentSize: { width: number; height: number }) {
  const lines: string[] = [
    `This project is a new VERSION of “${parentName}” — label: “${spec.label}”. It already contains the parent's script, design system, clips, music and edit. Adapt it to the new conditions below; keep the story, structure and visual identity unless the conditions require changes.`,
  ];
  if (spec.width && spec.height && (spec.width !== parentSize.width || spec.height !== parentSize.height)) {
    lines.push(`- New frame: ${spec.width}×${spec.height} (was ${parentSize.width}×${parentSize.height}). The project is already resized. Re-compose every visual: check each scene with render_frame, move/scale graphics with timeline_update transform (or edit clip layouts) so nothing is cropped and text sits inside the safe areas of the new format (for 9:16 keep key content in the middle 60% height, captions above the bottom 20%); reframe footage with transform scale/x/y (fit "cover" + focus on the subject); adjust type sizes for the new canvas.`);
  }
  if (spec.language) {
    lines.push(`- New language: ${spec.language}. Translate the script (scene titles, voiceover/on-screen copy) with set_script/update_scene, then every on-screen text in clip params (timeline_update params) and clip code; keep the meaning and tone, adapt idioms; make sure longer translations still fit. If there is voice-over and ElevenLabs is configured, re-generate it per scene (generate_voiceover {sceneId}) with a voice that suits the language; re-check captions.`);
  }
  if (spec.duration) lines.push(`- New length: about ${spec.duration} s. Re-time the script (tighten or cut scenes), re-time the timeline items and music accordingly; keep the hook and the ending.`);
  if (spec.prompt?.trim()) lines.push(`- Additional instructions from the user: ${spec.prompt.trim()}`);
  lines.push('Work scene by scene (update_scene status), verify with render_frame at the start/middle/end of every scene, and finish with a short summary of what changed in this version.');
  return lines.join('\n');
}
