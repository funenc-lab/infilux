import { describe, expect, it } from 'vitest';
import { MAX_RETAINED_FILE_PANEL_PATHS, updateRetainedFilePanelPaths } from '../filePanelLruPolicy';

describe('filePanelLruPolicy', () => {
  it('moves the active worktree to the front and caps retained paths', () => {
    const tabCounts = new Map([
      ['/repo/a', 1],
      ['/repo/b', 2],
      ['/repo/c', 3],
    ]);

    expect(
      updateRetainedFilePanelPaths({
        previousPaths: ['/repo/b', '/repo/c'],
        activePath: '/repo/a',
        getTabCount: (path) => tabCounts.get(path) ?? 0,
      })
    ).toEqual(['/repo/a', '/repo/b']);
  });

  it('drops worktrees that no longer have open file tabs', () => {
    const tabCounts = new Map([
      ['/repo/a', 1],
      ['/repo/b', 0],
    ]);

    expect(
      updateRetainedFilePanelPaths({
        previousPaths: ['/repo/a', '/repo/b'],
        getTabCount: (path) => tabCounts.get(path) ?? 0,
      })
    ).toEqual(['/repo/a']);
  });

  it('ignores the active path when it no longer has open file tabs', () => {
    const previousPaths = ['/repo/a', '/repo/b'];
    const tabCounts = new Map([
      ['/repo/a', 1],
      ['/repo/b', 1],
      ['/repo/c', 0],
    ]);

    const nextPaths = updateRetainedFilePanelPaths({
      previousPaths,
      activePath: '/repo/c',
      getTabCount: (path) => tabCounts.get(path) ?? 0,
    });

    expect(nextPaths).toBe(previousPaths);
  });

  it('deduplicates retained paths using normalized keys', () => {
    const tabCounts = new Map([
      ['/Repo/A', 1],
      ['/repo/a', 1],
    ]);

    expect(
      updateRetainedFilePanelPaths({
        previousPaths: ['/Repo/A', '/repo/a'],
        getTabCount: (path) => tabCounts.get(path) ?? 0,
        maxPaths: MAX_RETAINED_FILE_PANEL_PATHS,
      })
    ).toEqual(['/Repo/A']);
  });

  it('returns the previous array when the retained paths are unchanged', () => {
    const previousPaths = ['/repo/a', '/repo/b'];

    const nextPaths = updateRetainedFilePanelPaths({
      previousPaths,
      activePath: '/repo/a',
      getTabCount: (path) => (path === '/repo/a' || path === '/repo/b' ? 1 : 0),
    });

    expect(nextPaths).toBe(previousPaths);
  });

  it('returns a new array when the retained paths change order without changing length', () => {
    const previousPaths = ['/repo/a', '/repo/b'];

    const nextPaths = updateRetainedFilePanelPaths({
      previousPaths,
      activePath: '/repo/b',
      getTabCount: (path) => (path === '/repo/a' || path === '/repo/b' ? 1 : 0),
    });

    expect(nextPaths).toEqual(['/repo/b', '/repo/a']);
    expect(nextPaths).not.toBe(previousPaths);
  });
});
