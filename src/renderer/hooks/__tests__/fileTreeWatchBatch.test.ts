import { describe, expect, it } from 'vitest';
import { buildFileTreeWatchRefreshPlan } from '../fileTreeWatchBatch';

describe('fileTreeWatchBatch', () => {
  it('deduplicates repeated root refreshes and nested directory refreshes', () => {
    const plan = buildFileTreeWatchRefreshPlan({
      rootPath: '/repo',
      expandedPaths: new Set(['/repo/src', '/repo/src/components']),
      events: [
        { type: 'update', path: '/repo/README.md' },
        { type: 'create', path: '/repo/src/index.ts' },
        { type: 'update', path: '/repo/src/components/Button.tsx' },
        { type: 'delete', path: '/repo/src/components/Button.tsx' },
      ],
    });

    expect(plan).toEqual({
      shouldRefetchRoot: true,
      invalidateQueryPaths: ['/repo/src', '/repo/src/components'],
      refreshNodePaths: ['/repo/src', '/repo/src/components'],
    });
  });

  it('refreshes expanded directories pointed to directly by a change event', () => {
    const plan = buildFileTreeWatchRefreshPlan({
      rootPath: '/repo',
      expandedPaths: new Set(['/repo/src', '/repo/src/generated']),
      events: [
        { type: 'update', path: '/repo/src/generated' },
        { type: 'update', path: '/repo/src/generated/output.ts' },
      ],
    });

    expect(plan).toEqual({
      shouldRefetchRoot: false,
      invalidateQueryPaths: ['/repo/src', '/repo/src/generated'],
      refreshNodePaths: ['/repo/src', '/repo/src/generated'],
    });
  });

  it('ignores duplicate events for collapsed directories', () => {
    const plan = buildFileTreeWatchRefreshPlan({
      rootPath: '/repo',
      expandedPaths: new Set<string>(),
      events: [
        { type: 'update', path: '/repo/src/index.ts' },
        { type: 'update', path: '/repo/src/index.ts' },
      ],
    });

    expect(plan).toEqual({
      shouldRefetchRoot: false,
      invalidateQueryPaths: ['/repo/src'],
      refreshNodePaths: [],
    });
  });
});
