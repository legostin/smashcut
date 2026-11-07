// i18n: English is the source language (keys are the English strings).
// Locale files: web/src/locales/<code>.json → { "English source": "translation" | { one, few, many, other } }
import { useSyncExternalStore } from 'react';

export const LANGS = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'pt', name: 'Português' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
] as const;
export type Lang = (typeof LANGS)[number]['code'];

type Entry = string | { zero?: string; one?: string; two?: string; few?: string; many?: string; other?: string };
const files = import.meta.glob('./locales/*.json', { eager: true }) as Record<string, { default: Record<string, Entry> }>;
const dicts: Record<string, Record<string, Entry>> = {};
for (const [p, m] of Object.entries(files)) dicts[p.replace(/^.*\/(\w+)\.json$/, '$1')] = m.default;

function detect(): Lang {
  try { const saved = localStorage.getItem('lang'); if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang; } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return (LANGS.some((l) => l.code === nav) ? nav : 'en') as Lang;
}

let locale: Lang = detect();
const subs = new Set<() => void>();
export const getLocale = () => locale;
export const langName = (code: string = locale) => LANGS.find((l) => l.code === code)?.name || 'English';
export function setLocale(code: Lang) {
  locale = code;
  try { localStorage.setItem('lang', code); } catch {}
  document.documentElement.lang = code;
  subs.forEach((f) => f());
}
/** re-render on language change */
export function useLocale(): Lang { return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => locale); }
document.documentElement.lang = locale;

const fill = (s: string, params?: Record<string, unknown>) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m)) : s);

/** translate an English UI string; {name} placeholders are filled from params */
export function t(en: string, params?: Record<string, unknown>): string {
  const e = dicts[locale]?.[en];
  const s = typeof e === 'string' && e ? e : typeof e === 'object' && e ? e.other || en : en;
  return fill(s, params);
}

/**
 * plural: tn(3, '{n} scene', '{n} scenes') — the dictionary key is "{n} scene|{n} scenes" and its value
 * is an object of CLDR categories ({ one, few, many, other }) or a "a|b" string for two-form languages.
 */
export function tn(n: number, one: string, other: string, params?: Record<string, unknown>): string {
  const key = `${one}|${other}`;
  const e = dicts[locale]?.[key];
  const cat = new Intl.PluralRules(locale).select(n) as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
  let s: string;
  if (e && typeof e === 'object') s = e[cat] || e.other || e.many || (n === 1 ? one : other);
  else if (typeof e === 'string' && e.includes('|')) { const [a, b] = e.split('|'); s = cat === 'one' ? a : b; }
  else s = n === 1 ? one : other;
  return fill(s, { n, ...params });
}

/** locale-aware number / date helpers */
export const fmtNumber = (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, opts).format(n);
export const fmtDate = (d: Date | string | number) => new Date(d).toLocaleString(locale);
