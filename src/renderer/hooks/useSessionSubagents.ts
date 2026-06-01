import type { LiveAgentSubagent } from '@shared/types';
import { useEffect, useState } from 'react';
import { areLiveSubagentListsEqual, buildLiveSubagentCwds } from './useLiveSubagents';
import { useShouldPoll } from './useWindowFocus';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
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
  hasLoaded: boolean;
}

export function useSessionSubagents({
  cwd,
  providerSessionId,
  enabled = true,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseSessionSubagentsOptions): UseSessionSubagentsResult {
  const [items, setItems] = useState<LiveAgentSubagent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const shouldPoll = useShouldPoll();

  useEffect(() => {
    const normalizedCwd = buildLiveSubagentCwds(cwd ? [cwd] : [])[0];

    if (!enabled || !shouldPoll || !normalizedCwd || !providerSessionId) {
      setIsLoading(false);
      setHasLoaded(false);
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    if (!window.electronAPI.agentSubagent?.subscribeSessionSubagents) {
      console.error('[useSessionSubagents] agentSubagent.subscribeSessionSubagents is unavailable');
      setIsLoading(false);
      setHasLoaded(true);
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    setIsLoading(true);
    setHasLoaded(false);
    const subscriptionId = createSubscriptionId();
    let disposed = false;

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
        if (disposed) {
          return;
        }

        const nextItems = event.itemsBySessionId[SINGLE_SESSION_TARGET_ID] ?? [];
        setItems((current) =>
          areLiveSubagentListsEqual(current, nextItems) ? current : nextItems
        );
        setIsLoading(false);
        setHasLoaded(true);
      }
    );

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [cwd, enabled, pollIntervalMs, providerSessionId, shouldPoll]);

  return {
    items,
    isLoading,
    hasLoaded,
  };
}
