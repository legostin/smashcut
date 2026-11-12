// End-to-end smoke test: boots the server in a temp sandbox, then exercises
// project creation, every gallery template (lint + render), music render, composite frames,
// comments API, MCP tool listing and a short export.  Run: npm test
import { spawn, execFileSync } from 'node:child_process';
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

  // inspiration: an entry is listed only with a line saying what we take and its own mini-scene showing it
  const insp = await api('GET', '/api/inspiration');
  const inspFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'gallery', 'inspiration.json'), 'utf8'));
  ok('inspiration: every entry has a take and a mini-scene', insp.length > 0 && insp.length === inspFile.length, `${insp.length} listed of ${inspFile.length} in the file`);
  for (const x of insp) {
    const r = await fetch(`${BASE}/api/inspiration/${x.id}/thumb`);
    // 404 = the mini-scene threw or logged an error; a still of flat shapes on black can be a very small PNG, so only the status and a sane minimum count
    const bytes = r.status === 200 ? (await r.arrayBuffer()).byteLength : 0;
    ok(`inspiration ${x.id}: mini-scene renders without errors`, r.status === 200 && bytes > 400, `status ${r.status}, ${bytes} bytes`);
  }

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

  // effects + transitions on the first item, so parity covers the fx pipeline too
  const first = (await api('GET', '/api/project')).items.find((i: any) => i.kind === 'clip');
  await api('PATCH', `/api/items/${first.id}`, { fx: { in: { type: 'iris', duration: 0.8 }, effects: [{ type: 'look', params: { preset: 'teal-orange', amount: 1 } }, { type: 'vignette', params: { amount: 0.6, size: 0.5 } }, { type: 'chromatic', params: { px: 4 } }] } });
  const fxList = await api('GET', '/api/fx');
  ok('fx catalog', fxList.transitions.length >= 20 && fxList.effects.length >= 15, `${fxList.transitions.length} transitions, ${fxList.effects.length} effects`);
  const mp4 = await runExport({ from: 0, to: 2, format: 'mp4' });
  const mp4File = mp4 && path.join(st.dir, mp4.output || '');
  ok('export mp4', mp4?.status === 'done' && fs.existsSync(mp4File), mp4?.error || mp4?.output);
  if (mp4?.status === 'done') {
    const probe = (await sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=color_space,color_primaries,color_transfer', '-of', 'csv=p=0', mp4File])).out.toString().trim();
    ok('mp4 tagged BT.709', probe.split(',').every((x) => x === 'bt709'), probe);
    // preview ↔ export parity: the composite frame the agent/viewer sees vs the decoded export frame
    const ref = Buffer.from((await api('POST', '/api/agent/render-frame', { times: [0.5] })).png, 'base64');
    const refFile = path.join(tmp, 'ref.png');
    fs.writeFileSync(refFile, ref);
    // extract the export frame to PNG first (feeding the video straight into psnr pairs frames by timestamp)
    const expFile = path.join(tmp, 'exp.png');
    await sh('ffmpeg', ['-y', '-v', 'error', '-ss', '0.5', '-i', mp4File, '-frames:v', '1', expFile]);
    const psnr = await sh('ffmpeg', ['-v', 'info', '-i', refFile, '-i', expFile, '-lavfi', '[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr', '-f', 'null', '-']);
    const db = Number(/average:([\d.]+|inf)/.exec(psnr.err)?.[1]?.replace('inf', '99'));
    ok('preview ↔ export parity incl. transition+effects (PSNR ≥ 30 dB; chromatic fringes lose ~10 dB to 4:2:0)', db >= 30, `${db} dB`);
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
  ok('export cancel', j2?.status === 'error' && /Cancelled|Отменено/.test(j2.error || ''), j2?.status);

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

  // ---------- 3D clip (Three.js via studio3js) ----------
  const c3 = await api('POST', '/api/clips', { id: 'smoke3d', name: 'Smoke 3D', duration: 3, template: '3d' });
  const at3 = (await api('GET', '/api/project')).duration + 2;
  await api('POST', '/api/items', { kind: 'clip', ref: c3.id, start: at3, duration: 3 });
  const f3a = await api('POST', '/api/agent/render-frame', { times: [at3 + 1.5] });
  const f3b = await api('POST', '/api/agent/render-frame', { times: [at3 + 1.5] });
  ok('3D clip (three.js) renders without errors', f3a.png.length > 10000 && f3a.errors.length === 0, f3a.errors.join('; '));
  ok('3D clip is deterministic (same frame twice)', f3a.png === f3b.png);
  {
    // the 3D text in the accent colour must actually be drawn (not a blank WebGL canvas)
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-vf', 'scale=96:54', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: Buffer.from(f3a.png, 'base64'), maxBuffer: 1 << 24 });
    let lime = 0;
    for (let i = 0; i < raw.length; i += 3) if (raw[i + 1] > 150 && raw[i] > 120 && raw[i + 2] < 120) lime++;
    ok('3D clip draws the scene (accent pixels)', lime > 40, `${lime} accent px of ${raw.length / 3}`);
  }
  {
    // web recording: deterministic frames → exact fps and length
    const rec = await api('POST', '/api/agent/record-web', { url: BASE + '/api/state', fps: 30, actions: [{ type: 'wait', ms: 600 }, { type: 'move', x: 300, y: 200 }], tail: 0.3, name: 'smoke' });
    const nb = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate,width,height', '-of', 'csv=p=0', path.join(tmp, 'projects', 'smoke', 'media', rec.file)]).toString().trim();
    ok('web recording (virtual time, exact frames)', /^1920,1080,30\/1,\d+$/.test(nb) && Math.abs(Number(nb.split(',')[3]) - rec.duration * 30) <= 1, `${nb} · ${rec.duration}s`);
    const ss = await api('GET', '/api/record/sessions');
    ok('web login sessions list', Array.isArray(ss.sessions) && ss.login === null);
  }
  {
    // ---------- the author's own voice: a recorded take → processed → on the voice-over track ----------
    const sc0 = (await api('GET', '/api/script')).scenes;
    const script = await api('PUT', '/api/script', { scenes: [...sc0, { title: 'Voice smoke', start: 40, duration: 4, voiceover: 'one two three four five', speech: 'one two three [pause 0.3] four five' }] });
    const scene = script.scenes.find((x: any) => x.title === 'Voice smoke');
    const prompter = (await api('GET', '/api/voice/prompter')).scenes.find((x: any) => x.id === scene.id);
    ok('teleprompter text: words to read, pause mark', prompter?.tokens.length === 5 && prompter.tokens[2].mark === true && prompter.tokens[2].pause === 0.3, JSON.stringify(prompter?.tokens.map((x: any) => x.text)));
    // a "voice": five tone bursts over room noise, quiet, with silence at both ends (the way a real take looks to the level meter)
    const rec = path.join(tmp, 'take.wav');
    await sh('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=180:duration=6', '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.01:duration=6', '-filter_complex',
      "[0:a]volume='0.12*between(t,1.2,1.6)+0.12*between(t,1.7,2.1)+0.12*between(t,2.2,2.6)+0.12*between(t,3.0,3.4)+0.12*between(t,3.5,3.9)':eval=frame[v];[v][1:a]amix=inputs=2:normalize=0", '-ar', '48000', '-ac', '1', rec]);
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(rec)], { type: 'audio/wav' }), 'take.wav');
    const take = await (await fetch(`${BASE}/api/voice/take?sceneId=${scene.id}&align=0`, { method: 'POST', body: fd })).json();
    const rep = take.report;
    ok('voice take: saved, processed, raw kept', !!take.id && fs.existsSync(path.join(st.dir, 'media', take.file)) && fs.existsSync(path.join(st.dir, 'media', take.raw)) && take.file !== take.raw, take.error || take.file);
    ok('voice take: loudness to target, peak under the ceiling', Math.abs(rep?.after.lufs + 16) <= 1 && rep?.after.truePeak <= -1, `${rep?.before.lufs} → ${rep?.after.lufs} LUFS, peak ${rep?.after.truePeak} dBTP`);
    ok('voice take: silence trimmed at both edges', rep?.trimmed.start > 0.7 && rep?.trimmed.end > 1.5 && take.duration < 3.4, `−${rep?.trimmed.start}s / −${rep?.trimmed.end}s → ${take.duration}s`);
    ok('voice take: noise lower relative to the voice (measured in a pause)', rep?.noiseMeasured === true && rep.after.snr - rep.before.snr >= 6, `SNR ${rep?.before.snr} → ${rep?.after.snr} dB`);
    const pj = await api('GET', '/api/project');
    const voItem = pj.items.find((i: any) => i.label === 'VO: Voice smoke');
    const scAfter = (await api('GET', '/api/script')).scenes.find((x: any) => x.id === scene.id);
    ok('voice take: on the voice-over track at its scene', voItem?.ref === take.file && Math.abs(voItem.start - 40) < 0.01 && scAfter.vo?.source === 'mic' && scAfter.itemIds.includes(voItem.id));
    const words = (await api('GET', '/api/timing')).words.filter((w: any) => w.start >= 40 && w.start < 44);
    ok('voice take: word timings for captions', words.length === 5 && words[0].text === 'one' && words.every((w: any, i: number) => !i || w.start >= words[i - 1].start), words.map((w: any) => `${w.text}@${(w.start - 40).toFixed(2)}`).join(' '));
    const guard = await fetch(`${BASE}/api/voice/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sceneId: scene.id }) });
    ok('synthetic voice does not overwrite a recorded scene', guard.status === 409, String(guard.status));
    const modules: string[] = [];
    for (const [op, params] of [['compress', {}], ['deess', {}], ['voice_eq', {}], ['declick', {}], ['reduce_breaths', {}], ['trim_silence', {}]] as const) {
      const j = await api('POST', '/api/toolkit/run', { op, params: { ...params, media: 'media/' + take.raw }, wait: true });
      if (j.status !== 'done' || !fs.existsSync(path.join(st.dir, String(j.outputs.media)))) modules.push(`${op}: ${j.error || 'no output'}`);
    }
    ok('voice modules run (compress, deess, voice_eq, declick, reduce_breaths, trim_silence)', !modules.length, modules.join('; '));
    await api('DELETE', `/api/voice/takes/${take.id}`);
    const pj2 = await api('GET', '/api/project');
    ok('deleting the take clears the track and its files', !pj2.items.some((i: any) => i.label === 'VO: Voice smoke') && !fs.existsSync(path.join(st.dir, 'media', take.file)) && !(await api('GET', '/api/script')).scenes.find((x: any) => x.id === scene.id).vo);
  }
} catch (e) {
  failures++;
  console.error('✗ fatal:', (e as Error).message);
  console.error(log.slice(-3000));
} finally {
  server.kill('SIGTERM');
  setTimeout(() => process.exit(failures ? 1 : 0), 500);
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
}
