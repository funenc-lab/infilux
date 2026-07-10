import type { PersistentAgentSessionRecord } from '@shared/types';
import { diffPersistentAgentSessionRecords } from '@/components/chat/agentSessionPersistenceSync';
import type { Session } from '@/components/chat/SessionBar';

interface AgentSessionPersistenceCoordinatorDependencies {
  buildRecord: (session: Session) => PersistentAgentSessionRecord;
  isPersistable: (session: Session) => boolean;
  markPersistent: (record: PersistentAgentSessionRecord) => Promise<void>;
  abandon: (uiSessionId: string) => Promise<unknown>;
  cleanupRemovedRecord?: (record: PersistentAgentSessionRecord) => Promise<void> | void;
  onError?: (error: unknown) => void;
}

export interface AgentSessionPersistenceCoordinator {
  synchronize(sessions: readonly Session[]): void;
  flush(): Promise<void>;
  dispose(): void;
}

export function createAgentSessionPersistenceCoordinator(
  dependencies: AgentSessionPersistenceCoordinatorDependencies
): AgentSessionPersistenceCoordinator {
  let previousSnapshotBySessionId = new Map<string, string>();
  let sessionById = new Map<string, Session>();
  let recordBySessionId = new Map<string, PersistentAgentSessionRecord>();
  let mutationQueue = Promise.resolve();
  let disposed = false;

  const enqueue = (mutation: () => Promise<unknown> | unknown): void => {
    mutationQueue = mutationQueue.then(async () => {
      if (disposed) {
        return;
      }
      try {
        await mutation();
      } catch (error) {
        dependencies.onError?.(error);
      }
    });
  };

  return {
    synchronize(sessions) {
      if (disposed) {
        return;
      }
      const nextSessionById = new Map<string, Session>();
      const nextRecordBySessionId = new Map<string, PersistentAgentSessionRecord>();

      for (const session of sessions) {
        if (!dependencies.isPersistable(session)) {
          continue;
        }

        nextSessionById.set(session.id, session);
        const existingRecord = recordBySessionId.get(session.id);
        const record =
          sessionById.get(session.id) === session && existingRecord
            ? existingRecord
            : dependencies.buildRecord(session);
        nextRecordBySessionId.set(session.id, record);
      }

      const { changedRecords, removedRecords, removedSessionIds, nextSnapshotBySessionId } =
        diffPersistentAgentSessionRecords({
          previousSnapshotBySessionId,
          records: [...nextRecordBySessionId.values()],
        });

      sessionById = nextSessionById;
      recordBySessionId = nextRecordBySessionId;
      previousSnapshotBySessionId = nextSnapshotBySessionId;

      for (const record of changedRecords) {
        enqueue(() => dependencies.markPersistent(record));
      }

      const removedRecordIds = new Set(removedRecords.map((record) => record.uiSessionId));
      for (const record of removedRecords) {
        enqueue(async () => {
          await dependencies.cleanupRemovedRecord?.(record);
          await dependencies.abandon(record.uiSessionId);
        });
      }
      for (const uiSessionId of removedSessionIds) {
        if (!removedRecordIds.has(uiSessionId)) {
          enqueue(() => dependencies.abandon(uiSessionId));
        }
      }
    },
    flush() {
      return mutationQueue;
    },
    dispose() {
      disposed = true;
      previousSnapshotBySessionId = new Map();
      sessionById = new Map();
      recordBySessionId = new Map();
    },
  };
}
