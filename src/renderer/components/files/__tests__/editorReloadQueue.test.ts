import { describe, expect, it } from 'vitest';
import { createAsyncTaskLimiter } from '../editorReloadQueue';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForAssertion(assertion: () => void, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now();

  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

describe('createAsyncTaskLimiter', () => {
  it('runs no more than the configured number of tasks concurrently', async () => {
    const limiter = createAsyncTaskLimiter(2);
    const deferredA = createDeferred<string>();
    const deferredB = createDeferred<string>();
    const deferredC = createDeferred<string>();
    const deferredD = createDeferred<string>();
    const deferredByIndex = [deferredA, deferredB, deferredC, deferredD];
    const started: number[] = [];
    let running = 0;
    let maxRunning = 0;

    const tasks = deferredByIndex.map((deferred, index) =>
      limiter(async () => {
        started.push(index);
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        try {
          return await deferred.promise;
        } finally {
          running -= 1;
        }
      })
    );

    await waitForAssertion(() => {
      expect(started).toEqual([0, 1]);
    });
    expect(maxRunning).toBe(2);

    deferredA.resolve('a');
    await waitForAssertion(() => {
      expect(started).toEqual([0, 1, 2]);
    });
    expect(maxRunning).toBe(2);

    deferredB.resolve('b');
    await waitForAssertion(() => {
      expect(started).toEqual([0, 1, 2, 3]);
    });
    expect(maxRunning).toBe(2);

    deferredC.resolve('c');
    deferredD.resolve('d');

    await expect(Promise.all(tasks)).resolves.toEqual(['a', 'b', 'c', 'd']);
  });

  it('continues draining queued tasks after a previous task rejects', async () => {
    const limiter = createAsyncTaskLimiter(1);
    const firstTask = createDeferred<string>();
    const secondTask = createDeferred<string>();
    const started: string[] = [];

    const firstResult = limiter(async () => {
      started.push('first');
      return firstTask.promise;
    });

    const secondResult = limiter(async () => {
      started.push('second');
      return secondTask.promise;
    });

    await waitForAssertion(() => {
      expect(started).toEqual(['first']);
    });

    firstTask.reject(new Error('boom'));
    await expect(firstResult).rejects.toThrow('boom');
    await waitForAssertion(() => {
      expect(started).toEqual(['first', 'second']);
    });

    secondTask.resolve('ok');
    await expect(secondResult).resolves.toBe('ok');
  });
});
