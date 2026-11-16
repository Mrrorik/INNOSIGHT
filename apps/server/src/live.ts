import { EventEmitter } from 'node:events';
export const live = new EventEmitter();
live.setMaxListeners(200);
export function announce(projectId: string, type = 'request', data: unknown = {}) {
  live.emit(projectId, { type, at: new Date().toISOString(), data });
}
