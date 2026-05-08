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

function appendUniquePath(paths: string[], seen: Set<string>, value: unknown): string | null {
  const normalizedPath = normalizeProjectPath(value);
  if (!normalizedPath || seen.has(normalizedPath)) {
    return normalizedPath;
  }

  seen.add(normalizedPath);
  paths.push(normalizedPath);
  return normalizedPath;
}

function appendProjectPathAlias(
  aliases: Record<string, string[]>,
  aliasSeen: Map<string, Set<string>>,
  projectPath: string,
  aliasPath: string | null
): void {
  if (!aliasPath || aliasPath === projectPath) {
    return;
  }

  let projectAliasSeen = aliasSeen.get(projectPath);
  if (!projectAliasSeen) {
    projectAliasSeen = new Set<string>();
    aliasSeen.set(projectPath, projectAliasSeen);
  }
  if (projectAliasSeen.has(aliasPath)) {
    return;
  }

  projectAliasSeen.add(aliasPath);
  aliases[projectPath] = [...(aliases[projectPath] ?? []), aliasPath];
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

function findMostSpecificCoveringPath(
  candidatePath: string,
  projectPaths: string[]
): string | null {
  let matchedPath: string | null = null;

  for (const projectPath of projectPaths) {
    if (!isSameOrChildPath(candidatePath, projectPath)) {
      continue;
    }

    if (!matchedPath || projectPath.length > matchedPath.length) {
      matchedPath = projectPath;
    }
  }

  return matchedPath;
}

export function buildProjectTokenUsageRequest(
  snapshot: AppResourceSnapshot | null,
  storage: StorageReader | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): GetProjectTokenUsageRequest {
  const projectPaths: string[] = [];
  const seen = new Set<string>();
  const projectPathAliases: Record<string, string[]> = {};
  const aliasSeen = new Map<string, Set<string>>();
  const repositoryPaths = readStoredRepositoryPaths(storage);

  for (const repositoryPath of repositoryPaths) {
    appendUniquePath(projectPaths, seen, repositoryPath);
  }

  for (const resource of snapshot?.resources ?? []) {
    if (resource.kind !== 'session') {
      continue;
    }

    const sessionPath = normalizeProjectPath(resource.cwd);
    const sessionProjectPath = normalizeProjectPath(resource.repoPath) ?? sessionPath;
    if (!sessionProjectPath) {
      continue;
    }

    const appendedProjectPath =
      findMostSpecificCoveringPath(sessionProjectPath, projectPaths) ??
      appendUniquePath(projectPaths, seen, sessionProjectPath);
    appendProjectPathAlias(
      projectPathAliases,
      aliasSeen,
      appendedProjectPath ?? sessionProjectPath,
      sessionPath
    );
  }

  return projectPaths.length > 0
    ? {
        projectPaths,
        ...(Object.keys(projectPathAliases).length > 0 ? { projectPathAliases } : {}),
      }
    : {};
}
