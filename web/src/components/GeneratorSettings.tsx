// Settings → Generators: API keys of the pay-per-use image/video generators (fal.ai, Runway, Replicate, Higgsfield,
// OpenAI, Google), the local ComfyUI URL, the daily budget, today's spend and default models.
// Keys arrive masked ('••••1234'); a masked value is never sent back as a new key (the server drops it).
import { useEffect, useState } from 'react';
import type { Settings, GenProviderInfo } from '../../../shared/types';
import { api } from '../store';
import { t, fmtNumber } from '../i18n';

type KeyField = 'falKey' | 'runwayKey' | 'replicateKey' | 'higgsfieldKey' | 'openaiKey' | 'googleKey';
const KEYS: { provider: string; field: KeyField; label: string; placeholder: string }[] = [
  { provider: 'fal', field: 'falKey', label: 'fal.ai', placeholder: 'fal.ai API key' },
  { provider: 'runway', field: 'runwayKey', label: 'Runway', placeholder: 'key_…' },
  { provider: 'replicate', field: 'replicateKey', label: 'Replicate', placeholder: 'r8_…' },
  { provider: 'higgsfield', field: 'higgsfieldKey', label: 'Higgsfield', placeholder: 'KEY_ID:KEY_SECRET' },
  { provider: 'openai', field: 'openaiKey', label: 'OpenAI', placeholder: 'sk-…' },
  { provider: 'google', field: 'googleKey', label: 'Google Gemini', placeholder: 'AIza…' },
];

interface Spend { budgetUsd: number; spentUsd: number; remainingUsd: number; count: number }
interface Check { ok: boolean; detail: string; busy?: boolean }
const usd = (n: number) => '$' + fmtNumber(Math.round(n * 100) / 100);

export function GeneratorSettings({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  const [info, setInfo] = useState<{ providers: GenProviderInfo[]; budget: Spend } | null>(null);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const load = () => api<{ providers: GenProviderInfo[]; budget: Spend }>('GET', '/api/generators').then(setInfo).catch(() => {});
  useEffect(() => { load(); }, []);
  const prov = (id: string) => info?.providers.find((p) => p.id === id);

  const check = async (provider: string, field?: KeyField) => {
    setChecks((c) => ({ ...c, [provider]: { ok: false, detail: '', busy: true } }));
    try {
      const body: Record<string, unknown> = { provider };
      if (field) body.key = s[field] || '';
      if (provider === 'comfy' && s.comfyUrl !== undefined) await api('PATCH', '/api/settings', { comfyUrl: s.comfyUrl });
      const r = await api<Check>('POST', '/api/generators/check', body);
      setChecks((c) => ({ ...c, [provider]: r }));
    } catch (e) { setChecks((c) => ({ ...c, [provider]: { ok: false, detail: (e as Error).message } })); }
  };

  const budget = s.genBudgetUsd ?? 10;
  const spend = info?.budget;
  const defaults = s.genDefaults || {};
  const setDefault = (kind: 'image' | 'video', v: string) => {
    const [provider, ...rest] = v.split('|');
    setS({ ...s, genDefaults: { ...defaults, [kind]: provider ? { provider, model: rest.join('|') } : undefined } });
  };
  const options = (kind: 'image' | 'video') => (info?.providers || []).flatMap((p) => p.models.filter((m) => m.kind === kind).map((m) => ({ v: `${p.id}|${m.id}`, label: `${p.title} · ${m.title}`, off: !p.hasKey })));

  return (
    <div className="card col gap10">
      <div className="row between">
        <span className="strong">{t('Generators · images & video shots')}</span>
        {spend && <span className="muted xsmall">{t('Today: {spent} of {budget}', { spent: usd(spend.spentUsd), budget: usd(spend.budgetUsd) })}</span>}
      </div>
      <div className="muted xsmall">{t('Agents can generate photographic stills and video shots with these services. Generation is paid from your own account at each provider (pay per use) — the daily budget below stops agents before they overspend. Costs shown are estimates.')}</div>
      {KEYS.map((k) => {
        const p = prov(k.provider);
        const c = checks[k.provider];
        return (
          <div key={k.field} className="col gap4">
            <div className="row gap6">
              <span className="small" style={{ width: 110, flex: 'none' }}>{k.label}</span>
              <input className="input grow" type="password" autoComplete="off" placeholder={p?.keySource === 'env' ? t('set via environment variable') : k.placeholder}
                value={s[k.field] || ''} onChange={(e) => setS({ ...s, [k.field]: e.target.value })} />
              <button className="btn sm" disabled={c?.busy} onClick={() => check(k.provider, k.field)}>{c?.busy ? <span className="spinner sm" /> : t('Check')}</button>
              <span style={{ width: 14, color: c ? (c.ok ? 'var(--ok)' : 'var(--err)') : 'var(--fg3)' }} title={c?.detail}>{c && !c.busy ? (c.ok ? '✓' : '✗') : ''}</span>
            </div>
            {c && !c.busy && c.detail && <div className={c.ok ? 'muted xsmall' : 'error-box'}>{c.detail}</div>}
            {p && !c && <div className="muted xsmall">{p.models.length ? t('{n} models', { n: p.models.length }) + ' · ' : ''}{p.keyUrl && <a href={p.keyUrl} target="_blank" rel="noreferrer">{t('get a key')}</a>}</div>}
          </div>
        );
      })}
      <div className="col gap4">
        <div className="row gap6">
          <span className="small" style={{ width: 110, flex: 'none' }}>ComfyUI</span>
          <input className="input grow" placeholder="http://127.0.0.1:8188" value={s.comfyUrl || ''} onChange={(e) => setS({ ...s, comfyUrl: e.target.value || undefined })} />
          <button className="btn sm" disabled={checks.comfy?.busy} onClick={() => check('comfy')}>{checks.comfy?.busy ? <span className="spinner sm" /> : t('Check')}</button>
          <span style={{ width: 14, color: checks.comfy?.ok ? 'var(--ok)' : 'var(--err)' }}>{checks.comfy && !checks.comfy.busy ? (checks.comfy.ok ? '✓' : '✗') : ''}</span>
        </div>
        <div className={checks.comfy && !checks.comfy.ok && !checks.comfy.busy ? 'error-box' : 'muted xsmall'}>{checks.comfy?.detail || t('Local and free. Workflows (Export → API format) go into ~/.smashcut/comfy-workflows/ or the project workflows/ folder; use {{prompt}}, {{seed}}, {{image}} placeholders.')}</div>
      </div>
      <div className="grid2">
        <label className="field"><span>{t('Daily budget, USD')}</span>
          <input className="input" type="number" min={0} step={1} value={budget} onChange={(e) => setS({ ...s, genBudgetUsd: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <div className="field"><span>{t('Spent today')}</span>
          <div className="small" style={{ paddingTop: 6 }}>{spend ? t('{spent} · {n} generations · {left} left', { spent: usd(spend.spentUsd), n: spend.count, left: usd(Math.max(0, budget - spend.spentUsd)) }) : '—'}</div>
        </div>
        <label className="field"><span>{t('Default image model')}</span>
          <select className="input" value={defaults.image?.provider ? `${defaults.image.provider}|${defaults.image.model || ''}` : ''} onChange={(e) => setDefault('image', e.target.value)}>
            <option value="">{t('Automatic')}</option>
            {options('image').map((o) => <option key={o.v} value={o.v}>{o.label}{o.off ? ' ' + t('(no key)') : ''}</option>)}
          </select>
        </label>
        <label className="field"><span>{t('Default video model')}</span>
          <select className="input" value={defaults.video?.provider ? `${defaults.video.provider}|${defaults.video.model || ''}` : ''} onChange={(e) => setDefault('video', e.target.value)}>
            <option value="">{t('Automatic')}</option>
            {options('video').map((o) => <option key={o.v} value={o.v}>{o.label}{o.off ? ' ' + t('(no key)') : ''}</option>)}
          </select>
        </label>
      </div>
      <div className="muted xsmall">{t('Keys are stored only locally (~/.smashcut) and are never shown again in full. 0 = paid generation off.')}</div>
    </div>
  );
}
