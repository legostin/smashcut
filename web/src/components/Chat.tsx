import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent, PermissionRequest, Task } from '../../../shared/types';
import { useStore, setState, actions } from '../store';
import { Icon } from './Icon';
import { Markdown } from './Markdown';

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
        {current ? <><Dot status={current.status} /><span className="ellipsis">{current.title}</span></> : <span>Новая задача</span>}
        <Icon name="chevron" size={12} />
      </button>
      <div className="row gap6">
        <FollowToggle />
        {pending > 0 && <span className="pill warn">{pending} ждёт разрешения</span>}
        {running > 0 && <span className="pill">{running} в работе</span>}
        {current && <button className="icon-btn" title="Новая задача" onClick={() => setState({ selectedTaskId: null })}><Icon name="plus" size={14} /></button>}
      </div>
      {open && (
        <div className="menu switcher-menu" onPointerDown={(e) => e.stopPropagation()}>
          <button className="menu-item" onClick={() => { setState({ selectedTaskId: null }); setOpen(false); }}><Icon name="plus" size={13} /> Новая задача</button>
          {tasks.length > 0 && <div className="menu-sep" />}
          {tasks.slice(0, 40).map((t) => (
            <button key={t.id} className={'menu-item' + (t.id === current?.id ? ' active' : '')} onClick={() => { setState({ selectedTaskId: t.id }); setOpen(false); }}>
              <Dot status={t.status} /><span className="ellipsis grow">{t.title}</span><span className="muted xsmall">{t.agent}</span>
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
    <button className={'follow' + (follow ? ' on' : '')} onClick={() => actions.setFollow(!follow)} title="Следить за агентом: превью переходит к тому, что он сейчас правит">
      <Icon name="eye" size={13} />
    </button>
  );
}

const Dot = ({ status }: { status: Task['status'] }) => <span className={`dot st-${status}`} />;

function Empty() {
  const hasScript = useStore((s) => s.script.scenes.length > 0);
  const examples = hasScript
    ? ['Сделай всё видео по сценарию', 'Спроектируй дизайн-систему и примени её к клипам', 'Напиши трек под сценарий и синхронизируй сцены с битами']
    : ['30-секундный промо-ролик продукта для соцсетей', 'Объясняющее видео на 1 минуту с субтитрами', 'Заставка для подкаста: 8 секунд, логотип и музыка'];
  return (
    <div className="chat-empty">
      <div className="chat-empty-title">{hasScript ? 'Что делаем дальше?' : 'Какое видео делаем?'}</div>
      <div className="muted">{hasScript
        ? 'Агент работает по сценарию: сцена за сценой, со статусами — следите на холсте или в превью.'
        : 'Опишите идею. Первым делом агент напишет сценарий — сцены, текст, визуал — а потом соберёт графику, музыку и монтаж.'}</div>
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
      {busy && !perms.length && <div className="working"><span className="spinner" /> {task.status === 'queued' ? 'в очереди' : 'работает'}</div>}
      {!busy && (
        <div className="task-foot">
          <span>{statusRu(task.status)}{task.commitAfter ? ` · версия ${task.commitAfter}` : ''}{task.costUsd ? ` · $${task.costUsd.toFixed(2)}` : ''}</span>
        </div>
      )}
    </div>
  );
}
const statusRu = (s: Task['status']) => ({ queued: 'в очереди', running: 'работает', done: 'Готово', error: 'Ошибка', cancelled: 'Остановлено' }[s]);

function Message({ e }: { e: AgentEvent }) {
  const [open, setOpen] = useState(false);
  if (e.kind === 'user') {
    const long = (e.text || '').length > 420;
    return <div className={'msg-user' + (long && !open ? ' clamp' : '')} onClick={() => long && setOpen(!open)}>{e.text}</div>;
  }
  if (e.kind === 'text') return <div className="msg-agent"><Markdown text={e.text || ''} /></div>;
  if (e.kind === 'image') return <Frames images={[e]} />;
  return <div className="msg-error">{e.text}</div>;
}

const LABEL: Record<string, string> = {
  Read: 'Читает', Write: 'Создаёт', Edit: 'Правит', MultiEdit: 'Правит', edit: 'Правит', Glob: 'Ищет файлы', Grep: 'Ищет', Bash: 'Команда', shell: 'Команда',
  WebFetch: 'Открывает страницу', WebSearch: 'Ищет в сети', TodoWrite: 'План', ToolSearch: 'Инструменты', Task: 'Субагент', Agent: 'Субагент',
  get_project: 'Смотрит проект', render_clip: 'Рендерит клип', render_frame: 'Смотрит кадр', lint_clip: 'Проверяет клип', resolve_comment: 'Закрывает правку',
  list_comments: 'Читает правки', create_clip: 'Создаёт клип', create_music: 'Создаёт трек', render_music: 'Слушает трек', analyze_audio: 'Анализирует аудио',
  transcribe_media: 'Транскрибирует', get_timing: 'Смотрит ритм', timeline_add: 'Ставит на таймлайн', timeline_update: 'Двигает на таймлайне', timeline_remove: 'Убирает с таймлайна',
  use_template: 'Берёт шаблон', list_templates: 'Смотрит галерею', set_project: 'Настройки проекта',
};
const label = (t?: string) => { const k = (t || '').replace(/^(studio\.|mcp__studio__)/, ''); return LABEL[k] || k; };

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
          : <span>{steps.length} {plural(steps.length, 'действие', 'действия', 'действий')}{failed ? <span className="muted"> · {failed} не удалось</span> : null}</span>}
      </button>
      {open && <div className="steps-list">{steps.map((s, i) => <StepRow key={i} s={s} />)}</div>}
      {images && images.length > 0 && <Frames images={images} />}
    </div>
  );
}
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

function StepRow({ s }: { s: Step }) {
  const [open, setOpen] = useState(false);
  const bad = s.result?.ok === false;
  return (
    <div className={'step' + (bad ? ' bad' : '')}>
      <button className="step-line" onClick={() => setOpen(!open)}>
        <span className="step-name">{label(s.tool.tool)}</span>
        <span className="step-sum">{s.tool.text}</span>
        {bad && <span className="step-x">не удалось</span>}
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
      <div className="perm-title">Агент просит разрешение</div>
      <div className="perm-tool">{p.tool}</div>
      {main && <pre className="perm-main">{main}</pre>}
      {details && <pre className="perm-input">{JSON.stringify(p.input, null, 2).slice(0, 3000)}</pre>}
      <div className="row gap6">
        <button className="btn sm primary" onClick={() => actions.decidePermission(p.id, true)}>Разрешить</button>
        <button className="btn sm" onClick={() => actions.decidePermission(p.id, true, true)}>Всегда в этой задаче</button>
        <button className="btn sm ghost" onClick={() => actions.decidePermission(p.id, false)}>Отклонить</button>
        {!details && <button className="link" onClick={() => setDetails(true)}>детали</button>}
      </div>
    </div>
  );
}

// ---------- composer ----------
function Composer({ task }: { task: Task | null }) {
  const draft = useStore((s) => s.chatDraft);
  const agent = useStore((s) => s.agent);
  const agents = useStore((s) => s.agents);
  const ref = useRef<HTMLTextAreaElement>(null);
  const busy = task && (task.status === 'running' || task.status === 'queued');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(220, el.scrollHeight) + 'px';
  }, [draft]);
  useEffect(() => { if (draft) ref.current?.focus(); }, [draft === '']);
  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    if (task) await actions.followUp(task.id, text); else await actions.startTask(text);
    setState({ chatDraft: '' });
  };
  const missing = agents && !agents[agent];
  return (
    <div className="composer">
      {missing && <div className="composer-warn">CLI «{agent}» не найден в PATH</div>}
      <textarea ref={ref} rows={1} value={draft} disabled={!!busy}
        placeholder={busy ? 'Агент работает…' : task ? 'Продолжить…' : 'Опишите, что сделать'}
        onChange={(e) => setState({ chatDraft: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <div className="composer-bar">
        {!task
          ? <div className="seg">{(['claude', 'codex'] as const).map((a) => <button key={a} className={agent === a ? 'on' : ''} onClick={() => setState({ agent: a })}>{a === 'claude' ? 'Claude' : 'Codex'}</button>)}</div>
          : <span className="muted xsmall">{task.agent}</span>}
        {busy
          ? <button className="btn sm" onClick={() => actions.cancelTask(task!.id)}><Icon name="stop" size={10} /> Стоп</button>
          : <button className="send" disabled={!draft.trim()} onClick={send} title="Enter"><Icon name="arrowUp" size={14} /></button>}
      </div>
    </div>
  );
}
