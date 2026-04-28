import { describe, expect, it } from 'vitest';
import {
  getNextChatPanelRetentionExpiryDelayMs,
  resolveChatPanelIdleSinceByWorktree,
} from '../chatPanelIdleRetentionPolicy';

describe('chatPanelIdleRetentionPolicy', () => {
  it('starts idle retention when a session-backed chat panel is inactive and idle', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);

    expect(
      resolveChatPanelIdleSinceByWorktree({
        previousIdleSinceByWorktree: {},
        trackedWorktreePaths: ['/repo/worktrees/current'],
        activeChatWorktreePath: null,
        now,
        getSessionSnapshot: () => ({
          sessionCount: 1,
          hasAttentionSignal: false,
          hasLiveActivity: false,
        }),
      })
    ).toEqual({
      '/repo/worktrees/current': now,
    });
  });

  it('clears idle retention for the active chat worktree and worktrees with live activity', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);
    const previousIdleSinceByWorktree = {
      '/repo/worktrees/current': now - 30_000,
      '/repo/worktrees/running': now - 30_000,
      '/repo/worktrees/idle': now - 30_000,
    };

    expect(
      resolveChatPanelIdleSinceByWorktree({
        previousIdleSinceByWorktree,
        trackedWorktreePaths: [
          '/repo/worktrees/current',
          '/repo/worktrees/running',
          '/repo/worktrees/idle',
        ],
        activeChatWorktreePath: '/repo/worktrees/current',
        now,
        getSessionSnapshot: (worktreePath) => ({
          sessionCount: 1,
          hasAttentionSignal: false,
          hasLiveActivity: worktreePath === '/repo/worktrees/running',
        }),
      })
    ).toEqual({
      '/repo/worktrees/idle': now - 30_000,
    });
  });

  it('schedules the next cleanup after the first idle panel expires', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);

    expect(
      getNextChatPanelRetentionExpiryDelayMs({
        idleSinceByWorktree: {
          '/repo/worktrees/older': now - 30_000,
          '/repo/worktrees/newer': now - 10_000,
        },
        inactivityThresholdMs: 60_000,
        now,
      })
    ).toBe(30_001);
  });

  it('does not reschedule cleanup for already expired idle panels', () => {
    const now = Date.UTC(2026, 3, 9, 12, 0, 0);

    expect(
      getNextChatPanelRetentionExpiryDelayMs({
        idleSinceByWorktree: {
          '/repo/worktrees/older': now - 60_001,
        },
        inactivityThresholdMs: 60_000,
        now,
      })
    ).toBeNull();
  });
});
