import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Inspiration, GalleryItem } from '../../../shared/types';
import { useStore, setState, getState, actions, time, api, notify, refreshGallery, projectBase, pfile } from '../store';
import { Icon } from './Icon';
import { TransitionsGrid, EffectsGrid, MasksGrid } from './FxLibrary';
import { RecordPanel } from './RecordPanel';
import { TRANSITIONS, EFFECTS, MASKS } from '../../../shared/fx';
import { t } from '../i18n';

const close = () => setState({ libraryOpen: false });

const CATEGORY: Record<string, string> = {
  titles: 'Titles', 'lower-thirds': 'Lower thirds', captions: 'Captions', infographics: 'Infographics', callouts: 'Callouts',
  logos: 'Logos', transitions: 'Graphic transitions', backgrounds: 'Backgrounds', social: 'Social media', product: 'Product & UI', maps: 'Maps',
  audio: 'Podcasts & audio', broadcast: 'News & broadcast', 'text-effects': 'Text effects', '3d': '3D (Three.js)', '3d-kit': '3D studio kits', custom: 'Custom', other: 'Other',
};
const catLabel = (c?: string) => { const k = CATEGORY[c || 'other']; return k ? t(k) : c ? c[0].toUpperCase() + c.slice(1) : t('Other'); };

type Section = { kind: 'graphics'; cat: string } | { kind: 'inspiration'; cat: string } | { kind: 'music' } | { kind: 'mine' } | { kind: 'media' } | { kind: 'project' } | { kind: 'transitions' } | { kind: 'effects' } | { kind: 'masks' };
const same = (a: Section, b: Section) => a.kind === b.kind && (a.kind !== 'graphics' || a.cat === (b as any).cat);

/** Big modal library: categories on the left, a roomy grid of live previews on the right. */
export function Library() {
  const open = useStore((s) => s.libraryOpen);
  const gallery = useStore((s) => s.gallery);
  const [mounted, setMounted] = useState(open);
  const [section, setSection] = useState<Section>({ kind: 'graphics', cat: 'all' });
  const [q, setQ] = useState('');
  const tab = useStore((s) => s.libraryTab);
  // the rail button decides which section opens
  useEffect(() => {
    if (!open) return;
    setSection(tab === 'inspiration' ? { kind: 'inspiration', cat: 'all' } : tab === 'media' ? { kind: 'media' } : tab === 'project' ? { kind: 'transitions' } : { kind: 'graphics', cat: 'all' });
  }, [open, tab]);
  useEffect(() => { if (open) setMounted(true); else { const t = setTimeout(() => setMounted(false), 200); return () => clearTimeout(t); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  const clips = useMemo(() => gallery.filter((g) => g.kind === 'clip'), [gallery]);
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of clips) m.set(g.category || 'other', (m.get(g.category || 'other') || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [clips]);
  const mineCount = gallery.filter((g) => g.origin === 'library').length;
  const [inspo, setInspo] = useState<Inspiration[]>([]);
  useEffect(() => { if (open && !inspo.length) api<Inspiration[]>('GET', '/api/inspiration').then(setInspo).catch(() => {}); }, [open]);
  const musicCount = gallery.filter((g) => g.kind === 'music').length;
  const mediaCount = useStore((s) => s.media.length);
  const projectCount = useStore((s) => s.clips.length + s.music.length);

  if (!mounted) return null;
  const nav = (s: Section, label: string, count?: number, icon?: string) => (
    <button className={'lib-nav-item' + (same(section, s) ? ' on' : '')} onClick={() => { setSection(s); }}>
      {icon && <Icon name={icon} size={14} />}<span className="grow ellipsis">{label}</span>{count != null && <span className="lib-count">{count}</span>}
    </button>
  );
  const searchable = ['inspiration', 'graphics', 'music', 'mine', 'transitions', 'effects'].includes(section.kind);

  return (
    <div className={'modal-back lib-back' + (open ? ' open' : '')} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="lib-modal">
        <nav className="lib-nav">
          <div className="lib-nav-title">{t('Graphics')}</div>
          {nav({ kind: 'inspiration', cat: section.kind === 'inspiration' ? section.cat : 'all' }, t('Inspiration'), inspo.length || undefined, 'star')}
          {nav({ kind: 'graphics', cat: section.kind === 'graphics' ? section.cat : 'all' }, t('Techniques'), clips.length, 'sparkle')}
          <div className="lib-nav-title">{t('Edit')}</div>
          {nav({ kind: 'transitions' }, t('Transitions'), TRANSITIONS.length, 'layers')}
          {nav({ kind: 'effects' }, t('Effects & color'), EFFECTS.length, 'sparkle')}
          {nav({ kind: 'masks' }, t('Masks'), MASKS.length, 'grid')}
          <div className="lib-nav-title">{t('Sound')}</div>
          {nav({ kind: 'music' }, t('Music'), musicCount, 'music')}
          <div className="lib-nav-title">{t('Mine')}</div>
          {nav({ kind: 'mine' }, t('My library'), mineCount, 'book')}
          {nav({ kind: 'project' }, t('In this project'), projectCount, 'layers')}
          {nav({ kind: 'media' }, t('Media files'), mediaCount, 'film')}
        </nav>
        <section className="lib-main">
          <header className="lib-top">
            {searchable
              ? <div className="lib-searchbox"><Icon name="search" size={14} /><input autoFocus placeholder={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
              : <div className="lib-heading">{section.kind === 'media' ? t('Media files') : section.kind === 'masks' ? t('Masks') : t('In this project')}</div>}
            <button className="icon-btn" onClick={close} title={t('Close (Esc)')}><Icon name="x" size={15} /></button>
          </header>
          <div className="lib-scroll">
            {section.kind === 'inspiration' && <InspirationWall items={inspo} cat={section.cat} q={q} onCat={(c) => setSection({ kind: 'inspiration', cat: c })} />}
            {section.kind === 'graphics' && (
              <>
                <div className="wall-cats">
                  <button className={'wall-cat' + (section.cat === 'all' ? ' on' : '')} onClick={() => setSection({ kind: 'graphics', cat: 'all' })}>{t('All')} <span>{clips.length}</span></button>
                  {cats.map(([c, n]) => <button key={c} className={'wall-cat' + (section.cat === c ? ' on' : '')} onClick={() => setSection({ kind: 'graphics', cat: c })}>{catLabel(c)} <span>{n}</span></button>)}
                </div>
                <Wall items={clips.filter((g) => (section.cat === 'all' || (g.category || 'other') === section.cat) && match(g, q))} />
              </>
            )}
            {section.kind === 'mine' && <ClipGrid items={gallery.filter((g) => g.origin === 'library')} q={q} empty={t('Save your best clips and tracks here: the item’s “⋯” menu → “Save to library”.')} />}
            {section.kind === 'music' && <MusicList items={gallery.filter((g) => g.kind === 'music')} q={q} />}
            {section.kind === 'media' && <Media />}
            {section.kind === 'project' && <ProjectAssets />}
            {section.kind === 'transitions' && <TransitionsGrid q={q} />}
            {section.kind === 'effects' && <EffectsGrid q={q} />}
            {section.kind === 'masks' && <MasksGrid />}
          </div>
          <footer className="lib-foot">{['transitions', 'effects', 'masks'].includes(section.kind) ? t('Click — apply to the selected clip · a transition can be dragged onto a clip edge')
            : section.kind === 'inspiration' ? t('Click — add to the project references (bound to the selected scenes) · ↗ opens the original')
            : section.kind === 'graphics' || section.kind === 'mine' ? t('Click — add to the project references (bound to the selected scenes) · + inserts the reference clip at the playhead as a quick draft')
            : section.kind === 'music' ? t('Click — add to the project references (bound to the selected scenes)')
            : t('Click — add at the playhead ({time})', { time: fmt(time.get()) })}</footer>
        </section>
      </div>
    </div>
  );
}
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const addTemplate = async (g: GalleryItem) => { close(); await actions.useTemplate(g, +time.get().toFixed(3)); notify('info', t('“{name}” added to the timeline', { name: g.name })); };
const match = (g: GalleryItem, q: string) => !q || `${g.name} ${g.description} ${g.category} ${(g.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase());

function ClipGrid({ items, q, empty }: { items: GalleryItem[]; q: string; empty?: string }) {
  const list = items.filter((g) => match(g, q));
  if (!list.length) return <div className="lib-empty">{empty || t('Nothing found')}</div>;
  return <div className="lib-grid">{list.map((g, i) => g.kind === 'clip' ? <Card key={g.origin + g.id} g={g} i={i} /> : <MusicRow key={g.origin + g.id} g={g} />)}</div>;
}

/**
 * Techniques, not templates: the agent studies the technique (TECHNIQUE.md + reference code) and makes an original
 * clip in the project's design system — for the selected scenes, or the scene under the playhead.
 */
/** find the cuts of a video: contact sheet in the lightbox + a one-line rhythm summary */
async function analyzeShots(file: string) {
  notify('info', t('Finding the cuts in {file}…', { file }));
  try {
    const r = await api<any>('POST', '/api/toolkit/run', { op: 'detect_shots', params: { video: file }, wait: true });
    const job = r.job || r;
    const o = job.outputs || {};
    const rh = o.shots?.rhythm || {};
    if (o.sheet) setState({ lightbox: pfile(o.sheet) });
    notify('info', t('{n} shots · avg {avg}s · {cpm} cuts/min{beat}', { n: rh.shots, avg: rh.avgShot, cpm: rh.cutsPerMinute, beat: rh.cutsOnBeat ? ' · ' + t('on beat {x}', { x: rh.cutsOnBeat }) : '' }));
  } catch { /* api() already showed the error */ }
}

/** techniques are references: clicking one attaches it to the project (and the selected scenes) */
export function addTechniqueRef(g: GalleryItem) {
  actions.addReference({ kind: g.kind === 'music' ? 'music-technique' : 'technique', ref: g.id, origin: g.origin as any, title: g.name, thumb: g.thumb });
}

export function makeWithTechnique(g: GalleryItem) {
  const st = getState();
  const scenes = st.script.scenes;
  const picked = scenes.map((s, i) => ({ s, n: i + 1 })).filter((x) => st.sceneSelection.includes(x.s.id));
  const now = time.get();
  const at = picked.length ? picked : scenes.map((s, i) => ({ s, n: i + 1 })).filter((x) => now >= x.s.start && now < x.s.start + x.s.duration);
  const where = at.length
    ? `for ${at.map((x) => `scene ${x.n} “${x.s.title}” (id ${x.s.id}, ${x.s.start.toFixed(2)}–${(x.s.start + x.s.duration).toFixed(2)} s)`).join('; ')}`
    : `at the playhead (${now.toFixed(2)} s)`;
  const kind = g.kind === 'music' ? 'music' : 'clip';
  actions.startTask(`Use the ${kind === 'music' ? 'music ' : ''}technique “${g.name}” (get_technique {id: "${g.id}"${kind === 'music' ? ', kind: "music"' : ''}}) to make an ORIGINAL ${kind === 'music' ? 'score' : 'clip'} ${where}, in this project's design system and script copy — learn the technique, don't paste the reference. Place it on the timeline, verify with render_frame, and tell me what you adapted.`);
  setState({ libraryOpen: false, sideTab: 'agent' });
}

function Card({ g, i }: { g: GalleryItem; i: number }) {
  const [hover, setHover] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="lib-card" role="button" tabIndex={0} style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }} onClick={() => addTechniqueRef(g)} onKeyDown={(e) => e.key === 'Enter' && addTechniqueRef(g)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={'lib-thumb' + (loaded ? ' loaded' : '')}>
        <img src={g.thumb} loading="lazy" alt="" onLoad={() => setLoaded(true)} />
        {hover && <Live g={g} />}
        <span className="lib-add"><Icon name="star" size={12} /> {t('Add to references')}</span>
        <button className="lib-insert" title={t('Insert the reference clip as-is (quick draft)')} onClick={(e) => { e.stopPropagation(); addTemplate(g); }}><Icon name="plus" size={12} /></button>
        {g.origin === 'library' && <span className="lib-mine">{t('mine')}</span>}
      </div>
      <div className="lib-card-name">{g.name}</div>
      {g.description && <div className="lib-card-desc">{g.description}</div>}
    </div>
  );
}

/**
 * The technique wall: a bento grid of looping previews (pre-rendered videos), playing while on screen.
 * Every few tiles one is a large feature tile, like a curated feed.
 */
function Wall({ items }: { items: GalleryItem[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [row, setRow] = useState(150);
  const [cols, setCols] = useState(4);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const c = Math.max(2, Math.min(5, Math.floor((w + 10) / 260)));
      setCols(c);
      setRow(Math.round(((w - (c - 1) * 10) / c) * 9 / 16));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!items.length) return <div className="lib-empty">{t('Nothing found')}</div>;
  return (
    <div ref={box} className="wall" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: `${row}px` }}>
      {items.map((g, i) => <Tile key={g.origin + g.id} g={g} i={i} big={cols >= 3 && i % 7 === 0} />)}
    </div>
  );
}

function Tile({ g, i, big }: { g: GalleryItem; i: number; big: boolean }) {
  const isRef = useStore((s) => s.references.some((r) => r.ref === g.id && (r.kind === 'technique' || r.kind === 'music-technique')));
  const ref = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // fetch the preview once visible; while it's being rendered (202) keep the still and retry
  useEffect(() => {
    if (!visible || src) return;
    let stop = false, timer = 0 as any;
    const url = `/api/gallery/preview/${g.origin}/${g.id}`;
    const tryLoad = () => fetch(url, { method: 'HEAD' }).then((r) => { if (stop) return; if (r.status === 200) setSrc(url); else timer = setTimeout(tryLoad, 2500); }).catch(() => { timer = setTimeout(tryLoad, 4000); });
    tryLoad();
    return () => { stop = true; clearTimeout(timer); };
  }, [visible, src, g.origin, g.id]);
  useEffect(() => { const v = video.current; if (!v) return; if (visible) v.play().catch(() => {}); else v.pause(); }, [visible, src]);
  return (
    <div ref={ref} className={'tile' + (big ? ' big' : '') + (playing ? ' playing' : '') + (isRef ? ' isref' : '')} style={{ animationDelay: `${Math.min(i, 16) * 25}ms` }}
      role="button" tabIndex={0} onClick={() => addTechniqueRef(g)} onKeyDown={(e) => e.key === 'Enter' && addTechniqueRef(g)}>
      <img className="tile-still" src={g.thumb} loading="lazy" alt="" />
      {src && <video ref={video} className="tile-video" src={src} muted loop playsInline autoPlay preload="auto" onPlaying={() => setPlaying(true)} />}
      <div className="tile-shade" />
      {g.category && <span className="tile-cat">{catLabel(g.category)}</span>}
      {g.origin === 'library' && <span className="tile-mine">{t('mine')}</span>}
      <div className="tile-info">
        <div className="tile-name">{g.name}</div>
        {g.description && <div className="tile-desc">{g.description}</div>}
      </div>
      <div className="tile-actions">
        {isRef && <span className="tile-ref-on"><Icon name="check" size={12} /> {t('In references')}</span>}
        {!isRef && <span className="tile-cta"><Icon name="star" size={12} /> {t('Add to references')}</span>}
        <button className="tile-insert" title={t('Insert the reference clip as-is (quick draft)')} onClick={(e) => { e.stopPropagation(); addTemplate(g); }}><Icon name="plus" size={13} /></button>
      </div>
    </div>
  );
}

const INSPO_CATS: Record<string, string> = { 'product-launch': 'Product launches', 'ui-motion': 'UI motion', 'kinetic-type': 'Kinetic type', 'brand-identity': 'Brand identity', 'logo-animation': 'Logo animation', explainer: 'Explainers', 'data-viz': 'Data viz', 'social-short': 'Social shorts', '3d-motion': '3D-look motion', transitions: 'Transitions', titles: 'Title sequences', abstract: 'Abstract',
  'retention-edit': 'Retention editing', 'short-form': 'Short-form hooks', 'trend-transitions': 'Trend transitions', documentary: 'Documentary & essays', vlog: 'Vlogs & B-roll', 'music-video': 'Cutting to the beat', 'ad-edit': 'Ads & brand films', storytelling: 'Storytelling structure', 'sound-design': 'Sound-driven edits' };

/** real-world motion pieces (link + our breakdown); click adds one to the project references */
function InspirationWall({ items: all, cat, q, onCat }: { items: Inspiration[]; cat: string; q: string; onCat: (c: string) => void }) {
  // two shelves: motion graphics and editing (viral / effective cutting)
  const [group, setGroup] = useState<'motion' | 'edit'>(() => { try { return localStorage.getItem('inspoGroup') === 'edit' ? 'edit' : 'motion'; } catch { return 'motion'; } });
  const pickGroup = (g: 'motion' | 'edit') => { setGroup(g); onCat('all'); try { localStorage.setItem('inspoGroup', g); } catch {} };
  const counts = useMemo(() => ({ motion: all.filter((x) => (x.group || 'motion') === 'motion').length, edit: all.filter((x) => x.group === 'edit').length }), [all]);
  const items = useMemo(() => all.filter((x) => (x.group || 'motion') === group), [all, group]);
  const cats = useMemo(() => { const m = new Map<string, number>(); for (const x of items) m.set(x.category, (m.get(x.category) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [items]);
  const list = items.filter((x) => (cat === 'all' || x.category === cat) && (!q || `${x.title} ${x.by} ${x.category} ${(x.tags || []).join(' ')} ${(x.techniques || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  if (!items.length) return <div className="lib-empty">{t('The inspiration library is being collected — come back in a few minutes.')}</div>;
  return (
    <>
      {counts.edit > 0 && (
        <div className="inspo-groups seg">
          <button className={group === 'motion' ? 'on' : ''} onClick={() => pickGroup('motion')}>{t('Motion graphics')} <span>{counts.motion}</span></button>
          <button className={group === 'edit' ? 'on' : ''} onClick={() => pickGroup('edit')}>{t('Editing')} <span>{counts.edit}</span></button>
        </div>
      )}
      <div className="wall-cats">
        <button className={'wall-cat' + (cat === 'all' ? ' on' : '')} onClick={() => onCat('all')}>{t('All')} <span>{items.length}</span></button>
        {cats.map(([c, n]) => <button key={c} className={'wall-cat' + (cat === c ? ' on' : '')} onClick={() => onCat(c)}>{t(INSPO_CATS[c] || c)} <span>{n}</span></button>)}
      </div>
      <div className="inspo-wall">{list.map((x, i) => <InspoTile key={x.id} x={x} i={i} />)}</div>
    </>
  );
}

function InspoTile({ x, i }: { x: Inspiration; i: number }) {
  const isRef = useStore((s) => s.references.some((r) => r.kind === 'inspiration' && r.ref === x.id));
  const [ok, setOk] = useState(true);
  const add = () => actions.addReference({ kind: 'inspiration', ref: x.id, title: x.title, thumb: `/api/inspiration/${x.id}/thumb`, note: (x.techniques || []).slice(0, 3).join(', ') });
  return (
    <div className={'inspo' + (isRef ? ' isref' : '')} style={{ animationDelay: `${Math.min(i, 16) * 25}ms` }} role="button" tabIndex={0} onClick={add} onKeyDown={(e) => e.key === 'Enter' && add()}>
      <div className="inspo-img">
        {ok ? <img src={`/api/inspiration/${x.id}/thumb`} alt="" loading="lazy" onError={() => setOk(false)} /> : <div className="inspo-noimg"><Icon name="star" size={20} /></div>}
        <span className="tile-cat">{t(INSPO_CATS[x.category] || x.category)}</span>
        <a className="inspo-open" href={x.url} target="_blank" rel="noreferrer" title={t('Open the original')} onClick={(e) => e.stopPropagation()}><Icon name="external" size={13} /></a>
        <span className={isRef ? 'tile-ref-on' : 'tile-cta'}>{isRef ? <><Icon name="check" size={12} /> {t('In references')}</> : <><Icon name="star" size={12} /> {t('Add to references')}</>}</span>
      </div>
      <div className="inspo-meta">
        <div className="inspo-title ellipsis">{x.title}</div>
        <div className="inspo-by ellipsis">{x.by}{x.year ? ` · ${x.year}` : ''}</div>
        {x.techniques?.length ? <div className="inspo-tech">{x.techniques.slice(0, 3).map((tq) => <span key={tq}>{tq}</span>)}</div> : null}
      </div>
    </div>
  );
}

function Live({ g }: { g: GalleryItem }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0);
  const [ready, setReady] = useState(false);
  const d = g.duration || 5;
  useLayoutEffect(() => { if (box.current) setScale(box.current.clientWidth / 1920); }, []);
  useEffect(() => {
    // reveal only after the clip has painted a real frame (avoids a white flash from the blank iframe)
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data?.__studio || e.data.type !== 'ready') return;
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => setReady(true), 40)));
    };
    window.addEventListener('message', onMsg);
    let t = 0;
    const iv = setInterval(() => { t = (t + 1 / 30) % d; frame.current?.contentWindow?.postMessage({ __studio: true, type: 'seek', t }, '*'); }, 33);
    return () => { clearInterval(iv); window.removeEventListener('message', onMsg); };
  }, [d]);
  const input = encodeURIComponent(JSON.stringify({ width: 1920, height: 1080, fps: 30, duration: d, timing: false }));
  return (
    <div ref={box} className={'lib-live' + (ready ? ' ready' : '')}>
      {scale > 0 && <iframe ref={frame} src={`${g.url}#${input}`} title={g.name} style={{ transform: `scale(${scale})`, visibility: ready ? 'visible' : 'hidden' }} />}
    </div>
  );
}

function MusicList({ items, q }: { items: GalleryItem[]; q: string }) {
  const list = items.filter((g) => match(g, q));
  if (!list.length) return <div className="lib-empty">{t('Nothing found')}</div>;
  return <div className="lib-rows">{list.map((g) => <MusicRow key={g.origin + g.id} g={g} />)}</div>;
}
function MusicRow({ g }: { g: GalleryItem }) {
  return (
    <button className="lib-row" onClick={() => addTechniqueRef(g)} title={t('Add to references')}>
      <span className="lib-row-icon"><Icon name="music" size={16} /></span>
      <span className="grow minw0">
        <span className="lib-row-name">{g.name}{g.origin === 'library' && <span className="lib-mine inline">{t('mine')}</span>}</span>
        <span className="lib-row-desc">{g.description}</span>
      </span>
      <span className="lib-row-add"><Icon name="plus" size={13} /></span>
    </button>
  );
}

function Media() {
  const media = useStore((s) => s.media);
  const [rec, setRec] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (file: string) => { close(); actions.addItem({ kind: 'media', ref: file, start: +time.get().toFixed(3) }); };
  return (
    <>
      <div className="row gap8" style={{ marginBottom: 12 }}>
        <button className={'btn sm' + (rec ? ' primary' : '')} onClick={() => setRec(!rec)}><span className="rec-dot" /> {t('Record footage')}</button>
        <span className="muted xsmall">{t('web pages with a script and cursor, or app windows')}</span>
      </div>
      {rec && <RecordPanel />}
      <button className={'lib-drop' + (over ? ' over' : '')} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) actions.upload(e.dataTransfer.files); }}>
        <Icon name="upload" size={18} />
        <span>{t('Drop video, audio or images')}</span>
        <span className="muted xsmall">{t('or click to choose files')}</span>
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*" onChange={(e) => e.target.files && actions.upload(e.target.files)} />
      </button>
      {media.length > 0 && (
        <div className="lib-grid">
          {media.map((m, i) => (
            <div key={m.file} className="lib-card" style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }} onClick={() => add(m.file)} role="button">
              <div className="lib-thumb loaded">
                {m.thumb ? <img src={`${projectBase()}/${m.thumb}`} alt="" /> : <div className="lib-thumb-icon"><Icon name={m.type === 'audio' ? 'music' : 'film'} size={22} /></div>}
                <span className="lib-add"><Icon name="plus" size={13} /> {t('Add')}</span>
                {m.duration > 0 && m.type !== 'image' && <span className="lib-dur">{fmt(m.duration)}</span>}
                {m.type === 'video' && <button className="lib-insert shots" title={t('Shots & rhythm: find the cuts')} onClick={async (e) => { e.stopPropagation(); await analyzeShots(m.file); }}><Icon name="scissors" size={12} /></button>}
                {m.type !== 'audio' && <button className="lib-insert" title={t('Add to references')} onClick={(e) => { e.stopPropagation(); actions.addReference({ kind: 'media', ref: m.file, title: m.file }); }}><Icon name="star" size={12} /></button>}
              </div>
              <div className="lib-card-name ellipsis">{m.file}</div>
              <div className="lib-card-desc row gap8">
                {m.transcript ? t('has transcript') : (m.type === 'audio' || m.hasAudio) ? <button className="link" onClick={(e) => { e.stopPropagation(); api('POST', `/api/media/${encodeURIComponent(m.file)}/transcribe`, {}); }}>{t('transcribe speech')}</button> : m.type === 'image' ? t('Image') : m.type === 'video' ? t('Video') : m.type}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProjectAssets() {
  const clips = useStore((s) => s.clips);
  const music = useStore((s) => s.music);
  if (!clips.length && !music.length) return <div className="lib-empty">{t('The project has no clips or tracks of its own yet. Ask the agent to make something and they will appear here.')}</div>;
  const add = (kind: 'clip' | 'music', id: string) => { close(); actions.addItem({ kind, ref: id, start: +time.get().toFixed(3) }); };
  const save = async (kind: 'clip' | 'music', id: string, name: string) => { await api('POST', '/api/library', { kind, id, name }); notify('info', t('Saved to “My library”')); refreshGallery(); };
  return (
    <div className="lib-rows">
      {clips.map((c) => (
        <div key={c.id} className="lib-row" role="button" onClick={() => add('clip', c.id)}>
          <span className="lib-row-icon"><Icon name="layers" size={16} /></span>
          <span className="grow minw0"><span className="lib-row-name">{c.name}</span><span className="lib-row-desc">clips/{c.id} · {t('{n} s', { n: c.duration })}</span></span>
          <button className="link" onClick={(e) => { e.stopPropagation(); save('clip', c.id, c.name); }}>{t('to library')}</button>
          <span className="lib-row-add"><Icon name="plus" size={13} /></span>
        </div>
      ))}
      {music.map((m) => (
        <div key={m.id} className="lib-row" role="button" onClick={() => add('music', m.id)}>
          <span className="lib-row-icon"><Icon name="music" size={16} /></span>
          <span className="grow minw0"><span className="lib-row-name">{m.name}</span><span className="lib-row-desc">{m.renderError ? t('render error') : m.meta ? `${m.meta.bpm} BPM · ${t('{n} s', { n: m.meta.duration.toFixed(0) })}` : t('rendering…')}</span></span>
          <button className="link" onClick={(e) => { e.stopPropagation(); save('music', m.id, m.name); }}>{t('to library')}</button>
          <span className="lib-row-add"><Icon name="plus" size={13} /></span>
        </div>
      ))}
    </div>
  );
}
