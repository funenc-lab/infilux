import type { GitWorktree } from '@shared/types';
import { describe, expect, it } from 'vitest';
import type { Repository } from '@/App/constants';
import {
  resolveActiveRepositoryPaths,
  resolveRepositoryVisibility,
} from '../repositoryVisibilityPolicy';

function createRepositories(count: number): Repository[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `local:repo-${index}`,
    name: `Repo ${index}`,
    path: `/repo/${index}`,
    kind: 'local',
    lastAccessedAt: index * 100,
  }));
}

describe('resolveRepositoryVisibility', () => {
  it('keeps selected and active repositories visible in addition to recent inactive projects', () => {
    const repositories = createRepositories(12);
    const result = resolveRepositoryVisibility({
      repositories,
      selectedRepo: '/repo/0',
      activeRepositoryPaths: ['/repo/1'],
      retainedRepositoryPaths: [],
      inactiveLimit: 3,
      searchActive: false,
    });

    expect(result.repositories.map((repository) => repository.path)).toEqual([
      '/repo/0',
      '/repo/1',
      '/repo/9',
      '/repo/10',
      '/repo/11',
    ]);
    expect(result.hiddenCount).toBe(7);
  });

  it('keeps retained inactive repositories without consuming the recent history budget', () => {
    const repositories = createRepositories(6);
    const result = resolveRepositoryVisibility({
      repositories,
      selectedRepo: null,
      activeRepositoryPaths: [],
      retainedRepositoryPaths: ['/repo/0', '/repo/1'],
      inactiveLimit: 3,
      searchActive: false,
    });

    expect(result.repositories.map((repository) => repository.path)).toEqual([
      '/repo/0',
      '/repo/1',
      '/repo/3',
      '/repo/4',
      '/repo/5',
    ]);
    expect(result.hiddenCount).toBe(1);
  });

  it('returns every matching repository while search is active', () => {
    const repositories = createRepositories(12);
    const result = resolveRepositoryVisibility({
      repositories,
      selectedRepo: null,
      activeRepositoryPaths: [],
      retainedRepositoryPaths: [],
      inactiveLimit: 3,
      searchActive: true,
    });

    expect(result.repositories).toEqual(repositories);
    expect(result.hiddenCount).toBe(0);
  });

  it('treats missing and invalid timestamps as oldest while preserving stable ties', () => {
    const repositories: Repository[] = [
      { id: 'a', name: 'A', path: '/a' },
      { id: 'b', name: 'B', path: '/b', lastAccessedAt: Number.NaN },
      { id: 'c', name: 'C', path: '/c', lastAccessedAt: 100 },
    ];
    const result = resolveRepositoryVisibility({
      repositories,
      selectedRepo: null,
      activeRepositoryPaths: [],
      retainedRepositoryPaths: [],
      inactiveLimit: 2,
      searchActive: false,
    });

    expect(result.repositories.map((repository) => repository.path)).toEqual(['/a', '/c']);
  });
});

describe('resolveActiveRepositoryPaths', () => {
  it('maps direct repository and worktree activity back to repository paths', () => {
    const repositories = createRepositories(3);
    const worktreesByRepository: Record<string, GitWorktree[]> = {
      '/repo/1': [{ path: '/worktrees/repo-1', branch: 'feature' } as GitWorktree],
    };

    expect(
      resolveActiveRepositoryPaths({
        repositories,
        activeWorktreePaths: ['/repo/0', '/worktrees/repo-1'],
        worktreesByRepository,
      })
    ).toEqual(['/repo/0', '/repo/1']);
  });

  it('maps nested terminal activity without matching sibling repository prefixes', () => {
    const repositories: Repository[] = [
      { id: 'repo', name: 'Repo', path: '/workspace/repo' },
      { id: 'repo-tools', name: 'Repo Tools', path: '/workspace/repo-tools' },
    ];

    expect(
      resolveActiveRepositoryPaths({
        repositories,
        activeWorktreePaths: ['/workspace/repo/worktrees/feature'],
        worktreesByRepository: {},
      })
    ).toEqual(['/workspace/repo']);
  });
});
