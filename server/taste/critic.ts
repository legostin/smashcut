// The art director: a fresh-eyes critic reviews a scene (or any range) from contact sheets of the composited frames,
// the measured taste audit, the brief, the design system and the user's taste — and returns a verdict with exact fixes.
// It runs as a read-only agent task under the caller (the caller is idle meanwhile), the verdict is stored on the scene.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import type { Reference, Scene, SceneReview, Task } from '../../shared/types.ts';
import { cur } from '../project.ts';
import { getScript, patchScene, saveScript } from '../script.ts';
import { inspirationThumb } from '../inspiration.ts';
import { galleryThumb } from '../gallery.ts';
import { bin } from '../bin.ts';
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

async function renderShots(times: number[], label: (t: number) => string) {
  const shots: { png: Buffer; caption: string }[] = [];
  const errors: string[] = [];
  for (const t of times) {
    const r = await compositeFrame(t);
    shots.push({ png: r.png, caption: label(t) });
    errors.push(...r.errors);
  }
  return { shots, errors };
}

async function saveSheets(shots: { png: Buffer; caption: string }[], name: string, per: number, cols: number) {
  const store = cur();
  const files: string[] = [];
  const stamp = Date.now().toString(36);
  for (let i = 0; i < shots.length; i += per) {
    const png = await sheet(shots.slice(i, i + per), { cols, width: 1800, checker: false });
    const file = `.studio/frames/${name}-${stamp}-${i / per + 1}.png`;
    fs.writeFileSync(store.p(file), png);
    files.push(file);
  }
  return files;
}

/** key frames of a scene/range: few per sheet so type and detail stay judgeable */
async function contactSheets(times: number[], start: number, end: number) {
  const vertical = cur().project.height > cur().project.width;
  const { shots, errors } = await renderShots(times, (t) => `t=${t.toFixed(2)}s${t < start ? ' (before)' : t > end ? ' (after)' : ''}`);
  const files = await saveSheets(shots, 'review', vertical ? 8 : 6, vertical ? 4 : 3);
  const hash = createHash('sha1');
  for (const x of shots) hash.update(x.png);
  return { files, times, errors: [...new Set(errors)], hash: hash.digest('hex').slice(0, 16) };
}

/** motion: short bursts at ~12 fps (one row per moment, left → right in time) around the entrance, cuts and the exit */
async function motionStrips(moments: { label: string; from: number; to: number }[]) {
  const end = cur().project.duration || 0;
  const rows: { png: Buffer; caption: string }[] = [];
  const used: string[] = [];
  for (const m of moments.slice(0, 4)) {
    const a = Math.max(0, m.from), z = Math.min(end - 0.02, m.to);
    if (!(z > a + 0.1)) continue;
    const ts = Array.from({ length: 8 }, (_, i) => +(a + ((z - a) * i) / 7).toFixed(3));
    const { shots } = await renderShots(ts, (t) => `${m.label} ${t.toFixed(2)}s`);
    rows.push(...shots);
    used.push(`${m.label} ${a.toFixed(2)}–${z.toFixed(2)} s`);
  }
  if (!rows.length) return null;
  const [file] = await saveSheets(rows, 'motion', rows.length, 8);
  return { file, rows: used };
}

/** the references the user chose, as pictures: the critic compares the work against them (principles, not copying) */
async function referenceBoard(sceneId?: string) {
  const store = cur();
  const refs = readJson<{ references: Reference[] }>(store.p('references.json'), { references: [] }).references
    .filter((r) => r.kind !== 'music-technique' && (!sceneId || !r.sceneIds?.length || r.sceneIds.includes(sceneId)));
  const notes = refs.slice(0, 12).map((r) => `- ${r.title} (${r.kind})${r.note ? `: ${r.note}` : ''}`);
  const cells: { png: Buffer; caption: string }[] = [];
  for (const r of refs) {
    if (cells.length >= 6) break;
    try {
      let src: Buffer | null = null;
      if (r.kind === 'media') {
        const m = store.listMedia().find((x) => x.file === r.ref);
        if (m?.type === 'image') src = fs.readFileSync(store.p('media', r.ref));
        else if (m?.type === 'video') src = await videoFrame(store.p('media', r.ref), (m.duration || 3) / 3);
      } else if (r.kind === 'inspiration') {
        const f = await inspirationThumb(r.ref);
        if (f) src = fs.readFileSync(f);
      } else if (r.kind === 'technique') {
        src = fs.readFileSync(await galleryThumb(r.origin || 'builtin', r.ref));
      } else if (r.kind === 'link' && r.thumb && !/^https?:/.test(r.thumb)) {
        const rel = r.thumb.replace(/^\/p\/[^/]+\//, '').replace(/^\//, '').split('?')[0];
        if (fs.existsSync(store.p(rel))) src = fs.readFileSync(store.p(rel));
      }
      if (src) cells.push({ png: await sharp(src).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).png().toBuffer(), caption: r.title.slice(0, 48) });
    } catch { /* a broken reference is skipped */ }
  }
  const file = cells.length ? (await saveSheets(cells, 'refs', cells.length, Math.min(3, cells.length)))[0] : undefined;
  return { file, notes };
}

function videoFrame(src: string, at: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const p = spawn(bin('ffmpeg'), ['-v', 'error', '-ss', String(at), '-i', src, '-frames:v', '1', '-vf', 'scale=960:-2', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1']);
    const out: Buffer[] = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', () => resolve(null));
    p.on('close', () => resolve(out.length ? Buffer.concat(out) : null));
  });
}

async function audit(start: number, end: number): Promise<string> {
  try {
    const m = await import('./audit.ts');
    const r = await Promise.race([m.auditRange({ start, end }), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timed out')), 120_000))]);
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

export interface ReviewRequest { caller?: string; sceneId?: string; film?: boolean; start?: number; end?: number; focus?: string; force?: boolean; /** language name for the verdict text (default: the caller's reply language, else English) */ language?: string }
export interface ReviewStart { taskId?: string; cached?: SceneReview; text?: string; sheets: string[]; round: number; scene?: string; film?: boolean }

/** start an art-director review of a scene, a range, or the whole film; unchanged frames reuse the last verdict */
export async function startReview(req: ReviewRequest): Promise<ReviewStart> {
  const store = cur();
  const p = store.project;
  const script = getScript();
  const film = !!req.film;
  const sc: Scene | undefined = !film && req.sceneId ? script.scenes.find((s) => s.id === req.sceneId) : undefined;
  if (!film && req.sceneId && !sc) throw uerr('Unknown scene: {id}', { id: req.sceneId });
  const total = p.duration || 0;
  const start = film ? 0 : sc ? sc.start : Math.max(0, Number(req.start) || 0);
  const end = film ? total : sc ? sc.start + sc.duration : Number(req.end) || Math.min(total || start + 5, start + 10);
  if (!(end > start)) throw uerr('Give a sceneId or a start < end range');
  const n = sc ? script.scenes.indexOf(sc) + 1 : 0;
  const last = film ? script.review : sc?.review;

  // what the critic looks at
  const times = film ? filmTimes(script.scenes, total) : pickTimes(start, end, total || end + 1);
  const shots = await contactSheets(times, start, end);
  if (last && last.hash === shots.hash && !req.force) {
    return { cached: last, text: `Nothing changed in these frames since the last review — same verdict:\n${verdictText(last)}`, sheets: shots.files, round: last.round, scene: sc?.id, film };
  }
  const round = last && !last.pass ? last.round + 1 : 1;
  const covered = (t: number) => p.items.some((it) => it.kind !== 'music' && t >= it.start && t < it.start + it.duration);
  const moments = film
    ? script.scenes.slice(1).map((x, i) => ({ label: `seam ${i + 1}→${i + 2}`, from: x.start - 0.33, to: x.start + 0.33 }))
    : [
        { label: 'entrance', from: start, to: start + Math.min(0.7, (end - start) / 3) },
        ...[...new Set(p.items.flatMap((it) => [it.start, it.start + it.duration]).filter((e) => e > start + 0.6 && e < end - 0.6).map((e) => +e.toFixed(2)))].slice(0, 2).map((e) => ({ label: 'cut', from: e - 0.33, to: e + 0.33 })),
        covered(end + 0.1) ? { label: 'exit', from: end - 0.4, to: end + 0.26 } : { label: 'exit', from: end - 0.66, to: end - 0.02 },
      ];
  const [motion, measured, prefs, board] = await Promise.all([motionStrips(moments), audit(start, end), taste(), referenceBoard(sc?.id)]);
  const prev = last && !last.pass ? last : undefined;

  const what = film ? `the WHOLE FILM (${total.toFixed(1)} s, ${script.scenes.length} scenes)` : sc ? `scene ${n} "${sc.title}" (id ${sc.id}): ${start.toFixed(2)}–${end.toFixed(2)} s` : `the range ${start.toFixed(2)}–${end.toFixed(2)} s`;
  const prompt = [
    `Review ${what} of a ${p.width}×${p.height} ${p.height > p.width ? 'vertical (9:16 social)' : 'horizontal'} video${round > 1 ? ` — review round ${round} of ${MAX_ROUNDS}` : ''}.`,
    film ? FILM_FOCUS : '',
    `Key frames, in time order (Read every sheet first): ${shots.files.join(', ')}\nFrame times: ${shots.times.map((t) => t.toFixed(2)).join(', ')} s${film ? ' (one key frame per scene plus both sides of every scene change)' : ' (frames marked "before"/"after" belong to the neighbouring scenes — judge the seams)'}.`,
    motion ? `MOTION strips (Read it): ${motion.file} — one row per moment, left → right in time at ~12 fps: ${motion.rows.join('; ')}. Judge the motion itself here: easing (does it accelerate/land, or crawl linearly?), overlap and order of arrivals, holds, what the eye follows, how the cut feels.` : '',
    board.file ? `REFERENCES the user chose (Read it): ${board.file} — is the work in the same league in composition, type, density, light and finish? Name the principle it misses. Never ask to copy them.` : '',
    board.notes.length ? `Reference notes:\n${board.notes.join('\n')}` : '',
    shots.errors.length ? `Render errors: ${shots.errors.slice(0, 5).join(' | ')}` : '',
    `Brief: ${script.brief || '(none)'}`,
    film
      ? `Scenes:\n${script.scenes.map((x, i) => `${i + 1}. "${x.title}" ${x.start.toFixed(1)}–${(x.start + x.duration).toFixed(1)} s · copy: ${(x.voiceover || '—').slice(0, 140)} · visual: ${(x.visual || '—').slice(0, 140)}`).join('\n')}`
      : sc ? `This scene — on-screen/voice copy: ${sc.voiceover || '(none)'}\nVisual intent: ${sc.visual || '(none)'}${sc.notes ? `\nNotes: ${sc.notes}` : ''}` : '',
    `Design system (tokens): ${compactDesign() || '(none)'}`,
    prefs,
    measured,
    prev ? `Previous round's issues — check each one (fixed or not):\n${[...prev.p0.map((x) => 'P0 ' + x), ...prev.p1.map((x) => 'P1 ' + x)].join('\n')}` : '',
    req.focus ? `The author asks you to look especially at: ${req.focus}` : '',
    verdictLanguage(req) ? `Write the prose, the verdict and every item in ${verdictLanguage(req)} — the user reads them (keep times, px, hex colours, ease names and ids as they are; the JSON keys stay in English).` : '',
  ].filter(Boolean).join('\n\n');

  const title = `Art director · ${film ? 'whole video' : sc ? `scene ${n} “${sc.title}”` : `${start.toFixed(1)}–${end.toFixed(1)} s`}`;
  const t = startCritic(req.caller, { title, prompt, reviewOf: { sceneId: sc?.id, film, start, end, round, sheet: shots.files[0], hash: shots.hash } });
  return { taskId: t.id, sheets: [...shots.files, ...(motion ? [motion.file] : []), ...(board.file ? [board.file] : [])], round, scene: sc?.id, film };
}

/** the user's language: given by the UI, else the language the caller agent was told to reply in */
function verdictLanguage(req: ReviewRequest): string {
  if (req.language && req.language !== 'English') return req.language;
  const caller = req.caller ? getTask(req.caller) : undefined;
  const m = caller?.prompt.match(/Write your replies and summaries for the user in ([A-Za-z ()]+)\./);
  return m && m[1] !== 'English' ? m[1] : '';
}

/** the whole film: one key frame per scene (its payoff, ~55 %) and both sides of every scene change */
function filmTimes(scenes: Scene[], total: number): number[] {
  const ts = new Set<number>();
  const add = (t: number) => { if (t >= 0 && t <= total - 0.02) ts.add(+t.toFixed(2)); };
  if (!scenes.length) { for (let i = 0; i < 12; i++) add((total * (i + 0.5)) / 12); }
  scenes.forEach((x, i) => { if (i > 0) add(x.start - 0.1); add(x.start + 0.15); add(x.start + x.duration * 0.55); });
  return [...ts].sort((a, b) => a - b).slice(0, 36);
}

const FILM_FOCUS = `Judge the FILM as a whole, not scene by scene: does the first 3 s hook and is frame 0 a strong thumbnail; is there one story spine with a clear payoff; the pacing curve (shot lengths vary, energy builds, a still moment before the payoff, the end card held 2–3 s); ONE design language across all scenes (type system, palette and accent rationing, light, stroke/radius style); a limited family of transitions with one dominant direction; repetition that bores vs. motifs that rhyme; the seams. Refer to scenes by number and time.`;

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
    ? { ...v, at: new Date().toISOString(), round: t.reviewOf.round, sheet: t.reviewOf.sheet, taskId: t.id, hash: t.reviewOf.hash }
    : { pass: false, verdict: 'The art director gave no verdict (no JSON block) — re-run the review.', p0: [], p1: [], p2: [], at: new Date().toISOString(), round: t.reviewOf.round, taskId: t.id };
  verdicts.set(t.id, review);
  if (t.reviewOf.sceneId && v) await patchScene(t.reviewOf.sceneId, { review });
  else if (t.reviewOf.film && v) await saveScript({ review });
});

/** for the MCP bridge: poll until the critic is done; then the verdict as text for the author */
export function reviewStatus(taskId: string): { done: boolean; status: string; review?: SceneReview; text?: string } {
  const t = getTask(taskId);
  if (!t || t.role !== 'critic') throw uerr('Unknown review: {id}', { id: taskId });
  if (t.status === 'running' || t.status === 'queued') return { done: false, status: t.status };
  const review = verdicts.get(taskId) || (t.reviewOf?.sceneId ? getScript().scenes.find((s) => s.id === t.reviewOf!.sceneId)?.review : t.reviewOf?.film ? getScript().review : undefined);
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

