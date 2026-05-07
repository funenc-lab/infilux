import type { LiveAgentSubagent } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import { areLiveSubagentListsEqual, buildLiveSubagentCwds } from './useLiveSubagents';

const DEFAULT_POLL_INTERVAL_MS = 2_000;

function createSubscriptionId(): string {
  return `session-subagents-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SessionSubagentPollTarget {
  sessionId: string;
  cwd?: string;
  providerSessionId?: string;
  enabled?: boolean;
}

interface NormalizedSessionSubagentPollTarget {
  sessionId: string;
  cwd: string;
  providerSessionId: string;
}

interface UseSessionSubagentsBySessionOptions {
  targets: SessionSubagentPollTarget[];
  enabled?: boolean;
  pollIntervalMs?: number;
}

interface UseSessionSubagentsBySessionResult {
  itemsBySessionId: Record<string, LiveAgentSubagent[]>;
  isLoading: boolean;
}

function normalizeTargets(
  targets: SessionSubagentPollTarget[]
): NormalizedSessionSubagentPollTarget[] {
  return targets.flatMap((target) => {
    if (!target.enabled || !target.providerSessionId) {
      return [];
    }

    const normalizedCwd = buildLiveSubagentCwds(target.cwd ? [target.cwd] : [])[0];
    if (!normalizedCwd) {
      return [];
    }

    return [
      {
        sessionId: target.sessionId,
        cwd: normalizedCwd,
        providerSessionId: target.providerSessionId,
      },
    ];
  });
}

function buildSessionSubagentMap(
  current: Record<string, LiveAgentSubagent[]>,
  nextEntries: Array<{ sessionId: string; items: LiveAgentSubagent[] }>,
  retainedSessionIds: Set<string>
): Record<string, LiveAgentSubagent[]> | null {
  let changed = false;
  const next: Record<string, LiveAgentSubagent[]> = {};

  for (const { sessionId, items } of nextEntries) {
    const existing = current[sessionId];
    if (items.length === 0) {
      if (existing) {
        changed = true;
      }
      continue;
    }

    if (existing && areLiveSubagentListsEqual(existing, items)) {
      next[sessionId] = existing;
      continue;
    }

    next[sessionId] = items;
    if (!existing || !areLiveSubagentListsEqual(existing, items)) {
      changed = true;
    }
  }

  for (const sessionId of Object.keys(current)) {
    if (!(sessionId in next) && retainedSessionIds.has(sessionId)) {
      changed = true;
    }

    if (!retainedSessionIds.has(sessionId)) {
      changed = true;
    }
  }

  if (!changed && Object.keys(current).length === Object.keys(next).length) {
    return null;
  }

  return next;
}

export function useSessionSubagentsBySession({
  targets,
  enabled = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseSessionSubagentsBySessionOptions): UseSessionSubagentsBySessionResult {
  const normalizedTargets = useMemo(() => normalizeTargets(targets), [targets]);
  const [itemsBySessionId, setItemsBySessionId] = useState<Record<string, LiveAgentSubagent[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || normalizedTargets.length === 0) {
      setIsLoading(false);
      setItemsBySessionId((current) => {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      });
      return;
    }

    if (!window.electronAPI.agentSubagent?.subscribeSessionSubagents) {
      console.error(
        '[useSessionSubagentsBySession] agentSubagent.subscribeSessionSubagents is unavailable'
      );
      setIsLoading(false);
      setItemsBySessionId((current) => {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      });
      return;
    }

    setIsLoading(true);
    const subscriptionId = createSubscriptionId();
    const retainedSessionIds = new Set(normalizedTargets.map((target) => target.sessionId));
    const unsubscribe = window.electronAPI.agentSubagent.subscribeSessionSubagents(
      {
        subscriptionId,
        pollIntervalMs,
        targets: normalizedTargets,
      },
      (event) => {
        const nextEntries = normalizedTargets.map((target) => ({
          sessionId: target.sessionId,
          items: event.itemsBySessionId[target.sessionId] ?? [],
        }));

        setItemsBySessionId((current) => {
          const next = buildSessionSubagentMap(current, nextEntries, retainedSessionIds);
          return next ?? current;
        });
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, normalizedTargets, pollIntervalMs]);

  return {
    itemsBySessionId,
    isLoading,
  };
}
