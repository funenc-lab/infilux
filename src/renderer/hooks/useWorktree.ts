import type {
  ConflictResolution,
  GitWorktree,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeRemoveOptions,
} from '@shared/types';
import { normalizePath } from '@shared/utils/path';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import {
  canRecoverWorktreeListFromPreviousSnapshot,
  normalizeWorktreeLoadErrorMessage,
  shouldRetryWorktreeLoadError,
} from '@/lib/worktreeLoadError';
import { useWorktreeStore } from '@/stores/worktree';
import {
  buildWorktreeListMap,
  resolveWorktreeListSnapshot,
  type WorktreeListRecoveryReason,
  type WorktreeListRepoQuery,
} from './worktreeListCache';
import { worktreeQueryKeys } from './worktreeQueryKeys';

interface WorktreeListOptions {
  enabled?: boolean;
}

const WORKTREE_RECOVERY_COOLDOWN_MS = 5000;
const MAX_CONCURRENT_WORKTREE_LIST_REQUESTS = 4;
const lastWorktreeRecoveryAt = new Map<string, number>();

function haveSamePaths(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((path) => right.has(path));
}

function maybeScheduleWorktreeListRecovery(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  repoPath: string,
  recoveryReason: WorktreeListRecoveryReason
) {
  if (recoveryReason === null) {
    lastWorktreeRecoveryAt.delete(repoPath);
    return;
  }

  if (recoveryReason !== 'empty' && recoveryReason !== 'transient-error') {
    return;
  }

  const now = Date.now();
  const lastAttemptAt = lastWorktreeRecoveryAt.get(repoPath) ?? 0;
  if (now - lastAttemptAt < WORKTREE_RECOVERY_COOLDOWN_MS) {
    return;
  }

  lastWorktreeRecoveryAt.set(repoPath, now);
  void queryClient.invalidateQueries({
    queryKey: worktreeQueryKeys.list(repoPath),
  });
}

export function resetWorktreeRecoveryStateForTests() {
  lastWorktreeRecoveryAt.clear();
}

type WorktreeListMultipleInput =
  | string
  | {
      repoPath: string;
      enabled?: boolean;
    };

export function useWorktreeList(workdir: string | null, options?: WorktreeListOptions) {
  const setWorktrees = useWorktreeStore((s) => s.setWorktrees);
  const setError = useWorktreeStore((s) => s.setError);
  const queryClient = useQueryClient();
  const queryEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: worktreeQueryKeys.list(workdir),
    queryFn: async () => {
      if (!workdir) return [];
      const previousWorktrees =
        queryClient.getQueryData<GitWorktree[]>(worktreeQueryKeys.list(workdir)) ?? [];
      try {
        const worktrees = await window.electronAPI.worktree.list(workdir);
        const { worktrees: safeWorktrees, recoveryReason } = resolveWorktreeListSnapshot(
          worktrees,
          previousWorktrees
        );
        maybeScheduleWorktreeListRecovery(queryClient, workdir, recoveryReason);
        setWorktrees(safeWorktrees);
        setError(null);
        return safeWorktrees;
      } catch (error) {
        if (canRecoverWorktreeListFromPreviousSnapshot(error, previousWorktrees)) {
          maybeScheduleWorktreeListRecovery(queryClient, workdir, 'transient-error');
          setWorktrees(previousWorktrees);
          setError(null);
          return previousWorktrees;
        }

        const message = normalizeWorktreeLoadErrorMessage(error);
        setError(message);
        throw error instanceof Error ? error : new Error(message);
      }
    },
    enabled: !!workdir && queryEnabled,
    retry: shouldRetryWorktreeLoadError,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Fetch worktrees for multiple repositories in parallel.
 * Returns a map of repo path -> worktrees array and error map.
 */
export function useWorktreeListMultiple(repoInputs: WorktreeListMultipleInput[]) {
  const previousWorktreesMapRef = useRef<Record<string, GitWorktree[]>>({});
  const queryClient = useQueryClient();
  const repoQueries = useMemo(
    () =>
      repoInputs.map((input) =>
        typeof input === 'string'
          ? { repoPath: input, enabled: true }
          : { repoPath: input.repoPath, enabled: input.enabled ?? true }
      ),
    [repoInputs]
  );
  const [completedRepoPaths, setCompletedRepoPaths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const enabledRepoPaths = new Set(
      repoQueries.filter(({ enabled }) => enabled).map(({ repoPath }) => repoPath)
    );
    setCompletedRepoPaths((currentPaths) => {
      const nextPaths = new Set(
        [...currentPaths].filter((repoPath) => enabledRepoPaths.has(repoPath))
      );
      return haveSamePaths(currentPaths, nextPaths) ? currentPaths : nextPaths;
    });
  }, [repoQueries]);

  const queryEnabledByIndex = useMemo(() => {
    let pendingQueryCount = 0;

    return repoQueries.map(({ repoPath, enabled }) => {
      if (!enabled || completedRepoPaths.has(repoPath)) {
        return Boolean(enabled && completedRepoPaths.has(repoPath));
      }

      if (pendingQueryCount >= MAX_CONCURRENT_WORKTREE_LIST_REQUESTS) {
        return false;
      }

      pendingQueryCount += 1;
      return true;
    });
  }, [completedRepoPaths, repoQueries]);

  const queries = useQueries({
    queries: repoQueries.map(({ repoPath }, index) => ({
      queryKey: worktreeQueryKeys.list(repoPath),
      queryFn: async () => {
        const previousWorktrees = previousWorktreesMapRef.current[repoPath] ?? [];
        try {
          const worktrees = await window.electronAPI.worktree.list(repoPath);
          const { worktrees: safeWorktrees, recoveryReason } = resolveWorktreeListSnapshot(
            worktrees,
            previousWorktrees
          );
          maybeScheduleWorktreeListRecovery(queryClient, repoPath, recoveryReason);
          return safeWorktrees;
        } catch (error) {
          if (canRecoverWorktreeListFromPreviousSnapshot(error, previousWorktrees)) {
            maybeScheduleWorktreeListRecovery(queryClient, repoPath, 'transient-error');
            return previousWorktrees;
          }

          const message = normalizeWorktreeLoadErrorMessage(error);
          throw error instanceof Error ? error : new Error(message);
        }
      },
      enabled: queryEnabledByIndex[index],
      retry: shouldRetryWorktreeLoadError,
      staleTime: 30000, // Cache for 30 seconds to avoid excessive refetching
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  });

  useEffect(() => {
    setCompletedRepoPaths((currentPaths) => {
      let nextPaths = currentPaths;

      for (let index = 0; index < repoQueries.length; index += 1) {
        if (!queryEnabledByIndex[index]) {
          continue;
        }

        const query = queries[index];
        if (!query?.isSuccess && !query?.isError) {
          continue;
        }

        const repoPath = repoQueries[index]?.repoPath;
        if (!repoPath || nextPaths.has(repoPath)) {
          continue;
        }

        if (nextPaths === currentPaths) {
          nextPaths = new Set(currentPaths);
        }
        nextPaths.add(repoPath);
      }

      return nextPaths;
    });
  }, [queries, queryEnabledByIndex, repoQueries]);

  const worktreesMap = useMemo(() => {
    return buildWorktreeListMap(
      repoQueries as WorktreeListRepoQuery[],
      queries.map((query) => query?.data),
      previousWorktreesMapRef.current
    );
  }, [queries, repoQueries]);

  useEffect(() => {
    previousWorktreesMapRef.current = worktreesMap;
  }, [worktreesMap]);

  const errorsMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (let i = 0; i < repoQueries.length; i++) {
      const repoPath = repoQueries[i]?.repoPath;
      if (!repoPath) {
        continue;
      }
      if (!repoQueries[i]?.enabled) {
        map[repoPath] = null;
        continue;
      }
      const query = queries[i];
      if (query?.error) {
        map[repoPath] = query.error instanceof Error ? query.error.message : 'Failed to load';
      } else {
        map[repoPath] = null;
      }
    }
    return map;
  }, [queries, repoQueries]);

  const loadingMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (let i = 0; i < repoQueries.length; i++) {
      const repoPath = repoQueries[i]?.repoPath;
      if (!repoPath) {
        continue;
      }
      map[repoPath] = repoQueries[i]?.enabled
        ? (queries[i]?.isLoading ?? !queryEnabledByIndex[i])
        : false;
    }
    return map;
  }, [queries, queryEnabledByIndex, repoQueries]);

  const isLoading = repoQueries.some(
    (queryInfo, index) =>
      queryInfo.enabled && (queries[index]?.isLoading ?? !queryEnabledByIndex[index])
  );

  const refetchAll = () => {
    setCompletedRepoPaths(new Set());
    for (const { repoPath, enabled } of repoQueries) {
      if (enabled) {
        void queryClient.invalidateQueries({
          queryKey: worktreeQueryKeys.list(repoPath),
          refetchType: 'none',
        });
      }
    }
  };

  return { worktreesMap, errorsMap, loadingMap, isLoading, refetchAll };
}

export function useWorktreeCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      options,
    }: {
      workdir: string;
      options: WorktreeCreateOptions;
    }) => {
      await window.electronAPI.worktree.add(workdir, options);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list(workdir) });
    },
  });
}

export function removeWorktreeFromListCache(
  queryClient: Pick<QueryClient, 'setQueryData'>,
  workdir: string,
  worktreePath: string
): void {
  const normalizedRemovedPath = normalizePath(worktreePath);

  queryClient.setQueryData<GitWorktree[]>(worktreeQueryKeys.list(workdir), (currentWorktrees) => {
    if (!Array.isArray(currentWorktrees)) {
      return currentWorktrees;
    }

    return sanitizeGitWorktrees(currentWorktrees).filter(
      (worktree) => normalizePath(worktree.path) !== normalizedRemovedPath
    );
  });
}

export function useWorktreeRemove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      options,
    }: {
      workdir: string;
      options: WorktreeRemoveOptions;
    }) => {
      await window.electronAPI.worktree.remove(workdir, options);
    },
    onSuccess: (_, { workdir, options }) => {
      removeWorktreeFromListCache(queryClient, workdir, options.path);
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list(workdir) });
    },
  });
}

// Merge operations
export function useWorktreeMerge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      options,
    }: {
      workdir: string;
      options: WorktreeMergeOptions;
    }) => {
      return window.electronAPI.worktree.merge(workdir, options);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list(workdir) });
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.mergeState(workdir) });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', workdir] });
    },
  });
}

export function useWorktreeMergeState(workdir: string | null) {
  return useQuery({
    queryKey: worktreeQueryKeys.mergeState(workdir),
    queryFn: async () => {
      if (!workdir) return { inProgress: false };
      return window.electronAPI.worktree.getMergeState(workdir);
    },
    enabled: !!workdir,
  });
}

export function useWorktreeConflicts(workdir: string | null) {
  return useQuery({
    queryKey: worktreeQueryKeys.conflicts(workdir),
    queryFn: async () => {
      if (!workdir) return [];
      return window.electronAPI.worktree.getConflicts(workdir);
    },
    enabled: !!workdir,
  });
}

export function useWorktreeConflictContent(workdir: string | null, filePath: string | null) {
  return useQuery({
    queryKey: worktreeQueryKeys.conflictContent(workdir, filePath),
    queryFn: async () => {
      if (!workdir || !filePath) return null;
      return window.electronAPI.worktree.getConflictContent(workdir, filePath);
    },
    enabled: !!workdir && !!filePath,
  });
}

export function useWorktreeResolveConflict() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      resolution,
    }: {
      workdir: string;
      resolution: ConflictResolution;
    }) => {
      await window.electronAPI.worktree.resolveConflict(workdir, resolution);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.conflicts(workdir) });
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.mergeState(workdir) });
    },
  });
}

export function useWorktreeMergeAbort() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir }: { workdir: string }) => {
      await window.electronAPI.worktree.abortMerge(workdir);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.mergeState(workdir) });
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.conflicts(workdir) });
    },
  });
}

export function useWorktreeMergeContinue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workdir,
      message,
      cleanupOptions,
    }: {
      workdir: string;
      message?: string;
      cleanupOptions?: WorktreeMergeCleanupOptions;
    }) => {
      return window.electronAPI.worktree.continueMerge(workdir, message, cleanupOptions);
    },
    onSuccess: (_, { workdir }) => {
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list(workdir) });
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.mergeState(workdir) });
      queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.conflicts(workdir) });
      queryClient.invalidateQueries({ queryKey: ['git', 'branches', workdir] });
    },
  });
}
