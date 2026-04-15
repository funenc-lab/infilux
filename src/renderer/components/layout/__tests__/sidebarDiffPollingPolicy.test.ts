import { describe, expect, it } from 'vitest';
import { shouldPollSidebarDiffStats } from '../sidebarDiffPollingPolicy';

describe('shouldPollSidebarDiffStats', () => {
  it('returns false when the sidebar is collapsed even if the window should poll', () => {
    expect(
      shouldPollSidebarDiffStats({
        collapsed: true,
        diffStatPathKey: '/repo/main',
        shouldPoll: true,
      })
    ).toBe(false);
  });

  it('returns false when polling is suspended or there are no worktrees to refresh', () => {
    expect(
      shouldPollSidebarDiffStats({
        collapsed: false,
        diffStatPathKey: '',
        shouldPoll: true,
      })
    ).toBe(false);
    expect(
      shouldPollSidebarDiffStats({
        collapsed: false,
        diffStatPathKey: '/repo/main',
        shouldPoll: false,
      })
    ).toBe(false);
  });

  it('returns true only when the sidebar is expanded, polling is enabled, and worktrees exist', () => {
    expect(
      shouldPollSidebarDiffStats({
        collapsed: false,
        diffStatPathKey: '/repo/main',
        shouldPoll: true,
      })
    ).toBe(true);
  });
});
