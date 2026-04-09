import type { PersistentAgentSessionRecord } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { serializePersistentAgentSessionRecordSnapshot } from '../agentSessionPersistenceSync';

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
  });

  it('drops removed sessions from the next snapshot map', async () => {
    const module = await import('../agentSessionPersistenceSync').catch(() => null);

    const result = module?.diffPersistentAgentSessionRecords({
      previousSnapshotBySessionId: new Map<string, string>([
        ['session-a', serializePersistentAgentSessionRecordSnapshot(createRecord('session-a'))],
        ['session-b', serializePersistentAgentSessionRecordSnapshot(createRecord('session-b'))],
      ]),
      records: [createRecord('session-a')],
    });

    expect(result?.changedRecords).toEqual([]);
    expect(Array.from(result?.nextSnapshotBySessionId.keys() ?? [])).toEqual(['session-a']);
  });
});
