type EventCallback = () => void;

interface EventTargetLike {
  addEventListener: (event: string, listener: EventListener) => void;
  removeEventListener: (event: string, listener: EventListener) => void;
}

interface CreateXtermWindowEventHubOptions {
  windowTarget?: EventTargetLike | null;
  documentTarget?: EventTargetLike | null;
}

interface EventBucket {
  callbacks: Set<EventCallback>;
  handler: EventListener | null;
}

export interface XtermWindowEventHub {
  subscribeFocus: (callback: EventCallback) => () => void;
  subscribeResize: (callback: EventCallback) => () => void;
  subscribeVisibilityChange: (callback: EventCallback) => () => void;
}

function createEventBucket(): EventBucket {
  return {
    callbacks: new Set<EventCallback>(),
    handler: null,
  };
}

function dispatchCallbacks(callbacks: Set<EventCallback>): void {
  for (const callback of callbacks) {
    callback();
  }
}

function subscribeToBucket(
  target: EventTargetLike | null | undefined,
  event: string,
  bucket: EventBucket,
  callback: EventCallback
): () => void {
  bucket.callbacks.add(callback);

  if (target && bucket.handler === null) {
    const handler: EventListener = () => {
      dispatchCallbacks(bucket.callbacks);
    };
    bucket.handler = handler;
    target.addEventListener(event, handler);
  }

  return () => {
    bucket.callbacks.delete(callback);
    if (!target || bucket.callbacks.size > 0 || bucket.handler === null) {
      return;
    }

    target.removeEventListener(event, bucket.handler);
    bucket.handler = null;
  };
}

export function createXtermWindowEventHub({
  windowTarget = typeof window !== 'undefined' ? window : null,
  documentTarget = typeof document !== 'undefined' ? document : null,
}: CreateXtermWindowEventHubOptions = {}): XtermWindowEventHub {
  const resizeBucket = createEventBucket();
  const focusBucket = createEventBucket();
  const visibilityBucket = createEventBucket();

  return {
    subscribeFocus: (callback) => subscribeToBucket(windowTarget, 'focus', focusBucket, callback),
    subscribeResize: (callback) =>
      subscribeToBucket(windowTarget, 'resize', resizeBucket, callback),
    subscribeVisibilityChange: (callback) =>
      subscribeToBucket(documentTarget, 'visibilitychange', visibilityBucket, callback),
  };
}

const sharedXtermWindowEventHub = createXtermWindowEventHub();

export const subscribeToXtermWindowFocus = sharedXtermWindowEventHub.subscribeFocus;
export const subscribeToXtermWindowResize = sharedXtermWindowEventHub.subscribeResize;
export const subscribeToXtermVisibilityChange = sharedXtermWindowEventHub.subscribeVisibilityChange;
