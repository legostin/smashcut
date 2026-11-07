// English UI labels for the fx catalog in shared/fx.ts (that catalog stays as-is for agents/renderer).
// Every lookup goes through t(), so translations live in locales/<code>.json under these English keys.
import type { TransitionType, EffectType, MaskShape, BlendMode } from '../../shared/fx';
import { t } from './i18n';

export const TRANSITION_NAMES: Record<TransitionType, { name: string; group: string; hint: string }> = {
  fade: { name: 'Dissolve', group: 'Basics', hint: 'Smooth opacity fade. On a cut it is a classic dissolve.' },
  'dip-black': { name: 'Dip to black', group: 'Basics', hint: 'Fades out to black and back in.' },
  'dip-white': { name: 'Dip to white', group: 'Basics', hint: 'Flash to white for an energetic scene change.' },
  flash: { name: 'Flash', group: 'Basics', hint: 'A short burst of light on the cut.' },
  'zoom-in': { name: 'Push in', group: 'Motion', hint: 'Appears while scaling up.' },
  'zoom-out': { name: 'Pull out', group: 'Motion', hint: 'Appears while scaling down from a close-up.' },
  'slide-left': { name: 'Slide left', group: 'Motion', hint: 'Slides in from right to left.' },
  'slide-right': { name: 'Slide right', group: 'Motion', hint: 'Slides in from left to right.' },
  'slide-up': { name: 'Slide up', group: 'Motion', hint: 'Slides in from the bottom.' },
  'slide-down': { name: 'Slide down', group: 'Motion', hint: 'Slides in from the top.' },
  rise: { name: 'Rise', group: 'Motion', hint: 'A small rise with a fade, for titles and cards.' },
  pop: { name: 'Pop', group: 'Motion', hint: 'A springy entrance with overshoot.' },
  spin: { name: 'Spin', group: 'Motion', hint: 'Rotates while scaling.' },
  'whip-left': { name: 'Whip left', group: 'Dynamic', hint: 'A fast blurred whip pan.' },
  'whip-right': { name: 'Whip right', group: 'Dynamic', hint: 'A fast blurred whip pan.' },
  blur: { name: 'Defocus', group: 'Dynamic', hint: 'From blurry to sharp.' },
  glitch: { name: 'Glitch', group: 'Dynamic', hint: 'Digital glitches: offsets and color splitting.' },
  'wipe-left': { name: 'Wipe left', group: 'Wipes & masks', hint: 'A hard-edged wipe.' },
  'wipe-right': { name: 'Wipe right', group: 'Wipes & masks', hint: 'A hard-edged wipe.' },
  'wipe-up': { name: 'Wipe up', group: 'Wipes & masks', hint: 'A hard-edged wipe.' },
  'wipe-down': { name: 'Wipe down', group: 'Wipes & masks', hint: 'A hard-edged wipe.' },
  'wipe-diagonal': { name: 'Diagonal', group: 'Wipes & masks', hint: 'A diagonal wipe.' },
  iris: { name: 'Iris', group: 'Wipes & masks', hint: 'A circle opening from the center.' },
  clock: { name: 'Clock', group: 'Wipes & masks', hint: 'A clockwise radial reveal.' },
};

export const EFFECT_NAMES: Record<EffectType, { name: string; group: string; params?: Record<string, string> }> = {
  look: { name: 'Color preset', group: 'Color', params: { amount: 'Strength', preset: 'Preset' } },
  brightness: { name: 'Brightness', group: 'Color', params: { value: 'Brightness' } },
  contrast: { name: 'Contrast', group: 'Color', params: { value: 'Contrast' } },
  saturation: { name: 'Saturation', group: 'Color', params: { value: 'Saturation' } },
  hue: { name: 'Hue', group: 'Color', params: { deg: 'Shift, °' } },
  grayscale: { name: 'B&W', group: 'Color', params: { amount: 'Strength' } },
  sepia: { name: 'Sepia', group: 'Color', params: { amount: 'Strength' } },
  invert: { name: 'Invert', group: 'Color', params: { amount: 'Strength' } },
  tint: { name: 'Tint', group: 'Color', params: { amount: 'Strength', color: 'Color' } },
  blur: { name: 'Blur', group: 'Stylize', params: { px: 'Radius, px' } },
  vignette: { name: 'Vignette', group: 'Stylize', params: { amount: 'Strength', size: 'Size' } },
  grain: { name: 'Film grain', group: 'Stylize', params: { amount: 'Strength', size: 'Size' } },
  chromatic: { name: 'Chromatic aberration', group: 'Stylize', params: { px: 'Offset, px' } },
  shadow: { name: 'Shadow', group: 'Stylize', params: { blur: 'Blur', y: 'Offset', opacity: 'Density' } },
  letterbox: { name: 'Letterbox', group: 'Stylize', params: { ratio: 'Aspect ratio' } },
  'ken-burns': { name: 'Ken Burns', group: 'Motion', params: { from: 'Scale from', to: 'Scale to', x: 'Shift X, %', y: 'Shift Y, %' } },
  shake: { name: 'Camera shake', group: 'Motion', params: { px: 'Amplitude, px', speed: 'Speed' } },
};

export const MASK_NAMES: Record<MaskShape, { name: string; hint: string }> = {
  rect: { name: 'Rectangle', hint: 'Crops the frame to a box.' },
  rounded: { name: 'Rounded card', hint: 'Video inside a rounded “card”.' },
  ellipse: { name: 'Circle / ellipse', hint: 'Video in a circle, for a talking head.' },
  radial: { name: 'Soft spot', hint: 'A radial mask with feathering.' },
  linear: { name: 'Gradient', hint: 'Fades out toward an edge, to blend two shots.' },
};

export const BLEND_NAMES: Record<BlendMode, string> = {
  normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay',
  'soft-light': 'Soft light', 'hard-light': 'Hard light', 'color-dodge': 'Color dodge', 'color-burn': 'Color burn',
  darken: 'Darken', lighten: 'Lighten', difference: 'Difference', exclusion: 'Exclusion',
  hue: 'Hue', saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity',
};

/** translated labels (call at render time) */
export const trName = (type: string) => t(TRANSITION_NAMES[type as TransitionType]?.name || type);
export const trGroup = (type: string) => t(TRANSITION_NAMES[type as TransitionType]?.group || '');
export const trHint = (type: string) => t(TRANSITION_NAMES[type as TransitionType]?.hint || '');
export const fxName = (type: string) => t(EFFECT_NAMES[type as EffectType]?.name || type);
export const fxGroup = (type: string) => t(EFFECT_NAMES[type as EffectType]?.group || '');
export const fxParam = (type: string, key: string) => t(EFFECT_NAMES[type as EffectType]?.params?.[key] || key);
export const maskName = (shape: string) => t(MASK_NAMES[shape as MaskShape]?.name || shape);
export const maskHint = (shape: string) => t(MASK_NAMES[shape as MaskShape]?.hint || '');
// "Hue"/"Color" also exist as effect names with a different translation, so blend modes use a context key
const BLEND_CTX: Partial<Record<BlendMode, string>> = { hue: 'Hue (blend mode)', color: 'Color (blend mode)' };
export const blendName = (mode: string) => {
  const ctx = BLEND_CTX[mode as BlendMode];
  if (ctx) { const r = t(ctx); if (r !== ctx) return r; }
  return t(BLEND_NAMES[mode as BlendMode] || mode);
};
