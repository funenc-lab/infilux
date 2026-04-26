import { useCallback, useEffect, useState } from 'react';

interface UseDeferredComponentLoaderOptions<TModule, TProps> {
  shouldLoad: boolean;
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

export function useDeferredComponentLoader<TModule, TProps>({
  shouldLoad,
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

    return () => {
      cancelled = true;
    };
  }, [Component, error, errorLabel, load, selectComponent, shouldLoad]);

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
