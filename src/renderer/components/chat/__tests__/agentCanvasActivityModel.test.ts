import { describe, expect, it } from 'vitest';
import {
  areAgentCanvasActivityCountsEqual,
  buildAgentCanvasActivityCounts,
} from '../agentCanvasActivityModel';

describe('agent canvas activity model', () => {
  it('counts initialized sessions by normalized worktree path', () => {
    expect(
      buildAgentCanvasActivityCounts([
        { cwd: '/repo/worktree-b', initialized: true },
        { cwd: '/repo/worktree-a', initialized: true },
        { cwd: '/repo/worktree-a/', initialized: true },
        { cwd: '/repo/worktree-c', initialized: false },
      ])
    ).toEqual([
      {
        count: 2,
        worktreePath: '/repo/worktree-a',
      },
      {
        count: 1,
        worktreePath: '/repo/worktree-b',
      },
    ]);
  });

  it('keeps zero counts for visible worktrees without initialized sessions', () => {
    expect(
      buildAgentCanvasActivityCounts(
        [{ cwd: '/repo/worktree-a', initialized: true }],
        [{ worktreePath: '/repo/worktree-a' }, { worktreePath: '/repo/worktree-b' }]
      )
    ).toEqual([
      {
        count: 1,
        worktreePath: '/repo/worktree-a',
      },
      {
        count: 0,
        worktreePath: '/repo/worktree-b',
      },
    ]);
  });

  it('compares equivalent count snapshots by normalized worktree path', () => {
    expect(
      areAgentCanvasActivityCountsEqual(
        [{ worktreePath: '/repo/worktree-a/', count: 2 }],
        [{ worktreePath: '/repo/worktree-a', count: 2 }]
      )
    ).toBe(true);

    expect(
      areAgentCanvasActivityCountsEqual(
        [{ worktreePath: '/repo/worktree-a', count: 2 }],
        [{ worktreePath: '/repo/worktree-a', count: 1 }]
      )
    ).toBe(false);
  });
});
