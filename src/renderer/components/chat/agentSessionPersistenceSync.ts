import type { PersistentAgentSessionRecord } from '@shared/types';

type DiffPersistentAgentSessionRecordsOptions = {
  previousSnapshotBySessionId: Map<string, string>;
  records: PersistentAgentSessionRecord[];
};

function normalizePersistentAgentSessionRecord(record: PersistentAgentSessionRecord) {
  const { updatedAt: _updatedAt, ...stableRecord } = record;
  return stableRecord;
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
  nextSnapshotBySessionId: Map<string, string>;
} {
  const changedRecords: PersistentAgentSessionRecord[] = [];
  const nextSnapshotBySessionId = new Map<string, string>();

  for (const record of records) {
    const snapshot = serializePersistentAgentSessionRecordSnapshot(record);
    nextSnapshotBySessionId.set(record.uiSessionId, snapshot);

    if (previousSnapshotBySessionId.get(record.uiSessionId) !== snapshot) {
      changedRecords.push(record);
    }
  }

  return {
    changedRecords,
    nextSnapshotBySessionId,
  };
}
