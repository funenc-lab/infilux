import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RemoteConnectionStatus = { connected: boolean };
type RemoteEventListener = (payload: unknown) => void;
type RemoteAddEventListener = (
  connectionId: string,
  event: string,
  listener: RemoteEventListener
) => Promise<() => void>;
type RemoteCall = (
  connectionId: string,
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number
) => Promise<unknown>;
type RemoteOnDidStatusChange = (
  connectionId: string,
  callback: (status: RemoteConnectionStatus) => void
) => () => void;

const fileWatcherTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const instances: MockFileWatcher[] = [];
  let nextStartImplementation: (() => Promise<void>) | null = null;
  const unregisterAllowedLocalFileRootsByOwner = vi.fn();
  const windows = new Map<
    number,
    {
      id: number;
      isDestroyed: ReturnType<typeof vi.fn>;
      webContents: {
        send: ReturnType<typeof vi.fn>;
        isDestroyed: ReturnType<typeof vi.fn>;
      };
    }
  >();
  const remoteStatusListeners = new Map<string, (status: RemoteConnectionStatus) => void>();
  const remoteStatusOffs = new Map<string, ReturnType<typeof vi.fn>>();
  const remoteRemoveListeners: ReturnType<typeof vi.fn>[] = [];
  const remoteAddEventListener = vi.fn<RemoteAddEventListener>(async () => {
    const removeListener = vi.fn();
    remoteRemoveListeners.push(removeListener);
    return removeListener;
  });
  const remoteCall = vi.fn<RemoteCall>(async () => undefined);
  const remoteOnDidStatusChange = vi.fn<RemoteOnDidStatusChange>(
    (connectionId: string, callback: (status: RemoteConnectionStatus) => void) => {
      remoteStatusListeners.set(connectionId, callback);
      const offStatus = vi.fn(() => {
        remoteStatusListeners.delete(connectionId);
      });
      remoteStatusOffs.set(connectionId, offStatus);
      return offStatus;
    }
  );
  const remoteIsRemoteVirtualPath = vi.fn((path: string) => path.startsWith('/__remote__/'));
  const remoteParseRemoteVirtualPath = vi.fn((path: string) => {
    const prefix = '/__remote__/';
    const rest = path.slice(prefix.length);
    const slashIndex = rest.indexOf('/');
    return {
      connectionId: rest.slice(0, slashIndex),
      remotePath: `/${rest.slice(slashIndex + 1)}`,
    };
  });
  const remoteToRemoteVirtualPath = vi.fn((connectionId: string, path: string) => {
    return `/__remote__/${connectionId}${path}`;
  });

  class MockFileWatcher {
    readonly dirPath: string;
    readonly callback: (type: 'create' | 'update' | 'delete', path: string) => void;
    readonly start: ReturnType<typeof vi.fn>;
    readonly stop: ReturnType<typeof vi.fn>;

    constructor(
      dirPath: string,
      callback: (type: 'create' | 'update' | 'delete', path: string) => void
    ) {
      this.dirPath = dirPath;
      this.callback = callback;
      this.start = vi.fn(nextStartImplementation ?? (async () => {}));
      nextStartImplementation = null;
      this.stop = vi.fn(async () => {});
      instances.push(this);
    }
  }

  return {
    handlers,
    instances,
    setNextStartImplementation: (implementation: (() => Promise<void>) | null) => {
      nextStartImplementation = implementation;
    },
    unregisterAllowedLocalFileRootsByOwner,
    windows,
    remoteStatusListeners,
    remoteStatusOffs,
    remoteRemoveListeners,
    remoteAddEventListener,
    remoteCall,
    remoteOnDidStatusChange,
    remoteIsRemoteVirtualPath,
    remoteParseRemoteVirtualPath,
    remoteToRemoteVirtualPath,
    MockFileWatcher,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
  BrowserWindow: {
    fromWebContents: vi.fn((sender: { windowId?: number; id: number }) => {
      return fileWatcherTestDoubles.windows.get(sender.windowId ?? sender.id) ?? null;
    }),
    fromId: vi.fn((id: number) => fileWatcherTestDoubles.windows.get(id) ?? null),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      fileWatcherTestDoubles.handlers.set(channel, handler);
    }),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
}));

vi.mock('iconv-lite', () => ({
  default: {
    decode: vi.fn(() => ''),
    encode: vi.fn(() => Buffer.from('')),
  },
}));

vi.mock('isbinaryfile', () => ({
  isBinaryFile: vi.fn(async () => false),
}));

vi.mock('../fileUtils', async () => {
  const actual = await vi.importActual<typeof import('../fileUtils')>('../fileUtils');
  return actual;
});

vi.mock('../../services/files/FileWatcher', () => ({
  FileWatcher: fileWatcherTestDoubles.MockFileWatcher,
}));

vi.mock('../../services/files/LocalFileAccess', () => ({
  registerAllowedLocalFileRoot: vi.fn(),
  unregisterAllowedLocalFileRootsByOwner:
    fileWatcherTestDoubles.unregisterAllowedLocalFileRootsByOwner,
}));

vi.mock('../../services/git/runtime', () => ({
  createSimpleGit: vi.fn(),
  normalizeGitRelativePath: vi.fn((path: string) => path),
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    onDidStatusChange: fileWatcherTestDoubles.remoteOnDidStatusChange,
    addEventListener: fileWatcherTestDoubles.remoteAddEventListener,
    call: fileWatcherTestDoubles.remoteCall,
  },
}));

vi.mock('../../services/remote/RemoteI18n', () => ({
  createRemoteError: vi.fn((message: string) => new Error(message)),
}));

vi.mock('../../services/remote/RemotePath', () => ({
  isRemoteVirtualPath: fileWatcherTestDoubles.remoteIsRemoteVirtualPath,
  parseRemoteVirtualPath: fileWatcherTestDoubles.remoteParseRemoteVirtualPath,
  toRemoteVirtualPath: fileWatcherTestDoubles.remoteToRemoteVirtualPath,
}));

vi.mock('../../services/remote/RemoteRepositoryBackend', () => ({
  remoteRepositoryBackend: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    listFiles: vi.fn(),
    copy: vi.fn(),
    checkConflicts: vi.fn(),
    batchCopy: vi.fn(),
    batchMove: vi.fn(),
  },
}));

import {
  registerFileHandlers,
  stopAllFileWatchers,
  stopAllFileWatchersSync,
  stopWatchersInDirectory,
} from '../files';

function createSender(id: number) {
  let destroyedHandler: (() => void) | undefined;
  const windowId = id + 100;
  fileWatcherTestDoubles.windows.set(windowId, {
    id: windowId,
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
  });
  return {
    id,
    windowId,
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'destroyed') {
        destroyedHandler = handler;
      }
    }),
    triggerDestroyed: () => destroyedHandler?.(),
  };
}

describe('file watcher lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    fileWatcherTestDoubles.handlers.clear();
    fileWatcherTestDoubles.instances.length = 0;
    fileWatcherTestDoubles.setNextStartImplementation(null);
    fileWatcherTestDoubles.windows.clear();
    fileWatcherTestDoubles.unregisterAllowedLocalFileRootsByOwner.mockReset();
    fileWatcherTestDoubles.remoteStatusListeners.clear();
    fileWatcherTestDoubles.remoteStatusOffs.clear();
    fileWatcherTestDoubles.remoteRemoveListeners.length = 0;
    fileWatcherTestDoubles.remoteAddEventListener.mockClear();
    fileWatcherTestDoubles.remoteCall.mockReset();
    fileWatcherTestDoubles.remoteOnDidStatusChange.mockClear();
    fileWatcherTestDoubles.remoteIsRemoteVirtualPath.mockImplementation((path: string) =>
      path.startsWith('/__remote__/')
    );
    fileWatcherTestDoubles.remoteParseRemoteVirtualPath.mockImplementation((path: string) => {
      const prefix = '/__remote__/';
      const rest = path.slice(prefix.length);
      const slashIndex = rest.indexOf('/');
      return {
        connectionId: rest.slice(0, slashIndex),
        remotePath: `/${rest.slice(slashIndex + 1)}`,
      };
    });
    fileWatcherTestDoubles.remoteToRemoteVirtualPath.mockImplementation(
      (connectionId: string, path: string) => `/__remote__/${connectionId}${path}`
    );
    stopAllFileWatchersSync();
    registerFileHandlers();
  });

  it('starts a local watcher and cleans it up when the owner webContents is destroyed', async () => {
    const sender = createSender(1);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, '/repo');

    expect(fileWatcherTestDoubles.instances).toHaveLength(1);
    expect(fileWatcherTestDoubles.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function));

    sender.triggerDestroyed();
    await Promise.resolve();
    await Promise.resolve();

    expect(fileWatcherTestDoubles.unregisterAllowedLocalFileRootsByOwner).toHaveBeenCalledWith(1);
    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('does not start a duplicate local watcher for the same owner and directory', async () => {
    const sender = createSender(2);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, '/repo');
    await startHandler?.({ sender }, '/repo');

    expect(fileWatcherTestDoubles.instances).toHaveLength(1);
    expect(fileWatcherTestDoubles.instances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it('stops a local watcher through the explicit stop handler and no-ops when repeated', async () => {
    const sender = createSender(12);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    const stopHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_STOP);

    await startHandler?.({ sender }, '/repo');
    await stopHandler?.({ sender }, '/repo');
    await stopHandler?.({ sender }, '/repo');

    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('cleans up a local watcher when startup fails', async () => {
    const sender = createSender(13);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    fileWatcherTestDoubles.setNextStartImplementation(async () => {
      throw new Error('watch failed');
    });

    await expect(startHandler?.({ sender }, '/repo/failing')).rejects.toThrow('watch failed');
    const watcher = fileWatcherTestDoubles.instances[0];
    expect(watcher?.stop).toHaveBeenCalledTimes(1);
  });

  it('flushes normal watcher events as individual file change notifications', async () => {
    vi.useFakeTimers();
    const sender = createSender(10);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, '/repo');

    fileWatcherTestDoubles.instances[0]?.callback('update', '/repo/a.ts');
    fileWatcherTestDoubles.instances[0]?.callback('delete', '/repo/b.ts');

    expect(sender.send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(sender.send).toHaveBeenNthCalledWith(1, IPC_CHANNELS.FILE_CHANGE, {
      type: 'update',
      path: '/repo/a.ts',
    });
    expect(sender.send).toHaveBeenNthCalledWith(2, IPC_CHANNELS.FILE_CHANGE, {
      type: 'delete',
      path: '/repo/b.ts',
    });
  });

  it('switches to bulk sentinel mode when pending watcher events overflow the threshold', async () => {
    vi.useFakeTimers();
    const sender = createSender(11);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, '/repo');

    for (let index = 0; index <= 5000; index += 1) {
      fileWatcherTestDoubles.instances[0]?.callback('update', `/repo/file-${index}.ts`);
    }
    fileWatcherTestDoubles.instances[0]?.callback('delete', '/repo/final-overflow.ts');

    await vi.advanceTimersByTimeAsync(100);

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(IPC_CHANNELS.FILE_CHANGE, {
      type: 'update',
      path: '/repo/.enso-bulk',
    });
  });

  it('stops the watcher when file events arrive after the sender is already destroyed', async () => {
    const sender = createSender(14);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, '/repo');
    sender.isDestroyed.mockReturnValue(true);

    fileWatcherTestDoubles.instances[0]?.callback('update', '/repo/late.ts');
    await Promise.resolve();
    await Promise.resolve();

    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('cancels queued flush timers when a local watcher is stopped before delivery', async () => {
    vi.useFakeTimers();
    const sender = createSender(16);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    const stopHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_STOP);

    await startHandler?.({ sender }, '/repo/timer-stop');

    fileWatcherTestDoubles.instances[0]?.callback('update', '/repo/timer-stop/file.ts');
    await stopHandler?.({ sender }, '/repo/timer-stop');
    await vi.advanceTimersByTimeAsync(100);

    expect(sender.send).not.toHaveBeenCalled();
    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the watcher when the sender is destroyed before a queued flush runs', async () => {
    vi.useFakeTimers();
    const sender = createSender(17);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, '/repo/timer-destroy');

    fileWatcherTestDoubles.instances[0]?.callback('update', '/repo/timer-destroy/file.ts');
    sender.isDestroyed.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(100);

    expect(sender.send).not.toHaveBeenCalled();
    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('stops a watcher that was synchronously removed before startup completed', async () => {
    const sender = createSender(15);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    let resolveStart: (() => void) | undefined;

    fileWatcherTestDoubles.setNextStartImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        })
    );

    const startPromise = startHandler?.({ sender }, '/repo/pending');
    await Promise.resolve();
    stopAllFileWatchersSync();
    resolveStart?.();

    await startPromise;

    expect(fileWatcherTestDoubles.instances[0]?.stop.mock.calls.length ?? 0).toBeGreaterThanOrEqual(
      1
    );
  });

  it('stops every watcher under the requested directory subtree', async () => {
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender: createSender(1) }, '/repo');
    await startHandler?.({ sender: createSender(2) }, '/repo/sub');
    await startHandler?.({ sender: createSender(3) }, '/other');

    expect(fileWatcherTestDoubles.instances).toHaveLength(3);

    await stopWatchersInDirectory('/repo');

    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.instances[1]?.stop).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.instances[2]?.stop).not.toHaveBeenCalled();
  });

  it('stops every remote watcher under the requested directory subtree', async () => {
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender: createSender(33) }, '/__remote__/conn-16/repo');
    await startHandler?.({ sender: createSender(34) }, '/__remote__/conn-16/repo/sub');
    await startHandler?.({ sender: createSender(35) }, '/__remote__/conn-16/other');

    await stopWatchersInDirectory('/__remote__/conn-16/repo');

    expect(
      fileWatcherTestDoubles.remoteCall.mock.calls.filter(
        ([connectionId, method]) => connectionId === 'conn-16' && method === 'fs:watchStop'
      )
    ).toEqual([
      [
        'conn-16',
        'fs:watchStop',
        {
          id: 'remote-watch:133:conn-16:/repo',
        },
      ],
      [
        'conn-16',
        'fs:watchStop',
        {
          id: 'remote-watch:134:conn-16:/repo/sub',
        },
      ],
    ]);
    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-16')).not.toHaveBeenCalled();
  });

  it('re-registers a remote watcher after connection recovery and forwards remote changes', async () => {
    const sender = createSender(20);
    const remoteDir = '/__remote__/conn-1/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    let remoteChangeListener: RemoteEventListener | undefined;
    fileWatcherTestDoubles.remoteAddEventListener.mockImplementation(
      async (_connectionId: string, _event: string, listener: RemoteEventListener) => {
        remoteChangeListener = listener;
        const removeListener = vi.fn();
        fileWatcherTestDoubles.remoteRemoveListeners.push(removeListener);
        return removeListener;
      }
    );

    await startHandler?.({ sender }, remoteDir);

    expect(fileWatcherTestDoubles.remoteCall).toHaveBeenCalledWith('conn-1', 'fs:watchStart', {
      id: 'remote-watch:120:conn-1:/workspace',
      path: '/workspace',
    });

    fileWatcherTestDoubles.remoteStatusListeners.get('conn-1')?.({ connected: false });
    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);

    fileWatcherTestDoubles.remoteStatusListeners.get('conn-1')?.({ connected: true });
    await Promise.resolve();

    expect(fileWatcherTestDoubles.remoteCall).toHaveBeenCalledWith('conn-1', 'fs:watchStart', {
      id: 'remote-watch:120:conn-1:/workspace',
      path: '/workspace',
    });
    expect(fileWatcherTestDoubles.remoteAddEventListener).toHaveBeenCalledTimes(2);

    remoteChangeListener?.({
      watcherId: 'remote-watch:120:conn-1:/workspace',
      type: 'update',
      path: '/workspace/file.ts',
    });

    expect(fileWatcherTestDoubles.windows.get(120)?.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.FILE_CHANGE,
      {
        type: 'update',
        path: '/__remote__/conn-1/workspace/file.ts',
      }
    );
  });

  it('ignores remote file change events when the window is gone or the payload is incomplete', async () => {
    const sender = createSender(36);
    const remoteDir = '/__remote__/conn-17/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    let remoteChangeListener: RemoteEventListener | undefined;

    fileWatcherTestDoubles.remoteAddEventListener.mockImplementationOnce(
      async (_connectionId: string, _event: string, listener: RemoteEventListener) => {
        remoteChangeListener = listener;
        const removeListener = vi.fn();
        fileWatcherTestDoubles.remoteRemoveListeners.push(removeListener);
        return removeListener;
      }
    );

    await startHandler?.({ sender }, remoteDir);

    const window = fileWatcherTestDoubles.windows.get(136);
    expect(window).toBeDefined();

    window?.isDestroyed.mockReturnValue(true);
    remoteChangeListener?.({
      watcherId: 'remote-watch:136:conn-17:/workspace',
      type: 'update',
      path: '/workspace/destroyed.ts',
    });

    window?.isDestroyed.mockReturnValue(false);
    remoteChangeListener?.({
      watcherId: 'remote-watch:136:conn-17:/other-workspace',
      type: 'update',
      path: '/workspace/ignored.ts',
    });
    remoteChangeListener?.({
      watcherId: 'remote-watch:136:conn-17:/workspace',
      path: '/workspace/missing-type.ts',
    });
    remoteChangeListener?.({
      watcherId: 'remote-watch:136:conn-17:/workspace',
      type: 'update',
    });

    expect(window?.webContents.send).not.toHaveBeenCalled();
  });

  it('replaces the existing remote event listener when a connected status is emitted again', async () => {
    const sender = createSender(26);
    const remoteDir = '/__remote__/conn-13/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, remoteDir);
    fileWatcherTestDoubles.remoteStatusListeners.get('conn-13')?.({ connected: true });
    await Promise.resolve();

    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteAddEventListener).toHaveBeenCalledTimes(2);
  });

  it('reuses an existing remote connection subscription for later watcher registrations', async () => {
    const firstSender = createSender(28);
    const secondSender = createSender(29);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender: firstSender }, '/__remote__/conn-15/workspace-a');
    await startHandler?.({ sender: secondSender }, '/__remote__/conn-15/workspace-b');

    expect(fileWatcherTestDoubles.remoteOnDidStatusChange).toHaveBeenCalledTimes(1);
    expect(
      fileWatcherTestDoubles.remoteCall.mock.calls.filter(
        ([connectionId, method]) => connectionId === 'conn-15' && method === 'fs:watchStart'
      )
    ).toHaveLength(2);
  });

  it('does not start a duplicate remote watcher for the same window and directory', async () => {
    const sender = createSender(24);
    const remoteDir = '/__remote__/conn-11/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, remoteDir);
    await startHandler?.({ sender }, remoteDir);

    expect(fileWatcherTestDoubles.remoteAddEventListener).toHaveBeenCalledTimes(1);
    expect(
      fileWatcherTestDoubles.remoteCall.mock.calls.filter(
        ([connectionId, method]) => connectionId === 'conn-11' && method === 'fs:watchStart'
      )
    ).toHaveLength(1);
  });

  it('ignores remote connection status changes when no registrations remain for that connection', async () => {
    const sender = createSender(27);
    const remoteDir = '/__remote__/conn-14/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    fileWatcherTestDoubles.windows.get(127)?.isDestroyed.mockReturnValue(true);

    await startHandler?.({ sender }, remoteDir);
    fileWatcherTestDoubles.remoteStatusListeners.get('conn-14')?.({ connected: false });
    fileWatcherTestDoubles.remoteStatusListeners.get('conn-14')?.({ connected: true });

    expect(
      fileWatcherTestDoubles.remoteCall.mock.calls.filter(
        ([connectionId, method]) => connectionId === 'conn-14' && method === 'fs:watchStart'
      )
    ).toHaveLength(0);
    expect(fileWatcherTestDoubles.remoteAddEventListener).not.toHaveBeenCalled();
  });

  it('cleans up remote watchers on owner destroy and stops the remote watch', async () => {
    const sender = createSender(21);
    const remoteDir = '/__remote__/conn-2/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender }, remoteDir);
    sender.triggerDestroyed();
    await Promise.resolve();
    await Promise.resolve();

    expect(fileWatcherTestDoubles.unregisterAllowedLocalFileRootsByOwner).toHaveBeenCalledWith(21);
    expect(fileWatcherTestDoubles.remoteCall).toHaveBeenCalledWith('conn-2', 'fs:watchStop', {
      id: 'remote-watch:121:conn-2:/workspace',
    });
    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-2')).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);
  });

  it('cleans up remote watcher state when watch start fails', async () => {
    const sender = createSender(22);
    const remoteDir = '/__remote__/conn-3/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    fileWatcherTestDoubles.remoteCall.mockImplementation(
      async (_connectionId: string, method: string) => {
        if (method === 'fs:watchStart') {
          throw new Error('watch start failed');
        }
        return undefined;
      }
    );

    await expect(startHandler?.({ sender }, remoteDir)).rejects.toThrow('watch start failed');

    expect(fileWatcherTestDoubles.remoteCall).toHaveBeenCalledWith('conn-3', 'fs:watchStop', {
      id: 'remote-watch:122:conn-3:/workspace',
    });
    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-3')).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);
  });

  it('rejects remote watch start without a resolved window and no-ops remote watch stop for the same case', async () => {
    const orphanSender = {
      id: 99,
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    };
    const remoteDir = '/__remote__/conn-9/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    const stopHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_STOP);

    await expect(startHandler?.({ sender: orphanSender }, remoteDir)).rejects.toThrow(
      'Unable to resolve window for remote file watcher'
    );

    await expect(stopHandler?.({ sender: orphanSender }, remoteDir)).resolves.toBeUndefined();
    expect(fileWatcherTestDoubles.remoteCall).not.toHaveBeenCalledWith(
      'conn-9',
      'fs:watchStop',
      expect.anything()
    );
  });

  it('stops a registered remote watcher through the explicit stop handler', async () => {
    const sender = createSender(23);
    const remoteDir = '/__remote__/conn-10/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    const stopHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_STOP);

    await startHandler?.({ sender }, remoteDir);
    await stopHandler?.({ sender }, remoteDir);

    expect(fileWatcherTestDoubles.remoteCall).toHaveBeenCalledWith('conn-10', 'fs:watchStop', {
      id: 'remote-watch:123:conn-10:/workspace',
    });
    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-10')).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);
  });

  it('keeps remote watcher cleanup best-effort when watch stop fails', async () => {
    const sender = createSender(25);
    const remoteDir = '/__remote__/conn-12/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    const stopHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_STOP);

    await startHandler?.({ sender }, remoteDir);
    fileWatcherTestDoubles.remoteCall.mockImplementation(
      async (_connectionId: string, method: string) => {
        if (method === 'fs:watchStop') {
          throw new Error('helper already gone');
        }
        return undefined;
      }
    );

    await expect(stopHandler?.({ sender }, remoteDir)).resolves.toBeUndefined();
    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-12')).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);
  });

  it('stops all local and remote watchers asynchronously and clears connection subscriptions', async () => {
    const localSender = createSender(30);
    const remoteSender = createSender(31);
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    await startHandler?.({ sender: localSender }, '/repo');
    await startHandler?.({ sender: remoteSender }, '/__remote__/conn-4/workspace');

    expect(fileWatcherTestDoubles.instances).toHaveLength(1);
    expect(fileWatcherTestDoubles.remoteStatusListeners.has('conn-4')).toBe(true);

    await stopAllFileWatchers();

    expect(fileWatcherTestDoubles.instances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteCall).toHaveBeenCalledWith('conn-4', 'fs:watchStop', {
      id: 'remote-watch:131:conn-4:/workspace',
    });
    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-4')).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteRemoveListeners[0]).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteStatusListeners.has('conn-4')).toBe(false);
  });

  it('clears lingering remote connection subscriptions even when registration drops immediately', async () => {
    const sender = createSender(32);
    const remoteDir = '/__remote__/conn-5/workspace';
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);

    fileWatcherTestDoubles.windows.get(132)?.isDestroyed.mockReturnValue(true);

    await startHandler?.({ sender }, remoteDir);

    expect(fileWatcherTestDoubles.remoteStatusListeners.has('conn-5')).toBe(true);
    expect(fileWatcherTestDoubles.remoteCall).not.toHaveBeenCalledWith('conn-5', 'fs:watchStop', {
      id: 'remote-watch:132:conn-5:/workspace',
    });

    await stopAllFileWatchers();

    expect(fileWatcherTestDoubles.remoteStatusOffs.get('conn-5')).toHaveBeenCalledTimes(1);
    expect(fileWatcherTestDoubles.remoteStatusListeners.has('conn-5')).toBe(false);
  });

  it('reuses pending remote connection setup across concurrent registrations for the same connection', async () => {
    const startHandler = fileWatcherTestDoubles.handlers.get(IPC_CHANNELS.FILE_WATCH_START);
    const firstSender = createSender(40);
    const secondSender = createSender(41);
    const thirdSender = createSender(42);

    const firstStart = startHandler?.({ sender: firstSender }, '/__remote__/conn-race/workspace-a');

    fileWatcherTestDoubles.windows.get(140)?.isDestroyed.mockReturnValue(true);
    stopAllFileWatchersSync();

    const secondStart = startHandler?.(
      { sender: secondSender },
      '/__remote__/conn-race/workspace-b'
    );
    const thirdStart = startHandler?.({ sender: thirdSender }, '/__remote__/conn-race/workspace-c');

    await Promise.all([firstStart, secondStart, thirdStart]);

    expect(fileWatcherTestDoubles.remoteOnDidStatusChange).toHaveBeenCalledTimes(1);
    expect(
      fileWatcherTestDoubles.remoteCall.mock.calls.filter(
        ([connectionId, method]) => connectionId === 'conn-race' && method === 'fs:watchStart'
      )
    ).toEqual([
      [
        'conn-race',
        'fs:watchStart',
        {
          id: 'remote-watch:141:conn-race:/workspace-b',
          path: '/workspace-b',
        },
      ],
      [
        'conn-race',
        'fs:watchStart',
        {
          id: 'remote-watch:142:conn-race:/workspace-c',
          path: '/workspace-c',
        },
      ],
    ]);
  });
});
