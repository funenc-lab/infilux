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
});
