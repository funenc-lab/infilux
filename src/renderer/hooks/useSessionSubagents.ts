import type { LiveAgentSubagent } from '@shared/types';
import { useEffect, useState } from 'react';
import { areLiveSubagentListsEqual, buildLiveSubagentCwds } from './useLiveSubagents';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const SINGLE_SESSION_TARGET_ID = 'current-session';

function createSubscriptionId(): string {
  return `session-subagents-${Math.random().toString(36).slice(2, 10)}`;
}

interface UseSessionSubagentsOptions {
  cwd?: string;
  providerSessionId?: string;
  enabled?: boolean;
  pollIntervalMs?: number;
}

interface UseSessionSubagentsResult {
  items: LiveAgentSubagent[];
  isLoading: boolean;
}

export function useSessionSubagents({
  cwd,
  providerSessionId,
  enabled = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseSessionSubagentsOptions): UseSessionSubagentsResult {
  const [items, setItems] = useState<LiveAgentSubagent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const normalizedCwd = buildLiveSubagentCwds(cwd ? [cwd] : [])[0];

    if (!enabled || !normalizedCwd || !providerSessionId) {
      setIsLoading(false);
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    if (!window.electronAPI.agentSubagent?.subscribeSessionSubagents) {
      console.error('[useSessionSubagents] agentSubagent.subscribeSessionSubagents is unavailable');
      setIsLoading(false);
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    setIsLoading(true);
    const subscriptionId = createSubscriptionId();

    const unsubscribe = window.electronAPI.agentSubagent.subscribeSessionSubagents(
      {
        subscriptionId,
        pollIntervalMs,
        targets: [
          {
            sessionId: SINGLE_SESSION_TARGET_ID,
            providerSessionId,
            cwd: normalizedCwd,
          },
        ],
      },
      (event) => {
        const nextItems = event.itemsBySessionId[SINGLE_SESSION_TARGET_ID] ?? [];
        setItems((current) =>
          areLiveSubagentListsEqual(current, nextItems) ? current : nextItems
        );
        setIsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [cwd, enabled, pollIntervalMs, providerSessionId]);

  return {
    items,
    isLoading,
  };
}
