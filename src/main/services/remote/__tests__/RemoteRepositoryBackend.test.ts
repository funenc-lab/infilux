import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

const remoteBackendTestDoubles = vi.hoisted(() => {
  const call = vi.fn();

  function reset() {
    call.mockReset();
  }

  return {
    call,
    reset,
  };
});

vi.mock('../RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    call: remoteBackendTestDoubles.call,
  },
}));

describe('RemoteRepositoryBackend', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    remoteBackendTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks cancellable remote searches by request id', async () => {
    const { RemoteRepositoryBackend } = await import('../RemoteRepositoryBackend');
    const backend = new RemoteRepositoryBackend();
    const activeSearch = createDeferred<{
      matches: [];
      totalMatches: number;
      totalFiles: number;
      truncated: boolean;
    }>();

    remoteBackendTestDoubles.call.mockImplementation((connectionId, method) => {
      if (method === 'search:content') {
        return activeSearch.promise;
      }
      if (method === 'search:cancel') {
        return Promise.resolve(true);
      }
      throw new Error(`Unexpected method ${method} for ${connectionId}`);
    });

    const searchPromise = backend.searchContent({
      requestId: 'remote-search-1',
      rootPath: '/__enso_remote__/connection-1/srv/project',
      query: 'needle',
    });

    await expect(backend.cancelSearch('remote-search-1')).resolves.toBe(true);
    expect(remoteBackendTestDoubles.call).toHaveBeenNthCalledWith(
      2,
      'connection-1',
      'search:cancel',
      { requestId: 'remote-search-1' },
      expect.any(Number)
    );

    activeSearch.resolve({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: true,
    });
    await expect(searchPromise).resolves.toEqual({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: true,
    });
    await expect(backend.cancelSearch('remote-search-1')).resolves.toBe(false);
  });

  it('keeps the newest remote search active when request ids are reused on one connection', async () => {
    const { RemoteRepositoryBackend } = await import('../RemoteRepositoryBackend');
    const backend = new RemoteRepositoryBackend();
    const firstSearch = createDeferred<{
      matches: [];
      totalMatches: number;
      totalFiles: number;
      truncated: boolean;
    }>();
    const secondSearch =
      createDeferred<Array<{ path: string; relativePath: string; name: string; score: number }>>();

    remoteBackendTestDoubles.call.mockImplementation((connectionId, method) => {
      if (method === 'search:content') {
        return firstSearch.promise;
      }
      if (method === 'search:files') {
        return secondSearch.promise;
      }
      if (method === 'search:cancel') {
        return Promise.resolve(true);
      }
      throw new Error(`Unexpected method ${method} for ${connectionId}`);
    });

    const firstPromise = backend.searchContent({
      requestId: 'reused-search',
      rootPath: '/__enso_remote__/connection-1/srv/project',
      query: 'first',
    });
    const secondPromise = backend.searchFiles({
      requestId: 'reused-search',
      rootPath: '/__enso_remote__/connection-1/srv/project',
      query: 'second',
    });

    firstSearch.resolve({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: false,
    });
    await expect(firstPromise).resolves.toEqual({
      matches: [],
      totalMatches: 0,
      totalFiles: 0,
      truncated: false,
    });

    await expect(backend.cancelSearch('reused-search')).resolves.toBe(true);
    expect(remoteBackendTestDoubles.call).toHaveBeenLastCalledWith(
      'connection-1',
      'search:cancel',
      { requestId: 'reused-search' },
      expect.any(Number)
    );

    secondSearch.resolve([]);
    await expect(secondPromise).resolves.toEqual([]);
  });
});
