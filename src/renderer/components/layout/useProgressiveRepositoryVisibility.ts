import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Repository } from '@/App/constants';
import { normalizePath } from '@/App/storage';
import { resolveRepositoryVisibility } from './repositoryVisibilityPolicy';

export const INITIAL_INACTIVE_REPOSITORY_LIMIT = 8;
export const INACTIVE_REPOSITORY_BATCH_SIZE = 8;

interface ProgressiveRepositoryVisibilityInput {
  repositories: readonly Repository[];
  selectedRepo: string | null;
  activeRepositoryPaths: readonly string[];
  searchActive: boolean;
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

function createInitialState(inventoryKey: string): ProgressiveRepositoryState {
  return {
    inventoryKey,
    inactiveLimit: INITIAL_INACTIVE_REPOSITORY_LIMIT,
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
  resetKey = '',
}: ProgressiveRepositoryVisibilityInput): ProgressiveRepositoryVisibilityResult {
  const inventoryKey = useMemo(
    () => `${resetKey}\u0002${buildRepositoryInventoryKey(repositories)}`,
    [repositories, resetKey]
  );
  const [progress, setProgress] = useState<ProgressiveRepositoryState>(() =>
    createInitialState(inventoryKey)
  );
  const effectiveProgress =
    progress.inventoryKey === inventoryKey ? progress : createInitialState(inventoryKey);
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
        current.inventoryKey === inventoryKey ? current : createInitialState(inventoryKey)
      );
      return;
    }

    setProgress((current) => {
      const base =
        current.inventoryKey === inventoryKey ? current : createInitialState(inventoryKey);
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
  }, [activeRepositoryPaths, inventoryKey, searchActive, selectedRepo]);

  const showMore = useCallback(() => {
    setProgress((current) => {
      const base =
        current.inventoryKey === inventoryKey ? current : createInitialState(inventoryKey);
      return {
        ...base,
        inactiveLimit: base.inactiveLimit + INACTIVE_REPOSITORY_BATCH_SIZE,
      };
    });
  }, [inventoryKey]);

  return {
    ...visibility,
    nextBatchSize: Math.min(INACTIVE_REPOSITORY_BATCH_SIZE, visibility.hiddenCount),
    showMore,
  };
}
