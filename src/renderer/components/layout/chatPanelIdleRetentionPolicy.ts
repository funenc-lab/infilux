import { normalizePath, pathsEqual } from '@/App/storage';

export interface ChatPanelSessionSnapshot {
  sessionCount: number;
  hasAttentionSignal: boolean;
  hasLiveActivity: boolean;
}

interface ResolveChatPanelIdleSinceByWorktreeOptions {
  previousIdleSinceByWorktree: Record<string, number>;
  trackedWorktreePaths: string[];
  activeChatWorktreePath?: string | null;
  now?: number;
  getSessionSnapshot: (worktreePath: string) => ChatPanelSessionSnapshot;
}

interface GetNextChatPanelRetentionExpiryDelayMsOptions {
  idleSinceByWorktree: Record<string, number>;
  inactivityThresholdMs: number;
  now?: number;
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    deduped.push(path);
  }

  return deduped;
}

function getIdleSinceForWorktree(
  idleSinceByWorktree: Record<string, number>,
  targetWorktreePath: string
): number | undefined {
  const directValue = idleSinceByWorktree[targetWorktreePath];
  if (typeof directValue === 'number') {
    return directValue;
  }

  return Object.entries(idleSinceByWorktree).find(([worktreePath]) =>
    pathsEqual(worktreePath, targetWorktreePath)
  )?.[1];
}

function areIdleSinceMapsEqual(
  previousIdleSinceByWorktree: Record<string, number>,
  nextIdleSinceByWorktree: Record<string, number>
): boolean {
  const previousEntries = Object.entries(previousIdleSinceByWorktree);
  const nextEntries = Object.entries(nextIdleSinceByWorktree);

  if (previousEntries.length !== nextEntries.length) {
    return false;
  }

  return nextEntries.every(([worktreePath, idleSinceAt]) => {
    const previousValue = previousEntries.find(([previousWorktreePath]) =>
      pathsEqual(previousWorktreePath, worktreePath)
    )?.[1];
    return previousValue === idleSinceAt;
  });
}

export function resolveChatPanelIdleSinceByWorktree({
  previousIdleSinceByWorktree,
  trackedWorktreePaths,
  activeChatWorktreePath = null,
  now = Date.now(),
  getSessionSnapshot,
}: ResolveChatPanelIdleSinceByWorktreeOptions): Record<string, number> {
  const activeChatWorktreeKey = activeChatWorktreePath
    ? normalizePath(activeChatWorktreePath)
    : null;
  const nextIdleSinceByWorktree: Record<string, number> = {};

  for (const worktreePath of dedupePaths(trackedWorktreePaths)) {
    if (activeChatWorktreeKey && normalizePath(worktreePath) === activeChatWorktreeKey) {
      continue;
    }

    const snapshot = getSessionSnapshot(worktreePath);
    if (snapshot.sessionCount <= 0 || snapshot.hasAttentionSignal || snapshot.hasLiveActivity) {
      continue;
    }

    nextIdleSinceByWorktree[worktreePath] =
      getIdleSinceForWorktree(previousIdleSinceByWorktree, worktreePath) ?? now;
  }

  return areIdleSinceMapsEqual(previousIdleSinceByWorktree, nextIdleSinceByWorktree)
    ? previousIdleSinceByWorktree
    : nextIdleSinceByWorktree;
}

export function getNextChatPanelRetentionExpiryDelayMs({
  idleSinceByWorktree,
  inactivityThresholdMs,
  now = Date.now(),
}: GetNextChatPanelRetentionExpiryDelayMsOptions): number | null {
  let nextDelayMs: number | null = null;

  for (const idleSinceAt of Object.values(idleSinceByWorktree)) {
    const expiresInMs = idleSinceAt + inactivityThresholdMs + 1 - now;
    if (expiresInMs <= 0) {
      continue;
    }

    if (nextDelayMs === null || expiresInMs < nextDelayMs) {
      nextDelayMs = expiresInMs;
    }
  }

  return nextDelayMs;
}
