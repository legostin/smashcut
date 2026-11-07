import { useEffect, useState } from 'react';
import { useStore, api, time, notify } from '../store';
import { Icon } from './Icon';
import { t } from '../i18n';

const SAMPLE = `[
  { "type": "wait", "ms": 1200 },
  { "type": "hover", "text": "Pricing" },
  { "type": "click", "text": "Pricing" },
  { "type": "scroll", "by": 800, "duration": 2200 },
  { "type": "highlight", "selector": "h1", "ms": 1500 },
  { "type": "type", "selector": "input[type=search]", "text": "agent video studio" }
]`;

/** Record footage of web pages (scripted demo with a cursor) or macOS app windows — lands in media/. */
export function RecordPanel() {
  const [tab, setTab] = useState<'web' | 'app'>('web');
  const jobs = useStore((s) => s.recordJobs);
  const active = jobs.filter((j) => j.status === 'running');
  return (
    <div className="rec">
      <div className="rec-head">
        <span className="strong">{t('Record footage')}</span>
        <div className="seg sm">
          <button className={tab === 'web' ? 'on' : ''} onClick={() => setTab('web')}>{t('Web page')}</button>
          <button className={tab === 'app' ? 'on' : ''} onClick={() => setTab('app')}>{t('App')}</button>
        </div>
      </div>
      {tab === 'web' ? <WebForm /> : <AppForm />}
      {active.map((j) => <div key={j.id} className="rec-job"><span className="spinner sm" /> {j.label} · {t(j.stage)}</div>)}
    </div>
  );
}

function WebForm() {
  const [url, setUrl] = useState('');
  const [device, setDevice] = useState<'auto' | 'desktop' | 'mobile'>('auto');
  const [zoom, setZoom] = useState(1.5);
  const [mode, setMode] = useState<'scroll' | 'load' | 'custom'>('scroll');
  const [seconds, setSeconds] = useState(10);
  const [script, setScript] = useState(SAMPLE);
  const [dark, setDark] = useState(false);
  const [cursor, setCursor] = useState(true);
  const [place, setPlace] = useState(true);
  const go = async () => {
    if (!url.trim()) return;
    let actions: unknown[] | undefined;
    if (mode === 'load') actions = [{ type: 'wait', ms: seconds * 1000 }];
    if (mode === 'custom') { try { actions = JSON.parse(script); } catch { notify('error', t('The script is not valid JSON')); return; } }
    await api('POST', '/api/record/web', { url: url.trim(), seconds, actions, device: device === 'auto' ? undefined : device, zoom, dark, cursor, place: place ? { start: +time.get().toFixed(3) } : undefined });
    notify('info', t('Recording started — the footage will appear in “Media”'));
  };
  return (
    <div className="col gap10">
      <input className="input" placeholder={t('https://… — any page')} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <div className="rec-grid">
        <label className="field"><span>{t('Device')}</span><div className="seg sm">{([['auto', 'Match project'], ['desktop', 'Desktop'], ['mobile', 'Phone']] as const).map(([k, l]) => <button key={k} className={device === k ? 'on' : ''} onClick={() => setDevice(k)}>{t(l)}</button>)}</div></label>
        {device !== 'mobile' && <label className="field"><span>{t('UI scale')}</span><div className="seg sm">{[1, 1.25, 1.5, 2].map((z) => <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>)}</div></label>}
      </div>
      <label className="field"><span>{t('Scenario')}</span>
        <div className="seg sm">{([['scroll', 'Scroll'], ['load', 'Just show'], ['custom', 'Custom (JSON)']] as const).map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{t(l)}</button>)}</div>
      </label>
      {mode !== 'custom'
        ? <label className="slider"><span>{t('Length')}</span><input type="range" min={3} max={60} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /><span className="slider-val">{t('{n} s', { n: seconds })}</span></label>
        : <textarea className="input mono rec-script" rows={8} value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />}
      {mode === 'custom' && <div className="muted xsmall">{t('Steps: wait · scroll (to/by/selector) · click / hover / highlight (selector or text) · type · press · goto · move. The cursor glides to the target by itself and shows the click.')}</div>}
      <div className="row gap12 wrap">
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={cursor} onChange={(e) => setCursor(e.target.checked)} /> {t('Demo cursor')}</label>
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={dark} onChange={(e) => setDark(e.target.checked)} /> {t('Dark theme')}</label>
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={place} onChange={(e) => setPlace(e.target.checked)} /> {t('Straight to the timeline')}</label>
      </div>
      <button className="btn primary" disabled={!url.trim()} onClick={go}><span className="rec-dot" /> {t('Record page')}</button>
    </div>
  );
}

function AppForm() {
  const [apps, setApps] = useState<string[]>([]);
  const [app, setApp] = useState('');
  const [seconds, setSeconds] = useState(8);
  const [padding, setPadding] = useState(0);
  const [script, setScript] = useState('');
  const [place, setPlace] = useState(true);
  const [whole, setWhole] = useState(false);
  useEffect(() => { api<{ apps: string[] }>('GET', '/api/record/apps').then((r) => setApps(r.apps)).catch(() => {}); }, []);
  const go = async () => {
    await api('POST', '/api/record/screen', { app: whole ? undefined : app, seconds, padding, script: script.trim() || undefined, place: place ? { start: +time.get().toFixed(3) } : undefined });
    notify('info', whole ? t('Screen recording ({n} s) started', { n: seconds }) : t('Recording “{app}” for {n} s — the app will come to the front', { app, n: seconds }));
  };
  return (
    <div className="col gap10">
      {!apps.length && <div className="muted small">{t('App recording is available on macOS.')}</div>}
      <div className="row gap8">
        <select className="input grow" value={app} disabled={whole} onChange={(e) => setApp(e.target.value)}>
          <option value="">{t('Choose an app…')}</option>
          {apps.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> {t('Whole screen')}</label>
      </div>
      <label className="slider"><span>{t('Length')}</span><input type="range" min={2} max={120} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /><span className="slider-val">{t('{n} s', { n: seconds })}</span></label>
      {!whole && <label className="slider"><span>{t('Padding around the window')}</span><input type="range" min={0} max={60} step={2} value={padding} onChange={(e) => setPadding(Number(e.target.value))} /><span className="slider-val">{padding}</span></label>}
      <details className="rec-adv"><summary>{t('AppleScript during recording')}</summary>
        <textarea className="input mono rec-script" rows={4} placeholder={t('for example:') + '\nactivate\ndelay 1\ntell application "System Events" to keystroke "123+45="'} value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />
      </details>
      <label className="row gap6 small"><input type="checkbox" className="toggle" checked={place} onChange={(e) => setPlace(e.target.checked)} /> {t('Straight to the timeline')}</label>
      <button className="btn primary" disabled={!whole && !app} onClick={go}><span className="rec-dot" /> {whole ? t('Record screen') : t('Record window')}</button>
      <div className="muted xsmall">{t('The terminal running the editor needs the “Screen Recording” permission (System Settings → Privacy & Security).')}</div>
    </div>
  );
}
