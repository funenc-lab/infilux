import { describe, expect, it } from 'vitest';
import {
  buildRetainedEditorModelPaths,
  recordRecentEditorModelPath,
} from '../editorModelRetention';

describe('editorModelRetention', () => {
  it('moves the current path to the end of the recent history and trims overflow', () => {
    expect(recordRecentEditorModelPath(['/a', '/b', '/c'], '/b', 3)).toEqual(['/a', '/c', '/b']);

    expect(recordRecentEditorModelPath(['/a', '/b', '/c'], '/d', 3)).toEqual(['/b', '/c', '/d']);
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
});
