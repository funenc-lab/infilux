import { PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT } from './agentTerminalHistoryPolicy';

export const PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT = 1024 * 1024;

interface PersistentAgentSessionReplayNamespace {
  replaySnapshot?: string;
  replaySnapshotCapturedAt?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReplaySnapshot(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeCapturedAt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function appendPersistentAgentReplaySnapshot(
  current: string | undefined,
  chunk: string,
  maxChars = PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
): string {
  if (!chunk) {
    return current ?? '';
  }

  const combined = `${current ?? ''}${chunk}`;
  return combined.length > maxChars ? combined.slice(-maxChars) : combined;
}

export function extractPersistentAgentReplaySnapshot(
  metadata: Record<string, unknown> | undefined
): {
  replaySnapshot?: string;
  replaySnapshotCapturedAt?: number;
} {
  if (!isPlainObject(metadata)) {
    return {};
  }

  const namespace = metadata.persistentAgentSession;
  if (!isPlainObject(namespace)) {
    return {};
  }

  return {
    replaySnapshot: normalizeReplaySnapshot(namespace.replaySnapshot),
    replaySnapshotCapturedAt: normalizeCapturedAt(namespace.replaySnapshotCapturedAt),
  };
}

export function withPersistentAgentReplaySnapshot(
  metadata: Record<string, unknown> | undefined,
  replaySnapshot: string | undefined,
  replaySnapshotCapturedAt?: number
): Record<string, unknown> | undefined {
  const normalizedSnapshot = normalizeReplaySnapshot(replaySnapshot);
  if (!normalizedSnapshot) {
    return metadata;
  }

  const nextMetadata = isPlainObject(metadata) ? { ...metadata } : {};
  const namespace: PersistentAgentSessionReplayNamespace = {
    replaySnapshot: normalizedSnapshot,
  };

  if (typeof replaySnapshotCapturedAt === 'number' && Number.isFinite(replaySnapshotCapturedAt)) {
    namespace.replaySnapshotCapturedAt = replaySnapshotCapturedAt;
  }

  nextMetadata.persistentAgentSession = namespace;
  return nextMetadata;
}
