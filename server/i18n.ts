// Server-side user-facing messages are English keys with {params}; the web UI translates them
// (web/src/locales/*.json). Agents always work in English.
export type Params = Record<string, string | number>;
export const fill = (key: string, params?: Params) => (params ? key.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m)) : key);

/** an Error whose message is an English key the UI can translate */
export function uerr(key: string, params?: Params, statusCode = 400): Error {
  return Object.assign(new Error(fill(key, params)), { statusCode, key, params });
}
/** fields for bus notices / events: { text, key, params } */
export const msg = (key: string, params?: Params) => ({ text: fill(key, params), key, params });
