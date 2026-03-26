import { describe, expect, it } from 'vitest';
import { shouldRecoverRootFileList } from '../fileTreeRootRecoveryPolicy';

describe('shouldRecoverRootFileList', () => {
  it('returns false when the root path is unavailable', () => {
    expect(
      shouldRecoverRootFileList({
        hasRootPath: false,
        isRootLoading: false,
        isRootError: false,
        rootFileCount: 0,
        alreadyRecovered: false,
      })
    ).toBe(false);
  });

  it('returns false while the root query is still loading', () => {
    expect(
      shouldRecoverRootFileList({
        hasRootPath: true,
        isRootLoading: true,
        isRootError: false,
        rootFileCount: 0,
        alreadyRecovered: false,
      })
    ).toBe(false);
  });

  it('returns false after a recovery attempt already ran for the root path', () => {
    expect(
      shouldRecoverRootFileList({
        hasRootPath: true,
        isRootLoading: false,
        isRootError: true,
        rootFileCount: 0,
        alreadyRecovered: true,
      })
    ).toBe(false);
  });

  it('returns true when the root query fails', () => {
    expect(
      shouldRecoverRootFileList({
        hasRootPath: true,
        isRootLoading: false,
        isRootError: true,
        rootFileCount: null,
        alreadyRecovered: false,
      })
    ).toBe(true);
  });

  it('returns true when the root query resolves to an empty list', () => {
    expect(
      shouldRecoverRootFileList({
        hasRootPath: true,
        isRootLoading: false,
        isRootError: false,
        rootFileCount: 0,
        alreadyRecovered: false,
      })
    ).toBe(true);
  });

  it('returns false when the root query already has files', () => {
    expect(
      shouldRecoverRootFileList({
        hasRootPath: true,
        isRootLoading: false,
        isRootError: false,
        rootFileCount: 5,
        alreadyRecovered: false,
      })
    ).toBe(false);
  });
});
