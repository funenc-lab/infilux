import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryStore } from '../repository';
import { useSourceControlStore } from '../sourceControl';
import { useTerminalStore } from '../terminal';
import { useTerminalWriteStore } from '../terminalWrite';
import { useWorktreeStore } from '../worktree';

function resetRepositoryStore(): void {
  useRepositoryStore.setState({
    status: null,
    branches: [],
    logs: [],
    isLoading: false,
    error: null,
  });
}

function resetSourceControlStore(): void {
  useSourceControlStore.setState({
    selectedFile: null,
    navigationDirection: null,
    viewMode: 'list',
    expandedFolders: new Set<string>(),
  });
}

function resetTerminalStore(): void {
  useTerminalStore.setState({
    sessions: [],
    activeSessionId: null,
    quickTerminalSessions: {},
  });
}

function resetTerminalWriteStore(): void {
  useTerminalWriteStore.setState({
    writers: new Map(),
    focusers: new Map(),
    activeSessionId: null,
  });
}

function resetWorktreeStore(): void {
  useWorktreeStore.setState({
    worktrees: [],
    currentWorktree: null,
    isLoading: false,
    error: null,
  });
}

describe('lightweight renderer stores', () => {
  beforeEach(() => {
    resetRepositoryStore();
    resetSourceControlStore();
    resetTerminalStore();
    resetTerminalWriteStore();
    resetWorktreeStore();
    vi.restoreAllMocks();
  });

  it('manages repository state and can reset to defaults', () => {
    const store = useRepositoryStore.getState();

    store.setStatus({
      isClean: false,
      current: 'main',
      tracking: 'origin/main',
      staged: [],
      modified: ['src/app.ts'],
      deleted: [],
      untracked: [],
      conflicted: [],
      ahead: 1,
      behind: 0,
    });
    store.setBranches([{ name: 'main', current: true } as never]);
    store.setLogs([
      { hash: 'abc', date: '2026-03-25', message: 'init', author_name: 'dev' } as never,
    ]);
    store.setLoading(true);
    store.setError('failed');

    expect(useRepositoryStore.getState()).toMatchObject({
      isLoading: true,
      error: 'failed',
    });

    store.reset();

    expect(useRepositoryStore.getState()).toEqual({
      status: null,
      branches: [],
      logs: [],
      isLoading: false,
      error: null,
      setStatus: expect.any(Function),
      setBranches: expect.any(Function),
      setLogs: expect.any(Function),
      setLoading: expect.any(Function),
      setError: expect.any(Function),
      reset: expect.any(Function),
    });
  });

  it('tracks terminal sessions and quick terminal mappings', () => {
    const store = useTerminalStore.getState();
    const sessionA = { id: 'session-a', cwd: '/repo-a' } as never;
    const sessionB = { id: 'session-b', cwd: '/repo-b' } as never;

    store.addSession(sessionA);
    store.addSession(sessionB);
    store.updateSession('session-a', { title: 'Updated' } as never);
    store.setQuickTerminalSession('/repo-a', 'session-a');
    store.setQuickTerminalSession('/repo-b', 'session-b');

    expect(useTerminalStore.getState().activeSessionId).toBe('session-b');
    expect(useTerminalStore.getState().sessions[0]).toMatchObject({ title: 'Updated' });
    expect(store.getQuickTerminalSession('/repo-a')).toBe('session-a');
    expect(store.getAllQuickTerminalCwds()).toEqual(['/repo-a', '/repo-b']);

    store.removeQuickTerminalSession('/repo-a');
    store.removeSession('session-b');

    expect(useTerminalStore.getState().activeSessionId).toBe('session-a');
    expect(useTerminalStore.getState().quickTerminalSessions).toEqual({ '/repo-b': 'session-b' });

    store.syncSessions([sessionB]);
    store.setActiveSession(null);
    expect(useTerminalStore.getState()).toMatchObject({
      sessions: [sessionB],
      activeSessionId: null,
    });
  });

  it('writes and focuses terminal sessions through the shared writer registry', () => {
    const store = useTerminalWriteStore.getState();
    const writer = vi.fn();
    const focuser = vi.fn();
    const passiveWriter = vi.fn();

    store.register('session-a', writer, focuser);
    store.register('session-b', passiveWriter);
    store.setActiveSessionId('session-a');
    store.setActiveSessionId('session-a');
    store.write('session-a', 'hello');
    expect(store.writeToActive('active')).toBe(true);
    store.focus('session-a');
    store.focusActive();
    store.focus('session-b');

    expect(writer).toHaveBeenNthCalledWith(1, 'hello');
    expect(writer).toHaveBeenNthCalledWith(2, 'active');
    expect(focuser).toHaveBeenCalledTimes(2);
    expect(useTerminalWriteStore.getState().focusers.has('session-b')).toBe(false);

    store.unregister('session-a');
    expect(store.writeToActive('ignored')).toBe(false);
    store.focusActive();
    store.setActiveSessionId(null);
    expect(store.writeToActive('no-active')).toBe(false);
    store.focusActive();
  });

  it('tracks source control selection, navigation and folder expansion', () => {
    const store = useSourceControlStore.getState();

    store.setSelectedFile({ path: '/repo/file.ts', staged: false });
    store.setNavigationDirection('next');
    store.setViewMode('tree');
    store.toggleFolder('/repo/src');
    store.toggleFolder('/repo/src');

    expect(useSourceControlStore.getState()).toMatchObject({
      selectedFile: { path: '/repo/file.ts', staged: false },
      navigationDirection: 'next',
      viewMode: 'tree',
    });
    expect(useSourceControlStore.getState().expandedFolders.size).toBe(0);
  });

  it('switches worktree metadata and records the transition log', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const store = useWorktreeStore.getState();
    const repoA = { path: '/repo-a', name: 'repo-a' } as never;
    const repoB = { path: '/repo-b', name: 'repo-b' } as never;

    store.setWorktrees([repoA, repoB]);
    store.setCurrentWorktree(repoA);
    store.setCurrentWorktree(repoB);
    store.setLoading(true);
    store.setError('network');

    expect(useWorktreeStore.getState()).toMatchObject({
      worktrees: [repoA, repoB],
      currentWorktree: repoB,
      isLoading: true,
      error: 'network',
    });
    expect(consoleLog).toHaveBeenCalledTimes(2);
  });
});
