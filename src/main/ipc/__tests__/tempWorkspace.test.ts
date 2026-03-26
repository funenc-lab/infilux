import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FsDirStat = {
  isSymbolicLink: () => boolean;
};

const tempWorkspaceTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const randomUUID = vi.fn(() => 'uuid-1');
  const homedir = vi.fn(() => '/Users/tester');
  const access = vi.fn(async () => undefined);
  const lstat = vi.fn(async () => ({ isSymbolicLink: () => false }) as FsDirStat);
  const mkdir = vi.fn(async () => undefined);
  const realpath = vi.fn(async (input: string) => input);
  const rm = vi.fn(async () => undefined);
  const writeFile = vi.fn(async () => undefined);
  const gitInit = vi.fn(async () => undefined);
  const stopWatchersInDirectory = vi.fn(async () => undefined);
  const killByWorkdir = vi.fn(async () => undefined);
  const unregisterAuthorizedWorkdir = vi.fn();

  return {
    handlers,
    randomUUID,
    homedir,
    access,
    lstat,
    mkdir,
    realpath,
    rm,
    writeFile,
    gitInit,
    stopWatchersInDirectory,
    killByWorkdir,
    unregisterAuthorizedWorkdir,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      tempWorkspaceTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: tempWorkspaceTestDoubles.randomUUID,
}));

vi.mock('node:os', () => ({
  homedir: tempWorkspaceTestDoubles.homedir,
}));

vi.mock('node:fs/promises', () => ({
  access: tempWorkspaceTestDoubles.access,
  lstat: tempWorkspaceTestDoubles.lstat,
  mkdir: tempWorkspaceTestDoubles.mkdir,
  realpath: tempWorkspaceTestDoubles.realpath,
  rm: tempWorkspaceTestDoubles.rm,
  writeFile: tempWorkspaceTestDoubles.writeFile,
}));

vi.mock('../../services/git/GitService', () => ({
  GitService: class {
    init() {
      return tempWorkspaceTestDoubles.gitInit();
    }
  },
}));

vi.mock('../../services/session/SessionManager', () => ({
  sessionManager: {
    killByWorkdir: tempWorkspaceTestDoubles.killByWorkdir,
  },
}));

vi.mock('../files', () => ({
  stopWatchersInDirectory: tempWorkspaceTestDoubles.stopWatchersInDirectory,
}));

vi.mock('../git', () => ({
  unregisterAuthorizedWorkdir: tempWorkspaceTestDoubles.unregisterAuthorizedWorkdir,
}));

describe('temp workspace handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T01:02:03.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    tempWorkspaceTestDoubles.handlers.clear();
    vi.clearAllMocks();
    tempWorkspaceTestDoubles.randomUUID.mockReset();
    tempWorkspaceTestDoubles.randomUUID.mockReturnValue('uuid-1');
    tempWorkspaceTestDoubles.homedir.mockReset();
    tempWorkspaceTestDoubles.homedir.mockReturnValue('/Users/tester');
    tempWorkspaceTestDoubles.access.mockReset();
    tempWorkspaceTestDoubles.access.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.lstat.mockReset();
    tempWorkspaceTestDoubles.lstat.mockResolvedValue({ isSymbolicLink: () => false } as FsDirStat);
    tempWorkspaceTestDoubles.mkdir.mockReset();
    tempWorkspaceTestDoubles.mkdir.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.realpath.mockReset();
    tempWorkspaceTestDoubles.realpath.mockImplementation(async (input: string) => input);
    tempWorkspaceTestDoubles.rm.mockReset();
    tempWorkspaceTestDoubles.rm.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.writeFile.mockReset();
    tempWorkspaceTestDoubles.writeFile.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.gitInit.mockReset();
    tempWorkspaceTestDoubles.gitInit.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.stopWatchersInDirectory.mockReset();
    tempWorkspaceTestDoubles.stopWatchersInDirectory.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.killByWorkdir.mockReset();
    tempWorkspaceTestDoubles.killByWorkdir.mockResolvedValue(undefined);
    tempWorkspaceTestDoubles.unregisterAuthorizedWorkdir.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('checks whether a temp workspace path is writable', async () => {
    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const checkHandler = tempWorkspaceTestDoubles.handlers.get(
      IPC_CHANNELS.TEMP_WORKSPACE_CHECK_PATH
    );
    const result = await checkHandler?.({}, '~/scratch');

    expect(result).toEqual({ ok: true });
    expect(tempWorkspaceTestDoubles.mkdir).toHaveBeenCalledWith('/Users/tester/scratch', {
      recursive: true,
    });
    expect(tempWorkspaceTestDoubles.writeFile).toHaveBeenCalledWith(
      '/Users/tester/scratch/.infilux-permission-uuid-1.tmp',
      'test',
      { encoding: 'utf-8' }
    );
  });

  it('creates a temp workspace, retries name collisions and initializes git', async () => {
    tempWorkspaceTestDoubles.mkdir
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }))
      .mockResolvedValueOnce(undefined);

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const createHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_CREATE);
    const result = await createHandler?.({}, undefined);

    expect(result).toEqual({
      ok: true,
      item: {
        id: '1774400523000-4fzzzx',
        path: '/Users/tester/infilux/temporary/20260325-090203-2',
        folderName: '20260325-090203-2',
        title: '20260325-090203-2',
        createdAt: 1774400523000,
      },
    });
    expect(tempWorkspaceTestDoubles.gitInit).toHaveBeenCalledTimes(1);
  });

  it('returns the base path validation error when the temp root is not writable', async () => {
    tempWorkspaceTestDoubles.access.mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' })
    );

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const createHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_CREATE);
    const result = await createHandler?.({}, '/tmp/read-only');

    expect(result).toEqual({
      ok: false,
      code: 'EACCES',
      message: 'permission denied',
    });
    expect(tempWorkspaceTestDoubles.gitInit).not.toHaveBeenCalled();
  });

  it('cleans up the folder and reports the error when git initialization fails', async () => {
    tempWorkspaceTestDoubles.gitInit.mockRejectedValueOnce(
      Object.assign(new Error('git init failed'), { code: 'GIT_INIT_FAILED' })
    );

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const createHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_CREATE);
    const result = await createHandler?.({}, '/tmp/custom-base');

    expect(result).toEqual({
      ok: false,
      code: 'GIT_INIT_FAILED',
      message: 'git init failed',
    });
    expect(tempWorkspaceTestDoubles.rm.mock.calls).toContainEqual([
      '/tmp/custom-base/20260325-090203',
      expect.objectContaining({
        recursive: true,
        force: true,
      }),
    ]);
  });

  it('removes a direct child temp workspace after stopping dependent resources', async () => {
    const dirPath = '/Users/tester/infilux/temporary/session-a';

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const removeHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE);
    const result = await removeHandler?.({}, dirPath);

    expect(result).toEqual({ ok: true });
    expect(tempWorkspaceTestDoubles.stopWatchersInDirectory).toHaveBeenCalledWith(dirPath);
    expect(tempWorkspaceTestDoubles.killByWorkdir).toHaveBeenCalledWith(dirPath);
    expect(tempWorkspaceTestDoubles.unregisterAuthorizedWorkdir).toHaveBeenCalledWith(dirPath);
    expect(tempWorkspaceTestDoubles.rm).toHaveBeenCalledWith(
      dirPath,
      expect.objectContaining({
        recursive: true,
        force: true,
      })
    );
  });

  it('rejects temp workspace removal outside the managed base path', async () => {
    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const removeHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE);
    const result = await removeHandler?.({}, '/tmp/not-managed');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PATH',
      message: 'Path is outside the temp workspace directory',
    });
    expect(tempWorkspaceTestDoubles.stopWatchersInDirectory).not.toHaveBeenCalled();
  });

  it('rejects nested paths and only allows removing direct children', async () => {
    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const removeHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE);
    const result = await removeHandler?.({}, '/Users/tester/infilux/temporary/group/session-a');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PATH',
      message: 'Only direct children can be removed',
    });
  });

  it('rejects removal when the target path changes during the operation', async () => {
    tempWorkspaceTestDoubles.realpath
      .mockResolvedValueOnce('/Users/tester/infilux/temporary')
      .mockResolvedValueOnce('/Users/tester/infilux/temporary/session-c')
      .mockResolvedValueOnce('/Users/tester/infilux/temporary/session-c-moved');

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const removeHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE);
    const result = await removeHandler?.({}, '/Users/tester/infilux/temporary/session-c');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PATH',
      message: 'Path changed during removal',
    });
  });

  it('rejects symlink paths during removal', async () => {
    tempWorkspaceTestDoubles.lstat.mockResolvedValueOnce({
      isSymbolicLink: () => true,
    } satisfies FsDirStat);

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const removeHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE);
    const result = await removeHandler?.({}, '/Users/tester/infilux/temporary/session-link');

    expect(result).toEqual({
      ok: false,
      code: 'INVALID_PATH',
      message: 'Symlink paths are not allowed',
    });
  });

  it('retries transient remove errors before succeeding', async () => {
    tempWorkspaceTestDoubles.rm
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }))
      .mockResolvedValueOnce(undefined);

    const { registerTempWorkspaceHandlers } = await import('../tempWorkspace');
    registerTempWorkspaceHandlers();

    const removeHandler = tempWorkspaceTestDoubles.handlers.get(IPC_CHANNELS.TEMP_WORKSPACE_REMOVE);
    const resultPromise = removeHandler?.({}, '/Users/tester/infilux/temporary/session-b');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ ok: true });
    expect(tempWorkspaceTestDoubles.rm).toHaveBeenNthCalledWith(
      1,
      '/Users/tester/infilux/temporary/session-b',
      expect.objectContaining({
        recursive: true,
        force: true,
      })
    );
  });
});
