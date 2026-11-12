// REST for the author's own voice (registered from server/routes.ts).
//   GET    /api/voice/prompter               narrated scenes with the words to read and their takes
//   POST   /api/voice/take?sceneId=&options= multipart audio (the browser's recording) → a take on the voice-over track
//                                            (&align=0: keep the estimated word timings, don't run Whisper)
//   POST   /api/voice/attach                 {sceneId, file, options?} a file from media/ becomes the scene's take
//   GET    /api/voice/takes[?sceneId=]       takes
//   POST   /api/voice/takes/:id/use          put this take on the timeline
//   POST   /api/voice/takes/:id/process      {options | false} run the processing chain again from the raw recording
//   DELETE /api/voice/takes/:id              remove the take and its files
// `options` are the parameters of the toolkit op voice_polish (noise, compress, deess, breaths, eq, declick, trim, target…); false = keep the raw sound.
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { cur, hasProject } from '../project.ts';
import { uerr } from '../i18n.ts';
import { nid } from '../util.ts';
import { addTake, deleteTake, listTakes, prompterScenes, reprocessTake, useTake, uploadDir, takeExt } from './takes.ts';

const need = () => { if (!hasProject()) throw Object.assign(new Error('no project open'), { statusCode: 409 }); return cur(); };
const parseOptions = (v: unknown): Record<string, unknown> | false | undefined => {
  if (v === false || v === 'false' || v === 'off') return false;
  if (v == null || v === '') return undefined;
  if (typeof v === 'object') return v as Record<string, unknown>;
  try { const j = JSON.parse(String(v)); return j === false ? false : j && typeof j === 'object' ? j : undefined; } catch { throw uerr('options must be JSON (voice_polish parameters) or false'); }
};

export function registerVoiceRoutes(app: FastifyInstance) {
  app.get('/api/voice/prompter', async () => (hasProject() ? { scenes: prompterScenes() } : { scenes: [] }));
  app.get<{ Querystring: { sceneId?: string } }>('/api/voice/takes', async (req) => { need(); return listTakes(req.query.sceneId); });

  app.post<{ Querystring: { sceneId?: string; options?: string; align?: string } }>('/api/voice/take', async (req) => {
    need();
    const sceneId = String(req.query.sceneId || '');
    if (!sceneId) throw uerr('sceneId is required');
    const options = parseOptions(req.query.options);
    const part = await req.file();
    if (!part) throw uerr('No recording in the request');
    const tmp = path.join(uploadDir(), nid() + takeExt(part.filename || '', part.mimetype || ''));
    try {
      await pipeline(part.file, fs.createWriteStream(tmp));
      if (fs.statSync(tmp).size < 2000) throw uerr('The recording is empty — check the microphone');
      return await addTake({ sceneId, upload: tmp, options, align: req.query.align !== '0' });
    } finally { fs.rmSync(tmp, { force: true }); }
  });

  app.post<{ Body: { sceneId: string; file: string; options?: unknown; align?: boolean } }>('/api/voice/attach', async (req) => {
    need();
    const b = req.body || ({} as any);
    if (!b.sceneId || !b.file) throw uerr('sceneId and file are required');
    return addTake({ sceneId: b.sceneId, media: String(b.file), options: parseOptions(b.options), align: b.align !== false });
  });

  app.post<{ Params: { id: string } }>('/api/voice/takes/:id/use', async (req) => { need(); return useTake(req.params.id); });
  app.post<{ Params: { id: string }; Body: { options?: unknown } }>('/api/voice/takes/:id/process', async (req) => {
    need();
    const o = parseOptions(req.body?.options);
    return reprocessTake(req.params.id, o === undefined ? {} : o);
  });
  app.delete<{ Params: { id: string } }>('/api/voice/takes/:id', async (req) => { need(); return deleteTake(req.params.id); });
}
