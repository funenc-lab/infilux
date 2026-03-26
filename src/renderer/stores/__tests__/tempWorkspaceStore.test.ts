import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorageMock(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => {
      data.clear();
    }),
  };
}

async function loadTempWorkspaceStore(options?: {
  storedValue?: string;
  listImpl?: (path: string) => Promise<unknown>;
  tempWorkspaceRehydrateImpl?: (items: unknown[]) => Promise<unknown>;
}) {
  vi.resetModules();

  const localStorageMock = createLocalStorageMock(
    options?.storedValue ? { 'enso-temp-workspaces': options.storedValue } : undefined
  );
  const list = vi.fn(options?.listImpl ?? (async () => []));
  const rehydrate = options?.tempWorkspaceRehydrateImpl
    ? vi.fn(options.tempWorkspaceRehydrateImpl)
    : undefined;

  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('window', {
    electronAPI: {
      file: {
        list,
      },
      ...(rehydrate
        ? {
            tempWorkspace: {
              rehydrate,
            },
          }
        : {}),
    },
  });

  const module = await import('../tempWorkspace');
  return {
    useTempWorkspaceStore: module.useTempWorkspaceStore,
    localStorageMock,
    list,
    rehydrate,
  };
}

describe('temp workspace store', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads persisted items and updates storage when items change', async () => {
    const item = {
      id: 'temp-1',
      path: '/tmp/session-1',
      folderName: 'session-1',
      title: 'Session 1',
      createdAt: 1,
    };
    const env = await loadTempWorkspaceStore({
      storedValue: JSON.stringify([item]),
    });
    const store = env.useTempWorkspaceStore.getState();

    expect(store.items).toEqual([item]);

    store.addItem({
      id: 'temp-2',
      path: '/tmp/session-2',
      folderName: 'session-2',
      title: 'Session 2',
      createdAt: 2,
    });
    store.renameItem('temp-1', 'Renamed');
    store.removeItem('temp-2');
    store.openRename('temp-1');
    store.openDelete('temp-1');

    expect(env.useTempWorkspaceStore.getState()).toMatchObject({
      renameTargetId: 'temp-1',
      deleteTargetId: 'temp-1',
    });
    expect(env.useTempWorkspaceStore.getState().items).toEqual([
      {
        ...item,
        title: 'Renamed',
      },
    ]);
    expect(env.localStorageMock.setItem).toHaveBeenCalled();
  });

  it('falls back to an empty list when storage is invalid', async () => {
    const env = await loadTempWorkspaceStore({
      storedValue: '{invalid-json}',
    });

    expect(env.useTempWorkspaceStore.getState().items).toEqual([]);
  });

  it('starts empty when nothing is stored and keeps items for unknown file-list errors', async () => {
    const item = {
      id: 'temp-unknown',
      path: '/tmp/unknown',
      folderName: 'unknown',
      title: 'Unknown',
      createdAt: 10,
    };
    const env = await loadTempWorkspaceStore();
    expect(env.useTempWorkspaceStore.getState().items).toEqual([]);

    env.useTempWorkspaceStore.getState().setItems([item]);
    env.list.mockRejectedValueOnce({ code: '' });

    await env.useTempWorkspaceStore.getState().rehydrate();

    expect(env.useTempWorkspaceStore.getState().items).toEqual([item]);
  });

  it('replaces items through setItems and falls back to an empty list for non-array storage payloads', async () => {
    const env = await loadTempWorkspaceStore({
      storedValue: JSON.stringify({ id: 'not-an-array' }),
    });
    const replacement = [
      {
        id: 'temp-9',
        path: '/tmp/replaced',
        folderName: 'replaced',
        title: 'Replaced',
        createdAt: 9,
      },
    ];

    expect(env.useTempWorkspaceStore.getState().items).toEqual([]);

    env.useTempWorkspaceStore.getState().setItems(replacement);

    expect(env.useTempWorkspaceStore.getState().items).toEqual(replacement);
    expect(env.localStorageMock.setItem).toHaveBeenLastCalledWith(
      'enso-temp-workspaces',
      JSON.stringify(replacement)
    );
  });

  it('rehydrates items once and filters paths that no longer exist', async () => {
    const env = await loadTempWorkspaceStore({
      storedValue: JSON.stringify([
        {
          id: 'temp-1',
          path: '/tmp/keep',
          folderName: 'keep',
          title: 'Keep',
          createdAt: 1,
        },
        {
          id: 'temp-2',
          path: '/tmp/missing',
          folderName: 'missing',
          title: 'Missing',
          createdAt: 2,
        },
        {
          id: 'temp-3',
          path: '/tmp/error',
          folderName: 'error',
          title: 'Error',
          createdAt: 3,
        },
      ]),
      listImpl: async (path: string) => {
        if (path === '/tmp/missing') {
          throw { code: 'ENOENT' };
        }
        if (path === '/tmp/error') {
          throw new Error('temporary remote failure');
        }
        return [];
      },
    });
    const store = env.useTempWorkspaceStore.getState();

    await Promise.all([store.rehydrate(), store.rehydrate()]);

    expect(env.list).toHaveBeenCalledTimes(3);
    expect(env.useTempWorkspaceStore.getState().items).toEqual([
      {
        id: 'temp-1',
        path: '/tmp/keep',
        folderName: 'keep',
        title: 'Keep',
        createdAt: 1,
      },
      {
        id: 'temp-3',
        path: '/tmp/error',
        folderName: 'error',
        title: 'Error',
        createdAt: 3,
      },
    ]);
  });

  it('prefers the temp workspace rehydrate API when available', async () => {
    const item = {
      id: 'temp-1',
      path: '/tmp/original',
      folderName: 'original',
      title: 'Original',
      createdAt: 1,
    };
    const env = await loadTempWorkspaceStore({
      storedValue: JSON.stringify([item]),
      tempWorkspaceRehydrateImpl: async (items: unknown[]) => {
        return [
          {
            ...(items[0] as typeof item),
            path: '/tmp/normalized',
          },
        ];
      },
    });

    await env.useTempWorkspaceStore.getState().rehydrate();

    expect(env.rehydrate).toHaveBeenCalledWith([item]);
    expect(env.list).not.toHaveBeenCalled();
    expect(env.useTempWorkspaceStore.getState().items).toEqual([
      {
        ...item,
        path: '/tmp/normalized',
      },
    ]);
  });

  it('logs rehydrate failures for both queued and owning callers, then allows retrying', async () => {
    const item = {
      id: 'temp-1',
      path: '/tmp/failing',
      folderName: 'failing',
      title: 'Failing',
      createdAt: 1,
    };
    const error = Object.assign(new Error('rehydrate failed'), { code: 'EIO' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await loadTempWorkspaceStore({
      storedValue: JSON.stringify([item]),
      tempWorkspaceRehydrateImpl: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce([item]),
    });
    const store = env.useTempWorkspaceStore.getState();

    await Promise.all([store.rehydrate(), store.rehydrate()]);

    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenNthCalledWith(1, 'Temp Session rehydrate failed', error);
    expect(consoleError).toHaveBeenNthCalledWith(2, 'Temp Session rehydrate failed', error);
    expect(env.useTempWorkspaceStore.getState().items).toEqual([item]);

    await store.rehydrate();

    expect(env.rehydrate).toHaveBeenCalledTimes(2);
    expect(env.useTempWorkspaceStore.getState().items).toEqual([item]);
  });
});
