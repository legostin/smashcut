import { useEffect, useRef, useState } from 'react';
import type { Scene, StageId } from '../../../shared/types';
import { useStore, usePlayhead, actions, seek, fmtTime, setState, api, notify } from '../store';
import { Icon } from './Icon';
import { t, tn } from '../i18n';

const STAGES: { id: StageId; label: string }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'script', label: 'Script' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'production', label: 'Production' },
  { id: 'review', label: 'Review' },
  { id: 'export', label: 'Export' },
];
const STATUS: Record<Scene['status'], string> = { todo: 'Not started', doing: 'In progress', review: 'Needs review', done: 'Done', approved: 'Approved' };
const NEXT: Record<Scene['status'], Scene['status']> = { todo: 'doing', doing: 'done', review: 'done', done: 'approved', approved: 'todo' };

/** Script & production pipeline: stage stepper, brief, scene cards (storyboard). */
export function ScriptPanel() {
  const script = useStore((s) => s.script);
  const fps = useStore((s) => s.project?.fps || 30);
  const stageIdx = STAGES.findIndex((s) => s.id === script.stage);
  const done = script.scenes.filter((s) => s.status === 'done').length;
  const total = script.scenes.reduce((a, s) => Math.max(a, s.start + s.duration), 0);
  const [briefOpen, setBriefOpen] = useState(!script.scenes.length);
  useEffect(() => { if (!script.scenes.length) setBriefOpen(true); }, [script.scenes.length]);

  const writeScript = () => actions.startTask(
    script.scenes.length
      ? 'Rewrite the video script from the brief (get_script → set_script). Keep the scenes that work, improve the hook and the timing. Script only for now, no production.'
      : 'Write the video script from the brief in the project script (get_script → set_script, stage "script"): scenes with timing, voiceover text and visuals. Script only for now, no production.',
  );
  const produceAll = () => actions.startTask('Make the video from the script (get_script): storyboard → production scene by scene, updating statuses (update_scene) → review. Follow the studio-production skill.');

  return (
    <div className="script">
      <div className="stage-steps">
        {STAGES.map((st, i) => (
          <button key={st.id} className={'step-pill' + (i < stageIdx ? ' past' : '') + (i === stageIdx ? ' now' : '')} onClick={() => actions.saveScript({ stage: st.id })} title={t('Stage: {name}', { name: t(st.label) })}>
            <span className="step-dot">{i < stageIdx ? <Icon name="check" size={9} /> : i + 1}</span>
            <span className="step-label">{t(st.label)}</span>
          </button>
        ))}
      </div>

      <div className="script-body">
        <div className={'brief' + (briefOpen ? ' open' : '')}>
          <button className="brief-head" onClick={() => setBriefOpen(!briefOpen)}>
            <span>{t('Brief')}</span>
            {!briefOpen && script.brief && <span className="brief-peek ellipsis">{script.brief}</span>}
            <Icon name="chevron" size={11} />
          </button>
          {briefOpen && (
            <>
              <BriefEditor value={script.brief} />
              <div className="row gap6">
                <button className="btn sm primary" disabled={!script.brief.trim()} onClick={writeScript}><Icon name="sparkle" size={11} /> {script.scenes.length ? t('Rewrite script') : t('Write script')}</button>
              </div>
            </>
          )}
        </div>

        {script.scenes.length > 0 && (
          <div className="scenes-head">
            <span>{tn(script.scenes.length, '{n} scene', '{n} scenes')} · {fmtTime(total, fps)}</span>
            <span className="scenes-progress"><span style={{ width: `${(done / script.scenes.length) * 100}%` }} /></span>
            <span>{done}/{script.scenes.length}</span>
          </div>
        )}

        <div className="scenes">
          {script.scenes.map((sc, i) => <SceneCard key={sc.id} sc={sc} n={i + 1} fps={fps} />)}
        </div>

        <div className="row gap6 script-actions">
          <button className="btn sm ghost" onClick={() => actions.addScene()}><Icon name="plus" size={12} /> {t('Scene')}</button>
          {script.scenes.length > 0 && <button className="btn sm" onClick={produceAll}><Icon name="sparkle" size={11} /> {t('Make the whole video')}</button>}
          {script.scenes.some((x) => x.voiceover?.trim()) && <VoiceAll />}
        </div>
      </div>
    </div>
  );
}

function BriefEditor({ value }: { value: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ref = useAutoGrow(v);
  return <textarea ref={ref} className="brief-input" rows={3} value={v} placeholder={t('What the video is about, who it is for, length, format (16:9 / 9:16), tone, must-have phrases, links…')} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && actions.saveScript({ brief: v })} />;
}

function VoiceAll() {
  const scenes = useStore((s) => s.script.scenes);
  const [prog, setProg] = useState<string | null>(null);
  const run = async () => {
    // without prepared speech text the agent runs the whole voice process (speech → voice → pace check)
    if (scenes.some((x) => x.voiceover?.trim() && !x.speech?.trim())) {
      actions.startTask('Voice-over for the whole video following the studio-voiceover skill: write the speech text for every narrated scene (update_scene speech: numbers/dates/units/abbreviations as words in the right form, {display|spoken}, stress marks, pauses), then generate_voiceover per scene in order, then voice_report and fix every flagged sentence or overflow. Finish with the report.');
      setState({ sideTab: 'agent' });
      return;
    }
    const list = scenes.filter((x) => x.voiceover?.trim());
    for (let i = 0; i < list.length; i++) {
      setProg(`${i + 1}/${list.length}`);
      try { await actions.voiceScene(list[i].id); } catch { break; }
    }
    setProg(null);
  };
  return <button className="btn sm ghost" disabled={!!prog} onClick={run}>{prog ? <><span className="spinner sm" /> {t('Voiceover {p}', { p: prog })}</> : <>♪ {t('Voice all')}</>}</button>;
}

function useAutoGrow(v: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }, [v]);
  return ref;
}

function SceneCard({ sc, n, fps }: { sc: Scene; n: number; fps: number }) {
  const ph = usePlayhead();
  const active = ph >= sc.start && ph < sc.start + sc.duration;
  const [open, setOpen] = useState(false);
  const live = useStore((s) => s.tasks.some((x) => x.status === 'running' && x.focus?.kind === 'script') && sc.status === 'doing');
  const make = () => actions.startTask(`Make scene ${n} "${sc.title}" (id ${sc.id}, ${sc.start.toFixed(2)}–${(sc.start + sc.duration).toFixed(2)} s) from the script: get_script → update_scene status doing → clips/music/timeline → check with render_frame → update_scene done with itemIds.`);
  return (
    <div className={`scene st-${sc.status}${active ? ' active' : ''}${open ? ' open' : ''}`}>
      <div className="scene-top" onClick={() => { seek(sc.start + 0.001); setState({ selectedItemId: null }); }}>
        <span className="scene-n">{n}</span>
        <TitleEdit sc={sc} />
        <span className="scene-time mono">{fmtTime(sc.start, fps)}</span>
      </div>
      {(sc.voiceover || open) && <Field label={t('Text')} value={sc.voiceover || ''} onSave={(v) => actions.patchScene(sc.id, { voiceover: v })} open={open} placeholder={t('Voiceover or on-screen text')} />}
      {(sc.speech || (open && sc.voiceover)) && <Field label={t('Speech (what the narrator says)')} value={sc.speech || ''} onSave={(v) => actions.patchScene(sc.id, { speech: v })} open={open} placeholder={t('Numbers as words, {2026|two thousand twenty-six}, stress á, [pause 0.4]')} />}
      {(sc.visual || open) && <Field label={t('Visual')} value={sc.visual || ''} onSave={(v) => actions.patchScene(sc.id, { visual: v })} open={open} placeholder={t('What is in the frame: composition, motion, style')} />}
      {open && (
        <div className="scene-timing">
          <TimeInput label={t('Starts at')} value={sc.start} onSave={(v) => actions.patchScene(sc.id, { start: v })} />
          <TimeInput label={t('Duration')} value={sc.duration} onSave={(v) => actions.patchScene(sc.id, { duration: v })} />
        </div>
      )}
      <div className="scene-bar">
        <button className={`scene-status st-${sc.status}`} onClick={() => actions.patchScene(sc.id, { status: NEXT[sc.status] })} title={t('Change status')}>
          {live ? <span className="spinner sm" /> : <span className="dot" />}{t(STATUS[sc.status])}
        </button>
        <span className="grow" />
        <button className="link" onClick={() => setOpen(!open)}>{open ? t('Collapse') : t('More')}</button>
        {typeof sc.vo?.rate === 'number' && <span className={'vo-pace' + (sc.vo.flagged ? ' warn' : '')} title={t('Voice pace: {r} syllables/s · {n} flagged', { r: sc.vo.rate.toFixed(1), n: sc.vo.flagged ?? 0 })}>{sc.vo.flagged ? '⚠' : '✓'} {sc.vo.rate.toFixed(1)}</span>}
        {sc.voiceover?.trim() && !sc.speech && <button className="link" onClick={() => actions.startTask(`Prepare the speech text for scene ${n} "${sc.title}" (id ${sc.id}) following the studio-voiceover skill: update_scene {speech} with numbers/dates as words, {display|spoken}, stress marks and pauses. Don't generate the voice yet; show me the speech text.`)}>{t('Prepare speech')}</button>}
        {sc.voiceover?.trim() && <VoiceButton sc={sc} />}
        <ReviewBadge sc={sc} />
        <button className="link" onClick={make}>{t('Make')}</button>
        {open && <button className="link danger" onClick={() => actions.deleteScene(sc.id)}>{t('Delete')}</button>}
      </div>
    </div>
  );
}

/** the art director's verdict on the scene (or a button to ask for one) */
function ReviewBadge({ sc }: { sc: Scene }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const r = sc.review;
  const run = async () => { setBusy(true); try { await api('POST', `/api/script/scenes/${sc.id}/review`); notify('info', t('The art director is looking at the scene…')); } catch (e) { notify('error', (e as Error).message); } finally { setBusy(false); } };
  if (!r) return sc.itemIds?.length ? <button className="link" disabled={busy} onClick={run} title={t('A fresh-eyes critic reviews the frames of this scene')}>{t('Art review')}</button> : null;
  const items = [...r.p0.map((x) => ['P0', x]), ...r.p1.map((x) => ['P1', x]), ...r.p2.map((x) => ['P2', x])];
  return (
    <span className="review-wrap">
      <button className={'review-badge' + (r.pass ? ' ok' : ' warn')} onClick={() => setOpen((o) => !o)} title={r.verdict}>
        {r.pass ? '✓' : '!'} {t('Art')}{!r.pass && r.p0.length + r.p1.length ? ` · ${r.p0.length + r.p1.length}` : ''}
      </button>
      {open && (
        <div className="review-pop" onClick={(e) => e.stopPropagation()}>
          <div className="small"><b>{r.pass ? t('Passed') : t('Not yet')}</b> · {t('round {n}', { n: r.round })}</div>
          <div className="muted xsmall">{r.verdict}</div>
          {items.map(([sev, x], i) => <div key={i} className={'review-item sev-' + sev}><span className="mono">{sev}</span> {x}</div>)}
          {r.strongest && <div className="xsmall"><span className="muted">{t('What works')}:</span> {r.strongest}</div>}
          <div className="row gap2" style={{ marginTop: 6 }}>
            <button className="btn xs" disabled={busy} onClick={run}>{t('Review again')}</button>
            {!r.pass && <button className="btn xs primary" onClick={() => { setOpen(false); actions.startTask(`Fix the art director's notes on scene "${sc.title}" (id ${sc.id}): ${items.map(([sev, x]) => `${sev} ${x}`).join('; ')}. Then art_director {sceneId:"${sc.id}"} again.`); }}>{t('Fix these')}</button>}
          </div>
        </div>
      )}
    </span>
  );
}

function VoiceButton({ sc }: { sc: Scene }) {
  const [busy, setBusy] = useState(false);
  const voiced = useStore((s) => (sc.itemIds || []).some((id) => s.project?.items.find((i) => i.id === id && i.label?.startsWith('VO'))));
  return (
    <button className={'link' + (voiced ? ' voiced' : '')} disabled={busy} title={t('Voice the scene text with ElevenLabs')}
      onClick={async () => { setBusy(true); try { await actions.voiceScene(sc.id); } catch {} finally { setBusy(false); } }}>
      {busy ? <span className="spinner sm" /> : voiced ? '♪ ' + t('Re-voice') : t('Voice')}
    </button>
  );
}

function TitleEdit({ sc }: { sc: Scene }) {
  const [v, setV] = useState(sc.title);
  useEffect(() => setV(sc.title), [sc.title]);
  return <input className="scene-title" value={v} onClick={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} onBlur={() => v !== sc.title && actions.patchScene(sc.id, { title: v })} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function Field({ label, value, onSave, open, placeholder }: { label: string; value: string; onSave: (v: string) => void; open: boolean; placeholder: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ref = useAutoGrow(v);
  return (
    <label className={'scene-field' + (open ? ' editing' : '')}>
      <span>{label}</span>
      {open
        ? <textarea ref={ref} rows={1} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
        : <div className="scene-text">{value}</div>}
    </label>
  );
}

function TimeInput({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(+value.toFixed(2)));
  useEffect(() => setV(String(+value.toFixed(2))), [value]);
  return (
    <label className="num">
      <span>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = Number(v); if (!Number.isNaN(n) && n !== value) onSave(n); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}
