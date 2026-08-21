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
  inventoryKey: string;
  inactiveLimit: number;
  retainedRepositoryPaths: string[];
}

function createInitialState(
  inventoryKey: string,
  initialInactiveLimit: number
): ProgressiveRepositoryState {
  return {
    inventoryKey,
    inactiveLimit: initialInactiveLimit,
    retainedRepositoryPaths: [],
  };
}

function buildRepositoryInventoryKey(repositories: readonly Repository[]): string {
  return repositories
    .map((repository) => `${repository.id}\u0000${normalizePath(repository.path)}`)
    .join('\u0001');
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
  const inventoryKey = useMemo(
    () =>
      `${resetKey}\u0002${normalizedInitialInactiveLimit}\u0002${buildRepositoryInventoryKey(repositories)}`,
    [normalizedInitialInactiveLimit, repositories, resetKey]
  );
  const [progress, setProgress] = useState<ProgressiveRepositoryState>(() =>
    createInitialState(inventoryKey, normalizedInitialInactiveLimit)
  );
  const effectiveProgress =
    progress.inventoryKey === inventoryKey
      ? progress
      : createInitialState(inventoryKey, normalizedInitialInactiveLimit);
  const visibility = useMemo(
    () =>
      resolveRepositoryVisibility({
        repositories,
        selectedRepo,
        activeRepositoryPaths,
        retainedRepositoryPaths: effectiveProgress.retainedRepositoryPaths,
        inactiveLimit: effectiveProgress.inactiveLimit,
        searchActive,
      }),
    [
      activeRepositoryPaths,
      effectiveProgress.inactiveLimit,
      effectiveProgress.retainedRepositoryPaths,
      repositories,
      searchActive,
      selectedRepo,
    ]
  );

  useEffect(() => {
    if (searchActive) {
      setProgress((current) =>
        current.inventoryKey === inventoryKey
          ? current
          : createInitialState(inventoryKey, normalizedInitialInactiveLimit)
      );
      return;
    }

    setProgress((current) => {
      const base =
        current.inventoryKey === inventoryKey
          ? current
          : createInitialState(inventoryKey, normalizedInitialInactiveLimit);
      const retainedPaths = new Set(base.retainedRepositoryPaths.map(normalizePath));
      let changed = current.inventoryKey !== inventoryKey;

      const forcedRepositoryPaths = selectedRepo
        ? [...activeRepositoryPaths, selectedRepo]
        : activeRepositoryPaths;
      for (const repositoryPathInput of forcedRepositoryPaths) {
        const repositoryPath = normalizePath(repositoryPathInput);
        if (!retainedPaths.has(repositoryPath)) {
          retainedPaths.add(repositoryPath);
          changed = true;
        }
      }

      if (!changed) {
        return current;
      }

      return {
        ...base,
        retainedRepositoryPaths: [...retainedPaths],
      };
    });
  }, [
    activeRepositoryPaths,
    inventoryKey,
    normalizedInitialInactiveLimit,
    searchActive,
    selectedRepo,
  ]);

  const showMore = useCallback(() => {
    setProgress((current) => {
      const base =
        current.inventoryKey === inventoryKey
          ? current
          : createInitialState(inventoryKey, normalizedInitialInactiveLimit);
      return {
        ...base,
        inactiveLimit: base.inactiveLimit + INACTIVE_REPOSITORY_BATCH_SIZE,
      };
    });
  }, [inventoryKey, normalizedInitialInactiveLimit]);

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
  const groupInventoryKey = useMemo(
    () => `${resetKey}\u0002${[...groupIds].sort().join('\u0001')}`,
    [groupIds, resetKey]
  );
  const [pagination, setPagination] = useState(() => ({
    inventoryKey: groupInventoryKey,
    limits: {} as Record<string, number>,
  }));
  const effectivePagination =
    pagination.inventoryKey === groupInventoryKey
      ? pagination
      : { inventoryKey: groupInventoryKey, limits: {} as Record<string, number> };

  useEffect(() => {
    setPagination((current) =>
      current.inventoryKey === groupInventoryKey
        ? current
        : { inventoryKey: groupInventoryKey, limits: {} }
    );
  }, [groupInventoryKey]);

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
          current.inventoryKey === groupInventoryKey
            ? current
            : { inventoryKey: groupInventoryKey, limits: {} as Record<string, number> };
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
    [groupInventoryKey]
  );

  return { getPage, showMore };
}
