import { useCallback, useEffect, useState } from 'react';

export type DeferredLoadStrategy = 'immediate' | 'idle';

interface UseDeferredComponentLoaderOptions<TModule, TProps> {
  shouldLoad: boolean;
  loadStrategy?: DeferredLoadStrategy;
  load: () => Promise<TModule>;
  selectComponent: (module: TModule) => React.ComponentType<TProps>;
  errorLabel: string;
}

interface DeferredComponentLoaderState<TProps> {
  Component: React.ComponentType<TProps> | null;
  error: Error | null;
  retry: () => void;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(String(value));
}

const DEFAULT_IDLE_DELAY_MS = 200;

function scheduleIdleLoad(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    callback();
    return () => undefined;
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => {
      callback();
    });
    return () => window.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, DEFAULT_IDLE_DELAY_MS);
  return () => window.clearTimeout(timeoutId);
}

export function useDeferredComponentLoader<TModule, TProps>({
  shouldLoad,
  loadStrategy = 'immediate',
  load,
  selectComponent,
  errorLabel,
}: UseDeferredComponentLoaderOptions<TModule, TProps>): DeferredComponentLoaderState<TProps> {
  const [Component, setComponent] = useState<React.ComponentType<TProps> | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component || error) {
      return;
    }

    let cancelled = false;
    const executeLoad = () => {
      Promise.resolve()
        .then(load)
        .then((module) => {
          if (cancelled) {
            return;
          }

          setComponent(() => selectComponent(module));
        })
        .catch((caughtError: unknown) => {
          if (cancelled) {
            return;
          }

          const nextError = toError(caughtError);
          console.error(`[${errorLabel}] Failed to load deferred component:`, nextError);
          setError(nextError);
        });
    };

    const cleanupScheduler =
      loadStrategy === 'idle'
        ? scheduleIdleLoad(executeLoad)
        : (() => {
            executeLoad();
            return () => undefined;
          })();

    return () => {
      cancelled = true;
      cleanupScheduler();
    };
  }, [Component, error, errorLabel, load, loadStrategy, selectComponent, shouldLoad]);

  const retry = useCallback(() => {
    setComponent(null);
    setError(null);
  }, []);

  return {
    Component,
    error,
    retry,
  };
}
