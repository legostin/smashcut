// Toolkit ops for generative footage (category 'generate' → list_media_tools / run_media_tool / the toolkit UI).
//   generate_image   prompt (+ reference image) → media/<name>.png …   (count 1–4)
//   generate_video   prompt (+ first / last frame) → media/<name>.mp4   (probed, conformed to the project fps)
//   list_generators  providers, key status, models with inputs and cost estimates, today's spend
// Identical re-runs return the cached files for free — pass another seed for a new take. dryRun:true → cost only.
import { defineOp } from '../toolkit/registry.ts';
import { generate, listGenerators, type GenParams } from './index.ts';
import { priceText } from './budget.ts';

const PROVIDERS = ['auto', 'fal', 'runway', 'replicate', 'higgsfield', 'openai', 'google', 'comfy'];
const ASPECTS = ['project', '16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'];

const common = {
  provider: { type: 'enum', label: 'Provider', values: PROVIDERS, default: 'auto', description: 'auto = Settings default, else the first provider with a key. comfy = your local ComfyUI (free; model = workflow name)' },
  model: { type: 'string', label: 'Model', default: '', description: 'model id from list_generators (empty = the provider default). fal / replicate / higgsfield also take raw endpoint ids' },
  prompt: { type: 'string', label: 'Prompt', required: true, description: 'subject + action + setting + camera + lens + lighting + style. No on-screen text — add text as clip graphics' },
  negative: { type: 'string', label: 'Negative prompt', default: '', description: 'what to avoid (models without negative prompts get it appended as "Avoid: …")' },
  aspect: { type: 'enum', label: 'Aspect', values: ASPECTS, default: 'project', description: 'project = nearest to the project frame' },
  seed: { type: 'number', label: 'Seed', min: 0, max: 4294967295, step: 1, description: 'same seed + prompt = same shot (continuity); a new seed = another take. Random (and recorded) when empty' },
  resolution: { type: 'string', label: 'Resolution / quality', default: '', description: 'model-specific: 480p/720p/1080p/4k (video), 1K/2K/4K or low/medium/high (images) — see list_generators' },
  name: { type: 'string', label: 'File name', default: '', description: 'base name of the result in media/ (default gen-<prompt words>)' },
  extra: { type: 'string', label: 'Extra fields (JSON)', default: '', description: 'provider-specific input fields passed as-is, e.g. {"cfg_scale":0.4} or ComfyUI placeholders {"steps":20}' },
  dryRun: { type: 'boolean', label: 'Estimate only', default: false, description: 'validate and return the cost estimate without generating (free)' },
} as const;

defineOp({
  id: 'generate_image',
  title: 'Generate image',
  category: 'generate',
  cost: 'slow',
  version: 1,
  timeoutSec: 900,
  cache: (p: any) => !p.dryRun,
  description: 'Generate photographic / illustrated stills with an external model (fal.ai: Nano Banana, FLUX, Seedream, GPT Image, Ideogram…; OpenAI gpt-image; Google Nano Banana; Runway; Replicate; Higgsfield Soul; or a local ComfyUI workflow). PAID (except comfy): costs real money from the user\'s account — check list_generators for prices, use dryRun for an estimate, stay inside the daily budget. image = reference to edit or keep consistent. Use for key frames, b-roll stills, textures, product-in-scene shots; never for text-heavy frames, UI, logos, charts (build those in code). Results go to media/ with provenance (provider, model, prompt, seed, cost).',
  limits: 'count 1–4; daily budget in Settings → Generators (genBudgetUsd, default $10)',
  inputs: {
    ...common,
    image: { type: 'file', label: 'Reference image', accept: ['image'], description: 'edit this image / keep its subject (models with image support)' },
    width: { type: 'number', label: 'Width', min: 0, max: 8192, default: 0, description: '0 = from aspect' },
    height: { type: 'number', label: 'Height', min: 0, max: 8192, default: 0, description: '0 = from aspect' },
    count: { type: 'number', label: 'Images', min: 1, max: 4, step: 1, default: 1 },
  },
  outputs: {
    image: { kind: 'image', description: 'first image' },
    images: { kind: 'json', description: 'all image paths' },
    cost: { kind: 'json', description: '{usd, estimated}' },
    generation: { kind: 'json', description: 'provider, model, prompt, seed(s), aspect, size, notes' },
  },
  async run(ctx, p: any) {
    return generate(ctx, 'image', { ...p, width: p.width || undefined, height: p.height || undefined } as GenParams);
  },
});

defineOp({
  id: 'generate_video',
  title: 'Generate video shot',
  category: 'generate',
  cost: 'slow',
  version: 1,
  timeoutSec: 1800,
  cache: (p: any) => !p.dryRun,
  description: 'Generate a filmed-looking video shot (text → video, or image → video from a designed key frame) with an external model (fal.ai: Kling 4, Gemini Omni, MiniMax H3, Wan 3, Luma Ray, Seedance, PixVerse…; Runway Gen-4.5 / Veo 3.1; Replicate; Higgsfield Cinema Studio with native camera moves; Google Gemini Omni; or a local ComfyUI workflow). PAID (except comfy) and slow (1–10 min): one shot per call; estimate first (dryRun), generate stills to choose before video, keep within the daily budget. One action + one camera move per shot. image = first frame (consistency), endImage = last frame (models that support it). Output: media/<name>.mp4, probed and conformed to the project fps, with provenance.',
  limits: 'durations / aspects / resolutions depend on the model (list_generators); one shot per call',
  inputs: {
    ...common,
    image: { type: 'file', label: 'First frame', accept: ['image'], description: 'image-to-video: the shot starts on this frame' },
    endImage: { type: 'file', label: 'Last frame', accept: ['image'], description: 'first+last-frame models only' },
    duration: { type: 'number', label: 'Duration (s)', min: 1, max: 30, step: 1, default: 5, description: 'snapped to the nearest duration the model allows' },
    camera: { type: 'string', label: 'Camera move', default: '', description: 'e.g. "slow dolly-in", "orbit left", "static" — native preset where the model has one (list_generators cameras), else added to the prompt' },
    audio: { type: 'boolean', label: 'Native audio', default: false, description: 'models with sound (Kling 3, Seedance, Gemini Omni, Wan 3, Veo 3.1…) — usually costs more; music/VO are better made in the editor' },
    conform: { type: 'boolean', label: 'Conform to project fps', default: true },
  },
  outputs: {
    video: { kind: 'video', description: 'mp4' },
    cost: { kind: 'json', description: '{usd, estimated}' },
    generation: { kind: 'json', description: 'provider, model, prompt, seed, duration, fps, notes' },
  },
  async run(ctx, p: any) {
    return generate(ctx, 'video', p as GenParams);
  },
});

defineOp({
  id: 'list_generators',
  title: 'List generators',
  category: 'generate',
  cost: 'fast',
  version: 1,
  cache: false,
  description: 'Generation providers with key status, their models (id, kind, text/image input, end frame, durations, aspects, resolutions, camera presets, audio) and price estimates, plus the daily budget and today\'s spend. Free. Call before generate_image / generate_video.',
  inputs: {
    kind: { type: 'enum', label: 'Kind', values: ['all', 'image', 'video'], default: 'all' },
    configured: { type: 'boolean', label: 'Only providers with a key', default: false },
  },
  outputs: { generators: { kind: 'json' } },
  async run(_ctx, p: { kind: string; configured: boolean }) {
    const g = listGenerators();
    const providers = g.providers.filter((x) => !p.configured || x.hasKey).map((x) => ({
      id: x.id, title: x.title, ready: x.hasKey, ...(x.hasKey ? {} : { setup: x.needsKey ? `add the key in Settings → Generators (${x.keyUrl})` : 'start ComfyUI' }), note: x.note,
      models: x.models.filter((m) => p.kind === 'all' || m.kind === p.kind).map((m) => ({
        id: m.id, kind: m.kind, title: m.title, input: [m.text && 'text', m.image && 'image', m.endImage && 'endImage'].filter(Boolean).join('+'),
        durations: m.durations, aspects: m.aspects, resolutions: m.resolutions, cameras: m.cameras?.length ? m.cameras : undefined,
        negative: m.negative || undefined, seed: m.seed || undefined, audio: m.audio || undefined, maxCount: m.maxCount, price: priceText(m), notes: m.notes,
      })),
    }));
    return { generators: { providers, defaults: g.defaults, budget: { budgetUsd: g.budget.budgetUsd, spentTodayUsd: g.budget.spentUsd, remainingUsd: g.budget.remainingUsd }, unavailable: g.unavailable, notes: g.notes } };
  },
});
