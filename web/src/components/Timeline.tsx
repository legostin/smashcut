import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Project, Track } from '../../../shared/types';
import { useStore, usePlayhead, setState, getState, actions, seek, time, projectEnd, api, fmtTime, notify } from '../store';
import { Icon } from './Icon';
import { applyTransition } from './FxLibrary';

const HEADER_W = 132;
const ROW_H: Record<string, number> = { graphics: 40, video: 48, audio: 40, music: 40 };
const COMPAT: Record<string, string[]> = { clip: ['graphics', 'video'], media: ['video', 'graphics', 'audio'], music: ['music', 'audio'], generated: ['video', 'graphics'] };

type DragState = { id: string; mode: 'move' | 'left' | 'right'; x0: number; orig: Item; track: string; start: number; duration: number; in: number } | null;

export function Timeline({ project }: { project: Project }) {
  const zoom = useStore((s) => s.zoom);
  const snap = useStore((s) => s.snap);
  const timing = useStore((s) => s.timing);
  const comments = useStore((s) => s.comments);
  const scenes = useStore((s) => s.script.scenes);
  const selectedItemId = useStore((s) => s.selectedItemId);
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const end = projectEnd(project);
  const total = Math.max(end + 10, project.duration + 5);
  const width = total * zoom;

  const snapPoints = useMemo(() => {
    const pts: number[] = [0];
    for (const i of project.items) { if (i.id === drag?.id) continue; pts.push(i.start, i.start + i.duration); }
    pts.push(...timing.bars, ...timing.markers.map((m) => m.time), ...timing.sections.map((s) => s.start));
    if (zoom > 40) pts.push(...timing.beats);
    return pts;
  }, [project.items, timing, zoom, drag?.id]);

  const snapT = (t: number, ignore = false) => {
    if (!snap || ignore) return t;
    const thr = 8 / zoom;
    let best = t, bd = thr;
    for (const p of [...snapPoints, time.get()]) { const d = Math.abs(p - t); if (d < bd) { bd = d; best = p; } }
    return best;
  };

  const xToT = (clientX: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - HEADER_W + scroller.current!.scrollLeft) / zoom);
  };

  // pointer handlers for item drag
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dt = (e.clientX - drag.x0) / zoom;
      const o = drag.orig;
      if (drag.mode === 'move') {
        let start = Math.max(0, o.start + dt);
        const s1 = snapT(start, e.altKey), s2 = snapT(start + o.duration, e.altKey) - o.duration;
        start = Math.abs(s1 - start) <= Math.abs(s2 - start) ? s1 : s2;
        // vertical: find track under pointer
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-track]') as HTMLElement | null;
        let track = drag.track;
        if (el) { const tr = project.tracks.find((t) => t.id === el.dataset.track); if (tr && COMPAT[o.kind]?.includes(tr.kind)) track = tr.id; }
        setDrag({ ...drag, start: Math.max(0, start), track });
      } else if (drag.mode === 'left') {
        let start = snapT(o.start + dt, e.altKey);
        const minStart = o.start - o.in; // can't extend before source start
        start = Math.min(o.start + o.duration - 0.1, Math.max(Math.max(0, minStart), start));
        setDrag({ ...drag, start, in: o.in + (start - o.start), duration: o.duration - (start - o.start) });
      } else {
        const endT = snapT(o.start + o.duration + dt, e.altKey);
        let dur = Math.max(0.1, endT - o.start);
        const maxDur = sourceLimit(o);
        if (maxDur) dur = Math.min(dur, maxDur - o.in);
        setDrag({ ...drag, duration: dur });
      }
    };
    const onUp = () => {
      const o = drag.orig;
      const patch: Partial<Item> = {};
      if (drag.start !== o.start) patch.start = +drag.start.toFixed(4);
      if (drag.duration !== o.duration) patch.duration = +drag.duration.toFixed(4);
      if (drag.in !== o.in) patch.in = +drag.in.toFixed(4);
      if (drag.track !== o.track) patch.track = drag.track;
      if (Object.keys(patch).length) actions.updateItem(o.id, patch);
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [drag, zoom, snapPoints]);

  const sourceLimit = (it: Item) => {
    const s = getState();
    if (it.kind === 'media') { const m = s.media.find((x) => x.file === it.ref); return m && m.type !== 'image' ? m.duration : 0; }
    if (it.kind === 'music') { const m = s.music.find((x) => x.id === it.ref); return m?.meta ? m.meta.duration + m.meta.tail : 0; }
    return 0;
  };

  // scrubbing on ruler
  const scrub = (e: React.PointerEvent) => {
    seek(xToT(e.clientX));
    const move = (ev: PointerEvent) => seek(xToT(ev.clientX));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const t = xToT(e.clientX);
      const nz = Math.min(400, Math.max(8, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      setState({ zoom: nz });
      requestAnimationFrame(() => { const r = scroller.current!.getBoundingClientRect(); scroller.current!.scrollLeft = t * nz - (e.clientX - r.left - HEADER_W); });
    }
  };

  const onDrop = async (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-studio');
    if (e.dataTransfer.files.length && !raw) {
      const infos = await actions.upload(e.dataTransfer.files);
      let t = snapT(xToT(e.clientX));
      for (const m of infos) { await actions.addItem({ kind: 'media', ref: m.file, start: t, track: COMPAT.media.includes(track.kind) && (m.type === 'audio') === (track.kind === 'audio') ? track.id : undefined }); t += m.duration || 5; }
      return;
    }
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.type === 'transition') {
      // dropped on a lane: apply to the item under the cursor, edge decides in/out
      const t = xToT(e.clientX);
      const it = project.items.find((i) => i.track === track.id && t >= i.start && t <= i.start + i.duration);
      if (!it) { notify('error', 'Бросьте переход на клип'); return; }
      applyTransition(d.transition, t - it.start < it.duration / 2 ? 'in' : 'out', it);
      setState({ selectedItemId: it.id });
      return;
    }
    const start = +snapT(xToT(e.clientX)).toFixed(3);
    const kind = d.type === 'gallery' ? d.item.kind : d.type;
    const okTrack = COMPAT[kind === 'clip' ? 'clip' : kind === 'music' ? 'music' : 'media']?.includes(track.kind) ? track.id : undefined;
    if (d.type === 'gallery') await actions.useTemplate(d.item, start, okTrack);
    else if (d.type === 'clip') await actions.addItem({ kind: 'clip', ref: d.id, start, track: okTrack });
    else if (d.type === 'music') await actions.addItem({ kind: 'music', ref: d.id, start, track: okTrack });
    else if (d.type === 'media') await actions.addItem({ kind: 'media', ref: d.file, start, track: okTrack });
  };

  const toggleTrack = (id: string, key: 'muted' | 'hidden') => actions.patchProject({ tracks: project.tracks.map((t) => (t.id === id ? { ...t, [key]: !t[key] } : t)) });
  const addTrack = (kind: Track['kind']) => {
    const n = project.tracks.filter((t) => t.kind === kind).length + 1;
    const id = kind[0] + Math.random().toString(36).slice(2, 6);
    const names: Record<string, string> = { graphics: 'Graphics', video: 'Video', audio: 'Audio', music: 'Music' };
    const tr: Track = { id, kind, name: `${names[kind]} ${n}` };
    const idx = project.tracks.findIndex((t) => t.kind === kind);
    const tracks = [...project.tracks];
    tracks.splice(idx >= 0 ? idx : 0, 0, tr);
    actions.patchProject({ tracks });
  };

  const tickStep = zoom > 120 ? 0.5 : zoom > 50 ? 1 : zoom > 20 ? 5 : 10;
  const ticks = [];
  for (let t = 0; t <= total; t += tickStep) ticks.push(t);

  return (
    <div className="timeline">
      <div className="tl-scroll" ref={scroller} onWheel={onWheel}>
        <div className="tl-inner" style={{ width: width + HEADER_W }}>
          <div className="tl-ruler-row">
            <div className="tl-corner" style={{ width: HEADER_W }}>
              <AddTrack onAdd={addTrack} />
              <input className="tl-zoom" type="range" min={8} max={400} value={zoom} onChange={(e) => setState({ zoom: Number(e.target.value) })} title="Масштаб (⌘ + колесо)" />
            </div>
            <div className="tl-ruler" style={{ width }} onPointerDown={scrub}>
              {scenes.map((sc, i) => (
                <div key={sc.id} className={`tl-scene st-${sc.status}`} style={{ left: sc.start * zoom + 1, width: Math.max(2, sc.duration * zoom - 2) }} title={`${i + 1}. ${sc.title}`}
                  onPointerDown={(e) => { e.stopPropagation(); seek(sc.start + 0.001); }}>
                  <span>{i + 1}. {sc.title}</span>
                </div>
              ))}
              {timing.sections.map((s, i) => <div key={i} className="tl-section" style={{ left: s.start * zoom, width: (s.end - s.start) * zoom }}>{s.name}</div>)}
              {zoom > 25 && timing.beats.map((b, i) => <div key={i} className={'tl-beat' + (timing.bars.includes(b) ? ' bar' : '')} style={{ left: b * zoom }} />)}
              {ticks.map((t) => <div key={t} className="tl-tick" style={{ left: t * zoom }}><span>{t % 1 === 0 ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : ''}</span></div>)}
              {timing.markers.map((m, i) => <div key={i} className="tl-marker" style={{ left: m.time * zoom }} title={m.name}>◆</div>)}
              {comments.map((c) => <div key={c.id} className={`tl-comment status-${c.status}`} style={{ left: c.time * zoom }} title={c.text} onPointerDown={(e) => { e.stopPropagation(); seek(c.time); setState({ selectedCommentId: c.id }); }} />)}
            </div>
          </div>
          {project.tracks.map((tr) => (
            <div key={tr.id} className={`tl-row kind-${tr.kind}`} style={{ height: ROW_H[tr.kind] }}>
              <div className="tl-head" style={{ width: HEADER_W }}>
                <input className="tl-name" value={tr.name} onChange={(e) => actions.patchProject({ tracks: project.tracks.map((t) => (t.id === tr.id ? { ...t, name: e.target.value } : t)) })} />
                {tr.kind === 'graphics' || tr.kind === 'video'
                  ? <button className="icon-btn xs" title="Скрыть" onClick={() => toggleTrack(tr.id, 'hidden')}><Icon name={tr.hidden ? 'eyeOff' : 'eye'} size={14} /></button>
                  : <button className="icon-btn xs" title="Mute" onClick={() => toggleTrack(tr.id, 'muted')}><Icon name={tr.muted ? 'mute' : 'volume'} size={14} /></button>}
                {!project.items.some((i) => i.track === tr.id) && project.tracks.filter((t) => t.kind === tr.kind).length > 1 && (
                  <button className="icon-btn xs" title="Удалить дорожку" onClick={() => actions.patchProject({ tracks: project.tracks.filter((t) => t.id !== tr.id) })}><Icon name="x" size={12} /></button>
                )}
              </div>
              <div className="tl-lane" data-track={tr.id} style={{ width }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, tr)}
                onPointerDown={(e) => { if (e.target === e.currentTarget) { setState({ selectedItemId: null }); scrub(e); } }}>
                {project.items.filter((i) => (drag?.id === i.id ? drag.track : i.track) === tr.id).map((it) => {
                  const d = drag?.id === it.id ? drag : null;
                  const view = d ? { ...it, start: d.start, duration: d.duration, in: d.in } : it;
                  return <TlItem key={it.id} item={view} zoom={zoom} selected={it.id === selectedItemId} dragging={!!d}
                    onDown={(e, mode) => { e.stopPropagation(); setState({ selectedItemId: it.id }); setDrag({ id: it.id, mode, x0: e.clientX, orig: it, track: it.track, start: it.start, duration: it.duration, in: it.in }); }} />;
                })}
              </div>
            </div>
          ))}
          <Playhead zoom={zoom} />
        </div>
      </div>
    </div>
  );
}

function Playhead({ zoom }: { zoom: number }) {
  const t = usePlayhead();
  return <div className="tl-playhead" style={{ left: HEADER_W + t * zoom }} />;
}

function TlItem({ item, zoom, selected, dragging, onDown }: { item: Item; zoom: number; selected: boolean; dragging: boolean; onDown: (e: React.PointerEvent, mode: 'move' | 'left' | 'right') => void }) {
  const clips = useStore((s) => s.clips);
  const media = useStore((s) => s.media);
  const music = useStore((s) => s.music);
  const errors = useStore((s) => s.clipErrors[item.id]);
  const openComments = useStore((s) => s.comments.filter((c) => c.itemId === item.id && (c.status === 'draft' || c.status === 'sent')).length);
  const running = useStore((s) => s.tasks.some((t) => t.status === 'running' && ((t.focus && t.focus.id === item.ref && (t.focus.kind === item.kind)) || (t.clipId && item.kind === 'clip' && t.clipId === item.ref))));
  let label = item.label || item.ref;
  let thumb: string | undefined;
  let peaksUrl: string | undefined;
  let peaksKey = '';
  if (item.kind === 'clip') label = item.label || clips.find((c) => c.id === item.ref)?.name || item.ref;
  if (item.kind === 'media') {
    const m = media.find((x) => x.file === item.ref);
    if (m?.thumb) thumb = `/p/${m.thumb}`;
    if (m?.peaks && m.type === 'audio') { peaksUrl = `/p/${m.peaks}`; peaksKey = m.peaks; }
  }
  if (item.kind === 'music') {
    const m = music.find((x) => x.id === item.ref);
    label = item.label || m?.name || item.ref;
    if (m?.rendered) { peaksUrl = `/api/music/${item.ref}/peaks`; peaksKey = m.rendered; }
  }
  const w = Math.max(4, item.duration * zoom);
  return (
    <div className={`tl-item kind-${item.kind}${running ? ' live' : ''}${thumb ? ' has-thumb' : ''}${selected ? ' selected' : ''}${dragging ? ' dragging' : ''}${errors?.length ? ' has-error' : ''}`}
      style={{ left: item.start * zoom, width: w, backgroundImage: thumb ? `url(${thumb})` : undefined }}
      onPointerDown={(e) => onDown(e, 'move')}
      title={`${label}\n${item.start.toFixed(2)}s → ${(item.start + item.duration).toFixed(2)}s${errors?.length ? '\n⚠ ' + errors.join('\n') : ''}`}>
      {peaksUrl && <Wave url={peaksUrl} k={peaksKey} item={item} zoom={zoom} />}
      {item.fx?.in && <div className="tl-tr in" style={{ width: Math.min(w, item.fx.in.duration * zoom) }} title={`Вход: ${item.fx.in.type} · ${item.fx.in.duration}s`} />}
      {item.fx?.out && <div className="tl-tr out" style={{ width: Math.min(w, item.fx.out.duration * zoom) }} title={`Выход: ${item.fx.out.type} · ${item.fx.out.duration}s`} />}
      <div className="tl-item-label">
        {running && <span className="tl-dot live" title="Агент работает" />}
        {errors?.length ? <span className="tl-dot err" title="Ошибка в клипе" /> : null}
        <span className="ellipsis">{label}</span>
        {(item.fx?.effects?.length || item.fx?.mask) ? <span className="tl-fx" title="Эффекты / маска">fx</span> : null}
        {openComments > 0 && <span className="tl-count">{openComments}</span>}
      </div>
      <div className="tl-handle left" onPointerDown={(e) => onDown(e, 'left')} />
      <div className="tl-handle right" onPointerDown={(e) => onDown(e, 'right')} />
    </div>
  );
}

const peaksCache = new Map<string, Promise<number[]>>();
function Wave({ url, k, item, zoom }: { url: string; k: string; item: Item; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    if (!peaksCache.has(k)) peaksCache.set(k, api<number[]>('GET', url).catch(() => []));
    peaksCache.get(k)!.then(setPeaks);
  }, [k, url]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length) return;
    const w = Math.min(8000, Math.max(4, Math.round(item.duration * zoom)));
    const h = 30;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    const perSec = 50;
    for (let x = 0; x < w; x++) {
      const t = item.in + (x / w) * item.duration;
      const i = Math.floor(t * perSec);
      const v = peaks[i] || 0;
      const bh = Math.max(1, v * h);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [peaks, item.in, item.duration, zoom]);
  return <canvas ref={ref} className="tl-wave" />;
}

function AddTrack({ onAdd }: { onAdd: (k: Track['kind']) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = () => setOpen(false);
    window.addEventListener('pointerdown', c);
    return () => window.removeEventListener('pointerdown', c);
  }, [open]);
  return (
    <div className="rel" onPointerDown={(e) => e.stopPropagation()}>
      <button className="icon-btn sm" title="Добавить дорожку" onClick={() => setOpen(!open)}><Icon name="plus" size={12} /></button>
      {open && (
        <div className="menu">
          {([['graphics', 'Графика'], ['video', 'Видео'], ['audio', 'Аудио'], ['music', 'Музыка']] as const).map(([k, l]) => (
            <button key={k} className="menu-item" onClick={() => { onAdd(k); setOpen(false); }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}
