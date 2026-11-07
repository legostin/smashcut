// Headless frame renderer: the editor's own Player composes every export / agent / board frame.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './styles.css';
import type { Project, ClipInfo, MusicInfo, MediaInfo } from '../../shared/types';
import { Player, renderSync, clipReady, type RenderFrames } from './components/Player';
import { setState, time } from './store';

interface Manifest { project: Project; frames: RenderFrames; transparent?: boolean; clips: ClipInfo[]; music: MusicInfo[]; media: MediaInfo[] }

declare global { interface Window { __render: { ready: Promise<void>; seek: (t: number) => Promise<void>; errors: string[] } } }

const errors: string[] = [];
window.addEventListener('error', (e) => errors.push(e.message));

async function boot() {
  const id = new URLSearchParams(location.search).get('m');
  const m: Manifest = await (await fetch(`/api/render/manifest/${id}`)).json();
  renderSync.enabled = true;
  setState({ project: m.project, clips: m.clips, music: m.music, media: m.media, playing: false });
  const project = m.transparent ? { ...m.project, background: 'transparent' } : m.project;
  // the app stylesheet paints the body — the renderer must stay transparent (alpha exports, overlays)
  for (const el of [document.documentElement, document.body]) el.style.background = 'transparent';
  document.body.style.width = project.width + 'px';
  document.body.style.height = project.height + 'px';
  flushSync(() => createRoot(document.getElementById('root')!).render(<Player project={project} frames={m.frames} renderMode />));
  await document.fonts.ready;
  // every clip on the timeline must have booted before the first frame
  await Promise.race([Promise.all([...clipReady.values()]), new Promise((r) => setTimeout(r, 20000))]);
}

const ready = boot();
window.__render = {
  ready,
  errors,
  async seek(t: number) {
    await ready;
    renderSync.waits = [];
    time.set(t);
    await Promise.all(renderSync.waits);
    // two frames so the compositor has painted every layer (iframes included)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  },
};
