import { IPC_CHANNELS } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    readonly start = vi.fn(async () => {});
    readonly stop = vi.fn(async () => {});

    constructor(
      dirPath: string,
      callback: (type: 'create' | 'update' | 'delete', path: string) => void
    ) {
      this.dirPath = dirPath;
      this.callback = callback;
      instances.push(this);
    }
  }

  return {
    handlers,
    instances,
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
  beforeEach(() => {
    fileWatcherTestDoubles.handlers.clear();
    fileWatcherTestDoubles.instances.length = 0;
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

    await vi.advanceTimersByTimeAsync(100);

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(IPC_CHANNELS.FILE_CHANGE, {
      type: 'update',
      path: '/repo/.enso-bulk',
    });
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
});
