import { useEffect, useMemo, useRef, useState } from 'react';
import type { Comment, Project, Task, AgentEvent } from '../../../shared/types';
import { useStore, setState, actions, seek, fmtTime, getState } from '../store';
import { Inspector } from './Inspector';
import { Icon } from './Icon';

export function RightPanel({ project }: { project: Project }) {
  const tab = useStore((s) => s.rightTab);
  const openComments = useStore((s) => s.comments.filter((c) => c.status === 'draft').length);
  const toReview = useStore((s) => s.comments.filter((c) => c.status === 'resolved').length);
  const running = useStore((s) => s.tasks.filter((t) => t.status === 'running' || t.status === 'queued').length);
  return (
    <div className="panel right">
      <div className="tabs">
        <button className={'tab' + (tab === 'agent' ? ' active' : '')} onClick={() => setState({ rightTab: 'agent' })}><Icon name="bot" size={14} /> Агенты {running > 0 && <span className="badge pulse">{running}</span>}</button>
        <button className={'tab' + (tab === 'comments' ? ' active' : '')} onClick={() => setState({ rightTab: 'comments' })}><Icon name="comment" size={14} /> Правки {openComments + toReview > 0 && <span className="badge red">{openComments + toReview}</span>}</button>
        <button className={'tab' + (tab === 'inspector' ? ' active' : '')} onClick={() => setState({ rightTab: 'inspector' })}><Icon name="layers" size={14} /> Инспектор</button>
      </div>
      <div className="panel-body">
        {tab === 'inspector' && <Inspector project={project} />}
        {tab === 'comments' && <Comments project={project} />}
        {tab === 'agent' && <AgentPanel />}
      </div>
    </div>
  );
}

// ---------------- comments ----------------
const STATUS_LABEL: Record<Comment['status'], string> = { draft: 'Черновик', sent: 'У агента', resolved: 'Агент исправил — проверьте', done: 'Принято' };

function Comments({ project }: { project: Project }) {
  const comments = useStore((s) => s.comments);
  const selected = useStore((s) => s.selectedCommentId);
  const agent = useStore((s) => s.agent);
  const drafts = comments.filter((c) => c.status === 'draft');
  const groups: Comment['status'][] = ['resolved', 'draft', 'sent', 'done'];
  const clipName = (c: Comment) => c.clipId ? (getState().clips.find((x) => x.id === c.clipId)?.name || c.clipId) : 'таймлайн';
  const targets = new Set(drafts.map((c) => c.itemId || c.clipId || 'tl'));
  return (
    <div className="col gap12">
      <div className="card col gap8">
        <div className="small">Включите <b>«Комментировать»</b> (клавиша <kbd>C</kbd>) и кликните по кадру или обведите область. Черновики уходят агентам пачкой: <b>один агент на клип, параллельно</b>.</div>
        <div className="row gap6">
          <AgentSelect />
          <button className="btn primary sm grow" disabled={!drafts.length} onClick={() => actions.sendComments()}>
            <Icon name="send" size={12} /> Отправить {drafts.length || ''} → {targets.size > 1 ? `${targets.size} агента` : agent}
          </button>
        </div>
      </div>
      {groups.map((g) => {
        const list = comments.filter((c) => c.status === g).sort((a, b) => a.time - b.time);
        if (!list.length) return null;
        return (
          <div key={g} className="col gap6">
            <div className="section-title">{STATUS_LABEL[g]} · {list.length}</div>
            {list.map((c) => (
              <div key={c.id} className={`comment-card status-${c.status}${c.id === selected ? ' selected' : ''}`} onClick={() => { seek(c.time); setState({ selectedCommentId: c.id }); }}>
                <div className="row between">
                  <span className="xsmall muted"><b className="mono">{fmtTime(c.time, project.fps)}</b> · {clipName(c)}</span>
                  {c.status === 'draft' && <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); actions.deleteComment(c.id); }}><Icon name="x" size={12} /></button>}
                </div>
                {c.status === 'draft' ? <EditableText c={c} /> : <div className="small">{c.text}</div>}
                {c.resolution && <div className="resolution">↳ {c.resolution}</div>}
                {c.snapshot && c.id === selected && <img className="snapshot" src={`/p/${c.snapshot}`} alt="" />}
                {c.status === 'resolved' && (
                  <div className="row gap6" onClick={(e) => e.stopPropagation()}>
                    <button className="btn xs primary" onClick={() => actions.updateComment(c.id, { status: 'done' })}><Icon name="check" size={11} /> Принять</button>
                    <button className="btn xs" onClick={() => actions.updateComment(c.id, { status: 'draft', resolution: undefined })}>Вернуть в работу</button>
                  </div>
                )}
                {c.status === 'sent' && c.taskId && <button className="btn xs ghost" onClick={(e) => { e.stopPropagation(); setState({ rightTab: 'agent', selectedTaskId: c.taskId! }); }}>Открыть задачу агента →</button>}
              </div>
            ))}
          </div>
        );
      })}
      {!comments.length && <div className="empty">Комментариев пока нет.</div>}
    </div>
  );
}

function EditableText({ c }: { c: Comment }) {
  const [v, setV] = useState(c.text);
  return <textarea className="input small" rows={2} value={v} onClick={(e) => e.stopPropagation()} onChange={(e) => setV(e.target.value)} onBlur={() => v !== c.text && actions.updateComment(c.id, { text: v })} />;
}

function AgentSelect() {
  const agent = useStore((s) => s.agent);
  const agents = useStore((s) => s.agents);
  return (
    <select className="input sm" value={agent} onChange={(e) => setState({ agent: e.target.value as 'claude' | 'codex' })} title="Какой локальный агент выполняет задачи">
      <option value="claude">Claude Code{agents && !agents.claude ? ' (не найден)' : ''}</option>
      <option value="codex">Codex{agents && !agents.codex ? ' (не найден)' : ''}</option>
    </select>
  );
}

// ---------------- agent ----------------
function AgentPanel() {
  const tasks = useStore((s) => s.tasks);
  const selectedId = useStore((s) => s.selectedTaskId);
  const task = tasks.find((t) => t.id === selectedId) || null;
  return (
    <div className="agent-panel">
      <div className="task-list">
        <button className={'task-chip' + (!task ? ' active' : '')} onClick={() => setState({ selectedTaskId: null })}><Icon name="plus" size={11} /> Новая задача</button>
        {tasks.slice(0, 30).map((t) => (
          <button key={t.id} className={`task-chip st-${t.status}${t.id === selectedId ? ' active' : ''}`} onClick={() => setState({ selectedTaskId: t.id })} title={t.title}>
            <span className={`dot st-${t.status}`} /> <span className="ellipsis">{t.title}</span>
          </button>
        ))}
      </div>
      {task ? <TaskView task={task} /> : <NewTask />}
    </div>
  );
}

const SUGGESTIONS = [
  'Сделай интро на 5 секунд: название проекта крупной кинетической типографикой, в ритм музыки',
  'Добавь субтитры-караоке по транскрипту видео на нижнюю треть',
  'Напиши энергичный трек 120 BPM на 20 секунд с дропом на 8-й секунде и синхронизируй переходы графики с битами',
  'Проверь все клипы на таймлайне рендером и исправь всё, что выглядит непрофессионально',
];

function NewTask() {
  const draft = useStore((s) => s.chatDraft);
  const selectedItemId = useStore((s) => s.selectedItemId);
  const item = useStore((s) => s.project?.items.find((i) => i.id === s.selectedItemId));
  const agents = useStore((s) => s.agents);
  const agent = useStore((s) => s.agent);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (draft) { ref.current?.focus(); ref.current?.setSelectionRange(draft.length, draft.length); } }, [draft]);
  const submit = async () => {
    if (!draft.trim()) return;
    await actions.startTask(draft.trim(), { itemId: selectedItemId });
    setState({ chatDraft: '' });
  };
  const missing = agents && !agents[agent];
  return (
    <div className="col gap10 new-task">
      <div className="small muted">Агент работает в папке проекта на вашей машине: пишет HTML/CSS/JS-клипы и Tone.js-музыку, сам рендерит кадры через MCP <code>studio</code> и смотрит на результат. Каждая задача — версия в истории.</div>
      {missing && <div className="error-box">CLI «{agent}» не найден в PATH. Установите и залогиньтесь: {agent === 'claude' ? <code>npm i -g @anthropic-ai/claude-code && claude</code> : <code>npm i -g @openai/codex && codex login</code>}</div>}
      <textarea ref={ref} className="input" rows={6} placeholder="Что сделать? Например: «сделай нижнюю плашку для спикера Анны, роль — продакт-дизайнер, появление на 3-й секунде»"
        value={draft} onChange={(e) => setState({ chatDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} />
      <div className="row gap6">
        <AgentSelect />
        {item && <span className="chip active small ellipsis" title="Контекст: выбранный элемент">◎ {item.ref}</span>}
        <button className="btn primary sm grow" disabled={!draft.trim()} onClick={submit}><Icon name="send" size={12} /> Запустить <kbd>⌘↵</kbd></button>
      </div>
      <div className="col gap6">
        <div className="section-title">Идеи</div>
        {SUGGESTIONS.map((s) => <button key={s} className="suggestion" onClick={() => setState({ chatDraft: s })}>{s}</button>)}
      </div>
    </div>
  );
}

function TaskView({ task }: { task: Task }) {
  const [msg, setMsg] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [task.events.length]);
  const busy = task.status === 'running' || task.status === 'queued';
  const events = useMemo(() => task.events.filter((e) => showThinking || e.kind !== 'thinking'), [task.events, showThinking]);
  return (
    <div className="task-view">
      <div className="task-head">
        <div className="grow minw0">
          <div className="strong small ellipsis">{task.title}</div>
          <div className="muted xsmall">{task.agent} · {statusRu(task.status)}{task.costUsd ? ` · $${task.costUsd.toFixed(3)}` : ''}{task.commitAfter ? ` · версия ${task.commitAfter}` : ''}</div>
        </div>
        <label className="xsmall muted row gap4"><input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} /> мысли</label>
        {busy && <button className="btn xs danger" onClick={() => actions.cancelTask(task.id)}><Icon name="stop" size={10} /> Стоп</button>}
      </div>
      <div className="events" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {events.map((e, i) => <EventRow key={i} e={e} />)}
        {busy && <div className="ev ev-status"><span className="spinner" /> работает…</div>}
      </div>
      <div className="task-input">
        <textarea className="input" rows={2} placeholder={busy ? 'Агент работает…' : 'Уточнение / следующая просьба в этой же сессии (⌘↵)'} value={msg} disabled={busy}
          onChange={(e) => setMsg(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && msg.trim()) { await actions.followUp(task.id, msg.trim()); setMsg(''); } }} />
        <button className="btn primary sm" disabled={busy || !msg.trim()} onClick={async () => { await actions.followUp(task.id, msg.trim()); setMsg(''); }}><Icon name="send" size={12} /></button>
      </div>
    </div>
  );
}

const statusRu = (s: Task['status']) => ({ queued: 'в очереди', running: 'работает', done: 'готово', error: 'ошибка', cancelled: 'остановлено' }[s]);

function EventRow({ e }: { e: AgentEvent }) {
  const [open, setOpen] = useState(false);
  if (e.kind === 'user') return <div className="ev ev-user">{e.text}</div>;
  if (e.kind === 'text') return <div className="ev ev-text">{e.text}</div>;
  if (e.kind === 'thinking') return <div className="ev ev-thinking">{e.text}</div>;
  if (e.kind === 'tool') return (
    <div className="ev ev-tool" onClick={() => setOpen(!open)}>
      <span className="tool-name">{e.tool}</span> <span className="muted ellipsis">{e.text}</span>
      {open && e.input != null && <pre>{JSON.stringify(e.input, null, 2).slice(0, 3000)}</pre>}
    </div>
  );
  if (e.kind === 'tool_result') return e.ok === false ? <div className="ev ev-error small" onClick={() => setOpen(!open)}>✗ {open ? e.text : e.text?.slice(0, 160)}</div> : null;
  if (e.kind === 'error') return <div className="ev ev-error">{e.text}</div>;
  if (e.kind === 'result') return <div className={'ev ev-result' + (e.ok === false ? ' bad' : '')}>{e.ok === false ? '✗ ' + e.text : '✓ ход завершён'}</div>;
  return <div className="ev ev-status">{e.text}</div>;
}
