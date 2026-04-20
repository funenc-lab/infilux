import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockStats = {
  isDirectory: () => boolean;
  isFile: () => boolean;
};

const gitAutoFetchTestDoubles = vi.hoisted(() => {
  const existsSync = vi.fn();
  const statSync = vi.fn();
  const readFileSync = vi.fn();
  const watch = vi.fn();
  const fetch = vi.fn();
  const listSubmodules = vi.fn();
  const fetchSubmodule = vi.fn();
  const GitService = vi.fn();

  const directories = new Set<string>();
  const files = new Map<string, string>();

  function createMissingPathError(target: string): NodeJS.ErrnoException {
    const error = new Error(
      `ENOENT: no such file or directory, stat '${target}'`
    ) as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    return error;
  }

  function setDirectory(target: string) {
    directories.add(target);
  }

  function setFile(target: string, content: string) {
    files.set(target, content);
  }

  function updateFile(target: string, content: string) {
    files.set(target, content);
  }

  function reset() {
    existsSync.mockReset();
    statSync.mockReset();
    readFileSync.mockReset();
    watch.mockReset();
    fetch.mockReset();
    listSubmodules.mockReset();
    fetchSubmodule.mockReset();
    GitService.mockReset();
    directories.clear();
    files.clear();

    existsSync.mockImplementation((target: string) => directories.has(target) || files.has(target));
    statSync.mockImplementation((target: string): MockStats => {
      if (directories.has(target)) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        };
      }

      if (files.has(target)) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        };
      }

      throw createMissingPathError(target);
    });
    readFileSync.mockImplementation((target: string) => {
      const content = files.get(target);
      if (content === undefined) {
        throw createMissingPathError(target);
      }
      return content;
    });
    listSubmodules.mockResolvedValue([]);
    fetch.mockResolvedValue(undefined);
    fetchSubmodule.mockResolvedValue(undefined);
    GitService.mockImplementation(() => ({
      fetch,
      listSubmodules,
      fetchSubmodule,
    }));
    watch.mockImplementation(() => ({
      close: vi.fn(),
      on: vi.fn(),
    }));
  }

  return {
    existsSync,
    statSync,
    readFileSync,
    watch,
    fetch,
    listSubmodules,
    fetchSubmodule,
    GitService,
    setDirectory,
    setFile,
    updateFile,
    reset,
  };
});

vi.mock('node:fs', () => ({
  existsSync: gitAutoFetchTestDoubles.existsSync,
  readFileSync: gitAutoFetchTestDoubles.readFileSync,
  statSync: gitAutoFetchTestDoubles.statSync,
  watch: gitAutoFetchTestDoubles.watch,
}));

vi.mock('../GitService', () => ({
  GitService: gitAutoFetchTestDoubles.GitService,
}));

describe('GitAutoFetchService', () => {
  let activeService: { cleanup: () => void } | null = null;

  async function loadGitAutoFetchService() {
    const { gitAutoFetchService } = await import('../GitAutoFetchService');
    activeService = gitAutoFetchService as unknown as { cleanup: () => void };
    return gitAutoFetchService;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    gitAutoFetchTestDoubles.reset();
  });

  afterEach(() => {
    activeService?.cleanup();
    activeService = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('auto fetches worktrees, polls HEAD changes without fs watchers, and cleans up listeners', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const worktreePath = '/repo';
    const gitDirPath = '/repo/.git';
    const headPath = '/repo/.git/HEAD';

    gitAutoFetchTestDoubles.setDirectory(gitDirPath);
    gitAutoFetchTestDoubles.setFile(headPath, 'ref: refs/heads/main\n');
    gitAutoFetchTestDoubles.listSubmodules.mockResolvedValue([
      { path: 'sub-a', initialized: true },
      { path: 'sub-b', initialized: false },
    ]);

    const focusListeners: Array<() => void> = [];
    const send = vi.fn();
    const window = {
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'focus') {
          focusListeners.push(listener);
        }
      }),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send,
      },
    };

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.init(window as never);
    gitAutoFetchService.setEnabled(true);
    gitAutoFetchService.registerWorktree(worktreePath);
    gitAutoFetchService.registerWorktree(worktreePath);

    expect(gitAutoFetchTestDoubles.watch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(gitAutoFetchTestDoubles.GitService).toHaveBeenCalledWith(worktreePath);
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(1);
    expect(gitAutoFetchTestDoubles.fetchSubmodule).toHaveBeenCalledTimes(1);
    expect(gitAutoFetchTestDoubles.fetchSubmodule).toHaveBeenCalledWith('sub-a');
    expect(send).toHaveBeenCalledWith('git:autoFetch:completed', {
      timestamp: expect.any(Number),
      repositoryPaths: ['/repo'],
    });

    focusListeners[0]?.();
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    focusListeners[0]?.();
    await Promise.resolve();
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(2);

    gitAutoFetchTestDoubles.updateFile(headPath, 'ref: refs/heads/feature\n');
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).toHaveBeenCalledTimes(3);

    gitAutoFetchService.cleanup();
    activeService = null;

    expect(window.off).toHaveBeenCalledWith('focus', focusListeners[0]);
    expect(warnSpy).toHaveBeenCalledWith('GitAutoFetchService already initialized');
    expect(vi.getTimerCount()).toBe(0);
  }, 20_000);

  it('handles fetch failures, disabled state, and destroyed windows safely', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const worktreePath = '/repo-b';
    const gitDirPath = '/repo-b/.git';
    const headPath = '/repo-b/.git/HEAD';

    gitAutoFetchTestDoubles.setDirectory(gitDirPath);
    gitAutoFetchTestDoubles.setFile(headPath, 'ref: refs/heads/main\n');

    gitAutoFetchTestDoubles.fetch.mockRejectedValueOnce(new Error('fetch failed'));
    gitAutoFetchTestDoubles.listSubmodules.mockResolvedValueOnce([
      { path: 'sub-a', initialized: true },
    ]);
    gitAutoFetchTestDoubles.fetchSubmodule.mockRejectedValueOnce(new Error('submodule failed'));

    const send = vi.fn();
    const window = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => true),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send,
      },
    };

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.registerWorktree(worktreePath);
    gitAutoFetchService.setEnabled(true);

    const service = gitAutoFetchService as unknown as {
      fetchAll: () => Promise<void>;
      clearWorktrees: () => void;
      unregisterWorktree: (path: string) => void;
    };

    await service.fetchAll();
    expect(debugSpy).toHaveBeenCalledWith(
      `Auto fetch failed for ${worktreePath}:`,
      expect.any(Error)
    );

    gitAutoFetchTestDoubles.fetch.mockResolvedValueOnce(undefined);
    await service.fetchAll();
    expect(debugSpy).toHaveBeenCalledWith(
      'Auto fetch submodule failed for sub-a:',
      expect.any(Error)
    );
    expect(send).not.toHaveBeenCalled();

    gitAutoFetchService.setEnabled(false);
    await service.fetchAll();
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(2);

    service.unregisterWorktree(worktreePath);
    gitAutoFetchService.registerWorktree(worktreePath);
    service.clearWorktrees();
    expect(gitAutoFetchTestDoubles.watch).not.toHaveBeenCalled();
  });

  it('cancels the deferred startup fetch when cleanup runs before the timer fires', async () => {
    const window = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      },
    };

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.setEnabled(true);
    gitAutoFetchService.registerWorktree('/repo-cleanup');
    gitAutoFetchService.cleanup();

    await vi.advanceTimersByTimeAsync(5000);

    expect(gitAutoFetchTestDoubles.fetch).not.toHaveBeenCalled();
  });

  it('fetches each repository root once when multiple worktrees belong to the same repository', async () => {
    const send = vi.fn();
    const window = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send,
      },
    };

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.setEnabled(true);

    const service = gitAutoFetchService as unknown as {
      fetchAll: () => Promise<void>;
      syncRepositoryWorktrees: (repositoryPath: string, worktreePaths: string[]) => void;
    };

    service.syncRepositoryWorktrees('/repo/main', [
      '/repo/main',
      '/repo/main/.worktrees/feature-a',
      '/repo/main/.worktrees/feature-b',
    ]);

    await service.fetchAll();

    expect(gitAutoFetchTestDoubles.GitService).toHaveBeenCalledTimes(1);
    expect(gitAutoFetchTestDoubles.GitService).toHaveBeenCalledWith('/repo/main');
    expect(send).toHaveBeenCalledWith('git:autoFetch:completed', {
      timestamp: expect.any(Number),
      repositoryPaths: ['/repo/main'],
    });
  });

  it('drops stale worktree registrations across cleanup and reinit cycles', async () => {
    const firstWindow = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      },
    };
    const secondWindow = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send: vi.fn(),
      },
    };

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(firstWindow as never);
    gitAutoFetchService.registerWorktree('/repo-old');
    gitAutoFetchService.cleanup();

    gitAutoFetchService.init(secondWindow as never);
    gitAutoFetchService.registerWorktree('/repo-new');
    gitAutoFetchService.setEnabled(true);

    const service = gitAutoFetchService as unknown as {
      fetchAll: () => Promise<void>;
    };

    await service.fetchAll();
    gitAutoFetchService.cleanup();

    expect(gitAutoFetchTestDoubles.GitService).toHaveBeenCalledTimes(1);
    expect(gitAutoFetchTestDoubles.GitService).toHaveBeenCalledWith('/repo-new');
  });

  it('tracks linked worktree HEAD files through gitdir indirection without fs watchers', async () => {
    const send = vi.fn();
    const window = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send,
      },
    };
    const worktreePath = '/repo/feature';
    const worktreeGitFile = '/repo/feature/.git';
    const gitDirPath = '/repo/.git/worktrees/feature';
    const headPath = '/repo/.git/worktrees/feature/HEAD';

    gitAutoFetchTestDoubles.setFile(worktreeGitFile, 'gitdir: ../.git/worktrees/feature\n');
    gitAutoFetchTestDoubles.setDirectory(gitDirPath);
    gitAutoFetchTestDoubles.setFile(headPath, 'ref: refs/heads/feature-a\n');

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.registerWorktree(worktreePath);

    expect(gitAutoFetchTestDoubles.watch).not.toHaveBeenCalled();

    gitAutoFetchTestDoubles.updateFile(headPath, 'ref: refs/heads/feature-b\n');
    await vi.advanceTimersByTimeAsync(5000);

    expect(send).toHaveBeenCalledWith('git:autoFetch:completed', {
      timestamp: expect.any(Number),
      repositoryPaths: ['/repo/feature'],
    });
  });

  it('swallows disposed renderer send errors when notifying auto-fetch completion', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const send = vi.fn(() => {
      throw new Error('Render frame was disposed before WebFrameMain could be accessed');
    });
    const window = {
      on: vi.fn(),
      off: vi.fn(),
      isDestroyed: vi.fn(() => false),
      webContents: {
        isDestroyed: vi.fn(() => false),
        send,
      },
    };

    const gitAutoFetchService = await loadGitAutoFetchService();

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.registerWorktree('/repo-disposed');
    gitAutoFetchService.setEnabled(true);

    const service = gitAutoFetchService as unknown as {
      fetchAll: () => Promise<void>;
    };

    await service.fetchAll();

    expect(send).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith(
      'Failed to notify renderer about git auto fetch completion:',
      expect.any(Error)
    );
  });
});
