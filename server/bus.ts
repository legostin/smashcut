import { EventEmitter } from 'node:events';
import type { ServerEvent } from '../shared/types.ts';

/** set by project.ts: resolves the id of the project in the current async context */
let pidOf: () => string | undefined = () => undefined;
export function setPidResolver(fn: () => string | undefined) { pidOf = fn; }

class Bus extends EventEmitter {
  /** events are tagged with the project they belong to; tabs only receive their own project's events */
  send(ev: ServerEvent) {
    // permission prompts are global (each tab filters them by its own tasks)
    const pid = ev.type === 'permissions' ? undefined : ((ev as any).pid ?? pidOf());
    this.emit('event', { ...ev, pid });
  }
}
export const bus = new Bus();
bus.setMaxListeners(100);
