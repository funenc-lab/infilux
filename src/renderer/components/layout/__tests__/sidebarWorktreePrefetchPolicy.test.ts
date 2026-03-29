import { describe, expect, it, vi } from 'vitest';
import { buildTreeSidebarWorktreePrefetchInputs } from '../sidebarWorktreePrefetchPolicy';

describe('buildTreeSidebarWorktreePrefetchInputs', () => {
  it('returns no prefetch inputs when the active filter is not enabled', () => {
    const canLoadRepo = vi.fn(() => true);

    const result = buildTreeSidebarWorktreePrefetchInputs({
      allRepoPaths: ['/repo/a', '/repo/b'],
      hasActiveFilter: false,
      canLoadRepo,
    });

    expect(result).toEqual([]);
    expect(canLoadRepo).not.toHaveBeenCalled();
  });

  it('builds enabled flags per repo when the active filter is enabled', () => {
    const canLoadRepo = vi.fn((repoPath: string) => repoPath !== '/repo/remote');

    const result = buildTreeSidebarWorktreePrefetchInputs({
      allRepoPaths: ['/repo/a', '/repo/remote'],
      hasActiveFilter: true,
      canLoadRepo,
    });

    expect(result).toEqual([
      { repoPath: '/repo/a', enabled: true },
      { repoPath: '/repo/remote', enabled: false },
    ]);
    expect(canLoadRepo).toHaveBeenCalledTimes(2);
  });
});
