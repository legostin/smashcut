import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, PermissionRequest, Task } from '../../../shared/types';
import { useStore, setState, actions, api } from '../store';
import { sceneChip } from './Storyboard';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { t, tn } from '../i18n';

/** The agent conversation: task switcher, feed, permission cards, composer. */
export function Chat() {
  const tasks = useStore((s) => s.tasks);
  const selectedId = useStore((s) => s.selectedTaskId);
  const task = tasks.find((t) => t.id === selectedId) || null;
  return (
    <div className="chat">
      <TaskSwitcher tasks={tasks} current={task} />
      {task && <SubagentStrip task={task} tasks={tasks} />}
      {task ? <Feed task={task} /> : <Empty />}
      <Composer task={task} />
    </div>
  );
}

function TaskSwitcher({ tasks, current }: { tasks: Task[]; current: Task | null }) {
  const [open, setOpen] = useState(false);
  const running = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
  const pending = useStore((s) => s.permissions.length);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="chat-head">
      <button className="switcher" onClick={() => setOpen(!open)} onPointerDown={(e) => e.stopPropagation()}>
        {current ? <><Dot status={current.status} /><span className="ellipsis">{current.title}</span></> : <span>{t('New task')}</span>}
        <Icon name="chevron" size={12} />
      </button>
      <div className="row gap6">
        <FollowToggle />
        {pending > 0 && <span className="pill warn">{t('{n} awaiting permission', { n: pending })}</span>}
        {running > 0 && <span className="pill">{t('{n} in progress', { n: running })}</span>}
        {current && <button className="icon-btn" title={t('New task')} onClick={() => setState({ selectedTaskId: null })}><Icon name="plus" size={14} /></button>}
      </div>
      {open && (
        <div className="menu switcher-menu" onPointerDown={(e) => e.stopPropagation()}>
          <button className="menu-item" onClick={() => { setState({ selectedTaskId: null }); setOpen(false); }}><Icon name="plus" size={13} /> {t('New task')}</button>
          {tasks.length > 0 && <div className="menu-sep" />}
          {tasks.filter((tk) => !tk.parentId).slice(0, 40).flatMap((tk) => [tk, ...tasks.filter((c) => c.parentId === tk.id).reverse()]).map((tk) => (
            <button key={tk.id} className={'menu-item' + (tk.id === current?.id ? ' active' : '') + (tk.parentId ? ' sub' : '')} onClick={() => { setState({ selectedTaskId: tk.id }); setOpen(false); }}>
              <Dot status={tk.status} /><span className="ellipsis grow">{tk.title}</span><span className="muted xsmall">{tk.parentId ? t('sub-agent') : tk.agent}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** a lead task's sub-agents (or, on a sub-agent, the way back to its lead task) */
function SubagentStrip({ task, tasks }: { task: Task; tasks: Task[] }) {
  const parent = task.parentId ? tasks.find((x) => x.id === task.parentId) : null;
  const kids = useMemo(() => tasks.filter((x) => x.parentId === task.id).reverse(), [tasks, task.id]);
  if (parent) {
    return (
      <div className="sub-strip">
        <button className="sub-back" onClick={() => setState({ selectedTaskId: parent.id })}><Icon name="back" size={12} /> {t('Lead task')}: <span className="ellipsis">{parent.title}</span></button>
      </div>
    );
  }
  if (!kids.length) return null;
  const done = kids.filter((k) => k.status === 'done').length;
  return (
    <div className="sub-strip">
      <span className="muted xsmall">{t('Sub-agents {done}/{n}', { done, n: kids.length })}</span>
      <div className="sub-chips">
        {kids.map((k) => (
          <button key={k.id} className="sub-chip" title={k.title} onClick={() => setState({ selectedTaskId: k.id })}><Dot status={k.status} /><span className="ellipsis">{k.title}</span></button>
        ))}
      </div>
    </div>
  );
}

function FollowToggle() {
  const follow = useStore((s) => s.followAgent);
  return (
    <button className={'follow' + (follow ? ' on' : '')} onClick={() => actions.setFollow(!follow)} title={t('Follow the agent: the preview jumps to whatever it is editing right now')}>
      <Icon name="eye" size={13} />
    </button>
  );
}

const Dot = ({ status }: { status: Task['status'] }) => <span className={`dot st-${status}`} />;

function Empty() {
  const hasScript = useStore((s) => s.script.scenes.length > 0);
  const examples = hasScript
    ? [t('Make the whole video from the script'), t('Design a design system and apply it to the clips'), t('Write a music track for the script and sync scenes to the beats')]
    : [t('A 30-second product promo for social media'), t('A 1-minute explainer video with subtitles'), t('A podcast intro: 8 seconds, logo and music')];
  return (
    <div className="chat-empty">
      <div className="chat-empty-title">{hasScript ? t('What’s next?') : t('What video are we making?')}</div>
      <div className="muted">{hasScript
        ? t('The agent works from the script, scene by scene, with statuses — follow along on the canvas or in the preview.')
        : t('Describe your idea. First the agent writes a script — scenes, text, visuals — then builds the graphics, music and edit.')}</div>
      <div className="examples">{examples.map((e) => <button key={e} className="example" onClick={() => setState({ chatDraft: e })}>{e}</button>)}</div>
    </div>
  );
}

// ---------- feed ----------
type Step = { tool: AgentEvent; result?: AgentEvent };
type Block = { kind: 'event'; e: AgentEvent } | { kind: 'steps'; steps: Step[]; images?: AgentEvent[] };

function buildBlocks(events: AgentEvent[]): Block[] {
  const blocks: Block[] = [];
  const pending: Step[] = [];
  for (const e of events) {
    if (e.kind === 'thinking') continue;
    if (e.kind === 'tool') {
      const step: Step = { tool: e };
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'steps') last.steps.push(step); else blocks.push({ kind: 'steps', steps: [step] });
      pending.push(step);
      continue;
    }
    if (e.kind === 'tool_result') { const st = pending.shift(); if (st) st.result = e; continue; }
    if (e.kind === 'status' && /interrupt|stopped|restarted|queued|sub-agent/i.test(e.key || e.text || '')) { blocks.push({ kind: 'event', e }); continue; }
    if (e.kind === 'status' || (e.kind === 'result' && e.ok !== false)) continue;
    if (e.kind === 'image') {
      // frames the agent looked at: attach to the current steps group so they read as "what it saw"
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'steps') { (last as any).images = [...((last as any).images || []), e]; continue; }
    }
    blocks.push({ kind: 'event', e });
  }
  return blocks;
}

function Feed({ task }: { task: Task }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const allPerms = useStore((s) => s.permissions);
  const perms = useMemo(() => allPerms.filter((p) => p.taskId === task.id), [allPerms, task.id]);
  const blocks = useMemo(() => buildBlocks(task.events), [task.events]);
  const busy = task.status === 'running' || task.status === 'queued';
  useEffect(() => { const el = scroller.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [task.events.length, perms.length]);
  return (
    <div className="feed" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
      {blocks.map((b, i) => b.kind === 'steps'
        ? <Steps key={i} steps={b.steps} images={b.images} live={busy && i === blocks.length - 1} />
        : <Message key={i} e={b.e} />)}
      {perms.map((p) => <PermissionCard key={p.id} p={p} />)}
      {busy && !perms.length && <div className="working"><span className="spinner" /> {task.status === 'queued' ? t('queued') : t('working')}</div>}
      {!busy && (
        <div className="task-foot">
          <span>{t(STATUS[task.status])}{task.commitAfter ? ' · ' + t('version {v}', { v: task.commitAfter }) : ''}{task.costUsd ? ` · $${task.costUsd.toFixed(2)}` : ''}</span>
        </div>
      )}
    </div>
  );
}
const STATUS: Record<Task['status'], string> = { queued: 'queued', running: 'working', done: 'Done', error: 'Error', cancelled: 'Stopped' };

function Message({ e }: { e: AgentEvent }) {
  const [open, setOpen] = useState(false);
  if (e.kind === 'user') {
    const long = (e.text || '').length > 420;
    return <div className={'msg-user' + (long && !open ? ' clamp' : '')} onClick={() => long && setOpen(!open)}>{e.text}</div>;
  }
  if (e.kind === 'text') return <div className="msg-agent"><Markdown text={e.text || ''} /></div>;
  if (e.kind === 'status') return <div className="msg-status">{e.key ? t(e.key, e.params) : e.text}</div>;
  if (e.kind === 'image') return <Frames images={[e]} />;
  return <div className="msg-error">{e.text}</div>;
}

const LABEL: Record<string, string> = {
  Read: 'Reading', Write: 'Creating', Edit: 'Editing', MultiEdit: 'Editing', edit: 'Editing', Glob: 'Finding files', Grep: 'Searching', Bash: 'Command', shell: 'Command',
  WebFetch: 'Opening a page', WebSearch: 'Searching the web', TodoWrite: 'Plan', ToolSearch: 'Tools', Task: 'Subagent', Agent: 'Subagent',
  get_project: 'Viewing the project', render_clip: 'Rendering a clip', render_frame: 'Looking at a frame', lint_clip: 'Checking a clip', resolve_comment: 'Closing a note',
  list_comments: 'Reading notes', create_clip: 'Creating a clip', create_music: 'Creating a track', render_music: 'Listening to a track', analyze_audio: 'Analyzing audio',
  transcribe_media: 'Transcribing', get_timing: 'Checking the rhythm', timeline_add: 'Placing on the timeline', timeline_update: 'Moving on the timeline', timeline_remove: 'Removing from the timeline',
  use_template: 'Using a template', list_templates: 'Browsing the gallery', set_project: 'Project settings',
  delegate_task: 'Starting a sub-agent', wait_subagents: 'Waiting for sub-agents', message_subagent: 'Messaging a sub-agent',
};
const label = (tool?: string) => { const k = (tool || '').replace(/^(studio\.|mcp__studio__)/, ''); return LABEL[k] ? t(LABEL[k]) : k; };

function Frames({ images }: { images: AgentEvent[] }) {
  const shown = images.slice(-6);
  return (
    <div className="frames">
      {shown.map((im, i) => (
        <button key={i} className="frame-thumb" title={im.text} onClick={() => setState({ lightbox: im.src || null })}>
          <img src={im.src} alt="" loading="lazy" />
          {i === shown.length - 1 && <span className="frame-cap">{im.text}</span>}
        </button>
      ))}
    </div>
  );
}

function Steps({ steps, live, images }: { steps: Step[]; live: boolean; images?: AgentEvent[] }) {
  const [open, setOpen] = useState(false);
  const failed = steps.filter((s) => s.result?.ok === false).length;
  const last = steps[steps.length - 1];
  return (
    <div className={'steps' + (open ? ' open' : '')}>
      <button className="steps-head" onClick={() => setOpen(!open)}>
        <span className="steps-icon">{live ? <span className="spinner sm" /> : <Icon name="chevron" size={11} />}</span>
        {live
          ? <span className="ellipsis">{label(last.tool.tool)} <span className="muted">{last.tool.text}</span></span>
          : <span>{tn(steps.length, '{n} action', '{n} actions')}{failed ? <span className="muted"> · {t('{n} failed', { n: failed })}</span> : null}</span>}
      </button>
      {open && <div className="steps-list">{steps.map((s, i) => <StepRow key={i} s={s} />)}</div>}
      {images && images.length > 0 && <Frames images={images} />}
    </div>
  );
}

function StepRow({ s }: { s: Step }) {
  const [open, setOpen] = useState(false);
  const bad = s.result?.ok === false;
  return (
    <div className={'step' + (bad ? ' bad' : '')}>
      <button className="step-line" onClick={() => setOpen(!open)}>
        <span className="step-name">{label(s.tool.tool)}</span>
        <span className="step-sum">{s.tool.text}</span>
        {bad && <span className="step-x">{t('failed')}</span>}
      </button>
      {open && (
        <div className="step-detail">
          {s.tool.input != null && <pre>{JSON.stringify(s.tool.input, null, 2).slice(0, 4000)}</pre>}
          {s.result?.text && <pre className={bad ? 'bad' : ''}>{s.result.text}</pre>}
        </div>
      )}
    </div>
  );
}

function PermissionCard({ p }: { p: PermissionRequest }) {
  const input = p.input as Record<string, unknown> | null;
  const main = input ? String(input.command ?? input.url ?? input.file_path ?? input.path ?? input.pattern ?? input.query ?? '') : '';
  const [details, setDetails] = useState(false);
  return (
    <div className="perm">
      <div className="perm-title">{t('The agent asks for permission')}</div>
      <div className="perm-tool">{p.tool}</div>
      {main && <pre className="perm-main">{main}</pre>}
      {details && <pre className="perm-input">{JSON.stringify(p.input, null, 2).slice(0, 3000)}</pre>}
      <div className="row gap6">
        <button className="btn sm primary" onClick={() => actions.decidePermission(p.id, true)}>{t('Allow')}</button>
        <button className="btn sm" onClick={() => actions.decidePermission(p.id, true, true)}>{t('Always in this task')}</button>
        <button className="btn sm ghost" onClick={() => actions.decidePermission(p.id, false)}>{t('Deny')}</button>
        {!details && <button className="link" onClick={() => setDetails(true)}>{t('details')}</button>}
      </div>
    </div>
  );
}

// ---------- composer ----------
// ---------- @ / # / slash suggestions in the composer ----------
type Suggest = { key: string; label: string; hint?: string; icon: string; chip?: { key: string; label: string; text: string }; insert?: string };
const COMMANDS: { cmd: string; hint: string; text: string }[] = [
  { cmd: 'script', hint: 'Write or rework the script', text: 'Write (or rework) the script: scenes with timing, copy and visual notes.' },
  { cmd: 'make', hint: 'Make the video scene by scene', text: 'Make the video from the script, scene by scene, and verify each scene with render_frame.' },
  { cmd: 'design', hint: 'Design system → apply to clips', text: 'Design a design system (palette, type, motion) for this video and apply it to every clip.' },
  { cmd: 'music', hint: 'Score a track to the script', text: 'Write a music track for the script and sync the scene cuts to its beats.' },
  { cmd: 'voiceover', hint: 'Voice-over from the script copy', text: 'Prepare the voice-over: turn the script copy into speakable text, generate it per scene and check the pace.' },
  { cmd: 'captions', hint: 'Animated captions from the voice', text: 'Add animated captions synced to the voice-over words.' },
  { cmd: 'variations', hint: '3 alternatives to compare', text: 'Make 3 variations of the selection so I can compare them.' },
  { cmd: 'translate', hint: 'Translate all on-screen text', text: 'Translate all on-screen text and the script to ' },
  { cmd: 'polish', hint: 'Review and fix rough spots', text: 'Review the whole video frame by frame and fix spacing, contrast, timing and anything that looks off.' },
];
function useSuggestions(draft: string, caret: number) {
  const scenes = useStore((s) => s.script.scenes);
  const project = useStore((s) => s.project);
  const clips = useStore((s) => s.clips);
  const media = useStore((s) => s.media);
  const [tools, setTools] = useState<{ id: string; title: string; description?: string }[] | null>(null);
  const m = /(^|\s)([@#/])([^\s@#/]*)$/u.exec(draft.slice(0, caret));
  const trigger = m ? (m[2] as '@' | '#' | '/') : null;
  const q = (m?.[3] || '').toLowerCase();
  useEffect(() => {
    if (trigger === '/' && tools === null) api<any>('GET', '/api/toolkit').then((r) => setTools(Array.isArray(r) ? r : r?.ops || [])).catch(() => setTools([]));
  }, [trigger, tools]);
  const items = useMemo<Suggest[]>(() => {
    if (!trigger) return [];
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    if (trigger === '@') {
      const out: Suggest[] = [];
      scenes.forEach((sc, i) => { if (match(`${i + 1} ${sc.title} scene`)) out.push({ key: 'scene:' + sc.id, label: `${t('Scene {n}', { n: i + 1 })} · ${sc.title}`, icon: 'story', chip: sceneChip(sc, i + 1) }); });
      for (const it of project?.items || []) {
        if (it.kind !== 'clip' && it.kind !== 'media') continue;
        const name = it.label || clips.find((c) => c.id === it.ref)?.name || it.ref;
        if (match(name + ' ' + it.ref)) out.push({ key: 'item:' + it.id, label: name, hint: `${it.start.toFixed(1)}–${(it.start + it.duration).toFixed(1)}s`, icon: it.kind === 'media' ? 'film' : 'sparkle', chip: { key: 'item:' + it.id, label: name, text: `timeline item ${it.id} (${it.kind} “${name}”, ref ${it.ref}, ${it.start.toFixed(2)}–${(it.start + it.duration).toFixed(2)} s, track ${it.track})` } });
      }
      return out.slice(0, 12);
    }
    if (trigger === '#') {
      return media.filter((x) => match(x.file)).slice(0, 12).map((x) => ({ key: 'media:' + x.file, label: x.file, hint: x.type, icon: x.type === 'audio' ? 'music' : x.type === 'image' ? 'image' : 'film', chip: { key: 'media:' + x.file, label: x.file, text: `media file media/${x.file} (${x.type}${x.duration ? `, ${x.duration.toFixed(1)} s` : ''}${x.width ? `, ${x.width}×${x.height}` : ''})` } }));
    }
    const out: Suggest[] = COMMANDS.filter((c) => match(c.cmd + ' ' + c.hint)).map((c) => ({ key: 'cmd:' + c.cmd, label: '/' + c.cmd, hint: t(c.hint), icon: 'sparkle', insert: c.text }));
    for (const op of tools || []) if (match(op.id + ' ' + op.title)) out.push({ key: 'tool:' + op.id, label: '/' + op.id.replace(/_/g, '-'), hint: op.title, icon: 'tool', insert: `Use the media tool ${op.id} (run_media_tool) ` });
    return out.slice(0, 14);
  }, [trigger, q, scenes, project, clips, media, tools]);
  return { trigger, items, start: m ? caret - (m[3]?.length || 0) - 1 : -1 };
}

function Composer({ task }: { task: Task | null }) {
  const draft = useStore((s) => s.chatDraft);
  const agent = useStore((s) => s.agent);
  const agents = useStore((s) => s.agents);
  const ctx = useStore((s) => s.chatContext);
  const ref = useRef<HTMLTextAreaElement>(null);
  const busy = !!task && (task.status === 'running' || task.status === 'queued');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(220, el.scrollHeight) + 'px';
  }, [draft]);
  useEffect(() => { if (draft || ctx.length) ref.current?.focus(); }, [draft === '', ctx.length]);
  /** how: send (idle) · interrupt (busy, default) · later (busy, after the current step) */
  const send = async (how: 'send' | 'interrupt' | 'later' = busy ? 'interrupt' : 'send') => {
    const text = withContext(draft.trim(), ctx);
    if (!draft.trim() && !ctx.length) return;
    if (!task) await actions.startTask(text);
    else if (how === 'interrupt') await actions.interrupt(task.id, text);
    else await actions.followUp(task.id, text);
    setState({ chatDraft: '', chatContext: [] });
  };
  const missing = agents && !agents[agent];
  const empty = !draft.trim() && !ctx.length;
  const [caret, setCaret] = useState(0);
  const [hi, setHi] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const sug = useSuggestions(draft, caret);
  const open = sug.items.length > 0 && dismissed !== draft;
  useEffect(() => setHi(0), [sug.trigger, sug.items.length]);
  const pick = (s: Suggest) => {
    const before = draft.slice(0, sug.start), after = draft.slice(caret);
    if (s.chip) {
      setState((st) => ({ chatDraft: (before + after).replace(/\s{2,}/g, ' '), chatContext: st.chatContext.some((c) => c.key === s.chip!.key) ? st.chatContext : [...st.chatContext, s.chip!] }));
      setCaret(before.length);
    } else {
      const text = before + (s.insert || '') + after;
      setState({ chatDraft: text });
      setCaret((before + (s.insert || '')).length);
    }
    setTimeout(() => { const el = ref.current; if (el) { el.focus(); const pos = s.chip ? before.length : (before + (s.insert || '')).length; el.setSelectionRange(pos, pos); } }, 0);
  };
  return (
    <div className={'composer' + (busy ? ' busy' : '')}>
      {missing && <div className="composer-warn">{t('CLI “{agent}” not found in PATH', { agent })}</div>}
      {ctx.length > 0 && (
        <div className="ctx-chips">
          {ctx.map((c) => (
            <span key={c.key} className={'ctx-chip' + (c.key.startsWith('action:') ? ' action' : '')} title={c.text}>{c.label}<button onClick={() => setState((s) => ({ chatContext: s.chatContext.filter((x) => x.key !== c.key) }))}><Icon name="x" size={9} /></button></span>
          ))}
        </div>
      )}
      {open && (
        <div className="suggest" role="listbox">
          <div className="suggest-head">{sug.trigger === '@' ? t('Scenes and clips') : sug.trigger === '#' ? t('Media') : t('Commands and tools')}</div>
          {sug.items.map((s, i) => (
            <button key={s.key} role="option" aria-selected={i === hi} className={'suggest-item' + (i === hi ? ' on' : '')} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(s); }}>
              <Icon name={s.icon} size={13} /><span className="ellipsis">{s.label}</span>{s.hint && <span className="suggest-hint ellipsis">{s.hint}</span>}
            </button>
          ))}
        </div>
      )}
      <textarea ref={ref} rows={1} value={draft}
        placeholder={busy ? t('Interrupt the agent: write what to change (Enter)…') : ctx.some((c) => c.key.startsWith('action:')) ? t('What exactly should be done or changed? Enter — send') : task ? t('Continue…') : ctx.length ? t('What to do with the selection?') : t('Describe what to do · @ scenes · # media · / commands')}
        onChange={(e) => { setState({ chatDraft: e.target.value }); setCaret(e.target.selectionStart ?? e.target.value.length); }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % sug.items.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + sug.items.length) % sug.items.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(sug.items[hi]); return; }
            if (e.key === 'Escape') { e.preventDefault(); setDismissed(draft); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
        }} />
      <div className="composer-bar">
        {!task
          ? <div className="seg">{(['claude', 'codex'] as const).map((a) => <button key={a} className={agent === a ? 'on' : ''} onClick={() => setState({ agent: a })}>{a === 'claude' ? 'Claude' : 'Codex'}</button>)}</div>
          : <span className="muted xsmall">{busy ? <><span className="spinner sm" /> {t('{agent} is working', { agent: task.agent })}</> : task.agent}</span>}
        {busy ? (
          <div className="row gap6">
            <button className="btn xs ghost" onClick={() => actions.cancelTask(task!.id)} title={t('Stop completely')}><Icon name="stop" size={9} /> {t('Stop')}</button>
            {!empty && <button className="btn xs ghost" onClick={() => send('later')} title={t('Send when the agent finishes the current step')}>{t('Later')}</button>}
            <button className="btn xs primary" disabled={empty} onClick={() => send('interrupt')} title={t('The agent stops and immediately continues with your message (Enter)')}>{t('Interrupt')}</button>
          </div>
        ) : <button className="send" disabled={empty} onClick={() => send()} title="Enter"><Icon name="arrowUp" size={14} /></button>}
      </div>
    </div>
  );
}

/** append the board selection to the message so the agent knows exactly what is meant */
export function withContext(text: string, ctx: { key?: string; label: string; text: string }[]) {
  if (!ctx.length) return text;
  const action = ctx.find((c) => c.key?.startsWith('action:'));
  const rest = ctx.filter((c) => c !== action);
  const head = text || (action ? 'Do the action below.' : 'Look at the selection and suggest improvements.');
  return `${head}${action ? `\n\n${action.text}` : ''}${rest.length ? `\n\nContext — what the user selected / referenced (work on exactly these):\n${rest.map((c) => '- ' + c.text).join('\n')}` : ''}`;
}
