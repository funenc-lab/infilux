import type { AppResourceSnapshot, GetProjectTokenUsageRequest } from '@shared/types';
import { normalizePath, trimTrailingPathSeparators } from '@shared/utils/path';
import { STORAGE_KEYS } from '@/App/storage';

interface StorageReader {
  getItem: (key: string) => string | null;
}

interface RepositoryPathRecord {
  path?: unknown;
}

function normalizeProjectPath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  return trimTrailingPathSeparators(normalizePath(trimmedValue));
}

function appendUniquePath(paths: string[], seen: Set<string>, value: unknown): void {
  const normalizedPath = normalizeProjectPath(value);
  if (!normalizedPath || seen.has(normalizedPath)) {
    return;
  }

  seen.add(normalizedPath);
  paths.push(normalizedPath);
}

function readStoredRepositoryPaths(storage: StorageReader | undefined): string[] {
  if (!storage) {
    return [];
  }

  const rawRepositories = storage.getItem(STORAGE_KEYS.REPOSITORIES);
  if (!rawRepositories) {
    return [];
  }

  try {
    const repositories = JSON.parse(rawRepositories) as unknown;
    if (!Array.isArray(repositories)) {
      return [];
    }

    return repositories
      .map((repository: RepositoryPathRecord) => normalizeProjectPath(repository.path))
      .filter((projectPath): projectPath is string => projectPath !== null);
  } catch {
    return [];
  }
}

function isSameOrChildPath(candidatePath: string, projectPath: string): boolean {
  return candidatePath === projectPath || candidatePath.startsWith(`${projectPath}/`);
}

function isCoveredByStoredRepository(candidatePath: string, repositoryPaths: string[]): boolean {
  return repositoryPaths.some((repositoryPath) => isSameOrChildPath(candidatePath, repositoryPath));
}

export function buildProjectTokenUsageRequest(
  snapshot: AppResourceSnapshot | null,
  storage: StorageReader | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): GetProjectTokenUsageRequest {
  const projectPaths: string[] = [];
  const seen = new Set<string>();
  const repositoryPaths = readStoredRepositoryPaths(storage);

  for (const repositoryPath of repositoryPaths) {
    appendUniquePath(projectPaths, seen, repositoryPath);
  }

  for (const resource of snapshot?.resources ?? []) {
    if (resource.kind !== 'session') {
      continue;
    }

    const sessionPath = normalizeProjectPath(resource.cwd);
    if (!sessionPath || isCoveredByStoredRepository(sessionPath, projectPaths)) {
      continue;
    }

    appendUniquePath(projectPaths, seen, sessionPath);
  }

  return projectPaths.length > 0 ? { projectPaths } : {};
}
