// fal.ai curated catalog. Verified 2026-11-08 from each endpoint's OpenAPI schema
// (GET https://api.fal.ai/v1/models?endpoint_id=<id>&expand=openapi-3.0) and its pricing on https://fal.ai/models/<id>.
// All prices are ESTIMATES in USD (promos / token billing change them) — the fal invoice is authoritative.
// Not listed on purpose: Veo 3.1 (retires on fal 2026-11-17), Veo 3, Sora 2, Imagen 4, Luma Ray 2, Kling 2.1 (deprecated).
// Any other endpoint id can still be passed as `model` (raw passthrough, fields via `extra`).
//
// route: text / image = endpoint for text-only and image-input requests; fields = our field → the model's input name;
// defaults = always-sent inputs (e.g. the resolution the price assumes); aspectFromImage = i2v has no aspect_ratio;
// durationAs 'string' ("5") | 's' ("5s"); resMap = our resolution → the model's enum; size = 'image_size' {width,height};
// imageList = the image goes into an array field (image_urls).
import type { ModelSpec } from './types.ts';

export const FAL_DOCS = 'https://fal.ai/docs/api-reference/inference-api/index.md';
const page = (id: string) => `https://fal.ai/models/${id}`;
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const VIDEO: ModelSpec[] = [
  {
    id: 'kling-4', provider: 'fal', kind: 'video', title: 'Kling 4.0', text: true, image: true, endImage: true,
    durations: range(3, 30), aspects: ['16:9', '9:16', '1:1', '21:9'], resolutions: ['720p', '1080p'],
    price: { unit: 'second', usd: 0.157, by: { '720p': 0.157, '1080p': 0.235 }, source: page('kling/v4/image-to-video') },
    notes: 'newest Kling (Oct 2026): strong motion & physics, start/end frame, multi-shot via extra.multi_prompt; default 720p',
    route: { text: 'kling/v4/text-to-video', image: 'kling/v4/image-to-video', fields: { image: 'start_image_url' }, aspectFromImage: true, defaults: { resolution: '720p' } },
  },
  {
    id: 'kling-4-flash', provider: 'fal', kind: 'video', title: 'Kling 4.0 Flash', text: true, image: true, durations: range(3, 20), aspects: ['16:9', '9:16', '1:1'], resolutions: ['720p'],
    price: { unit: 'second', usd: 0.094, source: page('kling/v4/flash/image-to-video') }, notes: 'fast drafts, 720p',
    route: { text: 'kling/v4/flash/text-to-video', image: 'kling/v4/flash/image-to-video', fields: { image: 'start_image_url' }, aspectFromImage: true },
  },
  {
    id: 'kling-3-pro', provider: 'fal', kind: 'video', title: 'Kling 3.0 Pro', text: true, image: true, endImage: true, negative: true, audio: true,
    durations: range(3, 15), aspects: ['16:9', '9:16', '1:1'],
    price: { unit: 'second', usd: 0.112, audioUsd: 0.056, note: '$0.168/s with audio', source: page('fal-ai/kling-video/v3/pro/image-to-video') },
    notes: 'negative prompt + cfg_scale (extra), native audio optional',
    route: { text: 'fal-ai/kling-video/v3/pro/text-to-video', image: 'fal-ai/kling-video/v3/pro/image-to-video', fields: { image: 'start_image_url' }, aspectFromImage: true, durationAs: 'string' },
  },
  {
    id: 'gemini-omni-flash', provider: 'fal', kind: 'video', title: 'Gemini Omni Flash 1.2 (Google)', text: true, image: true, endImage: true, audio: true,
    durations: range(3, 15), aspects: ['16:9', '9:16'], resolutions: ['360p', '720p', '1080p', '4k'],
    price: { unit: 'second', usd: 0.0819, by: { '360p': 0.0273, '720p': 0.0819, '1080p': 0.1229, '4k': 0.2457 }, note: 'audio always included', source: page('google/gemini-omni-flash/v1.2/image-to-video') },
    notes: "Google's newest video model (Veo successor); always generates sound",
    route: { text: 'google/gemini-omni-flash/v1.2/text-to-video', image: 'google/gemini-omni-flash/v1.2/image-to-video', fields: { audio: '' } },
  },
  {
    id: 'minimax-h3-max', provider: 'fal', kind: 'video', title: 'MiniMax H3 Max (Hailuo successor)', text: true, image: true, endImage: true, seed: true,
    durations: range(1, 15), aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], resolutions: ['480p', '768p', '1080p'],
    price: { unit: 'second', usd: 0.08, by: { '480p': 0.05, '768p': 0.08, '1080p': 0.16 }, note: 'list price from 2026-11-16 (30% off before)', source: page('minimax/h3-max/image-to-video') },
    notes: 'great value; realistic people & physics', route: { text: 'minimax/h3-max/text-to-video', image: 'minimax/h3-max/image-to-video', aspectFromImage: true, resMap: { '480p': '480P', '768p': '768P', '1080p': '1080P' }, defaults: { prompt_expansion_mode: 'balanced', resolution: '768P' } },
  },
  {
    id: 'wan-3', provider: 'fal', kind: 'video', title: 'Wan 3.0', text: true, image: true, endImage: true, seed: true, audio: true,
    durations: range(2, 30), aspects: ['16:9', '4:3', '1:1', '3:4', '9:16'], resolutions: ['480p', '720p', '1080p'],
    price: { unit: 'second', usd: 0.10, by: { '480p': 0.05, '720p': 0.10, '1080p': 0.20 }, source: page('alibaba/wan-3.0/image-to-video') },
    notes: 'cheap drafts at 480p; default 720p', route: { text: 'alibaba/wan-3.0/text-to-video', image: 'alibaba/wan-3.0/image-to-video', fields: { image: 'start_image_url', audio: 'audio' }, defaults: { resolution: '720p' } },
  },
  {
    id: 'luma-ray-3.2', provider: 'fal', kind: 'video', title: 'Luma Ray 3.2', text: true, image: true, endImage: true,
    durations: [5, 10], aspects: ['3:4', '4:3', '1:1', '9:16', '16:9', '21:9'], resolutions: ['540p', '720p', '1080p'],
    price: { unit: 'second', usd: 0.1, by: { '540p': 0.1, '720p': 0.2, '1080p': 0.4 }, note: 'text→video $0.50/1.00/2.00 per 5 s; image→video cheaper', source: page('luma/agent/ray/v3.2/text-to-video') },
    notes: 'cinematic look, HDR / loop (extra); 10 s only text→video', route: { text: 'luma/agent/ray/v3.2/text-to-video', image: 'luma/agent/ray/v3.2/image-to-video', durationAs: 's' },
  },
  {
    id: 'seedance-2.5', provider: 'fal', kind: 'video', title: 'Seedance 2.5 (ByteDance)', text: true, image: true, endImage: true, audio: true,
    durations: range(4, 30), aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], resolutions: ['480p', '720p', '1080p'],
    price: { unit: 'second', usd: 0.47, by: { '480p': 0.22, '720p': 0.47, '1080p': 1.16 }, note: 'token-billed, approximate', source: page('bytedance/seedance-2.5/us/text-to-video') },
    notes: 'top quality multi-shot; expensive — finals only', route: { text: 'bytedance/seedance-2.5/us/text-to-video', image: 'bytedance/seedance-2.5/us/image-to-video', aspectFromImage: true, durationAs: 'string', defaults: { resolution: '720p' } },
  },
  {
    id: 'flux-3-max-video', provider: 'fal', kind: 'video', title: 'FLUX 3 Max video (BFL)', text: true, image: true, endImage: true, seed: true, audio: true,
    durations: range(5, 20), aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], resolutions: ['720p', '1080p'],
    price: { unit: 'second', usd: 0.17, by: { '720p': 0.17, '1080p': 0.29 }, note: 'regular price (50% promo until 2026-11-22)', source: page('blackforestlabs/flux-3-max/text-to-video') },
    route: { text: 'blackforestlabs/flux-3-max/text-to-video', image: 'blackforestlabs/flux-3-max/image-to-video', defaults: { resolution: '720p' } },
  },
  {
    id: 'pixverse-v6', provider: 'fal', kind: 'video', title: 'PixVerse V6', text: true, image: true, negative: true, seed: true, audio: true,
    durations: range(1, 15), aspects: ['16:9', '4:3', '1:1', '3:4', '9:16', '2:3', '3:2', '21:9'], resolutions: ['360p', '540p', '720p', '1080p'],
    price: { unit: 'second', usd: 0.045, by: { '720p': 0.045, '1080p': 0.09 }, audioUsd: 0.015, note: '720p verified; 1080p is a 2× guess', source: page('fal-ai/pixverse/v6/text-to-video') },
    notes: 'cheapest decent drafts; styles via extra.style (anime, clay, comic…)', route: { text: 'fal-ai/pixverse/v6/text-to-video', image: 'fal-ai/pixverse/v6/image-to-video', aspectFromImage: true, fields: { audio: 'generate_audio_switch' }, defaults: { resolution: '720p' } },
  },
];

const IMAGE: ModelSpec[] = [
  {
    id: 'nano-banana-2.1', provider: 'fal', kind: 'image', title: 'Nano Banana 2.1 (Google)', text: true, image: true, seed: true, maxCount: 4,
    aspects: ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'], resolutions: ['1K', '2K', '4K'],
    price: { unit: 'image', usd: 0.04, by: { '1K': 0.04, '2K': 0.059, '4K': 0.134 }, note: 'token-billed, approximate', source: page('google/nano-banana-2.1') },
    notes: 'best all-rounder; image = edit/keep subject (up to 14 refs via extra.image_urls)', route: { text: 'google/nano-banana-2.1', image: 'google/nano-banana-2.1/edit', imageList: 'image_urls' },
  },
  {
    id: 'flux-pro-ultra', provider: 'fal', kind: 'image', title: 'FLUX 1.1 pro ultra', text: true, image: true, seed: true, maxCount: 4,
    aspects: ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
    price: { unit: 'image', usd: 0.06, source: page('fal-ai/flux-pro/v1.1-ultra') }, notes: 'photoreal 4 MP; extra.raw:true for a natural look; image = image prompt',
    route: { text: 'fal-ai/flux-pro/v1.1-ultra', imageOnSame: true },
  },
  {
    id: 'flux-3', provider: 'fal', kind: 'image', title: 'FLUX 3 (BFL)', text: true, image: true, maxCount: 1,
    aspects: ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'], resolutions: ['768sq', '1k', '1.5k', '2k', '4k'],
    price: { unit: 'image', usd: 0.048, by: { '768sq': 0.03, '1k': 0.048, '1.5k': 0.108, '2k': 0.192, '4k': 0.768 }, note: '$0.048 per megapixel', source: page('blackforestlabs/flux-3/text-to-image') },
    notes: 'newest FLUX; edit with up to 10 references; no seed', route: { text: 'blackforestlabs/flux-3/text-to-image', image: 'blackforestlabs/flux-3/edit-image', imageList: 'image_urls' },
  },
  {
    id: 'flux-kontext-pro', provider: 'fal', kind: 'image', title: 'FLUX.1 Kontext pro (edit)', text: false, image: true, seed: true, maxCount: 4,
    aspects: ['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21'],
    price: { unit: 'image', usd: 0.04, source: page('fal-ai/flux-pro/kontext') }, notes: 'precise local edits of a reference ("make it night", "remove the cup"); kontext max = flux-pro/kontext/max',
    route: { image: 'fal-ai/flux-pro/kontext' },
  },
  {
    id: 'seedream-5-pro', provider: 'fal', kind: 'image', title: 'Seedream 5.0 Pro (ByteDance)', text: true, image: true, maxCount: 4,
    price: { unit: 'image', usd: 0.0675, note: '≤1536² $0.0675, ≤2048² $0.135 (tentative)', source: page('bytedance/seedream/v5/pro/text-to-image') },
    notes: 'high-detail; edit with up to 10 references', route: { text: 'bytedance/seedream/v5/pro/text-to-image', image: 'bytedance/seedream/v5/pro/edit', imageList: 'image_urls', size: 'image_size', noAspect: true },
  },
  {
    id: 'gpt-image-2.6', provider: 'fal', kind: 'image', title: 'GPT Image 2.6 Flare (OpenAI)', text: true, image: true, maxCount: 4, resolutions: ['low', 'medium', 'high'],
    price: { unit: 'image', usd: 0.04, by: { low: 0.01, medium: 0.04, high: 0.13 }, note: 'token-billed; per-image cost not published (estimate); resolution = quality', source: page('openai/gpt-image-2.6/flare/text-to-image') },
    notes: 'precise instruction following and edits', route: { text: 'openai/gpt-image-2.6/flare/text-to-image', image: 'openai/gpt-image-2.6/flare/edit', imageList: 'image_urls', size: 'image_size', noAspect: true, fields: { resolution: 'quality' }, defaults: { quality: 'medium' } },
  },
  {
    id: 'ideogram-4.5', provider: 'fal', kind: 'image', title: 'Ideogram 4.5', text: true, image: false, seed: true, maxCount: 4, resolutions: ['low', 'medium', 'high'],
    price: { unit: 'image', usd: 0.06, by: { low: 0.03, medium: 0.06, high: 0.22 }, note: 'resolution = quality', source: page('ideogram/v4.5') },
    notes: 'graphic/poster styles', route: { text: 'ideogram/v4.5', size: 'image_size', noAspect: true, fields: { resolution: 'quality' }, defaults: { quality: 'medium' } },
  },
  {
    id: 'recraft-4.1', provider: 'fal', kind: 'image', title: 'Recraft V4.1', text: true, image: false, maxCount: 1,
    price: { unit: 'image', usd: 0.035, source: page('fal-ai/recraft/v4.1/text-to-image') }, notes: 'illustration / brand-palette images (extra.colors)',
    route: { text: 'fal-ai/recraft/v4.1/text-to-image', size: 'image_size', noAspect: true },
  },
  {
    id: 'qwen-image-3', provider: 'fal', kind: 'image', title: 'Qwen Image 3 (Alibaba)', text: true, image: true, negative: true, seed: true, maxCount: 4,
    price: { unit: 'image', usd: 0.04, note: '1K $0.04, 2K $0.075', source: page('alibaba/qwen-image-3/text-to-image') },
    route: { text: 'alibaba/qwen-image-3/text-to-image', image: 'alibaba/qwen-image-3/edit', imageList: 'image_urls', size: 'image_size', noAspect: true },
  },
];

export const FAL_MODELS: ModelSpec[] = [...VIDEO, ...IMAGE];
