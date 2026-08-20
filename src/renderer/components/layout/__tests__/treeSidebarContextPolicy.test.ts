import { describe, expect, it } from 'vitest';
import { ALL_GROUP_ID, type Repository } from '@/App/constants';
import { resolveTreeSidebarContextTransition } from '../treeSidebarContextPolicy';

function repository(path: string, groupId?: string): Repository {
  return {
    id: `local:${path}`,
    name: path,
    path,
    kind: 'local',
    groupId,
  };
}

describe('resolveTreeSidebarContextTransition', () => {
  it('expands the selected repository when the active worktree changes', () => {
    const result = resolveTreeSidebarContextTransition({
      previousContextKey: '/repo/a\u0000/worktrees/one',
      selectedRepo: '/repo/a',
      activeWorktreePath: '/worktrees/two',
      selectedRepository: repository('/repo/a', 'group-a'),
      expandedRepoPaths: [],
      activeGroupId: 'group-a',
    });

    expect(result).toEqual({
      contextKey: '/repo/a\u0000/worktrees/two',
      contextChanged: true,
      expandedRepoPaths: ['/repo/a'],
      groupIdToSelect: null,
    });
  });

  it('preserves a manual collapse while the navigation context is unchanged', () => {
    const result = resolveTreeSidebarContextTransition({
      previousContextKey: '/repo/a\u0000/worktrees/one',
      selectedRepo: '/repo/a',
      activeWorktreePath: '/worktrees/one',
      selectedRepository: repository('/repo/a', 'group-a'),
      expandedRepoPaths: [],
      activeGroupId: 'group-a',
    });

    expect(result).toEqual({
      contextKey: '/repo/a\u0000/worktrees/one',
      contextChanged: false,
      expandedRepoPaths: [],
      groupIdToSelect: null,
    });
  });

  it('aligns a specific group with an externally selected repository', () => {
    const result = resolveTreeSidebarContextTransition({
      previousContextKey: '/repo/a\u0000/worktrees/one',
      selectedRepo: '/repo/b',
      activeWorktreePath: '/worktrees/two',
      selectedRepository: repository('/repo/b', 'group-b'),
      expandedRepoPaths: ['/repo/a'],
      activeGroupId: 'group-a',
    });

    expect(result).toEqual({
      contextKey: '/repo/b\u0000/worktrees/two',
      contextChanged: true,
      expandedRepoPaths: ['/repo/a', '/repo/b'],
      groupIdToSelect: 'group-b',
    });
  });

  it('keeps the all-projects scope when the selected repository changes', () => {
    const result = resolveTreeSidebarContextTransition({
      previousContextKey: '/repo/a\u0000/worktrees/one',
      selectedRepo: '/repo/b',
      activeWorktreePath: '/worktrees/two',
      selectedRepository: repository('/repo/b', 'group-b'),
      expandedRepoPaths: [],
      activeGroupId: ALL_GROUP_ID,
    });

    expect(result.groupIdToSelect).toBeNull();
    expect(result.expandedRepoPaths).toEqual(['/repo/b']);
  });

  it('uses the all-projects scope for an ungrouped selected repository', () => {
    const result = resolveTreeSidebarContextTransition({
      previousContextKey: '/repo/a\u0000/worktrees/one',
      selectedRepo: '/repo/ungrouped',
      activeWorktreePath: '/repo/ungrouped',
      selectedRepository: repository('/repo/ungrouped'),
      expandedRepoPaths: [],
      activeGroupId: 'group-a',
    });

    expect(result.groupIdToSelect).toBe(ALL_GROUP_ID);
  });
});
