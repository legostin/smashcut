import { useMemo, useRef, useState } from 'react';
import type { GalleryItem } from '../../../shared/types';
import { useStore, setState, actions, time, api, refreshGallery, notify } from '../store';
import { Icon } from './Icon';

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  const tabs: [typeof tab, string][] = [['gallery', 'Галерея'], ['project', 'Проект'], ['media', 'Медиа'], ['skills', 'Скиллы']];
  return (
    <div className="panel left">
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setState({ leftTab: k })}>{l}</button>)}
      </div>
      <div className="panel-body">
        {tab === 'gallery' && <Gallery />}
        {tab === 'project' && <ProjectAssets />}
        {tab === 'media' && <MediaBin />}
        {tab === 'skills' && <Skills />}
      </div>
    </div>
  );
}

const drag = (data: object) => (e: React.DragEvent) => { e.dataTransfer.setData('application/x-studio', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; };

function Gallery() {
  const gallery = useStore((s) => s.gallery);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [hover, setHover] = useState<string | null>(null);
  const cats = useMemo(() => ['all', ...new Set(gallery.map((g) => (g.kind === 'music' ? 'music' : g.category || 'other')))], [gallery]);
  const list = gallery.filter((g) => (cat === 'all' || (g.kind === 'music' ? 'music' : g.category) === cat) && (!q || `${g.name} ${g.description} ${g.tags?.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="col gap8">
      <div className="row gap6">
        <input className="input grow" placeholder="Поиск шаблонов…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="icon-btn" title="Обновить" onClick={() => refreshGallery()}><Icon name="refresh" /></button>
      </div>
      <div className="chips">{cats.map((c) => <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c === 'all' ? 'все' : c}</button>)}</div>
      <div className="gallery-grid">
        {list.map((g) => (
          <div key={g.origin + g.kind + g.id} className="g-card" draggable onDragStart={drag({ type: 'gallery', item: g })}
            onMouseEnter={() => setHover(g.origin + g.id)} onMouseLeave={() => setHover(null)}>
            <div className="g-thumb">
              {g.kind === 'clip'
                ? (hover === g.origin + g.id ? <GalleryPreview g={g} /> : <img src={g.thumb} loading="lazy" alt="" />)
                : <div className="g-music"><Icon name="music" size={28} /></div>}
              {g.origin === 'library' && <span className="badge lib">моё</span>}
            </div>
            <div className="g-meta">
              <div className="g-name ellipsis">{g.name}</div>
              <div className="g-desc">{g.description}</div>
              <div className="row gap6 g-actions">
                <button className="btn xs" onClick={() => actions.useTemplate(g, +time.get().toFixed(3))}><Icon name="plus" size={12} /> На таймлайн</button>
                <button className="btn xs ghost" title="Попросить агента сделать на основе этого шаблона" onClick={() => setState({ rightTab: 'agent', chatDraft: `Возьми шаблон «${g.name}» (${g.origin}/${g.kind}/${g.id}) как основу и сделай вариант под наш проект: ` })}><Icon name="wand" size={12} /></button>
                {g.origin === 'library' && <button className="btn xs ghost" title="Удалить из библиотеки" onClick={async () => { await api('DELETE', `/api/library/${g.kind}/${g.id}`); refreshGallery(); }}><Icon name="trash" size={12} /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">Перетащите шаблон на дорожку или нажмите «На таймлайн» — он скопируется в проект, параметры правятся в инспекторе. Свои клипы сохраняйте в библиотеку из вкладки «Проект».</p>
    </div>
  );
}

function GalleryPreview({ g }: { g: GalleryItem }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const d = g.duration || 5;
  const input = encodeURIComponent(JSON.stringify({ width: 1920, height: 1080, fps: 30, duration: d, timing: false }));
  return (
    <div className="g-live">
      <iframe ref={ref} src={`${g.url}#${input}`} title={g.name}
        onLoad={() => {
          let t = 0;
          const iv = setInterval(() => {
            if (!ref.current) return clearInterval(iv);
            t = (t + 1 / 30) % d;
            ref.current.contentWindow?.postMessage({ __studio: true, type: 'seek', t }, '*');
          }, 33);
          ref.current!.dataset.iv = String(iv);
        }} />
    </div>
  );
}

function ProjectAssets() {
  const clips = useStore((s) => s.clips);
  const music = useStore((s) => s.music);
  const items = useStore((s) => s.project?.items || []);
  const [newName, setNewName] = useState('');
  const create = (kind: 'clip' | 'music') => {
    const what = newName.trim();
    if (!what) { notify('error', 'Опишите, что сделать'); return; }
    actions.startTask(kind === 'clip'
      ? `Создай новый клип моушн-графики: ${what}. Создай пакет через create_clip, напиши анимацию, проверь рендером, добавь на таймлайн на плейхед.`
      : `Напиши новый музыкальный трек кодом: ${what}. Создай через create_music, проверь render_music (громкость, секции), добавь на музыкальную дорожку с 0.`);
    setNewName('');
  };
  return (
    <div className="col gap12">
      <div className="card col gap6">
        <div className="small strong">Создать с агентом</div>
        <textarea className="input" rows={3} placeholder="Например: заставка в стиле швейцарского дизайна с названием «Q3 итоги», 5 секунд" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <div className="row gap6">
          <button className="btn sm primary grow" onClick={() => create('clip')}><Icon name="sparkle" size={12} /> Клип</button>
          <button className="btn sm grow" onClick={() => create('music')}><Icon name="music" size={12} /> Музыка</button>
        </div>
      </div>
      <div className="section-title">Клипы ({clips.length})</div>
      {clips.map((c) => {
        const used = items.filter((i) => i.kind === 'clip' && i.ref === c.id).length;
        return (
          <div key={c.id} className="asset-row" draggable onDragStart={drag({ type: 'clip', id: c.id })}>
            <span className="tl-kind kind-graphics" />
            <div className="grow minw0">
              <div className="ellipsis strong small">{c.name}</div>
              <div className="muted xsmall ellipsis">clips/{c.id} · {c.duration}s{used ? ` · ${used}× на таймлайне` : ''}</div>
            </div>
            <button className="icon-btn xs" title="На таймлайн" onClick={() => actions.addItem({ kind: 'clip', ref: c.id, start: +time.get().toFixed(3) })}><Icon name="plus" size={13} /></button>
            <button className="icon-btn xs" title="Сохранить в мою библиотеку" onClick={async () => { await api('POST', '/api/library', { kind: 'clip', id: c.id, name: c.name }); notify('info', 'Сохранено в библиотеку'); refreshGallery(); }}><Icon name="book" size={13} /></button>
            <button className="icon-btn xs" title="Дублировать" onClick={() => api('POST', `/api/clips/${c.id}/duplicate`)}><Icon name="copy" size={13} /></button>
            <button className="icon-btn xs" title="Удалить клип" onClick={() => { if (confirm(`Удалить клип ${c.id} и его элементы на таймлайне?`)) api('DELETE', `/api/clips/${c.id}`); }}><Icon name="trash" size={13} /></button>
          </div>
        );
      })}
      <div className="section-title">Музыка ({music.length})</div>
      {music.map((m) => (
        <div key={m.id} className="asset-row" draggable onDragStart={drag({ type: 'music', id: m.id })}>
          <span className="tl-kind kind-music" />
          <div className="grow minw0">
            <div className="ellipsis strong small">{m.name}</div>
            <div className={'xsmall ellipsis ' + (m.renderError ? 'red' : 'muted')}>{m.renderError ? '⚠ ' + m.renderError.slice(0, 120) : m.meta ? `${m.meta.bpm} BPM · ${m.meta.bars} тактов · ${m.meta.duration.toFixed(1)}s` : 'рендерится…'}</div>
          </div>
          <button className="icon-btn xs" title="На таймлайн" onClick={() => actions.addItem({ kind: 'music', ref: m.id, start: +time.get().toFixed(3) })}><Icon name="plus" size={13} /></button>
          <button className="icon-btn xs" title="Перерендерить" onClick={() => api('POST', `/api/music/${m.id}/render`)}><Icon name="refresh" size={13} /></button>
          <button className="icon-btn xs" title="Сохранить в библиотеку" onClick={async () => { await api('POST', '/api/library', { kind: 'music', id: m.id, name: m.name }); notify('info', 'Сохранено в библиотеку'); refreshGallery(); }}><Icon name="book" size={13} /></button>
          <button className="icon-btn xs" title="Удалить" onClick={() => { if (confirm(`Удалить музыку ${m.id}?`)) api('DELETE', `/api/music/${m.id}`); }}><Icon name="trash" size={13} /></button>
        </div>
      ))}
    </div>
  );
}

function MediaBin() {
  const media = useStore((s) => s.media);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="col gap8">
      <div className={'dropzone' + (over ? ' over' : '')} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) actions.upload(e.dataTransfer.files); }}>
        <Icon name="upload" size={20} />
        <div className="small">Перетащите видео, аудио, картинки<br /><span className="muted">или нажмите, чтобы выбрать</span></div>
        <input ref={input} type="file" multiple hidden accept="video/*,audio/*,image/*" onChange={(e) => e.target.files && actions.upload(e.target.files)} />
      </div>
      {media.map((m) => (
        <div key={m.file} className="media-row" draggable onDragStart={drag({ type: 'media', file: m.file })}>
          <div className="media-thumb">{m.thumb ? <img src={`/p/${m.thumb}`} alt="" /> : <Icon name={m.type === 'audio' ? 'music' : 'film'} size={20} />}</div>
          <div className="grow minw0">
            <div className="ellipsis small strong">{m.file}</div>
            <div className="muted xsmall">{m.type} · {m.duration ? m.duration.toFixed(1) + 's' : ''}{m.width ? ` · ${m.width}×${m.height}` : ''}{m.transcript ? ' · 📝 транскрипт' : ''}</div>
            <div className="row gap4" style={{ marginTop: 4 }}>
              <button className="btn xs" onClick={() => actions.addItem({ kind: 'media', ref: m.file, start: +time.get().toFixed(3) })}><Icon name="plus" size={11} /> Добавить</button>
              {(m.type === 'video' && m.hasAudio || m.type === 'audio') && !m.transcript && <button className="btn xs ghost" title="Распознать речь с таймкодами слов (локальный Whisper)" onClick={() => api('POST', `/api/media/${encodeURIComponent(m.file)}/transcribe`, {})}>Транскрипт</button>}
              {m.type === 'audio' && <button className="btn xs ghost" title="Темп, биты, акценты" onClick={async () => { const a = await api('POST', `/api/media/${encodeURIComponent(m.file)}/analyze`); notify('info', `${m.file}: ~${a.bpm} BPM, ${a.beats.length} битов`); }}>Биты</button>}
            </div>
          </div>
        </div>
      ))}
      {!media.length && <p className="muted small">Пока пусто. Медиа хранится в папке проекта <code>media/</code>.</p>}
    </div>
  );
}

function Skills() {
  const skills = useStore((s) => s.skills);
  return (
    <div className="col gap8">
      <p className="muted small">Скиллы — инструкции для агентов. Синхронизируются в <code>.claude/skills/</code> и <code>AGENTS.md</code> проекта. Свои скиллы кладите в <code>~/.agent-videostudio/skills/&lt;name&gt;/SKILL.md</code>.</p>
      {skills.map((s) => (
        <div key={s.path} className="card">
          <div className="row gap6"><Icon name="book" size={13} /><span className="strong small">{s.name}</span>{s.origin === 'user' && <span className="badge lib">моё</span>}</div>
          <div className="muted xsmall" style={{ marginTop: 4 }}>{s.description}</div>
        </div>
      ))}
      <button className="btn sm ghost" onClick={async () => { setState({ skills: await api('POST', '/api/skills/sync') }); notify('info', 'Скиллы синхронизированы'); }}><Icon name="refresh" size={12} /> Пересинхронизировать</button>
    </div>
  );
}
