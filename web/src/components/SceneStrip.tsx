import { useEffect, useRef } from 'react';
import type { Project } from '../../../shared/types';
import { useStore, actions, seek, time, togglePlay, projectEnd, fmtTime, setState } from '../store';
import { t } from '../i18n';
import { Icon } from './Icon';
import { statusTone, statusLabel } from '../sceneStatus';
import { useSceneAgents } from './Storyboard';

/**
 * The collapsed timeline: transport + one lane of scenes coloured by status. Click a scene to select it and jump
 * there (⇧/⌘ adds to the selection). ⇧T or the button expands the full multi-track timeline.
 */
export function SceneStrip({ project }: { project: Project }) {
  const scenes = useStore((s) => s.script.scenes);
  const sel = useStore((s) => s.sceneSelection);
  const playing = useStore((s) => s.playing);
  const agents = useSceneAgents();
  const end = Math.max(projectEnd(project), ...scenes.map((s) => s.start + s.duration), 1);
  const head = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const upd = (tt: number) => {
      if (head.current) head.current.style.left = `${(tt / end) * 100}%`;
      if (clock.current) clock.current.textContent = `${fmtTime(tt, project.fps)} / ${fmtTime(end, project.fps)}`;
    };
    upd(time.get());
    return time.sub(upd);
  }, [end, project.fps]);
  const scrub = (e: React.PointerEvent) => {
    const r = lane.current!.getBoundingClientRect();
    seek(Math.max(0, Math.min(end, ((e.clientX - r.left) / r.width) * end)));
  };
  return (
    <div className="strip">
      <button className="strip-play" onClick={togglePlay} aria-label={playing ? t('Pause') : t('Play')}><Icon name={playing ? 'pause' : 'play'} size={13} /></button>
      <span ref={clock} className="mono strip-clock" />
      <div className="strip-lane" ref={lane}>
        {scenes.length ? scenes.map((sc, i) => (
          <button key={sc.id} className={`strip-scene tone-${statusTone(sc)}${sel.includes(sc.id) ? ' sel' : ''}${agents[sc.id] ? ' live' : ''}`}
            style={{ left: `${(sc.start / end) * 100}%`, width: `${(sc.duration / end) * 100}%` }}
            title={`${i + 1} · ${sc.title} — ${statusLabel(sc)}`}
            onClick={(e) => { actions.selectScene(sc.id, e.shiftKey || e.metaKey || e.ctrlKey); seek(sc.start + 0.001); }}>
            <span className="ellipsis">{i + 1} · {sc.title}</span>
          </button>
        )) : <div className="strip-empty" onPointerDown={scrub}>{t('No scenes yet — the timeline shows the edit itself')}</div>}
        <div className="strip-head" ref={head} />
      </div>
      <button className="btn xs ghost" onClick={() => actions.setTimelineOpen(true)} title={t('Expand to the full timeline (⇧T)')}><Icon name="layers" size={12} /> {t('Timeline')}</button>
    </div>
  );
}

/** ⇧T toggles the full timeline */
export function useTimelineHotkey() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return;
      if (e.shiftKey && e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const open = !(document.body.dataset.tl === '1'); actions.setTimelineOpen(open); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const open = useStore((s) => s.timelineOpen);
  useEffect(() => { document.body.dataset.tl = open ? '1' : '0'; }, [open]);
  void setState;
}
