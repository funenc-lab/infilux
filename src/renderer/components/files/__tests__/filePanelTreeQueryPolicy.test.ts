import { describe, expect, it } from 'vitest';
import { shouldEnableFilePanelTreeQuery } from '../filePanelTreeQueryPolicy';

describe('shouldEnableFilePanelTreeQuery', () => {
  it('returns true when the file panel has a root path and tree querying is enabled', () => {
    expect(
      shouldEnableFilePanelTreeQuery({
        hasRootPath: true,
        treeEnabled: true,
      })
    ).toBe(true);
  });

  it('returns false when the file panel root path is unavailable', () => {
    expect(
      shouldEnableFilePanelTreeQuery({
        hasRootPath: false,
        treeEnabled: true,
      })
    ).toBe(false);
  });

  it('returns false when hidden retained panels disable tree querying', () => {
    expect(
      shouldEnableFilePanelTreeQuery({
        hasRootPath: true,
        treeEnabled: false,
      })
    ).toBe(false);
  });
});
