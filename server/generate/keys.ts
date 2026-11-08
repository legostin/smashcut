// API keys of generation providers: Settings first (stored locally in ~/.smashcut/settings.json), then env.
import { getSettings } from '../config.ts';
import type { Provider } from './types.ts';
import { genError } from './http.ts';

export function keyInfo(p: Pick<Provider, 'keyField' | 'envKeys'>): { key: string; source?: 'settings' | 'env' } {
  const s = getSettings() as any;
  const k = p.keyField ? String(s[p.keyField] || '').trim() : '';
  if (k) return { key: k, source: 'settings' };
  for (const e of p.envKeys || []) if (process.env[e]) return { key: String(process.env[e]).trim(), source: 'env' };
  return { key: '' };
}

/** the provider's key or a clear "no key" error */
export function needKey(p: Pick<Provider, 'keyField' | 'envKeys' | 'title' | 'keyUrl'>, override?: string): string {
  const k = override || keyInfo(p).key;
  if (!k) throw genError('no_key', { provider: p.title, url: p.keyUrl || '' }, 400);
  return k;
}

/** base URL with an env override for tests / proxies (e.g. STUDIO_FAL_BASE) */
export const base = (env: string, dflt: string) => (process.env[env] || dflt).replace(/\/+$/, '');
