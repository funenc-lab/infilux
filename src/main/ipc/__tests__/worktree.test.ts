import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

type WorktreeServiceMock = {
  workdir: string;
  list: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  merge: ReturnType<typeof vi.fn>;
  getMergeState: ReturnType<typeof vi.fn>;
  getConflicts: ReturnType<typeof vi.fn>;
  getConflictContent: ReturnType<typeof vi.fn>;
  resolveConflict: ReturnType<typeof vi.fn>;
  abortMerge: ReturnType<typeof vi.fn>;
  continueMerge: ReturnType<typeof vi.fn>;
};

const worktreeTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const serviceInstances = new Map<string, WorktreeServiceMock>();
  const serviceConstructCount = new Map<string, number>();

  function createService(workdir: string): WorktreeServiceMock {
    return {
      workdir,
      list: vi.fn(async () => [{ path: `${workdir}/main` }, { path: `${workdir}/feature-a` }]),
      add: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      merge: vi.fn(async () => ({ success: true, source: workdir })),
      getMergeState: vi.fn(async () => ({ inProgress: false, workdir })),
      getConflicts: vi.fn(async () => [{ path: 'src/conflict.ts' }]),
      getConflictContent: vi.fn(async () => ({ current: 'ours', incoming: 'theirs' })),
      resolveConflict: vi.fn(async () => undefined),
      abortMerge: vi.fn(async () => undefined),
      continueMerge: vi.fn(async () => ({ completed: true, workdir })),
    };
  }

  const getService = vi.fn((workdir: string) => {
    const nextCount = (serviceConstructCount.get(workdir) ?? 0) + 1;
    serviceConstructCount.set(workdir, nextCount);

    const service = createService(workdir);
    serviceInstances.set(workdir, service);
    return service;
  });

  const updateClaudeWorkspaceFolders = vi.fn();
  const clearWorktrees = vi.fn();
  const registerWorktree = vi.fn();
  const unregisterWorktree = vi.fn();
  const isRemoteVirtualPath = vi.fn((input: string) => input.startsWith('/__remote__/'));
  const stopWatchersInDirectory = vi.fn(async () => undefined);
  const killByWorkdir = vi.fn(async () => undefined);

  const remoteRepositoryBackend = {
    listWorktrees: vi.fn(async (workdir: string) => [{ path: `${workdir}/remote-main` }]),
    addWorktree: vi.fn(async () => undefined),
    removeWorktree: vi.fn(async () => undefined),
    mergeWorktree: vi.fn(async () => ({ success: true, remote: true })),
    getMergeState: vi.fn(async () => ({ inProgress: true, remote: true })),
    getConflicts: vi.fn(async () => [{ path: 'remote/conflict.ts' }]),
    getConflictContent: vi.fn(async () => ({ remote: true, filePath: 'remote/conflict.ts' })),
    resolveConflict: vi.fn(async () => undefined),
    abortMerge: vi.fn(async () => undefined),
    continueMerge: vi.fn(async () => ({ completed: true, remote: true })),
  };

  function reset() {
    handlers.clear();
    serviceInstances.clear();
    serviceConstructCount.clear();

    getService.mockClear();

    updateClaudeWorkspaceFolders.mockReset();
    clearWorktrees.mockReset();
    registerWorktree.mockReset();
    unregisterWorktree.mockReset();
    isRemoteVirtualPath.mockReset();
    isRemoteVirtualPath.mockImplementation((input: string) => input.startsWith('/__remote__/'));
    stopWatchersInDirectory.mockReset();
    stopWatchersInDirectory.mockResolvedValue(undefined);
    killByWorkdir.mockReset();
    killByWorkdir.mockResolvedValue(undefined);

    remoteRepositoryBackend.listWorktrees.mockReset();
    remoteRepositoryBackend.listWorktrees.mockImplementation(async (workdir: string) => [
      { path: `${workdir}/remote-main` },
    ]);
    remoteRepositoryBackend.addWorktree.mockReset();
    remoteRepositoryBackend.addWorktree.mockResolvedValue(undefined);
    remoteRepositoryBackend.removeWorktree.mockReset();
    remoteRepositoryBackend.removeWorktree.mockResolvedValue(undefined);
    remoteRepositoryBackend.mergeWorktree.mockReset();
    remoteRepositoryBackend.mergeWorktree.mockResolvedValue({ success: true, remote: true });
    remoteRepositoryBackend.getMergeState.mockReset();
    remoteRepositoryBackend.getMergeState.mockResolvedValue({ inProgress: true, remote: true });
    remoteRepositoryBackend.getConflicts.mockReset();
    remoteRepositoryBackend.getConflicts.mockResolvedValue([{ path: 'remote/conflict.ts' }]);
    remoteRepositoryBackend.getConflictContent.mockReset();
    remoteRepositoryBackend.getConflictContent.mockResolvedValue({
      remote: true,
      filePath: 'remote/conflict.ts',
    });
    remoteRepositoryBackend.resolveConflict.mockReset();
    remoteRepositoryBackend.resolveConflict.mockResolvedValue(undefined);
    remoteRepositoryBackend.abortMerge.mockReset();
    remoteRepositoryBackend.abortMerge.mockResolvedValue(undefined);
    remoteRepositoryBackend.continueMerge.mockReset();
    remoteRepositoryBackend.continueMerge.mockResolvedValue({ completed: true, remote: true });
  }

  return {
    handlers,
    serviceInstances,
    serviceConstructCount,
    getService,
    updateClaudeWorkspaceFolders,
    clearWorktrees,
    registerWorktree,
    unregisterWorktree,
    isRemoteVirtualPath,
    stopWatchersInDirectory,
    killByWorkdir,
    remoteRepositoryBackend,
    reset,
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      worktreeTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/claude/ClaudeIdeBridge', () => ({
  updateClaudeWorkspaceFolders: worktreeTestDoubles.updateClaudeWorkspaceFolders,
}));

vi.mock('../../services/git/GitAutoFetchService', () => ({
  gitAutoFetchService: {
    clearWorktrees: worktreeTestDoubles.clearWorktrees,
    registerWorktree: worktreeTestDoubles.registerWorktree,
    unregisterWorktree: worktreeTestDoubles.unregisterWorktree,
  },
}));

vi.mock('../../services/git/WorktreeService', () => ({
  WorktreeService: class {
    constructor(workdir: string) {
      Object.assign(this, worktreeTestDoubles.getService(workdir));
    }
  },
}));

vi.mock('../../services/remote/RemotePath', () => ({
  isRemoteVirtualPath: worktreeTestDoubles.isRemoteVirtualPath,
}));

vi.mock('../../services/remote/RemoteRepositoryBackend', () => ({
  remoteRepositoryBackend: worktreeTestDoubles.remoteRepositoryBackend,
}));

vi.mock('../../services/session/SessionManager', () => ({
  sessionManager: {
    killByWorkdir: worktreeTestDoubles.killByWorkdir,
  },
}));

vi.mock('../files', () => ({
  stopWatchersInDirectory: worktreeTestDoubles.stopWatchersInDirectory,
}));

function getHandler(channel: string) {
  const handler = worktreeTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('worktree IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    worktreeTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists local worktrees, caches services and refreshes auto-fetch registrations', async () => {
    const { clearWorktreeService, registerWorktreeHandlers } = await import('../worktree');
    registerWorktreeHandlers();

    const listHandler = getHandler(IPC_CHANNELS.WORKTREE_LIST);

    expect(await listHandler({}, '/repo')).toEqual([
      { path: '/repo/main' },
      { path: '/repo/feature-a' },
    ]);
    expect(await listHandler({}, '/repo')).toEqual([
      { path: '/repo/main' },
      { path: '/repo/feature-a' },
    ]);
    expect(worktreeTestDoubles.getService).toHaveBeenCalledTimes(1);
    expect(worktreeTestDoubles.clearWorktrees).toHaveBeenCalledTimes(2);
    expect(worktreeTestDoubles.registerWorktree).toHaveBeenNthCalledWith(1, '/repo/main');
    expect(worktreeTestDoubles.registerWorktree).toHaveBeenNthCalledWith(2, '/repo/feature-a');

    clearWorktreeService('/repo');
    expect(await listHandler({}, '/repo')).toEqual([
      { path: '/repo/main' },
      { path: '/repo/feature-a' },
    ]);
    expect(worktreeTestDoubles.getService).toHaveBeenCalledTimes(2);
  });

  it('delegates remote list and add operations without constructing local services', async () => {
    const { registerWorktreeHandlers } = await import('../worktree');
    registerWorktreeHandlers();

    const listHandler = getHandler(IPC_CHANNELS.WORKTREE_LIST);
    const addHandler = getHandler(IPC_CHANNELS.WORKTREE_ADD);

    expect(await listHandler({}, '/__remote__/repo')).toEqual([
      { path: '/__remote__/repo/remote-main' },
    ]);
    await addHandler({}, '/__remote__/repo', {
      path: '/__remote__/repo/new-worktree',
      branch: 'feature/remote',
    });

    expect(worktreeTestDoubles.remoteRepositoryBackend.listWorktrees).toHaveBeenCalledWith(
      '/__remote__/repo'
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.addWorktree).toHaveBeenCalledWith(
      '/__remote__/repo',
      {
        path: '/__remote__/repo/new-worktree',
        branch: 'feature/remote',
      }
    );
    expect(worktreeTestDoubles.getService).not.toHaveBeenCalled();
  });

  it('adds and removes local worktrees after stopping dependent resources', async () => {
    vi.useFakeTimers();

    const { registerWorktreeHandlers } = await import('../worktree');
    registerWorktreeHandlers();

    const addHandler = getHandler(IPC_CHANNELS.WORKTREE_ADD);
    const removeHandler = getHandler(IPC_CHANNELS.WORKTREE_REMOVE);

    await addHandler({}, '/repo', {
      path: '/repo/feature-b',
      branch: 'feature/b',
    });
    expect(worktreeTestDoubles.serviceInstances.get('/repo')?.add).toHaveBeenCalledWith({
      path: '/repo/feature-b',
      branch: 'feature/b',
    });

    const removePromise = removeHandler({}, '/repo', {
      path: '/repo/feature-b',
      force: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(worktreeTestDoubles.stopWatchersInDirectory).toHaveBeenCalledWith('/repo/feature-b');
    expect(worktreeTestDoubles.killByWorkdir).toHaveBeenCalledWith('/repo/feature-b');
    expect(worktreeTestDoubles.serviceInstances.get('/repo')?.remove).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await removePromise;

    expect(worktreeTestDoubles.unregisterWorktree).toHaveBeenCalledWith('/repo/feature-b');
    expect(worktreeTestDoubles.serviceInstances.get('/repo')?.remove).toHaveBeenCalledWith({
      path: '/repo/feature-b',
      force: true,
    });

    vi.useRealTimers();
  });

  it('removes remote worktrees without local service cleanup delays', async () => {
    const { registerWorktreeHandlers } = await import('../worktree');
    registerWorktreeHandlers();

    const removeHandler = getHandler(IPC_CHANNELS.WORKTREE_REMOVE);

    await removeHandler({}, '/__remote__/repo', {
      path: '/__remote__/repo/feature-c',
      force: false,
    });

    expect(worktreeTestDoubles.stopWatchersInDirectory).toHaveBeenCalledWith(
      '/__remote__/repo/feature-c'
    );
    expect(worktreeTestDoubles.killByWorkdir).toHaveBeenCalledWith('/__remote__/repo/feature-c');
    expect(worktreeTestDoubles.remoteRepositoryBackend.removeWorktree).toHaveBeenCalledWith(
      '/__remote__/repo',
      {
        path: '/__remote__/repo/feature-c',
        force: false,
      }
    );
    expect(worktreeTestDoubles.unregisterWorktree).not.toHaveBeenCalled();
    expect(worktreeTestDoubles.getService).not.toHaveBeenCalled();
  });

  it('filters remote paths when activating Claude workspaces', async () => {
    const { registerWorktreeHandlers } = await import('../worktree');
    registerWorktreeHandlers();

    const activateHandler = getHandler(IPC_CHANNELS.WORKTREE_ACTIVATE);

    await activateHandler({}, ['/repo/main', '/__remote__/repo/branch', '/repo/feature']);

    expect(worktreeTestDoubles.updateClaudeWorkspaceFolders).toHaveBeenCalledWith([
      '/repo/main',
      '/repo/feature',
    ]);
  });

  it('delegates merge lifecycle handlers for local and remote repositories', async () => {
    const { clearAllWorktreeServices, registerWorktreeHandlers } = await import('../worktree');
    registerWorktreeHandlers();

    const mergeHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE);
    const mergeStateHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE_STATE);
    const mergeConflictsHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE_CONFLICTS);
    const mergeConflictContentHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE_CONFLICT_CONTENT);
    const mergeResolveHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE_RESOLVE);
    const mergeAbortHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE_ABORT);
    const mergeContinueHandler = getHandler(IPC_CHANNELS.WORKTREE_MERGE_CONTINUE);

    expect(
      await mergeHandler({}, '/repo', { sourcePath: '/repo/feature-a', targetBranch: 'main' })
    ).toEqual({ success: true, source: '/repo' });
    expect(await mergeStateHandler({}, '/repo')).toEqual({ inProgress: false, workdir: '/repo' });
    expect(await mergeConflictsHandler({}, '/repo')).toEqual([{ path: 'src/conflict.ts' }]);
    expect(await mergeConflictContentHandler({}, '/repo', 'src/conflict.ts')).toEqual({
      current: 'ours',
      incoming: 'theirs',
    });
    await mergeResolveHandler({}, '/repo', { path: 'src/conflict.ts', content: 'resolved' });
    await mergeAbortHandler({}, '/repo');
    expect(
      await mergeContinueHandler({}, '/repo', 'merge message', { removeWorktree: true })
    ).toEqual({
      completed: true,
      workdir: '/repo',
    });

    const localService = worktreeTestDoubles.serviceInstances.get('/repo');
    expect(localService?.merge).toHaveBeenCalledWith({
      sourcePath: '/repo/feature-a',
      targetBranch: 'main',
    });
    expect(localService?.getMergeState).toHaveBeenCalledWith('/repo');
    expect(localService?.getConflicts).toHaveBeenCalledWith('/repo');
    expect(localService?.getConflictContent).toHaveBeenCalledWith('/repo', 'src/conflict.ts');
    expect(localService?.resolveConflict).toHaveBeenCalledWith('/repo', {
      path: 'src/conflict.ts',
      content: 'resolved',
    });
    expect(localService?.abortMerge).toHaveBeenCalledWith('/repo');
    expect(localService?.continueMerge).toHaveBeenCalledWith('/repo', 'merge message', {
      removeWorktree: true,
    });

    expect(
      await mergeHandler({}, '/__remote__/repo', {
        sourcePath: '/__remote__/repo/feature-a',
        targetBranch: 'main',
      })
    ).toEqual({ success: true, remote: true });
    expect(await mergeStateHandler({}, '/__remote__/repo')).toEqual({
      inProgress: true,
      remote: true,
    });
    expect(await mergeConflictsHandler({}, '/__remote__/repo')).toEqual([
      { path: 'remote/conflict.ts' },
    ]);
    expect(await mergeConflictContentHandler({}, '/__remote__/repo', 'remote/conflict.ts')).toEqual(
      {
        remote: true,
        filePath: 'remote/conflict.ts',
      }
    );
    await mergeResolveHandler({}, '/__remote__/repo', {
      path: 'remote/conflict.ts',
      content: 'remote resolved',
    });
    await mergeAbortHandler({}, '/__remote__/repo');
    expect(
      await mergeContinueHandler({}, '/__remote__/repo', undefined, { removeWorktree: false })
    ).toEqual({
      completed: true,
      remote: true,
    });

    expect(worktreeTestDoubles.remoteRepositoryBackend.mergeWorktree).toHaveBeenCalledWith(
      '/__remote__/repo',
      {
        sourcePath: '/__remote__/repo/feature-a',
        targetBranch: 'main',
      }
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.getMergeState).toHaveBeenCalledWith(
      '/__remote__/repo'
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.getConflicts).toHaveBeenCalledWith(
      '/__remote__/repo'
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.getConflictContent).toHaveBeenCalledWith(
      '/__remote__/repo',
      'remote/conflict.ts'
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.resolveConflict).toHaveBeenCalledWith(
      '/__remote__/repo',
      {
        path: 'remote/conflict.ts',
        content: 'remote resolved',
      }
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.abortMerge).toHaveBeenCalledWith(
      '/__remote__/repo'
    );
    expect(worktreeTestDoubles.remoteRepositoryBackend.continueMerge).toHaveBeenCalledWith(
      '/__remote__/repo',
      undefined,
      { removeWorktree: false }
    );

    clearAllWorktreeServices();
    expect(await mergeStateHandler({}, '/repo')).toEqual({ inProgress: false, workdir: '/repo' });
    expect(worktreeTestDoubles.getService).toHaveBeenCalledTimes(2);
  });
});
