import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Comment, Project } from '../../../shared/types';
import { Player } from './Player';
import { useStore, usePlayhead, setState, getState, actions, togglePlay, seek, fmtTime, projectEnd, time } from '../store';
import { Icon } from './Icon';
import { t, tn } from '../i18n';
import { measureItem, type Box } from './LayoutPanel';
import { layerTransform } from './Player';
import type { Item } from '../../../shared/types';

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
            {!commentMode && <TransformGizmo project={project} scale={scale} />}
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
  const tk = running.filter((x) => x.focus).sort((a, b) => b.focus!.at - a.focus!.at)[0] || running[0];
  if (!tk) return <div className="live-pill" />;
  const f = tk.focus;
  const what = !f ? t('is thinking') : f.kind === 'clip' ? t('is editing “{name}”', { name: clips.find((c) => c.id === f.id)?.name || f.id }) : f.kind === 'music' ? t('is writing music “{name}”', { name: music.find((m) => m.id === f.id)?.name || f.id }) : f.kind === 'script' ? t('is working on the script') : t('is editing the timeline');
  return (
    <button className="live-pill show" onClick={() => setState({ sideTab: 'agent', selectedTaskId: tk.id, selectedItemId: null })}>
      <span className="live-dot" />{tk.agent === 'claude' ? 'Claude' : 'Codex'} {what}{running.length > 1 ? <span className="muted"> · {t('{n} more', { n: running.length - 1 })}</span> : null}
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
      {commentMode && !drafts.length && <span className="muted">{t('Click the frame or select an area')}</span>}
      {drafts.length > 0 && (
        <>
          <span>{tn(drafts.length, '{n} note', '{n} notes')}</span>
          <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); try { await actions.sendComments(); setState({ commentMode: false }); } finally { setBusy(false); } }}>
            {busy ? <span className="spinner sm" /> : null} {t('Send to agent')}
          </button>
        </>
      )}
      {sent.length > 0 && <span className="muted"><span className="spinner sm" /> {t('agent is fixing {n}', { n: sent.length })}</span>}
      {resolved.length > 0 && <button className="btn sm" onClick={nextResolved}>{t('Review fixes')} · {resolved.length}</button>}
      {commentMode && <button className="icon-btn sm" title={t('Exit review mode (Esc)')} onClick={() => setState({ commentMode: false })}><Icon name="x" size={12} /></button>}
    </div>
  );
}

function CommentLayer({ project, active }: { project: Project; active: boolean }) {
  const comments = useStore((s) => s.comments);
  const selected = useStore((s) => s.selectedCommentId);
  const ph = usePlayhead();
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const near = (c: Comment) => Math.abs(c.time - ph) < 0.5 / project.fps + 1e-3 || (c.id === selected && Math.abs(c.time - ph) < 0.6);
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
            <textarea autoFocus value={text} placeholder={t('What to fix?')} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') cancel(); e.stopPropagation(); }} />
            <div className="row between">
              <span className="muted xsmall mono">{fmtTime(time.get(), project.fps)}</span>
              <div className="row gap6"><button className="btn xs ghost" onClick={cancel}>{t('Cancel')}</button><button className="btn xs primary" disabled={!text.trim()} onClick={submit}>{t('Add')}</button></div>
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
            <span className="muted xsmall">{t(({ draft: 'draft', sent: 'with the agent', resolved: 'fixed', done: 'accepted' } as const)[c.status])}</span>
            <div className="row gap6">
              {c.status === 'draft' && <button className="btn xs ghost" onClick={() => { actions.deleteComment(c.id); setState({ selectedCommentId: null }); }}>{t('Delete')}</button>}
              {c.status === 'resolved' && <>
                <button className="btn xs ghost" onClick={() => actions.updateComment(c.id, { status: 'draft', resolution: undefined })}>{t('Reopen')}</button>
                <button className="btn xs primary" onClick={() => { actions.updateComment(c.id, { status: 'done' }); setState({ selectedCommentId: null }); }}>{t('Accept')}</button>
              </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Transport({ project }: { project: Project }) {
  const ph = usePlayhead();
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
      <div className="tc mono">{fmtTime(ph, project.fps)}</div>
      <div className="row gap2 center">
        <button className="icon-btn" title={t('Previous frame (←)')} onClick={() => step(-1)}><Icon name="stepBack" size={14} /></button>
        <button className="play" title={t('Space')} onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={15} /></button>
        <button className="icon-btn" title={t('Next frame (→)')} onClick={() => step(1)}><Icon name="stepFwd" size={14} /></button>
      </div>
      <div className="row gap4 end">
        <span className="tc mono muted">{fmtTime(end, project.fps)}</span>
        <button className={'icon-btn' + (commentMode ? ' on' : '')} title={t('Notes on the frame (C)')} onClick={() => setState({ commentMode: !commentMode })}><Icon name="comment" size={15} /></button>
      </div>
    </div>
  );
}

/** On-frame transform: drag to move, corners to scale, top handle to rotate (any visual item). */
function TransformGizmo({ project, scale: k }: { project: Project; scale: number }) {
  const item = useStore((s) => s.project?.items.find((i) => i.id === s.selectedItemId) || null);
  const fv = useStore((s) => s.fileVersion);
  const playing = useStore((s) => s.playing);
  const ph = usePlayhead();
  const [box, setBox] = useState<Box | null>(null);
  const visual = item && (item.kind === 'clip' || (item.kind === 'media' && !/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(item.ref)));
  const active = !!item && visual && ph >= item.start && ph < item.start + item.duration;
  useEffect(() => {
    if (!active || playing || !item) { setBox(null); return; }
    let tries = 0;
    const measure = () => { const b = measureItem(item, project); if (b) setBox(b); else if (tries++ < 8) setTimeout(measure, 120); else setBox(null); };
    const id = setTimeout(measure, 60);
    return () => clearTimeout(id);
  }, [active, playing, item?.id, item?.ref, JSON.stringify(item?.params), fv, Math.round(ph * 10)]);
  if (!item || !box || !active || playing) return null;
  const tr = item.transform || {};
  const s = tr.scale ?? 1, r = tr.rotate ?? 0;
  const O = { x: ((tr.ox ?? 50) / 100) * project.width, y: ((tr.oy ?? 50) / 100) * project.height };

  const live = (patch: Partial<NonNullable<Item['transform']>>) => {
    setState((st) => st.project ? ({ project: { ...st.project, items: st.project.items.map((i) => (i.id === item.id ? { ...i, transform: { ...(i.transform || {}), ...patch } } : i)) } }) : {});
  };
  const commit = () => {
    const it = getState().project?.items.find((i) => i.id === item.id);
    if (it) actions.updateItem(item.id, { transform: it.transform });
  };
  /** first interaction: pivot at the content centre (no visual change while unscaled/unrotated) */
  const ensureOrigin = () => {
    if (tr.ox != null || s !== 1 || r !== 0) return { ...tr };
    const o = { ox: +(((box.x + box.w / 2) / project.width) * 100).toFixed(3), oy: +(((box.y + box.h / 2) / project.height) * 100).toFixed(3) };
    live(o);
    return { ...tr, ...o };
  };
  const startMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    const base = ensureOrigin();
    const sx = e.clientX, sy = e.clientY;
    const mv = (ev: PointerEvent) => {
      let x = (base.x || 0) + (ev.clientX - sx) / k, y = (base.y || 0) + (ev.clientY - sy) / k;
      // snap the content centre to the frame centre lines
      const cx = box.x + box.w / 2 + x, cy = box.y + box.h / 2 + y;
      if (Math.abs(cx - project.width / 2) < 8 / k) x += project.width / 2 - cx;
      if (Math.abs(cy - project.height / 2) < 8 / k) y += project.height / 2 - cy;
      live({ x: Math.round(x), y: Math.round(y) });
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const pivotScreen = (base: NonNullable<Item['transform']>, el: HTMLElement) => {
    const fr = el.closest('.frame')!.getBoundingClientRect();
    return { x: fr.left + (((base.ox ?? 50) / 100) * project.width + (base.x || 0)) * k, y: fr.top + (((base.oy ?? 50) / 100) * project.height + (base.y || 0)) * k };
  };
  const startScale = (e: React.PointerEvent) => {
    e.stopPropagation();
    const base = ensureOrigin();
    const P = pivotScreen(base, e.currentTarget as HTMLElement);
    const d0 = Math.hypot(e.clientX - P.x, e.clientY - P.y) || 1;
    const s0 = base.scale ?? 1;
    const mv = (ev: PointerEvent) => { const d = Math.hypot(ev.clientX - P.x, ev.clientY - P.y); live({ scale: +Math.max(0.05, Math.min(8, (s0 * d) / d0)).toFixed(3) }); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const startRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    const base = ensureOrigin();
    const P = pivotScreen(base, e.currentTarget as HTMLElement);
    const a0 = Math.atan2(e.clientY - P.y, e.clientX - P.x);
    const r0 = base.rotate ?? 0;
    const mv = (ev: PointerEvent) => {
      let r1 = r0 + ((Math.atan2(ev.clientY - P.y, ev.clientX - P.x) - a0) * 180) / Math.PI;
      if (ev.shiftKey) r1 = Math.round(r1 / 15) * 15; else if (Math.abs(r1 % 90) < 3) r1 = Math.round(r1 / 90) * 90;
      live({ rotate: +r1.toFixed(1) });
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const style: React.CSSProperties = {
    left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k,
    transformOrigin: `${(O.x - box.x) * k}px ${(O.y - box.y) * k}px`,
    transform: layerTransform({ ...tr, x: (tr.x || 0) * k, y: (tr.y || 0) * k }),
  };
  const inv = 1 / Math.max(0.05, s);
  return (
    <div className="gizmo" style={style} onPointerDown={startMove} title={t('Drag to move')}>
      {(['nw', 'ne', 'sw', 'se'] as const).map((h) => <span key={h} className={`gz-h ${h}`} style={{ transform: `scale(${inv})` }} onPointerDown={startScale} />)}
      <span className="gz-stem" style={{ transform: `scaleX(${inv})` }} />
      <span className="gz-rot" style={{ transform: `scale(${inv})` }} onPointerDown={startRotate} title={t('Rotate (Shift — 15° steps)')} />
    </div>
  );
}
