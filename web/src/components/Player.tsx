import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item, Project } from '../../../shared/types';
import { layerFrame, audioGain, type LayerFrame } from '../../../shared/fx';
import { useStore, time, clipInput, getState, setState, projectBase } from '../store';

const VISUAL = new Set(['video', 'graphics']);
const isImage = (f: string) => /\.(png|jpe?g|webp|gif|svg)$/i.test(f);

/**
 * Render mode: the same Player composes export frames in headless Chromium.
 * Video comes from pre-extracted JPEG frames instead of <video>; every layer reports when the
 * current time is fully painted (clip iframes ack their seek, images decode).
 */
export interface RenderFrames { [itemId: string]: { base: string; srcIn: number; fps: number; count: number } }
export const renderSync = { enabled: false, waits: [] as Promise<unknown>[] };

/** Layered preview: media, sandboxed <iframe> per clip, audio — all slaved to one clock, with transitions/effects/masks. */
export function Player({ project, frames, renderMode }: { project: Project; frames?: RenderFrames; renderMode?: boolean }) {
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
  const audioItems = renderMode ? [] : project.items.filter((i) => {
    if (i.kind === 'music') return true;
    if (i.kind === 'media') { const m = media.find((x) => x.file === i.ref); return m?.type === 'audio'; }
    return false;
  });

  return (
    <div className="player-frame" style={{ width: project.width, height: project.height, background: project.background }}>
      {layers.map((it) => (
        <FxLayer key={it.id} item={it} project={project} seed={seedOf(it.id)} hidden={hiddenTracks.has(it.track)}>
          {it.kind === 'clip'
            ? <ClipLayer item={it} version={renderMode ? 0 : fileVersion[it.ref] || 0} project={project} renderMode={renderMode} />
            : isImage(it.ref)
              ? <ImageLayer item={it} />
              : renderMode
                ? <FrameSeqLayer item={it} seq={frames?.[it.id]} />
                : <VideoLayer item={it} muted={mutedTracks.has(it.track)} playing={playing} />}
        </FxLayer>
      ))}
      {audioItems.map((it) => {
        let src: string | undefined;
        if (it.kind === 'music') { const m = music.find((x) => x.id === it.ref); src = m?.rendered ? `${projectBase()}/${m.rendered}` : undefined; }
        else src = `${projectBase()}/media/${encodeURIComponent(it.ref)}`;
        return src ? <AudioLayer key={it.id + src} item={it} src={src} playing={playing} muted={mutedTracks.has(it.track)} /> : null;
      })}
    </div>
  );
}

const isActive = (it: Item, t: number) => t >= it.start && t < it.start + it.duration;
/** stable per-item seed (grain, glitch): must not depend on which layers happen to be mounted */
const seedOf = (id: string) => { let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619); return (h >>> 0) % 100000 + 1; };

/** Wrapper that applies transitions, effects, mask and blend mode for an item at the current time. */
function FxLayer({ item, project, seed, hidden, children }: { item: Item; project: Project; seed: number; hidden: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const deco = useRef<HTMLDivElement>(null);
  const caId = `ca-${item.id}`;
  useEffect(() => {
    const el = ref.current!, dd = deco.current!, cc = content.current!;
    let lastDeco = '';
    const apply = (t: number) => {
      const on = isActive(item, t) && !hidden;
      el.style.visibility = on ? 'visible' : 'hidden';
      if (!on) return;
      const f = layerFrame(item.fx, t - item.start, item.duration, project, seed);
      el.style.opacity = String((item.opacity ?? 1) * f.opacity);
      // layer transform (position / scale / rotation around the content's centre) then fx motion
      const tr = item.transform || {};
      el.style.transformOrigin = `${tr.ox ?? 50}% ${tr.oy ?? 50}%`;
      el.style.transform = `${layerTransform(tr)} ${f.transform}`.trim();
      // filters act on the content only; overlays (dips, tints, vignette, grain) sit on top unfiltered
      cc.style.filter = f.chromatic ? `url(#${caId}) ${f.filter}` : f.filter;
      el.style.clipPath = f.clipPath;
      el.style.webkitMaskImage = f.maskImage;
      el.style.maskImage = f.maskImage;
      (el.style as any).maskComposite = f.maskComposite || '';
      (el.style as any).webkitMaskComposite = f.maskComposite ? 'source-in' : '';
      el.style.mixBlendMode = f.blend === 'normal' ? '' : f.blend;
      const html = decoHtml(f, project, caId);
      if (html !== lastDeco) { dd.innerHTML = html; lastDeco = html; }
    };
    apply(time.get());
    return time.sub(apply);
  }, [item, project.width, project.height, hidden, seed]);
  return (
    <div ref={ref} className="fx-layer">
      <div ref={content} className="fx-content">{children}</div>
      <div ref={deco} className="fx-deco" />
    </div>
  );
}

/** overlays above the layer content: dips/tints, vignette, grain, letterbox, chromatic filter def */
function decoHtml(f: LayerFrame, p: { width: number; height: number }, caId: string) {
  let h = '';
  for (const o of f.overlays) if (o.opacity > 0.001) h += `<div class="fx-ov" style="background:${o.color};opacity:${o.opacity.toFixed(4)};${o.blend ? `mix-blend-mode:${o.blend}` : ''}"></div>`;
  if (f.vignette && f.vignette.amount > 0) h += `<div class="fx-ov" style="background:radial-gradient(ellipse at 50% 50%, transparent ${(f.vignette.size * 100).toFixed(1)}%, rgba(0,0,0,${f.vignette.amount.toFixed(3)}) 100%)"></div>`;
  if (f.grain && f.grain.amount > 0) {
    const fr = (0.9 / f.grain.size).toFixed(3);
    h += `<svg class="fx-ov" style="opacity:${f.grain.amount.toFixed(3)};mix-blend-mode:overlay" width="100%" height="100%"><filter id="g${f.grain.seed}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${fr}" numOctaves="2" seed="${f.grain.seed % 10000}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g${f.grain.seed})"/></svg>`;
  }
  if (f.letterbox) {
    const visH = Math.min(p.height, p.width / f.letterbox);
    const bar = ((p.height - visH) / 2 / p.height) * 100;
    if (bar > 0) h += `<div class="fx-ov" style="background:#000;top:auto;height:${bar}%;bottom:0"></div><div class="fx-ov" style="background:#000;height:${bar}%"></div>`;
  }
  if (f.chromatic) {
    const d = f.chromatic.toFixed(2);
    h += `<svg width="0" height="0" style="position:absolute"><filter id="${caId}" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/><feOffset in="r" dx="${d}" dy="0" result="r2"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/><feOffset in="b" dx="-${d}" dy="0" result="b2"/><feBlend in="r2" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b2" mode="screen"/></filter></svg>`;
  }
  return h;
}

export function layerTransform(tr: NonNullable<Item['transform']>) {
  const parts: string[] = [];
  if (tr.x || tr.y) parts.push(`translate(${tr.x || 0}px, ${tr.y || 0}px)`);
  if (tr.rotate) parts.push(`rotate(${tr.rotate}deg)`);
  if (tr.scale != null && tr.scale !== 1) parts.push(`scale(${tr.scale})`);
  return parts.join(' ');
}

function mediaStyle(item: Item): React.CSSProperties {
  return { objectFit: item.transform?.fit || 'contain' };
}

/** live clip iframes (for measuring content bounds: anchoring, on-frame gizmo) */
export const clipFrames = new Map<string, HTMLIFrameElement>();

function ImageLayer({ item }: { item: Item }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!renderSync.enabled) return;
    return time.sub(() => { const el = ref.current; if (el && !el.complete) renderSync.waits.push(el.decode().catch(() => {})); });
  }, []);
  return <img ref={ref} className="layer" src={`${projectBase()}/media/${encodeURIComponent(item.ref)}`} style={mediaStyle(item)} alt="" />;
}

/** render mode: show the pre-extracted JPEG frame for the current time */
function FrameSeqLayer({ item, seq }: { item: Item; seq?: RenderFrames[string] }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!seq) return;
    const show = (t: number) => {
      const el = ref.current;
      if (!el || !isActive(item, t)) return;
      const local = t - item.start + item.in;
      const k = Math.max(0, Math.min(seq.count - 1, Math.round((local - seq.srcIn) * seq.fps)));
      const src = `${seq.base}/${String(k + 1).padStart(6, '0')}.jpg`;
      if (el.getAttribute('src') !== src) {
        el.setAttribute('src', src);
        renderSync.waits.push(el.decode().catch(() => {}));
      }
    };
    show(time.get());
    return time.sub(show);
  }, [item, seq]);
  return <img ref={ref} className="layer" style={mediaStyle(item)} alt="" />;
}

/**
 * A clip on the timeline. When its files change (e.g. the agent saved an edit) the new version loads in a
 * hidden iframe and replaces the old one only after it has rendered — no blank or white frames.
 */
function ClipLayer({ item, version, project, renderMode }: { item: Item; version: number; project: Project; renderMode?: boolean }) {
  const [buffers, setBuffers] = useState<{ v: number; ready: boolean }[]>([{ v: version, ready: false }]);
  useEffect(() => {
    setBuffers((b) => (b.some((x) => x.v === version) ? b : [...b.filter((x) => x.ready).slice(-1), { v: version, ready: false }]));
  }, [version]);
  const onReady = (v: number) => setBuffers((b) => {
    const next = b.map((x) => (x.v === v ? { ...x, ready: true } : x));
    const newest = Math.max(...next.filter((x) => x.ready).map((x) => x.v));
    return next.filter((x) => x.v >= newest);
  });
  const shown = Math.max(...buffers.filter((x) => x.ready).map((x) => x.v), -1);
  return (
    <>
      {buffers.map((b) => (
        <ClipFrame key={b.v} v={b.v} item={item} project={project} visible={!!renderMode || b.v === shown} onReady={onReady} />
      ))}
    </>
  );
}

let ackSeq = 0;
const acks = new Map<number, () => void>();
window.addEventListener('message', (e) => { if (e.data?.__studio && e.data.type === 'seeked') { acks.get(e.data.ack)?.(); acks.delete(e.data.ack); } });
/** clips that finished booting (render mode waits for all of them before the first frame) */
export const clipReady = new Map<string, Promise<void>>();

function ClipFrame({ v, item, project, visible, onReady }: { v: number; item: Item; project: Project; visible: boolean; onReady: (v: number) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const input = JSON.stringify(clipInput(item, project));
  const initialInput = useRef(input);
  const src = `${projectBase()}/clips/${encodeURIComponent(item.ref)}/index.html?v=${v}#${encodeURIComponent(initialInput.current)}`;
  const post = (m: object) => ref.current?.contentWindow?.postMessage({ __studio: true, ...m }, '*');
  const readyResolve = useRef<(() => void) | undefined>(undefined);
  if (!clipReady.has(item.id)) clipReady.set(item.id, new Promise<void>((r) => (readyResolve.current = r)));

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.__studio) return;
      if (e.data.type === 'ready') {
        const first = !ready.current;
        ready.current = true;
        post({ type: 'seek', t: Math.max(0, time.get() - item.start + item.in) });
        setState((s) => ({ clipErrors: { ...s.clipErrors, [item.id]: e.data.errors || [] }, clipBindings: { ...s.clipBindings, [item.id]: e.data.bindings || {} } }));
        if (first) { readyResolve.current?.(); requestAnimationFrame(() => requestAnimationFrame(() => onReady(v))); }
      }
      if (e.data.type === 'error') setState((s) => ({ clipErrors: { ...s.clipErrors, [item.id]: [...(s.clipErrors[item.id] || []), e.data.message].slice(-5) } }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [item.id, item.start, item.in, v]);

  useEffect(() => { if (ready.current && input !== initialInput.current) post({ type: 'input', input: JSON.parse(input) }); }, [input]);

  useEffect(() => {
    const onT = (t: number) => {
      if (!ready.current) return;
      const local = t - item.start + item.in;
      if (local < -0.5 || local > item.in + item.duration + 0.5) return;
      if (renderSync.enabled) {
        const id = ++ackSeq;
        renderSync.waits.push(new Promise<void>((r) => { acks.set(id, r); setTimeout(r, 4000); }));
        post({ type: 'seek', t: Math.max(0, local), ack: id });
      } else post({ type: 'seek', t: Math.max(0, local) });
    };
    onT(time.get());
    return time.sub(onT);
  }, [item.start, item.in, item.duration]);

  useEffect(() => { if (visible && ref.current) clipFrames.set(item.id, ref.current); }, [visible, item.id]);
  return <iframe ref={ref} className="layer clip-layer" src={src} title={item.ref} style={{ visibility: visible ? 'inherit' : 'hidden' }} />;
}

function useMediaSrc(file: string) {
  const proxy = useStore((s) => s.media.find((m) => m.file === file)?.proxy);
  return proxy ? `${projectBase()}/${proxy}` : `${projectBase()}/media/${encodeURIComponent(file)}`;
}

function VideoLayer({ item, muted, playing }: { item: Item; muted: boolean; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const src = useMediaSrc(item.ref);
  useEffect(() => {
    const v = ref.current!;
    const sync = (t: number) => {
      const local = t - item.start + item.in;
      const inside = isActive(item, t);
      v.muted = muted || !inside;
      if (inside) v.volume = Math.max(0, Math.min(1, (item.volume ?? 1) * audioGain(item.fx, t - item.start, item.duration)));
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
  }, [item, playing, src, muted]);
  return <video ref={ref} className="layer" src={src} preload="auto" playsInline style={mediaStyle(item)} />;
}

function AudioLayer({ item, src, playing, muted }: { item: Item; src: string; playing: boolean; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = ref.current!;
    const sync = (t: number) => {
      const inside = isActive(item, t);
      const local = t - item.start + item.in;
      if (inside) a.volume = Math.max(0, Math.min(1, (item.volume ?? 1) * audioGain(item.fx, t - item.start, item.duration)));
      if (!inside || !getState().playing) { if (!a.paused) a.pause(); return; }
      if (a.paused) { a.currentTime = local; a.play().catch(() => {}); }
      else if (Math.abs(a.currentTime - local) > 0.15) a.currentTime = local;
    };
    sync(time.get());
    return time.sub(sync);
  }, [item, playing]);
  return <audio ref={ref} src={src} preload="auto" muted={muted} />;
}
