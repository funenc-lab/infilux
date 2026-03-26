import { toRemoteVirtualPath } from '@shared/utils/remotePath';
import { describe, expect, it } from 'vitest';
import {
  isRemoteRepositoryContext,
  resolveRepositoryRuntimeContext,
} from '../RepositoryContextResolver';

describe('RepositoryContextResolver', () => {
  it('resolves local repository contexts for empty or local paths', () => {
    expect(resolveRepositoryRuntimeContext()).toEqual({
      repoPath: undefined,
      kind: 'local',
    });
    expect(resolveRepositoryRuntimeContext(null)).toEqual({
      repoPath: undefined,
      kind: 'local',
    });
    expect(resolveRepositoryRuntimeContext('/repo/local')).toEqual({
      repoPath: '/repo/local',
      kind: 'local',
    });
  });

  it('resolves remote repository contexts and narrows with the type guard', () => {
    const repoPath = toRemoteVirtualPath('connection-1', '/tmp/worktrees/demo');
    const context = resolveRepositoryRuntimeContext(repoPath);

    expect(context).toEqual({
      repoPath,
      kind: 'remote',
      connectionId: 'connection-1',
    });
    expect(isRemoteRepositoryContext(context)).toBe(true);
    expect(
      isRemoteRepositoryContext({
        repoPath: '/repo/local',
        kind: 'local',
      })
    ).toBe(false);
  });
});
