import { useEffect, useMemo, useState } from 'react';
import { useStore, api, setState, refresh, time } from '../store';
import { t } from '../i18n';
import { Icon } from './Icon';

interface Variant { dir: string; name: string; label?: string; width: number; height: number; current?: boolean }

const FORMATS = [
  { key: 'keep', label: 'Keep format', w: 0, h: 0 },
  { key: '9:16', label: '9:16 Vertical', w: 1080, h: 1920 },
  { key: '1:1', label: '1:1 Square', w: 1080, h: 1080 },
  { key: '4:5', label: '4:5 Feed', w: 1080, h: 1350 },
  { key: '16:9', label: '16:9 Wide', w: 1920, h: 1080 },
] as const;
const LANGUAGES = ['English', 'Russian', 'Spanish', 'German', 'French', 'Portuguese', 'Chinese', 'Japanese', 'Italian', 'Turkish', 'Korean', 'Arabic', 'Hindi'];
const LENGTHS = [0, 6, 15, 30, 60];

/** "New version": a derived project (format / language / length) the agent adapts from the parent. */
export function VersionDialog() {
  const project = useStore((s) => s.project)!;
  const agent = useStore((s) => s.agent);
  const [family, setFamily] = useState<Variant[]>([]);
  const [format, setFormat] = useState<string>('keep');
  const [language, setLanguage] = useState('');
  const [length, setLength] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [label, setLabel] = useState('');
  const [labelTouched, setLabelTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Variant[]>('GET', '/api/variants').then(setFamily).catch(() => {}); }, []);

  const auto = useMemo(() => {
    const parts: string[] = [];
    if (format !== 'keep') parts.push(format);
    if (language) parts.push(language);
    if (length) parts.push(`${length}s`);
    return parts.join(' · ') || t('Version {n}', { n: family.length + 1 });
  }, [format, language, length, family.length]);
  useEffect(() => { if (!labelTouched) setLabel(auto); }, [auto, labelTouched]);

  const fmt = FORMATS.find((f) => f.key === format)!;
  const nothing = format === 'keep' && !language && !length && !prompt.trim();
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ dir: string; task: { id: string } }>('POST', '/api/variants', {
        label: label.trim() || auto, prompt, agent,
        width: fmt.w || undefined, height: fmt.h || undefined, language: language || undefined, duration: length || undefined,
      });
      await refresh();
      time.set(0);
      setState({ dialog: null, selectedItemId: null, selectedTaskId: r.task.id, sideTab: 'agent' });
    } finally { setBusy(false); }
  };
  const open = async (dir: string) => { await api('POST', '/api/projects/open', { path: dir }); await refresh(); time.set(0); setState({ dialog: null, selectedItemId: null, selectedTaskId: null }); };

  return (
    <div className="col gap16">
      <div className="col gap4">
        <h2>{t('New version')}</h2>
        <div className="muted small">{t('A copy that inherits the script, design system, clips and music. The agent then adapts it to the new conditions.')}</div>
      </div>

      {family.length > 1 && (
        <div className="col gap4">
          <div className="section-title">{t('Versions of this video')}</div>
          <div className="ver-family">
            {family.map((v) => (
              <button key={v.dir} className={'ver-chip' + (v.current ? ' on' : '')} onClick={() => !v.current && open(v.dir)} title={v.dir}>
                <span className="ver-ratio" style={{ aspectRatio: `${v.width} / ${v.height}` }} />{v.label === 'Original' ? t('Original') : v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="field"><span>{t('Format')}</span>
        <div className="ver-formats">
          {FORMATS.map((f) => (
            <button key={f.key} className={'ver-format' + (format === f.key ? ' on' : '')} onClick={() => setFormat(f.key)}>
              {f.w ? <span className="ver-ratio lg" style={{ aspectRatio: `${f.w} / ${f.h}` }} /> : <Icon name="check" size={14} />}
              <span>{t(f.label)}</span>
            </button>
          ))}
        </div>
      </label>

      <div className="grid2">
        <label className="field"><span>{t('Language')}</span>
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">{t('Keep language')}</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{t(l)}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('Length')}</span>
          <div className="seg">{LENGTHS.map((s) => <button key={s} className={length === s ? 'on' : ''} onClick={() => setLength(s)}>{s ? `${s}s` : t('Keep')}</button>)}</div>
        </label>
      </div>

      <label className="field"><span>{t('What else should change?')}</span>
        <textarea className="input" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('e.g. punchier hook for TikTok, bigger captions, end with the website instead of the logo')} />
      </label>

      <label className="field"><span>{t('Version name')}</span>
        <input className="input" value={label} onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }} />
      </label>

      <div className="row between">
        <span className="muted xsmall">{project.width}×{project.height}{fmt.w ? ` → ${fmt.w}×${fmt.h}` : ''}</span>
        <div className="row gap8">
          <button className="btn ghost sm" onClick={() => setState({ dialog: null })}>{t('Cancel')}</button>
          <button className="btn primary sm" disabled={busy || nothing} onClick={create}>{busy ? <span className="spinner sm" /> : <Icon name="sparkle" size={12} />} {t('Create version')}</button>
        </div>
      </div>
    </div>
  );
}
