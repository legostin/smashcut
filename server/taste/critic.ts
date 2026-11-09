// The art director: a fresh-eyes critic reviews a scene (or any range) from contact sheets of the composited frames,
// the measured taste audit, the brief, the design system and the user's taste — and returns a verdict with exact fixes.
// It runs as a read-only agent task under the caller (the caller is idle meanwhile), the verdict is stored on the scene.
import fs from 'node:fs';
import type { Scene, SceneReview, Task } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { getScript, patchScene } from '../script.ts';
import { getDesign } from '../design.ts';
import { compositeFrame, sheet } from '../render/compose.ts';
import { readJson } from '../util.ts';
import { getSettings } from '../config.ts';
import { getTask, onTaskFinish, startCritic } from '../agents/runner.ts';
import { uerr } from '../i18n.ts';

const MAX_ROUNDS = 3;

/** frames the critic sees: just before the scene (the seam in), its start, evenly through it, every cut inside, its end, just after */
function pickTimes(start: number, end: number, projectEnd: number): number[] {
  const p = cur().project;
  const d = end - start;
  const ts = new Set<number>();
  const add = (t: number) => { if (t >= 0 && t <= projectEnd - 0.02) ts.add(+t.toFixed(2)); };
  const covered = (t: number) => p.items.some((it) => it.kind !== 'music' && t >= it.start && t < it.start + it.duration);
  if (covered(start - 0.12)) add(start - 0.12); // the seam in (only if something is there)
  add(start + Math.min(0.15, d / 4));
  const n = Math.max(3, Math.min(8, Math.round(d / 1.2)));
  for (let i = 1; i <= n; i++) add(start + (d * i) / (n + 1));
  for (const it of p.items) for (const edge of [it.start, it.start + it.duration]) if (edge > start + 0.3 && edge < end - 0.3) { add(edge - 0.08); add(edge + 0.08); }
  add(end - Math.min(0.15, d / 4));
  if (covered(end + 0.12)) add(end + 0.12);
  return [...ts].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 0.05).slice(0, 16);
}

async function contactSheets(start: number, end: number) {
  const store = cur();
  const times = pickTimes(start, end, store.project.duration || end + 1);
  const shots: { png: Buffer; caption: string }[] = [];
  const errors: string[] = [];
  for (const t of times) {
    const r = await compositeFrame(t);
    const where = t < start ? ' (before)' : t > end ? ' (after)' : '';
    shots.push({ png: r.png, caption: `t=${t.toFixed(2)}s${where}` });
    errors.push(...r.errors);
  }
  const vertical = store.project.height > store.project.width;
  const cols = vertical ? 4 : 3;
  // a few frames per sheet so every frame stays big enough to judge type and detail
  const per = vertical ? 8 : 6;
  const files: string[] = [];
  const stamp = Date.now().toString(36);
  for (let i = 0; i < shots.length; i += per) {
    const png = await sheet(shots.slice(i, i + per), { cols, width: 1800, checker: false });
    const file = `.studio/frames/review-${stamp}-${i / per + 1}.png`;
    fs.writeFileSync(store.p(file), png);
    files.push(file);
  }
  return { files, times, errors: [...new Set(errors)] };
}

async function audit(start: number, end: number): Promise<string> {
  try {
    const m = await import('./audit.ts');
    const r = await m.auditRange({ start, end });
    if (!r.issues.length) return 'Measured audit: no problems found.';
    return 'Measured audit (facts — weigh them, they can be false positives):\n' + r.issues.slice(0, 25).map((x) => `- ${x.severity}${x.t != null ? ` t=${x.t.toFixed(2)}s` : ''} · ${x.where} · ${x.problem} → ${x.fix}`).join('\n');
  } catch (e) {
    return `Measured audit unavailable (${(e as Error).message.slice(0, 120)}) — judge from the frames.`;
  }
}

async function taste(): Promise<string> {
  const st = getSettings();
  const h = st.houseStyle || {};
  const house = [h.style && `visual style: ${h.style}`, h.direction && `direction/pacing: ${h.direction}`, h.colors && `colours/type: ${h.colors}`].filter(Boolean).join('; ');
  let learned = '';
  try { learned = (await import('./memory.ts')).tasteProfile(); } catch { /* not learned yet */ }
  return [house && `The user's standing instructions: ${house}`, learned && `The user's taste, learned from their choices:\n${learned}`].filter(Boolean).join('\n\n');
}

function compactDesign(): string {
  try {
    const d = getDesign() as unknown as Record<string, unknown>;
    const s = JSON.stringify(d);
    return s.length > 2200 ? s.slice(0, 2200) + '…' : s;
  } catch { return ''; }
}

export interface ReviewRequest { caller?: string; sceneId?: string; start?: number; end?: number; focus?: string }

/** start an art-director review; returns the critic task (the verdict lands on the scene when it finishes) */
export async function startReview(req: ReviewRequest): Promise<{ taskId: string; sheets: string[]; round: number; scene?: string }> {
  const store = cur();
  const script = getScript();
  const sc: Scene | undefined = req.sceneId ? script.scenes.find((s) => s.id === req.sceneId) : undefined;
  if (req.sceneId && !sc) throw uerr('Unknown scene: {id}', { id: req.sceneId });
  const start = sc ? sc.start : Math.max(0, Number(req.start) || 0);
  const end = sc ? sc.start + sc.duration : Number(req.end) || Math.min(store.project.duration || start + 5, start + 10);
  if (!(end > start)) throw uerr('Give a sceneId or a start < end range');
  const n = sc ? script.scenes.indexOf(sc) + 1 : 0;
  const round = sc?.review && !sc.review.pass ? sc.review.round + 1 : 1;

  const [shots, measured, prefs] = await Promise.all([contactSheets(start, end), audit(start, end), taste()]);
  const refs = readJson<{ references: { kind: string; ref: string; title: string }[] }>(store.p('references.json'), { references: [] }).references;
  const prev = sc?.review && !sc.review.pass ? sc.review : undefined;
  const p = store.project;

  const prompt = [
    `Review ${sc ? `scene ${n} "${sc.title}" (id ${sc.id})` : 'this range of the video'}: ${start.toFixed(2)}–${end.toFixed(2)} s of a ${p.width}×${p.height} ${p.height > p.width ? 'vertical (9:16 social)' : 'horizontal'} video${round > 1 ? ` — review round ${round} of ${MAX_ROUNDS}` : ''}.`,
    `Contact sheets of the composited frames, in time order (Read every one first): ${shots.files.join(', ')}`,
    `Frame times: ${shots.times.map((t) => t.toFixed(2)).join(', ')} s (frames marked "before"/"after" belong to the neighbouring scenes — judge the seams).`,
    shots.errors.length ? `Render errors: ${shots.errors.slice(0, 5).join(' | ')}` : '',
    `Brief: ${script.brief || '(none)'}`,
    sc ? `This scene — on-screen/voice copy: ${sc.voiceover || '(none)'}\nVisual intent: ${sc.visual || '(none)'}${sc.notes ? `\nNotes: ${sc.notes}` : ''}` : '',
    `Design system (tokens): ${compactDesign() || '(none)'}`,
    refs.length ? `References the user chose: ${refs.slice(0, 10).map((r) => `${r.title} (${r.kind})`).join('; ')}` : '',
    prefs,
    measured,
    prev ? `Previous round's issues — check each one (fixed or not):\n${[...prev.p0.map((x) => 'P0 ' + x), ...prev.p1.map((x) => 'P1 ' + x)].join('\n')}` : '',
    req.focus ? `The author asks you to look especially at: ${req.focus}` : '',
  ].filter(Boolean).join('\n\n');

  const t = startCritic(req.caller, { title: `Art director · ${sc ? `scene ${n} “${sc.title}”` : `${start.toFixed(1)}–${end.toFixed(1)} s`}`, prompt, reviewOf: { sceneId: sc?.id, start, end, round, sheet: shots.files[0] } });
  return { taskId: t.id, sheets: shots.files, round, scene: sc?.id };
}

/** the critic's final message → verdict (pass is recomputed: no P0 and ≤ 2 P1) */
export function parseVerdict(text: string): Omit<SceneReview, 'at' | 'round'> | null {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const raw = blocks.length ? blocks[blocks.length - 1] : (text.match(/\{[\s\S]*"pass"[\s\S]*\}/) || [])[0];
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 12) : []);
    const p0 = list(j.p0), p1 = list(j.p1), p2 = list(j.p2);
    return { pass: p0.length === 0 && p1.length <= 2, verdict: String(j.verdict || ''), p0, p1, p2, strongest: j.strongest ? String(j.strongest) : undefined, weakest: j.weakest ? String(j.weakest) : undefined };
  } catch { return null; }
}

function lastText(t: Task) {
  // events are trimmed for the UI: read the agent's full final message from its stream log
  try {
    const lines = fs.readFileSync(t.logFile || '', 'utf8').trim().split('\n').reverse();
    for (const line of lines) {
      let m: any;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'result' && typeof m.result === 'string' && m.result.trim()) return m.result; // claude
      const it = m.item || m.msg;
      if (it && (it.type === 'agent_message' || it.type === 'assistant_message') && typeof it.text === 'string') return it.text; // codex
    }
  } catch { /* no log */ }
  const texts = t.events.filter((e) => e.kind === 'text' && e.text);
  return texts.length ? texts[texts.length - 1].text! : '';
}

/** verdict of a finished critic task (stored on the task's scene) */
const verdicts = new Map<string, SceneReview>();
onTaskFinish(async (t) => {
  if (t.role !== 'critic' || !t.reviewOf) return;
  const v = parseVerdict(lastText(t));
  const review: SceneReview = v
    ? { ...v, at: new Date().toISOString(), round: t.reviewOf.round, sheet: t.reviewOf.sheet, taskId: t.id }
    : { pass: false, verdict: 'The art director gave no verdict (no JSON block) — re-run the review.', p0: [], p1: [], p2: [], at: new Date().toISOString(), round: t.reviewOf.round, taskId: t.id };
  verdicts.set(t.id, review);
  if (t.reviewOf.sceneId && v) await patchScene(t.reviewOf.sceneId, { review });
});

/** for the MCP bridge: poll until the critic is done; then the verdict as text for the author */
export function reviewStatus(taskId: string): { done: boolean; status: string; review?: SceneReview; text?: string } {
  const t = getTask(taskId);
  if (!t || t.role !== 'critic') throw uerr('Unknown review: {id}', { id: taskId });
  if (t.status === 'running' || t.status === 'queued') return { done: false, status: t.status };
  const review = verdicts.get(taskId) || (t.reviewOf?.sceneId ? getScript().scenes.find((s) => s.id === t.reviewOf!.sceneId)?.review : undefined);
  if (!review || review.taskId !== taskId) return { done: true, status: t.status, text: `The review ended (${t.status}) without a verdict. Its last words: ${lastText(t).slice(-800) || '(none)'}` };
  return { done: true, status: t.status, review, text: verdictText(review) };
}

export function verdictText(r: SceneReview) {
  const lines = [
    `${r.pass ? 'PASS' : 'NOT YET'} (round ${r.round}/${MAX_ROUNDS}) — ${r.verdict}`,
    ...r.p0.map((x) => `P0 ${x}`), ...r.p1.map((x) => `P1 ${x}`), ...r.p2.map((x) => `P2 ${x}`),
    r.strongest ? `Keep: ${r.strongest}` : '', r.weakest ? `Most important change: ${r.weakest}` : '',
    r.pass
      ? 'You may mark the scene done (fix the P2s you agree with first if they are cheap).'
      : r.round >= MAX_ROUNDS
        ? `Last round: fix what you can, then mark the scene done and list the remaining issues in its notes.`
        : 'Fix every P0, then the P1s (smallest scope, keep what works), verify with render_frame, then call art_director again for this scene.',
  ];
  return lines.filter(Boolean).join('\n');
}

/** gate for an agent marking a scene done: has it been reviewed (passed, or the rounds are used up)? */
export function doneGate(sceneId: string): string | null {
  if ((getSettings().artDirector || 'scenes') === 'off') return null;
  const sc = getScript().scenes.find((s) => s.id === sceneId);
  if (!sc) return null;
  const r = sc.review;
  if (r && (r.pass || r.round >= MAX_ROUNDS)) return null;
  return r
    ? `The art director has not passed scene "${sc.title}" yet (round ${r.round}/${MAX_ROUNDS}: ${r.p0.length} P0, ${r.p1.length} P1). Fix them and call art_director {sceneId:"${sc.id}"} again before marking it done.`
    : `Before marking scene "${sc.title}" done, get it reviewed: art_director {sceneId:"${sc.id}"} (a fresh-eyes critic with your frames), fix what it finds, re-review until it passes (max ${MAX_ROUNDS} rounds). For a trivial change you may pass {force:true, reason:"…"} in the patch instead.`;
}

