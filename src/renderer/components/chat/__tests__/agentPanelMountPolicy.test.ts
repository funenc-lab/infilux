import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
  collectMountedAgentSessionIds,
  DEFAULT_WORKTREE_TERMINAL_MOUNT_LIMIT,
  reconcileMountedAgentPanelSessionIdSet,
  resolveBackgroundAgentCanvasMountPlan,
  resolveBackgroundAgentCanvasMountSessionIds,
  resolveMountedAgentPanelSessionIds,
} from '../agentPanelMountPolicy';

const NOW = 1_700_000_000_000;

describe('collectMountedAgentSessionIds', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('only keeps sessions from the current worktree', () => {
    expect(
      collectMountedAgentSessionIds(
        [
          { id: 'session-a', repoPath: '/repo-a', cwd: '/repo-a/worktree-1' },
          { id: 'session-b', repoPath: '/repo-a', cwd: '/repo-a/worktree-2' },
          { id: 'session-c', repoPath: '/repo-b', cwd: '/repo-b/worktree-1' },
        ],
        '/repo-a',
        '/repo-a/worktree-1'
      )
    ).toEqual(['session-a']);
  });

  it('treats equivalent worktree paths as the same session owner', () => {
    expect(
      collectMountedAgentSessionIds(
        [{ id: 'session-a', repoPath: '/repo-a', cwd: '/Users/tanzv/Repo/Worktree/' }],
        '/repo-a',
        '/users/tanzv/repo/worktree'
      )
    ).toEqual(['session-a']);
  });

  it('treats equivalent repository paths as the same mounted session scope', () => {
    expect(
      collectMountedAgentSessionIds(
        [
          {
            id: 'session-a',
            repoPath: '/Users/tanzv/Development/Git/Lads-Gateway/',
            cwd: '/Users/tanzv/Development/Git/Lads-Gateway/worktrees/feat-skill-mcp/',
          },
        ],
        '/users/tanzv/development/git/lads-gateway',
        '/users/tanzv/development/git/lads-gateway/worktrees/feat-skill-mcp'
      )
    ).toEqual(['session-a']);
  });
});

describe('reconcileMountedAgentPanelSessionIdSet', () => {
  it('returns the current set when mounted session ids are unchanged', () => {
    const current = new Set(['session-a', 'session-b']);

    expect(reconcileMountedAgentPanelSessionIdSet(current, ['session-b', 'session-a'])).toBe(
      current
    );
  });

  it('returns a new set when mounted session ids changed', () => {
    const current = new Set(['session-a', 'session-b']);
    const next = reconcileMountedAgentPanelSessionIdSet(current, ['session-b', 'session-c']);

    expect(next).not.toBe(current);
    expect([...next].sort()).toEqual(['session-b', 'session-c']);
  });
});

describe('resolveMountedAgentPanelSessionIds', () => {
  it('suppresses retained non-host panels while the workspace canvas host owns all sessions', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [{ id: 'worktree-a' }, { id: 'worktree-b' }],
        currentWorktreeSessions: [{ id: 'worktree-b' }],
        globalSessionIds: ['worktree-b'],
        isWorkspaceCanvasDisplayMode: false,
        suppressSessionMounting: true,
      })
    ).toEqual([]);
  });

  it('keeps every workspace canvas session mounted independently from active panel state', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [{ id: 'worktree-a' }, { id: 'worktree-b' }],
        currentWorktreeSessions: [{ id: 'worktree-a' }],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
      })
    ).toEqual(['worktree-a', 'worktree-b']);
  });

  it('limits idle workspace canvas terminal mounts while preserving focused and attention sessions', () => {
    const workspaceCanvasTerminalMountLimit = 5;
    const canvasSessions = Array.from({ length: 15 }, (_, index) => ({
      id: `session-${index}`,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        canvasFocusedSessionId: 'session-14',
        sessionActivityStateById: {
          'session-10': 'running',
          'session-12': 'waiting_input',
          'session-13': 'completed',
        },
        workspaceCanvasTerminalMountLimit,
      })
    ).toEqual(['session-0', 'session-10', 'session-12', 'session-13', 'session-14']);
  });

  it('keeps idle workspace canvas mount slots stable when visual group order changes', () => {
    const canvasSessions = Array.from({ length: 14 }, (_, index) => ({
      id: `session-${index}`,
      repoPath: '/repo',
      cwd: `/repo/worktree-${index}`,
      createdAt: index,
    }));
    const currentWorktreeFirstSessions = [
      canvasSessions[9],
      ...canvasSessions.filter((session) => session.id !== 'session-9'),
    ];
    const expectedMountedSessionIds = [
      'session-0',
      'session-1',
      'session-10',
      'session-11',
      'session-12',
      'session-13',
      'session-2',
      'session-3',
      'session-4',
      'session-5',
      'session-6',
      'session-7',
    ];

    expect(
      new Set(
        resolveMountedAgentPanelSessionIds({
          canvasSessions: currentWorktreeFirstSessions,
          currentWorktreeSessions: [],
          globalSessionIds: [],
          isWorkspaceCanvasDisplayMode: true,
          workspaceCanvasTerminalMountLimit: 12,
        })
      )
    ).toEqual(new Set(expectedMountedSessionIds));
  });

  it('keeps workspace canvas attention mounts within the terminal budget by priority', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        sessionActivityStateById: {
          'session-0': 'completed',
          'session-1': 'completed',
          'session-2': 'running',
          'session-3': 'waiting_input',
          'session-4': 'completed',
          'session-5': 'running',
          'session-6': 'waiting_input',
          'session-7': 'running',
        },
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toEqual(['session-2', 'session-3', 'session-5', 'session-6']);
  });

  it('reserves workspace canvas terminal budget for pending command sessions before idle sessions', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      pendingCommand: index === 7 ? 'run diagnostics' : undefined,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-7']);
  });

  it('reserves workspace canvas terminal budget for focused sessions before attention sessions', () => {
    const canvasSessions = Array.from({ length: 5 }, (_, index) => ({
      id: `session-${index}`,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        canvasFocusedSessionId: 'session-4',
        sessionActivityStateById: {
          'session-0': 'waiting_input',
          'session-1': 'waiting_input',
          'session-2': 'running',
          'session-3': 'running',
        },
        workspaceCanvasTerminalMountLimit: 3,
      })
    ).toEqual(['session-0', 'session-1', 'session-4']);
  });

  it('keeps recovered workspace canvas sessions mounted so host recovery starts without expanding the tile', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      recovered: index === 7,
      recoveryState: index === 7 ? 'live' : undefined,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-7']);
  });

  it('defers dormant recovered Codex workspace canvas sessions from passive background mounts', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      agentId: index === 7 ? 'codex' : 'gemini',
      agentCommand: index === 7 ? 'codex' : 'gemini',
      createdAt: NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
      recovered: index === 7,
      recoveryState: index === 7 ? 'live' : undefined,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        canvasFocusedSessionId: null,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        sessionLastActivityAtById: {
          'session-7': NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
        },
        now: NOW,
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-3']);
  });

  it('keeps focused dormant recovered Codex workspace canvas sessions mounted', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      agentId: index === 7 ? 'codex' : 'gemini',
      agentCommand: index === 7 ? 'codex' : 'gemini',
      createdAt: NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
      recovered: index === 7,
      recoveryState: index === 7 ? 'live' : undefined,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        canvasFocusedSessionId: 'session-7',
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        sessionLastActivityAtById: {
          'session-7': NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
        },
        now: NOW,
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toContain('session-7');
  });

  it('keeps foreground worktree workspace canvas sessions mounted during worktree switches', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      agentId: index === 7 ? 'codex' : 'gemini',
      agentCommand: index === 7 ? 'codex' : 'gemini',
      createdAt: NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
      recovered: index === 7,
      recoveryState: index === 7 ? 'live' : undefined,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        canvasFocusedSessionId: null,
        currentWorktreeSessions: [canvasSessions[7]],
        foregroundSessionIds: ['session-7'],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        sessionLastActivityAtById: {
          'session-7': NOW - AGENT_BACKGROUND_RUNTIME_DORMANT_THRESHOLD_MS,
        },
        now: NOW,
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toContain('session-7');
  });

  it('does not reserve workspace canvas terminal slots for metadata-only missing-host sessions', () => {
    const canvasSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      recovered: index === 7,
      recoveryState: index === 7 ? 'missing-host-session' : undefined,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions,
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: true,
        workspaceCanvasTerminalMountLimit: 4,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-3']);
  });

  it('does not mount metadata-only missing-host sessions when the canvas is below its limit', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [
          { id: 'session-live', recovered: true, recoveryState: 'live' },
          {
            id: 'session-missing',
            recovered: true,
            recoveryState: 'missing-host-session',
          },
        ],
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isCanvasDisplayMode: true,
        isWorkspaceCanvasDisplayMode: false,
        worktreeTerminalMountLimit: 6,
      })
    ).toEqual(['session-live']);
  });

  it('mounts a verified provider-backed missing-host session so it can resume', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [
          {
            id: 'session-resumable',
            agentCommand: 'codex',
            providerSessionIdentityValid: true,
            recovered: true,
            recoveryState: 'missing-host-session',
          },
        ],
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isCanvasDisplayMode: true,
        isWorkspaceCanvasDisplayMode: false,
        worktreeTerminalMountLimit: 6,
      })
    ).toEqual(['session-resumable']);
  });

  it('keeps an unverified missing-host session metadata-only', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [
          {
            id: 'session-unverified',
            agentCommand: 'codex',
            providerSessionIdentityValid: false,
            recovered: true,
            recoveryState: 'missing-host-session',
          },
        ],
        currentWorktreeSessions: [],
        globalSessionIds: [],
        isCanvasDisplayMode: true,
        isWorkspaceCanvasDisplayMode: false,
        worktreeTerminalMountLimit: 6,
      })
    ).toEqual([]);
  });

  it('preserves existing current-worktree mount ordering with cached hidden sessions', () => {
    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [{ id: 'worktree-a' }],
        currentWorktreeSessions: [{ id: 'worktree-a' }, { id: 'worktree-a-second' }],
        globalSessionIds: ['worktree-a-second', 'hidden-session'],
        isWorkspaceCanvasDisplayMode: false,
      })
    ).toEqual(['worktree-a', 'worktree-a-second', 'hidden-session']);
  });

  it('limits worktree canvas runtime mounts even when every tile is visible', () => {
    const currentWorktreeSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      createdAt: index,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: currentWorktreeSessions,
        currentWorktreeSessions,
        currentWorktreeVisibleSessionIds: currentWorktreeSessions.map((session) => session.id),
        globalSessionIds: [],
        isCanvasDisplayMode: true,
        isWorkspaceCanvasDisplayMode: false,
        worktreeTerminalMountLimit: 6,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-3', 'session-4', 'session-5']);
  });

  it('limits non-canvas hidden terminal mounts while preserving visible and attention sessions', () => {
    const currentWorktreeSessions = Array.from({ length: 12 }, (_, index) => ({
      id: `session-${index}`,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      createdAt: index,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [],
        currentWorktreeSessions,
        currentWorktreeVisibleSessionIds: ['session-0', 'session-4'],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: false,
        sessionActivityStateById: {
          'session-3': 'completed',
          'session-7': 'running',
          'session-9': 'waiting_input',
        },
        worktreeTerminalMountLimit: 5,
      })
    ).toEqual(['session-0', 'session-3', 'session-4', 'session-7', 'session-9']);
  });

  it('keeps visible non-canvas sessions mounted even when they exceed the hidden-session budget', () => {
    const currentWorktreeSessions = Array.from({ length: 8 }, (_, index) => ({
      id: `session-${index}`,
      repoPath: '/repo',
      cwd: '/repo/worktree',
      createdAt: index,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [],
        currentWorktreeSessions,
        currentWorktreeVisibleSessionIds: ['session-0', 'session-1', 'session-2', 'session-3'],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: false,
        sessionActivityStateById: {
          'session-4': 'running',
          'session-5': 'waiting_input',
        },
        worktreeTerminalMountLimit: 2,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-3']);
  });

  it('fills remaining non-canvas mount slots with stable idle sessions up to the budget', () => {
    const currentWorktreeSessions = Array.from({ length: 7 }, (_, index) => ({
      id: `session-${index}`,
      repoPath: '/repo',
      cwd: `/repo/worktree-${index}`,
      createdAt: index,
    }));

    expect(
      resolveMountedAgentPanelSessionIds({
        canvasSessions: [],
        currentWorktreeSessions,
        currentWorktreeVisibleSessionIds: ['session-6'],
        globalSessionIds: [],
        isWorkspaceCanvasDisplayMode: false,
        worktreeTerminalMountLimit: DEFAULT_WORKTREE_TERMINAL_MOUNT_LIMIT,
      })
    ).toEqual(['session-0', 'session-1', 'session-2', 'session-3', 'session-4', 'session-6']);
  });
});

describe('resolveBackgroundAgentCanvasMountSessionIds', () => {
  it('reports when more background canvas mount work remains after the current batch', () => {
    expect(
      resolveBackgroundAgentCanvasMountPlan({
        backgroundMountedSessionIds: [],
        batchSize: 2,
        canvasSessionIds: Array.from({ length: 8 }, (_, index) => `session-${index}`),
        maxMountedSessionCount: 6,
        mountedSessionIds: ['session-0'],
      })
    ).toEqual({
      hasMore: true,
      sessionIds: ['session-1', 'session-2'],
    });
  });

  it('does not background-mount more canvas terminals once the runtime budget is full', () => {
    expect(
      resolveBackgroundAgentCanvasMountSessionIds({
        backgroundMountedSessionIds: ['session-6', 'session-7'],
        batchSize: 2,
        canvasSessionIds: Array.from({ length: 10 }, (_, index) => `session-${index}`),
        maxMountedSessionCount: 6,
        mountedSessionIds: Array.from({ length: 6 }, (_, index) => `session-${index}`),
      })
    ).toEqual([]);
  });

  it('trims existing background mounts to the remaining runtime budget', () => {
    expect(
      resolveBackgroundAgentCanvasMountSessionIds({
        backgroundMountedSessionIds: ['session-2', 'session-3', 'session-4'],
        batchSize: 2,
        canvasSessionIds: Array.from({ length: 8 }, (_, index) => `session-${index}`),
        maxMountedSessionCount: 5,
        mountedSessionIds: ['session-0', 'session-1'],
        userRequestedSessionIds: ['session-7'],
      })
    ).toEqual(['session-2', 'session-3']);
  });

  it('adds eligible background mounts in small batches without exceeding the runtime budget', () => {
    expect(
      resolveBackgroundAgentCanvasMountSessionIds({
        backgroundMountedSessionIds: [],
        batchSize: 2,
        canvasSessionIds: Array.from({ length: 8 }, (_, index) => `session-${index}`),
        maxMountedSessionCount: 5,
        mountedSessionIds: ['session-0', 'session-1'],
      })
    ).toEqual(['session-2', 'session-3']);
  });

  it('skips sessions that runtime safety marks as deferred', () => {
    expect(
      resolveBackgroundAgentCanvasMountSessionIds({
        backgroundMountedSessionIds: [],
        batchSize: 3,
        canvasSessionIds: Array.from({ length: 8 }, (_, index) => `session-${index}`),
        maxMountedSessionCount: 5,
        mountedSessionIds: ['session-0', 'session-1'],
        shouldDeferSessionMount: (sessionId) => sessionId === 'session-2',
      })
    ).toEqual(['session-3', 'session-4', 'session-5']);
  });
});
