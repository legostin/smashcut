// Starter ComfyUI workflows (API format), written to ~/.smashcut/comfy-workflows/ on first use.
// They are EXAMPLES: they only run if the named model files are installed in your ComfyUI (models/checkpoints,
// models/diffusion_models, models/text_encoders, models/vae). Edit them, or export your own from ComfyUI
// (Workflow → Export (API)) and replace literal values with {{prompt}}, {{seed}}, {{width}}… placeholders.
//
// Node/input names verified against ComfyUI master (nodes.py, comfy_extras/nodes_video.py, nodes_wan.py) and the official
// example https://comfyanonymous.github.io/ComfyUI_examples/wan22/ (image_to_video_wan22_5B.json).
export const TEMPLATES: Record<string, any> = {
  'example-sdxl-txt2img': {
    _smashcut: {
      kind: 'image', title: 'SDXL text → image (example)',
      description: 'Plain SDXL base checkpoint, 30 steps dpmpp_2m/karras. Swap ckpt_name for any SDXL/SD1.5 checkpoint you have.',
      needs: ['models/checkpoints/sd_xl_base_1.0.safetensors'],
    },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{checkpoint|sd_xl_base_1.0.safetensors}}' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}', clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative|blurry, low quality, watermark, text, logo}}', clip: ['4', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: '{{width|1344}}', height: '{{height|768}}', batch_size: '{{count|1}}' } },
    '3': {
      class_type: 'KSampler',
      inputs: { seed: '{{seed}}', steps: '{{steps|30}}', cfg: '{{cfg|6.5}}', sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'smashcut/sdxl', images: ['8', 0] } },
  },
  'example-wan22-img2vid': {
    _smashcut: {
      kind: 'video', title: 'Wan 2.2 5B image → video (example)', fps: 24,
      description: 'Official Wan 2.2 TI2V 5B example (24 fps, length 4n+1 frames, best at 1280×704). Pass image = first frame. Saves WebM; Smashcut converts to MP4 at the project fps.',
      needs: ['models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors', 'models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'models/vae/wan2.2_vae.safetensors'],
    },
    '37': { class_type: 'UNETLoader', inputs: { unet_name: 'wan2.2_ti2v_5B_fp16.safetensors', weight_dtype: 'default' } },
    '38': { class_type: 'CLIPLoader', inputs: { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' } },
    '39': { class_type: 'VAELoader', inputs: { vae_name: 'wan2.2_vae.safetensors' } },
    '48': { class_type: 'ModelSamplingSD3', inputs: { shift: 8, model: ['37', 0] } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}', clip: ['38', 0] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative|static, blurry, low quality, subtitles, watermark, distorted hands, extra limbs}}', clip: ['38', 0] } },
    '57': { class_type: 'LoadImage', inputs: { image: '{{image}}' } },
    '55': { class_type: 'Wan22ImageToVideoLatent', inputs: { vae: ['39', 0], width: '{{width|1280}}', height: '{{height|704}}', length: '{{frames|121}}', batch_size: 1, start_image: ['57', 0] } },
    '3': {
      class_type: 'KSampler',
      inputs: { seed: '{{seed}}', steps: '{{steps|30}}', cfg: '{{cfg|5}}', sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1, model: ['48', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['55', 0] },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['39', 0] } },
    '47': { class_type: 'SaveWEBM', inputs: { images: ['8', 0], filename_prefix: 'smashcut/wan22', codec: 'vp9', fps: 24, crf: 16 } },
  },
};
