import { resolveTmuxServerNameForPersistentAgentHostSessionKey } from '@shared/utils/runtimeIdentity';
import { useEffect } from 'react';
import { buildPersistentAgentSessionRecord } from '@/components/chat/agentSessionPersistenceRecord';
import type { Session } from '@/components/chat/SessionBar';
import { isSessionPersistable } from '@/lib/agentSessionPersistence';
import { getRendererEnvironment } from '@/lib/electronEnvironment';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { createAgentSessionPersistenceCoordinator } from './agentSessionPersistenceCoordinator';

export function useAgentSessionPersistence(): void {
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

    let pendingSessions: readonly Session[] | undefined;
    let disposed = false;
    const unsubscribe = useAgentSessionsStore.subscribe(
      (state) => state.sessions,
      (sessions) => {
        const synchronizationScheduled = pendingSessions !== undefined;
        pendingSessions = sessions;
        if (synchronizationScheduled) {
          return;
        }

        // Preserve batching for activation and title updates from the same input event.
        queueMicrotask(() => {
          const latestSessions = pendingSessions;
          pendingSessions = undefined;
          if (!disposed && latestSessions) {
            coordinator.synchronize(latestSessions);
          }
        });
      },
      { fireImmediately: true }
    );

    return () => {
      disposed = true;
      pendingSessions = undefined;
      unsubscribe();
      coordinator.dispose();
    };
  }, []);
}
