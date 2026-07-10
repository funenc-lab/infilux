import { resolveTmuxServerNameForPersistentAgentHostSessionKey } from '@shared/utils/runtimeIdentity';
import { useEffect, useRef } from 'react';
import { buildPersistentAgentSessionRecord } from '@/components/chat/agentSessionPersistenceRecord';
import { isSessionPersistable } from '@/lib/agentSessionPersistence';
import { getRendererEnvironment } from '@/lib/electronEnvironment';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import {
  type AgentSessionPersistenceCoordinator,
  createAgentSessionPersistenceCoordinator,
} from './agentSessionPersistenceCoordinator';

export function useAgentSessionPersistence(): void {
  const sessions = useAgentSessionsStore((state) => state.sessions);
  const coordinatorRef = useRef<AgentSessionPersistenceCoordinator | null>(null);

  useEffect(() => {
    const environment = getRendererEnvironment();
    const coordinator = createAgentSessionPersistenceCoordinator({
      buildRecord: (session) => buildPersistentAgentSessionRecord(session, environment),
      isPersistable: isSessionPersistable,
      markPersistent: async (record) => {
        await window.electronAPI.agentSession.markPersistent(record);
      },
      abandon: (uiSessionId) => window.electronAPI.agentSession.abandon(uiSessionId),
      cleanupRemovedRecord: (record) => {
        const cleanupTasks: Promise<void>[] = [];
        if (record.hostKind === 'tmux') {
          const serverName = resolveTmuxServerNameForPersistentAgentHostSessionKey(
            record.hostSessionKey,
            environment.runtimeChannel
          );
          cleanupTasks.push(
            window.electronAPI.tmux
              .killSession(record.cwd, { name: record.hostSessionKey, serverName })
              .catch(() => undefined)
          );
        }

        if (record.backendSessionId) {
          cleanupTasks.push(
            window.electronAPI.session.kill(record.backendSessionId).catch((error) => {
              console.error(
                `[AgentSessionPersistence] Failed to kill removed backend session ${record.backendSessionId}`,
                error
              );
            })
          );
        }

        return Promise.all(cleanupTasks).then(() => undefined);
      },
      onError: (error) => {
        console.error('[AgentSessionPersistence] Failed to persist session mutation', error);
      },
    });

    coordinatorRef.current = coordinator;

    return () => {
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    coordinatorRef.current?.synchronize(sessions);
  }, [sessions]);
}
