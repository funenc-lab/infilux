import type { PersistentAgentSessionRecord } from '@shared/types';
import { extractPersistentAgentReplaySnapshot } from '@shared/utils/persistentAgentSession';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripPersistentAgentSessionMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!isPlainObject(metadata)) {
    return undefined;
  }

  const { persistentAgentSession: _persistentAgentSession, ...rest } = metadata;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

type DiffPersistentAgentSessionRecordsOptions = {
  previousSnapshotBySessionId: Map<string, string>;
  records: PersistentAgentSessionRecord[];
};

function normalizePersistentAgentSessionRecord(record: PersistentAgentSessionRecord) {
  const { updatedAt: _updatedAt, ...stableRecord } = record;
  return stableRecord;
}

function normalizePersistentAgentSessionRecordForComparison(
  record: PersistentAgentSessionRecord
): Record<string, unknown> {
  const normalizedRecord = normalizePersistentAgentSessionRecord(record);
  const normalizedMetadata = stripPersistentAgentSessionMetadata(normalizedRecord.metadata);

  if (!normalizedMetadata) {
    const { metadata: _metadata, ...stableRecord } = normalizedRecord;
    return stableRecord;
  }

  return {
    ...normalizedRecord,
    metadata: normalizedMetadata,
  };
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

function serializePersistentAgentSessionRecordComparisonSnapshot(
  record: PersistentAgentSessionRecord
): string {
  return JSON.stringify(normalizePersistentAgentSessionRecordForComparison(record));
}

function shouldPersistReplaySnapshotChange(
  previousRecord: PersistentAgentSessionRecord | null,
  nextRecord: PersistentAgentSessionRecord
): boolean {
  if (nextRecord.lastKnownState !== 'live') {
    return true;
  }

  const nextReplay = extractPersistentAgentReplaySnapshot(nextRecord.metadata);
  const previousReplay = extractPersistentAgentReplaySnapshot(previousRecord?.metadata);

  return previousReplay.replaySnapshot !== nextReplay.replaySnapshot;
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
    const previousSnapshot = previousSnapshotBySessionId.get(record.uiSessionId);
    if (!previousSnapshot) {
      nextSnapshotBySessionId.set(record.uiSessionId, snapshot);
      changedRecords.push(record);
      continue;
    }

    if (previousSnapshot === snapshot) {
      nextSnapshotBySessionId.set(record.uiSessionId, snapshot);
      continue;
    }

    const previousRecord = parsePersistentAgentSessionRecordSnapshot(previousSnapshot);
    const previousComparisonSnapshot = previousRecord
      ? serializePersistentAgentSessionRecordComparisonSnapshot(previousRecord)
      : null;
    const nextComparisonSnapshot = serializePersistentAgentSessionRecordComparisonSnapshot(record);

    if (
      previousComparisonSnapshot !== nextComparisonSnapshot ||
      shouldPersistReplaySnapshotChange(previousRecord, record)
    ) {
      nextSnapshotBySessionId.set(record.uiSessionId, snapshot);
      changedRecords.push(record);
      continue;
    }

    nextSnapshotBySessionId.set(record.uiSessionId, previousSnapshot);
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
