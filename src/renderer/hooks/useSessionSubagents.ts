import type { LiveAgentSubagent } from '@shared/types';
import { useEffect, useState } from 'react';
import { areLiveSubagentListsEqual, buildLiveSubagentCwds } from './useLiveSubagents';

const DEFAULT_POLL_INTERVAL_MS = 2_000;

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

    if (!window.electronAPI.agentSubagent?.listSession) {
      console.error('[useSessionSubagents] agentSubagent.listSession is unavailable');
      setIsLoading(false);
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    let cancelled = false;

    const load = async (markLoading: boolean) => {
      if (markLoading && !cancelled) {
        setIsLoading(true);
      }

      try {
        const result = await window.electronAPI.agentSubagent.listSession({
          providerSessionId,
          cwd: normalizedCwd,
        });

        if (!cancelled) {
          setItems((current) =>
            areLiveSubagentListsEqual(current, result.items) ? current : result.items
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[useSessionSubagents] Failed to load session subagents', error);
          setItems((current) => (current.length === 0 ? current : []));
        }
      } finally {
        if (markLoading && !cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load(true);
    const timer = window.setInterval(() => {
      void load(false);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cwd, enabled, pollIntervalMs, providerSessionId]);

  return {
    items,
    isLoading,
  };
}
