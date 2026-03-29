import type { LiveAgentSubagent } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import { groupSubagentsByWorktree } from '@/lib/worktreeAgentSummary';

const POLL_INTERVAL_MS = 5_000;

export function useLiveSubagents(cwds: string[]): Map<string, LiveAgentSubagent[]> {
  const [items, setItems] = useState<LiveAgentSubagent[]>([]);
  const stableCwds = useMemo(() => [...new Set(cwds.filter(Boolean))].sort(), [cwds]);

  useEffect(() => {
    let cancelled = false;

    if (stableCwds.length === 0) {
      setItems([]);
      return;
    }

    const load = async () => {
      try {
        const result = await window.electronAPI.agentSubagent.listLive({
          cwds: stableCwds,
        });

        if (!cancelled) {
          setItems(result.items);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[useLiveSubagents] Failed to load live subagents', error);
          setItems([]);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [stableCwds]);

  return useMemo(() => groupSubagentsByWorktree(items), [items]);
}
