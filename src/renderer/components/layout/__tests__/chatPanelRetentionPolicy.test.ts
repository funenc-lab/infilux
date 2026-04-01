import { describe, expect, it } from 'vitest';
import { updateRetainedChatPanelPaths } from '../chatPanelRetentionPolicy';

describe('chatPanelRetentionPolicy', () => {
  it('keeps every active worktree chat panel instead of truncating to the generic LRU cap', () => {
    const activePaths = new Set([
      '/repo/worktrees/current',
      '/repo/worktrees/older-a',
      '/repo/worktrees/older-b',
    ]);

    expect(
      updateRetainedChatPanelPaths({
        previousPaths: ['/repo/worktrees/older-a', '/repo/worktrees/older-b'],
        activePath: '/repo/worktrees/current',
        hasActivity: (path) => activePaths.has(path),
      })
    ).toEqual(['/repo/worktrees/current', '/repo/worktrees/older-a', '/repo/worktrees/older-b']);
  });

  it('still removes worktrees whose chat activity is gone', () => {
    expect(
      updateRetainedChatPanelPaths({
        previousPaths: ['/repo/worktrees/older-a', '/repo/worktrees/older-b'],
        activePath: '/repo/worktrees/current',
        hasActivity: (path) =>
          path === '/repo/worktrees/current' || path === '/repo/worktrees/older-b',
      })
    ).toEqual(['/repo/worktrees/current', '/repo/worktrees/older-b']);
  });
});
