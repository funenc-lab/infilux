import type { PersistentAgentSessionRecord } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  diffPersistentAgentSessionRecords,
  serializePersistentAgentSessionRecordSnapshot,
} from '../agentSessionPersistenceSync';

function createRecord(
  uiSessionId: string,
  overrides: Partial<PersistentAgentSessionRecord> = {}
): PersistentAgentSessionRecord {
  return {
    activated: true,
    agentCommand: 'claude',
    agentId: 'claude',
    createdAt: 1,
    cwd: `/tmp/${uiSessionId}`,
    displayName: `Session ${uiSessionId}`,
    environment: 'native',
    hostKind: 'tmux',
    hostSessionKey: `host-${uiSessionId}`,
    initialized: true,
    lastKnownState: 'live',
    recoveryPolicy: 'auto',
    repoPath: '/repo',
    uiSessionId,
    updatedAt: 2,
    ...overrides,
  };
}

describe('agent session persistence sync', () => {
  it('persists a cached record if its previous snapshot is missing', () => {
    const record = createRecord('session-a');

    const result = diffPersistentAgentSessionRecords({
      previousRecordBySessionId: new Map([[record.uiSessionId, record]]),
      previousSnapshotBySessionId: new Map(),
      records: [record],
    });

    expect(result.changedRecords).toEqual([record]);
    expect(result.nextSnapshotBySessionId.get(record.uiSessionId)).toBe(
      serializePersistentAgentSessionRecordSnapshot(record)
    );
  });

  it('still compares record contents when previous record identities are not supplied', () => {
    const record = createRecord('session-a');
    const previousSnapshotBySessionId = new Map([
      [record.uiSessionId, serializePersistentAgentSessionRecordSnapshot(record)],
    ]);
    record.displayName = 'Renamed session';

    const result = diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId,
      records: [record],
    });

    expect(result.changedRecords).toEqual([record]);
    expect(result.nextSnapshotBySessionId.get(record.uiSessionId)).toBe(
      serializePersistentAgentSessionRecordSnapshot(record)
    );
  });

  it('preserves cached snapshots while reporting removed sessions', () => {
    const retainedRecord = createRecord('session-a');
    const removedRecord = createRecord('session-b');
    const previousSnapshotBySessionId = new Map(
      [retainedRecord, removedRecord].map((record) => [
        record.uiSessionId,
        serializePersistentAgentSessionRecordSnapshot(record),
      ])
    );

    const result = diffPersistentAgentSessionRecords({
      previousRecordBySessionId: new Map(
        [retainedRecord, removedRecord].map((record) => [record.uiSessionId, record])
      ),
      previousSnapshotBySessionId,
      records: [retainedRecord],
    });

    expect(result.changedRecords).toEqual([]);
    expect(result.nextSnapshotBySessionId).toEqual(
      new Map([
        [retainedRecord.uiSessionId, previousSnapshotBySessionId.get(retainedRecord.uiSessionId)],
      ])
    );
    expect(result.removedSessionIds).toEqual([removedRecord.uiSessionId]);
    expect(result.removedRecords).toEqual([
      expect.objectContaining({ uiSessionId: removedRecord.uiSessionId }),
    ]);
  });

  it('reuses the persisted snapshot after an ignored live replay timestamp change', () => {
    const previousRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello',
          replaySnapshotCapturedAt: 1_000,
        },
      },
    });
    const currentRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello',
          replaySnapshotCapturedAt: 2_000,
        },
      },
    });
    const persistedSnapshot = serializePersistentAgentSessionRecordSnapshot(previousRecord);
    const timestampOnlyChange = diffPersistentAgentSessionRecords({
      previousRecordBySessionId: new Map([['session-a', previousRecord]]),
      previousSnapshotBySessionId: new Map([['session-a', persistedSnapshot]]),
      records: [currentRecord],
    });

    expect(timestampOnlyChange.changedRecords).toEqual([]);
    expect(timestampOnlyChange.nextSnapshotBySessionId.get('session-a')).toBe(persistedSnapshot);

    const cachedChange = diffPersistentAgentSessionRecords({
      previousRecordBySessionId: new Map([['session-a', currentRecord]]),
      previousSnapshotBySessionId: timestampOnlyChange.nextSnapshotBySessionId,
      records: [currentRecord],
    });

    expect(cachedChange.changedRecords).toEqual([]);
    expect(cachedChange.nextSnapshotBySessionId.get('session-a')).toBe(persistedSnapshot);

    const exitedRecord = { ...currentRecord, lastKnownState: 'dead' as const };
    const exitedChange = diffPersistentAgentSessionRecords({
      previousRecordBySessionId: new Map([['session-a', currentRecord]]),
      previousSnapshotBySessionId: cachedChange.nextSnapshotBySessionId,
      records: [exitedRecord],
    });

    expect(exitedChange.changedRecords).toEqual([exitedRecord]);
    expect(exitedChange.nextSnapshotBySessionId.get('session-a')).toBe(
      serializePersistentAgentSessionRecordSnapshot(exitedRecord)
    );
  });

  it('returns only changed persistent records and keeps a next fingerprint map', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);

    const previousSnapshotBySessionId = new Map<string, string>([
      ['session-a', serializePersistentAgentSessionRecordSnapshot(createRecord('session-a'))],
      ['session-b', serializePersistentAgentSessionRecordSnapshot(createRecord('session-b'))],
    ]);

    const result = module?.diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId,
      records: [
        createRecord('session-a'),
        createRecord('session-b', { lastKnownState: 'dead' }),
        createRecord('session-c'),
      ],
    });

    expect(result?.changedRecords.map((record) => record.uiSessionId)).toEqual([
      'session-b',
      'session-c',
    ]);
    expect(result?.nextSnapshotBySessionId.get('session-a')).toBe(
      serializePersistentAgentSessionRecordSnapshot(createRecord('session-a'))
    );
    expect(result?.nextSnapshotBySessionId.get('session-b')).toBe(
      serializePersistentAgentSessionRecordSnapshot(
        createRecord('session-b', { lastKnownState: 'dead' })
      )
    );
    expect(result?.nextSnapshotBySessionId.get('session-c')).toBe(
      serializePersistentAgentSessionRecordSnapshot(createRecord('session-c'))
    );
    expect(result?.removedRecords).toEqual([]);
    expect(result?.removedSessionIds).toEqual([]);
  });

  it('reports removed sessions so callers can abandon stale persistence records', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);
    const { updatedAt: _updatedAt, ...stableRemovedRecord } = createRecord('session-b');

    const result = module?.diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId: new Map<string, string>([
        ['session-a', serializePersistentAgentSessionRecordSnapshot(createRecord('session-a'))],
        ['session-b', serializePersistentAgentSessionRecordSnapshot(createRecord('session-b'))],
      ]),
      records: [createRecord('session-a')],
    });

    expect(result?.changedRecords).toEqual([]);
    expect(result?.removedRecords).toEqual([stableRemovedRecord]);
    expect(Array.from(result?.nextSnapshotBySessionId.keys() ?? [])).toEqual(['session-a']);
    expect(result?.removedSessionIds).toEqual(['session-b']);
  });

  it('persists committed live replay snapshot changes after session-level throttling', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);

    const previousRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello',
          replaySnapshotCapturedAt: 1_000,
        },
      },
    });
    const currentRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello world',
          replaySnapshotCapturedAt: 5_000,
        },
      },
    });

    const result = module?.diffPersistentAgentSessionRecords({
      previousRecordBySessionId: new Map([['session-a', previousRecord]]),
      previousSnapshotBySessionId: new Map<string, string>([
        ['session-a', serializePersistentAgentSessionRecordSnapshot(previousRecord)],
      ]),
      records: [currentRecord],
    });

    expect(result?.changedRecords).toEqual([currentRecord]);
    expect(result?.nextSnapshotBySessionId.get('session-a')).toBe(
      serializePersistentAgentSessionRecordSnapshot(currentRecord)
    );
  });

  it('persists committed live replay snapshot removals', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);

    const previousRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello',
          replaySnapshotCapturedAt: 1_000,
        },
      },
    });
    const currentRecord = createRecord('session-a');

    const result = module?.diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId: new Map<string, string>([
        ['session-a', serializePersistentAgentSessionRecordSnapshot(previousRecord)],
      ]),
      records: [currentRecord],
    });

    expect(result?.changedRecords).toEqual([currentRecord]);
    expect(result?.nextSnapshotBySessionId.get('session-a')).toBe(
      serializePersistentAgentSessionRecordSnapshot(currentRecord)
    );
  });

  it('persists title provenance changes inside persistent session metadata', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);
    const previousRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          title: {
            defaultName: 'Claude',
          },
        },
      },
    });
    const currentRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          title: {
            defaultName: 'Claude',
            userRenamed: true,
          },
        },
      },
    });

    const result = module?.diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId: new Map([
        ['session-a', serializePersistentAgentSessionRecordSnapshot(previousRecord)],
      ]),
      records: [currentRecord],
    });

    expect(result?.changedRecords).toEqual([currentRecord]);
  });

  it('flushes replay snapshot updates immediately once the session is no longer live', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);

    const previousRecord = createRecord('session-a', {
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello',
          replaySnapshotCapturedAt: 1_000,
        },
      },
    });
    const currentRecord = createRecord('session-a', {
      lastKnownState: 'dead',
      metadata: {
        persistentAgentSession: {
          replaySnapshot: 'hello world',
          replaySnapshotCapturedAt: 5_000,
        },
      },
    });

    const result = module?.diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId: new Map<string, string>([
        ['session-a', serializePersistentAgentSessionRecordSnapshot(previousRecord)],
      ]),
      records: [currentRecord],
    });

    expect(result?.changedRecords).toEqual([currentRecord]);
    expect(result?.nextSnapshotBySessionId.get('session-a')).toBe(
      serializePersistentAgentSessionRecordSnapshot(currentRecord)
    );
  });
});
