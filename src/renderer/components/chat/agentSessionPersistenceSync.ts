import type { PersistentAgentSessionRecord } from '@shared/types';

type DiffPersistentAgentSessionRecordsOptions = {
  previousSnapshotBySessionId: Map<string, string>;
  records: PersistentAgentSessionRecord[];
};

function normalizePersistentAgentSessionRecord(record: PersistentAgentSessionRecord) {
  const { updatedAt: _updatedAt, ...stableRecord } = record;
  return stableRecord;
}

function parsePersistentAgentSessionRecordSnapshot(
  snapshot: string
): PersistentAgentSessionRecord | null {
  try {
    const parsed = JSON.parse(snapshot) as PersistentAgentSessionRecord;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function serializePersistentAgentSessionRecordSnapshot(
  record: PersistentAgentSessionRecord
): string {
  return JSON.stringify(normalizePersistentAgentSessionRecord(record));
}

export function diffPersistentAgentSessionRecords({
  previousSnapshotBySessionId,
  records,
}: DiffPersistentAgentSessionRecordsOptions): {
  changedRecords: PersistentAgentSessionRecord[];
  removedRecords: PersistentAgentSessionRecord[];
  removedSessionIds: string[];
  nextSnapshotBySessionId: Map<string, string>;
} {
  const changedRecords: PersistentAgentSessionRecord[] = [];
  const removedRecords: PersistentAgentSessionRecord[] = [];
  const nextSnapshotBySessionId = new Map<string, string>();

  for (const record of records) {
    const snapshot = serializePersistentAgentSessionRecordSnapshot(record);
    nextSnapshotBySessionId.set(record.uiSessionId, snapshot);

    if (previousSnapshotBySessionId.get(record.uiSessionId) !== snapshot) {
      changedRecords.push(record);
    }
  }

  const removedSessionIds = [...previousSnapshotBySessionId.keys()].filter((uiSessionId) => {
    if (nextSnapshotBySessionId.has(uiSessionId)) {
      return false;
    }

    const previousSnapshot = previousSnapshotBySessionId.get(uiSessionId);
    if (!previousSnapshot) {
      return true;
    }

    const previousRecord = parsePersistentAgentSessionRecordSnapshot(previousSnapshot);
    if (previousRecord) {
      removedRecords.push(previousRecord);
    }

    return true;
  });

  return {
    changedRecords,
    removedRecords,
    removedSessionIds,
    nextSnapshotBySessionId,
  };
}
