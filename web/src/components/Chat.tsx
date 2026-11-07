import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, PermissionRequest, Task } from '../../../shared/types';
import { useStore, setState, actions } from '../store';
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
          {tasks.slice(0, 40).map((tk) => (
            <button key={tk.id} className={'menu-item' + (tk.id === current?.id ? ' active' : '')} onClick={() => { setState({ selectedTaskId: tk.id }); setOpen(false); }}>
              <Dot status={tk.status} /><span className="ellipsis grow">{tk.title}</span><span className="muted xsmall">{tk.agent}</span>
            </button>
          ))}
        </div>
      )}
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
    if (e.kind === 'status' && /interrupt|stopped|restarted|queued/i.test(e.key || e.text || '')) { blocks.push({ kind: 'event', e }); continue; }
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
  return (
    <div className={'composer' + (busy ? ' busy' : '')}>
      {missing && <div className="composer-warn">{t('CLI “{agent}” not found in PATH', { agent })}</div>}
      {ctx.length > 0 && (
        <div className="ctx-chips">
          {ctx.map((c) => (
            <span key={c.key} className="ctx-chip" title={c.text}>{c.label}<button onClick={() => setState((s) => ({ chatContext: s.chatContext.filter((x) => x.key !== c.key) }))}><Icon name="x" size={9} /></button></span>
          ))}
        </div>
      )}
      <textarea ref={ref} rows={1} value={draft}
        placeholder={busy ? t('Interrupt the agent: write what to change (Enter)…') : task ? t('Continue…') : ctx.length ? t('What to do with the selection?') : t('Describe what to do')}
        onChange={(e) => setState({ chatDraft: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
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
export function withContext(text: string, ctx: { label: string; text: string }[]) {
  if (!ctx.length) return text;
  return `${text || 'Look at the selection and suggest improvements.'}\n\nContext — selected on the canvas:\n${ctx.map((c) => '- ' + c.text).join('\n')}`;
}
