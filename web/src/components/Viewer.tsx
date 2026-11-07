import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Comment, Project } from '../../../shared/types';
import { Player } from './Player';
import { useStore, usePlayhead, setState, getState, actions, togglePlay, seek, fmtTime, projectEnd, time } from '../store';
import { Icon } from './Icon';

export function Viewer({ project }: { project: Project }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const commentMode = useStore((s) => s.commentMode);
  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setScale(Math.min((r.width - 24) / project.width, (r.height - 24) / project.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  return (
    <div className="viewer">
      <div className="viewer-stage" ref={wrap}>
        <div className="viewer-box" style={{ width: project.width * scale, height: project.height * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: project.width, height: project.height }}>
            <Player project={project} />
          </div>
          <CommentLayer project={project} active={commentMode} />
        </div>
      </div>
      <Transport project={project} />
    </div>
  );
}

function CommentLayer({ project, active }: { project: Project; active: boolean }) {
  const comments = useStore((s) => s.comments);
  const selected = useStore((s) => s.selectedCommentId);
  const t = usePlayhead();
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const fps = project.fps;
  const visible = comments.filter((c) => Math.abs(c.time - t) < 1.5 / fps + 0.001 || c.id === selected && Math.abs(c.time - t) < 0.5);

  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const submit = async () => {
    if (!draft || !text.trim()) { setDraft(null); return; }
    const s = getState();
    const tt = time.get();
    // target: selected clip item if active, else topmost active graphics clip
    const activeAt = (i: { start: number; duration: number }) => tt >= i.start && tt < i.start + i.duration;
    const sel = s.project!.items.find((i) => i.id === s.selectedItemId && i.kind === 'clip' && activeAt(i));
    let target = sel;
    if (!target) for (const tr of s.project!.tracks) { const it = s.project!.items.find((i) => i.track === tr.id && i.kind === 'clip' && activeAt(i)); if (it) { target = it; break; } }
    await actions.addComment({ time: tt, ...draft, text: text.trim(), itemId: target?.id, clipId: target?.ref });
    setDraft(null); setText('');
    setState({ rightTab: 'comments' });
  };

  return (
    <div ref={box} className={'comment-layer' + (active ? ' active' : '')}
      onPointerDown={(e) => { if (!active || draft) return; const p = pos(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (drag) { const p = pos(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
      onPointerUp={() => {
        if (!drag) return;
        const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
        if (w > 0.02 && h > 0.02) setDraft({ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w, h });
        else setDraft({ x: drag.x0, y: drag.y0 });
        setDrag(null);
      }}>
      {visible.map((c, i) => <Pin key={c.id} c={c} n={i + 1} selected={c.id === selected} />)}
      {drag && <div className="c-rect drawing" style={rectStyle(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1), Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0))} />}
      {draft && (
        <>
          {draft.w && <div className="c-rect" style={rectStyle(draft.x, draft.y, draft.w, draft.h!)} />}
          <div className="c-pin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>+</div>
          <div className="c-editor" style={{ left: `min(${draft.x * 100}%, calc(100% - 320px))`, top: `min(calc(${draft.y * 100}% + 18px), calc(100% - 130px))` }} onPointerDown={(e) => e.stopPropagation()}>
            <textarea autoFocus value={text} placeholder="Что поправить в этом кадре? (Enter — сохранить)" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') { setDraft(null); setText(''); } e.stopPropagation(); }} />
            <div className="row gap8 end">
              <span className="muted small">{fmtTime(time.get(), fps)}</span>
              <button className="btn ghost sm" onClick={() => { setDraft(null); setText(''); }}>Отмена</button>
              <button className="btn primary sm" onClick={submit}>Комментарий</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const rectStyle = (x: number, y: number, w: number, h: number) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });

function Pin({ c, n, selected }: { c: Comment; n: number; selected: boolean }) {
  return (
    <>
      {c.w && c.h ? <div className={`c-rect status-${c.status}`} style={rectStyle(c.x, c.y, c.w, c.h)} /> : null}
      <div className={`c-pin status-${c.status}${selected ? ' selected' : ''}`} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} title={c.text}
        onPointerDown={(e) => { e.stopPropagation(); setState({ selectedCommentId: c.id, rightTab: 'comments' }); }}>
        {c.status === 'resolved' || c.status === 'done' ? '✓' : n}
        {selected && <div className="c-bubble">{c.text}{c.resolution && <div className="c-res">↳ {c.resolution}</div>}</div>}
      </div>
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
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(end);
      else if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey) setState((s) => ({ commentMode: !s.commentMode }));
      else if (e.key === 'Escape') setState({ commentMode: false });
      else if ((e.key === 'Delete' || e.key === 'Backspace') && getState().selectedItemId) { actions.removeItem(getState().selectedItemId!); }
      else if (e.key.toLowerCase() === 's' && !e.metaKey && !e.ctrlKey && getState().selectedItemId) actions.split(getState().selectedItemId!, time.get());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [end, project.fps]);
  return (
    <div className="transport">
      <div className="row gap4">
        <button className="icon-btn" title="В начало (Home)" onClick={() => seek(0)}><Icon name="skipBack" /></button>
        <button className="icon-btn" title="Кадр назад (←)" onClick={() => step(-1)}><Icon name="stepBack" /></button>
        <button className="icon-btn play" title="Play / Pause (Space)" onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} /></button>
        <button className="icon-btn" title="Кадр вперёд (→)" onClick={() => step(1)}><Icon name="stepFwd" /></button>
      </div>
      <div className="timecode"><span>{fmtTime(t, project.fps)}</span><span className="muted"> / {fmtTime(end, project.fps)}</span></div>
      <div className="row gap8">
        <span className="muted small">{project.width}×{project.height} · {project.fps} fps</span>
        <button className={'btn sm ' + (commentMode ? 'accent' : 'ghost')} title="Режим комментариев (C): клик — пин, протяжка — область" onClick={() => setState({ commentMode: !commentMode })}>
          <Icon name="comment" /> {commentMode ? 'Кликните по кадру' : 'Комментировать'}
        </button>
      </div>
    </div>
  );
}
