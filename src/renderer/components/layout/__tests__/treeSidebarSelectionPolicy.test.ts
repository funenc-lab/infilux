import { describe, expect, it } from 'vitest';
import { treeSidebarSource } from './treeSidebarSource';

describe('tree sidebar selection policy', () => {
  it('routes worktree clicks through repo-aware worktree selection instead of split repo updates', () => {
    expect(treeSidebarSource).toContain(
      'onSelectWorktree(worktree, isSelected ? undefined : repo.path)'
    );
    expect(treeSidebarSource).not.toContain('onSelectRepo(repo.path, { activateRemote: true });');
  });
});
