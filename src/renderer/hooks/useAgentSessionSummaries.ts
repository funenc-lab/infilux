import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from '@/stores/agentSessions';

type AgentSessionSummary = Pick<
  Session,
  'id' | 'repoPath' | 'cwd' | 'initialized' | 'agentId' | 'agentCommand' | 'sessionId'
>;

export function useAgentSessionSummaries(): AgentSessionSummary[] {
  // Keep layout subscriptions independent of large replay snapshots and terminal-only metadata.
  const selectSummaries = useMemo(() => {
    let previousSessions: readonly Session[] | undefined;
    let summaries: AgentSessionSummary[] = [];

    return ({ sessions }: { sessions: readonly Session[] }): AgentSessionSummary[] => {
      if (sessions === previousSessions) {
        return summaries;
      }

      const nextSummaries = sessions.map((session, index) => {
        const previousSummary = summaries[index];
        if (previousSummary && previousSessions?.[index] === session) {
          return previousSummary;
        }

        const summary: AgentSessionSummary = {
          id: session.id,
          repoPath: session.repoPath,
          cwd: session.cwd,
          initialized: session.initialized,
          agentId: session.agentId,
          agentCommand: session.agentCommand,
          sessionId: session.sessionId,
        };
        return previousSummary && shallow(previousSummary, summary) ? previousSummary : summary;
      });

      previousSessions = sessions;
      if (!shallow(summaries, nextSummaries)) {
        summaries = nextSummaries;
      }
      return summaries;
    };
  }, []);

  return useAgentSessionsStore(selectSummaries);
}
