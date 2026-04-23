/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import {
  mapOutputStateToGlowState,
  resolveActivityGlowState,
  useRepoOutputState,
  useSessionOutputState,
  useSessionTaskCompletionNotice,
  useWorktreeOutputState,
  useWorktreeTaskCompletionNotice,
} from '../useOutputState';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookSnapshot = {
  repoGlowState?: string;
  worktreeGlowState?: string;
  sessionGlowState?: string;
  worktreeTaskCompletionNotice?: boolean;
  sessionTaskCompletionNotice?: boolean;
};

let latestSnapshot: HookSnapshot = {};
const MISSING_REPO_PATH = '__missing_repo__';
const MISSING_WORKTREE_PATH = '__missing_worktree__';
const MISSING_SESSION_ID = '__missing_session__';

function HookHarness({
  repoPath,
  worktreePath,
  sessionId,
}: {
  repoPath?: string;
  worktreePath?: string;
  sessionId?: string;
}) {
  const repoGlowState = useRepoOutputState(repoPath ?? MISSING_REPO_PATH);
  const worktreeGlowState = useWorktreeOutputState(worktreePath ?? MISSING_WORKTREE_PATH);
  const sessionGlowState = useSessionOutputState(sessionId ?? MISSING_SESSION_ID);
  const worktreeTaskCompletionNotice = useWorktreeTaskCompletionNotice(
    worktreePath ?? MISSING_WORKTREE_PATH
  );
  const sessionTaskCompletionNotice = useSessionTaskCompletionNotice(sessionId ?? MISSING_SESSION_ID);

  latestSnapshot = {
    repoGlowState: repoPath ? repoGlowState : undefined,
    worktreeGlowState: worktreePath ? worktreeGlowState : undefined,
    sessionGlowState: sessionId ? sessionGlowState : undefined,
    worktreeTaskCompletionNotice: worktreePath ? worktreeTaskCompletionNotice : undefined,
    sessionTaskCompletionNotice: sessionId ? sessionTaskCompletionNotice : undefined,
  };

  return React.createElement('div');
}

function mountHookHarness(props: { repoPath?: string; worktreePath?: string; sessionId?: string }) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root: Root = createRoot(container);
  act(() => {
    root.render(React.createElement(HookHarness, props));
  });

  return {
    rerender(nextProps: { repoPath?: string; worktreePath?: string; sessionId?: string }) {
      act(() => {
        root.render(React.createElement(HookHarness, nextProps));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function createSession(
  overrides: Partial<ReturnType<typeof useAgentSessionsStore.getState>['sessions'][number]> = {}
) {
  return {
    id: 'session-1',
    sessionId: 'provider-session-1',
    backendSessionId: 'backend-session-1',
    createdAt: 1,
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree-a',
    environment: 'native' as const,
    persistenceEnabled: false,
    ...overrides,
  };
}

describe('useOutputState hooks', () => {
  beforeEach(() => {
    latestSnapshot = {};
    localStorage.clear();
    useAgentSessionsStore.setState({
      sessions: [],
      activeIds: {},
      groupStates: {},
      runtimeStates: {},
      enhancedInputStates: {},
      attachmentTrayStates: {},
    });
    useWorktreeActivityStore.setState({
      activities: {},
      diffStats: {},
      activityStates: {},
      hookActivityStates: {},
      derivedActivityStates: {},
      agentCloseHandlers: new Set(),
      terminalCloseHandlers: new Set(),
    });
    window.electronAPI = {
      worktree: {
        activate: vi.fn(),
      },
    } as never;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('maps output state values to the expected glow state', () => {
    expect(mapOutputStateToGlowState('outputting')).toBe('running');
    expect(mapOutputStateToGlowState('unread')).toBe('completed');
    expect(mapOutputStateToGlowState('idle')).toBe('idle');
  });

  it('resolves activity glow state using activity priority before output priority', () => {
    expect(
      resolveActivityGlowState({
        outputState: 'unread',
        activityState: 'waiting_input',
      })
    ).toBe('waiting_input');

    expect(
      resolveActivityGlowState({
        outputState: 'idle',
        activityState: 'running',
      })
    ).toBe('running');

    expect(
      resolveActivityGlowState({
        outputState: 'outputting',
        activityState: 'idle',
      })
    ).toBe('running');

    expect(
      resolveActivityGlowState({
        outputState: 'idle',
        activityState: 'completed',
      })
    ).toBe('completed');

    expect(
      resolveActivityGlowState({
        outputState: 'unread',
        activityState: 'idle',
      })
    ).toBe('completed');

    expect(
      resolveActivityGlowState({
        outputState: 'idle',
        activityState: 'idle',
      })
    ).toBe('idle');
  });

  it('aggregates repo output state across multiple worktrees and prefers waiting input', () => {
    useAgentSessionsStore.setState({
      sessions: [
        createSession({
          id: 'session-a',
          cwd: '/repo/worktree-a',
        }),
        createSession({
          id: 'session-b',
          cwd: '/repo/worktree-b',
          repoPath: '/repo/',
        }),
      ],
      runtimeStates: {
        'session-a': {
          outputState: 'idle',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
        },
        'session-b': {
          outputState: 'unread',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
        },
      },
    });
    useWorktreeActivityStore.setState({
      activityStates: {
        '/repo/worktree-b': 'waiting_input',
      },
    });

    const mounted = mountHookHarness({
      repoPath: '/repo',
    });

    expect(latestSnapshot.repoGlowState).toBe('waiting_input');

    mounted.unmount();
  });

  it('uses normalized repo paths and falls back to output-driven repo glow state', () => {
    useAgentSessionsStore.setState({
      sessions: [
        createSession({
          id: 'session-outputting',
          repoPath: '/repo/',
          cwd: '/repo/worktree-a/',
        }),
        createSession({
          id: 'session-idle',
          cwd: '/repo/worktree-b',
        }),
      ],
      runtimeStates: {
        'session-outputting': {
          outputState: 'outputting',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
        },
        'session-idle': {
          outputState: 'idle',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
        },
      },
    });
    useWorktreeActivityStore.setState({
      activityStates: {
        '/repo/worktree-a': 'completed',
      },
    });

    const mounted = mountHookHarness({
      repoPath: '/repo',
    });

    expect(latestSnapshot.repoGlowState).toBe('running');

    mounted.unmount();
  });

  it('aggregates worktree output state from runtime and activity state', () => {
    useAgentSessionsStore.setState({
      sessions: [
        createSession({
          id: 'session-worktree',
          cwd: '/repo/worktree-a',
        }),
      ],
      runtimeStates: {
        'session-worktree': {
          outputState: 'unread',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
        },
      },
    });

    const mounted = mountHookHarness({
      worktreePath: '/repo/worktree-a',
    });

    expect(latestSnapshot.worktreeGlowState).toBe('completed');

    act(() => {
      useWorktreeActivityStore.setState({
        activityStates: {
          '/repo/worktree-a': 'running',
        },
      });
      mounted.rerender({
        worktreePath: '/repo/worktree-a',
      });
    });

    expect(latestSnapshot.worktreeGlowState).toBe('running');

    mounted.unmount();
  });

  it('returns idle and no completion notice when session runtime state is missing', () => {
    useAgentSessionsStore.setState({
      sessions: [
        createSession({
          id: 'session-missing-runtime',
          cwd: '/repo/worktree-a/',
        }),
      ],
      runtimeStates: {},
    });

    const mounted = mountHookHarness({
      sessionId: 'session-missing-runtime',
      worktreePath: '/repo/worktree-a',
    });

    expect(latestSnapshot.sessionGlowState).toBe('idle');
    expect(latestSnapshot.sessionTaskCompletionNotice).toBe(false);
    expect(latestSnapshot.worktreeTaskCompletionNotice).toBe(false);

    mounted.unmount();
  });

  it('reads session glow state and task completion notices from the session runtime state', () => {
    useAgentSessionsStore.setState({
      sessions: [
        createSession({
          id: 'session-notice',
          cwd: '/repo/worktree-a',
        }),
        createSession({
          id: 'session-other',
          cwd: '/repo/worktree-b',
        }),
      ],
      runtimeStates: {
        'session-notice': {
          outputState: 'unread',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
          hasCompletedTaskUnread: true,
        },
        'session-other': {
          outputState: 'idle',
          lastActivityAt: 0,
          wasActiveWhenOutputting: false,
        },
      },
    });

    const mounted = mountHookHarness({
      sessionId: 'session-notice',
      worktreePath: '/repo/worktree-a',
    });

    expect(latestSnapshot.sessionGlowState).toBe('completed');
    expect(latestSnapshot.sessionTaskCompletionNotice).toBe(true);
    expect(latestSnapshot.worktreeTaskCompletionNotice).toBe(true);

    mounted.rerender({
      sessionId: 'session-other',
      worktreePath: '/repo/worktree-b',
    });

    expect(latestSnapshot.sessionGlowState).toBe('idle');
    expect(latestSnapshot.sessionTaskCompletionNotice).toBe(false);
    expect(latestSnapshot.worktreeTaskCompletionNotice).toBe(false);

    mounted.unmount();
  });
});
