import { describe, expect, it } from 'vitest';
import {
  appendPersistentAgentReplaySnapshot,
  extractPersistentAgentReplaySnapshot,
  withPersistentAgentReplaySnapshot,
} from '../persistentAgentSession';

describe('persistent agent session metadata', () => {
  it('stores replay snapshots inside the dedicated persistentAgentSession metadata namespace', () => {
    expect(
      withPersistentAgentReplaySnapshot(
        {
          existing: true,
        },
        'snapshot-output',
        123
      )
    ).toEqual({
      existing: true,
      persistentAgentSession: {
        replaySnapshot: 'snapshot-output',
        replaySnapshotCapturedAt: 123,
      },
    });
  });

  it('extracts replay snapshots from persisted metadata', () => {
    expect(
      extractPersistentAgentReplaySnapshot({
        persistentAgentSession: {
          replaySnapshot: 'snapshot-output',
          replaySnapshotCapturedAt: 456,
        },
      })
    ).toEqual({
      replaySnapshot: 'snapshot-output',
      replaySnapshotCapturedAt: 456,
    });
  });

  it('trims replay snapshots to the bounded tail window', () => {
    const next = appendPersistentAgentReplaySnapshot('abc', 'def', 4);
    expect(next).toBe('cdef');
  });
});
