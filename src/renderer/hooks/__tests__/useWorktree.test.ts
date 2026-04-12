import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMock = vi.hoisted(() => ({
  useQuery: vi.fn((options: unknown) => options),
  useQueries: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  getQueryData: vi.fn(),
  useQueryClient: vi.fn(),
}));

const worktreeStoreMock = vi.hoisted(() => {
  const setWorktrees = vi.fn();
  const setError = vi.fn();

  const hook = vi.fn(
    (
      selector: (state: { setWorktrees: typeof setWorktrees; setError: typeof setError }) => unknown
    ) => selector({ setWorktrees, setError })
  );

  return {
    hook,
    setWorktrees,
    setError,
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery: reactQueryMock.useQuery,
  useQueries: reactQueryMock.useQueries,
  useMutation: reactQueryMock.useMutation,
  useQueryClient: reactQueryMock.useQueryClient,
}));

vi.mock('@/stores/worktree', () => ({
  useWorktreeStore: worktreeStoreMock.hook,
}));

import { resetWorktreeRecoveryStateForTests, useWorktreeList } from '../useWorktree';

type MockedQueryOptions<TResult> = {
  queryFn: () => Promise<TResult>;
  retry: ((failureCount: number, error: unknown) => boolean) | boolean;
};

describe('useWorktreeList', () => {
  beforeEach(() => {
    reactQueryMock.useQuery.mockClear();
    reactQueryMock.useQueryClient.mockReset();
    reactQueryMock.useQueryClient.mockReturnValue({
      invalidateQueries: reactQueryMock.invalidateQueries,
      getQueryData: reactQueryMock.getQueryData,
    });
    reactQueryMock.invalidateQueries.mockClear();
    reactQueryMock.getQueryData.mockReset();
    reactQueryMock.getQueryData.mockReturnValue(undefined);
    worktreeStoreMock.hook.mockClear();
    worktreeStoreMock.setWorktrees.mockClear();
    worktreeStoreMock.setError.mockClear();
    resetWorktreeRecoveryStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores sanitized worktrees on successful fetch', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        worktree: {
          list: vi
            .fn()
            .mockResolvedValue([{ path: '/repo', head: 'abc123', isMainWorktree: true }]),
        },
      },
    });

    const query = useWorktreeList('/repo') as unknown as MockedQueryOptions<unknown>;
    const worktrees = await query.queryFn();

    expect(worktrees).toEqual([
      {
        path: '/repo',
        head: 'abc123',
        isMainWorktree: true,
      },
    ]);
    expect(worktreeStoreMock.setWorktrees).toHaveBeenCalledWith(worktrees);
    expect(worktreeStoreMock.setError).toHaveBeenCalledWith(null);
    expect(reactQueryMock.invalidateQueries).not.toHaveBeenCalled();
  });

  it('records the error, preserves the previous store data, and rethrows a repository-metadata failure', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        worktree: {
          list: vi.fn().mockRejectedValue(new Error('Invalid workdir: not a git repository')),
        },
      },
    });

    const query = useWorktreeList('/repo') as unknown as MockedQueryOptions<unknown>;

    await expect(query.queryFn()).rejects.toThrow('Invalid workdir: not a git repository');
    expect(worktreeStoreMock.setError).toHaveBeenCalledWith(
      'Invalid workdir: not a git repository'
    );
    expect(worktreeStoreMock.setWorktrees).not.toHaveBeenCalled();
  });

  it('keeps the previous snapshot and clears the blocking error for transient spawn failures', async () => {
    const previousWorktrees = [
      {
        path: '/repo',
        head: 'abc123',
        isMainWorktree: true,
      },
    ];

    reactQueryMock.getQueryData.mockReturnValue(previousWorktrees);
    vi.stubGlobal('window', {
      electronAPI: {
        worktree: {
          list: vi.fn().mockRejectedValue(new Error('spawn EBADF')),
        },
      },
    });

    const query = useWorktreeList('/repo') as unknown as MockedQueryOptions<unknown>;
    const worktrees = await query.queryFn();

    expect(worktrees).toEqual(previousWorktrees);
    expect(worktreeStoreMock.setWorktrees).toHaveBeenCalledWith(previousWorktrees);
    expect(worktreeStoreMock.setError).toHaveBeenCalledWith(null);
    expect(reactQueryMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['worktree', 'list', '/repo'],
    });
  });

  it('preserves the previous snapshot and schedules recovery when a refresh unexpectedly returns an empty array', async () => {
    const previousWorktrees = [
      {
        path: '/repo',
        head: 'abc123',
        isMainWorktree: true,
      },
    ];

    reactQueryMock.getQueryData.mockReturnValue(previousWorktrees);
    vi.stubGlobal('window', {
      electronAPI: {
        worktree: {
          list: vi.fn().mockResolvedValue([]),
        },
      },
    });

    const query = useWorktreeList('/repo') as unknown as MockedQueryOptions<unknown>;
    const worktrees = await query.queryFn();

    expect(worktrees).toEqual(previousWorktrees);
    expect(worktreeStoreMock.setWorktrees).toHaveBeenCalledWith(previousWorktrees);
    expect(reactQueryMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['worktree', 'list', '/repo'],
    });
  });

  it('retries only transient git spawn failures', () => {
    const query = useWorktreeList('/repo') as unknown as MockedQueryOptions<unknown>;

    expect(typeof query.retry).toBe('function');
    expect(
      (query.retry as (failureCount: number, error: unknown) => boolean)(
        0,
        new Error('spawn EBADF')
      )
    ).toBe(true);
    expect(
      (query.retry as (failureCount: number, error: unknown) => boolean)(
        2,
        new Error('spawn EBADF')
      )
    ).toBe(false);
    expect(
      (query.retry as (failureCount: number, error: unknown) => boolean)(
        0,
        new Error('Invalid workdir: not a git repository')
      )
    ).toBe(false);
  });
});
