import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PrompterScene, PrompterToken, VoiceTake } from '../../../shared/types';
import { useStore, setState, api, notify, pfile, projectHeaders, actions } from '../store';
import { Icon } from './Icon';
import { t, tn, fmtNumber } from '../i18n';

/**
 * Teleprompter: the author reads the scene's speech text into the microphone.
 * The highlight walks the words at the chosen pace and (by default) waits while the reader is silent;
 * the take is uploaded, cleaned (voice_polish) and put on the voice-over track for its scene.
 */
type Phase = 'idle' | 'countdown' | 'recording' | 'paused' | 'saving';
type Preset = 'clean' | 'strong' | 'isolate' | 'raw';
const PRESETS: { id: Preset; label: string; options: Record<string, unknown> | false }[] = [
  { id: 'clean', label: 'Clean', options: {} },
  { id: 'strong', label: 'Clean, noisy room', options: { noise: 'strong' } },
  { id: 'isolate', label: 'Voice isolator (ElevenLabs, paid)', options: { noise: 'isolate' } },
  { id: 'raw', label: 'No processing', options: false },
];
const ls = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** more than a slip: over 15% of the script's words (or 3+) were not heard in the take */
const missedMuch = (tk: VoiceTake) => { const miss = (tk.align.total ?? 0) - (tk.align.matched ?? 0); return miss >= 3 || miss > (tk.align.total ?? 0) * 0.15; };
const n1 = (x: number) => fmtNumber(x, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** word start/end on the reading clock (seconds). `withPauses`: punctuation and [pause] gaps are part of the clock */
function schedule(tokens: PrompterToken[], wpm: number, withPauses: boolean) {
  const per = 60 / wpm;
  const starts: number[] = [], ends: number[] = [];
  let at = 0;
  for (const tk of tokens) {
    starts.push(at);
    at += (per * (tk.syl + 0.4)) / 2.7; // an average word (2.3 syllables) takes 60/wpm
    ends.push(at);
    if (withPauses) at += tk.pause;
  }
  return { starts, ends, total: at };
}

export function Teleprompter() {
  const open = useStore((s) => s.prompter);
  const script = useStore((s) => s.script);
  const takesVersion = useStore((s) => s.takesVersion);
  const [scenes, setScenes] = useState<PrompterScene[] | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(open?.sceneId || null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(0);
  const [idx, setIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [wpm, setWpm] = useState(() => Number(ls('tp-wpm', '130')) || 130);
  const [follow, setFollow] = useState(() => ls('tp-follow', '1') === '1');
  const [preset, setPreset] = useState<Preset>(() => (ls('tp-preset', 'clean') as Preset));
  const [breaths, setBreaths] = useState(() => ls('tp-breaths', '0') === '1');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState(() => ls('tp-mic', ''));
  const [micError, setMicError] = useState<string | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [busyTake, setBusyTake] = useState<string | null>(null);

  const scene = useMemo(() => scenes?.find((s) => s.id === sceneId) || scenes?.[0] || null, [scenes, sceneId]);
  const tokens = scene?.tokens || [];
  const plan = useMemo(() => schedule(tokens, wpm, !follow), [tokens, wpm, follow]);

  // live values for the animation loop
  const live = useRef({ phase, plan, follow, idx: 0, pos: 0, last: 0, active: false, activeAt: 0, threshold: -45, noise: [] as number[], startedAt: 0, pausedFor: 0, pausedAt: 0, shown: -1 });
  live.current.phase = phase; live.current.plan = plan; live.current.follow = follow;
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const discard = useRef(false);
  const restart = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const meter = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const wordEls = useRef<(HTMLSpanElement | null)[]>([]);
  const player = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try { const r = await api<{ scenes: PrompterScene[] }>('GET', '/api/voice/prompter'); setScenes(r.scenes); } catch { setScenes([]); }
  }, []);
  useEffect(() => { void load(); }, [load, script, takesVersion]);

  // ---------- microphone ----------
  const openMic = useCallback(async (id: string) => {
    stream.current?.getTracks().forEach((x) => x.stop());
    setMicReady(false);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
      const audio: MediaTrackConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, ...(id ? { deviceId: { exact: id } } : {}) };
      let s: MediaStream;
      try { s = await navigator.mediaDevices.getUserMedia({ audio }); }
      catch (e: any) { if (id && e?.name === 'OverconstrainedError') s = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: undefined } }); else throw e; }
      stream.current = s;
      const ctx = audioCtx.current || new AudioContext();
      audioCtx.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      ctx.createMediaStreamSource(s).connect(an);
      analyser.current = an;
      setMicError(null);
      setMicReady(true);
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'));
    } catch (e: any) {
      setMicError(e?.name === 'NotAllowedError' ? t('The browser blocked the microphone. Allow it for this page and reload.') : e?.name === 'NotFoundError' ? t('No microphone found.') : e?.name === 'InsecureContext' ? t('The browser gives the microphone only to pages on localhost or HTTPS.') : t('The microphone is not available: {error}', { error: String(e?.message || e) }));
    }
  }, []);
  useEffect(() => {
    void openMic(deviceId);
    return () => { stream.current?.getTracks().forEach((x) => x.stop()); void audioCtx.current?.close(); audioCtx.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- the loop: level meter, voice activity, highlight ----------
  useEffect(() => {
    let raf = 0;
    const buf = new Float32Array(2048);
    const tick = (now: number) => {
      const L = live.current;
      const dt = L.last ? Math.min(0.1, (now - L.last) / 1000) : 0;
      L.last = now;
      let level = -100;
      if (analyser.current) {
        analyser.current.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        level = 20 * Math.log10(Math.max(Math.sqrt(s / buf.length), 1e-5));
      }
      if (meter.current) {
        meter.current.style.width = `${Math.max(0, Math.min(100, ((level + 60) / 60) * 100))}%`;
        meter.current.className = 'tp-meter-fill' + (level > -6 ? ' hot' : level > -45 ? ' ok' : '');
      }
      if (L.phase === 'countdown') L.noise.push(level);
      if (level > L.threshold) { L.active = true; L.activeAt = now; } else if (now - L.activeAt > 220) L.active = false;
      if (L.phase === 'recording') {
        const { starts, ends, total } = L.plan;
        if (!L.follow) L.pos = Math.min(total, L.pos + dt);
        else if (L.active) L.pos = Math.min(total, L.pos + dt);
        else if (L.idx < ends.length && L.pos > starts[L.idx] + 0.03) L.pos = Math.min(ends[L.idx], L.pos + dt); // silent: finish the word, then wait at the next one
        let i = L.idx;
        while (i < starts.length - 1 && L.pos >= (L.follow ? ends[i] : starts[i + 1])) i++;
        if (i !== L.idx) { L.idx = i; setIdx(i); }
        const sec = Math.floor((now - L.startedAt - L.pausedFor) / 1000);
        if (sec !== L.shown) { L.shown = sec; setElapsed(sec); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // keep the word being read on the reading line
  useEffect(() => {
    const el = wordEls.current[idx], box = stage.current;
    if (!el || !box) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.36, behavior: phase === 'idle' ? 'auto' : 'smooth' });
  }, [idx, scene?.id, phase]);

  const jump = (i: number) => {
    const L = live.current;
    const k = Math.max(0, Math.min(tokens.length - 1, i));
    L.idx = k; L.pos = L.plan.starts[k] || 0;
    setIdx(k);
  };
  useEffect(() => { jump(0); setElapsed(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scene?.id]);

  // ---------- recording ----------
  const upload = async (blob: Blob, sc: PrompterScene) => {
    setPhase('saving');
    try {
      const p = PRESETS.find((x) => x.id === preset) || PRESETS[0];
      const options = p.options === false ? false : { ...p.options, ...(breaths ? { breaths: true } : {}) };
      const fd = new FormData();
      fd.append('file', blob, /mp4/.test(blob.type) ? 'take.m4a' : 'take.webm');
      const res = await fetch(`/api/voice/take?sceneId=${encodeURIComponent(sc.id)}&options=${encodeURIComponent(JSON.stringify(options))}`, { method: 'POST', headers: projectHeaders(), body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.key ? t(j.key, j.params) : j.error || res.statusText);
      const take = j as VoiceTake;
      if (take.error) notify('error', t('The take is saved without processing: {error}', { error: take.error }));
      notify(take.overflow > 0 ? 'error' : 'info', take.overflow > 0
        ? t('Take saved, but it is {s}s longer than the scene — lengthen the scene or read faster', { s: n1(take.overflow) })
        : t('Take saved on the voice-over track: {s}s', { s: n1(take.duration) }));
      setElapsed(Math.round(take.duration));
      await load();
    } catch (e: any) { notify('error', t('Could not save the take: {error}', { error: String(e?.message || e) })); }
    finally { setPhase('idle'); }
  };

  const start = () => {
    if (!scene || !stream.current || phase !== 'idle') return;
    player.current?.pause(); setPlaying(null);
    const L = live.current;
    L.noise = [];
    jump(0); setElapsed(0);
    setPhase('countdown');
    setCount(3);
    const sc = scene;
    let c = 3;
    const timer = setInterval(() => {
      c--;
      if (live.current.phase !== 'countdown') { clearInterval(timer); return; }
      if (c > 0) { setCount(c); return; }
      clearInterval(timer);
      // the reader was silent during the countdown: that is the room. Speech must clear it by 10 dB.
      const quiet = [...L.noise].sort((a, b) => a - b);
      const room = quiet.length ? quiet[Math.floor(quiet.length * 0.8)] : -60;
      L.threshold = Math.max(-52, Math.min(-18, room + 10));
      L.active = false; L.pos = 0; L.idx = 0; L.startedAt = performance.now(); L.pausedFor = 0; L.shown = -1;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream.current!, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 256000 });
      chunks.current = []; discard.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        if (!discard.current) { void upload(new Blob(chunks.current, { type: rec.mimeType }), sc); return; }
        setPhase('idle');
        if (restart.current) { restart.current = false; setTimeout(() => startRef.current(), 60); }
      };
      rec.start(500);
      recorder.current = rec;
      setPhase('recording');
    }, 800);
  };
  const pauseRec = () => { if (phase !== 'recording') return; recorder.current?.pause(); live.current.pausedAt = performance.now(); setPhase('paused'); };
  const resumeRec = () => { if (phase !== 'paused') return; recorder.current?.resume(); live.current.pausedFor += performance.now() - live.current.pausedAt; setPhase('recording'); };
  const stop = (keep: boolean) => {
    if (phase === 'countdown') { setPhase('idle'); return; }
    if (phase !== 'recording' && phase !== 'paused') return;
    discard.current = !keep;
    recorder.current?.stop();
  };
  const redo = () => { restart.current = true; stop(false); };
  startRef.current = start;
  const close = () => { if (phase === 'recording' || phase === 'paused' || phase === 'countdown') stop(false); player.current?.pause(); setState({ prompter: null }); };
  const go = (d: number) => { if (!scenes || !scene || phase !== 'idle') return; const i = scenes.findIndex((s) => s.id === scene.id) + d; if (scenes[i]) setSceneId(scenes[i].id); };
  const pace = (d: number) => setWpm((w) => { const v = Math.max(60, Math.min(240, w + d)); save('tp-wpm', String(v)); return v; });

  // keyboard
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const el = e.target as HTMLElement;
    // an open list keeps its arrows; a ticked checkbox must not swallow Space (Space = record here)
    if (el.tagName === 'SELECT' && e.key !== 'Escape' && e.code !== 'Space') return;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') el.blur();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.stopPropagation(); // the editor's own hotkeys (play, undo, timeline) stay asleep while the teleprompter is open
    if (e.code === 'Space') { e.preventDefault(); if (phase === 'idle') start(); else if (phase === 'recording') pauseRec(); else if (phase === 'paused') resumeRec(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (phase === 'recording' || phase === 'paused') stop(true); }
    else if (e.key === 'Escape') { e.preventDefault(); if (phase === 'idle' || phase === 'saving') close(); else stop(false); }
    else if (e.key.toLowerCase() === 'r' || e.key.toLowerCase() === 'к') { if (phase === 'recording' || phase === 'paused') redo(); }
    else if (e.key === 'ArrowRight') jump(live.current.idx + 1);
    else if (e.key === 'ArrowLeft') jump(live.current.idx - 1);
    else if (e.key === 'ArrowUp') { e.preventDefault(); pace(5); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); pace(-5); }
    else if (e.key === 'PageDown') go(1);
    else if (e.key === 'PageUp') go(-1);
  };
  useEffect(() => { const k = (e: KeyboardEvent) => keys.current(e); window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, []);

  // ---------- takes ----------
  const listen = (take: VoiceTake) => {
    player.current?.pause();
    if (playing === take.id) { setPlaying(null); return; }
    const a = new Audio(pfile('media/' + encodeURIComponent(take.file)));
    a.onended = () => setPlaying(null);
    void a.play();
    player.current = a;
    setPlaying(take.id);
  };
  const takeAct = async (take: VoiceTake, act: 'use' | 'delete' | 'process') => {
    setBusyTake(take.id);
    try {
      if (act === 'use') await api('POST', `/api/voice/takes/${take.id}/use`);
      else if (act === 'delete') { if (playing === take.id) { player.current?.pause(); setPlaying(null); } await api('DELETE', `/api/voice/takes/${take.id}`); }
      else {
        const p = PRESETS.find((x) => x.id === preset) || PRESETS[0];
        await api('POST', `/api/voice/takes/${take.id}/process`, { options: p.options === false ? false : { ...p.options, ...(breaths ? { breaths: true } : {}) } });
      }
      await load();
    } catch {} finally { setBusyTake(null); }
  };
  const retime = (sc: PrompterScene, take: VoiceTake) => {
    actions.startTask(`The author's recorded voice for scene ${sc.n} "${sc.title}" (id ${sc.id}) is ${take.duration.toFixed(2)} s — ${take.overflow.toFixed(2)} s longer than the scene. Re-time following the studio-author-voice skill: lengthen this scene to fit the take, shift the later scenes and their items (voice-over takes included), keep the recording untouched.`);
    setState({ prompter: null, sideTab: 'agent' });
  };

  const busy = phase !== 'idle';
  const sceneIdx = scenes && scene ? scenes.findIndex((s) => s.id === scene.id) : -1;
  const est = schedule(tokens, wpm, true).total;
  return (
    <div className={'tp phase-' + phase} role="dialog" aria-label={t('Teleprompter')}>
      <header className="tp-top">
        <button className="icon-btn" onClick={close} title={t('Close')} aria-label={t('Close')}><Icon name="x" size={16} /></button>
        <div className="tp-scenes">
          {scenes?.map((s) => (
            <button key={s.id} className={'tp-scene' + (s.id === scene?.id ? ' on' : '') + (s.voiced === 'mic' ? ' mic' : s.voiced === 'tts' ? ' tts' : '')} disabled={busy} onClick={() => setSceneId(s.id)}
              title={`${s.title} · ${s.voiced === 'mic' ? t('your voice') : s.voiced === 'tts' ? t('synthetic voice') : t('no voice yet')}`}>{s.n}</button>
          ))}
        </div>
        {scene && <span className="tp-title ellipsis">{scene.title}</span>}
        <span className="grow" />
        <select className="tp-select" value={preset} disabled={busy} onChange={(e) => { setPreset(e.target.value as Preset); save('tp-preset', e.target.value); }} title={t('Processing of the take')} aria-label={t('Processing of the take')}>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
        </select>
        {preset !== 'raw' && <label className="tp-check" title={t('Turns breaths between phrases down; can soften quiet word endings')}><input type="checkbox" checked={breaths} disabled={busy} onChange={(e) => { setBreaths(e.target.checked); save('tp-breaths', e.target.checked ? '1' : '0'); }} /> {t('Breaths')}</label>}
        {devices.length > 1 && (
          <select className="tp-select" value={deviceId} disabled={busy} onChange={(e) => { setDeviceId(e.target.value); save('tp-mic', e.target.value); void openMic(e.target.value); }} title={t('Microphone')} aria-label={t('Microphone')}>
            <option value="">{t('Default microphone')}</option>
            {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('Microphone')}</option>)}
          </select>
        )}
      </header>

      <div className="tp-stage" ref={stage}>
        {scenes && !scenes.length && <div className="tp-empty">{t('No narration text yet — write the script first.')}</div>}
        {scene && (
          <p className="tp-text">
            {tokens.map((tk, i) => (
              <span key={i}>
                <span ref={(el) => { wordEls.current[i] = el; }} className={'tp-word' + (i < idx ? ' past' : i === idx ? ' now' : '')} onClick={() => !busy && jump(i)}>{tk.text}</span>
                {tk.mark && <span className="tp-pause" title={t('Pause {s}s', { s: n1(tk.pause) })}>‖</span>}{' '}
              </span>
            ))}
          </p>
        )}
        {phase === 'countdown' && <div className="tp-count" key={count}>{count}</div>}
        {phase === 'saving' && <div className="tp-saving"><span className="spinner" /> {t('Processing the take…')}</div>}
        {micError && <div className="tp-error">{micError}</div>}
      </div>

      {scene && scene.takes.length > 0 && phase === 'idle' && (
        <div className="tp-takes">
          {scene.takes.map((tk, i) => (
            <div key={tk.id} className={'tp-take' + (tk.active ? ' on' : '')}>
              <button className="icon-btn sm" onClick={() => listen(tk)} title={t('Listen')} aria-label={t('Listen')}><Icon name={playing === tk.id ? 'pause' : 'play'} size={11} /></button>
              <span className="tp-take-name">{t('Take {n}', { n: i + 1 })}</span>
              <span className="mono">{n1(tk.duration)} {t('s')}</span>
              {tk.report && <span className="mono tp-fact" title={t('Loudness before → after processing, LUFS. Noise floor: {a} → {b} dB', { a: n1(tk.report.before.noiseFloor), b: n1(tk.report.after.noiseFloor) })}>{n1(tk.report.before.lufs)} → {n1(tk.report.after.lufs)} LUFS</span>}
              {tk.error && <span className="tp-fact warn" title={tk.error}>{t('not processed')}</span>}
              {tk.align.status === 'aligning' && <span className="tp-fact"><span className="spinner sm" /> {t('matching words')}</span>}
              {tk.align.status === 'aligned' && <span className={'tp-fact' + (missedMuch(tk) ? ' warn' : (tk.align.matched ?? 0) === (tk.align.total ?? 0) ? ' ok' : '')} title={tk.align.missed?.length ? t('Not heard: {words}', { words: tk.align.missed.join(', ') }) : t('Every word of the script was heard')}>{tk.align.matched}/{tk.align.total} {t('words')}</span>}
              {tk.align.status === 'failed' && <span className="tp-fact warn" title={tk.align.error}>{t('word timing: estimate')}</span>}
              {tk.wpm && <button className="tp-fact link" onClick={() => { setWpm(tk.wpm!); save('tp-wpm', String(tk.wpm)); }} title={t('Your reading pace in this take. Click to set the teleprompter to it')}>{tk.wpm} {t('wpm')}</button>}
              {tk.overflow > 0 && <button className="tp-fact warn link" onClick={() => retime(scene, tk)} title={t('The take is longer than the scene. Click: the agent re-times the scenes to fit it')}>+{n1(tk.overflow)} {t('s')}</button>}
              <span className="grow" />
              {busyTake === tk.id ? <span className="spinner sm" /> : <>
                {tk.active ? <span className="tp-fact ok">{t('on the timeline')}</span> : <button className="link" onClick={() => takeAct(tk, 'use')}>{t('Use')}</button>}
                <button className="icon-btn sm" onClick={() => takeAct(tk, 'process')} title={t('Process again with the current settings')} aria-label={t('Process again with the current settings')}><Icon name="wand" size={12} /></button>
                <button className="icon-btn sm" onClick={() => takeAct(tk, 'delete')} title={t('Delete take')} aria-label={t('Delete take')}><Icon name="trash" size={12} /></button>
              </>}
            </div>
          ))}
        </div>
      )}

      <footer className="tp-bar">
        <div className="tp-meter" title={t('Microphone level')}><div ref={meter} className="tp-meter-fill" /></div>
        <span className="tp-time mono">{mmss(elapsed)} <span className="muted">/ {mmss(scene?.duration || 0)}</span></span>
        <span className="grow" />
        <div className="tp-main">
          {phase === 'idle' && <button className="tp-rec" disabled={!micReady || !scene} onClick={start}><span className="tp-dot" /> {scene?.takes.length ? t('Record again') : t('Record')}</button>}
          {phase === 'countdown' && <button className="btn" onClick={() => stop(false)}>{t('Cancel')}</button>}
          {(phase === 'recording' || phase === 'paused') && <>
            <button className="btn" onClick={redo} title="R"><Icon name="refresh" size={13} /> {t('Start over')}</button>
            <button className="btn" onClick={phase === 'recording' ? pauseRec : resumeRec}><Icon name={phase === 'recording' ? 'pause' : 'play'} size={12} /> {phase === 'recording' ? t('Pause') : t('Continue')}</button>
            <button className="btn accent" onClick={() => stop(true)}><Icon name="check" size={14} /> {t('Done')}</button>
          </>}
          {phase === 'idle' && scene && scene.takes.length > 0 && sceneIdx < (scenes?.length || 0) - 1 && <button className="btn" onClick={() => go(1)}>{t('Next scene')} →</button>}
        </div>
        <span className="grow" />
        <label className="tp-check" title={t('The highlight waits while you are silent and moves on when you speak')}><input type="checkbox" checked={follow} disabled={busy} onChange={(e) => { setFollow(e.target.checked); save('tp-follow', e.target.checked ? '1' : '0'); }} /> {t('Wait for my voice')}</label>
        <div className="tp-pace" title={t('Reading pace, words per minute (↑ ↓). This text takes about {s} s', { s: Math.round(est) })}>
          <button className="icon-btn sm" onClick={() => pace(-5)} aria-label={t('Slower')}>−</button>
          <span className="mono">{wpm}</span>
          <button className="icon-btn sm" onClick={() => pace(5)} aria-label={t('Faster')}>+</button>
        </div>
      </footer>
      <div className="tp-keys">{phase === 'idle' ? t('Space — record · ← → word · ↑ ↓ pace · Esc — close') : t('Space — pause · Enter — done · R — start over · Esc — cancel')}{scenes && scenes.length > 1 && phase === 'idle' ? ' · ' + tn(scenes.filter((s) => s.voiced === 'mic').length, '{n} of {total} scene recorded', '{n} of {total} scenes recorded', { total: scenes.length }) : ''}</div>
    </div>
  );
}
