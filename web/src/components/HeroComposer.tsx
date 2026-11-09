import { useEffect, useMemo, useRef, useState } from 'react';
import type { Inspiration } from '../../../shared/types';
import { useStore, api, actions, setState, getState, refresh, time } from '../store';
import { t } from '../i18n';
import { Icon } from './Icon';
import { ModelPicker } from './ModelPicker';

const FORMATS = [
  { key: '16:9', w: 1920, h: 1080, label: '16:9' },
  { key: '9:16', w: 1080, h: 1920, label: '9:16' },
  { key: '1:1', w: 1080, h: 1080, label: '1:1' },
  { key: '4:5', w: 1080, h: 1350, label: '4:5' },
] as const;
const LENGTHS = [0, 15, 30, 60, 120];
const EXAMPLES = [
  'A 30-second product promo for social media',
  'A 1-minute explainer with animated diagrams and subtitles',
  'A podcast intro: 8 seconds, logo and music',
  'A launch video for our app, vertical, with screen recordings',
];

/** a project name whose folder doesn't exist yet ("Promo" → "Promo 2"): the server refuses to create over an existing folder */
export async function uniqueProjectName(name: string): Promise<string> {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item'; // = server/util.ts slug
  try {
    const { projects } = await api<{ projects: string[] }>('GET', '/api/projects');
    const taken = new Set(projects.map((d) => d.split('/').pop()));
    let n = 1, out = name;
    while (taken.has(slug(out)) && n < 100) out = `${name} ${++n}`;
    return out;
  } catch { return name; }
}

type Ref = { key: string; kind: 'file' | 'link' | 'inspiration'; label: string; file?: File; url?: string; insp?: Inspiration };

/**
 * The big "what are we making" composer: idea + format + length + references (files, links, inspiration).
 * mode 'home' creates a new project first; mode 'project' starts in the current (empty) project.
 */
export function HeroComposer({ mode }: { mode: 'home' | 'project' }) {
  const project = useStore((s) => s.project);
  const agent = useStore((s) => s.agent);
  const autopilot = useStore((s) => s.chatAutopilot);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<string>(() => {
    if (mode === 'project' && project) return FORMATS.find((f) => f.w === project.width && f.h === project.height)?.key || '16:9';
    return '16:9';
  });
  const [length, setLength] = useState(0);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [insp, setInsp] = useState<Inspiration[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { api<Inspiration[]>('GET', '/api/inspiration').then(setInsp).catch(() => {}); }, []);
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(260, el.scrollHeight) + 'px'; } }, [text]);
  const picks = useMemo(() => {
    // a varied first row: one per category, then the rest
    const seen = new Set<string>(); const first: Inspiration[] = [], rest: Inspiration[] = [];
    for (const x of insp.filter((y) => y.thumb)) (seen.has(x.category) ? rest : (seen.add(x.category), first)).push(x);
    return [...first, ...rest].slice(0, 18);
  }, [insp]);

  const addFiles = (files: FileList | File[]) => setRefs((r) => [...r, ...Array.from(files).map((f) => ({ key: 'f:' + f.name + f.size, kind: 'file' as const, label: f.name, file: f }))]);
  const addLink = () => {
    const u = link.trim();
    if (!u) return;
    setRefs((r) => [...r, { key: 'l:' + u, kind: 'link', label: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), url: /^https?:/.test(u) ? u : 'https://' + u }]);
    setLink('');
  };
  const toggleInsp = (x: Inspiration) => setRefs((r) => (r.some((y) => y.key === 'i:' + x.id) ? r.filter((y) => y.key !== 'i:' + x.id) : [...r, { key: 'i:' + x.id, kind: 'inspiration', label: x.title, insp: x }]));

  const go = async (prompt = text) => {
    const idea = prompt.trim();
    if (!idea || busy) return;
    setBusy(true);
    try {
      const fmt = FORMATS.find((f) => f.key === format)!;
      if (mode === 'home') {
        const name = idea.replace(/[.!?].*$/s, '').split(/\s+/).slice(0, 6).join(' ').slice(0, 48) || t('New project');
        await api('POST', '/api/projects/create', { name: await uniqueProjectName(name), width: fmt.w, height: fmt.h });
      } else if (project && (project.width !== fmt.w || project.height !== fmt.h)) {
        await api('PATCH', '/api/project', { width: fmt.w, height: fmt.h });
      }
      // references: files → media + reference; links; inspiration
      const files = refs.filter((r) => r.kind === 'file').map((r) => r.file!);
      if (files.length) {
        const infos = await actions.upload(files);
        for (const m of infos) await api('POST', '/api/references', { kind: 'media', ref: m.file, title: m.file });
      }
      for (const r of refs) {
        if (r.kind === 'link') await api('POST', '/api/references', { kind: 'link', ref: r.url, title: r.label });
        if (r.kind === 'inspiration' && r.insp) await api('POST', '/api/references', { kind: 'inspiration', ref: r.insp.id, title: r.insp.title, thumb: `/api/inspiration/${r.insp.id}/thumb` });
      }
      const extra = [
        length ? `Target length: about ${length} s.` : '',
        `Format: ${fmt.label} (${fmt.w}×${fmt.h}).`,
        refs.length ? `References were added to the project (list_references) — study them first and follow them in the project's own style.` : '',
      ].filter(Boolean).join(' ');
      await refresh();
      time.set(0);
      setState({ screen: 'editor', view: 'story', sideTab: 'agent', selectedTaskId: null, chatDraft: '', chatContext: [] } as any);
      // if the task can't start, keep the idea in the chat box instead of losing it
      try { await actions.startTask(`${idea}\n\n${extra}`); } catch { setState({ chatDraft: idea } as any); return; }
      setText(''); setRefs([]);
    } finally { setBusy(false); }
  };

  return (
    <div className={'hero' + (over ? ' over' : '')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
      <div className="hero-box">
        <textarea ref={ta} rows={2} value={text} autoFocus placeholder={t('Describe the video — the agent writes the script first, then makes the graphics, music and edit…')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }}
          onPaste={(e) => { const u = e.clipboardData.getData('text'); if (/^https?:\/\/\S+$/.test(u.trim()) && !text.trim()) { e.preventDefault(); setRefs((r) => [...r, { key: 'l:' + u, kind: 'link', label: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40), url: u.trim() }]); } }} />
        {refs.length > 0 && (
          <div className="hero-refs">
            {refs.map((r) => (
              <span key={r.key} className={'hero-ref kind-' + r.kind}>
                {r.kind === 'inspiration' && r.insp ? <img src={`/api/inspiration/${r.insp.id}/thumb`} alt="" /> : <Icon name={r.kind === 'file' ? 'image' : 'external'} size={12} />}
                <span className="ellipsis">{r.label}</span>
                <button aria-label={t('Remove')} onClick={() => setRefs((x) => x.filter((y) => y.key !== r.key))}><Icon name="x" size={10} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="hero-bar">
          <div className="hero-controls">
          <div className="hero-seg" role="group" aria-label={t('Format')}>
            {FORMATS.map((f) => (
              <button key={f.key} className={format === f.key ? 'on' : ''} onClick={() => setFormat(f.key)} title={`${f.w}×${f.h}`}>
                <span className="hero-ratio" style={{ aspectRatio: `${f.w} / ${f.h}` }} />{f.label}
              </button>
            ))}
          </div>
          <div className="hero-seg" role="group" aria-label={t('Length')}>
            {LENGTHS.map((l) => <button key={l} className={length === l ? 'on' : ''} onClick={() => setLength(l)}>{l ? (l >= 60 ? t('{n} min', { n: l / 60 }) : t('{n} s', { n: l })) : t('Any')}</button>)}
          </div>
          <button className="hero-attach" onClick={() => fileIn.current?.click()} title={t('Attach images or videos as references')}><Icon name="plus" size={13} /> {t('Files')}</button>
          <input ref={fileIn} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <div className="hero-link">
            <Icon name="external" size={12} />
            <input value={link} placeholder={t('Paste a link…')} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }} />
          </div>
          </div>
          <div className="hero-agent">
            <div className="seg">{(['claude', 'codex'] as const).map((a) => <button key={a} className={agent === a ? 'on' : ''} onClick={() => setState({ agent: a })}>{a === 'claude' ? 'Claude' : 'Codex'}</button>)}</div>
            <ModelPicker agent={agent} />
            <button className={'auto-pill' + (autopilot ? ' on' : '')} aria-pressed={autopilot} onClick={() => actions.setAutopilot(!autopilot)} title={autopilot ? t('Autopilot: the agent decides everything itself and explains its choices') : t('The agent may ask you and show drafts to choose a direction — click for autopilot')}>{t('Autopilot')}</button>
          </div>
          <button className="hero-go" disabled={!text.trim() || busy} onClick={() => go()} aria-label={t('Start')}>{busy ? <span className="spinner sm" /> : <Icon name="arrowUp" size={16} />}</button>
        </div>
      </div>
      {!text.trim() && (
        <div className="hero-examples">{EXAMPLES.map((e) => <button key={e} onClick={() => { setText(t(e)); ta.current?.focus(); }}>{t(e)}</button>)}</div>
      )}
      {picks.length > 0 && (
        <div className="hero-insp">
          <div className="hero-insp-head"><Icon name="star" size={13} /> {t('Inspiration — pick what it should feel like')}</div>
          <div className="hero-insp-row">
            {picks.map((x) => {
              const on = refs.some((r) => r.key === 'i:' + x.id);
              return (
                <button key={x.id} className={'hero-insp-tile' + (on ? ' on' : '')} onClick={() => toggleInsp(x)} title={`${x.title} — ${x.by}`}>
                  <img src={`/api/inspiration/${x.id}/thumb`} alt="" loading="lazy" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
                  <span className="hero-insp-name ellipsis">{x.title}</span>
                  {on && <span className="hero-insp-check"><Icon name="check" size={12} /></span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {over && <div className="hero-drop">{t('Drop images or videos — they become references')}</div>}
    </div>
  );
}
void getState;
