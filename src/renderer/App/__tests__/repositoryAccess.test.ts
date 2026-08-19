import { describe, expect, it } from 'vitest';
import type { Repository } from '../constants';
import { normalizeRepositoryLastAccessedAt, touchRepositoryAccess } from '../repositoryAccess';

const REPOSITORIES: Repository[] = [
  {
    id: 'local:repo-a',
    name: 'Repo A',
    path: '/repo/a',
    kind: 'local',
  },
  {
    id: 'local:repo-b',
    name: 'Repo B',
    path: '/repo/b',
    kind: 'local',
    lastAccessedAt: 100,
  },
];

describe('repository access metadata', () => {
  it('normalizes only finite non-negative timestamps', () => {
    expect(normalizeRepositoryLastAccessedAt(42)).toBe(42);
    expect(normalizeRepositoryLastAccessedAt(-1)).toBeUndefined();
    expect(normalizeRepositoryLastAccessedAt(Number.NaN)).toBeUndefined();
    expect(normalizeRepositoryLastAccessedAt('42')).toBeUndefined();
  });

  it('updates only the matching repository without changing manual order', () => {
    const updated = touchRepositoryAccess(REPOSITORIES, '/repo/a/', 500);

    expect(updated.map((repo) => repo.path)).toEqual(['/repo/a', '/repo/b']);
    expect(updated[0]?.lastAccessedAt).toBe(500);
    expect(updated[1]).toBe(REPOSITORIES[1]);
  });

  it('preserves the array when the repository is missing or the timestamp is unchanged', () => {
    expect(touchRepositoryAccess(REPOSITORIES, '/repo/missing', 500)).toBe(REPOSITORIES);
    expect(touchRepositoryAccess(REPOSITORIES, '/repo/b', 100)).toBe(REPOSITORIES);
  });
});
