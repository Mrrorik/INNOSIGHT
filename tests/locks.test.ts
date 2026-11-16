import { describe, it, expect } from 'vitest';
import { withProjectActivity, withProjectMutation } from '../apps/server/src/locks.js';
describe('Project management coordination', () => {
  it('allows demo → tests → proxy reentrancy and releases the lock after errors', async () => {
    await expect(
      withProjectMutation('locks-1', () =>
        withProjectMutation('locks-1', () => withProjectActivity('locks-1', async () => 42)),
      ),
    ).resolves.toBe(42);
    await expect(
      withProjectMutation('locks-1', async () => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');
    await expect(withProjectActivity('locks-1', async () => true)).resolves.toBe(true);
  });
  it('permits parallel proxy requests and refuses management during active requests', async () => {
    let release!: () => void;
    const wait = new Promise<void>((r) => (release = r));
    const first = withProjectActivity('locks-2', () => wait);
    await expect(withProjectActivity('locks-2', async () => 2)).resolves.toBe(2);
    await expect(withProjectMutation('locks-2', async () => 3)).rejects.toMatchObject({ statusCode: 409 });
    release();
    await first;
    await expect(withProjectMutation('locks-2', async () => 3)).resolves.toBe(3);
  });
  it('blocks unrelated callers during exclusive work while keeping other projects available', async () => {
    let release!: () => void;
    const wait = new Promise<void>((r) => (release = r));
    const action = withProjectMutation('locks-3', () => wait);
    await expect(withProjectActivity('locks-3', async () => true)).rejects.toMatchObject({ statusCode: 409 });
    await expect(withProjectMutation('other-project', async () => true)).resolves.toBe(true);
    release();
    await action;
  });
});
