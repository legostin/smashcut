import { useEffect, useState } from 'react';
import { useStore, api, time, notify } from '../store';
import { Icon } from './Icon';

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
        <span className="strong">Записать футаж</span>
        <div className="seg sm">
          <button className={tab === 'web' ? 'on' : ''} onClick={() => setTab('web')}>Веб-страница</button>
          <button className={tab === 'app' ? 'on' : ''} onClick={() => setTab('app')}>Приложение</button>
        </div>
      </div>
      {tab === 'web' ? <WebForm /> : <AppForm />}
      {active.map((j) => <div key={j.id} className="rec-job"><span className="spinner sm" /> {j.label} · {j.stage}</div>)}
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
    if (mode === 'custom') { try { actions = JSON.parse(script); } catch { notify('error', 'Сценарий — некорректный JSON'); return; } }
    await api('POST', '/api/record/web', { url: url.trim(), seconds, actions, device: device === 'auto' ? undefined : device, zoom, dark, cursor, place: place ? { start: +time.get().toFixed(3) } : undefined });
    notify('info', 'Запись началась — футаж появится в «Медиа»');
  };
  return (
    <div className="col gap10">
      <input className="input" placeholder="https://… — любая страница" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <div className="rec-grid">
        <label className="field"><span>Устройство</span><div className="seg sm">{([['auto', 'Как проект'], ['desktop', 'Десктоп'], ['mobile', 'Телефон']] as const).map(([k, l]) => <button key={k} className={device === k ? 'on' : ''} onClick={() => setDevice(k)}>{l}</button>)}</div></label>
        {device !== 'mobile' && <label className="field"><span>Масштаб интерфейса</span><div className="seg sm">{[1, 1.25, 1.5, 2].map((z) => <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>)}</div></label>}
      </div>
      <label className="field"><span>Сценарий</span>
        <div className="seg sm">{([['scroll', 'Прокрутка'], ['load', 'Просто показать'], ['custom', 'Свой (JSON)']] as const).map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
      </label>
      {mode !== 'custom'
        ? <label className="slider"><span>Длительность</span><input type="range" min={3} max={60} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /><span className="slider-val">{seconds} с</span></label>
        : <textarea className="input mono rec-script" rows={8} value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />}
      {mode === 'custom' && <div className="muted xsmall">Шаги: wait · scroll (to/by/selector) · click / hover / highlight (selector или text) · type · press · goto · move. Курсор сам плавно летит к цели и показывает клик.</div>}
      <div className="row gap12 wrap">
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={cursor} onChange={(e) => setCursor(e.target.checked)} /> Демо-курсор</label>
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Тёмная тема</label>
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={place} onChange={(e) => setPlace(e.target.checked)} /> Сразу на таймлайн</label>
      </div>
      <button className="btn primary" disabled={!url.trim()} onClick={go}><span className="rec-dot" /> Записать страницу</button>
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
    notify('info', whole ? `Запись экрана ${seconds} с началась` : `Запись «${app}» ${seconds} с — приложение выйдет на передний план`);
  };
  return (
    <div className="col gap10">
      {!apps.length && <div className="muted small">Запись приложений доступна на macOS.</div>}
      <div className="row gap8">
        <select className="input grow" value={app} disabled={whole} onChange={(e) => setApp(e.target.value)}>
          <option value="">Выберите приложение…</option>
          {apps.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="row gap6 small"><input type="checkbox" className="toggle" checked={whole} onChange={(e) => setWhole(e.target.checked)} /> Весь экран</label>
      </div>
      <label className="slider"><span>Длительность</span><input type="range" min={2} max={120} step={1} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /><span className="slider-val">{seconds} с</span></label>
      {!whole && <label className="slider"><span>Поля вокруг окна</span><input type="range" min={0} max={60} step={2} value={padding} onChange={(e) => setPadding(Number(e.target.value))} /><span className="slider-val">{padding}</span></label>}
      <details className="rec-adv"><summary>AppleScript во время записи</summary>
        <textarea className="input mono rec-script" rows={4} placeholder={'например:\nactivate\ndelay 1\ntell application "System Events" to keystroke "123+45="'} value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />
      </details>
      <label className="row gap6 small"><input type="checkbox" className="toggle" checked={place} onChange={(e) => setPlace(e.target.checked)} /> Сразу на таймлайн</label>
      <button className="btn primary" disabled={!whole && !app} onClick={go}><span className="rec-dot" /> Записать {whole ? 'экран' : 'окно'}</button>
      <div className="muted xsmall">Нужно разрешение «Запись экрана» для терминала, в котором запущен редактор (Системные настройки → Конфиденциальность и безопасность).</div>
    </div>
  );
}
