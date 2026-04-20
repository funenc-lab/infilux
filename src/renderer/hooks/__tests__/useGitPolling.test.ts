import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMock = vi.hoisted(() => ({
  useQuery: vi.fn((options: unknown) => options),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

const repositoryStoreMock = vi.hoisted(() => {
  const setStatus = vi.fn();

  const hook = vi.fn((selector: (state: { setStatus: typeof setStatus }) => unknown) =>
    selector({ setStatus })
  );

  return {
    hook,
    setStatus,
  };
});

const settingsStoreMock = vi.hoisted(() => {
  const hook = vi.fn((selector: (state: { gitAutoFetchEnabled: boolean }) => unknown) =>
    selector({ gitAutoFetchEnabled: true })
  );

  return {
    hook,
  };
});

const windowFocusMock = vi.hoisted(() => ({
  useShouldPoll: vi.fn(() => true),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: reactQueryMock.useQuery,
  useMutation: reactQueryMock.useMutation,
  useQueryClient: reactQueryMock.useQueryClient,
}));

vi.mock('@/stores/repository', () => ({
  useRepositoryStore: repositoryStoreMock.hook,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: settingsStoreMock.hook,
}));

vi.mock('@/hooks/useWindowFocus', () => ({
  useShouldPoll: windowFocusMock.useShouldPoll,
}));

vi.mock('@/lib/electronGit', () => ({
  onGitAutoFetchCompleted: vi.fn(),
}));

import { useGitStatus } from '../useGit';

type MockedStatusQueryOptions = {
  refetchOnReconnect: boolean;
  refetchOnWindowFocus: boolean;
  refetchInterval: (query: {
    state: { data?: { truncated?: boolean }; error?: unknown };
  }) => number | false;
  retry: (failureCount: number, error: unknown) => boolean;
};

describe('useGitStatus', () => {
  beforeEach(() => {
    reactQueryMock.useQuery.mockClear();
    repositoryStoreMock.hook.mockClear();
    repositoryStoreMock.setStatus.mockClear();
    settingsStoreMock.hook.mockClear();
    windowFocusMock.useShouldPoll.mockReset();
    windowFocusMock.useShouldPoll.mockReturnValue(true);
  });

  it('stops polling after an invalid workdir failure', () => {
    const query = useGitStatus('/repo') as unknown as MockedStatusQueryOptions;

    expect(query.refetchOnWindowFocus).toBe(false);
    expect(query.refetchOnReconnect).toBe(false);
    expect(
      query.refetchInterval({
        state: {
          error: new Error('Invalid workdir: path does not exist or is not a directory'),
        },
      })
    ).toBe(false);
    expect(
      query.retry(0, new Error('Invalid workdir: path does not exist or is not a directory'))
    ).toBe(false);
  });

  it('backs off polling after transient spawn failures', () => {
    const query = useGitStatus('/repo') as unknown as MockedStatusQueryOptions;

    expect(
      query.refetchInterval({
        state: {
          error: new Error('spawn EAGAIN'),
        },
      })
    ).toBe(30000);
    expect(query.retry(0, new Error('spawn EAGAIN'))).toBe(true);
  });
});
