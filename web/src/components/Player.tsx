import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Project } from '../../../shared/types';
import { useStore, time, clipInput, getState, setState } from '../store';

const VISUAL = new Set(['video', 'graphics']);
const isImage = (f: string) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f);

/** Layered preview: <video>/<img> for media, sandboxed <iframe> per clip, <audio> for sound — all slaved to one clock. */
export function Player({ project }: { project: Project }) {
  const playing = useStore((s) => s.playing);
  const fileVersion = useStore((s) => s.fileVersion);
  const music = useStore((s) => s.music);
  const media = useStore((s) => s.media);
  const layers = useMemo(() => {
    const out: Item[] = [];
    for (const tr of [...project.tracks].reverse()) {
      if (!VISUAL.has(tr.kind)) continue;
      for (const it of project.items.filter((i) => i.track === tr.id)) if (it.kind === 'clip' || it.kind === 'media') out.push(it);
    }
    return out;
  }, [project]);
  const hiddenTracks = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));
  const mutedTracks = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));

  const audioItems = project.items.filter((i) => {
    if (i.kind === 'music') return true;
    if (i.kind === 'media') { const m = media.find((x) => x.file === i.ref); return m?.type === 'audio'; }
    return false;
  });

  return (
    <div className="player-frame" style={{ width: project.width, height: project.height, background: project.background }}>
      {layers.map((it) => (
        <Layer key={it.id + (it.kind === 'clip' ? ':' + (fileVersion[it.ref] || 0) : '')} item={it} project={project} hidden={hiddenTracks.has(it.track)} muted={mutedTracks.has(it.track)} playing={playing} />
      ))}
      {audioItems.map((it) => {
        let src: string | undefined;
        if (it.kind === 'music') { const m = music.find((x) => x.id === it.ref); src = m?.rendered ? `/p/${m.rendered}` : undefined; }
        else src = `/p/media/${encodeURIComponent(it.ref)}`;
        return src ? <AudioLayer key={it.id + src} item={it} src={src} playing={playing} muted={mutedTracks.has(it.track)} /> : null;
      })}
    </div>
  );
}

function useActive(item: Item) {
  const [active, setActive] = useState(() => { const t = time.get(); return t >= item.start && t < item.start + item.duration; });
  useEffect(() => time.sub((t) => setActive(t >= item.start && t < item.start + item.duration)), [item.start, item.duration]);
  return active;
}

function Layer({ item, project, hidden, muted, playing }: { item: Item; project: Project; hidden: boolean; muted: boolean; playing: boolean }) {
  const active = useActive(item);
  if (item.kind === 'clip') return <ClipLayer item={item} project={project} visible={active && !hidden} />;
  if (isImage(item.ref)) {
    const tr = item.transform || {};
    return <img className="layer" src={`/p/media/${encodeURIComponent(item.ref)}`} style={{ visibility: active && !hidden ? 'visible' : 'hidden', objectFit: tr.fit || 'contain', transform: `translate(${tr.x || 0}px,${tr.y || 0}px) scale(${tr.scale ?? 1})`, opacity: item.opacity ?? 1 }} />;
  }
  return <VideoLayer item={item} visible={active && !hidden} active={active} muted={muted} playing={playing} />;
}

function ClipLayer({ item, project, visible }: { item: Item; project: Project; visible: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const input = JSON.stringify(clipInput(item, project));
  const initialInput = useRef(input);
  const src = `/p/clips/${encodeURIComponent(item.ref)}/index.html#${encodeURIComponent(initialInput.current)}`;

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.__studio) return;
      if (e.data.type === 'ready') {
        ready.current = true;
        post({ type: 'seek', t: time.get() - item.start + item.in });
        setState((s) => ({ clipErrors: { ...s.clipErrors, [item.id]: e.data.errors || [] } }));
      }
      if (e.data.type === 'error') setState((s) => ({ clipErrors: { ...s.clipErrors, [item.id]: [...(s.clipErrors[item.id] || []), e.data.message].slice(-5) } }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [item.id, item.start, item.in]);

  const post = (m: object) => ref.current?.contentWindow?.postMessage({ __studio: true, ...m }, '*');

  // params / timing changes → re-setup without reload
  useEffect(() => { if (ready.current && input !== initialInput.current) post({ type: 'input', input: JSON.parse(input) }); }, [input]);

  useEffect(() => {
    const onT = (t: number) => {
      if (!ready.current) return;
      const local = t - item.start + item.in;
      if (local >= -0.5 && local <= item.in + item.duration + 0.5) post({ type: 'seek', t: Math.max(0, local) });
    };
    onT(time.get());
    return time.sub(onT);
  }, [item.start, item.in, item.duration]);

  return <iframe ref={ref} className="layer clip-layer" src={src} title={item.ref} style={{ visibility: visible ? 'visible' : 'hidden', opacity: item.opacity ?? 1 }} />;
}

function VideoLayer({ item, visible, active, muted, playing }: { item: Item; visible: boolean; active: boolean; muted: boolean; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const tr = item.transform || {};
  useEffect(() => {
    const v = ref.current!;
    const sync = (t: number) => {
      const local = t - item.start + item.in;
      const inside = t >= item.start && t < item.start + item.duration;
      if (!inside) { if (!v.paused) v.pause(); return; }
      if (getState().playing) {
        if (v.paused) { v.currentTime = local; v.play().catch(() => {}); }
        else if (Math.abs(v.currentTime - local) > 0.25) v.currentTime = local;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - local) > 0.02) v.currentTime = local;
      }
    };
    sync(time.get());
    return time.sub(sync);
  }, [item.start, item.in, item.duration, playing]);
  useEffect(() => { if (ref.current) ref.current.volume = Math.min(1, item.volume ?? 1); }, [item.volume]);
  return (
    <video ref={ref} className="layer" src={`/p/media/${encodeURIComponent(item.ref)}`} muted={muted || !active} preload="auto" playsInline
      style={{ visibility: visible ? 'visible' : 'hidden', objectFit: tr.fit || 'contain', transform: `translate(${tr.x || 0}px,${tr.y || 0}px) scale(${tr.scale ?? 1})`, opacity: item.opacity ?? 1 }} />
  );
}

function AudioLayer({ item, src, playing, muted }: { item: Item; src: string; playing: boolean; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current!;
    const sync = (t: number) => {
      const inside = t >= item.start && t < item.start + item.duration;
      const local = t - item.start + item.in;
      if (!inside || !getState().playing) { if (!a.paused) a.pause(); return; }
      if (a.paused) { a.currentTime = local; a.play().catch(() => {}); }
      else if (Math.abs(a.currentTime - local) > 0.15) a.currentTime = local;
    };
    sync(time.get());
    return time.sub(sync);
  }, [item.start, item.in, item.duration, playing]);
  useEffect(() => { if (ref.current) ref.current.volume = Math.min(1, item.volume ?? 1); }, [item.volume]);
  return <audio ref={ref} src={src} preload="auto" muted={muted} />;
}
