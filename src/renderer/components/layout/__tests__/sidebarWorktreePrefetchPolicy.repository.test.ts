import { describe, expect, it, vi } from 'vitest';
import { buildTreeSidebarWorktreePrefetchInputs } from '../sidebarWorktreePrefetchPolicy';

describe('buildTreeSidebarWorktreePrefetchInputs for RepositorySidebar', () => {
  it('skips all-repo worktree prefetch when repository search has no active filter', () => {
    const canLoadRepo = vi.fn(() => true);

    const result = buildTreeSidebarWorktreePrefetchInputs({
      allRepoPaths: ['/repo/a', '/repo/b'],
      hasActiveFilter: false,
      canLoadRepo,
    });

    expect(result).toEqual([]);
    expect(canLoadRepo).not.toHaveBeenCalled();
  });

  it('avoids redundant prefetch for repositories that are already visible through cached data', () => {
    const canLoadRepo = vi.fn(() => true);

    const result = buildTreeSidebarWorktreePrefetchInputs({
      allRepoPaths: ['/repo/a', '/repo/b', '/repo/c'],
      hasActiveFilter: true,
      canLoadRepo,
      loadedRepoPaths: ['/repo/a', '/repo/c'],
    });

    expect(result).toEqual([{ repoPath: '/repo/b', enabled: true }]);
    expect(canLoadRepo).toHaveBeenCalledTimes(1);
    expect(canLoadRepo).toHaveBeenCalledWith('/repo/b');
  });
});
