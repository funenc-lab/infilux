import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('worktree activity store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats: vi.fn(async () => ({ insertions: 3, deletions: 1 })),
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });
  });

  it('does not rewrite activity state when agent count is unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setAgentCount('/repo', 2);
    const previousActivities = useWorktreeActivityStore.getState().activities;

    store.setAgentCount('/repo', 2);

    expect(useWorktreeActivityStore.getState().activities).toBe(previousActivities);
  });

  it('does not rewrite activity state when terminal count is unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setTerminalCount('/repo', 3);
    const previousActivities = useWorktreeActivityStore.getState().activities;

    store.setTerminalCount('/repo', 3);

    expect(useWorktreeActivityStore.getState().activities).toBe(previousActivities);
  });

  it('does not rewrite diff stats when fetched values are unchanged', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    await store.fetchDiffStats(['/repo']);
    const previousDiffStats = useWorktreeActivityStore.getState().diffStats;

    await store.fetchDiffStats(['/repo']);

    expect(useWorktreeActivityStore.getState().diffStats).toBe(previousDiffStats);
  });

  it('deduplicates concurrent diff stat fetches for the same worktree path', async () => {
    const getDiffStats = vi.fn(
      () =>
        new Promise<{ insertions: number; deletions: number }>((resolve) => {
          setTimeout(() => resolve({ insertions: 5, deletions: 2 }), 5);
        })
    );
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats,
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });

    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    await Promise.all([store.fetchDiffStats(['/repo']), store.fetchDiffStats(['/repo'])]);

    expect(getDiffStats).toHaveBeenCalledTimes(1);
    expect(useWorktreeActivityStore.getState().diffStats['/repo']).toEqual({
      insertions: 5,
      deletions: 2,
    });
  });

  it('skips immediate refetches inside the diff stat freshness window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

    const getDiffStats = vi.fn(async () => ({ insertions: 7, deletions: 4 }));
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats,
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });

    const { useWorktreeActivityStore, DIFF_STATS_FRESHNESS_MS } = await import(
      '../worktreeActivity'
    );
    const store = useWorktreeActivityStore.getState();

    await store.fetchDiffStats(['/repo']);
    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(DIFF_STATS_FRESHNESS_MS + 1);
    vi.setSystemTime(Date.now());

    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(2);
  });

  it('stops refetching diff stats after an invalid workdir failure until the worktree is cleared', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

    const getDiffStats = vi.fn(async () => {
      throw new Error('Invalid workdir: path does not exist or is not a directory');
    });
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats,
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });

    const { useWorktreeActivityStore, DIFF_STATS_FRESHNESS_MS } = await import(
      '../worktreeActivity'
    );
    const store = useWorktreeActivityStore.getState();

    await store.fetchDiffStats(['/repo']);
    vi.advanceTimersByTime(DIFF_STATS_FRESHNESS_MS + 1);
    vi.setSystemTime(Date.now());
    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(1);

    store.clearWorktree('/repo');
    vi.advanceTimersByTime(DIFF_STATS_FRESHNESS_MS + 1);
    vi.setSystemTime(Date.now());
    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(2);
  });

  it('backs off diff stat refetches after transient spawn failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));

    const getDiffStats = vi.fn(async () => {
      throw new Error('spawn EAGAIN');
    });
    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          getDiffStats,
        },
        worktree: {
          activate: vi.fn(),
        },
      },
    });

    const { useWorktreeActivityStore, DIFF_STATS_FRESHNESS_MS } = await import(
      '../worktreeActivity'
    );
    const store = useWorktreeActivityStore.getState();

    await store.fetchDiffStats(['/repo']);
    vi.advanceTimersByTime(DIFF_STATS_FRESHNESS_MS + 1);
    vi.setSystemTime(Date.now());
    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30000);
    vi.setSystemTime(Date.now());
    await store.fetchDiffStats(['/repo']);

    expect(getDiffStats).toHaveBeenCalledTimes(2);
  });

  it('merges derived session activity with hook-driven worktree activity using the highest-priority state', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    store.setActivityState('/repo', 'completed');
    store.setDerivedActivityState('/repo', 'running');

    expect(useWorktreeActivityStore.getState().activityStates['/repo']).toBe('running');

    store.setDerivedActivityState('/repo', 'waiting_input');
    expect(useWorktreeActivityStore.getState().activityStates['/repo']).toBe('waiting_input');

    store.clearDerivedActivityState('/repo');
    expect(useWorktreeActivityStore.getState().activityStates['/repo']).toBe('completed');
  });

  it('tracks agent and terminal counters, exposes helpers, and clears per-worktree state', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();

    expect(store.hasActivity('/repo')).toBe(false);
    expect(store.getActivity('/repo')).toEqual({
      agentCount: 0,
      terminalCount: 0,
    });
    expect(store.getDiffStats('/repo')).toEqual({
      insertions: 0,
      deletions: 0,
    });

    store.incrementAgent('/repo');
    store.incrementTerminal('/repo');
    store.decrementAgent('/repo');
    store.setAgentCount('/repo', 2);
    store.decrementTerminal('/repo');
    store.setTerminalCount('/repo', 3);
    store.setDiffStats('/repo', {
      insertions: 7,
      deletions: 4,
    });

    expect(store.hasActivity('/repo')).toBe(true);
    expect(store.getActivity('/repo')).toEqual({
      agentCount: 2,
      terminalCount: 3,
    });
    expect(store.getDiffStats('/repo')).toEqual({
      insertions: 7,
      deletions: 4,
    });
    expect(store.getActivityState('/repo')).toBe('idle');

    store.clearWorktree('/repo');

    expect(store.hasActivity('/repo')).toBe(false);
    expect(store.getActivity('/repo')).toEqual({
      agentCount: 0,
      terminalCount: 0,
    });
    expect(store.getDiffStats('/repo')).toEqual({
      insertions: 0,
      deletions: 0,
    });
  });

  it('registers close handlers and notifies only currently registered listeners', async () => {
    const { useWorktreeActivityStore } = await import('../worktreeActivity');
    const store = useWorktreeActivityStore.getState();
    const agentHandler = vi.fn();
    const terminalHandler = vi.fn();

    const unregisterAgent = store.registerAgentCloseHandler(agentHandler);
    const unregisterTerminal = store.registerTerminalCloseHandler(terminalHandler);

    store.closeAgentSessions('/repo');
    store.closeTerminalSessions('/repo');

    expect(agentHandler).toHaveBeenCalledWith('/repo');
    expect(terminalHandler).toHaveBeenCalledWith('/repo');

    unregisterAgent();
    unregisterTerminal();

    store.closeAgentSessions('/repo-next');
    store.closeTerminalSessions('/repo-next');

    expect(agentHandler).toHaveBeenCalledTimes(1);
    expect(terminalHandler).toHaveBeenCalledTimes(1);
  });

  it('initializes activity listeners and resolves missing cwd values from tracked sessions', async () => {
    const unsubscribePreToolUse = vi.fn();
    const unsubscribeStop = vi.fn();
    const unsubscribeAsk = vi.fn();
    let preToolUseListener:
      | ((data: { sessionId: string; toolName: string; cwd?: string }) => void)
      | null = null;
    let stopListener: ((data: { sessionId: string; cwd?: string }) => void) | null = null;
    let askListener: ((data: { sessionId: string; cwd?: string }) => void) | null = null;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.doMock('@/lib/electronNotification', () => ({
      onPreToolUseNotification: vi.fn((callback) => {
        preToolUseListener = callback;
        return unsubscribePreToolUse;
      }),
      onAgentStopNotification: vi.fn((callback) => {
        stopListener = callback;
        return unsubscribeStop;
      }),
      onAskUserQuestionNotification: vi.fn((callback) => {
        askListener = callback;
        return unsubscribeAsk;
      }),
    }));
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

    const { useAgentSessionsStore } = await import('../agentSessions');
    const { initAgentActivityListener, useWorktreeActivityStore } = await import(
      '../worktreeActivity'
    );

    useAgentSessionsStore.setState({
      sessions: [
        {
          id: 'session-ui-1',
          sessionId: 'session-provider-1',
          backendSessionId: 'backend-session-1',
          createdAt: 1,
          name: 'Claude',
          agentId: 'claude',
          agentCommand: 'claude',
          initialized: true,
          activated: true,
          repoPath: '/repo',
          cwd: '/repo/worktree',
          environment: 'native',
          persistenceEnabled: false,
        },
      ],
      activeIds: {},
      groupStates: {},
      runtimeStates: {},
      enhancedInputStates: {},
      attachmentTrayStates: {},
    });

    const cleanup = initAgentActivityListener();

    preToolUseListener?.({
      sessionId: 'session-provider-1',
      toolName: 'Read',
    });
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/worktree')).toBe('running');

    askListener?.({
      sessionId: 'session-ui-1',
    });
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/worktree')).toBe(
      'waiting_input'
    );

    stopListener?.({
      sessionId: 'session-provider-1',
    });
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/worktree')).toBe(
      'completed'
    );

    preToolUseListener?.({
      sessionId: 'session-direct',
      toolName: 'Read',
      cwd: '/repo/direct',
    });
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/direct')).toBe('running');

    askListener?.({
      sessionId: 'session-direct',
      cwd: '/repo/direct',
    });
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/direct')).toBe(
      'waiting_input'
    );

    stopListener?.({
      sessionId: 'session-direct',
      cwd: '/repo/direct',
    });
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/direct')).toBe('completed');

    preToolUseListener?.({
      sessionId: 'missing-pretool',
      toolName: 'Read',
    });
    askListener?.({
      sessionId: 'missing-ask',
    });
    stopListener?.({
      sessionId: 'missing-stop',
    });

    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(useWorktreeActivityStore.getState().getActivityState('/repo/direct')).toBe('completed');

    cleanup();

    expect(unsubscribePreToolUse).toHaveBeenCalledTimes(1);
    expect(unsubscribeStop).toHaveBeenCalledTimes(1);
    expect(unsubscribeAsk).toHaveBeenCalledTimes(1);
  });
});
