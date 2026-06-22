import { describe, expect, it } from 'vitest';
import {
  LIVE_REPLAY_SNAPSHOT_SESSION_COMMIT_INTERVAL_MS,
  resolveReplaySnapshotSessionCommitDecision,
} from '../agentReplaySnapshotCommitPolicy';

describe('agent replay snapshot commit policy', () => {
  it('commits the first retained live replay snapshot immediately', () => {
    const decision = resolveReplaySnapshotSessionCommitDecision({
      current: {},
      lastCommittedAt: undefined,
      next: {
        replaySnapshot: 'first output',
        replaySnapshotCapturedAt: 1_000,
      },
      now: 1_000,
    });

    expect(decision).toEqual({ kind: 'commit' });
  });

  it('schedules changed live snapshots until the commit interval elapses', () => {
    const decision = resolveReplaySnapshotSessionCommitDecision({
      current: {
        replaySnapshot: 'first output',
        replaySnapshotCapturedAt: 1_000,
      },
      lastCommittedAt: 1_000,
      next: {
        replaySnapshot: 'first output\nsecond output',
        replaySnapshotCapturedAt: 4_000,
      },
      now: 4_000,
    });

    expect(decision).toEqual({
      kind: 'schedule',
      delayMs: LIVE_REPLAY_SNAPSHOT_SESSION_COMMIT_INTERVAL_MS - 3_000,
    });
  });

  it('commits changed live snapshots after the commit interval elapses', () => {
    const decision = resolveReplaySnapshotSessionCommitDecision({
      current: {
        replaySnapshot: 'first output',
        replaySnapshotCapturedAt: 1_000,
      },
      lastCommittedAt: 1_000,
      next: {
        replaySnapshot: 'first output\nsecond output',
        replaySnapshotCapturedAt: 12_000,
      },
      now: 12_000,
    });

    expect(decision).toEqual({ kind: 'commit' });
  });

  it('ignores timestamp-only updates for unchanged replay content', () => {
    const decision = resolveReplaySnapshotSessionCommitDecision({
      current: {
        replaySnapshot: 'first output',
        replaySnapshotCapturedAt: 1_000,
      },
      lastCommittedAt: 1_000,
      next: {
        replaySnapshot: 'first output',
        replaySnapshotCapturedAt: 12_000,
      },
      now: 12_000,
    });

    expect(decision).toEqual({ kind: 'ignore' });
  });

  it('commits forced updates without waiting for the interval', () => {
    const decision = resolveReplaySnapshotSessionCommitDecision({
      current: {
        replaySnapshot: 'first output',
        replaySnapshotCapturedAt: 1_000,
      },
      force: true,
      lastCommittedAt: 1_000,
      next: {
        replaySnapshot: 'first output\nfinal output',
        replaySnapshotCapturedAt: 2_000,
      },
      now: 2_000,
    });

    expect(decision).toEqual({ kind: 'commit' });
  });
});
