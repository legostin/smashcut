import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GalleryItem } from '../../../shared/types';
import { useStore, setState, actions, time, api, notify, refreshGallery } from '../store';
import { Icon } from './Icon';

const close = () => setState({ libraryOpen: false });

const CATEGORY: Record<string, string> = {
  titles: 'Титры', 'lower-thirds': 'Плашки', captions: 'Субтитры', infographics: 'Инфографика', callouts: 'Выноски',
  logos: 'Логотипы', transitions: 'Переходы', backgrounds: 'Фоны', social: 'Соцсети', custom: 'Своё', other: 'Другое',
};
const catLabel = (c?: string) => CATEGORY[c || 'other'] || (c ? c[0].toUpperCase() + c.slice(1) : 'Другое');

type Section = { kind: 'graphics'; cat: string } | { kind: 'music' } | { kind: 'mine' } | { kind: 'media' } | { kind: 'project' };
const same = (a: Section, b: Section) => a.kind === b.kind && (a.kind !== 'graphics' || a.cat === (b as any).cat);

/** Big modal library: categories on the left, a roomy grid of live previews on the right. */
export function Library() {
  const open = useStore((s) => s.libraryOpen);
  const gallery = useStore((s) => s.gallery);
  const [mounted, setMounted] = useState(open);
  const [section, setSection] = useState<Section>({ kind: 'graphics', cat: 'all' });
  const [q, setQ] = useState('');
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
  const musicCount = gallery.filter((g) => g.kind === 'music').length;
  const mediaCount = useStore((s) => s.media.length);
  const projectCount = useStore((s) => s.clips.length + s.music.length);

  if (!mounted) return null;
  const nav = (s: Section, label: string, count?: number, icon?: string) => (
    <button className={'lib-nav-item' + (same(section, s) ? ' on' : '')} onClick={() => { setSection(s); }}>
      {icon && <Icon name={icon} size={14} />}<span className="grow ellipsis">{label}</span>{count != null && <span className="lib-count">{count}</span>}
    </button>
  );
  const searchable = section.kind === 'graphics' || section.kind === 'music' || section.kind === 'mine';

  return (
    <div className={'modal-back lib-back' + (open ? ' open' : '')} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="lib-modal">
        <nav className="lib-nav">
          <div className="lib-nav-title">Графика</div>
          {nav({ kind: 'graphics', cat: 'all' }, 'Все шаблоны', clips.length)}
          {cats.map(([c, n]) => <div key={c}>{nav({ kind: 'graphics', cat: c }, catLabel(c), n)}</div>)}
          <div className="lib-nav-title">Звук</div>
          {nav({ kind: 'music' }, 'Музыка', musicCount, 'music')}
          <div className="lib-nav-title">Моё</div>
          {nav({ kind: 'mine' }, 'Моя библиотека', mineCount, 'book')}
          {nav({ kind: 'project' }, 'В этом проекте', projectCount, 'layers')}
          {nav({ kind: 'media' }, 'Медиафайлы', mediaCount, 'film')}
        </nav>
        <section className="lib-main">
          <header className="lib-top">
            {searchable
              ? <div className="lib-searchbox"><Icon name="search" size={14} /><input autoFocus placeholder="Поиск по шаблонам" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              : <div className="lib-heading">{section.kind === 'media' ? 'Медиафайлы' : 'В этом проекте'}</div>}
            <button className="icon-btn" onClick={close} title="Закрыть (Esc)"><Icon name="x" size={15} /></button>
          </header>
          <div className="lib-scroll">
            {section.kind === 'graphics' && <ClipGrid items={clips.filter((g) => section.cat === 'all' || (g.category || 'other') === section.cat)} q={q} />}
            {section.kind === 'mine' && <ClipGrid items={gallery.filter((g) => g.origin === 'library')} q={q} empty="Сохраняйте сюда удачные клипы и треки: меню «⋯» у элемента → «Сохранить в библиотеку»." />}
            {section.kind === 'music' && <MusicList items={gallery.filter((g) => g.kind === 'music')} q={q} />}
            {section.kind === 'media' && <Media />}
            {section.kind === 'project' && <ProjectAssets />}
          </div>
          <footer className="lib-foot">Клик — добавить на плейхед ({fmt(time.get())})</footer>
        </section>
      </div>
    </div>
  );
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const addTemplate = async (g: GalleryItem) => { close(); await actions.useTemplate(g, +time.get().toFixed(3)); notify('info', `«${g.name}» добавлен на таймлайн`); };
const match = (g: GalleryItem, q: string) => !q || `${g.name} ${g.description} ${g.category} ${(g.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase());

function ClipGrid({ items, q, empty }: { items: GalleryItem[]; q: string; empty?: string }) {
  const list = items.filter((g) => match(g, q));
  if (!list.length) return <div className="lib-empty">{empty || 'Ничего не найдено'}</div>;
  return <div className="lib-grid">{list.map((g, i) => g.kind === 'clip' ? <Card key={g.origin + g.id} g={g} i={i} /> : <MusicRow key={g.origin + g.id} g={g} />)}</div>;
}

function Card({ g, i }: { g: GalleryItem; i: number }) {
  const [hover, setHover] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <button className="lib-card" style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }} onClick={() => addTemplate(g)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={'lib-thumb' + (loaded ? ' loaded' : '')}>
        <img src={g.thumb} loading="lazy" alt="" onLoad={() => setLoaded(true)} />
        {hover && <Live g={g} />}
        <span className="lib-add"><Icon name="plus" size={13} /> Добавить</span>
        {g.origin === 'library' && <span className="lib-mine">моё</span>}
      </div>
      <div className="lib-card-name">{g.name}</div>
      {g.description && <div className="lib-card-desc">{g.description}</div>}
    </button>
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
    const onMsg = (e: MessageEvent) => { if (e.source === frame.current?.contentWindow && e.data?.__studio && e.data.type === 'ready') setReady(true); };
    window.addEventListener('message', onMsg);
    let t = 0;
    const iv = setInterval(() => { t = (t + 1 / 30) % d; frame.current?.contentWindow?.postMessage({ __studio: true, type: 'seek', t }, '*'); }, 33);
    return () => { clearInterval(iv); window.removeEventListener('message', onMsg); };
  }, [d]);
  const input = encodeURIComponent(JSON.stringify({ width: 1920, height: 1080, fps: 30, duration: d, timing: false }));
  return (
    <div ref={box} className={'lib-live' + (ready ? ' ready' : '')}>
      {scale > 0 && <iframe ref={frame} src={`${g.url}#${input}`} title={g.name} style={{ transform: `scale(${scale})` }} />}
    </div>
  );
}

function MusicList({ items, q }: { items: GalleryItem[]; q: string }) {
  const list = items.filter((g) => match(g, q));
  if (!list.length) return <div className="lib-empty">Ничего не найдено</div>;
  return <div className="lib-rows">{list.map((g) => <MusicRow key={g.origin + g.id} g={g} />)}</div>;
}
function MusicRow({ g }: { g: GalleryItem }) {
  return (
    <button className="lib-row" onClick={() => addTemplate(g)}>
      <span className="lib-row-icon"><Icon name="music" size={16} /></span>
      <span className="grow minw0">
        <span className="lib-row-name">{g.name}{g.origin === 'library' && <span className="lib-mine inline">моё</span>}</span>
        <span className="lib-row-desc">{g.description}</span>
      </span>
      <span className="lib-row-add"><Icon name="plus" size={13} /></span>
    </button>
  );
}

function Media() {
  const media = useStore((s) => s.media);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (file: string) => { close(); actions.addItem({ kind: 'media', ref: file, start: +time.get().toFixed(3) }); };
  return (
    <>
      <button className={'lib-drop' + (over ? ' over' : '')} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) actions.upload(e.dataTransfer.files); }}>
        <Icon name="upload" size={18} />
        <span>Перетащите видео, аудио или картинки</span>
        <span className="muted xsmall">или нажмите, чтобы выбрать файлы</span>
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*" onChange={(e) => e.target.files && actions.upload(e.target.files)} />
      </button>
      {media.length > 0 && (
        <div className="lib-grid">
          {media.map((m, i) => (
            <div key={m.file} className="lib-card" style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }} onClick={() => add(m.file)} role="button">
              <div className="lib-thumb loaded">
                {m.thumb ? <img src={`/p/${m.thumb}`} alt="" /> : <div className="lib-thumb-icon"><Icon name={m.type === 'audio' ? 'music' : 'film'} size={22} /></div>}
                <span className="lib-add"><Icon name="plus" size={13} /> Добавить</span>
                {m.duration > 0 && m.type !== 'image' && <span className="lib-dur">{fmt(m.duration)}</span>}
              </div>
              <div className="lib-card-name ellipsis">{m.file}</div>
              <div className="lib-card-desc row gap8">
                {m.transcript ? 'есть транскрипт' : (m.type === 'audio' || m.hasAudio) ? <button className="link" onClick={(e) => { e.stopPropagation(); api('POST', `/api/media/${encodeURIComponent(m.file)}/transcribe`, {}); }}>распознать речь</button> : m.type}
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
  if (!clips.length && !music.length) return <div className="lib-empty">В проекте пока нет своих клипов и треков. Попросите агента сделать что-нибудь — они появятся здесь.</div>;
  const add = (kind: 'clip' | 'music', id: string) => { close(); actions.addItem({ kind, ref: id, start: +time.get().toFixed(3) }); };
  const save = async (kind: 'clip' | 'music', id: string, name: string) => { await api('POST', '/api/library', { kind, id, name }); notify('info', 'Сохранено в «Моя библиотека»'); refreshGallery(); };
  return (
    <div className="lib-rows">
      {clips.map((c) => (
        <div key={c.id} className="lib-row" role="button" onClick={() => add('clip', c.id)}>
          <span className="lib-row-icon"><Icon name="layers" size={16} /></span>
          <span className="grow minw0"><span className="lib-row-name">{c.name}</span><span className="lib-row-desc">clips/{c.id} · {c.duration} с</span></span>
          <button className="link" onClick={(e) => { e.stopPropagation(); save('clip', c.id, c.name); }}>в библиотеку</button>
          <span className="lib-row-add"><Icon name="plus" size={13} /></span>
        </div>
      ))}
      {music.map((m) => (
        <div key={m.id} className="lib-row" role="button" onClick={() => add('music', m.id)}>
          <span className="lib-row-icon"><Icon name="music" size={16} /></span>
          <span className="grow minw0"><span className="lib-row-name">{m.name}</span><span className="lib-row-desc">{m.renderError ? 'ошибка рендера' : m.meta ? `${m.meta.bpm} BPM · ${m.meta.duration.toFixed(0)} с` : 'рендерится…'}</span></span>
          <button className="link" onClick={(e) => { e.stopPropagation(); save('music', m.id, m.name); }}>в библиотеку</button>
          <span className="lib-row-add"><Icon name="plus" size={13} /></span>
        </div>
      ))}
    </div>
  );
}
