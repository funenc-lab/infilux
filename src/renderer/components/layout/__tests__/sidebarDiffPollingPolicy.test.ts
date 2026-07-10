import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shouldPollSidebarDiffStats } from '../sidebarDiffPollingPolicy';

describe('shouldPollSidebarDiffStats', () => {
  it('keeps polling ownership out of sidebar panels', () => {
    const treeSidebarSource = fs.readFileSync(
      path.resolve(__dirname, '../TreeSidebar.tsx'),
      'utf8'
    );
    const worktreePanelSource = fs.readFileSync(
      path.resolve(__dirname, '../WorktreePanel.tsx'),
      'utf8'
    );

    expect(treeSidebarSource).toContain('useRegisterWorktreeDiffStatsScope');
    expect(worktreePanelSource).toContain('useRegisterWorktreeDiffStatsScope');
    expect(treeSidebarSource).not.toContain('setInterval(');
    expect(worktreePanelSource).not.toContain('setInterval(');
  });

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
