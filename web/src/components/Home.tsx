import { useEffect, useState } from 'react';
import { api, setState, refresh, time, openInNewTab, useStore } from '../store';
import { t, tn } from '../i18n';
import { Icon } from './Icon';
import { HeroComposer } from './HeroComposer';

interface HomeProject { id: string; dir: string; name: string; width: number; height: number; duration: number; items: number; scenes: { total: number; done: number; review: number }; updatedAt: number; open: boolean; version: string | null; poster: string | null }
interface HomeRender { projectId: string; project: string; file: string; size: number; mtime: number; width: number; height: number; url: string }

/** what's new — newest first (shown on the home screen) */
const NEWS: { title: string; text: string; tag: string }[] = [
  { tag: 'Tracking', title: 'Scene-aware tracking', text: 'Camera motion, planar surfaces and objects — graphics that stick to the world, screen replacement, auto-reframe, blur.' },
  { tag: 'Craft', title: 'Pro craft rules for agents', text: 'Story first, audio as the clock, easing by role, read time, safe areas, seams, sound levels — and a review loop.' },
  { tag: '3D', title: 'Blender 3D in stages', text: 'Scenes as code: mock in seconds → look → final, placed on the timeline and replaced in place.' },
  { tag: 'Library', title: '108 inspiration pieces', text: 'Studios, product launches, code demos and social formats with breakdowns — add them as references.' },
  { tag: 'Edit', title: 'Shots & rhythm', text: 'Find the cuts in any video, split it into shots and match the rhythm of a reference edit.' },
  { tag: 'Voice', title: 'Voice-over as a process', text: 'Speech text with numbers spelled out, stress marks and pauses; takes with a pace check.' },
];

const ago = (ms: number) => {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.round(s / 3600) });
  return new Date(ms).toLocaleDateString();
};
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtSize = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB');

export function Home() {
  const [data, setData] = useState<{ projects: HomeProject[]; renders: HomeRender[] } | null>(null);
  const [all, setAll] = useState(false);
  const connected = useStore((s) => s.connected);
  useEffect(() => { api<any>('GET', '/api/home').then(setData).catch(() => {}); }, [connected]);
  const open = async (p: HomeProject) => {
    await api('POST', '/api/projects/open', { path: p.dir });
    await refresh(); time.set(0);
    setState({ screen: 'editor', selectedItemId: null, selectedTaskId: null, sceneSelection: [] } as any);
  };
  const projects = data?.projects || [];
  const shown = all ? projects : projects.slice(0, 8);
  return (
    <div className="home">
      <header className="home-top">
        <span className="logo" aria-hidden><svg width="16" height="16" viewBox="0 0 24 24"><path d="M4 4h9.5L8 20H4z" fill="currentColor" /><path d="M16 4h4v16h-9.5z" fill="currentColor" transform="translate(1.2 -1.2)" /></svg></span>
        <span className="home-brand">Smashcut</span>
        <div className="grow" />
        <button className="btn sm ghost" onClick={() => setState({ dialog: 'settings' })}><Icon name="gear" size={14} /> {t('Settings')}</button>
      </header>

      <section className="home-hero">
        <h1>{t('What are we making today?')}</h1>
        <p className="muted">{t('Describe it, pick a format, drop references. Your AI crew writes the script, then makes the graphics, music, voice and the edit.')}</p>
        <HeroComposer mode="home" />
      </section>

      {projects.length > 0 && (
        <section className="home-sec">
          <div className="home-sec-head"><h2>{t('Recent projects')}</h2><span className="muted xsmall">{tn(projects.length, '{n} project', '{n} projects')}</span><div className="grow" />{projects.length > 8 && <button className="link" onClick={() => setAll(!all)}>{all ? t('Show less') : t('Show all')}</button>}</div>
          <div className="home-grid">
            {shown.map((p) => (
              <div key={p.id} className="home-card" role="button" tabIndex={0} onClick={() => open(p)} onKeyDown={(e) => e.key === 'Enter' && open(p)}>
                <div className="home-thumb" style={{ aspectRatio: '16 / 9' }}>
                  {p.poster ? <img src={p.poster} alt="" loading="lazy" /> : <div className="home-thumb-empty"><span className="hero-ratio lg" style={{ aspectRatio: `${p.width} / ${p.height}` }} /></div>}
                  <span className="home-badge">{p.width > p.height ? '16:9' : p.width === p.height ? '1:1' : p.height / p.width > 1.5 ? '9:16' : '4:5'}{p.duration ? ` · ${fmtDur(p.duration)}` : ''}</span>
                  {p.open && <span className="home-open-dot" title={t('Open in a tab')} />}
                  <button className="home-newtab" title={t('Open in a new tab')} onClick={(e) => { e.stopPropagation(); openInNewTab(p.id); }}><Icon name="external" size={12} /></button>
                </div>
                <div className="home-card-name ellipsis">{p.name}</div>
                <div className="home-card-meta">
                  <span>{ago(p.updatedAt)}</span>
                  {p.scenes.total > 0 && <span>· {t('{done}/{total} scenes done', { done: p.scenes.done, total: p.scenes.total })}</span>}
                  {p.scenes.review > 0 && <span className="home-review">· {tn(p.scenes.review, '{n} needs review', '{n} need review')}</span>}
                  {p.version && <span>· {p.version}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(data?.renders.length || 0) > 0 && (
        <section className="home-sec">
          <div className="home-sec-head"><h2>{t('Recent renders')}</h2></div>
          <div className="home-renders">
            {data!.renders.slice(0, 10).map((r) => (
              <div key={r.url} className="home-render">
                <div className="home-render-media" style={{ aspectRatio: `${r.width} / ${r.height}` }}>
                  {/\.gif$/i.test(r.file) ? <img src={r.url} alt="" loading="lazy" /> : <video src={r.url + '#t=1'} preload="metadata" muted playsInline onMouseEnter={(e) => e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => { e.currentTarget.pause(); }} />}
                </div>
                <div className="home-card-name ellipsis">{r.project}</div>
                <div className="home-card-meta"><span>{ago(r.mtime)}</span><span>· {fmtSize(r.size)}</span><div className="grow" /><a className="link" href={r.url} download={r.file}>{t('Download')}</a></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="home-sec">
        <div className="home-sec-head"><h2>{t('What’s new')}</h2></div>
        <div className="home-news">
          {NEWS.map((n) => (
            <div key={n.title} className="home-news-item">
              <span className="chip tone-approved">{t(n.tag)}</span>
              <div className="home-news-title">{t(n.title)}</div>
              <div className="muted small">{t(n.text)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
