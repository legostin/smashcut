import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Comment, Project } from '../../../shared/types';
import { Player } from './Player';
import { useStore, usePlayhead, setState, getState, actions, togglePlay, seek, fmtTime, projectEnd, time } from '../store';
import { Icon } from './Icon';

export function Viewer({ project }: { project: Project }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const commentMode = useStore((s) => s.commentMode);
  useLayoutEffect(() => {
    const el = wrap.current!;
    const fit = () => { const r = el.getBoundingClientRect(); setScale(Math.max(0.05, Math.min((r.width - 48) / project.width, (r.height - 48) / project.height))); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  return (
    <section className="viewer">
      <div className="stage" ref={wrap} onPointerDown={(e) => { if (e.target === e.currentTarget) setState({ selectedCommentId: null }); }}>
        {scale > 0 && (
          <div className={'frame' + (commentMode ? ' commenting' : '')} style={{ width: project.width * scale, height: project.height * scale }}>
            <UpdateFlash />
            <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: project.width, height: project.height }}>
              <Player project={project} />
            </div>
            <CommentLayer project={project} active={commentMode} />
          </div>
        )}
        <LivePill />
        <ReviewBar />
      </div>
      <Transport project={project} />
    </section>
  );
}

/** "Agent is editing …" indicator over the stage while an agent works on something visible. */
function LivePill() {
  const tasks = useStore((s) => s.tasks);
  const clips = useStore((s) => s.clips);
  const music = useStore((s) => s.music);
  const running = tasks.filter((t) => t.status === 'running');
  const t = running.filter((x) => x.focus).sort((a, b) => b.focus!.at - a.focus!.at)[0] || running[0];
  if (!t) return <div className="live-pill" />;
  const f = t.focus;
  const what = !f ? 'думает' : f.kind === 'clip' ? `правит «${clips.find((c) => c.id === f.id)?.name || f.id}»` : f.kind === 'music' ? `пишет музыку «${music.find((m) => m.id === f.id)?.name || f.id}»` : f.kind === 'script' ? 'работает над сценарием' : 'монтирует таймлайн';
  return (
    <button className="live-pill show" onClick={() => setState({ sideTab: 'agent', selectedTaskId: t.id, selectedItemId: null })}>
      <span className="live-dot" />{t.agent === 'claude' ? 'Claude' : 'Codex'} {what}{running.length > 1 ? <span className="muted"> · ещё {running.length - 1}</span> : null}
    </button>
  );
}

/** Brief glow on the frame when a visible clip is updated from disk (agent edit). */
function UpdateFlash() {
  const fv = useStore((s) => s.fileVersion);
  const [n, setN] = useState(0);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setN((x) => x + 1); }, [fv]);
  return n ? <div key={n} className="update-flash" /> : null;
}

/** Floating pill: draft comments → send; resolved → review. */
function ReviewBar() {
  const comments = useStore((s) => s.comments);
  const commentMode = useStore((s) => s.commentMode);
  const drafts = comments.filter((c) => c.status === 'draft');
  const sent = comments.filter((c) => c.status === 'sent');
  const resolved = comments.filter((c) => c.status === 'resolved');
  const [busy, setBusy] = useState(false);
  const show = commentMode || drafts.length || sent.length || resolved.length;
  const nextResolved = () => { const c = resolved[0]; if (c) { seek(c.time); setState({ selectedCommentId: c.id }); } };
  return (
    <div className={'review-bar' + (show ? ' show' : '')}>
      {commentMode && !drafts.length && <span className="muted">Кликните по кадру или выделите область</span>}
      {drafts.length > 0 && (
        <>
          <span>{drafts.length} {plural(drafts.length, 'правка', 'правки', 'правок')}</span>
          <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); try { await actions.sendComments(); setState({ commentMode: false }); } finally { setBusy(false); } }}>
            {busy ? <span className="spinner sm" /> : null} Отправить агенту
          </button>
        </>
      )}
      {sent.length > 0 && <span className="muted"><span className="spinner sm" /> агент правит {sent.length}</span>}
      {resolved.length > 0 && <button className="btn sm" onClick={nextResolved}>Проверить исправленное · {resolved.length}</button>}
      {commentMode && <button className="icon-btn sm" title="Выйти из режима правок (Esc)" onClick={() => setState({ commentMode: false })}><Icon name="x" size={12} /></button>}
    </div>
  );
}
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

function CommentLayer({ project, active }: { project: Project; active: boolean }) {
  const comments = useStore((s) => s.comments);
  const selected = useStore((s) => s.selectedCommentId);
  const t = usePlayhead();
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const near = (c: Comment) => Math.abs(c.time - t) < 0.5 / project.fps + 1e-3 || (c.id === selected && Math.abs(c.time - t) < 0.6);
  const visible = comments.filter((c) => c.status !== 'done' && near(c));

  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const cancel = () => { setDraft(null); setText(''); };
  const submit = async () => {
    if (!draft || !text.trim()) { cancel(); return; }
    const s = getState();
    const tt = time.get();
    const at = (i: { start: number; duration: number }) => tt >= i.start && tt < i.start + i.duration;
    let target = s.project!.items.find((i) => i.id === s.selectedItemId && i.kind === 'clip' && at(i));
    if (!target) for (const tr of s.project!.tracks) { const it = s.project!.items.find((i) => i.track === tr.id && i.kind === 'clip' && at(i)); if (it) { target = it; break; } }
    await actions.addComment({ time: tt, ...draft, text: text.trim(), itemId: target?.id, clipId: target?.ref });
    cancel();
  };

  return (
    <div ref={box} className={'comment-layer' + (active ? ' active' : '')}
      onPointerDown={(e) => { if (!active || draft || e.target !== e.currentTarget) return; const p = pos(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (drag) { const p = pos(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
      onPointerUp={() => {
        if (!drag) return;
        const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
        setDraft(w > 0.02 && h > 0.02 ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w, h } : { x: drag.x0, y: drag.y0 });
        setDrag(null);
      }}>
      {visible.map((c, i) => <Pin key={c.id} c={c} n={i + 1} selected={c.id === selected} />)}
      {drag && <div className="c-rect drawing" style={rect(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0))} />}
      {draft && (
        <>
          {draft.w && <div className="c-rect" style={rect(draft.x, draft.y, draft.w, draft.h!)} />}
          <div className="c-pin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} />
          <div className="c-pop" style={popPos(draft.x, draft.y)} onPointerDown={(e) => e.stopPropagation()}>
            <textarea autoFocus value={text} placeholder="Что поправить?" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') cancel(); e.stopPropagation(); }} />
            <div className="row between">
              <span className="muted xsmall mono">{fmtTime(time.get(), project.fps)}</span>
              <div className="row gap6"><button className="btn xs ghost" onClick={cancel}>Отмена</button><button className="btn xs primary" disabled={!text.trim()} onClick={submit}>Добавить</button></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const rect = (x: number, y: number, w: number, h: number) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
const popPos = (x: number, y: number): React.CSSProperties => ({
  left: x > 0.6 ? undefined : `calc(${x * 100}% + 16px)`, right: x > 0.6 ? `calc(${(1 - x) * 100}% + 16px)` : undefined,
  top: y > 0.6 ? undefined : `calc(${y * 100}% - 8px)`, bottom: y > 0.6 ? `calc(${(1 - y) * 100}% - 8px)` : undefined,
});

function Pin({ c, n, selected }: { c: Comment; n: number; selected: boolean }) {
  const [text, setText] = useState(c.text);
  useEffect(() => setText(c.text), [c.text]);
  return (
    <>
      {c.w && c.h ? <div className={`c-rect st-${c.status}`} style={rect(c.x, c.y, c.w, c.h)} /> : null}
      <div className={`c-pin st-${c.status}${selected ? ' selected' : ''}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
        onPointerDown={(e) => { e.stopPropagation(); setState({ selectedCommentId: selected ? null : c.id }); }}>
        {c.status === 'resolved' ? <Icon name="check" size={11} /> : n}
      </div>
      {selected && (
        <div className="c-pop" style={popPos(c.x, c.y)} onPointerDown={(e) => e.stopPropagation()}>
          {c.status === 'draft'
            ? <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== c.text && actions.updateComment(c.id, { text })} />
            : <div className="c-text">{c.text}</div>}
          {c.resolution && <div className="c-res">{c.resolution}</div>}
          <div className="row between">
            <span className="muted xsmall">{({ draft: 'черновик', sent: 'у агента', resolved: 'исправлено', done: 'принято' } as const)[c.status]}</span>
            <div className="row gap6">
              {c.status === 'draft' && <button className="btn xs ghost" onClick={() => { actions.deleteComment(c.id); setState({ selectedCommentId: null }); }}>Удалить</button>}
              {c.status === 'resolved' && <>
                <button className="btn xs ghost" onClick={() => actions.updateComment(c.id, { status: 'draft', resolution: undefined })}>Вернуть</button>
                <button className="btn xs primary" onClick={() => { actions.updateComment(c.id, { status: 'done' }); setState({ selectedCommentId: null }); }}>Принять</button>
              </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Transport({ project }: { project: Project }) {
  const t = usePlayhead();
  const playing = useStore((s) => s.playing);
  const commentMode = useStore((s) => s.commentMode);
  const end = projectEnd(project);
  const step = (d: number) => seek(Math.min(end, Math.max(0, time.get() + d / project.fps)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable) return;
      const st = getState();
      if (st.libraryOpen || st.dialog || st.lightbox) return; // modals own the keyboard (Esc closes only them)
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(end);
      else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) setState((s) => ({ commentMode: !s.commentMode }));
      else if (e.key === 'Escape') setState((s) => (s.commentMode ? { commentMode: false } : s.selectedCommentId ? { selectedCommentId: null } : { selectedItemId: null }));
      else if ((e.key === 'Delete' || e.key === 'Backspace') && getState().selectedItemId) actions.removeItem(getState().selectedItemId!);
      else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey && getState().selectedItemId) actions.split(getState().selectedItemId!, time.get());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [end, project.fps]);
  return (
    <div className="transport">
      <div className="tc mono">{fmtTime(t, project.fps)}</div>
      <div className="row gap2 center">
        <button className="icon-btn" title="Кадр назад (←)" onClick={() => step(-1)}><Icon name="stepBack" size={14} /></button>
        <button className="play" title="Пробел" onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={15} /></button>
        <button className="icon-btn" title="Кадр вперёд (→)" onClick={() => step(1)}><Icon name="stepFwd" size={14} /></button>
      </div>
      <div className="row gap4 end">
        <span className="tc mono muted">{fmtTime(end, project.fps)}</span>
        <button className={'icon-btn' + (commentMode ? ' on' : '')} title="Правки на кадре (C)" onClick={() => setState({ commentMode: !commentMode })}><Icon name="comment" size={15} /></button>
      </div>
    </div>
  );
}
