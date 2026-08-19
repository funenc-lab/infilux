import type { GitWorktree } from '@shared/types';
import type { Repository } from '@/App/constants';
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

export interface RepositoryVisibilityResult {
  repositories: Repository[];
  hiddenCount: number;
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

  const visibleRepositories = repositories.filter((repository) => {
    const repositoryPath = normalizePath(repository.path);
    return (
      forcedPaths.has(repositoryPath) ||
      retainedInactivePaths.has(repositoryPath) ||
      selectedRecentPaths.has(repositoryPath)
    );
  });

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
