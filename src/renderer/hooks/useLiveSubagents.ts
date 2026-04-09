import type { LiveAgentSubagent } from '@shared/types';
import { useEffect, useMemo, useState } from 'react';
import { normalizePath } from '@/App/storage';
import { groupSubagentsByWorktree } from '@/lib/worktreeAgentSummary';

const POLL_INTERVAL_MS = 5_000;

export function buildLiveSubagentCwds(cwds: string[]): string[] {
  return [...new Set(cwds.filter(Boolean).map((cwd) => normalizePath(cwd)))].sort();
}

export function buildPolledLiveSubagentCwds(
  visibleCwds: string[],
  activeSessionCwds: string[]
): string[] {
  if (visibleCwds.length === 0 || activeSessionCwds.length === 0) {
    return [];
  }

  const visibleCwdSet = new Set(buildLiveSubagentCwds(visibleCwds));
  return buildLiveSubagentCwds(activeSessionCwds).filter((cwd) => visibleCwdSet.has(cwd));
}

function buildLiveSubagentCwdsKey(cwds: string[]): string {
  return buildLiveSubagentCwds(cwds).join('\0');
}

export function areLiveSubagentListsEqual(
  left: LiveAgentSubagent[],
  right: LiveAgentSubagent[]
): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index];
    const rightItem = right[index];

    if (
      leftItem.id !== rightItem.id ||
      leftItem.provider !== rightItem.provider ||
      leftItem.threadId !== rightItem.threadId ||
      leftItem.rootThreadId !== rightItem.rootThreadId ||
      leftItem.parentThreadId !== rightItem.parentThreadId ||
      leftItem.cwd !== rightItem.cwd ||
      leftItem.label !== rightItem.label ||
      leftItem.agentType !== rightItem.agentType ||
      leftItem.summary !== rightItem.summary ||
      leftItem.status !== rightItem.status ||
      leftItem.lastSeenAt !== rightItem.lastSeenAt
    ) {
      return false;
    }
  }

  return true;
}

export function useLiveSubagents(cwds: string[]): Map<string, LiveAgentSubagent[]> {
  const [items, setItems] = useState<LiveAgentSubagent[]>([]);
  const stableCwdKey = useMemo(() => buildLiveSubagentCwdsKey(cwds), [cwds]);
  const stableCwds = useMemo(() => (stableCwdKey ? stableCwdKey.split('\0') : []), [stableCwdKey]);

  useEffect(() => {
    let cancelled = false;

    if (stableCwds.length === 0) {
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    if (!window.electronAPI.agentSubagent?.listLive) {
      console.error('[useLiveSubagents] agentSubagent.listLive is unavailable');
      setItems((current) => (current.length === 0 ? current : []));
      return;
    }

    const load = async () => {
      try {
        const result = await window.electronAPI.agentSubagent.listLive({
          cwds: stableCwds,
        });

        if (!cancelled) {
          setItems((current) =>
            areLiveSubagentListsEqual(current, result.items) ? current : result.items
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[useLiveSubagents] Failed to load live subagents', error);
          setItems((current) => (current.length === 0 ? current : []));
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
