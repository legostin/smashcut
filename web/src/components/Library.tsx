import { useEffect, useMemo, useRef, useState } from 'react';
import type { GalleryItem } from '../../../shared/types';
import { useStore, setState, actions, time, api, notify, refreshGallery } from '../store';
import { Icon } from './Icon';

const drag = (data: object) => (e: React.DragEvent) => { e.dataTransfer.setData('application/x-studio', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; };
const close = () => setState({ libraryOpen: false });

/** Slide-over library: templates, media, project assets. Click adds at the playhead, or drag onto a track. */
export function Library() {
  const open = useStore((s) => s.libraryOpen);
  const tab = useStore((s) => s.libraryTab);
  const [q, setQ] = useState('');
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); else { const t = setTimeout(() => setMounted(false), 180); return () => clearTimeout(t); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  if (!mounted) return null;
  return (
    <>
      <div className={'scrim' + (open ? '' : ' closing')} onPointerDown={close} />
      <aside className={'library' + (open ? '' : ' closing')}>
        <div className="lib-head">
          <div className="seg">
            {([['templates', 'Шаблоны'], ['media', 'Медиа'], ['project', 'В проекте']] as const).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setState({ libraryTab: k })}>{l}</button>
            ))}
          </div>
          <button className="icon-btn" onClick={close}><Icon name="x" size={14} /></button>
        </div>
        {tab !== 'media' && <input className="lib-search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />}
        <div className="lib-body">
          {tab === 'templates' && <Templates q={q} />}
          {tab === 'media' && <Media />}
          {tab === 'project' && <ProjectAssets q={q} />}
        </div>
        <div className="lib-foot muted xsmall">Клик — добавить на плейхед · перетащите на дорожку</div>
      </aside>
    </>
  );
}

function Templates({ q }: { q: string }) {
  const gallery = useStore((s) => s.gallery);
  const [kind, setKind] = useState<'clip' | 'music'>('clip');
  const list = useMemo(() => gallery.filter((g) => g.kind === kind && (!q || `${g.name} ${g.description} ${g.category} ${g.tags?.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [gallery, kind, q]);
  const add = async (g: GalleryItem) => { await actions.useTemplate(g, +time.get().toFixed(3)); notify('info', `«${g.name}» добавлен`); };
  return (
    <>
      <div className="lib-filter">
        <button className={kind === 'clip' ? 'on' : ''} onClick={() => setKind('clip')}>Графика</button>
        <button className={kind === 'music' ? 'on' : ''} onClick={() => setKind('music')}>Музыка</button>
      </div>
      {kind === 'clip' ? (
        <div className="tpl-grid">
          {list.map((g) => <TemplateCard key={g.origin + g.id} g={g} onAdd={() => add(g)} />)}
        </div>
      ) : (
        <div className="list">
          {list.map((g) => (
            <button key={g.origin + g.id} className="list-row" draggable onDragStart={drag({ type: 'gallery', item: g })} onClick={() => add(g)}>
              <span className="list-icon"><Icon name="music" size={14} /></span>
              <span className="grow minw0"><span className="ellipsis block">{g.name}</span><span className="muted xsmall ellipsis block">{g.description}</span></span>
              {g.origin === 'library' && <span className="tag">моё</span>}
            </button>
          ))}
        </div>
      )}
      {!list.length && <div className="muted small pad">Ничего не найдено</div>}
    </>
  );
}

function TemplateCard({ g, onAdd }: { g: GalleryItem; onAdd: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button className="tpl" draggable onDragStart={drag({ type: 'gallery', item: g })} onClick={onAdd} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={g.description}>
      <div className="tpl-thumb">{hover ? <LivePreview g={g} /> : <img src={g.thumb} loading="lazy" alt="" />}</div>
      <div className="tpl-name ellipsis">{g.name}{g.origin === 'library' && <span className="tag">моё</span>}</div>
    </button>
  );
}

function LivePreview({ g }: { g: GalleryItem }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const d = g.duration || 5;
  useEffect(() => {
    let t = 0;
    const iv = setInterval(() => { t = (t + 1 / 30) % d; ref.current?.contentWindow?.postMessage({ __studio: true, type: 'seek', t }, '*'); }, 33);
    return () => clearInterval(iv);
  }, [d]);
  const input = encodeURIComponent(JSON.stringify({ width: 1920, height: 1080, fps: 30, duration: d, timing: false }));
  return <div className="live"><iframe ref={ref} src={`${g.url}#${input}`} title={g.name} /></div>;
}

function Media() {
  const media = useStore((s) => s.media);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <button className={'drop' + (over ? ' over' : '')} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) actions.upload(e.dataTransfer.files); }}>
        <Icon name="upload" size={16} /> Загрузить видео, аудио или картинки
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*" onChange={(e) => e.target.files && actions.upload(e.target.files)} />
      </button>
      <div className="list">
        {media.map((m) => (
          <div key={m.file} className="list-row" draggable onDragStart={drag({ type: 'media', file: m.file })}>
            <span className="media-thumb" onClick={() => actions.addItem({ kind: 'media', ref: m.file, start: +time.get().toFixed(3) })}>
              {m.thumb ? <img src={`/p/${m.thumb}`} alt="" /> : <Icon name={m.type === 'audio' ? 'music' : 'film'} size={14} />}
            </span>
            <span className="grow minw0" onClick={() => actions.addItem({ kind: 'media', ref: m.file, start: +time.get().toFixed(3) })}>
              <span className="ellipsis block">{m.file}</span>
              <span className="muted xsmall">{m.duration ? m.duration.toFixed(1) + ' s' : m.type}{m.transcript ? ' · есть транскрипт' : ''}</span>
            </span>
            {((m.type === 'video' && m.hasAudio) || m.type === 'audio') && !m.transcript && (
              <button className="link" title="Распознать речь (локальный Whisper)" onClick={() => api('POST', `/api/media/${encodeURIComponent(m.file)}/transcribe`, {})}>текст</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function ProjectAssets({ q }: { q: string }) {
  const clips = useStore((s) => s.clips).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));
  const music = useStore((s) => s.music).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  const row = (key: string, icon: string, title: string, sub: string, data: object, add: () => void, extra?: React.ReactNode) => (
    <div key={key} className="list-row" draggable onDragStart={drag(data)}>
      <span className="list-icon" onClick={add}><Icon name={icon} size={14} /></span>
      <span className="grow minw0" onClick={add}><span className="ellipsis block">{title}</span><span className="muted xsmall ellipsis block">{sub}</span></span>
      {extra}
    </div>
  );
  return (
    <div className="list">
      {clips.map((c) => row(c.id, 'layers', c.name, `${c.duration}s`, { type: 'clip', id: c.id }, () => actions.addItem({ kind: 'clip', ref: c.id, start: +time.get().toFixed(3) }),
        <button className="link" onClick={async () => { await api('POST', '/api/library', { kind: 'clip', id: c.id, name: c.name }); notify('info', 'Сохранено в библиотеку'); refreshGallery(); }}>в библиотеку</button>))}
      {music.map((m) => row(m.id, 'music', m.name, m.renderError ? 'ошибка рендера' : m.meta ? `${m.meta.bpm} BPM · ${m.meta.duration.toFixed(0)} s` : 'рендерится…', { type: 'music', id: m.id }, () => actions.addItem({ kind: 'music', ref: m.id, start: +time.get().toFixed(3) })))}
      {!clips.length && !music.length && <div className="muted small pad">Пока пусто</div>}
    </div>
  );
}
