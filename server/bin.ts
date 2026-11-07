// Resolves external binaries (ffmpeg / ffprobe) once: an explicit env override, then the system one
// (PATH plus the usual Homebrew/system dirs, which a GUI-launched process may lack), then the npm fallbacks
// `ffmpeg-static` / `@ffprobe-installer/ffprobe` (optionalDependencies). Every spawn of ffmpeg/ffprobe goes through `bin()`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export type BinName = 'ffmpeg' | 'ffprobe';
export interface BinInfo { name: BinName; path: string | null; source: 'env' | 'system' | 'bundled' | 'missing' }

const require = createRequire(import.meta.url);
const ENV: Record<BinName, string[]> = { ffmpeg: ['STUDIO_FFMPEG', 'FFMPEG_PATH'], ffprobe: ['STUDIO_FFPROBE', 'FFPROBE_PATH'] };
const EXTRA_DIRS = process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/snap/bin'];

function isExec(p: string) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}
/** absolute path of `name` on PATH (+ common dirs), or null */
export function which(name: string): string | null {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...EXTRA_DIRS].filter(Boolean);
  for (const d of [...new Set(dirs)]) for (const e of exts) { const p = path.join(d, name + e); if (isExec(p)) return p; }
  return null;
}

function bundled(name: BinName): string | null {
  try {
    const p: string | null = name === 'ffmpeg' ? require('ffmpeg-static') : require('@ffprobe-installer/ffprobe').path;
    return p && isExec(p) ? p : null;
  } catch { return null; }
}

const cache = new Map<BinName, BinInfo>();
export function binInfo(name: BinName): BinInfo {
  const hit = cache.get(name);
  if (hit) return hit;
  let info: BinInfo = { name, path: null, source: 'missing' };
  const env = ENV[name].map((k) => process.env[k]).find((v) => v && isExec(v));
  if (env) info = { name, path: env, source: 'env' };
  else {
    const sys = which(name);
    if (sys) info = { name, path: sys, source: 'system' };
    else { const b = bundled(name); if (b) info = { name, path: b, source: 'bundled' }; }
  }
  cache.set(name, info);
  return info;
}

/** the command to spawn for ffmpeg/ffprobe (absolute path when found; the bare name otherwise, so errors stay readable) */
export function bin(name: BinName): string { return binInfo(name).path || name; }

/** map a command name through the resolver (used by util.run) */
export function resolveCmd(cmd: string): string { return cmd === 'ffmpeg' || cmd === 'ffprobe' ? bin(cmd) : cmd; }

let ffMajor: number | undefined;
/** major version of the resolved ffmpeg (0 if unknown) — some options differ between 6.x and 7+ */
export function ffmpegMajor(): number {
  if (ffMajor == null) {
    try {
      const r = spawnSync(bin('ffmpeg'), ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 5000 });
      const m = /ffmpeg version n?(\d+)\./.exec(r.stdout || '');
      ffMajor = m ? Number(m[1]) : 0;
    } catch { ffMajor = 0; }
  }
  return ffMajor;
}
/** `-filter_complex` read from a file: `-/filter_complex` on ffmpeg ≥ 7, `-filter_complex_script` before (removed in 8) */
export function filterComplexFileArgs(file: string): string[] {
  const v = ffmpegMajor();
  return v && v < 7 ? ['-filter_complex_script', file] : ['-/filter_complex', file];
}

/** when ffmpeg/ffprobe come from the npm fallbacks, put them on PATH too — agents (claude/codex) spawned by the editor inherit it */
export function exposeBundledBins() {
  const dirs = (['ffmpeg', 'ffprobe'] as const).map(binInfo).filter((b) => b.source === 'bundled' && path.basename(b.path!).startsWith(b.name)).map((b) => path.dirname(b.path!));
  if (dirs.length) process.env.PATH = [...new Set(dirs), process.env.PATH || ''].join(path.delimiter);
}
