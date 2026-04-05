import { IPC_CHANNELS } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

type FsStats = {
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  mtimeMs: number;
};

const fileDiagnosticsDoubles = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const appState: {
    getPath: ReturnType<typeof vi.fn>;
    isPackaged?: boolean;
  } = {
    getPath: vi.fn(() => '/tmp'),
    isPackaged: true,
  };
  const readdir = vi.fn(async () => ['alpha.ts']);
  const stat = vi.fn(async () => makeStats({ isFile: true, size: 10, mtimeMs: 20 }));
  const checkIgnore = vi.fn(async () => []);

  class MockFileWatcher {
    readonly start = vi.fn(async () => undefined);
    readonly stop = vi.fn(async () => undefined);

    constructor(
      readonly dirPath: string,
      readonly callback: (type: 'create' | 'update' | 'delete', path: string) => void
    ) {}
  }

  return {
    handlers,
    appState,
    readdir,
    stat,
    checkIgnore,
    MockFileWatcher,
  };
});

vi.mock('electron', () => ({
  app: fileDiagnosticsDoubles.appState,
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    fromId: vi.fn(() => null),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      fileDiagnosticsDoubles.handlers.set(channel, handler);
    }),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  rmSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(async () => undefined),
  readdir: fileDiagnosticsDoubles.readdir,
  readFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  stat: fileDiagnosticsDoubles.stat,
  writeFile: vi.fn(),
}));

vi.mock('iconv-lite', () => ({
  default: {
    decode: vi.fn(),
    encode: vi.fn(),
  },
}));

vi.mock('isbinaryfile', () => ({
  isBinaryFile: vi.fn(async () => false),
}));

vi.mock('../../services/files/FileWatcher', () => ({
  FileWatcher: fileDiagnosticsDoubles.MockFileWatcher,
}));

vi.mock('../../services/files/LocalFileAccess', () => ({
  registerAllowedLocalFileRoot: vi.fn(),
  unregisterAllowedLocalFileRootsByOwner: vi.fn(),
}));

vi.mock('../../services/git/runtime', () => ({
  createSimpleGit: vi.fn(() => ({
    checkIgnore: fileDiagnosticsDoubles.checkIgnore,
  })),
  normalizeGitRelativePath: vi.fn((path: string) => path.replace(/\\/g, '/')),
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    onDidStatusChange: vi.fn(() => () => {}),
    addEventListener: vi.fn(async () => () => {}),
    call: vi.fn(async () => undefined),
  },
}));

vi.mock('../../services/remote/RemoteI18n', () => ({
  createRemoteError: vi.fn((message: string) => new Error(message)),
}));

vi.mock('../../services/remote/RemotePath', () => ({
  isRemoteVirtualPath: vi.fn(() => false),
  parseRemoteVirtualPath: vi.fn(),
  toRemoteVirtualPath: vi.fn(),
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

function makeStats(options: {
  isFile?: boolean;
  isDirectory?: boolean;
  size?: number;
  mtimeMs?: number;
}): FsStats {
  return {
    isFile: () => options.isFile ?? false,
    isDirectory: () => options.isDirectory ?? false,
    size: options.size ?? 0,
    mtimeMs: options.mtimeMs ?? 0,
  };
}

function createSender(id: number) {
  return {
    id,
    once: vi.fn(),
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };
}

async function loadFilesModule(options: {
  nodeEnv: string;
  ensoDebugFileList?: string;
  isPackaged?: boolean;
  omitIsPackaged?: boolean;
}) {
  vi.resetModules();
  fileDiagnosticsDoubles.handlers.clear();
  fileDiagnosticsDoubles.readdir.mockReset();
  fileDiagnosticsDoubles.readdir.mockResolvedValue(['alpha.ts']);
  fileDiagnosticsDoubles.stat.mockReset();
  fileDiagnosticsDoubles.stat.mockResolvedValue(
    makeStats({
      isFile: true,
      size: 10,
      mtimeMs: 20,
    })
  );
  fileDiagnosticsDoubles.checkIgnore.mockReset();
  fileDiagnosticsDoubles.checkIgnore.mockResolvedValue([]);
  fileDiagnosticsDoubles.appState.getPath.mockReturnValue('/tmp');

  if (options.omitIsPackaged) {
    delete fileDiagnosticsDoubles.appState.isPackaged;
  } else {
    fileDiagnosticsDoubles.appState.isPackaged = options.isPackaged ?? true;
  }

  process.env.NODE_ENV = options.nodeEnv;
  if (options.ensoDebugFileList === undefined) {
    delete process.env.ENSO_DEBUG_FILE_LIST;
  } else {
    process.env.ENSO_DEBUG_FILE_LIST = options.ensoDebugFileList;
  }

  const filesModule = await import('../files');
  filesModule.stopAllFileWatchersSync();
  filesModule.registerFileHandlers();

  return {
    listHandler: fileDiagnosticsDoubles.handlers.get(IPC_CHANNELS.FILE_LIST),
  };
}

const originalNodeEnv = process.env.NODE_ENV;
const originalDebugFileList = process.env.ENSO_DEBUG_FILE_LIST;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalDebugFileList === undefined) {
    delete process.env.ENSO_DEBUG_FILE_LIST;
  } else {
    process.env.ENSO_DEBUG_FILE_LIST = originalDebugFileList;
  }
  vi.restoreAllMocks();
});

describe('file list diagnostics logging', () => {
  it('logs diagnostics when ENSO_DEBUG_FILE_LIST enables local file list logging', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { listHandler } = await loadFilesModule({
      nodeEnv: 'development',
      ensoDebugFileList: '1',
      isPackaged: true,
    });

    await expect(listHandler?.({ sender: createSender(1) }, '/repo', '/repo')).resolves.toEqual([
      {
        name: 'alpha.ts',
        path: '/repo/alpha.ts',
        isDirectory: false,
        size: 10,
        modifiedAt: 20,
        ignored: false,
      },
    ]);

    expect(infoSpy).toHaveBeenCalledWith(
      '[file-list] local-list:start',
      expect.objectContaining({
        dirPath: '/repo',
        resolvedDirPath: '/repo',
        gitRoot: '/repo',
        senderId: 1,
      })
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[file-list-debug] local-list:result',
      expect.objectContaining({
        dirPath: '/repo',
        resolvedDirPath: '/repo',
        gitRoot: '/repo',
        count: 1,
      })
    );
  });

  it('logs diagnostics when the Electron app packaging state is unavailable', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { listHandler } = await loadFilesModule({
      nodeEnv: 'development',
      omitIsPackaged: true,
    });

    await listHandler?.({ sender: createSender(2) }, '/repo', '/repo');

    expect(infoSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('logs diagnostics when the app is running unpackaged outside the test environment', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { listHandler } = await loadFilesModule({
      nodeEnv: 'development',
      isPackaged: false,
    });

    await listHandler?.({ sender: createSender(3) }, '/repo', '/repo');

    expect(infoSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
