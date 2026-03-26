import { describe, expect, it } from 'vitest';
import {
  MAX_RETAINED_ACTIVITY_PANEL_PATHS,
  updateRetainedActivityPanelPaths,
} from '../activityPanelLruPolicy';

describe('activityPanelLruPolicy', () => {
  it('moves the latest active worktree to the front and caps retained paths', () => {
    const activePaths = new Set(['/repo/a', '/repo/b', '/repo/c']);

    expect(
      updateRetainedActivityPanelPaths({
        previousPaths: ['/repo/b', '/repo/c'],
        activePath: '/repo/a',
        hasActivity: (path) => activePaths.has(path),
      })
    ).toEqual(['/repo/a', '/repo/b']);
  });

  it('drops worktrees with no activity', () => {
    const activePaths = new Set(['/repo/a']);

    expect(
      updateRetainedActivityPanelPaths({
        previousPaths: ['/repo/a', '/repo/b'],
        hasActivity: (path) => activePaths.has(path),
      })
    ).toEqual(['/repo/a']);
  });

  it('deduplicates retained paths using normalized keys', () => {
    const activePaths = new Set(['/Repo/A', '/repo/a']);

    expect(
      updateRetainedActivityPanelPaths({
        previousPaths: ['/Repo/A', '/repo/a'],
        hasActivity: (path) => activePaths.has(path),
        maxPaths: MAX_RETAINED_ACTIVITY_PANEL_PATHS,
      })
    ).toEqual(['/Repo/A']);
  });

  it('returns the previous array when the retained paths are unchanged', () => {
    const previousPaths = ['/repo/a', '/repo/b'];

    const nextPaths = updateRetainedActivityPanelPaths({
      previousPaths,
      activePath: '/repo/a',
      hasActivity: (path) => path === '/repo/a' || path === '/repo/b',
    });

    expect(nextPaths).toBe(previousPaths);
  });
});
