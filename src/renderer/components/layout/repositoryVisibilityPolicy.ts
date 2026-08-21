import type { GitWorktree } from '@shared/types';
import { ALL_GROUP_ID, type Repository } from '@/App/constants';
import { normalizeRepositoryLastAccessedAt } from '@/App/repositoryAccess';
import { normalizePath } from '@/App/storage';

interface RepositoryVisibilityInput {
  repositories: readonly Repository[];
  selectedRepo: string | null;
  activeRepositoryPaths: readonly string[];
  retainedRepositoryPaths: readonly string[];
  inactiveLimit: number;
  searchActive: boolean;
}

interface ActiveRepositoryPathsInput {
  repositories: readonly Repository[];
  activeWorktreePaths: readonly string[];
  worktreesByRepository: Readonly<Record<string, readonly GitWorktree[] | undefined>>;
}

interface RepositoryGroupScopeInput {
  repositories: readonly Repository[];
  activeGroupId: string;
}

export interface RepositoryVisibilityResult {
  repositories: Repository[];
  hiddenCount: number;
}

export function resolveRecentRepositories(
  repositories: readonly Repository[],
  limit: number
): Repository[] {
  const effectiveLimit = Math.max(0, Math.floor(limit));

  return repositories
    .map((repository, index) => ({ repository, index }))
    .sort((left, right) => {
      const leftAccessedAt = normalizeRepositoryLastAccessedAt(left.repository.lastAccessedAt) ?? 0;
      const rightAccessedAt =
        normalizeRepositoryLastAccessedAt(right.repository.lastAccessedAt) ?? 0;
      return rightAccessedAt - leftAccessedAt || left.index - right.index;
    })
    .slice(0, effectiveLimit)
    .map(({ repository }) => repository);
}

export function resolveRepositoryGroupScope({
  repositories,
  activeGroupId,
}: RepositoryGroupScopeInput): Repository[] {
  if (activeGroupId === ALL_GROUP_ID) {
    return [...repositories];
  }

  return repositories.filter((repository) => repository.groupId === activeGroupId);
}

function toNormalizedPathSet(paths: readonly string[]): Set<string> {
  return new Set(paths.map(normalizePath));
}

function isSameOrNestedPath(candidatePath: string, parentPath: string): boolean {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}

export function resolveRepositoryVisibility({
  repositories,
  selectedRepo,
  activeRepositoryPaths,
  retainedRepositoryPaths,
  inactiveLimit,
  searchActive,
}: RepositoryVisibilityInput): RepositoryVisibilityResult {
  if (searchActive) {
    return {
      repositories: [...repositories],
      hiddenCount: 0,
    };
  }

  const forcedPaths = toNormalizedPathSet(activeRepositoryPaths);
  if (selectedRepo) {
    forcedPaths.add(normalizePath(selectedRepo));
  }

  const retainedPaths = toNormalizedPathSet(retainedRepositoryPaths);
  const indexedInactiveRepositories = repositories
    .map((repository, index) => ({ repository, index }))
    .filter(({ repository }) => !forcedPaths.has(normalizePath(repository.path)));
  const retainedInactivePaths = new Set(
    indexedInactiveRepositories
      .map(({ repository }) => normalizePath(repository.path))
      .filter((repositoryPath) => retainedPaths.has(repositoryPath))
  );
  const effectiveInactiveLimit = Math.max(0, Math.floor(inactiveLimit));
  const selectedRecentPaths = new Set<string>();

  const recentInactiveRepositories = indexedInactiveRepositories
    .filter(({ repository }) => !retainedInactivePaths.has(normalizePath(repository.path)))
    .sort((left, right) => {
      const leftAccessedAt = normalizeRepositoryLastAccessedAt(left.repository.lastAccessedAt) ?? 0;
      const rightAccessedAt =
        normalizeRepositoryLastAccessedAt(right.repository.lastAccessedAt) ?? 0;
      return rightAccessedAt - leftAccessedAt || left.index - right.index;
    });

  for (const { repository } of recentInactiveRepositories) {
    if (selectedRecentPaths.size >= effectiveInactiveLimit) {
      break;
    }
    selectedRecentPaths.add(normalizePath(repository.path));
  }

  const normalizedSelectedRepo = selectedRepo ? normalizePath(selectedRepo) : null;
  const visibleRepositories = repositories
    .map((repository, index) => ({ repository, index }))
    .filter(({ repository }) => {
      const repositoryPath = normalizePath(repository.path);
      return (
        forcedPaths.has(repositoryPath) ||
        retainedInactivePaths.has(repositoryPath) ||
        selectedRecentPaths.has(repositoryPath)
      );
    })
    .sort((left, right) => {
      const leftPath = normalizePath(left.repository.path);
      const rightPath = normalizePath(right.repository.path);
      const leftPriority =
        leftPath === normalizedSelectedRepo ? 0 : forcedPaths.has(leftPath) ? 1 : 2;
      const rightPriority =
        rightPath === normalizedSelectedRepo ? 0 : forcedPaths.has(rightPath) ? 1 : 2;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftAccessedAt = normalizeRepositoryLastAccessedAt(left.repository.lastAccessedAt) ?? 0;
      const rightAccessedAt =
        normalizeRepositoryLastAccessedAt(right.repository.lastAccessedAt) ?? 0;
      return rightAccessedAt - leftAccessedAt || left.index - right.index;
    })
    .map(({ repository }) => repository);

  return {
    repositories: visibleRepositories,
    hiddenCount: repositories.length - visibleRepositories.length,
  };
}

export function resolveActiveRepositoryPaths({
  repositories,
  activeWorktreePaths,
  worktreesByRepository,
}: ActiveRepositoryPathsInput): string[] {
  const activePathSet = toNormalizedPathSet(activeWorktreePaths);
  const activePaths = [...activePathSet];

  return repositories
    .filter((repository) => {
      const repositoryPath = normalizePath(repository.path).replace(/\/$/, '');
      if (activePaths.some((activePath) => isSameOrNestedPath(activePath, repositoryPath))) {
        return true;
      }

      return (worktreesByRepository[repository.path] ?? []).some((worktree) =>
        activePathSet.has(normalizePath(worktree.path))
      );
    })
    .map((repository) => repository.path);
}
