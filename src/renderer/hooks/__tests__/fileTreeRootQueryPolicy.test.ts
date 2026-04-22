import { describe, expect, it } from 'vitest';
import {
  FILE_TREE_ROOT_QUERY_STALE_TIME_MS,
  shouldInvalidateFileTreeRootQueryOnRootChange,
  shouldRefetchFileTreeRootQueryOnMount,
} from '../fileTreeRootQueryPolicy';
import { FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS } from '../fileTreeWatchPolicy';

describe('fileTreeRootQueryPolicy', () => {
  it('reuses the tab reactivation threshold for short remounts', () => {
    expect(FILE_TREE_ROOT_QUERY_STALE_TIME_MS).toBe(
      FILE_TREE_TAB_REACTIVATION_REFRESH_THRESHOLD_MS
    );
  });

  it('invalidates the root query when the root path changes', () => {
    expect(shouldInvalidateFileTreeRootQueryOnRootChange('/repo-a', '/repo-b')).toBe(true);
  });

  it('does not invalidate the root query on initial mount or same-root remounts', () => {
    expect(shouldInvalidateFileTreeRootQueryOnRootChange(undefined, '/repo')).toBe(false);
    expect(shouldInvalidateFileTreeRootQueryOnRootChange('/repo', '/repo')).toBe(false);
  });

  it('refetches on mount when there is no previous inactive timestamp', () => {
    expect(shouldRefetchFileTreeRootQueryOnMount({ lastInactiveAt: null })).toBe(true);
  });

  it('skips refetch on short remounts and refetches after the threshold', () => {
    expect(
      shouldRefetchFileTreeRootQueryOnMount({
        lastInactiveAt: 100,
        now: 100 + FILE_TREE_ROOT_QUERY_STALE_TIME_MS - 1,
      })
    ).toBe(false);

    expect(
      shouldRefetchFileTreeRootQueryOnMount({
        lastInactiveAt: 100,
        now: 100 + FILE_TREE_ROOT_QUERY_STALE_TIME_MS,
      })
    ).toBe(true);
  });
});
