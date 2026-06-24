import type { SessionKind } from '@shared/types';

export const TERMINAL_SESSION_REPLAY_CHAR_LIMIT = 64 * 1024;
export const AGENT_SESSION_REPLAY_CHAR_LIMIT = 4 * 1024 * 1024;
export const PERSISTENT_AGENT_REPLAY_SNAPSHOT_CHAR_LIMIT = 128 * 1024;

export function getSessionReplayCharLimit(kind: SessionKind | undefined): number {
  return kind === 'agent' ? AGENT_SESSION_REPLAY_CHAR_LIMIT : TERMINAL_SESSION_REPLAY_CHAR_LIMIT;
}

export function appendSessionReplayTail(
  current: string | undefined,
  chunk: string,
  kind: SessionKind | undefined
): string {
  if (!chunk) {
    return current ?? '';
  }

  const limit = getSessionReplayCharLimit(kind);
  const combined = `${current ?? ''}${chunk}`;
  return combined.length > limit ? combined.slice(-limit) : combined;
}
