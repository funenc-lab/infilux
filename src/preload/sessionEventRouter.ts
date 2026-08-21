import {
  IPC_CHANNELS,
  type SessionDataEvent,
  type SessionExitEvent,
  type SessionOutputResyncEvent,
  type SessionStateEvent,
} from '../shared/types';

type SessionEventMap = {
  data: SessionDataEvent;
  resync: SessionOutputResyncEvent;
  exit: SessionExitEvent;
  state: SessionStateEvent;
};

type SessionEventKey = keyof SessionEventMap;
type SessionEventCallback<TKey extends SessionEventKey> = (event: SessionEventMap[TKey]) => void;

type SessionEventHandlers = {
  onData?: SessionEventCallback<'data'>;
  onResync?: SessionEventCallback<'resync'>;
  onExit?: SessionEventCallback<'exit'>;
  onState?: SessionEventCallback<'state'>;
};

type PendingSessionEvent =
  | { key: 'data'; payload: SessionDataEvent }
  | { key: 'resync'; payload: SessionOutputResyncEvent }
  | { key: 'exit'; payload: SessionExitEvent }
  | { key: 'state'; payload: SessionStateEvent };

const MAX_PENDING_SESSION_EVENTS_PER_SESSION = 256;
const MAX_PENDING_SESSION_COUNT = 32;
const MAX_PENDING_SESSION_OUTPUT_CHARS = 4 * 1024 * 1024;
const MAX_PENDING_OUTPUT_CHARS = 8 * 1024 * 1024;

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
    resync: createBucket<'resync'>(IPC_CHANNELS.SESSION_OUTPUT_RESYNC),
    exit: createBucket<'exit'>(IPC_CHANNELS.SESSION_EXIT),
    state: createBucket<'state'>(IPC_CHANNELS.SESSION_STATE),
  };
  const pendingEventsBySessionId = new Map<
    string,
    {
      events: PendingSessionEvent[];
      outputChars: number;
    }
  >();
  const pendingDeliverySessionIds = new Set<string>();
  let pendingOutputChars = 0;

  const storePendingSessionEvent = <TKey extends SessionEventKey>(
    key: TKey,
    payload: SessionEventMap[TKey]
  ) => {
    const existingPending = pendingEventsBySessionId.get(payload.sessionId);
    const pending = existingPending ?? {
      events: [],
      outputChars: 0,
    };
    const outputChars =
      key === 'data'
        ? (payload as SessionDataEvent).data.length
        : key === 'resync'
          ? (payload as SessionOutputResyncEvent).replay.length
          : 0;
    if (
      (!existingPending && pendingEventsBySessionId.size >= MAX_PENDING_SESSION_COUNT) ||
      pending.events.length >= MAX_PENDING_SESSION_EVENTS_PER_SESSION ||
      pending.outputChars + outputChars > MAX_PENDING_SESSION_OUTPUT_CHARS ||
      pendingOutputChars + outputChars > MAX_PENDING_OUTPUT_CHARS
    ) {
      console.warn(
        '[preload] Dropping unclaimed session events after the bounded startup buffer filled',
        {
          sessionId: payload.sessionId,
        }
      );
      return;
    }

    pending.events.push({ key, payload } as PendingSessionEvent);
    pending.outputChars += outputChars;
    pendingOutputChars += outputChars;
    pendingEventsBySessionId.set(payload.sessionId, pending);
  };

  const flushPendingSessionEvents = (sessionId: string) => {
    pendingDeliverySessionIds.delete(sessionId);
    const pending = pendingEventsBySessionId.get(sessionId);
    if (!pending) {
      return;
    }

    const hasSessionListener = pending.events.some(
      (event) => (buckets[event.key].sessionListeners.get(sessionId)?.size ?? 0) > 0
    );
    if (!hasSessionListener) {
      return;
    }

    pendingEventsBySessionId.delete(sessionId);
    pendingOutputChars -= pending.outputChars;
    for (const event of pending.events) {
      const listeners = buckets[event.key].sessionListeners.get(sessionId);
      if (!listeners) {
        continue;
      }
      for (const listener of listeners) {
        listener(event.payload as never);
      }
    }
  };

  const schedulePendingSessionEventFlush = (sessionId: string) => {
    if (!pendingEventsBySessionId.has(sessionId) || pendingDeliverySessionIds.has(sessionId)) {
      return;
    }
    pendingDeliverySessionIds.add(sessionId);
    queueMicrotask(() => flushPendingSessionEvents(sessionId));
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
        if (bucket.globalListeners.size === 0) {
          storePendingSessionEvent(key, payload);
        }
        return;
      }
      for (const listener of sessionListeners) {
        listener(payload);
      }
    };

    bucket.handler = handler;
    ipcRenderer.on(bucket.channel, handler as (_event: unknown, payload: unknown) => void);
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
    schedulePendingSessionEventFlush(sessionId);

    return () => {
      removeSessionListener(bucket, sessionId, callback);
    };
  };

  for (const key of Object.keys(buckets) as SessionEventKey[]) {
    ensureBucketHandler(key);
  }

  return {
    onData: (callback: SessionEventCallback<'data'>) => subscribeGlobal('data', callback),
    onResync: (callback: SessionEventCallback<'resync'>) => subscribeGlobal('resync', callback),
    onExit: (callback: SessionEventCallback<'exit'>) => subscribeGlobal('exit', callback),
    onState: (callback: SessionEventCallback<'state'>) => subscribeGlobal('state', callback),
    onDataForSession: (sessionId: string, callback: SessionEventCallback<'data'>) =>
      subscribeSession('data', sessionId, callback),
    onResyncForSession: (sessionId: string, callback: SessionEventCallback<'resync'>) =>
      subscribeSession('resync', sessionId, callback),
    onExitForSession: (sessionId: string, callback: SessionEventCallback<'exit'>) =>
      subscribeSession('exit', sessionId, callback),
    onStateForSession: (sessionId: string, callback: SessionEventCallback<'state'>) =>
      subscribeSession('state', sessionId, callback),
    subscribe: (sessionId: string, handlers: SessionEventHandlers) => {
      const cleanups = [
        handlers.onData ? subscribeSession('data', sessionId, handlers.onData) : null,
        handlers.onResync ? subscribeSession('resync', sessionId, handlers.onResync) : null,
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
