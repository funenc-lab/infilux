export const LIVE_REPLAY_SNAPSHOT_SESSION_COMMIT_INTERVAL_MS = 10_000;

export interface AgentReplaySnapshotValue {
  replaySnapshot?: string;
  replaySnapshotCapturedAt?: number;
}

export type ReplaySnapshotSessionCommitDecision =
  | { kind: 'commit' }
  | { kind: 'ignore' }
  | { kind: 'schedule'; delayMs: number };

interface ResolveReplaySnapshotSessionCommitDecisionOptions {
  current: AgentReplaySnapshotValue;
  force?: boolean;
  intervalMs?: number;
  lastCommittedAt: number | undefined;
  next: AgentReplaySnapshotValue;
  now: number;
}

function hasReplaySnapshotContent(value: AgentReplaySnapshotValue): boolean {
  return typeof value.replaySnapshot === 'string' && value.replaySnapshot.length > 0;
}

export function areAgentReplaySnapshotValuesEqual(
  first: AgentReplaySnapshotValue | undefined,
  second: AgentReplaySnapshotValue | undefined
): boolean {
  return (
    first?.replaySnapshot === second?.replaySnapshot &&
    first?.replaySnapshotCapturedAt === second?.replaySnapshotCapturedAt
  );
}

export function isAgentReplaySnapshotContentEqual(
  first: AgentReplaySnapshotValue | undefined,
  second: AgentReplaySnapshotValue | undefined
): boolean {
  return first?.replaySnapshot === second?.replaySnapshot;
}

export function resolveReplaySnapshotSessionCommitDecision({
  current,
  force = false,
  intervalMs = LIVE_REPLAY_SNAPSHOT_SESSION_COMMIT_INTERVAL_MS,
  lastCommittedAt,
  next,
  now,
}: ResolveReplaySnapshotSessionCommitDecisionOptions): ReplaySnapshotSessionCommitDecision {
  if (isAgentReplaySnapshotContentEqual(current, next)) {
    return { kind: 'ignore' };
  }

  if (force || !hasReplaySnapshotContent(next) || !hasReplaySnapshotContent(current)) {
    return { kind: 'commit' };
  }

  if (typeof lastCommittedAt !== 'number' || !Number.isFinite(lastCommittedAt)) {
    return { kind: 'commit' };
  }

  const elapsedMs = Math.max(0, now - lastCommittedAt);
  if (elapsedMs >= intervalMs) {
    return { kind: 'commit' };
  }

  return {
    kind: 'schedule',
    delayMs: intervalMs - elapsedMs,
  };
}
