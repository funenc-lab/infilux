import type { FileChangesResult } from '@shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toastManager } from '@/components/ui/toast';
import { useShouldPoll } from '@/hooks/useWindowFocus';
import { useI18n } from '@/i18n';
import { buildSourceControlToastCopy } from '@/lib/feedbackCopy';
import { resolveGitPollingInterval, shouldRetryGitPollingError } from '@/lib/gitPollingError';

const emptyResult: FileChangesResult = { changes: [] };

export function useFileChanges(workdir: string | null, isActive = true) {
  const shouldPoll = useShouldPoll();

  return useQuery({
    queryKey: ['git', 'file-changes', workdir],
    queryFn: async () => {
      if (!workdir) return emptyResult;
      return window.electronAPI.git.getFileChanges(workdir);
    },
    enabled: !!workdir,
    retry: shouldRetryGitPollingError,
    refetchInterval: (query) => {
      if (!isActive || !shouldPoll) return false;
      return resolveGitPollingInterval(
        query.state.error,
        query.state.data?.truncated ? 60000 : 5000,
        30000
      );
    }, // Only poll when tab is active and user is not idle
    refetchIntervalInBackground: false, // Only poll when window is focused
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 2000, // Avoid redundant requests within 2s
  });
}

export function useFileDiff(
  workdir: string | null,
  path: string | null,
  staged: boolean,
  options?: { enabled?: boolean }
) {
  const shouldPoll = useShouldPoll();

  return useQuery({
    queryKey: ['git', 'file-diff', workdir, path, staged],
    queryFn: async () => {
      if (!workdir || !path) return null;
      return window.electronAPI.git.getFileDiff(workdir, path, staged);
    },
    enabled: (options?.enabled ?? true) && !!workdir && !!path,
    retry: shouldRetryGitPollingError,
    staleTime: 0, // Always consider data stale
    refetchInterval: (query) => {
      if (!shouldPoll) {
        return false;
      }

      return resolveGitPollingInterval(query.state.error, 2000, 30000);
    }, // Poll every 2s when window is focused
    refetchIntervalInBackground: false, // Don't poll in background
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useGitStage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, paths }: { workdir: string; paths: string[] }) => {
      await window.electronAPI.git.stage(workdir, paths);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      const errorCopy = buildSourceControlToastCopy(
        {
          action: 'stage',
          phase: 'error',
          message: error instanceof Error ? error.message : t('Unknown error'),
        },
        t
      );
      toastManager.add({
        title: errorCopy.title,
        description: errorCopy.description,
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitUnstage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, paths }: { workdir: string; paths: string[] }) => {
      await window.electronAPI.git.unstage(workdir, paths);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      const errorCopy = buildSourceControlToastCopy(
        {
          action: 'unstage',
          phase: 'error',
          message: error instanceof Error ? error.message : t('Unknown error'),
        },
        t
      );
      toastManager.add({
        title: errorCopy.title,
        description: errorCopy.description,
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitDiscard() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, paths }: { workdir: string; paths: string[] }) => {
      await window.electronAPI.git.discard(workdir, paths);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      const errorCopy = buildSourceControlToastCopy(
        {
          action: 'discard',
          phase: 'error',
          message: error instanceof Error ? error.message : t('Unknown error'),
        },
        t
      );
      toastManager.add({
        title: errorCopy.title,
        description: errorCopy.description,
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitCommit() {
  const queryClient = useQueryClient();
  const { t } = useI18n();

  return useMutation({
    mutationFn: async ({ workdir, message }: { workdir: string; message: string }) => {
      return window.electronAPI.git.commit(workdir, message);
    },
    onSuccess: async (_, { workdir }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['git', 'file-changes', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'log', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'log-infinite', workdir] }),
        queryClient.invalidateQueries({ queryKey: ['git', 'file-diff', workdir] }),
      ]);
    },
    onError: (error) => {
      const errorCopy = buildSourceControlToastCopy(
        {
          action: 'commit',
          phase: 'error',
          message: error instanceof Error ? error.message : t('Unknown error'),
        },
        t
      );
      toastManager.add({
        title: errorCopy.title,
        description: errorCopy.description,
        type: 'error',
        timeout: 5000,
      });
    },
  });
}

export function useGitFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workdir }: { workdir: string }) => {
      await window.electronAPI.git.fetch(workdir);
    },
    onSuccess: async (_, { workdir }) => {
      await queryClient.invalidateQueries({ queryKey: ['git', 'status', workdir] });
    },
  });
}
