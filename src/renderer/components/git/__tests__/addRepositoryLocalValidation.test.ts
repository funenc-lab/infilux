import { describe, expect, it } from 'vitest';
import {
  canInitializeLocalRepository,
  canSubmitLocalRepository,
  resolveLocalRepositoryAddState,
} from '../addRepositoryLocalValidation';

describe('addRepositoryLocalValidation', () => {
  it('allows submitting existing non-git directories through automatic initialization', () => {
    const state = resolveLocalRepositoryAddState(
      '/work/plain',
      {
        exists: true,
        isDirectory: true,
        isGitRepository: false,
      },
      false
    );

    expect(state).toBe('initializable');
    expect(canInitializeLocalRepository(state)).toBe(true);
    expect(canSubmitLocalRepository(state)).toBe(true);
  });

  it('allows adding only validated git repository directories', () => {
    const state = resolveLocalRepositoryAddState(
      '/work/repo',
      {
        exists: true,
        isDirectory: true,
        isGitRepository: true,
      },
      false
    );

    expect(state).toBe('ready');
    expect(canInitializeLocalRepository(state)).toBe(false);
    expect(canSubmitLocalRepository(state)).toBe(true);
  });

  it('blocks missing paths, files, empty paths, and pending validation', () => {
    expect(resolveLocalRepositoryAddState('', null, false)).toBe('empty');
    expect(resolveLocalRepositoryAddState('/work/repo', null, true)).toBe('validating');
    expect(
      resolveLocalRepositoryAddState(
        '/work/missing',
        { exists: false, isDirectory: false, isGitRepository: false },
        false
      )
    ).toBe('missing');
    expect(
      resolveLocalRepositoryAddState(
        '/work/file.txt',
        { exists: true, isDirectory: false, isGitRepository: false },
        false
      )
    ).toBe('file');
  });
});
