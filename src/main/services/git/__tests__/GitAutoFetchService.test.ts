import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type WatchCallback = () => void;
type ErrorCallback = () => void;

interface FakeWatcher {
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  emitChange: () => void;
  emitError: () => void;
}

const gitAutoFetchTestDoubles = vi.hoisted(() => {
  const existsSync = vi.fn();
  const watch = vi.fn();
  const fetch = vi.fn();
  const listSubmodules = vi.fn();
  const fetchSubmodule = vi.fn();
  const GitService = vi.fn();

  const watchers = new Map<string, FakeWatcher>();

  function createWatcher(path: string): FakeWatcher {
    let onError: ErrorCallback | undefined;
    let onChange: WatchCallback | undefined;

    const watcher: FakeWatcher = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: ErrorCallback) => {
        if (event === 'error') {
          onError = callback;
        }
      }),
      emitChange: () => {
        onChange?.();
      },
      emitError: () => {
        onError?.();
      },
    };

    watch.mockImplementation((watchPath: string, callback: WatchCallback) => {
      if (watchPath === path) {
        onChange = callback;
        return watcher;
      }
      throw new Error(`Unexpected watch path: ${watchPath}`);
    });

    return watcher;
  }

  function reset() {
    existsSync.mockReset();
    watch.mockReset();
    fetch.mockReset();
    listSubmodules.mockReset();
    fetchSubmodule.mockReset();
    GitService.mockReset();
    watchers.clear();

    existsSync.mockReturnValue(false);
    listSubmodules.mockResolvedValue([]);
    fetch.mockResolvedValue(undefined);
    fetchSubmodule.mockResolvedValue(undefined);
    GitService.mockImplementation(() => ({
      fetch,
      listSubmodules,
      fetchSubmodule,
    }));
    watch.mockImplementation((watchPath: string, callback: WatchCallback) => {
      const watcher: FakeWatcher = {
        close: vi.fn(),
        on: vi.fn(),
        emitChange: () => {
          callback();
        },
        emitError: () => {},
      };
      watchers.set(watchPath, watcher);
      return watcher;
    });
  }

  return {
    existsSync,
    watch,
    fetch,
    listSubmodules,
    fetchSubmodule,
    GitService,
    watchers,
    createWatcher,
    reset,
  };
});

vi.mock('node:fs', () => ({
  existsSync: gitAutoFetchTestDoubles.existsSync,
  watch: gitAutoFetchTestDoubles.watch,
}));

vi.mock('../GitService', () => ({
  GitService: gitAutoFetchTestDoubles.GitService,
}));

describe('GitAutoFetchService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    gitAutoFetchTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('auto fetches worktrees, handles submodules, debounces HEAD changes, and cleans up listeners', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const worktreePath = '/repo';
    const headPath = '/repo/.git/HEAD';
    const watcher = gitAutoFetchTestDoubles.createWatcher(headPath);
    gitAutoFetchTestDoubles.existsSync.mockImplementation((target: string) => target === headPath);
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
        send,
      },
    };

    const { gitAutoFetchService } = await import('../GitAutoFetchService');

    gitAutoFetchService.init(window as never);
    gitAutoFetchService.init(window as never);
    gitAutoFetchService.setEnabled(true);
    gitAutoFetchService.registerWorktree(worktreePath);
    gitAutoFetchService.registerWorktree(worktreePath);

    await vi.advanceTimersByTimeAsync(5000);

    expect(gitAutoFetchTestDoubles.GitService).toHaveBeenCalledWith(worktreePath);
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(1);
    expect(gitAutoFetchTestDoubles.fetchSubmodule).toHaveBeenCalledTimes(1);
    expect(gitAutoFetchTestDoubles.fetchSubmodule).toHaveBeenCalledWith('sub-a');
    expect(send).toHaveBeenCalledWith('git:autoFetch:completed', {
      timestamp: expect.any(Number),
    });

    focusListeners[0]?.();
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    focusListeners[0]?.();
    await Promise.resolve();
    expect(gitAutoFetchTestDoubles.fetch).toHaveBeenCalledTimes(2);

    watcher.emitChange();
    watcher.emitChange();
    await vi.advanceTimersByTimeAsync(299);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(3);

    watcher.emitError();
    gitAutoFetchService.cleanup();

    expect(window.off).toHaveBeenCalledWith('focus', focusListeners[0]);
    expect(watcher.close).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('GitAutoFetchService already initialized');
  });

  it('handles fetch failures, disabled state, and destroyed windows safely', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const worktreePath = '/repo-b';
    const headPath = '/repo-b/.git/HEAD';

    gitAutoFetchTestDoubles.existsSync.mockImplementation((target: string) => target === headPath);
    const watcher: FakeWatcher = {
      close: vi.fn(),
      on: vi.fn(),
      emitChange: () => {},
      emitError: () => {},
    };
    gitAutoFetchTestDoubles.watch.mockImplementation(
      (_watchPath: string, callback: WatchCallback) => {
        watcher.emitChange = () => callback();
        return watcher;
      }
    );

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
        send,
      },
    };

    const { gitAutoFetchService } = await import('../GitAutoFetchService');

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
    expect(watcher.close).toHaveBeenCalledTimes(1);

    gitAutoFetchService.registerWorktree(worktreePath);
    service.clearWorktrees();
    expect(watcher.close).toHaveBeenCalledTimes(2);
  });
});
