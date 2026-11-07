import { useEffect, useRef, useState } from 'react';
import type { Scene, StageId } from '../../../shared/types';
import { useStore, usePlayhead, actions, seek, fmtTime, setState } from '../store';
import { Icon } from './Icon';

const STAGES: { id: StageId; label: string }[] = [
  { id: 'brief', label: 'Бриф' },
  { id: 'script', label: 'Сценарий' },
  { id: 'storyboard', label: 'Раскадровка' },
  { id: 'production', label: 'Производство' },
  { id: 'review', label: 'Проверка' },
  { id: 'export', label: 'Экспорт' },
];
const STATUS: Record<Scene['status'], string> = { todo: 'Не начато', doing: 'В работе', done: 'Готово' };
const NEXT: Record<Scene['status'], Scene['status']> = { todo: 'doing', doing: 'done', done: 'todo' };

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
      ? 'Перепиши сценарий видео по брифу (get_script → set_script). Сохрани удачные сцены, улучши хук и тайминг. Пока только сценарий, без производства.'
      : 'Напиши сценарий видео по брифу из сценария проекта (get_script → set_script, stage "script"): сцены с таймингом, закадровым текстом и визуалом. Пока только сценарий, без производства.',
  );
  const produceAll = () => actions.startTask('Сделай видео по сценарию (get_script): раскадровка → производство сцена за сценой с обновлением статусов (update_scene) → проверка. Следуй скиллу studio-production.');

  return (
    <div className="script">
      <div className="stepper">
        {STAGES.map((st, i) => (
          <button key={st.id} className={'step-pill' + (i < stageIdx ? ' past' : '') + (i === stageIdx ? ' now' : '')} onClick={() => actions.saveScript({ stage: st.id })} title={`Этап: ${st.label}`}>
            <span className="step-dot">{i < stageIdx ? <Icon name="check" size={9} /> : i + 1}</span>
            <span className="step-label">{st.label}</span>
          </button>
        ))}
      </div>

      <div className="script-body">
        <div className={'brief' + (briefOpen ? ' open' : '')}>
          <button className="brief-head" onClick={() => setBriefOpen(!briefOpen)}>
            <span>Бриф</span>
            {!briefOpen && script.brief && <span className="brief-peek ellipsis">{script.brief}</span>}
            <Icon name="chevron" size={11} />
          </button>
          {briefOpen && (
            <>
              <BriefEditor value={script.brief} />
              <div className="row gap6">
                <button className="btn sm primary" disabled={!script.brief.trim()} onClick={writeScript}><Icon name="sparkle" size={11} /> {script.scenes.length ? 'Переписать сценарий' : 'Написать сценарий'}</button>
              </div>
            </>
          )}
        </div>

        {script.scenes.length > 0 && (
          <div className="scenes-head">
            <span>{script.scenes.length} {plural(script.scenes.length, 'сцена', 'сцены', 'сцен')} · {fmtTime(total, fps)}</span>
            <span className="scenes-progress"><span style={{ width: `${(done / script.scenes.length) * 100}%` }} /></span>
            <span>{done}/{script.scenes.length}</span>
          </div>
        )}

        <div className="scenes">
          {script.scenes.map((sc, i) => <SceneCard key={sc.id} sc={sc} n={i + 1} fps={fps} />)}
        </div>

        <div className="row gap6 script-actions">
          <button className="btn sm ghost" onClick={() => actions.addScene()}><Icon name="plus" size={12} /> Сцена</button>
          {script.scenes.length > 0 && <button className="btn sm" onClick={produceAll}><Icon name="sparkle" size={11} /> Сделать всё видео</button>}
          {script.scenes.some((x) => x.voiceover?.trim()) && <VoiceAll />}
        </div>
      </div>
    </div>
  );
}
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

function BriefEditor({ value }: { value: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ref = useAutoGrow(v);
  return <textarea ref={ref} className="brief-input" rows={3} value={v} placeholder="О чём ролик, для кого, длительность, формат (16:9 / 9:16), тон, обязательные фразы, ссылки…" onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && actions.saveScript({ brief: v })} />;
}

function VoiceAll() {
  const scenes = useStore((s) => s.script.scenes);
  const [prog, setProg] = useState<string | null>(null);
  const run = async () => {
    const list = scenes.filter((x) => x.voiceover?.trim());
    for (let i = 0; i < list.length; i++) {
      setProg(`${i + 1}/${list.length}`);
      try { await actions.voiceScene(list[i].id); } catch { break; }
    }
    setProg(null);
  };
  return <button className="btn sm ghost" disabled={!!prog} onClick={run}>{prog ? <><span className="spinner sm" /> Озвучка {prog}</> : <>♪ Озвучить всё</>}</button>;
}

function useAutoGrow(v: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }, [v]);
  return ref;
}

function SceneCard({ sc, n, fps }: { sc: Scene; n: number; fps: number }) {
  const t = usePlayhead();
  const active = t >= sc.start && t < sc.start + sc.duration;
  const [open, setOpen] = useState(false);
  const live = useStore((s) => s.tasks.some((x) => x.status === 'running' && x.focus?.kind === 'script') && sc.status === 'doing');
  const make = () => actions.startTask(`Сделай сцену ${n} «${sc.title}» (id ${sc.id}, ${sc.start.toFixed(2)}–${(sc.start + sc.duration).toFixed(2)} s) по сценарию: get_script → update_scene status doing → клипы/музыка/таймлайн → проверка render_frame → update_scene done с itemIds.`);
  return (
    <div className={`scene st-${sc.status}${active ? ' active' : ''}${open ? ' open' : ''}`}>
      <div className="scene-top" onClick={() => { seek(sc.start + 0.001); setState({ selectedItemId: null }); }}>
        <span className="scene-n">{n}</span>
        <TitleEdit sc={sc} />
        <span className="scene-time mono">{fmtTime(sc.start, fps)}</span>
      </div>
      {(sc.voiceover || open) && <Field label="Текст" value={sc.voiceover || ''} onSave={(v) => actions.patchScene(sc.id, { voiceover: v })} open={open} placeholder="Закадровый или экранный текст" />}
      {(sc.visual || open) && <Field label="Визуал" value={sc.visual || ''} onSave={(v) => actions.patchScene(sc.id, { visual: v })} open={open} placeholder="Что в кадре: композиция, движение, стиль" />}
      {open && (
        <div className="scene-timing">
          <TimeInput label="Начало" value={sc.start} onSave={(v) => actions.patchScene(sc.id, { start: v })} />
          <TimeInput label="Длина" value={sc.duration} onSave={(v) => actions.patchScene(sc.id, { duration: v })} />
        </div>
      )}
      <div className="scene-bar">
        <button className={`scene-status st-${sc.status}`} onClick={() => actions.patchScene(sc.id, { status: NEXT[sc.status] })} title="Сменить статус">
          {live ? <span className="spinner sm" /> : <span className="dot" />}{STATUS[sc.status]}
        </button>
        <span className="grow" />
        <button className="link" onClick={() => setOpen(!open)}>{open ? 'Свернуть' : 'Подробнее'}</button>
        {sc.voiceover?.trim() && <VoiceButton sc={sc} />}
        <button className="link" onClick={make}>Сделать</button>
        {open && <button className="link danger" onClick={() => actions.deleteScene(sc.id)}>Удалить</button>}
      </div>
    </div>
  );
}

function VoiceButton({ sc }: { sc: Scene }) {
  const [busy, setBusy] = useState(false);
  const voiced = useStore((s) => (sc.itemIds || []).some((id) => s.project?.items.find((i) => i.id === id && i.label?.startsWith('VO'))));
  return (
    <button className={'link' + (voiced ? ' voiced' : '')} disabled={busy} title="Озвучить текст сцены через ElevenLabs"
      onClick={async () => { setBusy(true); try { await actions.voiceScene(sc.id); } catch {} finally { setBusy(false); } }}>
      {busy ? <span className="spinner sm" /> : voiced ? '♪ Переозвучить' : 'Озвучить'}
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
