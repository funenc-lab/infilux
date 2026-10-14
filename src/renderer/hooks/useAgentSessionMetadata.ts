import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { Session } from '@/components/chat/SessionBar';
import { useAgentSessionsStore } from '@/stores/agentSessions';

type AgentSessionMetadata = Omit<Session, 'replaySnapshot' | 'replaySnapshotCapturedAt'>;

export function useAgentSessionMetadata(): AgentSessionMetadata[] {
  const selectMetadata = useMemo(() => {
    let previousSessions: readonly Session[] | undefined;
    let metadata: AgentSessionMetadata[] = [];

    return ({ sessions }: { sessions: readonly Session[] }): AgentSessionMetadata[] => {
      if (sessions === previousSessions) {
        return metadata;
      }

      const nextMetadata = sessions.map((session, index) => {
        const previousMetadata = metadata[index];
        if (previousMetadata && previousSessions?.[index] === session) {
          return previousMetadata;
        }

        // Replay belongs to the terminal and history subscriptions, not panel layout.
        const {
          replaySnapshot: _replaySnapshot,
          replaySnapshotCapturedAt: _replaySnapshotCapturedAt,
          ...sessionMetadata
        } = session;
        return previousMetadata && shallow(previousMetadata, sessionMetadata)
          ? previousMetadata
          : sessionMetadata;
      });

      previousSessions = sessions;
      if (!shallow(metadata, nextMetadata)) {
        metadata = nextMetadata;
      }
      return metadata;
    };
  }, []);

  return useAgentSessionsStore(selectMetadata);
}
