import { describe, expect, it } from 'vitest';
import { createBootstrapStageReporter, prepareAppBootstrap, runAppBootstrap } from '../bootstrap';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  const resolve = resolvePromise;
  if (!resolve) {
    throw new Error('Deferred resolver was not initialized');
  }

  return {
    promise,
    resolve,
  };
}

describe('prepareAppBootstrap', () => {
  it('starts hydration and app loading in parallel but waits for both before returning', async () => {
    const hydrateDeferred = createDeferred<void>();
    const appDeferred = createDeferred<{ default: string }>();
    const callOrder: string[] = [];
    let settled = false;

    const bootstrapPromise = prepareAppBootstrap({
      hydrate: () => {
        callOrder.push('hydrate');
        return hydrateDeferred.promise;
      },
      loadApp: () => {
        callOrder.push('loadApp');
        return appDeferred.promise;
      },
    }).then(() => {
      settled = true;
    });

    expect(callOrder).toEqual(['loadApp', 'hydrate']);

    appDeferred.resolve({ default: 'App' });
    await Promise.resolve();
    expect(settled).toBe(false);

    hydrateDeferred.resolve();
    await bootstrapPromise;
    expect(settled).toBe(true);
  });

  it('measures app import duration independently from hydration completion', async () => {
    const hydrateDeferred = createDeferred<void>();
    const appDeferred = createDeferred<{ default: string }>();
    const timestamps = [10, 35];

    const bootstrapPromise = prepareAppBootstrap({
      hydrate: () => hydrateDeferred.promise,
      loadApp: async () => {
        appDeferred.resolve({ default: 'App' });
        return appDeferred.promise;
      },
      now: () => timestamps.shift() ?? 35,
    });

    hydrateDeferred.resolve();
    await expect(bootstrapPromise).resolves.toEqual({
      appImportDurationMs: 25,
      appModule: { default: 'App' },
    });
  });
});

describe('runAppBootstrap', () => {
  it('publishes bootstrap stages to the window target and logs startup timeline entries', () => {
    const logs: string[] = [];
    const dispatchedEvents: Array<{ detail: string; type: string }> = [];
    const target: {
      __infiluxBootstrapStage?: string;
      dispatchEvent: (event: Event) => boolean;
    } = {
      dispatchEvent: (event) => {
        dispatchedEvents.push(event as unknown as { detail: string; type: string });
        return true;
      },
    };

    const reportStage = createBootstrapStageReporter({
      getTarget: () => target,
      log: (message) => logs.push(message),
      createStageChangeEvent: (stage) =>
        ({
          detail: stage,
          type: 'infilux-bootstrap-stage-change',
        }) as unknown as Event,
    });

    reportStage('module-evaluated');

    expect(target.__infiluxBootstrapStage).toBe('module-evaluated');
    expect(dispatchedEvents).toEqual([
      {
        detail: 'module-evaluated',
        type: 'infilux-bootstrap-stage-change',
      },
    ]);
    expect(logs).toEqual(['[startup][renderer] module-evaluated +0ms (0ms total)']);
  });

  it('renders the startup shell before bootstrap completion and switches to the app afterwards', async () => {
    const bootstrapDeferred = createDeferred<{ default: string }>();
    const renderOrder: string[] = [];

    const runPromise = runAppBootstrap({
      renderStartupShell: () => {
        renderOrder.push('startup-shell');
      },
      bootstrap: () => bootstrapDeferred.promise,
      renderApp: ({ default: App }) => {
        renderOrder.push(`app:${App}`);
      },
    });

    expect(renderOrder).toEqual(['startup-shell']);

    bootstrapDeferred.resolve({ default: 'App' });
    await runPromise;

    expect(renderOrder).toEqual(['startup-shell', 'app:App']);
  });
});
