import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMock = vi.hoisted(() => ({
  useQuery: vi.fn((options: unknown) => options),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

const windowFocusMock = vi.hoisted(() => ({
  useShouldPoll: vi.fn(() => true),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: reactQueryMock.useQuery,
  useMutation: reactQueryMock.useMutation,
  useQueryClient: reactQueryMock.useQueryClient,
}));

vi.mock('@/hooks/useWindowFocus', () => ({
  useShouldPoll: windowFocusMock.useShouldPoll,
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/lib/feedbackCopy', () => ({
  buildSourceControlToastCopy: vi.fn(),
}));

import { useFileChanges, useFileDiff } from '../useSourceControl';

type MockedSourceControlQueryOptions = {
  refetchOnReconnect: boolean;
  refetchOnWindowFocus: boolean;
  refetchInterval: (query: {
    state: { data?: { truncated?: boolean }; error?: unknown };
  }) => number | false;
  retry: (failureCount: number, error: unknown) => boolean;
};

describe('source control polling', () => {
  beforeEach(() => {
    reactQueryMock.useQuery.mockClear();
    windowFocusMock.useShouldPoll.mockReset();
    windowFocusMock.useShouldPoll.mockReturnValue(true);
  });

  it('stops file change polling after an invalid workdir failure', () => {
    const query = useFileChanges('/repo') as unknown as MockedSourceControlQueryOptions;

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

  it('stops file diff polling after restart-required spawn failures', () => {
    const query = useFileDiff(
      '/repo',
      'README.md',
      false
    ) as unknown as MockedSourceControlQueryOptions;

    expect(
      query.refetchInterval({
        state: {
          error: new Error('spawn EBADF'),
        },
      })
    ).toBe(false);
    expect(query.retry(0, new Error('spawn EBADF'))).toBe(false);
  });
});
