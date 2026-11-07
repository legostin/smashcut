import { EventEmitter } from 'node:events';
import type { ServerEvent } from '../shared/types.ts';

class Bus extends EventEmitter {
  send(ev: ServerEvent) { this.emit('event', ev); }
}
export const bus = new Bus();
bus.setMaxListeners(100);
