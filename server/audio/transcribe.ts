import path from 'node:path';
import { HOME_DIR, getSettings } from '../config.ts';
import { decodePcm } from './analyze.ts';

export interface Word { text: string; start: number; end: number }
export interface Transcript { language?: string; text: string; words: Word[]; model: string }

let pipeP: Promise<any> | null = null;
let pipeModel = '';

async function getPipe(model: string) {
  if (!pipeP || pipeModel !== model) {
    pipeModel = model;
    pipeP = (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = path.join(HOME_DIR, 'models');
      return tf.pipeline('automatic-speech-recognition', model, { dtype: 'fp32' } as any);
    })();
    pipeP.catch(() => { pipeP = null; });
  }
  return pipeP;
}

/** local Whisper (transformers.js) with word timestamps */
export async function transcribe(file: string, opts: { language?: string; onProgress?: (s: string) => void } = {}): Promise<Transcript> {
  const model = getSettings().transcribeModel;
  opts.onProgress?.('loading model ' + model);
  const asr = await getPipe(model);
  opts.onProgress?.('decoding audio');
  const pcm = await decodePcm(file, 16000);
  opts.onProgress?.('transcribing');
  const out = await asr(pcm, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(opts.language ? { language: opts.language, task: 'transcribe' } : {}),
  });
  const chunks: any[] = out.chunks || [];
  const words: Word[] = chunks
    .filter((c) => c.timestamp && c.timestamp[0] != null)
    .map((c) => ({ text: String(c.text).trim(), start: +Number(c.timestamp[0]).toFixed(3), end: +Number(c.timestamp[1] ?? c.timestamp[0] + 0.3).toFixed(3) }))
    .filter((w) => w.text);
  return { text: String(out.text || '').trim(), words, model };
}
