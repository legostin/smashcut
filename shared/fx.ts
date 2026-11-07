// Transitions, effects, masks and blend modes for timeline items.
// One pure module used by the live preview AND by the export/frame renderer (same Player in headless
// Chromium) — so what you see is exactly what you export.

export type TransitionType =
  | 'fade' | 'dip-black' | 'dip-white' | 'zoom-in' | 'zoom-out' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
  | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down' | 'wipe-diagonal' | 'iris' | 'clock' | 'blur' | 'whip-left' | 'whip-right'
  | 'spin' | 'glitch' | 'flash' | 'rise' | 'pop';

export type EffectType =
  | 'blur' | 'brightness' | 'contrast' | 'saturation' | 'hue' | 'grayscale' | 'sepia' | 'invert'
  | 'vignette' | 'grain' | 'tint' | 'shadow' | 'look' | 'ken-burns' | 'shake' | 'chromatic' | 'letterbox';

export type MaskShape = 'rect' | 'rounded' | 'ellipse' | 'linear' | 'radial';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light' | 'color-dodge' | 'color-burn' | 'darken' | 'lighten' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export interface Transition { type: TransitionType; duration: number; ease?: Ease }
export interface Effect { id?: string; type: EffectType; params?: Record<string, number | string | boolean>; enabled?: boolean }
export interface Mask { shape: MaskShape; x: number; y: number; w: number; h: number; radius?: number; feather?: number; angle?: number; invert?: boolean }
export interface ItemFx { in?: Transition; out?: Transition; effects?: Effect[]; mask?: Mask; blend?: BlendMode }
export type Ease = 'linear' | 'smooth' | 'out' | 'in' | 'expo' | 'back';

// ---------- catalog (labels for UI and agents) ----------
export const TRANSITIONS: { type: TransitionType; name: string; group: string; hint: string }[] = [
  { type: 'fade', name: 'Растворение', group: 'Базовые', hint: 'Плавная прозрачность. На стыке — классический dissolve.' },
  { type: 'dip-black', name: 'Через чёрное', group: 'Базовые', hint: 'Уход в чёрный и выход из него.' },
  { type: 'dip-white', name: 'Через белое', group: 'Базовые', hint: 'Вспышка в белый — энергичная смена сцены.' },
  { type: 'flash', name: 'Вспышка', group: 'Базовые', hint: 'Короткий засвет на стыке.' },
  { type: 'zoom-in', name: 'Наезд', group: 'Движение', hint: 'Появление с увеличением.' },
  { type: 'zoom-out', name: 'Отъезд', group: 'Движение', hint: 'Появление с уменьшением из крупного.' },
  { type: 'slide-left', name: 'Сдвиг влево', group: 'Движение', hint: 'Въезжает справа налево.' },
  { type: 'slide-right', name: 'Сдвиг вправо', group: 'Движение', hint: 'Въезжает слева направо.' },
  { type: 'slide-up', name: 'Сдвиг вверх', group: 'Движение', hint: 'Въезжает снизу.' },
  { type: 'slide-down', name: 'Сдвиг вниз', group: 'Движение', hint: 'Въезжает сверху.' },
  { type: 'rise', name: 'Подъём', group: 'Движение', hint: 'Небольшой подъём с прозрачностью — для титров и карточек.' },
  { type: 'pop', name: 'Поп', group: 'Движение', hint: 'Пружинистое появление с overshoot.' },
  { type: 'spin', name: 'Вращение', group: 'Движение', hint: 'Поворот с масштабом.' },
  { type: 'whip-left', name: 'Хлыст влево', group: 'Динамика', hint: 'Быстрый смаз-панорама.' },
  { type: 'whip-right', name: 'Хлыст вправо', group: 'Динамика', hint: 'Быстрый смаз-панорама.' },
  { type: 'blur', name: 'Расфокус', group: 'Динамика', hint: 'Из размытия в резкость.' },
  { type: 'glitch', name: 'Глитч', group: 'Динамика', hint: 'Цифровые сбои: сдвиги и цветовое расслоение.' },
  { type: 'wipe-left', name: 'Шторка влево', group: 'Шторки и маски', hint: 'Жёсткая шторка.' },
  { type: 'wipe-right', name: 'Шторка вправо', group: 'Шторки и маски', hint: 'Жёсткая шторка.' },
  { type: 'wipe-up', name: 'Шторка вверх', group: 'Шторки и маски', hint: 'Жёсткая шторка.' },
  { type: 'wipe-down', name: 'Шторка вниз', group: 'Шторки и маски', hint: 'Жёсткая шторка.' },
  { type: 'wipe-diagonal', name: 'Диагональ', group: 'Шторки и маски', hint: 'Шторка по диагонали.' },
  { type: 'iris', name: 'Диафрагма', group: 'Шторки и маски', hint: 'Раскрытие кругом из центра.' },
  { type: 'clock', name: 'Часы', group: 'Шторки и маски', hint: 'Радиальное раскрытие по часовой.' },
];

export const EFFECTS: { type: EffectType; name: string; group: string; params: { key: string; label: string; min: number; max: number; step: number; def: number }[]; options?: { key: string; label: string; values: string[]; def: string }[] }[] = [
  { type: 'look', name: 'Пресет цвета', group: 'Цвет', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 1 }], options: [{ key: 'preset', label: 'Пресет', values: ['teal-orange', 'film', 'noir', 'warm', 'cool', 'vivid', 'fade', 'cyber'], def: 'film' }] },
  { type: 'brightness', name: 'Яркость', group: 'Цвет', params: [{ key: 'value', label: 'Яркость', min: 0, max: 2, step: 0.01, def: 1.1 }] },
  { type: 'contrast', name: 'Контраст', group: 'Цвет', params: [{ key: 'value', label: 'Контраст', min: 0, max: 2, step: 0.01, def: 1.15 }] },
  { type: 'saturation', name: 'Насыщенность', group: 'Цвет', params: [{ key: 'value', label: 'Насыщенность', min: 0, max: 3, step: 0.01, def: 1.3 }] },
  { type: 'hue', name: 'Оттенок', group: 'Цвет', params: [{ key: 'deg', label: 'Сдвиг, °', min: -180, max: 180, step: 1, def: 20 }] },
  { type: 'grayscale', name: 'Ч/Б', group: 'Цвет', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 1 }] },
  { type: 'sepia', name: 'Сепия', group: 'Цвет', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 0.8 }] },
  { type: 'invert', name: 'Инверсия', group: 'Цвет', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 1 }] },
  { type: 'tint', name: 'Тонирование', group: 'Цвет', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 0.35 }], options: [{ key: 'color', label: 'Цвет', values: [], def: '#ff6a3d' }] },
  { type: 'blur', name: 'Размытие', group: 'Стилизация', params: [{ key: 'px', label: 'Радиус, px', min: 0, max: 60, step: 0.5, def: 8 }] },
  { type: 'vignette', name: 'Виньетка', group: 'Стилизация', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 0.55 }, { key: 'size', label: 'Размер', min: 0.2, max: 1, step: 0.01, def: 0.62 }] },
  { type: 'grain', name: 'Плёночное зерно', group: 'Стилизация', params: [{ key: 'amount', label: 'Сила', min: 0, max: 1, step: 0.01, def: 0.18 }, { key: 'size', label: 'Размер', min: 0.5, max: 3, step: 0.1, def: 1.2 }] },
  { type: 'chromatic', name: 'Хроматическая аберрация', group: 'Стилизация', params: [{ key: 'px', label: 'Сдвиг, px', min: 0, max: 20, step: 0.5, def: 4 }] },
  { type: 'shadow', name: 'Тень', group: 'Стилизация', params: [{ key: 'blur', label: 'Размытие', min: 0, max: 80, step: 1, def: 30 }, { key: 'y', label: 'Смещение', min: 0, max: 60, step: 1, def: 16 }, { key: 'opacity', label: 'Плотность', min: 0, max: 1, step: 0.01, def: 0.5 }] },
  { type: 'letterbox', name: 'Кинокаше', group: 'Стилизация', params: [{ key: 'ratio', label: 'Соотношение', min: 1.78, max: 2.76, step: 0.01, def: 2.39 }] },
  { type: 'ken-burns', name: 'Кен Бёрнс', group: 'Движение', params: [{ key: 'from', label: 'Масштаб от', min: 1, max: 1.6, step: 0.01, def: 1 }, { key: 'to', label: 'Масштаб до', min: 1, max: 1.6, step: 0.01, def: 1.15 }, { key: 'x', label: 'Сдвиг X, %', min: -20, max: 20, step: 0.5, def: -3 }, { key: 'y', label: 'Сдвиг Y, %', min: -20, max: 20, step: 0.5, def: -2 }] },
  { type: 'shake', name: 'Тряска камеры', group: 'Движение', params: [{ key: 'px', label: 'Амплитуда, px', min: 0, max: 40, step: 0.5, def: 6 }, { key: 'speed', label: 'Скорость', min: 1, max: 30, step: 0.5, def: 10 }] },
];

export const MASKS: { shape: MaskShape; name: string; hint: string; def: Mask }[] = [
  { shape: 'rect', name: 'Прямоугольник', hint: 'Обрезка кадра рамкой.', def: { shape: 'rect', x: 0.1, y: 0.1, w: 0.8, h: 0.8, feather: 0 } },
  { shape: 'rounded', name: 'Скруглённая карточка', hint: 'Видео в «карточке» со скруглением.', def: { shape: 'rounded', x: 0.12, y: 0.12, w: 0.76, h: 0.76, radius: 0.06, feather: 0 } },
  { shape: 'ellipse', name: 'Круг / эллипс', hint: 'Видео в круге — «говорящая голова».', def: { shape: 'ellipse', x: 0.32, y: 0.18, w: 0.36, h: 0.64, feather: 0 } },
  { shape: 'radial', name: 'Мягкое пятно', hint: 'Радиальная маска с растушёвкой.', def: { shape: 'radial', x: 0.2, y: 0.15, w: 0.6, h: 0.7, feather: 120 } },
  { shape: 'linear', name: 'Градиентная', hint: 'Растворение к краю — склейка двух планов.', def: { shape: 'linear', x: 0, y: 0, w: 1, h: 1, angle: 90, feather: 300 } },
];

export const BLENDS: { mode: BlendMode; name: string }[] = [
  { mode: 'normal', name: 'Обычный' }, { mode: 'multiply', name: 'Умножение' }, { mode: 'screen', name: 'Экран' }, { mode: 'overlay', name: 'Перекрытие' },
  { mode: 'soft-light', name: 'Мягкий свет' }, { mode: 'hard-light', name: 'Жёсткий свет' }, { mode: 'color-dodge', name: 'Осветление основы' }, { mode: 'color-burn', name: 'Затемнение основы' },
  { mode: 'darken', name: 'Замена тёмным' }, { mode: 'lighten', name: 'Замена светлым' }, { mode: 'difference', name: 'Разница' }, { mode: 'exclusion', name: 'Исключение' },
  { mode: 'hue', name: 'Цветовой тон' }, { mode: 'saturation', name: 'Насыщенность' }, { mode: 'color', name: 'Цветность' }, { mode: 'luminosity', name: 'Яркость' },
];

// ---------- math ----------
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const EASES: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  expo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
function rnd(seed: number) { let a = seed | 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function noise1(x: number, seed: number) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (rnd(i * 7919 + seed) * (1 - u) + rnd((i + 1) * 7919 + seed) * u) * 2 - 1; }

export interface LayerFrame {
  opacity: number;
  transform: string;
  filter: string;
  clipPath: string;
  maskImage: string;
  maskComposite?: 'intersect';
  blend: BlendMode;
  /** full-frame colour overlays drawn above the layer content (dips, tints, flashes) */
  overlays: { color: string; opacity: number; blend?: string }[];
  vignette?: { amount: number; size: number };
  grain?: { amount: number; size: number; seed: number };
  letterbox?: number;
  chromatic?: number;
  shadow?: string;
  /** audio gain multiplier (fades) */
  gain: number;
}

const LOOKS: Record<string, { filter: string; overlay?: { color: string; opacity: number; blend: string } }> = {
  'teal-orange': { filter: 'contrast(1.12) saturate(1.18)', overlay: { color: 'linear-gradient(135deg,#00a6b4,#ff8a3d)', opacity: 0.18, blend: 'soft-light' } },
  film: { filter: 'contrast(1.08) saturate(0.88) sepia(0.12) brightness(1.02)', overlay: { color: '#ffcf99', opacity: 0.08, blend: 'overlay' } },
  noir: { filter: 'grayscale(1) contrast(1.35) brightness(0.95)' },
  warm: { filter: 'saturate(1.1) sepia(0.18) brightness(1.03)', overlay: { color: '#ff9a3d', opacity: 0.1, blend: 'soft-light' } },
  cool: { filter: 'saturate(1.05) hue-rotate(-8deg) brightness(1.02)', overlay: { color: '#3d8bff', opacity: 0.12, blend: 'soft-light' } },
  vivid: { filter: 'saturate(1.45) contrast(1.12)' },
  fade: { filter: 'contrast(0.82) brightness(1.08) saturate(0.85)', overlay: { color: '#1a1f2e', opacity: 0.1, blend: 'lighten' } },
  cyber: { filter: 'saturate(1.35) contrast(1.15) hue-rotate(-12deg)', overlay: { color: 'linear-gradient(180deg,#ff2bd6,#21e6ff)', opacity: 0.16, blend: 'overlay' } },
};

const num = (e: Effect, k: string, d: number) => { const v = e.params?.[k]; return typeof v === 'number' ? v : v != null && !isNaN(Number(v)) ? Number(v) : d; };
const defOf = (type: EffectType, key: string) => EFFECTS.find((x) => x.type === type)?.params.find((p) => p.key === key)?.def ?? 0;

/**
 * State of an item's layer at local time `lt` (seconds since the item started, 0..dur).
 * `size` is the project frame in px (for pixel-based effects).
 */
export function layerFrame(fx: ItemFx | undefined, lt: number, dur: number, size: { width: number; height: number }, seed = 1): LayerFrame {
  const f: LayerFrame = { opacity: 1, transform: '', filter: '', clipPath: '', maskImage: '', blend: fx?.blend || 'normal', overlays: [], gain: 1 };
  if (!fx) return f;
  const tx: string[] = [];
  const filters: string[] = [];
  const clips: string[] = [];
  const W = size.width, H = size.height;

  const apply = (tr: Transition | undefined, phase: 'in' | 'out') => {
    if (!tr || !tr.duration) return;
    const d = Math.min(tr.duration, dur);
    // p: 0 → hidden, 1 → fully shown
    const raw = phase === 'in' ? lt / d : (dur - lt) / d;
    if (raw >= 1) return;
    const p = (EASES[tr.ease || (phase === 'in' ? 'out' : 'in')] || EASES.smooth)(clamp(raw));
    const q = 1 - p;
    const s = phase === 'in' ? 1 : -1; // direction sign for "leaves the other way"
    switch (tr.type) {
      case 'fade': f.opacity *= p; f.gain *= p; break;
      case 'dip-black': f.overlays.push({ color: '#000', opacity: q }); f.gain *= p; break;
      case 'dip-white': f.overlays.push({ color: '#fff', opacity: q }); f.gain *= p; break;
      case 'flash': f.overlays.push({ color: '#fff', opacity: Math.pow(q, 1.6) }); break;
      case 'zoom-in': f.opacity *= clamp(p * 1.6); tx.push(`scale(${0.7 + 0.3 * p})`); break;
      case 'zoom-out': f.opacity *= clamp(p * 1.6); tx.push(`scale(${1.35 - 0.35 * p})`); break;
      case 'slide-left': tx.push(`translateX(${q * 100 * s}%)`); break;
      case 'slide-right': tx.push(`translateX(${-q * 100 * s}%)`); break;
      case 'slide-up': tx.push(`translateY(${q * 100 * s}%)`); break;
      case 'slide-down': tx.push(`translateY(${-q * 100 * s}%)`); break;
      case 'rise': f.opacity *= p; tx.push(`translateY(${q * 6 * s}%)`); break;
      case 'pop': { const b = phase === 'in' ? EASES.back(clamp(raw)) : p; f.opacity *= clamp(raw * 2.5); tx.push(`scale(${0.6 + 0.4 * b})`); break; }
      case 'spin': f.opacity *= p; tx.push(`rotate(${q * 90 * s}deg) scale(${0.6 + 0.4 * p})`); break;
      case 'whip-left': tx.push(`translateX(${q * 100 * s}%)`); filters.push(`blur(${q * 40}px)`); break;
      case 'whip-right': tx.push(`translateX(${-q * 100 * s}%)`); filters.push(`blur(${q * 40}px)`); break;
      case 'blur': f.opacity *= clamp(p * 1.5); filters.push(`blur(${q * 30}px)`); break;
      case 'glitch': {
        const k = Math.floor(lt * 24);
        const amp = q * 40;
        tx.push(`translate(${(rnd(k * 31 + seed) - 0.5) * amp * 2}px, ${(rnd(k * 17 + seed) - 0.5) * amp * 0.6}px)`);
        f.chromatic = Math.max(f.chromatic || 0, q * 14);
        f.opacity *= rnd(k * 13 + seed) < q * 0.35 ? 0.35 : 1;
        filters.push(`hue-rotate(${(rnd(k * 7 + seed) - 0.5) * q * 120}deg)`);
        break;
      }
      case 'wipe-left': clips.push(`inset(0 0 0 ${q * 100}%)`); break;
      case 'wipe-right': clips.push(`inset(0 ${q * 100}% 0 0)`); break;
      case 'wipe-up': clips.push(`inset(${q * 100}% 0 0 0)`); break;
      case 'wipe-down': clips.push(`inset(0 0 ${q * 100}% 0)`); break;
      case 'wipe-diagonal': { const a = p * 200; clips.push(`polygon(0 0, ${a}% 0, ${a - 100}% 100%, 0 100%)`); break; }
      case 'iris': clips.push(`circle(${p * 75}% at 50% 50%)`); break;
      case 'clock': if (p < 1) f.maskImage = `conic-gradient(from 0deg at 50% 50%, #000 ${p * 360}deg, transparent ${p * 360}deg)`; break;
    }
  };
  apply(fx.in, 'in');
  apply(fx.out, 'out');

  for (const e of fx.effects || []) {
    if (e.enabled === false) continue;
    switch (e.type) {
      case 'blur': filters.push(`blur(${num(e, 'px', defOf('blur', 'px'))}px)`); break;
      case 'brightness': filters.push(`brightness(${num(e, 'value', 1.1)})`); break;
      case 'contrast': filters.push(`contrast(${num(e, 'value', 1.15)})`); break;
      case 'saturation': filters.push(`saturate(${num(e, 'value', 1.3)})`); break;
      case 'hue': filters.push(`hue-rotate(${num(e, 'deg', 20)}deg)`); break;
      case 'grayscale': filters.push(`grayscale(${num(e, 'amount', 1)})`); break;
      case 'sepia': filters.push(`sepia(${num(e, 'amount', 0.8)})`); break;
      case 'invert': filters.push(`invert(${num(e, 'amount', 1)})`); break;
      case 'tint': f.overlays.push({ color: String(e.params?.color || '#ff6a3d'), opacity: num(e, 'amount', 0.35), blend: 'color' }); break;
      case 'look': {
        const L = LOOKS[String(e.params?.preset || 'film')] || LOOKS.film;
        const a = num(e, 'amount', 1);
        if (a >= 0.999) filters.push(L.filter);
        else filters.push(L.filter.replace(/([a-z-]+)\(([-\d.]+)(deg)?\)/g, (_m, fn, v, u) => {
          const n = Number(v); const neutral = fn === 'hue-rotate' || fn === 'sepia' || fn === 'grayscale' ? 0 : 1;
          return `${fn}(${neutral + (n - neutral) * a}${u || ''})`;
        }));
        if (L.overlay) f.overlays.push({ ...L.overlay, opacity: L.overlay.opacity * a });
        break;
      }
      case 'vignette': f.vignette = { amount: num(e, 'amount', 0.55), size: num(e, 'size', 0.62) }; break;
      case 'grain': f.grain = { amount: num(e, 'amount', 0.18), size: num(e, 'size', 1.2), seed: Math.floor(lt * 24) + seed * 101 }; break;
      case 'chromatic': f.chromatic = Math.max(f.chromatic || 0, num(e, 'px', 4)); break;
      case 'shadow': f.shadow = `drop-shadow(0 ${num(e, 'y', 16)}px ${num(e, 'blur', 30)}px rgba(0,0,0,${num(e, 'opacity', 0.5)}))`; break;
      case 'letterbox': f.letterbox = num(e, 'ratio', 2.39); break;
      case 'ken-burns': {
        const k = clamp(dur > 0 ? lt / dur : 0);
        const sc = num(e, 'from', 1) + (num(e, 'to', 1.15) - num(e, 'from', 1)) * EASES.smooth(k);
        tx.unshift(`translate(${num(e, 'x', -3) * k}%, ${num(e, 'y', -2) * k}%) scale(${sc})`);
        break;
      }
      case 'shake': {
        const a = num(e, 'px', 6), sp = num(e, 'speed', 10);
        tx.unshift(`translate(${noise1(lt * sp, seed * 3 + 1) * a}px, ${noise1(lt * sp, seed * 3 + 2) * a}px) rotate(${noise1(lt * sp * 0.7, seed * 3 + 3) * a * 0.04}deg)`);
        break;
      }
    }
  }

  if (fx.mask) {
    const m = fx.mask;
    const L = m.x * 100, T = m.y * 100, R = (1 - m.x - m.w) * 100, B = (1 - m.y - m.h) * 100;
    const feather = m.feather || 0;
    if ((m.shape === 'rect' || m.shape === 'rounded') && !feather && !m.invert) {
      const r = m.shape === 'rounded' ? ` round ${(m.radius ?? 0.06) * Math.min(W, H)}px` : '';
      clips.push(`inset(${T}% ${R}% ${B}% ${L}%${r})`);
    } else if (m.shape === 'ellipse' && !feather && !m.invert) {
      clips.push(`ellipse(${(m.w / 2) * 100}% ${(m.h / 2) * 100}% at ${(m.x + m.w / 2) * 100}% ${(m.y + m.h / 2) * 100}%)`);
    } else {
      // soft / inverted masks via mask-image gradients (feather in px of the project frame)
      const fx0 = feather / Math.max(W, H);
      const inner = m.invert ? 'transparent' : '#000', outer = m.invert ? '#000' : 'transparent';
      let img = '';
      if (m.shape === 'linear') {
        const ang = m.angle ?? 90;
        const span = clamp(fx0 * 100, 0.5, 100);
        img = `linear-gradient(${ang}deg, ${outer} ${50 - span / 2}%, ${inner} ${50 + span / 2}%)`;
      } else if (m.shape === 'radial' || m.shape === 'ellipse') {
        const cx = (m.x + m.w / 2) * 100, cy = (m.y + m.h / 2) * 100;
        const soft = clamp(fx0 / Math.max(0.01, Math.max(m.w, m.h)) * 100, 0, 100);
        img = `radial-gradient(${(m.w / 2) * 100}% ${(m.h / 2) * 100}% at ${cx}% ${cy}%, ${inner} ${100 - soft}%, ${outer} 100%)`;
      } else {
        const fp = (feather / W) * 100, fpy = (feather / H) * 100;
        img = `linear-gradient(90deg, ${outer} ${L}%, ${inner} ${L + fp}%, ${inner} ${100 - R - fp}%, ${outer} ${100 - R}%), linear-gradient(180deg, ${outer} ${T}%, ${inner} ${T + fpy}%, ${inner} ${100 - B - fpy}%, ${outer} ${100 - B}%)`;
        if (!m.invert) f.maskComposite = 'intersect';
      }
      f.maskImage = f.maskImage ? `${f.maskImage}, ${img}` : img;
    }
  }

  f.transform = tx.join(' ');
  if (f.shadow) filters.push(f.shadow);
  f.filter = filters.join(' ');
  f.clipPath = clips[clips.length - 1] || '';
  return f;
}

/** audio gain at local time for fades (in/out transitions on audio items) */
export function audioGain(fx: ItemFx | undefined, lt: number, dur: number) {
  return layerFrame(fx, lt, dur, { width: 1920, height: 1080 }).gain;
}
