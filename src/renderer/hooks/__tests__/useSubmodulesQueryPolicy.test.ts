import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMock = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn((options: unknown) => options),
  useQueryClient: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: reactQueryMock.useMutation,
  useQuery: reactQueryMock.useQuery,
  useQueryClient: reactQueryMock.useQueryClient,
}));

import { useSubmoduleFileDiff } from '../useSubmodules';

describe('useSubmoduleFileDiff', () => {
  beforeEach(() => {
    reactQueryMock.useQuery.mockClear();
  });

  it('does not retain a closed review modal submodule diff in the active query lifecycle', () => {
    const query = (useSubmoduleFileDiff as (...args: unknown[]) => unknown)(
      '/repo',
      'packages/feature',
      'README.md',
      false,
      { enabled: false }
    ) as { enabled: boolean; gcTime: number };

    expect(query.enabled).toBe(false);
    expect(query.gcTime).toBe(60_000);
  });
});
