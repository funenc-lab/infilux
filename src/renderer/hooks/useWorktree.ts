import type {
  ConflictResolution,
  WorktreeCreateOptions,
  WorktreeMergeCleanupOptions,
  WorktreeMergeOptions,
  WorktreeRemoveOptions,
} from '@shared/types';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { sanitizeGitWorktrees } from '@/lib/worktreeData';
import { useWorktreeStore } from '@/stores/worktree';
import { buildWorktreeListMap, type WorktreeListRepoQuery } from './worktreeListCache';
import { worktreeQueryKeys } from './worktreeQueryKeys';

interface WorktreeListOptions {
  enabled?: boolean;
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
  const queryEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: worktreeQueryKeys.list(workdir),
    queryFn: async () => {
      if (!workdir) return [];
      try {
        const worktrees = await window.electronAPI.worktree.list(workdir);
        const safeWorktrees = sanitizeGitWorktrees(Array.isArray(worktrees) ? worktrees : []);
        setWorktrees(safeWorktrees);
        setError(null);
        return safeWorktrees;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load worktrees');
        setWorktrees([]);
        throw error instanceof Error ? error : new Error('Failed to load worktrees');
      }
    },
    enabled: !!workdir && queryEnabled,
    retry: false, // Don't retry on git errors
  });
}

/**
 * Fetch worktrees for multiple repositories in parallel.
 * Returns a map of repo path -> worktrees array and error map.
 */
export function useWorktreeListMultiple(repoInputs: WorktreeListMultipleInput[]) {
  const repoQueries = useMemo(
    () =>
      repoInputs.map((input) =>
        typeof input === 'string'
          ? { repoPath: input, enabled: true }
          : { repoPath: input.repoPath, enabled: input.enabled ?? true }
      ),
    [repoInputs]
  );

  const queries = useQueries({
    queries: repoQueries.map(({ repoPath, enabled }) => ({
      queryKey: worktreeQueryKeys.list(repoPath),
      queryFn: async () => {
        const worktrees = await window.electronAPI.worktree.list(repoPath);
        return sanitizeGitWorktrees(Array.isArray(worktrees) ? worktrees : []);
      },
      enabled,
      retry: false,
      staleTime: 30000, // Cache for 30 seconds to avoid excessive refetching
    })),
  });

  const worktreesMap = useMemo(() => {
    return buildWorktreeListMap(
      repoQueries as WorktreeListRepoQuery[],
      queries.map((query) => query?.data)
    );
  }, [queries, repoQueries]);

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
      map[repoPath] = repoQueries[i]?.enabled ? (queries[i]?.isLoading ?? false) : false;
    }
    return map;
  }, [queries, repoQueries]);

  const isLoading = repoQueries.some(
    (queryInfo, index) => queryInfo.enabled && queries[index]?.isLoading
  );

  const refetchAll = () => {
    for (let i = 0; i < repoQueries.length; i++) {
      if (!repoQueries[i]?.enabled) {
        continue;
      }
      queries[i]?.refetch();
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
    onSuccess: (_, { workdir }) => {
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
