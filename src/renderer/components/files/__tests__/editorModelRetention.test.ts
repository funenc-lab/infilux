import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRetainedEditorModelPaths,
  recordRecentEditorModelPath,
} from '../editorModelRetention';

describe('editorModelRetention', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('moves the current path to the end of the recent history and trims overflow', () => {
    expect(recordRecentEditorModelPath(['/a', '/b', '/c'], '/b', 3)).toEqual(['/a', '/c', '/b']);

    expect(recordRecentEditorModelPath(['/a', '/b', '/c'], '/d', 3)).toEqual(['/b', '/c', '/d']);
  });

  it('deduplicates recent history using normalized path keys', () => {
    expect(recordRecentEditorModelPath(['/Repo/A.ts', '/repo/a.ts'], '/REPO/A.ts', 4)).toEqual([
      '/REPO/A.ts',
    ]);
  });

  it('retains the active path and only the most recent inactive open paths', () => {
    expect(
      buildRetainedEditorModelPaths({
        activeTabPath: '/d',
        openTabPaths: ['/a', '/b', '/d'],
        recentPaths: ['/a', '/b', '/c', '/d'],
        maxInactiveModels: 1,
      })
    ).toEqual(new Set(['/b', '/d']));
  });

  it('drops closed tabs from the retained model set', () => {
    expect(
      buildRetainedEditorModelPaths({
        activeTabPath: '/a',
        openTabPaths: ['/a'],
        recentPaths: ['/a', '/b', '/c'],
        maxInactiveModels: 2,
      })
    ).toEqual(new Set(['/a']));
  });

  it('matches active and recent paths against open tabs using normalized keys', () => {
    expect(
      buildRetainedEditorModelPaths({
        activeTabPath: '/repo/current.ts',
        openTabPaths: ['/Repo/Current.ts', '/Repo/Older.ts'],
        recentPaths: ['/repo/older.ts', '/repo/current.ts'],
        maxInactiveModels: 1,
      })
    ).toEqual(new Set(['/Repo/Current.ts', '/Repo/Older.ts']));
  });
});
