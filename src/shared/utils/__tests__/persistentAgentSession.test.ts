import { describe, expect, it } from 'vitest';
import { PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT } from '../agentTerminalHistoryPolicy';
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

  it('keeps a larger default replay snapshot for active agent transcript recovery', () => {
    const output = 'x'.repeat(PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT + 10);

    const next = appendPersistentAgentReplaySnapshot('', output);

    expect(next).toHaveLength(PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT);
    expect(next).toBe(output.slice(-PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT));
  });
});
