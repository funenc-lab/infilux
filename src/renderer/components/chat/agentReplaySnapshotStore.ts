import {
  type AgentReplaySnapshotValue,
  areAgentReplaySnapshotValuesEqual,
} from './agentReplaySnapshotCommitPolicy';

type AgentReplaySnapshotListener = () => void;

export interface AgentReplaySnapshotStore {
  clearSnapshot: (sessionId: string) => void;
  getSnapshot: (sessionId: string) => AgentReplaySnapshotValue | undefined;
  prune: (retainedSessionIds: Iterable<string>) => void;
  setSnapshot: (sessionId: string, snapshot: AgentReplaySnapshotValue) => void;
  subscribe: (sessionId: string, listener: AgentReplaySnapshotListener) => () => void;
}

function normalizeAgentReplaySnapshotValue(
  snapshot: AgentReplaySnapshotValue
): AgentReplaySnapshotValue {
  const normalized: AgentReplaySnapshotValue = {};

  if (typeof snapshot.replaySnapshot === 'string') {
    normalized.replaySnapshot = snapshot.replaySnapshot;
  }

  if (
    typeof snapshot.replaySnapshotCapturedAt === 'number' &&
    Number.isFinite(snapshot.replaySnapshotCapturedAt)
  ) {
    normalized.replaySnapshotCapturedAt = snapshot.replaySnapshotCapturedAt;
  }

  return normalized;
}

export function createAgentReplaySnapshotStore(): AgentReplaySnapshotStore {
  const snapshotsBySessionId = new Map<string, AgentReplaySnapshotValue>();
  const listenersBySessionId = new Map<string, Set<AgentReplaySnapshotListener>>();

  const notify = (sessionId: string) => {
    const listeners = listenersBySessionId.get(sessionId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    clearSnapshot: (sessionId) => {
      if (!snapshotsBySessionId.has(sessionId)) {
        return;
      }

      snapshotsBySessionId.delete(sessionId);
      notify(sessionId);
    },
    getSnapshot: (sessionId) => snapshotsBySessionId.get(sessionId),
    prune: (retainedSessionIds) => {
      const retained = new Set(retainedSessionIds);

      for (const sessionId of snapshotsBySessionId.keys()) {
        if (retained.has(sessionId)) {
          continue;
        }

        snapshotsBySessionId.delete(sessionId);
        notify(sessionId);
      }
    },
    setSnapshot: (sessionId, snapshot) => {
      const normalized = normalizeAgentReplaySnapshotValue(snapshot);
      const current = snapshotsBySessionId.get(sessionId);
      if (areAgentReplaySnapshotValuesEqual(current, normalized)) {
        return;
      }

      snapshotsBySessionId.set(sessionId, normalized);
      notify(sessionId);
    },
    subscribe: (sessionId, listener) => {
      let listeners = listenersBySessionId.get(sessionId);
      if (!listeners) {
        listeners = new Set();
        listenersBySessionId.set(sessionId, listeners);
      }

      listeners.add(listener);
      return () => {
        listeners?.delete(listener);
        if (listeners?.size === 0) {
          listenersBySessionId.delete(sessionId);
        }
      };
    },
  };
}
