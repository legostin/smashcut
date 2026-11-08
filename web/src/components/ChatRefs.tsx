import { useEffect, useRef, useState } from 'react';
import type { Reference } from '../../../shared/types';
import { useStore, setState, actions, api, pfile, notify } from '../store';
import { Icon } from './Icon';
import { t, tn } from '../i18n';

/** put a reference into the current message as a context chip (the agent studies it with this message) */
function chip(r: { key: string; label: string; text: string }) {
  setState((s) => ({ chatContext: s.chatContext.some((c) => c.key === r.key) ? s.chatContext : [...s.chatContext, r] }));
}

/** files (dropped, pasted or picked) → media/ + project references + chips on the message */
export async function addRefFiles(files: File[]) {
  if (!files.length) return;
  const infos = await actions.upload(files);
  for (const m of infos) {
    await api('POST', '/api/references', { kind: 'media', ref: m.file, title: m.file, sceneIds: [] });
    chip({ key: 'ref:' + m.file, label: '★ ' + m.file, text: `reference media/${m.file} (${m.type}${m.width ? `, ${m.width}×${m.height}` : ''}) — just added by the user: study it and follow it` });
  }
}

/** a link → reference (direct image/video links are downloaded into media/) + chip */
export async function addRefLink(raw: string) {
  const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim();
  notify('info', t('Adding the link to references…'));
  const list = await api<Reference[]>('POST', '/api/references/link', { url });
  const r = [...list].reverse().find((x) => x.ref === url || x.kind === 'media') || list[list.length - 1];
  if (r) chip({ key: 'ref:' + r.ref, label: '★ ' + r.title.slice(0, 32), text: r.kind === 'media' ? `reference media/${r.ref} — downloaded from ${url}: study it and follow it` : `reference link ${url} ("${r.title}") — read it (WebFetch) and follow it` });
}

/** the project's references, right above the chat input: see, remove, add more */
export function ChatRefs() {
  const refs = useStore((s) => s.references);
  const media = useStore((s) => s.media);
  const [menu, setMenu] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setMenu(false); setLink(null); } };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  const thumb = (r: Reference) => r.kind === 'media' ? (media.find((m) => m.file === r.ref)?.thumb ? pfile(media.find((m) => m.file === r.ref)!.thumb!) : null) : r.thumb || null;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { notify('error', (e as Error).message); } finally { setBusy(false); } };
  const submitLink = () => { const u = (link || '').trim(); if (!u) return; setLink(null); setMenu(false); run(() => addRefLink(u)); };
  return (
    <div className="chat-refs" ref={box}>
      {refs.slice(-8).map((r) => (
        <span key={r.id} className="chat-ref" title={`${r.title}${r.sceneIds?.length ? ' · ' + tn(r.sceneIds.length, '{n} scene', '{n} scenes') : ''} — ${t('click to mention in the message')}`}
          onClick={() => chip({ key: 'ref:' + r.ref, label: '★ ' + r.title.slice(0, 32), text: `reference ${r.kind === 'media' ? 'media/' + r.ref : r.kind === 'link' ? r.ref : `${r.kind} "${r.ref}"`} ("${r.title}")` })}>
          {thumb(r) ? <img src={thumb(r)!} alt="" /> : <Icon name={r.kind === 'link' ? 'external' : r.kind === 'music-technique' ? 'music' : r.kind === 'media' ? 'image' : 'star'} size={11} />}
          <span className="ellipsis">{r.title}</span>
          <button aria-label={t('Remove reference')} onClick={(e) => { e.stopPropagation(); actions.removeReference(r.id); }}><Icon name="x" size={9} /></button>
        </span>
      ))}
      {refs.length > 8 && <span className="muted xsmall">+{refs.length - 8}</span>}
      <button className={'chat-ref-add' + (busy ? ' busy' : '')} onClick={() => setMenu((m) => !m)} title={t('Add a reference: files, a link, inspiration — or drop / paste files into the chat')}>
        {busy ? <span className="spinner sm" /> : <Icon name="plus" size={11} />} {refs.length ? '' : t('Reference')}
      </button>
      <input ref={fileIn} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; setMenu(false); run(() => addRefFiles(f)); }} />
      {menu && (
        <div className="chat-ref-menu" role="menu">
          {link === null ? (
            <>
              <button role="menuitem" onClick={() => fileIn.current?.click()}><Icon name="upload" size={13} /> {t('Images, videos, audio…')}</button>
              <button role="menuitem" onClick={() => setLink('')}><Icon name="external" size={13} /> {t('A link (page, image, YouTube…)')}</button>
              <button role="menuitem" onClick={() => { setMenu(false); setState({ libraryOpen: true, libraryTab: 'inspiration' }); }}><Icon name="star" size={13} /> {t('From inspiration')}</button>
              <button role="menuitem" onClick={() => { setMenu(false); setState({ libraryOpen: true, libraryTab: 'templates' }); }}><Icon name="book" size={13} /> {t('A technique')}</button>
            </>
          ) : (
            <div className="chat-ref-link">
              <input autoFocus value={link} placeholder={t('Paste a link…')} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitLink(); } if (e.key === 'Escape') setLink(null); }} />
              <button className="btn xs primary" disabled={!link.trim()} onClick={submitLink}>{t('Add')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
