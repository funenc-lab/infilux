import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Repository } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { resolveRepositoryVisibility } from './repositoryVisibilityPolicy';

export const INITIAL_INACTIVE_REPOSITORY_LIMIT = 8;
export const INACTIVE_REPOSITORY_BATCH_SIZE = 8;

interface GroupedRepositoryPaginationInput {
  groupIds: readonly string[];
  resetKey?: string;
}

interface GroupedRepositoryPage {
  visibleCount: number;
  hiddenCount: number;
  nextBatchSize: number;
}

interface GroupedRepositoryPaginationResult {
  getPage: (groupId: string, totalCount: number) => GroupedRepositoryPage;
  showMore: (groupId: string) => void;
}

interface ProgressiveRepositoryVisibilityInput {
  repositories: readonly Repository[];
  selectedRepo: string | null;
  activeRepositoryPaths: readonly string[];
  searchActive: boolean;
  initialInactiveLimit?: number;
  resetKey?: string;
}

interface ProgressiveRepositoryVisibilityResult {
  repositories: Repository[];
  hiddenCount: number;
  nextBatchSize: number;
  showMore: () => void;
}

interface ProgressiveRepositoryState {
  scopeKey: string;
  inactiveLimit: number;
  retainedRepositoryPaths: string[];
  displayedRepositoryPaths: string[];
  inventoryRepositoryPaths: string[];
}

function createInitialState(
  scopeKey: string,
  initialInactiveLimit: number
): ProgressiveRepositoryState {
  return {
    scopeKey,
    inactiveLimit: initialInactiveLimit,
    retainedRepositoryPaths: [],
    displayedRepositoryPaths: [],
    inventoryRepositoryPaths: [],
  };
}

export function useProgressiveRepositoryVisibility({
  repositories,
  selectedRepo,
  activeRepositoryPaths,
  searchActive,
  initialInactiveLimit = INITIAL_INACTIVE_REPOSITORY_LIMIT,
  resetKey = '',
}: ProgressiveRepositoryVisibilityInput): ProgressiveRepositoryVisibilityResult {
  const normalizedInitialInactiveLimit = Math.max(0, Math.floor(initialInactiveLimit));
  const scopeKey = `${resetKey}\u0002${normalizedInitialInactiveLimit}\u0002${searchActive}`;
  const [progress, setProgress] = useState<ProgressiveRepositoryState>(() =>
    createInitialState(scopeKey, normalizedInitialInactiveLimit)
  );
  const effectiveProgress =
    progress.scopeKey === scopeKey
      ? progress
      : createInitialState(scopeKey, normalizedInitialInactiveLimit);
  const inventoryRepositoryPaths = useMemo(
    () => repositories.map((repository) => normalizePath(repository.path)),
    [repositories]
  );
  const displayedRepositoryPaths = useMemo(() => {
    const currentPaths = new Set(inventoryRepositoryPaths);
    const previousPaths = new Set(effectiveProgress.inventoryRepositoryPaths);
    const previousCommonPaths = effectiveProgress.inventoryRepositoryPaths.filter((path) =>
      currentPaths.has(path)
    );
    const currentCommonPaths = inventoryRepositoryPaths.filter((path) => previousPaths.has(path));
    const inventoryReordered = previousCommonPaths.some(
      (path, index) => path !== currentCommonPaths[index]
    );
    if (!inventoryReordered) {
      return effectiveProgress.displayedRepositoryPaths;
    }
    const displayedPaths = new Set(effectiveProgress.displayedRepositoryPaths);
    return inventoryRepositoryPaths.filter((path) => displayedPaths.has(path));
  }, [
    effectiveProgress.displayedRepositoryPaths,
    effectiveProgress.inventoryRepositoryPaths,
    inventoryRepositoryPaths,
  ]);
  const visibility = useMemo(
    () =>
      resolveRepositoryVisibility({
        repositories,
        selectedRepo,
        activeRepositoryPaths,
        retainedRepositoryPaths: effectiveProgress.retainedRepositoryPaths,
        displayedRepositoryPaths,
        inactiveLimit: effectiveProgress.inactiveLimit,
        searchActive,
      }),
    [
      activeRepositoryPaths,
      effectiveProgress.inactiveLimit,
      displayedRepositoryPaths,
      effectiveProgress.retainedRepositoryPaths,
      repositories,
      searchActive,
      selectedRepo,
    ]
  );

  useEffect(() => {
    const repositoryPaths = new Set(inventoryRepositoryPaths);
    const nextDisplayedRepositoryPaths = visibility.repositories.map((repository) =>
      normalizePath(repository.path)
    );
    setProgress((current) => {
      const base =
        current.scopeKey === scopeKey
          ? current
          : createInitialState(scopeKey, normalizedInitialInactiveLimit);
      const retainedPaths = new Set(
        base.retainedRepositoryPaths.filter((path) => repositoryPaths.has(path))
      );

      const forcedRepositoryPaths = selectedRepo
        ? [...activeRepositoryPaths, selectedRepo]
        : activeRepositoryPaths;
      if (!searchActive) {
        for (const repositoryPathInput of forcedRepositoryPaths) {
          const repositoryPath = normalizePath(repositoryPathInput);
          if (repositoryPaths.has(repositoryPath)) {
            retainedPaths.add(repositoryPath);
          }
        }
      }

      if (
        current.scopeKey === scopeKey &&
        retainedPaths.size === base.retainedRepositoryPaths.length &&
        [...retainedPaths].every((path, index) => path === base.retainedRepositoryPaths[index]) &&
        nextDisplayedRepositoryPaths.length === base.displayedRepositoryPaths.length &&
        nextDisplayedRepositoryPaths.every(
          (path, index) => path === base.displayedRepositoryPaths[index]
        ) &&
        inventoryRepositoryPaths.length === base.inventoryRepositoryPaths.length &&
        inventoryRepositoryPaths.every(
          (path, index) => path === base.inventoryRepositoryPaths[index]
        )
      ) {
        return current;
      }

      return {
        ...base,
        retainedRepositoryPaths: [...retainedPaths],
        displayedRepositoryPaths: nextDisplayedRepositoryPaths,
        inventoryRepositoryPaths,
      };
    });
  }, [
    activeRepositoryPaths,
    normalizedInitialInactiveLimit,
    inventoryRepositoryPaths,
    scopeKey,
    searchActive,
    selectedRepo,
    visibility.repositories,
  ]);

  const showMore = useCallback(() => {
    setProgress((current) => {
      const base =
        current.scopeKey === scopeKey
          ? current
          : createInitialState(scopeKey, normalizedInitialInactiveLimit);
      return {
        ...base,
        inactiveLimit: base.inactiveLimit + INACTIVE_REPOSITORY_BATCH_SIZE,
      };
    });
  }, [scopeKey, normalizedInitialInactiveLimit]);

  return {
    ...visibility,
    nextBatchSize: Math.min(INACTIVE_REPOSITORY_BATCH_SIZE, visibility.hiddenCount),
    showMore,
  };
}

export function useGroupedRepositoryPagination({
  groupIds,
  resetKey = '',
}: GroupedRepositoryPaginationInput): GroupedRepositoryPaginationResult {
  const [pagination, setPagination] = useState(() => ({
    scopeKey: resetKey,
    limits: {} as Record<string, number>,
  }));
  const effectivePagination =
    pagination.scopeKey === resetKey
      ? pagination
      : { scopeKey: resetKey, limits: {} as Record<string, number> };

  useEffect(() => {
    setPagination((current) => {
      if (current.scopeKey !== resetKey) {
        return { scopeKey: resetKey, limits: {} };
      }
      const validGroupIds = new Set(groupIds);
      const limits = Object.fromEntries(
        Object.entries(current.limits).filter(([groupId]) => validGroupIds.has(groupId))
      );
      return Object.keys(limits).length === Object.keys(current.limits).length
        ? current
        : { ...current, limits };
    });
  }, [groupIds, resetKey]);

  const getPage = useCallback(
    (groupId: string, totalCount: number): GroupedRepositoryPage => {
      const normalizedTotalCount = Math.max(0, Math.floor(totalCount));
      const limit = effectivePagination.limits[groupId] ?? INITIAL_INACTIVE_REPOSITORY_LIMIT;
      const visibleCount = Math.min(normalizedTotalCount, limit);
      const hiddenCount = normalizedTotalCount - visibleCount;

      return {
        visibleCount,
        hiddenCount,
        nextBatchSize: Math.min(INACTIVE_REPOSITORY_BATCH_SIZE, hiddenCount),
      };
    },
    [effectivePagination.limits]
  );

  const showMore = useCallback(
    (groupId: string) => {
      setPagination((current) => {
        const base =
          current.scopeKey === resetKey
            ? current
            : { scopeKey: resetKey, limits: {} as Record<string, number> };
        const currentLimit = base.limits[groupId] ?? INITIAL_INACTIVE_REPOSITORY_LIMIT;

        return {
          ...base,
          limits: {
            ...base.limits,
            [groupId]: currentLimit + INACTIVE_REPOSITORY_BATCH_SIZE,
          },
        };
      });
    },
    [resetKey]
  );

  return { getPage, showMore };
}
