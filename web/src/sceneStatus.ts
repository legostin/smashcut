import type { Scene, SceneStatus } from '../../shared/types';
import { t } from './i18n';

/** one place for scene status labels / colours (storyboard, strip, script panel) */
export const SCENE_STATUS: Record<SceneStatus, { label: string; tone: 'idle' | 'work' | 'review' | 'done' | 'approved' }> = {
  todo: { label: 'Not started', tone: 'idle' },
  doing: { label: 'In progress', tone: 'work' },
  review: { label: 'Needs review', tone: 'review' },
  done: { label: 'Done', tone: 'done' },
  approved: { label: 'Approved', tone: 'approved' },
};
export const statusLabel = (s: Scene) => t(SCENE_STATUS[s.status]?.label || 'Not started');
export const statusTone = (s: Scene) => SCENE_STATUS[s.status]?.tone || 'idle';
