import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';

export const nid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export interface RunResult { code: number; stdout: string; stderr: string }
export function run(cmd: string, args: string[], opts: { cwd?: string; input?: string | Buffer; env?: NodeJS.ProcessEnv; onStderr?: (s: string) => void } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => { stderr += d; opts.onStderr?.(String(d)); });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (opts.input != null) p.stdin.end(opts.input); else p.stdin.end();
  });
}
export async function runOk(cmd: string, args: string[], opts: Parameters<typeof run>[2] = {}) {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')}… failed (${r.code}): ${r.stderr.slice(-1500)}`);
  return r;
}

export function hashDir(dir: string, extra = ''): string {
  const h = crypto.createHash('sha1');
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('preview.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); }
    }
  };
  walk(dir);
  h.update(extra);
  return h.digest('hex').slice(0, 16);
}
export const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
export function copyDir(src: string, dst: string, skip: (name: string) => boolean = (n) => n.startsWith('preview.')) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, skip); else fs.copyFileSync(s, d);
  }
}
export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
}
/** serialise async work */
export class Mutex {
  private p: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.p.then(fn, fn);
    this.p = next.catch(() => {});
    return next;
  }
}
export function safeJoin(base: string, rel: string) {
  const p = path.resolve(base, rel);
  if (p !== base && !p.startsWith(base + path.sep)) throw new Error('path escapes base: ' + rel);
  return p;
}
