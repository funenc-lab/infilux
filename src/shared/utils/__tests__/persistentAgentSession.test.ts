import { describe, expect, it } from 'vitest';
import { PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT } from '../agentTerminalHistoryPolicy';
import {
  appendPersistentAgentReplaySnapshot,
  extractPersistentAgentReplaySnapshot,
  extractPersistentAgentSessionTitleMetadata,
  normalizePersistentAgentSessionMetadata,
  PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT,
  withPersistentAgentReplaySnapshot,
  withPersistentAgentSessionTitleMetadata,
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

  it('round-trips normalized session title provenance metadata', () => {
    const metadata = withPersistentAgentSessionTitleMetadata(undefined, {
      defaultName: '  Custom   Agent (Hapi)  ',
      userRenamed: true,
    });

    expect(metadata).toEqual({
      persistentAgentSession: {
        title: {
          defaultName: 'Custom Agent (Hapi)',
          userRenamed: true,
        },
      },
    });
    expect(extractPersistentAgentSessionTitleMetadata(metadata)).toEqual({
      defaultName: 'Custom Agent (Hapi)',
      userRenamed: true,
    });
  });

  it('preserves title provenance while replay metadata is updated', () => {
    const titleMetadata = withPersistentAgentSessionTitleMetadata(undefined, {
      defaultName: 'Codex',
      userRenamed: true,
    });
    const metadata = withPersistentAgentReplaySnapshot(titleMetadata, 'snapshot-output', 123);

    expect(extractPersistentAgentSessionTitleMetadata(metadata)).toEqual({
      defaultName: 'Codex',
      userRenamed: true,
    });
    expect(extractPersistentAgentReplaySnapshot(metadata)).toEqual({
      replaySnapshot: 'snapshot-output',
      replaySnapshotCapturedAt: 123,
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

  it('normalizes legacy replay snapshots to the current recovery tail budget', () => {
    const legacySnapshot = 'x'.repeat(PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT * 2);

    expect(
      extractPersistentAgentReplaySnapshot({
        persistentAgentSession: {
          replaySnapshot: legacySnapshot,
          replaySnapshotCapturedAt: 456,
        },
      })
    ).toEqual({
      replaySnapshot: legacySnapshot.slice(-PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT),
      replaySnapshotCapturedAt: 456,
    });
  });

  it('keeps replay snapshot metadata within the persistent session payload budget', () => {
    const ansiControlHeavyOutput = '\u001b[38;5;248m\u001b[1mx\u001b(B\u001b[m'.repeat(
      PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
    );
    const metadata = withPersistentAgentReplaySnapshot(undefined, ansiControlHeavyOutput, 123);

    expect(JSON.stringify(metadata).length).toBeLessThanOrEqual(
      PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT
    );
  });

  it('normalizes oversized persistent replay metadata instead of dropping the whole payload', () => {
    const ansiControlHeavyOutput = '\u001b[38;5;248m\u001b[1mx\u001b(B\u001b[m'.repeat(
      PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
    );

    const metadata = normalizePersistentAgentSessionMetadata({
      source: 'runtime',
      persistentAgentSession: {
        replaySnapshot: ansiControlHeavyOutput,
        replaySnapshotCapturedAt: 789,
      },
    });
    const replay = extractPersistentAgentReplaySnapshot(metadata);

    expect(metadata).toEqual(
      expect.objectContaining({
        source: 'runtime',
      })
    );
    expect(replay.replaySnapshot).toBeTruthy();
    expect(replay.replaySnapshot?.length).toBeLessThanOrEqual(
      PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
    );
    expect(JSON.stringify(metadata).length).toBeLessThanOrEqual(
      PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT
    );
  });
});
