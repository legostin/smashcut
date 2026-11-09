import { useEffect, useRef, useState } from 'react';
import type { AgentKind, Task } from '../../../shared/types';
import { useStore, actions } from '../store';
import { Icon } from './Icon';
import { t } from '../i18n';

const CLAUDE_MODELS = [
  { id: '', label: 'Default', hint: 'Settings / your Claude default' },
  { id: 'fable', label: 'Fable', hint: 'the most capable' },
  { id: 'opus', label: 'Opus', hint: 'deep work, best quality' },
  { id: 'sonnet', label: 'Sonnet', hint: 'fast and strong' },
  { id: 'haiku', label: 'Haiku', hint: 'quick, cheap edits' },
];
const EFFORTS = [
  { id: '', label: 'Auto' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
] as const;

/** model + reasoning effort for the chat: a compact pill with a menu (applies to new tasks and the next message) */
export function ModelPicker({ agent, task }: { agent: AgentKind; task?: Task | null }) {
  const model = useStore((s) => s.chatModel[agent] || '');
  const effort = useStore((s) => s.chatEffort);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => { setCustom(agent === 'codex' || !CLAUDE_MODELS.some((m) => m.id === model) ? model : ''); }, [agent, model]);
  const labelOf = (m: string) => (agent === 'claude' ? (CLAUDE_MODELS.find((x) => x.id === m)?.label || m) : m || 'Default');
  const effortOf = (e: string) => EFFORTS.find((x) => x.id === e)?.label || 'Auto';
  const modelLabel = labelOf(model);
  const effortLabel = effortOf(effort);
  // a working agent keeps the model it was started with: say so, and when the new choice applies
  const working = !!task && (task.status === 'running' || task.status === 'queued');
  const pending = working && ((task!.model || '') !== model || (task!.effort || '') !== (effort || ''));
  const nowLabel = working ? `${t(labelOf(task!.model || ''))} · ${t(effortOf(task!.effort || ''))}` : '';
  return (
    <div className="model-pick" ref={box}>
      <button className={'model-pill' + (open ? ' on' : '') + (pending ? ' pending' : '')} onClick={() => setOpen((o) => !o)}
        title={pending ? t('The agent is working on {now} right now. Your choice applies from your next message — or right away with “Restart with this”.', { now: nowLabel }) : t('Model and thinking level for this chat')}>
        <Icon name="sparkle" size={11} /> {t(modelLabel)}<span className="model-sep">·</span>{t(effortLabel)}{pending && <span className="model-next">{t('next message')}</span>}
      </button>
      {open && (
        <div className="model-menu" role="dialog">
          <div className="model-head">{t('Model')}</div>
          {agent === 'claude' && CLAUDE_MODELS.map((m) => (
            <button key={m.id} className={'model-opt' + (model === m.id ? ' on' : '')} onClick={() => actions.setChatModel(agent, m.id)}>
              <span>{t(m.label)}</span><span className="muted xsmall">{t(m.hint)}</span>{model === m.id && <Icon name="check" size={12} />}
            </button>
          ))}
          {agent === 'codex' && (
            <button className={'model-opt' + (!model ? ' on' : '')} onClick={() => actions.setChatModel(agent, '')}>
              <span>{t('Default')}</span><span className="muted xsmall">{t('your Codex config')}</span>{!model && <Icon name="check" size={12} />}
            </button>
          )}
          <div className="model-custom">
            <input value={custom} placeholder={agent === 'claude' ? t('or a full model id…') : t('model id, e.g. from your Codex config…')}
              onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); actions.setChatModel(agent, custom.trim()); } }} />
            <button className="btn xs" disabled={custom.trim() === model} onClick={() => actions.setChatModel(agent, custom.trim())}>{t('Use')}</button>
          </div>
          <div className="model-head">{t('Thinking')}</div>
          <div className="model-seg">
            {EFFORTS.map((e) => <button key={e.id} className={effort === e.id ? 'on' : ''} onClick={() => actions.setChatEffort(e.id)}>{t(e.label)}</button>)}
          </div>
          <div className="model-note muted xsmall">{working
            ? t('The agent is working on {now} right now and keeps it for the current step. A new choice applies from your next message — or right away with “Restart with this” (same session, nothing is lost).', { now: nowLabel })
            : t('Applies to new tasks and to your next message in this one. Sub-agents use the same.')}</div>
        </div>
      )}
    </div>
  );
}
