import { describe, expect, it } from 'vitest';
import {
  buildFileTreeRestoreBatches,
  mapFileTreeRequestsWithConcurrency,
} from '../fileTreeConcurrency';

describe('fileTreeConcurrency', () => {
  it('groups restored paths by depth while preserving path order within a depth', () => {
    expect(
      buildFileTreeRestoreBatches([
        '/repo/src/components',
        '/repo/docs',
        '/repo/src',
        '/repo/src/components/ui',
        '/repo/docs',
      ])
    ).toEqual([['/repo/docs', '/repo/src'], ['/repo/src/components'], ['/repo/src/components/ui']]);
  });

  it('limits concurrent requests while retaining input result order', async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const resolvers: Array<() => void> = [];
    const request = mapFileTreeRequestsWithConcurrency(
      ['a', 'b', 'c', 'd', 'e'],
      (path) =>
        new Promise<string>((resolve) => {
          activeRequests += 1;
          maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
          resolvers.push(() => {
            activeRequests -= 1;
            resolve(path.toUpperCase());
          });
        }),
      2
    );

    expect(activeRequests).toBe(2);
    resolvers.shift()?.();
    await Promise.resolve();
    expect(activeRequests).toBe(2);

    while (resolvers.length > 0) {
      resolvers.shift()?.();
      await Promise.resolve();
    }

    await expect(request).resolves.toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(maximumActiveRequests).toBe(2);
  });
});
