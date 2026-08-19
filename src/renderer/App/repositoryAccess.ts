import type { Repository } from './constants';
import { pathsEqual } from './storage';

export function normalizeRepositoryLastAccessedAt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function touchRepositoryAccess(
  repositories: Repository[],
  repositoryPath: string,
  accessedAt: number
): Repository[] {
  const normalizedAccessedAt = normalizeRepositoryLastAccessedAt(accessedAt);
  if (normalizedAccessedAt === undefined) {
    return repositories;
  }

  let changed = false;
  const updated = repositories.map((repository) => {
    if (
      !pathsEqual(repository.path, repositoryPath) ||
      repository.lastAccessedAt === normalizedAccessedAt
    ) {
      return repository;
    }

    changed = true;
    return {
      ...repository,
      lastAccessedAt: normalizedAccessedAt,
    };
  });

  return changed ? updated : repositories;
}
