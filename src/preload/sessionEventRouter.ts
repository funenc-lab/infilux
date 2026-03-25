import {
  IPC_CHANNELS,
  type SessionDataEvent,
  type SessionExitEvent,
  type SessionStateEvent,
} from '../shared/types';

type SessionEventMap = {
  data: SessionDataEvent;
  exit: SessionExitEvent;
  state: SessionStateEvent;
};

type SessionEventKey = keyof SessionEventMap;
type SessionEventCallback<TKey extends SessionEventKey> = (event: SessionEventMap[TKey]) => void;

type SessionEventHandlers = {
  onData?: SessionEventCallback<'data'>;
  onExit?: SessionEventCallback<'exit'>;
  onState?: SessionEventCallback<'state'>;
};

type IpcRendererLike = {
  on: (channel: string, listener: (_event: unknown, payload: unknown) => void) => void;
  off: (channel: string, listener: (_event: unknown, payload: unknown) => void) => void;
};

interface SessionEventBucket<TKey extends SessionEventKey> {
  channel: string;
  handler: ((_event: unknown, payload: SessionEventMap[TKey]) => void) | null;
  globalListeners: Set<SessionEventCallback<TKey>>;
  sessionListeners: Map<string, Set<SessionEventCallback<TKey>>>;
}

function createBucket<TKey extends SessionEventKey>(channel: string): SessionEventBucket<TKey> {
  return {
    channel,
    handler: null,
    globalListeners: new Set(),
    sessionListeners: new Map(),
  };
}

function countBucketListeners<TKey extends SessionEventKey>(
  bucket: SessionEventBucket<TKey>
): number {
  let count = bucket.globalListeners.size;
  for (const listeners of bucket.sessionListeners.values()) {
    count += listeners.size;
  }
  return count;
}

function addSessionListener<TKey extends SessionEventKey>(
  bucket: SessionEventBucket<TKey>,
  sessionId: string,
  callback: SessionEventCallback<TKey>
): void {
  const listeners = bucket.sessionListeners.get(sessionId) ?? new Set<SessionEventCallback<TKey>>();
  listeners.add(callback);
  bucket.sessionListeners.set(sessionId, listeners);
}

function removeSessionListener<TKey extends SessionEventKey>(
  bucket: SessionEventBucket<TKey>,
  sessionId: string,
  callback: SessionEventCallback<TKey>
): void {
  const listeners = bucket.sessionListeners.get(sessionId);
  if (!listeners) {
    return;
  }
  listeners.delete(callback);
  if (listeners.size === 0) {
    bucket.sessionListeners.delete(sessionId);
  }
}

export function createSessionEventRouter(ipcRenderer: IpcRendererLike) {
  const buckets: { [TKey in SessionEventKey]: SessionEventBucket<TKey> } = {
    data: createBucket<'data'>(IPC_CHANNELS.SESSION_DATA),
    exit: createBucket<'exit'>(IPC_CHANNELS.SESSION_EXIT),
    state: createBucket<'state'>(IPC_CHANNELS.SESSION_STATE),
  };

  const ensureBucketHandler = <TKey extends SessionEventKey>(key: TKey) => {
    const bucket = buckets[key];
    if (bucket.handler) {
      return;
    }

    const handler = (_event: unknown, payload: SessionEventMap[TKey]) => {
      for (const listener of bucket.globalListeners) {
        listener(payload);
      }
      const sessionListeners = bucket.sessionListeners.get(payload.sessionId);
      if (!sessionListeners) {
        return;
      }
      for (const listener of sessionListeners) {
        listener(payload);
      }
    };

    bucket.handler = handler;
    ipcRenderer.on(bucket.channel, handler as (_event: unknown, payload: unknown) => void);
  };

  const releaseBucketHandler = <TKey extends SessionEventKey>(key: TKey) => {
    const bucket = buckets[key];
    if (!bucket.handler || countBucketListeners(bucket) > 0) {
      return;
    }

    ipcRenderer.off(bucket.channel, bucket.handler as (_event: unknown, payload: unknown) => void);
    bucket.handler = null;
  };

  const subscribeGlobal = <TKey extends SessionEventKey>(
    key: TKey,
    callback: SessionEventCallback<TKey>
  ) => {
    const bucket = buckets[key];
    bucket.globalListeners.add(callback);
    ensureBucketHandler(key);

    return () => {
      bucket.globalListeners.delete(callback);
      releaseBucketHandler(key);
    };
  };

  const subscribeSession = <TKey extends SessionEventKey>(
    key: TKey,
    sessionId: string,
    callback: SessionEventCallback<TKey>
  ) => {
    const bucket = buckets[key];
    addSessionListener(bucket, sessionId, callback);
    ensureBucketHandler(key);

    return () => {
      removeSessionListener(bucket, sessionId, callback);
      releaseBucketHandler(key);
    };
  };

  return {
    onData: (callback: SessionEventCallback<'data'>) => subscribeGlobal('data', callback),
    onExit: (callback: SessionEventCallback<'exit'>) => subscribeGlobal('exit', callback),
    onState: (callback: SessionEventCallback<'state'>) => subscribeGlobal('state', callback),
    onDataForSession: (sessionId: string, callback: SessionEventCallback<'data'>) =>
      subscribeSession('data', sessionId, callback),
    onExitForSession: (sessionId: string, callback: SessionEventCallback<'exit'>) =>
      subscribeSession('exit', sessionId, callback),
    onStateForSession: (sessionId: string, callback: SessionEventCallback<'state'>) =>
      subscribeSession('state', sessionId, callback),
    subscribe: (sessionId: string, handlers: SessionEventHandlers) => {
      const cleanups = [
        handlers.onData ? subscribeSession('data', sessionId, handlers.onData) : null,
        handlers.onExit ? subscribeSession('exit', sessionId, handlers.onExit) : null,
        handlers.onState ? subscribeSession('state', sessionId, handlers.onState) : null,
      ].filter((cleanup): cleanup is () => void => cleanup !== null);

      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
  };
}
