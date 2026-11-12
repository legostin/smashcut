import { useEffect, useRef, useState } from 'react';
import type { Inspiration } from '../../../shared/types';

/**
 * Preview of an inspiration entry: our own mini-scene of the ONE technique we borrow from the piece.
 * The still (the most telling frame) shows at once; a moving technique then plays as a silent loop while on screen.
 * While the loop is still being rendered (202) the still stays and we retry.
 */
export function InspoPreview({ x, className = '' }: { x: Pick<Inspiration, 'id' | 'demo'>; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || src || !x.demo?.loop) return;
    let stop = false, timer = 0 as any;
    const url = `/api/inspiration/${x.id}/preview`;
    const tryLoad = () => fetch(url, { method: 'HEAD' }).then((r) => { if (stop) return; if (r.status === 200) setSrc(url); else if (r.status === 202) timer = setTimeout(tryLoad, 2500); }).catch(() => { timer = setTimeout(tryLoad, 4000); });
    tryLoad();
    return () => { stop = true; clearTimeout(timer); };
  }, [visible, src, x.id, x.demo?.loop]);
  useEffect(() => { const v = video.current; if (!v) return; if (visible) v.play().catch(() => {}); else v.pause(); }, [visible, src]);
  return (
    <span ref={box} className={'inspo-prev ' + className + (playing ? ' playing' : '')}>
      <img src={`/api/inspiration/${x.id}/thumb`} alt="" loading="lazy" />
      {src && <video ref={video} src={src} muted loop playsInline autoPlay preload="auto" onPlaying={() => setPlaying(true)} />}
    </span>
  );
}
