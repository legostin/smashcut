// End-to-end smoke test: boots the server in a temp sandbox, then exercises
// project creation, every gallery template (lint + render), music render, composite frames,
// comments API, MCP tool listing and a short export.  Run: npm test
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-smoke-'));
const PORT = 4500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };

async function api(method: string, url: string, body?: unknown) {
  const r = await fetch(BASE + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const server = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, 'server/index.ts'), path.join(tmp, 'projects', 'smoke')], {
  cwd: ROOT, env: { ...process.env, STUDIO_PORT: String(PORT), STUDIO_HOME: path.join(tmp, 'home'), STUDIO_PROJECTS: path.join(tmp, 'projects') }, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

try {
  for (let i = 0; i < 120; i++) {
    try { const j = await (await fetch(BASE + '/api/state')).json(); if (j.project) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  const st = await api('GET', '/api/state');
  ok('server up, project open', !!st.project, st.dir);

  // gallery
  const gallery = await api('GET', '/api/gallery');
  const clips = gallery.filter((g: any) => g.kind === 'clip' && g.origin === 'builtin');
  const music = gallery.filter((g: any) => g.kind === 'music' && g.origin === 'builtin');
  ok('gallery has clips & music', clips.length > 0 && music.length > 0, `${clips.length} clips, ${music.length} music`);

  let t = 0;
  for (const g of clips) {
    const r = await api('POST', '/api/gallery/use', { origin: 'builtin', kind: 'clip', id: g.id, place: { start: t, duration: Math.min(3, g.duration || 3) } });
    const lint = await api('POST', '/api/agent/lint-clip', { clipId: r.id });
    ok(`template ${g.id} passes lint`, lint.ok, lint.issues.join('; '));
    t += 3;
  }
  for (const g of music.slice(0, 2)) {
    const r = await api('POST', '/api/gallery/use', { origin: 'builtin', kind: 'music', id: g.id, place: { start: 0, duration: 6 } });
    const res = await api('POST', '/api/agent/render-music', { musicId: r.id });
    ok(`music ${g.id} renders`, !!res.summary.rendered && res.summary.peakDbfs > -20 && res.summary.peakDbfs <= 0.5, `peak ${res.summary.peakDbfs} dBFS, ${res.summary.bpm} bpm`);
  }
  const timing = await api('GET', '/api/timing');
  ok('timing has beats from music', timing.beats.length > 4, `${timing.beats.length} beats`);

  const frame = await api('POST', '/api/agent/render-frame', { times: [1, 4] });
  ok('composite frame renders', frame.png.length > 10000 && frame.errors.length === 0, frame.errors.join('; '));

  const c = await api('POST', '/api/comments', { time: 1, x: 0.5, y: 0.5, text: 'smoke' });
  await api('POST', `/api/comments/${c.id}/resolve`, { note: 'ok' });
  const comments = await api('GET', '/api/comments');
  ok('comment resolve flow', comments.find((x: any) => x.id === c.id)?.status === 'resolved');

  // MCP
  const tr = new StdioClientTransport({ command: process.execPath, args: [path.join(ROOT, 'server/mcp/stdio.mjs')], env: { ...process.env, STUDIO_URL: BASE } as Record<string, string> });
  const mcp = new Client({ name: 'smoke', version: '1' });
  await mcp.connect(tr);
  const tools = await mcp.listTools();
  ok('MCP lists tools', tools.tools.length >= 15, tools.tools.map((x) => x.name).join(','));
  const ov: any = await mcp.callTool({ name: 'get_project', arguments: {} });
  ok('MCP get_project', JSON.parse(ov.content[0].text).items.length > 0);
  await mcp.close();

  // ---------- export ----------
  const runExport = async (body: object) => {
    const job = await api('POST', '/api/export', body);
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const s = await api('GET', '/api/state');
      const j = s.jobs.find((x: any) => x.id === job.id);
      if (j && j.status !== 'running') return j;
    }
    return null;
  };
  const sh = (cmd: string, args: string[]) => new Promise<{ out: Buffer; err: string }>((res) => {
    const pr = spawn(cmd, args); const out: Buffer[] = []; let err = '';
    pr.stdout.on('data', (d) => out.push(d)); pr.stderr.on('data', (d) => (err += d)); pr.on('close', () => res({ out: Buffer.concat(out), err }));
  });

  const mp4 = await runExport({ from: 0, to: 2, format: 'mp4' });
  const mp4File = mp4 && path.join(st.dir, mp4.output || '');
  ok('export mp4', mp4?.status === 'done' && fs.existsSync(mp4File), mp4?.error || mp4?.output);
  if (mp4?.status === 'done') {
    const probe = (await sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_space,color_primaries,color_transfer', '-of', 'csv=p=0', mp4File])).out.toString().trim();
    ok('mp4 tagged BT.709', probe.split(',').every((x) => x === 'bt709'), probe);
    // preview ↔ export parity: the composite frame the agent/viewer sees vs the decoded export frame
    const ref = Buffer.from((await api('POST', '/api/agent/render-frame', { times: [1.0] })).png, 'base64');
    const refFile = path.join(tmp, 'ref.png');
    fs.writeFileSync(refFile, ref);
    const psnr = await sh('ffmpeg', ['-v', 'info', '-i', refFile, '-ss', '1.0', '-i', mp4File, '-frames:v', '1', '-lavfi', '[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr', '-f', 'null', '-']);
    const db = Number(/average:([\d.]+|inf)/.exec(psnr.err)?.[1]?.replace('inf', '99'));
    ok('preview ↔ export parity (PSNR ≥ 32 dB)', db >= 32, `${db} dB`);
  }
  // transparency: export the window of an overlay template (lower third) only
  const lt = (await api('GET', '/api/project')).items.find((i: any) => i.ref === 'lower-third-slide');
  const mov = await runExport({ from: lt.start, to: lt.start + 1.5, format: 'prores', transparent: true });
  if (mov?.status === 'done') {
    const a = (await sh('ffmpeg', ['-v', 'error', '-ss', '1.0', '-i', path.join(st.dir, mov.output), '-frames:v', '1', '-vf', 'alphaextract,scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])).out[0];
    ok('prores 4444 keeps transparency', a < 250, `mean alpha ${a}`);
  } else ok('prores 4444 export', false, mov?.error);
  const job2 = await api('POST', '/api/export', { from: 0, to: 6, format: 'mp4', motionBlur: 8 });
  await new Promise((r) => setTimeout(r, 1500));
  await api('POST', `/api/export/${job2.id}/cancel`);
  await new Promise((r) => setTimeout(r, 2500));
  const j2 = (await api('GET', '/api/state')).jobs.find((x: any) => x.id === job2.id);
  ok('export cancel', j2?.status === 'error' && /Отменено/.test(j2.error || ''), j2?.status);

  // ---------- undo / redo ----------
  const before = (await api('GET', '/api/project')).items.length;
  const victim = (await api('GET', '/api/project')).items[0].id;
  await api('DELETE', `/api/items/${victim}`);
  await new Promise((r) => setTimeout(r, 800));
  await api('POST', '/api/undo');
  const afterUndo = (await api('GET', '/api/project')).items.length;
  await api('POST', '/api/redo');
  const afterRedo = (await api('GET', '/api/project')).items.length;
  ok('undo / redo', afterUndo === before && afterRedo === before - 1, `${before} → undo ${afterUndo} → redo ${afterRedo}`);
} catch (e) {
  failures++;
  console.error('✗ fatal:', (e as Error).message);
  console.error(log.slice(-3000));
} finally {
  server.kill('SIGTERM');
  setTimeout(() => process.exit(failures ? 1 : 0), 500);
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
}
