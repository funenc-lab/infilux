import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMock = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

const electronGitMock = vi.hoisted(() => ({
  onGitAutoFetchCompleted: vi.fn(),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (effect: () => undefined | (() => void)) => {
      effect();
    },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useMutation: reactQueryMock.useMutation,
  useQuery: reactQueryMock.useQuery,
  useQueryClient: reactQueryMock.useQueryClient,
}));

vi.mock('@/lib/electronGit', () => ({
  onGitAutoFetchCompleted: electronGitMock.onGitAutoFetchCompleted,
}));

vi.mock('@/stores/repository', () => ({
  useRepositoryStore: () => () => undefined,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => false,
}));

vi.mock('../useWindowFocus', () => ({
  useShouldPoll: () => true,
}));

import { useAutoFetchListener } from '../useGit';

describe('useAutoFetchListener', () => {
  const invalidateQueries = vi.fn();

  beforeEach(() => {
    invalidateQueries.mockReset();
    reactQueryMock.useQueryClient.mockReturnValue({ invalidateQueries });
    electronGitMock.onGitAutoFetchCompleted.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates only the repository-scoped queries reported by auto-fetch completion', () => {
    electronGitMock.onGitAutoFetchCompleted.mockImplementation((callback) => {
      callback({
        timestamp: 123,
        repositoryPaths: ['/repo/a', '/repo/b'],
      });
      return () => {};
    });

    useAutoFetchListener();

    expect(invalidateQueries).toHaveBeenCalledTimes(6);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['git', 'status', '/repo/a'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['git', 'branches', '/repo/a'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: ['worktree', 'list', '/repo/a'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(4, {
      queryKey: ['git', 'status', '/repo/b'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(5, {
      queryKey: ['git', 'branches', '/repo/b'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(6, {
      queryKey: ['worktree', 'list', '/repo/b'],
    });
  });

  it('skips global invalidation when auto-fetch completion does not report repository paths', () => {
    electronGitMock.onGitAutoFetchCompleted.mockImplementation((callback) => {
      callback({ timestamp: 123, repositoryPaths: [] });
      return () => {};
    });

    useAutoFetchListener();

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
