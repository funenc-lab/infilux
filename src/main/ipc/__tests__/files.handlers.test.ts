import { IPC_CHANNELS } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type FsStats = {
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  mtimeMs: number;
};

type MkdirFn = (path: string, options?: { recursive?: boolean }) => Promise<void>;
type ReaddirFn = (path: string, options?: unknown) => Promise<string[]>;
type ReadFileFn = (path: string) => Promise<Buffer>;
type RenameFn = (fromPath: string, toPath: string) => Promise<void>;
type RmFn = (path: string, options?: unknown) => Promise<void>;
type StatFn = (path: string) => Promise<FsStats>;
type WriteFileFn = (path: string, data: unknown, options?: unknown) => Promise<void>;
type CopyFileFn = (sourcePath: string, targetPath: string) => Promise<void>;
type CheckIgnoreFn = (paths: string[]) => Promise<string[]>;

const fileHandlerTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
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
  const appGetPath = vi.fn(() => '/tmp');
  const shellShowItemInFolder = vi.fn();
  const rmSync = vi.fn();
  const mkdir = vi.fn<MkdirFn>(async () => undefined);
  const readdir = vi.fn<ReaddirFn>(async () => []);
  const readFile = vi.fn<ReadFileFn>(async () => Buffer.from(''));
  const rename = vi.fn<RenameFn>(async () => undefined);
  const rm = vi.fn<RmFn>(async () => undefined);
  const stat = vi.fn<StatFn>(async () => makeStats({ isFile: true, size: 1, mtimeMs: 1 }));
  const writeFile = vi.fn<WriteFileFn>(async () => undefined);
  const copyFile = vi.fn<CopyFileFn>(async () => undefined);
  const iconvDecode = vi.fn(() => '');
  const iconvEncode = vi.fn(() => Buffer.from('encoded'));
  const isBinaryFile = vi.fn(async () => false);
  const registerAllowedLocalFileRoot = vi.fn();
  const unregisterAllowedLocalFileRootsByOwner = vi.fn();
  const checkIgnore = vi.fn<CheckIgnoreFn>(async () => []);
  const createSimpleGit = vi.fn(() => ({
    checkIgnore,
  }));
  const normalizeGitRelativePath = vi.fn((path: string) => path.replace(/\\/g, '/'));
  const remoteReadFile = vi.fn();
  const remoteWriteFile = vi.fn();
  const remoteCreateFile = vi.fn();
  const remoteCreateDirectory = vi.fn();
  const remoteRename = vi.fn();
  const remoteMove = vi.fn();
  const remoteDelete = vi.fn();
  const remoteExists = vi.fn();
  const remoteListFiles = vi.fn();
  const remoteCopy = vi.fn();
  const remoteCheckConflicts = vi.fn();
  const remoteBatchCopy = vi.fn();
  const remoteBatchMove = vi.fn();
  const remoteIsRemoteVirtualPath = vi.fn((path: string) => path.startsWith('/__remote__/'));
  const remoteParseRemoteVirtualPath = vi.fn((path: string) => ({
    connectionId: 'conn',
    remotePath: path.replace('/__remote__/conn', ''),
  }));
  const remoteToRemoteVirtualPath = vi.fn((connectionId: string, path: string) => {
    return `/__remote__/${connectionId}${path}`;
  });
  const createRemoteError = vi.fn((message: string) => new Error(message));

  return {
    handlers,
    windows,
    appGetPath,
    shellShowItemInFolder,
    rmSync,
    mkdir,
    readdir,
    readFile,
    rename,
    rm,
    stat,
    writeFile,
    copyFile,
    iconvDecode,
    iconvEncode,
    isBinaryFile,
    registerAllowedLocalFileRoot,
    unregisterAllowedLocalFileRootsByOwner,
    checkIgnore,
    createSimpleGit,
    normalizeGitRelativePath,
    remoteReadFile,
    remoteWriteFile,
    remoteCreateFile,
    remoteCreateDirectory,
    remoteRename,
    remoteMove,
    remoteDelete,
    remoteExists,
    remoteListFiles,
    remoteCopy,
    remoteCheckConflicts,
    remoteBatchCopy,
    remoteBatchMove,
    remoteIsRemoteVirtualPath,
    remoteParseRemoteVirtualPath,
    remoteToRemoteVirtualPath,
    createRemoteError,
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: fileHandlerTestDoubles.appGetPath,
  },
  BrowserWindow: {
    fromWebContents: vi.fn((sender: { windowId?: number; id: number }) => {
      return fileHandlerTestDoubles.windows.get(sender.windowId ?? sender.id) ?? null;
    }),
    fromId: vi.fn((id: number) => fileHandlerTestDoubles.windows.get(id) ?? null),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      fileHandlerTestDoubles.handlers.set(channel, handler);
    }),
  },
  shell: {
    showItemInFolder: fileHandlerTestDoubles.shellShowItemInFolder,
  },
}));

vi.mock('node:fs', () => ({
  rmSync: fileHandlerTestDoubles.rmSync,
}));

vi.mock('node:fs/promises', () => ({
  copyFile: fileHandlerTestDoubles.copyFile,
  mkdir: fileHandlerTestDoubles.mkdir,
  readdir: fileHandlerTestDoubles.readdir,
  readFile: fileHandlerTestDoubles.readFile,
  rename: fileHandlerTestDoubles.rename,
  rm: fileHandlerTestDoubles.rm,
  stat: fileHandlerTestDoubles.stat,
  writeFile: fileHandlerTestDoubles.writeFile,
}));

vi.mock('iconv-lite', () => ({
  default: {
    decode: fileHandlerTestDoubles.iconvDecode,
    encode: fileHandlerTestDoubles.iconvEncode,
  },
}));

vi.mock('isbinaryfile', () => ({
  isBinaryFile: fileHandlerTestDoubles.isBinaryFile,
}));

vi.mock('../../services/files/LocalFileAccess', () => ({
  registerAllowedLocalFileRoot: fileHandlerTestDoubles.registerAllowedLocalFileRoot,
  unregisterAllowedLocalFileRootsByOwner:
    fileHandlerTestDoubles.unregisterAllowedLocalFileRootsByOwner,
}));

vi.mock('../../services/git/runtime', () => ({
  createSimpleGit: fileHandlerTestDoubles.createSimpleGit,
  normalizeGitRelativePath: fileHandlerTestDoubles.normalizeGitRelativePath,
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    onDidStatusChange: vi.fn(() => () => {}),
    addEventListener: vi.fn(async () => () => {}),
    call: vi.fn(async () => undefined),
  },
}));

vi.mock('../../services/remote/RemoteI18n', () => ({
  createRemoteError: fileHandlerTestDoubles.createRemoteError,
}));

vi.mock('../../services/remote/RemotePath', () => ({
  isRemoteVirtualPath: fileHandlerTestDoubles.remoteIsRemoteVirtualPath,
  parseRemoteVirtualPath: fileHandlerTestDoubles.remoteParseRemoteVirtualPath,
  toRemoteVirtualPath: fileHandlerTestDoubles.remoteToRemoteVirtualPath,
}));

vi.mock('../../services/remote/RemoteRepositoryBackend', () => ({
  remoteRepositoryBackend: {
    readFile: fileHandlerTestDoubles.remoteReadFile,
    writeFile: fileHandlerTestDoubles.remoteWriteFile,
    createFile: fileHandlerTestDoubles.remoteCreateFile,
    createDirectory: fileHandlerTestDoubles.remoteCreateDirectory,
    rename: fileHandlerTestDoubles.remoteRename,
    move: fileHandlerTestDoubles.remoteMove,
    delete: fileHandlerTestDoubles.remoteDelete,
    exists: fileHandlerTestDoubles.remoteExists,
    listFiles: fileHandlerTestDoubles.remoteListFiles,
    copy: fileHandlerTestDoubles.remoteCopy,
    checkConflicts: fileHandlerTestDoubles.remoteCheckConflicts,
    batchCopy: fileHandlerTestDoubles.remoteBatchCopy,
    batchMove: fileHandlerTestDoubles.remoteBatchMove,
  },
}));

import { cleanupTempFiles, cleanupTempFilesSync, registerFileHandlers } from '../files';

function createSender(id: number) {
  const windowId = id + 100;
  fileHandlerTestDoubles.windows.set(windowId, {
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
    once: vi.fn(),
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  };
}

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

describe('file handlers', () => {
  beforeEach(() => {
    fileHandlerTestDoubles.handlers.clear();
    fileHandlerTestDoubles.windows.clear();
    vi.clearAllMocks();
    fileHandlerTestDoubles.appGetPath.mockReturnValue('/tmp');
    fileHandlerTestDoubles.rmSync.mockReset();
    fileHandlerTestDoubles.remoteIsRemoteVirtualPath.mockImplementation((path: string) =>
      path.startsWith('/__remote__/')
    );
    fileHandlerTestDoubles.iconvEncode.mockReturnValue(Buffer.from('encoded'));
    fileHandlerTestDoubles.iconvDecode.mockReturnValue('decoded');
    fileHandlerTestDoubles.isBinaryFile.mockResolvedValue(false);
    fileHandlerTestDoubles.createSimpleGit.mockReturnValue({
      checkIgnore: fileHandlerTestDoubles.checkIgnore,
    });
    fileHandlerTestDoubles.checkIgnore.mockResolvedValue([]);
    fileHandlerTestDoubles.readdir.mockResolvedValue([]);
    fileHandlerTestDoubles.readFile.mockResolvedValue(Buffer.from('content'));
    fileHandlerTestDoubles.stat.mockResolvedValue(makeStats({ isFile: true, size: 1, mtimeMs: 1 }));

    registerFileHandlers();
  });

  it('saves temp files with sanitized names and rejects invalid filenames', async () => {
    const sender = createSender(1);
    const saveHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_SAVE_TO_TEMP);
    const payload = new Uint8Array([1, 2, 3]);

    const successResult = await saveHandler?.({ sender }, '../image.png', payload);

    expect(successResult).toEqual({
      success: true,
      path: '/tmp/infilux-input/image.png',
    });
    expect(fileHandlerTestDoubles.mkdir).toHaveBeenCalledWith('/tmp/infilux-input', {
      recursive: true,
    });
    expect(fileHandlerTestDoubles.writeFile).toHaveBeenCalledWith(
      '/tmp/infilux-input/image.png',
      Buffer.from(payload)
    );
    expect(fileHandlerTestDoubles.registerAllowedLocalFileRoot).toHaveBeenCalledWith(
      '/tmp/infilux-input',
      1
    );

    const invalidResult = await saveHandler?.({ sender }, '..', payload);
    expect(invalidResult).toEqual({
      success: false,
      error: 'Invalid filename',
    });
  });

  it('returns a descriptive error when saving temp files fails', async () => {
    const sender = createSender(2);
    const saveHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_SAVE_TO_TEMP);
    fileHandlerTestDoubles.writeFile.mockRejectedValueOnce(new Error('disk full'));

    await expect(saveHandler?.({ sender }, 'image.png', new Uint8Array([7]))).resolves.toEqual({
      success: false,
      error: 'disk full',
    });
  });

  it('reads local files as binary, falls back to utf-8 on decode failure, and delegates remote reads', async () => {
    const readHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_READ);
    const remoteResult = { content: 'remote', encoding: 'utf-8', detectedEncoding: 'utf-8' };

    fileHandlerTestDoubles.isBinaryFile.mockResolvedValueOnce(true);
    await expect(readHandler?.({}, '/repo/image.png')).resolves.toEqual({
      content: '',
      encoding: 'binary',
      detectedEncoding: 'binary',
      confidence: 1,
      isBinary: true,
    });

    fileHandlerTestDoubles.readFile.mockResolvedValueOnce(Buffer.from('hello'));
    fileHandlerTestDoubles.iconvDecode.mockImplementationOnce(() => {
      throw new Error('decode failed');
    });
    await expect(readHandler?.({}, '/repo/file.txt')).resolves.toEqual({
      content: 'hello',
      encoding: 'utf-8',
      detectedEncoding: 'utf-8',
      confidence: 0,
    });

    fileHandlerTestDoubles.remoteReadFile.mockResolvedValueOnce(remoteResult);
    await expect(readHandler?.({}, '/__remote__/conn/workspace/file.txt')).resolves.toEqual(
      remoteResult
    );
  });

  it('writes and creates local files with expected encodings and delegates remote operations', async () => {
    const writeHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_WRITE);
    const createHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_CREATE);

    await writeHandler?.({}, '/repo/file.txt', 'hello', 'utf-16le');
    expect(fileHandlerTestDoubles.iconvEncode).toHaveBeenCalledWith('hello', 'utf-16le');
    expect(fileHandlerTestDoubles.writeFile).toHaveBeenCalledWith(
      '/repo/file.txt',
      Buffer.from('encoded')
    );

    await writeHandler?.({}, '/__remote__/conn/workspace/file.txt', 'remote');
    expect(fileHandlerTestDoubles.remoteWriteFile).toHaveBeenCalledWith(
      '/__remote__/conn/workspace/file.txt',
      'remote'
    );

    await createHandler?.({}, '/repo/new/file.txt', 'seed', { overwrite: false });
    expect(fileHandlerTestDoubles.mkdir).toHaveBeenCalledWith('/repo/new', { recursive: true });
    expect(fileHandlerTestDoubles.writeFile).toHaveBeenCalledWith('/repo/new/file.txt', 'seed', {
      encoding: 'utf-8',
      flag: 'wx',
    });

    await createHandler?.({}, '/__remote__/conn/workspace/new.txt', 'remote-seed', {
      overwrite: true,
    });
    expect(fileHandlerTestDoubles.remoteCreateFile).toHaveBeenCalledWith(
      '/__remote__/conn/workspace/new.txt',
      'remote-seed',
      { overwrite: true }
    );
  });

  it('reports local file existence correctly and delegates remote existence checks', async () => {
    const existsHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_EXISTS);

    fileHandlerTestDoubles.stat.mockResolvedValueOnce(makeStats({ isFile: true }));
    await expect(existsHandler?.({}, '/repo/a.ts')).resolves.toBe(true);

    fileHandlerTestDoubles.stat.mockResolvedValueOnce(makeStats({ isDirectory: true }));
    await expect(existsHandler?.({}, '/repo/dir')).resolves.toBe(false);

    fileHandlerTestDoubles.stat.mockRejectedValueOnce(new Error('missing'));
    await expect(existsHandler?.({}, '/repo/missing.ts')).resolves.toBe(false);

    fileHandlerTestDoubles.remoteExists.mockResolvedValueOnce(true);
    await expect(existsHandler?.({}, '/__remote__/conn/workspace/a.ts')).resolves.toBe(true);
  });

  it('lists local files, sorts directories first, and marks ignored entries', async () => {
    const sender = createSender(3);
    const listHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_LIST);

    fileHandlerTestDoubles.readdir.mockResolvedValueOnce(['b.ts', 'dir', 'skip.ts', 'gone.ts']);
    fileHandlerTestDoubles.stat.mockImplementation(async (path: string) => {
      if (path.endsWith('/b.ts')) {
        return makeStats({ isFile: true, size: 10, mtimeMs: 100 });
      }
      if (path.endsWith('/dir')) {
        return makeStats({ isDirectory: true, size: 0, mtimeMs: 200 });
      }
      if (path.endsWith('/skip.ts')) {
        return makeStats({ isFile: true, size: 20, mtimeMs: 300 });
      }
      throw new Error('stat failed');
    });
    fileHandlerTestDoubles.checkIgnore.mockResolvedValueOnce(['skip.ts']);

    const result = await listHandler?.({ sender }, '/repo', '/repo');

    expect(result).toEqual([
      {
        name: 'dir',
        path: '/repo/dir',
        isDirectory: true,
        size: 0,
        modifiedAt: 200,
        ignored: false,
      },
      {
        name: 'b.ts',
        path: '/repo/b.ts',
        isDirectory: false,
        size: 10,
        modifiedAt: 100,
        ignored: false,
      },
      {
        name: 'skip.ts',
        path: '/repo/skip.ts',
        isDirectory: false,
        size: 20,
        modifiedAt: 300,
        ignored: true,
      },
    ]);
    expect(fileHandlerTestDoubles.registerAllowedLocalFileRoot).toHaveBeenCalledWith('/repo', 3);
  });

  it('recovers prefixed absolute local paths before listing directory contents', async () => {
    const sender = createSender(4);
    const listHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_LIST);

    fileHandlerTestDoubles.readdir.mockResolvedValueOnce([]);

    await listHandler?.(
      { sender },
      '/Users/tanzv/Development/Git/EnsoAI//Users/tanzv/Development/Git/penpad/apps'
    );

    expect(fileHandlerTestDoubles.readdir).toHaveBeenCalledWith(
      '/Users/tanzv/Development/Git/penpad/apps'
    );
  });

  it('reveals local files, rejects remote reveal, copies local files, and rejects mixed copy', async () => {
    const revealHandler = fileHandlerTestDoubles.handlers.get(
      IPC_CHANNELS.FILE_REVEAL_IN_FILE_MANAGER
    );
    const copyHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_COPY);

    await revealHandler?.({}, '/repo/file.txt');
    expect(fileHandlerTestDoubles.shellShowItemInFolder).toHaveBeenCalledWith('/repo/file.txt');

    await expect(revealHandler?.({}, '/__remote__/conn/workspace/file.txt')).rejects.toThrow(
      'Reveal in file manager is not supported for remote files'
    );

    fileHandlerTestDoubles.stat.mockResolvedValueOnce(makeStats({ isFile: true }));
    await copyHandler?.({}, '/repo/source.txt', '/repo/target.txt');
    expect(fileHandlerTestDoubles.mkdir).toHaveBeenCalledWith('/repo', { recursive: true });
    expect(fileHandlerTestDoubles.copyFile).toHaveBeenCalledWith(
      '/repo/source.txt',
      '/repo/target.txt'
    );

    await expect(
      copyHandler?.({}, '/repo/local.txt', '/__remote__/conn/workspace/remote.txt')
    ).rejects.toThrow('Copying between local and remote files is not supported');
  });

  it('copies remote files remotely and recursively copies local directories', async () => {
    const copyHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_COPY);

    await copyHandler?.({}, '/__remote__/conn/source', '/__remote__/conn/target');
    expect(fileHandlerTestDoubles.remoteCopy).toHaveBeenCalledWith(
      '/__remote__/conn/source',
      '/__remote__/conn/target'
    );

    fileHandlerTestDoubles.stat.mockResolvedValueOnce(makeStats({ isDirectory: true }));
    fileHandlerTestDoubles.readdir
      .mockResolvedValueOnce([
        {
          name: 'nested-dir',
          isDirectory: () => true,
        } as never,
        {
          name: 'nested.txt',
          isDirectory: () => false,
        } as never,
      ])
      .mockResolvedValueOnce([
        {
          name: 'deep.txt',
          isDirectory: () => false,
        } as never,
      ]);

    await copyHandler?.({}, '/repo/dir-source', '/repo/dir-target');
    expect(fileHandlerTestDoubles.mkdir).toHaveBeenCalledWith('/repo/dir-target', {
      recursive: true,
    });
    expect(fileHandlerTestDoubles.mkdir).toHaveBeenCalledWith('/repo/dir-target/nested-dir', {
      recursive: true,
    });
    expect(fileHandlerTestDoubles.copyFile).toHaveBeenCalledWith(
      '/repo/dir-source/nested.txt',
      '/repo/dir-target/nested.txt'
    );
    expect(fileHandlerTestDoubles.copyFile).toHaveBeenCalledWith(
      '/repo/dir-source/nested-dir/deep.txt',
      '/repo/dir-target/nested-dir/deep.txt'
    );
  });

  it('checks local conflicts, delegates remote conflicts, and rejects mixed conflict detection', async () => {
    const conflictHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_CHECK_CONFLICTS);

    fileHandlerTestDoubles.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/repo/source-a.txt') {
        return makeStats({ isFile: true, size: 10, mtimeMs: 100 });
      }
      if (targetPath === '/repo/source-b.txt') {
        return makeStats({ isFile: true, size: 20, mtimeMs: 200 });
      }
      if (targetPath === '/target/source-a.txt') {
        return makeStats({ isFile: true, size: 30, mtimeMs: 300 });
      }
      throw new Error('missing');
    });

    await expect(
      conflictHandler?.({}, ['/repo/source-a.txt', '/repo/source-b.txt'], '/target')
    ).resolves.toEqual([
      {
        path: '/repo/source-a.txt',
        name: 'source-a.txt',
        sourceSize: 10,
        targetSize: 30,
        sourceModified: 100,
        targetModified: 300,
      },
    ]);

    fileHandlerTestDoubles.remoteCheckConflicts.mockResolvedValueOnce([{ path: 'remote' }]);
    await expect(
      conflictHandler?.(
        {},
        ['/__remote__/conn/source-a.txt', '/__remote__/conn/source-b.txt'],
        '/__remote__/conn/target'
      )
    ).resolves.toEqual([{ path: 'remote' }]);

    await expect(
      conflictHandler?.({}, ['/repo/source-a.txt'], '/__remote__/conn/target')
    ).rejects.toThrow('Conflict detection between local and remote files is not supported');
  });

  it('batch copies local files with skip, rename, remote delegation, and failure reporting', async () => {
    const batchCopyHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_BATCH_COPY);

    fileHandlerTestDoubles.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/repo/a.txt') {
        return makeStats({ isFile: true });
      }
      if (targetPath === '/repo/b.txt') {
        return makeStats({ isDirectory: true });
      }
      if (targetPath === '/repo/c.txt') {
        return makeStats({ isFile: true });
      }
      throw new Error('missing source');
    });
    fileHandlerTestDoubles.readdir.mockResolvedValueOnce([
      {
        name: 'nested.ts',
        isDirectory: () => false,
      } as never,
    ]);
    fileHandlerTestDoubles.copyFile.mockImplementation(async (sourcePath: string) => {
      if (sourcePath === '/repo/c.txt') {
        throw new Error('copy failed');
      }
    });

    await expect(
      batchCopyHandler?.({}, ['/repo/a.txt', '/repo/b.txt', '/repo/c.txt'], '/target', [
        { path: '/repo/a.txt', action: 'rename', newName: 'renamed-a.txt' },
        { path: '/repo/b.txt', action: 'skip' },
      ])
    ).resolves.toEqual({
      success: ['/repo/a.txt'],
      failed: [{ path: '/repo/c.txt', error: 'copy failed' }],
    });

    expect(fileHandlerTestDoubles.copyFile).toHaveBeenCalledWith(
      '/repo/a.txt',
      '/target/renamed-a.txt'
    );

    fileHandlerTestDoubles.remoteBatchCopy.mockResolvedValueOnce({
      success: ['/__remote__/conn/a.txt'],
      failed: [],
    });
    await expect(
      batchCopyHandler?.({}, ['/__remote__/conn/a.txt'], '/__remote__/conn/target', [
        { path: '/__remote__/conn/a.txt', action: 'replace' },
      ])
    ).resolves.toEqual({
      success: ['/__remote__/conn/a.txt'],
      failed: [],
    });

    await expect(
      batchCopyHandler?.({}, ['/repo/a.txt'], '/__remote__/conn/target', [])
    ).rejects.toThrow('Batch copy between local and remote files is not supported');
  });

  it('batch moves with replace cleanup, rename fallback, remote delegation, and mixed rejection', async () => {
    const batchMoveHandler = fileHandlerTestDoubles.handlers.get(IPC_CHANNELS.FILE_BATCH_MOVE);

    fileHandlerTestDoubles.rename.mockImplementation(async (fromPath: string) => {
      if (fromPath === '/repo/fallback.txt') {
        throw new Error('cross-device link');
      }
    });
    fileHandlerTestDoubles.stat.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/repo/replace.txt') {
        return makeStats({ isFile: true });
      }
      if (targetPath === '/repo/fallback.txt') {
        return makeStats({ isFile: true });
      }
      throw new Error('missing');
    });

    await expect(
      batchMoveHandler?.(
        {},
        ['/repo/replace.txt', '/repo/fallback.txt', '/repo/skip.txt'],
        '/target',
        [
          { path: '/repo/replace.txt', action: 'replace' },
          { path: '/repo/skip.txt', action: 'skip' },
        ]
      )
    ).resolves.toEqual({
      success: ['/repo/replace.txt', '/repo/fallback.txt'],
      failed: [],
    });

    expect(fileHandlerTestDoubles.rm).toHaveBeenCalledWith('/target/replace.txt', {
      recursive: true,
      force: true,
    });
    expect(fileHandlerTestDoubles.copyFile).toHaveBeenCalledWith(
      '/repo/fallback.txt',
      '/target/fallback.txt'
    );
    expect(fileHandlerTestDoubles.rm).toHaveBeenCalledWith('/repo/fallback.txt', {
      recursive: true,
      force: true,
    });

    fileHandlerTestDoubles.remoteBatchMove.mockResolvedValueOnce({
      success: ['/__remote__/conn/move.txt'],
      failed: [],
    });
    await expect(
      batchMoveHandler?.({}, ['/__remote__/conn/move.txt'], '/__remote__/conn/target', [
        { path: '/__remote__/conn/move.txt', action: 'replace' },
      ])
    ).resolves.toEqual({
      success: ['/__remote__/conn/move.txt'],
      failed: [],
    });

    await expect(
      batchMoveHandler?.({}, ['/repo/local.txt'], '/__remote__/conn/target', [])
    ).rejects.toThrow('Batch move between local and remote files is not supported');
  });

  it('cleans up temp files asynchronously and synchronously without throwing on failures', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await cleanupTempFiles();
    expect(fileHandlerTestDoubles.rm).toHaveBeenCalledWith('/tmp/infilux-input', {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    expect(consoleLog).toHaveBeenCalledWith(
      '[files] Cleaned up temp directory:',
      '/tmp/infilux-input'
    );

    fileHandlerTestDoubles.rm.mockRejectedValueOnce(new Error('busy'));
    await cleanupTempFiles();
    expect(consoleWarn).toHaveBeenCalledWith(
      '[files] Failed to cleanup temp files:',
      expect.any(Error)
    );

    cleanupTempFilesSync();
    expect(fileHandlerTestDoubles.rmSync).toHaveBeenCalledWith('/tmp/infilux-input', {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });

    fileHandlerTestDoubles.rmSync.mockImplementationOnce(() => {
      throw new Error('sync busy');
    });
    cleanupTempFilesSync();
    expect(consoleWarn).toHaveBeenCalledWith(
      '[files] Failed to cleanup temp files (sync):',
      expect.any(Error)
    );
  });
});
