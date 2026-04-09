import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMock = vi.hoisted(() => ({
  useQuery: vi.fn((options: unknown) => options),
  useQueries: vi.fn(),
  useMutation: vi.fn(),
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

import { useWorktreeList } from '../useWorktree';

type MockedQueryOptions<TResult> = {
  queryFn: () => Promise<TResult>;
};

describe('useWorktreeList', () => {
  beforeEach(() => {
    reactQueryMock.useQuery.mockClear();
    worktreeStoreMock.hook.mockClear();
    worktreeStoreMock.setWorktrees.mockClear();
    worktreeStoreMock.setError.mockClear();
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
  });

  it('records the error, clears stale store data, and rethrows the fetch failure', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        worktree: {
          list: vi.fn().mockRejectedValue(new Error('spawn EBADF')),
        },
      },
    });

    const query = useWorktreeList('/repo') as unknown as MockedQueryOptions<unknown>;

    await expect(query.queryFn()).rejects.toThrow('spawn EBADF');
    expect(worktreeStoreMock.setError).toHaveBeenCalledWith('spawn EBADF');
    expect(worktreeStoreMock.setWorktrees).toHaveBeenCalledWith([]);
  });
});
