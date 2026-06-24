import { PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT } from './agentTerminalHistoryPolicy';

export const PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT = 1024 * 1024;
export const PERSISTENT_AGENT_REPLAY_SNAPSHOT_METADATA_BYTE_LIMIT = 256 * 1024;

interface PersistentAgentSessionReplayNamespace {
  replaySnapshot?: string;
  replaySnapshotCapturedAt?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReplaySnapshot(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  return value.length > PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT
    ? value.slice(-PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT)
    : value;
}

function normalizeCapturedAt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getSerializedLength(value: Record<string, unknown>): number | null {
  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
}

function buildMetadataWithReplaySnapshot(
  metadata: Record<string, unknown>,
  replaySnapshot: string | undefined,
  replaySnapshotCapturedAt: number | undefined
): Record<string, unknown> {
  const nextMetadata = { ...metadata };
  const previousNamespace = isPlainObject(nextMetadata.persistentAgentSession)
    ? nextMetadata.persistentAgentSession
    : {};
  const nextNamespace: PersistentAgentSessionReplayNamespace & Record<string, unknown> = {
    ...previousNamespace,
  };

  if (replaySnapshot) {
    nextNamespace.replaySnapshot = replaySnapshot;
  } else {
    delete nextNamespace.replaySnapshot;
  }

  if (typeof replaySnapshotCapturedAt === 'number' && Number.isFinite(replaySnapshotCapturedAt)) {
    nextNamespace.replaySnapshotCapturedAt = replaySnapshotCapturedAt;
  } else {
    delete nextNamespace.replaySnapshotCapturedAt;
  }

  if (Object.keys(nextNamespace).length > 0) {
    nextMetadata.persistentAgentSession = nextNamespace;
  } else {
    delete nextMetadata.persistentAgentSession;
  }

  return nextMetadata;
}

function fitPersistentReplaySnapshotToBudget(
  metadata: Record<string, unknown>
): Record<string, unknown> | undefined {
  const currentLength = getSerializedLength(metadata);
  if (
    currentLength !== null &&
    currentLength <= PERSISTENT_AGENT_REPLAY_SNAPSHOT_METADATA_BYTE_LIMIT
  ) {
    return metadata;
  }

  const namespace = metadata.persistentAgentSession;
  if (!isPlainObject(namespace) || typeof namespace.replaySnapshot !== 'string') {
    return currentLength !== null && currentLength <= PERSISTENT_AGENT_SESSION_METADATA_BYTE_LIMIT
      ? metadata
      : undefined;
  }

  const capturedAt = normalizeCapturedAt(namespace.replaySnapshotCapturedAt);
  let lower = 0;
  let upper = namespace.replaySnapshot.length;
  let best: Record<string, unknown> | undefined;

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = buildMetadataWithReplaySnapshot(
      metadata,
      middle > 0 ? namespace.replaySnapshot.slice(-middle) : undefined,
      capturedAt
    );
    const candidateLength = getSerializedLength(candidate);

    if (
      candidateLength !== null &&
      candidateLength <= PERSISTENT_AGENT_REPLAY_SNAPSHOT_METADATA_BYTE_LIMIT
    ) {
      best = candidate;
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }

  return best;
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

export function normalizePersistentAgentSessionMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!isPlainObject(metadata)) {
    return undefined;
  }

  const { replaySnapshot, replaySnapshotCapturedAt } =
    extractPersistentAgentReplaySnapshot(metadata);
  const normalizedMetadata = buildMetadataWithReplaySnapshot(
    metadata,
    replaySnapshot,
    replaySnapshotCapturedAt
  );

  return fitPersistentReplaySnapshotToBudget(normalizedMetadata);
}

export function withPersistentAgentReplaySnapshot(
  metadata: Record<string, unknown> | undefined,
  replaySnapshot: string | undefined,
  replaySnapshotCapturedAt?: number
): Record<string, unknown> | undefined {
  const normalizedSnapshot = normalizeReplaySnapshot(replaySnapshot);
  if (!normalizedSnapshot) {
    return normalizePersistentAgentSessionMetadata(metadata);
  }

  return normalizePersistentAgentSessionMetadata(
    buildMetadataWithReplaySnapshot(
      isPlainObject(metadata) ? metadata : {},
      normalizedSnapshot,
      replaySnapshotCapturedAt
    )
  );
}
