import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { run, Mutex } from './util.ts';

const mutex = new Mutex();
const ENV = { GIT_AUTHOR_NAME: 'Agent Video Studio', GIT_AUTHOR_EMAIL: 'studio@localhost', GIT_COMMITTER_NAME: 'Agent Video Studio', GIT_COMMITTER_EMAIL: 'studio@localhost' };

export async function gitInit(dir: string) {
  if (fs.existsSync(path.join(dir, '.git'))) return;
  await run('git', ['init', '-q'], { cwd: dir });
  await commit(dir, 'Project created');
}

export function commit(dir: string, message: string, paths: string[] = ['-A']): Promise<string | null> {
  return mutex.run(async () => {
    const addArgs = paths[0] === '-A' ? ['add', '-A'] : ['add', '-A', '--', ...paths.filter((p) => fs.existsSync(path.join(dir, p)))];
    await run('git', addArgs, { cwd: dir, env: ENV });
    const st = await run('git', ['diff', '--cached', '--quiet'], { cwd: dir });
    if (st.code === 0) return head(dir);
    const r = await run('git', ['commit', '-q', '-m', message], { cwd: dir, env: ENV });
    if (r.code !== 0) return null;
    return head(dir);
  });
}

export async function head(dir: string) {
  const r = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir });
  return r.code === 0 ? r.stdout.trim() : null;
}

export interface Version { sha: string; date: string; message: string }
export async function log(dir: string, rel?: string, limit = 50): Promise<Version[]> {
  const args = ['log', `-n${limit}`, '--format=%h%x1f%cI%x1f%s'];
  if (rel) args.push('--', rel);
  const r = await run('git', args, { cwd: dir });
  if (r.code !== 0) return [];
  return r.stdout.trim().split('\n').filter(Boolean).map((l) => { const [sha, date, message] = l.split('\x1f'); return { sha, date, message }; });
}

export function restore(dir: string, sha: string, rel: string) {
  return mutex.run(async () => {
    await run('git', ['checkout', sha, '--', rel], { cwd: dir });
  });
}

/** materialise `rel` at commit `sha` into `outDir` (keeps relative structure) */
export async function exportAt(dir: string, sha: string, rel: string, outDir: string) {
  if (fs.existsSync(path.join(outDir, rel))) return;
  fs.mkdirSync(outDir, { recursive: true });
  const r = await run('git', ['ls-tree', '-r', '--name-only', sha, '--', rel], { cwd: dir });
  for (const f of r.stdout.trim().split('\n').filter(Boolean)) {
    const show = await new Promise<Buffer>((resolve, reject) => {
      const p = spawn('git', ['show', `${sha}:${f}`], { cwd: dir });
      const chunks: Buffer[] = [];
      p.stdout.on('data', (d: Buffer) => chunks.push(d));
      p.on('close', (code: number) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('git show failed ' + f))));
    });
    const dst = path.join(outDir, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, show);
  }
}
