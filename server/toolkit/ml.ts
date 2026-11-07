// Local ML for the toolkit (transformers.js, ONNX on CPU). Models download on first use into
// STUDIO_MODELS (default ~/.smashcut/models, shared with Whisper) and then work offline.
import path from 'node:path';
import { HOME_DIR } from '../config.ts';
import { Mutex } from '../util.ts';

export const MODELS_DIR = process.env.STUDIO_MODELS || path.join(HOME_DIR, 'models');

/** background-removal models: isnet = general objects/products/people (176 MB), modnet = portrait matting, fast (25 MB) */
export const BG_MODELS = {
  isnet: { repo: 'onnx-community/ISNet-ONNX', size: '176 MB' },
  modnet: { repo: 'Xenova/modnet', size: '25 MB' },
} as const;
export type BgModel = keyof typeof BG_MODELS;

const pipes = new Map<string, Promise<any>>();
const lock = new Mutex(); // one ONNX inference at a time (it already uses all cores)

async function bgPipe(model: BgModel) {
  let p = pipes.get(model);
  if (!p) {
    p = (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = MODELS_DIR;
      return tf.pipeline('background-removal', BG_MODELS[model].repo, { dtype: 'fp32' } as any);
    })();
    p.catch(() => pipes.delete(model));
    pipes.set(model, p);
  }
  return p;
}

/** run background removal on an image file; returns the alpha matte (1 byte / px) at the image size */
export async function matte(file: string, model: BgModel): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const pipe = await bgPipe(model);
  return lock.run(async () => {
    const img = await pipe(file);
    const { data, width, height, channels } = img as { data: Uint8Array; width: number; height: number; channels: number };
    const mask = new Uint8Array(width * height);
    for (let i = 0, j = channels - 1; i < mask.length; i++, j += channels) mask[i] = data[j];
    return { mask, width, height };
  });
}

/** open-vocabulary detector: find objects by words ("red car", "logo on the mug", "face") */
export const DETECT_MODEL = { repo: 'Xenova/owlvit-base-patch32', size: '≈ 600 MB' };
async function detectPipe() {
  let p = pipes.get('detect');
  if (!p) {
    p = (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = MODELS_DIR;
      return tf.pipeline('zero-shot-object-detection', DETECT_MODEL.repo, { dtype: 'fp32' } as any);
    })();
    p.catch(() => pipes.delete('detect'));
    pipes.set('detect', p);
  }
  return p;
}
/** detect `labels` in an image file; boxes in source pixels, best first */
export async function detectObjects(file: string, labels: string[], threshold = 0.05): Promise<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }[]> {
  const pipe = await detectPipe();
  return lock.run(async () => {
    const out = await pipe(file, labels, { threshold, percentage: false });
    return (out as any[]).sort((a, b) => b.score - a.score);
  });
}
