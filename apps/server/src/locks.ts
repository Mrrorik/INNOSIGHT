import { AsyncLocalStorage } from 'node:async_hooks';
import { APIError } from './store.js';
// One backend process serves this local deployment. Exclusive management actions cannot
// race with in-flight proxy writes. Nested demo → tests → proxy actions share ownership.
const owners = new AsyncLocalStorage<Set<string>>();
const exclusive = new Set<string>();
const readers = new Map<string, number>();
export async function withProjectMutation<T>(projectId: string, action: () => Promise<T>): Promise<T> {
  if (owners.getStore()?.has(projectId)) return action();
  if (exclusive.has(projectId) || (readers.get(projectId) || 0) > 0)
    throw new APIError(
      409,
      'В проекте уже выполняется операция. Дождитесь её завершения и повторите действие.',
      'PROJECT_BUSY',
    );
  exclusive.add(projectId);
  try {
    return await owners.run(new Set([...(owners.getStore() || []), projectId]), action);
  } finally {
    exclusive.delete(projectId);
  }
}
export async function withProjectActivity<T>(projectId: string, action: () => Promise<T>): Promise<T> {
  if (owners.getStore()?.has(projectId)) return action();
  if (exclusive.has(projectId))
    throw new APIError(
      409,
      'Выполняется управление проектом. Повторите запрос после завершения.',
      'PROJECT_BUSY',
    );
  readers.set(projectId, (readers.get(projectId) || 0) + 1);
  try {
    return await action();
  } finally {
    const count = (readers.get(projectId) || 1) - 1;
    if (count) readers.set(projectId, count);
    else readers.delete(projectId);
  }
}
