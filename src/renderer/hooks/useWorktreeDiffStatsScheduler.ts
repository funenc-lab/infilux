import { useEffect, useId, useRef } from 'react';
import { createDiffStatsSchedule, type DiffStatsScopeInput } from '@/lib/worktreeDiffStatsSchedule';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';

export interface UseWorktreeDiffStatsSchedulerInput extends DiffStatsScopeInput {
  enabled: boolean;
}

function createScopeKey({
  collapsed,
  enabled,
  selectedPath,
  livePaths,
  visiblePaths,
}: UseWorktreeDiffStatsSchedulerInput): string {
  return [
    collapsed ? '1' : '0',
    enabled ? '1' : '0',
    selectedPath ?? '',
    livePaths.join('\u0000'),
    visiblePaths.join('\u0000'),
  ].join('\u0000');
}

export function useWorktreeDiffStatsScheduler(): void {
  const scopes = useWorktreeActivityStore((state) => state.diffStatsScopes);
  const scheduleRef = useRef<ReturnType<typeof createDiffStatsSchedule> | null>(null);

  if (!scheduleRef.current) {
    scheduleRef.current = createDiffStatsSchedule({
      fetchPath: async (path) => useWorktreeActivityStore.getState().fetchDiffStats([path]),
      getScope: () => useWorktreeActivityStore.getState().getDiffStatsScope(),
    });
  }

  useEffect(() => {
    const schedule = scheduleRef.current;
    if (!schedule) {
      return;
    }
    schedule.start();
    return () => schedule.stop();
  }, []);

  useEffect(() => {
    if (Object.keys(scopes).length === 0) {
      return;
    }
    void scheduleRef.current?.refresh();
  }, [scopes]);
}

export function useRegisterWorktreeDiffStatsScope(input: UseWorktreeDiffStatsSchedulerInput): void {
  const ownerId = useId();
  const registerScope = useWorktreeActivityStore((state) => state.registerDiffStatsScope);
  const unregisterScope = useWorktreeActivityStore((state) => state.unregisterDiffStatsScope);
  const scopeKey = createScopeKey(input);
  const scopeRef = useRef<{ key: string; value: UseWorktreeDiffStatsSchedulerInput } | null>(null);
  if (!scopeRef.current || scopeRef.current.key !== scopeKey) {
    scopeRef.current = {
      key: scopeKey,
      value: {
        collapsed: input.collapsed,
        enabled: input.enabled,
        selectedPath: input.selectedPath,
        livePaths: [...input.livePaths],
        visiblePaths: [...input.visiblePaths],
      },
    };
  }
  const stableScope = scopeRef.current.value;

  useEffect(() => {
    registerScope(ownerId, stableScope);
    return () => unregisterScope(ownerId);
  }, [ownerId, registerScope, stableScope, unregisterScope]);
}
