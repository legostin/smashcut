import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DesignSystem, Item, Project, Scene, Task } from '../../../shared/types';
import { useStore, actions, seek, setState, getState, fmtTime, api } from '../store';
import { withContext } from './Chat';
import { Icon } from './Icon';

type Cam = { x: number; y: number; z: number };
type Seg = { id: string; title: string; start: number; duration: number; status?: Scene['status']; voiceover?: string; auto?: boolean };

/**
 * Figma-like board: the whole production laid out as frames — script, design system, storyboard,
 * layers per scene, components — with the agent's cursor moving to whatever it works on.
 */
export function Board({ project }: { project: Project }) {
  const script = useStore((s) => s.script);
  const design = useStore((s) => s.design);
  const tasks = useStore((s) => s.tasks);
  const follow = useStore((s) => s.followAgent);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Cam>(() => readCam() || { x: 60, y: 80, z: 0.62 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const anim = useRef(0);

  useEffect(() => { try { localStorage.setItem('boardCam', JSON.stringify(cam)); } catch {} }, [cam]);

  const flyTo = useCallback((target: Cam, ms = 650) => {
    cancelAnimationFrame(anim.current);
    const from = { ...camRef.current };
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setCam({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e });
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  /** center a world-space rect in the viewport */
  const focusRect = useCallback((r: { x: number; y: number; w: number; h: number }, zoom?: number) => {
    const vp = viewport.current!.getBoundingClientRect();
    const z = zoom ?? Math.min(1, Math.max(0.35, Math.min((vp.width - 160) / r.w, (vp.height - 160) / r.h)));
    flyTo({ z, x: vp.width / 2 - (r.x + r.w / 2) * z, y: vp.height / 2 - (r.y + r.h / 2) * z });
  }, [flyTo]);

  const fitAll = useCallback(() => {
    const w = world.current;
    if (!w) return;
    const kids = [...w.querySelectorAll<HTMLElement>('[data-frame]')];
    if (!kids.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of kids) { x0 = Math.min(x0, k.offsetLeft); y0 = Math.min(y0, k.offsetTop - 30); x1 = Math.max(x1, k.offsetLeft + k.offsetWidth); y1 = Math.max(y1, k.offsetTop + k.offsetHeight); }
    focusRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }, [focusRect]);

  // pan & zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cancelAnimationFrame(anim.current);
    const vp = viewport.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const mx = e.clientX - vp.left, my = e.clientY - vp.top;
      const z = Math.min(2.5, Math.max(0.15, cam.z * Math.exp(-e.deltaY * 0.0022)));
      setCam({ z, x: mx - ((mx - cam.x) / cam.z) * z, y: my - ((my - cam.y) / cam.z) * z });
    } else setCam({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY });
  };
  useEffect(() => {
    const el = viewport.current!;
    const prevent = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    return () => el.removeEventListener('wheel', prevent);
  }, []);
  const [panning, setPanning] = useState(false);
  const space = useRef(false);
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea')) { space.current = true; e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);
  const selection = useStore((s) => s.boardSelection);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const toWorld = (cx: number, cy: number) => { const r = viewport.current!.getBoundingClientRect(); return { x: (cx - r.left - camRef.current.x) / camRef.current.z, y: (cy - r.top - camRef.current.y) / camRef.current.z }; };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    cancelAnimationFrame(anim.current);
    // pan: space + drag, middle mouse
    if (space.current || e.button === 1) {
      const sx = e.clientX, sy = e.clientY, c0 = { ...cam };
      setPanning(true);
      const mv = (ev: PointerEvent) => setCam({ ...c0, x: c0.x + ev.clientX - sx, y: c0.y + ev.clientY - sy });
      const up = () => { setPanning(false); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      return;
    }
    if (e.button !== 0) return;
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-anchor]');
    if (hit && world.current?.contains(hit)) {
      const a = hit.dataset.anchor!;
      const cur = getState().boardSelection;
      setState({ boardSelection: e.shiftKey || e.metaKey ? (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]) : [a] });
      return;
    }
    // marquee selection on empty canvas
    const p0 = toWorld(e.clientX, e.clientY);
    const base = e.shiftKey ? getState().boardSelection : [];
    setMarquee({ x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y });
    const mv = (ev: PointerEvent) => {
      const p1 = toWorld(ev.clientX, ev.clientY);
      const box = { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
      setMarquee({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y });
      if (box.w < 4 && box.h < 4) return;
      const hits: string[] = [];
      for (const el of world.current!.querySelectorAll<HTMLElement>('[data-anchor]:not([data-frame])')) {
        const r = worldRect(el, world.current!);
        if (r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y) hits.push(el.dataset.anchor!);
      }
      // keep the most specific objects (drop containers when their children are hit)
      setState({ boardSelection: [...new Set([...base, ...hits])] });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      const p1 = toWorld(ev.clientX, ev.clientY);
      if (Math.abs(p1.x - p0.x) < 4 && Math.abs(p1.y - p0.y) < 4 && !ev.shiftKey) setState({ boardSelection: [] });
      setMarquee(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  // highlight selected objects
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    for (const el of w.querySelectorAll<HTMLElement>('[data-anchor]')) el.classList.toggle('b-sel', selection.includes(el.dataset.anchor!));
  });

  // segments: script scenes, or automatic ones derived from the edit
  const segs: Seg[] = useMemo(() => {
    if (script.scenes.length) return script.scenes;
    const end = Math.max(0, ...project.items.map((i) => i.start + i.duration));
    if (!end) return [];
    const starts = [...new Set(project.items.filter((i) => i.kind === 'clip').map((i) => +i.start.toFixed(2)))].sort((a, b) => a - b);
    const cuts = starts.length >= 2 ? starts : Array.from({ length: Math.min(6, Math.ceil(end / 4)) }, (_, i) => (i * end) / Math.min(6, Math.ceil(end / 4)));
    if (cuts[0] > 0.05) cuts.unshift(0);
    return cuts.map((s, i) => ({ id: 'auto' + i, title: `Фрагмент ${i + 1}`, start: s, duration: (cuts[i + 1] ?? end) - s, auto: true })).filter((s) => s.duration > 0.2).slice(0, 12);
  }, [script.scenes, project.items]);

  // agent presence
  const live = tasks.filter((t) => t.status === 'running');
  const lead = live.filter((t) => t.focus).sort((a, b) => b.focus!.at - a.focus!.at)[0] || live[0];
  const anchor = lead ? anchorFor(lead, project) : null;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor || !world.current) { setCursor(null); return; }
    const el = world.current.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`) || world.current.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor.split(':')[0])}"]`);
    if (!el) { setCursor(null); return; }
    const r = worldRect(el, world.current);
    setCursor({ x: r.x + Math.min(r.w - 12, Math.max(16, r.w * 0.72)), y: r.y + Math.min(r.h - 8, Math.max(14, r.h * 0.6)) });
    if (follow) {
      const vp = viewport.current!.getBoundingClientRect();
      const sx = r.x * camRef.current.z + camRef.current.x, sy = r.y * camRef.current.z + camRef.current.y;
      const visible = sx > 40 && sy > 40 && sx + r.w * camRef.current.z < vp.width - 40 && sy + r.h * camRef.current.z < vp.height - 40;
      if (!visible) focusRect({ x: r.x - 60, y: r.y - 60, w: Math.max(r.w + 120, 600), h: Math.max(r.h + 120, 420) }, Math.max(0.45, camRef.current.z));
    }
  }, [anchor, follow, segs.length, script.scenes, design]);

  useEffect(() => { if (!readCam()) setTimeout(fitAll, 60); }, []);

  return (
    <section className="board" ref={viewport} onWheel={onWheel} onPointerDown={onDown} data-panning={panning || undefined} onKeyDown={(e) => { if (e.key === 'Escape') setState({ boardSelection: [] }); }} tabIndex={-1}>
      <div className="board-grid" style={{ backgroundPosition: `${cam.x}px ${cam.y}px`, backgroundSize: `${24 * cam.z}px ${24 * cam.z}px` }} />
      <div className="board-world" ref={world} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }} data-active-anchor={anchor || undefined}>
        <div className="board-row">
          <ScriptFrame segs={segs} hasScript={script.scenes.length > 0} brief={script.brief} active={anchor} />
          <DesignFrame design={design} active={anchor} />
          <StoryboardFrame segs={segs} project={project} active={anchor} />
        </div>
        <div className="board-row">
          <LayersFrame segs={segs} project={project} active={anchor} />
          <ComponentsFrame project={project} active={anchor} />
        </div>
        {lead && cursor && <AgentCursor x={cursor.x} y={cursor.y} task={lead} z={cam.z} />}
        {marquee && <div className="b-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0), borderWidth: 1 / cam.z }} />}
        <Notes world={world} z={cam.z} />
      </div>
      {selection.length > 0 && !marquee && <SelectionBar world={world} cam={cam} selection={selection} project={project} />}
      <div className="board-hud" data-ui>
        <button className="icon-btn sm" onClick={() => setCam({ ...cam, z: Math.max(0.15, cam.z / 1.2) })} title="Отдалить">−</button>
        <button className="hud-zoom" onClick={fitAll} title="Показать всё">{Math.round(cam.z * 100)}%</button>
        <button className="icon-btn sm" onClick={() => setCam({ ...cam, z: Math.min(2.5, cam.z * 1.2) })} title="Приблизить">+</button>
      </div>
      <div className="board-hint">Клик — выделить · Shift — добавить · рамка — выделить область · пробел + перетаскивание или колесо — панорама · ⌘ + колесо — масштаб</div>
    </section>
  );
}

const readCam = (): Cam | null => { try { const c = JSON.parse(localStorage.getItem('boardCam') || 'null'); return c && typeof c.z === 'number' ? c : null; } catch { return null; } };

function worldRect(el: HTMLElement, world: HTMLElement) {
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== world) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function anchorFor(t: Task, p: Project): string {
  const f = t.focus;
  if (!f) return 'frame:script';
  if (f.kind === 'script') return f.id ? `scene:${f.id}` : 'frame:script';
  if (f.kind === 'design') return 'frame:design';
  if (f.kind === 'timeline') return 'frame:layers';
  if (f.kind === 'clip' || f.kind === 'music') {
    const it = p.items.find((i) => i.kind === f.kind && i.ref === f.id);
    return it ? `layer:${it.id}` : `${f.kind}:${f.id}`;
  }
  return 'frame:script';
}

function Frame({ id, title, w, children, active, sub }: { id: string; title: string; x?: number; y?: number; w: number; children: React.ReactNode; active: string | null; sub?: string }) {
  const on = active === `frame:${id}`;
  return (
    <div className={'bframe' + (on ? ' active' : '')} style={{ width: w }} data-frame data-anchor={`frame:${id}`}>
      <div className="bframe-title">{title}{sub && <span>{sub}</span>}</div>
      <div className="bframe-body">{children}</div>
    </div>
  );
}

// ---------- 1. script ----------
function ScriptFrame({ segs, hasScript, brief, active }: { segs: Seg[]; hasScript: boolean; brief: string; active: string | null }) {
  const fps = useStore((s) => s.project?.fps || 30);
  return (
    <Frame id="script" title="Сценарий" sub={hasScript ? `${segs.length} сцен` : 'черновик'} x={0} y={0} w={400} active={active}>
      <div className="sticky">{brief || 'Бриф пока пуст. Опишите идею во вкладке «Сценарий» — агент разложит её на сцены.'}</div>
      {!hasScript && <button className="btn sm b-cta" data-ui onClick={() => setState({ sideTab: 'script' })}>Открыть сценарий</button>}
      {hasScript && segs.map((s, i) => (
        <div key={s.id} className={`b-scene st-${s.status || 'todo'}${active === `scene:${s.id}` ? ' active' : ''}`} data-anchor={`scene:${s.id}`} onDoubleClick={() => seek(s.start + 0.001)}>
          <div className="b-scene-top"><span className="b-num">{i + 1}</span><span className="grow ellipsis">{s.title}</span><span className="mono muted">{fmtTime(s.start, fps)}</span></div>
          {s.voiceover && <div className="b-scene-vo">{s.voiceover}</div>}
        </div>
      ))}
    </Frame>
  );
}

// ---------- 2. design system ----------
function DesignFrame({ design, active }: { design: DesignSystem; active: string | null }) {
  const empty = !design.colors.length && !design.type.length && !design.motion.length;
  return (
    <Frame id="design" title="Дизайн-система" sub={design.name || undefined} x={460} y={0} w={560} active={active}>
      {empty ? (
        <div className="b-empty">
          Токены ещё не заданы. Агент спроектирует палитру, типографику и моушн-токены, и все клипы будут использовать их через CSS-переменные.
          <button className="btn sm" data-ui onClick={() => actions.startTask('Спроектируй дизайн-систему проекта по брифу (get_script, get_design → set_design): палитра, типографика (только встроенные шрифты, кириллица), моушн-токены, отступы. Затем примени токены к клипам на таймлайне.')}><Icon name="sparkle" size={11} /> Спроектировать</button>
        </div>
      ) : (
        <>
          {design.colors.length > 0 && <div className="ds-label">Цвета</div>}
          <div className="ds-colors">
            {design.colors.map((c) => (
              <div key={c.name} className="ds-color" data-anchor={`design:color:${c.name}`}>
                <div className="ds-swatch" style={{ background: c.value }} />
                <div className="ds-cname">{c.name}</div>
                <div className="ds-cval mono">{c.value}</div>
              </div>
            ))}
          </div>
          {design.type.length > 0 && <div className="ds-label">Типографика</div>}
          {design.type.map((t) => (
            <div key={t.role} className="ds-type" data-anchor={`design:type:${t.role}`}>
              <div className="ds-type-sample" style={{ fontFamily: `'${t.family}'`, fontWeight: t.weight, fontSize: Math.max(13, Math.min(44, t.size * 0.32)), letterSpacing: t.tracking != null ? `${t.tracking}em` : undefined }}>{t.sample || 'Делай видео кодом'}</div>
              <div className="ds-type-meta mono">{t.role} · {t.family} {t.weight} · {t.size}px</div>
            </div>
          ))}
          {design.motion.length > 0 && <div className="ds-label">Движение</div>}
          <div className="ds-motion">
            {design.motion.map((m) => <div key={m.name} data-anchor={`design:motion:${m.name}`}><EaseCurve name={m.name} ease={m.ease} duration={m.duration} /></div>)}
          </div>
          {(design.spacing || []).length > 0 && <div className="ds-label">Отступы</div>}
          <div className="ds-spacing">
            {(design.spacing || []).map((s) => <div key={s.name} className="ds-space"><div style={{ width: Math.min(160, s.value / 2) }} /><span className="mono">{s.name} · {s.value}</span></div>)}
          </div>
        </>
      )}
    </Frame>
  );
}

const EASES: Record<string, (t: number) => number> = {
  linear: (t) => t, none: (t) => t,
  'power1.out': (t) => 1 - (1 - t) ** 2, 'power2.out': (t) => 1 - (1 - t) ** 3, 'power3.out': (t) => 1 - (1 - t) ** 4, 'power4.out': (t) => 1 - (1 - t) ** 5,
  'power1.in': (t) => t ** 2, 'power2.in': (t) => t ** 3, 'power3.in': (t) => t ** 4, 'power4.in': (t) => t ** 5,
  'power2.inOut': (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), 'power3.inOut': (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  'expo.out': (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)), 'expo.in': (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  'expo.inOut': (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2),
  'back.out': (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  'sine.inOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2, 'sine.out': (t) => Math.sin((t * Math.PI) / 2),
  'circ.out': (t) => Math.sqrt(1 - (t - 1) ** 2),
  'elastic.out': (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};
function easeFn(name: string) { return EASES[name] || EASES[name.replace(/\(.*\)$/, '')] || EASES[name.split('.')[0] + '.out'] || EASES['power3.out']; }

function EaseCurve({ name, ease, duration }: { name: string; ease: string; duration: number }) {
  const f = easeFn(ease);
  const pts = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return `${8 + t * 104},${86 - f(t) * 72}`; }).join(' ');
  return (
    <div className="ds-ease">
      <svg viewBox="0 0 120 96"><rect x="8" y="14" width="104" height="72" rx="3" className="ds-ease-box" /><polyline points={pts} className="ds-ease-line" /><circle r="3.2" className="ds-ease-dot" style={{ offsetPath: `path('M ${pts.split(' ').join(' L ')}')`, animationDuration: `${Math.max(0.4, duration) * 1.6}s` }} /></svg>
      <div className="ds-cname">{name}</div>
      <div className="ds-cval mono">{ease} · {duration}s</div>
    </div>
  );
}

// ---------- 3. storyboard ----------
function StoryboardFrame({ segs, project, active }: { segs: Seg[]; project: Project; active: string | null }) {
  const cols = segs.length > 4 ? 3 : 2;
  const cardW = 300;
  return (
    <Frame id="storyboard" title="Раскадровка" sub={segs.length ? `${segs.length} кадров` : undefined} x={1080} y={0} w={cols * cardW + (cols - 1) * 16 + 32} active={active}>
      {!segs.length && <div className="b-empty">Кадры появятся, когда на таймлайне будет контент или в сценарии — сцены.</div>}
      <div className="sb-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${cardW}px)` }}>
        {segs.map((s, i) => <StoryCard key={s.id} s={s} n={i + 1} project={project} active={active === `scene:${s.id}`} />)}
      </div>
    </Frame>
  );
}

function StoryCard({ s, n, project, active }: { s: Seg; n: number; project: Project; active: boolean }) {
  const fileVersion = useStore((st) => st.fileVersion);
  const designAt = useStore((st) => st.design.updatedAt);
  const t = +(s.start + Math.min(s.duration * 0.55, Math.max(0.1, s.duration - 0.1))).toFixed(2);
  const inScene = project.items.filter((i) => i.start < s.start + s.duration && i.start + i.duration > s.start);
  const v = useMemo(() => hash(JSON.stringify([inScene.map((i) => [i.id, i.start, i.duration, i.in, i.params, i.track, i.opacity, fileVersion[i.ref]]), project.tracks.map((x) => x.hidden), designAt, project.width, project.height])), [inScene, fileVersion, designAt, project.tracks, project.width, project.height]);
  const src = inScene.length ? `/api/board/frame?t=${t}&w=480&v=${v}` : null;
  const [shown, setShown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!src) { setShown(null); return; }
    setLoading(true);
    const img = new Image();
    img.onload = () => { setShown(src); setLoading(false); };
    img.onerror = () => setLoading(false);
    img.src = src;
  }, [src]);
  const fps = project.fps;
  return (
    <div className={`sb-card st-${s.status || 'todo'}${active ? ' active' : ''}`} data-anchor={`shot:${s.id}`} onDoubleClick={() => seek(t)}>
      <div className="sb-img" style={{ aspectRatio: `${project.width} / ${project.height}` }}>
        {shown ? <img key={shown} src={shown} alt="" /> : <div className="sb-placeholder">{inScene.length ? '' : 'пусто'}</div>}
        {loading && <span className="sb-loading"><span className="spinner sm" /></span>}
        <span className="sb-n">{n}</span>
      </div>
      <div className="sb-meta"><span className="ellipsis grow">{s.title}</span><span className="mono muted">{fmtTime(s.start, fps)}–{fmtTime(s.start + s.duration, fps)}</span></div>
      {s.voiceover && <div className="sb-vo">{s.voiceover}</div>}
    </div>
  );
}
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// ---------- 4. layers per scene ----------
function LayersFrame({ segs, project, active }: { segs: Seg[]; project: Project; active: string | null }) {
  const tracks = project.tracks;
  return (
    <Frame id="layers" title="Слои и таймлайн" sub="по сценам" x={0} y={760} w={1020} active={active}>
      {!segs.length && <div className="b-empty">Слои появятся вместе с первыми элементами на таймлайне.</div>}
      <div className="ly-list">
        {segs.map((s, i) => {
          const items = project.items.filter((it) => it.start < s.start + s.duration && it.start + it.duration > s.start);
          return (
            <div key={s.id} className={'ly-scene' + (active === `scene:${s.id}` ? ' active' : '')}>
              <div className="ly-head"><span className="b-num">{i + 1}</span>{s.title}<span className="muted mono">{s.duration.toFixed(1)}s · {items.length} эл.</span></div>
              <div className="ly-tracks">
                {tracks.filter((tr) => items.some((it) => it.track === tr.id)).map((tr) => (
                  <div key={tr.id} className="ly-track">
                    <span className="ly-tname">{tr.name}</span>
                    <div className="ly-lane">
                      {items.filter((it) => it.track === tr.id).map((it) => <LayerBlock key={it.id} it={it} s={s} active={active === `layer:${it.id}`} />)}
                    </div>
                  </div>
                ))}
                {!items.length && <div className="ly-empty">нет слоёв</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function LayerBlock({ it, s, active }: { it: Item; s: Seg; active: boolean }) {
  const name = useStore((st) => (it.kind === 'clip' ? st.clips.find((c) => c.id === it.ref)?.name : it.kind === 'music' ? st.music.find((m) => m.id === it.ref)?.name : undefined) || it.ref);
  const a = Math.max(0, (it.start - s.start) / s.duration), b = Math.min(1, (it.start + it.duration - s.start) / s.duration);
  return (
    <div className={`ly-item kind-${it.kind}${active ? ' active' : ''}`} style={{ left: `${a * 100}%`, width: `${Math.max(2, (b - a) * 100)}%` }} data-anchor={`layer:${it.id}`}
      onDoubleClick={() => { setState({ selectedItemId: it.id }); }} title={name}>
      <span className="ellipsis">{name}</span>
    </div>
  );
}

// ---------- 5. components ----------
function ComponentsFrame({ project, active }: { project: Project; active: string | null }) {
  const clips = useStore((s) => s.clips);
  const music = useStore((s) => s.music);
  const media = useStore((s) => s.media);
  return (
    <Frame id="components" title="Компоненты" sub={`${clips.length + music.length + media.length}`} x={1080} y={760} w={640} active={active}>
      {!clips.length && !music.length && !media.length && <div className="b-empty">Клипы, треки и медиа проекта появятся здесь.</div>}
      <div className="cmp-grid">
        {clips.map((c) => {
          const uses = project.items.filter((i) => i.kind === 'clip' && i.ref === c.id).length;
          return (
            <div key={c.id} className={'cmp' + (active === `clip:${c.id}` ? ' active' : '')} data-anchor={`clip:${c.id}`}>
              <span className="cmp-icon kind-clip"><Icon name="layers" size={13} /></span>
              <span className="grow minw0"><span className="ellipsis block">{c.name}</span><span className="muted xsmall">{uses ? `${uses}× на таймлайне` : 'не используется'}</span></span>
            </div>
          );
        })}
        {music.map((m) => (
          <div key={m.id} className={'cmp' + (active === `music:${m.id}` ? ' active' : '')} data-anchor={`music:${m.id}`}>
            <span className="cmp-icon kind-music"><Icon name="music" size={13} /></span>
            <span className="grow minw0"><span className="ellipsis block">{m.name}</span><span className="muted xsmall">{m.meta ? `${m.meta.bpm} BPM · ${m.meta.duration.toFixed(0)}s` : 'рендерится…'}</span></span>
          </div>
        ))}
        {media.map((m) => (
          <div key={m.file} className="cmp">
            <span className="cmp-icon kind-media">{m.thumb ? <img src={`/p/${m.thumb}`} alt="" /> : <Icon name="film" size={13} />}</span>
            <span className="grow minw0"><span className="ellipsis block">{m.file}</span><span className="muted xsmall">{m.type}{m.duration ? ` · ${m.duration.toFixed(1)}s` : ''}</span></span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

// ---------- agent cursor ----------
function AgentCursor({ x, y, task, z }: { x: number; y: number; task: Task; z: number }) {
  const label = task.agent === 'claude' ? 'Claude' : 'Codex';
  const last = [...task.events].reverse().find((e) => e.kind === 'tool' || e.kind === 'text');
  const doing = last?.kind === 'tool' ? (last.text || last.tool || '') : '';
  return (
    <div className={`agent-cursor ag-${task.agent}`} style={{ transform: `translate(${x}px, ${y}px) scale(${1 / Math.max(0.5, z)})` }}>
      <svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1l15 7.5-6.5 1.6L6.7 18z" /></svg>
      <div className="ac-label">{label}{doing && <span className="ac-doing">{doing.slice(0, 48)}</span>}</div>
    </div>
  );
}

// ---------- selection → chat / comment ----------
const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

/** human label + precise agent-facing description of a board object */
export function describeAnchor(a: string, project: Project): { label: string; text: string } {
  const st = getState();
  const [kind, ...rest] = a.split(':');
  const id = rest.join(':');
  const scenes = st.script.scenes;
  const sc = scenes.find((x) => x.id === id);
  const n = sc ? scenes.indexOf(sc) + 1 : 0;
  const tm = (x: number) => x.toFixed(2);
  switch (kind) {
    case 'scene': return sc ? { label: `Сцена ${n}`, text: `сцена ${n} «${sc.title}» (id ${sc.id}, ${tm(sc.start)}–${tm(sc.start + sc.duration)} с)${sc.voiceover ? `, текст: «${sc.voiceover}»` : ''}${sc.visual ? `, визуал: «${sc.visual}»` : ''}` } : { label: 'Сцена', text: `сцена ${id}` };
    case 'shot': return sc ? { label: `Кадр ${n}`, text: `кадр раскадровки сцены ${n} «${sc.title}» (${tm(sc.start)}–${tm(sc.start + sc.duration)} с) — посмотри его через render_frame` } : { label: 'Кадр', text: `кадр ${id}` };
    case 'design': {
      const [sub, name] = id.split(':');
      if (sub === 'color') { const c = st.design.colors.find((x) => x.name === name); return { label: `Цвет ${name}`, text: `цвет дизайн-системы «${name}» = ${c?.value}` }; }
      if (sub === 'type') { const t = st.design.type.find((x) => x.role === name); return { label: `Шрифт ${name}`, text: `типографика «${name}»: ${t?.family} ${t?.weight}, ${t?.size}px` }; }
      if (sub === 'motion') { const m = st.design.motion.find((x) => x.name === name); return { label: `Движение ${name}`, text: `моушн-токен «${name}»: ${m?.ease}, ${m?.duration}s` }; }
      return { label: 'Дизайн', text: `дизайн-система: ${id}` };
    }
    case 'layer': {
      const it = project.items.find((x) => x.id === id);
      if (!it) return { label: 'Слой', text: `элемент ${id}` };
      const name = it.kind === 'clip' ? st.clips.find((c) => c.id === it.ref)?.name || it.ref : it.kind === 'music' ? st.music.find((m) => m.id === it.ref)?.name || it.ref : it.ref;
      return { label: name, text: `элемент таймлайна ${it.id}: ${it.kind} «${name}» (${it.kind === 'clip' ? `clips/${it.ref}` : it.kind === 'music' ? `music/${it.ref}` : `media/${it.ref}`}), ${tm(it.start)}–${tm(it.start + it.duration)} с, дорожка ${it.track}` };
    }
    case 'clip': { const c = st.clips.find((x) => x.id === id); return { label: c?.name || id, text: `клип clips/${id} («${c?.name || id}»)` }; }
    case 'music': { const m = st.music.find((x) => x.id === id); return { label: m?.name || id, text: `трек music/${id} («${m?.name || id}»)` }; }
    case 'media': return { label: id, text: `медиафайл media/${id}` };
    case 'frame': return { label: ({ script: 'Сценарий', design: 'Дизайн-система', storyboard: 'Раскадровка', layers: 'Слои', components: 'Компоненты' } as Record<string, string>)[id] || id, text: `весь раздел «${id}» на холсте` };
  }
  return { label: a, text: a };
}

function SelectionBar({ world, cam, selection, project }: { world: React.RefObject<HTMLDivElement | null>; cam: Cam; selection: string[]; project: Project }) {
  const [mode, setMode] = useState<'bar' | 'comment'>('bar');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode('bar'); setText(''); }, [selection.join('|')]);
  const w = world.current;
  if (!w) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of selection) {
    const el = w.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(a)}"]`);
    if (!el) continue;
    const r = worldRect(el, w);
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  if (!isFinite(x0)) return null;
  const left = ((x0 + x1) / 2) * cam.z + cam.x;
  // above the selection, or below it when there is no room at the top of the viewport
  const above = y0 * cam.z + cam.y - 12 > (mode === 'comment' ? 130 : 60);
  const top = above ? y0 * cam.z + cam.y - 12 : y1 * cam.z + cam.y + 12;
  const items = selection.map((a) => ({ key: a, ...describeAnchor(a, project) }));
  const toChat = () => { setState((s) => ({ chatContext: [...s.chatContext.filter((c) => !selection.includes(c.key)), ...items], sideTab: 'agent', selectedItemId: null, boardSelection: [] })); };
  const sendComment = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      // pin first, so the agent gets the note id and can resolve/delete it
      const note = await api<{ id: string }>('POST', '/api/board/notes', { anchors: selection, labels: items.map((i) => i.label), text: text.trim() });
      const task = await actions.startTask(`${withContext(text.trim(), items)}\n\n(Это комментарий на холсте, id ${note.id}. Когда сделаешь — resolve_board_note; если он неактуален — delete_board_note с причиной.)`);
      await api('PATCH', `/api/board/notes/${note.id}`, { taskId: task.id });
      setState({ boardSelection: [] });
    } finally { setBusy(false); }
  };
  return (
    <div className={'sel-bar' + (above ? '' : ' below')} style={{ left, top }} data-ui onPointerDown={(e) => e.stopPropagation()}>
      {mode === 'bar' ? (
        <>
          <span className="sel-count">{selection.length === 1 ? items[0].label : `${selection.length} ${plural(selection.length, 'объект', 'объекта', 'объектов')}`}</span>
          <button className="sel-btn primary" onClick={() => setMode('comment')}><Icon name="comment" size={13} /> Комментарий агенту</button>
          <button className="sel-btn" onClick={toChat} title="Прикрепить выделенное к сообщению в чате"><Icon name="bot" size={13} /> В чат</button>
        </>
      ) : (
        <div className="sel-comment">
          <textarea autoFocus rows={2} value={text} placeholder={`Что изменить: ${items.map((i) => i.label).join(', ')}`} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } if (e.key === 'Escape') setMode('bar'); e.stopPropagation(); }} />
          <div className="row between">
            <span className="muted xsmall">Уйдёт агенту с контекстом выделенного</span>
            <div className="row gap6"><button className="btn xs ghost" onClick={() => setMode('bar')}>Отмена</button><button className="btn xs primary" disabled={!text.trim() || busy} onClick={sendComment}>{busy ? <span className="spinner sm" /> : 'Отправить'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/** pinned comments on board objects, with live task status */
function Notes({ world, z }: { world: React.RefObject<HTMLDivElement | null>; z: number }) {
  const notes = useStore((s) => s.boardNotes);
  const tasks = useStore((s) => s.tasks);
  const [, force] = useState(0);
  useEffect(() => { const t = setTimeout(() => force((x) => x + 1), 50); return () => clearTimeout(t); }, [notes.length]);
  const w = world.current;
  if (!w) return null;
  return (
    <>
      {notes.map((n, i) => {
        const el = n.anchors.map((a) => w.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(a)}"]`)).find(Boolean);
        if (!el) return null;
        const r = worldRect(el, w);
        const task = tasks.find((t) => t.id === n.taskId);
        const st = n.status === 'resolved' ? 'done' : task?.status === 'done' ? 'open' : task?.status || 'open';
        return (
          <div key={n.id} className={`b-note st-${st}`} style={{ left: r.x + r.w - 10, top: r.y - 14, transform: `scale(${1 / Math.max(0.6, z)})` }} data-ui
            onPointerDown={(e) => e.stopPropagation()} onClick={() => task && setState({ selectedTaskId: task.id, sideTab: 'agent', selectedItemId: null })}>
            <span className="b-note-pin">{st === 'running' || st === 'queued' ? <span className="spinner sm" /> : st === 'done' ? <Icon name="check" size={10} /> : i + 1}</span>
            <div className="b-note-pop">
              <div className="b-note-text">{n.text}</div>
              {n.resolution && <div className="c-res">{n.resolution}</div>}
              <div className="b-note-meta">{n.labels.join(', ')} · {({ running: 'агент работает', queued: 'в очереди', done: 'закрыт агентом', open: 'открыт', error: 'ошибка', cancelled: 'остановлено' } as Record<string, string>)[st]}</div>
              <button className="link" onClick={(e) => { e.stopPropagation(); api('DELETE', `/api/board/notes/${n.id}`); }}>убрать</button>
            </div>
          </div>
        );
      })}
    </>
  );
}
