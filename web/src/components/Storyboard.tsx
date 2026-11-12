import { useEffect, useMemo, useState } from 'react';
import type { Project, Scene, Task, Reference } from '../../../shared/types';
import { useStore, setState, getState, actions, seek, fmtTime, pfile } from '../store';
import { t, tn } from '../i18n';
import { Icon } from './Icon';
import { HeroComposer } from './HeroComposer';
import { statusLabel, statusTone, SCENE_STATUS } from '../sceneStatus';

/** cheap stable hash for cache-busting frame thumbnails */
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** which running task is working on a scene right now (by focus on the scene or one of its clips) */
export function useSceneAgents(): Record<string, Task> {
  const tasks = useStore((s) => s.tasks);
  const project = useStore((s) => s.project);
  const scenes = useStore((s) => s.script.scenes);
  return useMemo(() => {
    const out: Record<string, Task> = {};
    for (const tk of tasks) {
      if (tk.status !== 'running' || !tk.focus) continue;
      const f = tk.focus;
      for (const sc of scenes) {
        if (f.kind === 'script' && f.id === sc.id) out[sc.id] = tk;
        else if ((f.kind === 'clip' || f.kind === 'music') && project?.items.some((i) => i.ref === f.id && (sc.itemIds?.includes(i.id) || (i.start < sc.start + sc.duration && i.start + i.duration > sc.start)))) out[sc.id] = out[sc.id] || tk;
      }
    }
    return out;
  }, [tasks, project, scenes]);
}

/** a scene as agent context (chip + text) */
export function sceneChip(sc: Scene, n: number) {
  return {
    key: 'scene:' + sc.id,
    label: t('Scene {n}', { n }),
    text: `scene ${n} “${sc.title}” (id ${sc.id}, ${sc.start.toFixed(2)}–${(sc.start + sc.duration).toFixed(2)} s, status ${sc.status}${sc.locked ? ', locked' : ''})`,
  };
}

/** Storyboard: the whole video as scene cards with live statuses. Select scenes → act on them. */
export function Storyboard({ project }: { project: Project }) {
  const scenes = useStore((s) => s.script.scenes);
  const sel = useStore((s) => s.sceneSelection);
  const agents = useSceneAgents();
  const total = scenes.reduce((a, s) => Math.max(a, s.start + s.duration), 0);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of scenes) c[statusTone(s)] = (c[statusTone(s)] || 0) + 1;
    return c;
  }, [scenes]);
  // Esc clears the selection; ⌘A selects every scene
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'Escape') setState({ sceneSelection: [] });
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); setState({ sceneSelection: getState().script.scenes.map((s) => s.id) }); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  if (!scenes.length) return <StoryEmpty hasItems={project.items.length > 0} />;
  const selectTone = (tone: string) => setState({ sceneSelection: scenes.filter((s) => statusTone(s) === tone).map((s) => s.id) });
  return (
    <div className="story" onPointerDown={(e) => { if (e.target === e.currentTarget) setState({ sceneSelection: [] }); }}>
      <div className="story-head">
        <h1>{t('Storyboard')}</h1>
        <span className="chip">{tn(scenes.length, '{n} scene', '{n} scenes')} · {Math.floor(total / 60)}:{String(Math.round(total % 60)).padStart(2, '0')}</span>
        {(['done', 'work', 'review', 'approved', 'idle'] as const).map((tone) => counts[tone] ? (
          <button key={tone} className={'chip tone-' + tone} onClick={() => selectTone(tone)} title={t('Select these scenes')}>
            <span className="dot" />{counts[tone]} {t(Object.values(SCENE_STATUS).find((x) => x.tone === tone)!.label).toLowerCase()}
          </button>
        ) : null)}
        <div className="grow" />
        <span className="muted xsmall">{t('Click to select · ⇧/⌘ to add · double-click to open')}</span>
      </div>
      <ReferencesStrip />
      <div className="story-grid" style={{ ['--ar' as any]: `${project.width} / ${project.height}` }}>
        {scenes.map((sc, i) => <SceneCard key={sc.id} sc={sc} n={i + 1} project={project} selected={sel.includes(sc.id)} agent={agents[sc.id]} />)}
        <button className="scene-add" onClick={() => actions.startTask('Add one more scene to the script that continues the story, then make it.')}>
          <Icon name="plus" size={18} /><span>{t('Scene')}</span>
        </button>
      </div>
    </div>
  );
}

function SceneCard({ sc, n, project, selected, agent }: { sc: Scene; n: number; project: Project; selected: boolean; agent?: Task }) {
  const fileVersion = useStore((s) => s.fileVersion);
  const designAt = useStore((s) => s.design.updatedAt);
  const inScene = project.items.filter((i) => i.start < sc.start + sc.duration && i.start + i.duration > sc.start);
  const at = +(sc.start + Math.min(sc.duration * 0.55, Math.max(0.1, sc.duration - 0.1))).toFixed(2);
  const v = useMemo(() => hash(JSON.stringify([inScene.map((i) => [i.id, i.start, i.duration, i.in, i.params, i.track, fileVersion[i.ref]]), project.tracks.map((x) => x.hidden), designAt, project.width, project.height])), [inScene, fileVersion, designAt, project.tracks, project.width, project.height]);
  const src = inScene.length ? `/api/board/frame?t=${at}&w=480&v=${v}` : null;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!src) { setShown(null); return; }
    const img = new Image();
    img.onload = () => setShown(src);
    img.src = src;
  }, [src]);
  const refCount = useStore((s) => s.references.filter((r) => r.sceneIds?.includes(sc.id)).length);
  const tone = statusTone(sc);
  const note = sc.status === 'review' && sc.notes ? sc.notes : sc.voiceover || sc.visual || '';
  return (
    <div role="button" tabIndex={0} aria-pressed={selected} className={`scene-card tone-${tone}${selected ? ' sel' : ''}${agent ? ' live' : ''}`}
      onClick={(e) => actions.selectScene(sc.id, e.shiftKey || e.metaKey || e.ctrlKey)}
      onDoubleClick={() => { seek(sc.start + 0.001); actions.setView('edit'); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actions.selectScene(sc.id, e.shiftKey); } }}>
      <div className="scene-thumb">
        {shown ? <img src={shown} alt="" /> : <div className="scene-thumb-empty">{inScene.length ? <span className="spinner sm" /> : t('Not made yet')}</div>}
        <span className="scene-n mono">{String(n).padStart(2, '0')}</span>
        {agent && <span className="scene-agent"><span className="pulse" />{agent.agent === 'codex' ? 'Codex' : 'Claude'}</span>}
        {sc.locked && <span className="scene-lock" title={t('Locked — agents won’t change it')}><Icon name="lock" size={12} /></span>}
        {refCount > 0 && <span className="scene-refs" title={t('References for this scene')}><Icon name="star" size={11} />{refCount}</span>}
      </div>
      <div className="scene-meta">
        <span className="scene-title ellipsis" title={sc.title}>{sc.title}</span>
        <span className="mono muted xsmall">{sc.duration.toFixed(1)}s</span>
      </div>
      <div className="scene-foot">
        <span className={'chip tone-' + tone}><span className="dot" />{statusLabel(sc)}</span>
        {note && <span className="scene-note ellipsis">{note}</span>}
      </div>
    </div>
  );
}

/** the project's references: techniques, images, links. Click one to (un)bind it to the selected scenes. */
function ReferencesStrip() {
  const refs = useStore((s) => s.references);
  const sel = useStore((s) => s.sceneSelection);
  const scenes = useStore((s) => s.script.scenes);
  const media = useStore((s) => s.media);
  const label = (ids?: string[]) => {
    if (!ids?.length) return t('whole video');
    const ns = ids.map((id) => scenes.findIndex((s) => s.id === id) + 1).filter((n) => n > 0).sort((a, b) => a - b);
    return ns.length ? t('scenes {list}', { list: ns.join(', ') }) : t('whole video');
  };
  const toggle = (r: Reference) => {
    if (!sel.length) return;
    const has = sel.every((id) => r.sceneIds?.includes(id));
    const next = has ? (r.sceneIds || []).filter((id) => !sel.includes(id)) : [...new Set([...(r.sceneIds || []), ...sel])];
    actions.patchReference(r.id, { sceneIds: next });
  };
  const thumb = (r: Reference) => r.kind === 'media' ? (media.find((m) => m.file === r.ref)?.thumb ? pfile(media.find((m) => m.file === r.ref)!.thumb!) : null) : r.thumb || null;
  return (
    <div className="refs">
      <span className="refs-title"><Icon name="star" size={13} /> {t('References')}</span>
      {refs.map((r) => (
        <div key={r.id} className={'ref-card' + (r.kind === 'inspiration' && r.note ? ' insp' : '') + (sel.length && sel.every((id) => r.sceneIds?.includes(id)) ? ' bound' : '')} role="button" tabIndex={0}
          title={sel.length ? t('Click to bind to / unbind from the selected scenes') : t('Select scenes, then click to bind this reference to them')} onClick={() => toggle(r)}>
          <span className="ref-thumb">{thumb(r) ? <img src={thumb(r)!} alt="" /> : <Icon name={r.kind === 'link' ? 'external' : r.kind === 'music-technique' ? 'music' : 'image'} size={14} />}</span>
          <span className="ref-text"><span className={'ref-name' + (r.kind === 'inspiration' && r.note ? '' : ' ellipsis')} title={r.kind === 'inspiration' && r.note ? `${t('We take')}: ${t(r.note)}` : undefined}>{r.kind === 'inspiration' && r.note ? t(r.note) : r.title}</span><span className="ref-scope ellipsis">{r.kind === 'inspiration' && r.note ? r.title + ' · ' : ''}{label(r.sceneIds)}</span></span>
          <button className="ref-x" aria-label={t('Remove reference')} onClick={(e) => { e.stopPropagation(); actions.removeReference(r.id); }}><Icon name="x" size={10} /></button>
        </div>
      ))}
      <button className="ref-add" onClick={() => setState({ libraryOpen: true, libraryTab: 'inspiration' })}><Icon name="plus" size={12} /> {refs.length ? t('Add') : t('Add references: techniques, images, links')}</button>
    </div>
  );
}

/** an agent is already on it: show its progress instead of the "what are we making" start screen */
function StoryWorking({ task }: { task: Task }) {
  const last = [...task.events].reverse();
  const said = last.find((e) => e.kind === 'text' && e.text?.trim())?.text?.trim();
  const doing = last.find((e) => e.kind === 'tool');
  const asking = task.question && task.question.answer == null;
  const side = useStore((s) => s.sideTab);
  return (
    <div className="story-empty working">
      <div className="story-empty-mark busy"><span className="spinner" /></div>
      <h1>{asking ? t('The agent has a question for you') : t('The agent is working on your video')}</h1>
      <p className="muted">{asking ? t('Answer it in the chat on the right — then it continues.') : t('The script appears here as soon as it is written — scenes, text and visuals — and then fills in scene by scene. You can add instructions in the chat on the right at any time; the agent keeps going.')}</p>
      <div className="working-task">
        <div className="small ellipsis"><b>{task.title}</b></div>
        {said && <div className="working-said">{said.length > 280 ? said.slice(0, 280) + '…' : said}</div>}
        {doing?.tool && <div className="muted xsmall mono ellipsis">{doing.tool.replace(/^mcp__studio__/, '')} {typeof doing.text === 'string' ? doing.text.slice(0, 80) : ''}</div>}
      </div>
      {side !== 'agent' && <button className="btn sm" onClick={() => setState({ sideTab: 'agent' })}>{t('Open the chat')}</button>}
    </div>
  );
}

function StoryEmpty({ hasItems }: { hasItems: boolean }) {
  const working = useStore((s) => s.tasks.find((x) => !x.parentId && x.role !== 'critic' && (x.status === 'running' || x.status === 'queued')));
  if (working) return <StoryWorking task={working} />;
  if (!hasItems) return (
    <div className="story-empty start">
      <h1>{t('What video are we making?')}</h1>
      <p className="muted">{t('Describe your idea, pick the format, add references. First the agent writes a script — scenes, text, visuals — then builds the graphics, music and edit.')}</p>
      <HeroComposer mode="project" />
    </div>
  );
  const examples = [t('A 30-second product promo for social media'), t('A 1-minute explainer video with subtitles'), t('A podcast intro: 8 seconds, logo and music')];
  return (
    <div className="story-empty">
      <div className="story-empty-mark"><Icon name="sparkle" size={22} /></div>
      <h1>{hasItems ? t('No script yet') : t('What video are we making?')}</h1>
      <p className="muted">{hasItems
        ? t('The edit has content but no scenes. Ask the agent to write a script from what is already there — then you can work scene by scene.')
        : t('Describe your idea on the right. First the agent writes a script — scenes, text, visuals — then builds the graphics, music and edit.')}</p>
      <div className="story-empty-ex">
        {hasItems
          ? <button className="btn primary" onClick={() => actions.startTask('Write a script for this video from what is already on the timeline: one scene per meaningful section, with titles, timing, copy and visual notes. Link the existing items to scenes (itemIds). Do not change the edit.')}><Icon name="sparkle" size={13} /> {t('Write the script from the edit')}</button>
          : examples.map((e) => <button key={e} className="example" onClick={() => setState({ chatDraft: e, sideTab: 'agent' })}>{e}</button>)}
      </div>
    </div>
  );
}

/** Floating actions for the selected scenes (storyboard / edit view). */
export function SelectionBar() {
  const sel = useStore((s) => s.sceneSelection);
  const scenes = useStore((s) => s.script.scenes);
  const subagents = useStore((s) => s.settings?.subagents !== false);
  const picked = scenes.map((s, i) => ({ s, n: i + 1 })).filter((x) => sel.includes(x.s.id));
  if (!picked.length) return null;
  const allLocked = picked.every((x) => x.s.locked);
  const allApproved = picked.every((x) => x.s.status === 'approved');
  const many = picked.length > 1;
  const parallel = many && subagents ? ' Use one sub-agent per scene (delegate_task) so they are built in parallel, then review and assemble.' : '';
  /** put the selection (+ an action) into the composer — the user adds what exactly to do, then sends */
  const prep = (action?: { key: string; label: string; text: string }) => {
    setState((s) => ({
      chatContext: [
        ...(action ? [{ key: 'action:' + action.key, label: action.label, text: action.text }] : []),
        ...s.chatContext.filter((c) => !c.key.startsWith('scene:') && !c.key.startsWith('action:')),
        ...picked.map((x) => sceneChip(x.s, x.n)),
      ],
      sideTab: 'agent',
    }));
    setTimeout(() => (document.querySelector('.composer textarea') as HTMLTextAreaElement | null)?.focus(), 30);
  };
  const ask = () => prep();
  return (
    <div className="sel-bar" role="region" aria-label={t('Actions for the selection')}>
      <span className="sel-count">{tn(picked.length, '{n} scene', '{n} scenes')}</span>
      <span className="sel-sep" />
      <button className="sel-primary" onClick={ask}><Icon name="sparkle" size={13} /> {t('Ask the agent')}</button>
      <button onClick={() => prep({ key: 'make', label: t('Make'), text: `ACTION — make the selected scene(s) from the script, following the user's notes in the message. Work only on them: get_script → update_scene status doing → clips/music/timeline → verify with render_frame → update_scene done with itemIds.${parallel}` })}>{t('Make')}</button>
      <button onClick={() => prep({ key: 'redo', label: t('Redo'), text: `ACTION — redo the selected scene(s): change exactly what the user's message says (if it says nothing specific, make a fresh, stronger take keeping the script's intent, timing and the design system). Work only on them; verify with render_frame.${parallel}` })}>{t('Redo')}</button>
      <button onClick={() => prep({ key: 'variations', label: t('Variations'), text: `ACTION — make visual variations of the selected scene(s) in the direction the user's message gives (default 3) as separate clips; don't replace the current one — put them on a spare track, hidden, so the user can compare. Then set the scene status to review and describe the variants in its notes.${parallel}` })}>{t('Variations')}</button>
      <button onClick={() => prep({ key: 'voice', label: t('Voice-over'), text: 'ACTION — voice-over for the selected scene(s) following the studio-voiceover skill (voice, tone, pace per the user\'s message): write the speech text (numbers/dates as words, {display|spoken}, stress marks, pauses), generate_voiceover per scene, then voice_report and fix flagged sentences.' })}>{t('Voice-over')}</button>
      <button onClick={() => { actions.patchScenes(picked.map((x) => x.s.id), { status: allApproved ? 'done' : 'approved' }); }}>{allApproved ? t('Unapprove') : t('Approve')}</button>
      <button onClick={() => actions.patchScenes(picked.map((x) => x.s.id), { locked: !allLocked })} title={t('Locked scenes are off-limits for agents')}><Icon name="lock" size={12} /> {allLocked ? t('Unlock') : t('Lock')}</button>
      <button className="sel-x" aria-label={t('Clear selection')} onClick={() => setState({ sceneSelection: [] })}><Icon name="x" size={12} /></button>
    </div>
  );
}
