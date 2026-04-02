import { describe, expect, it } from 'vitest';
import { updateRetainedChatPanelPaths } from '../chatPanelRetentionPolicy';

describe('chatPanelRetentionPolicy', () => {
  it('caps retained chat panels to a bounded cache size', () => {
    const activePaths = new Set([
      '/repo/worktrees/current',
      '/repo/worktrees/older-a',
      '/repo/worktrees/older-b',
      '/repo/worktrees/older-c',
      '/repo/worktrees/older-d',
    ]);

    expect(
      updateRetainedChatPanelPaths({
        previousPaths: [
          '/repo/worktrees/older-a',
          '/repo/worktrees/older-b',
          '/repo/worktrees/older-c',
          '/repo/worktrees/older-d',
        ],
        activePath: '/repo/worktrees/current',
        hasActivity: (path) => activePaths.has(path),
      })
    ).toEqual([
      '/repo/worktrees/current',
      '/repo/worktrees/older-a',
      '/repo/worktrees/older-b',
      '/repo/worktrees/older-c',
    ]);
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

  it('converges to the latest bounded worktree set across long switch sequences', () => {
    const switchSequence = [
      '/repo/worktrees/a',
      '/repo/worktrees/b',
      '/repo/worktrees/c',
      '/repo/worktrees/d',
      '/repo/worktrees/e',
      '/repo/worktrees/f',
    ];

    let retainedPaths: string[] = [];

    for (let index = 0; index < switchSequence.length; index += 1) {
      const visiblePaths = new Set(switchSequence.slice(0, index + 1));
      retainedPaths = updateRetainedChatPanelPaths({
        previousPaths: retainedPaths,
        activePath: switchSequence[index],
        hasActivity: (path) => visiblePaths.has(path),
      });
    }

    expect(retainedPaths).toEqual([
      '/repo/worktrees/f',
      '/repo/worktrees/e',
      '/repo/worktrees/d',
      '/repo/worktrees/c',
    ]);
  });
});
