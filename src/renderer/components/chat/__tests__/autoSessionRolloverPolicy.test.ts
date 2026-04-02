import { describe, expect, it } from 'vitest';
import type { StatusData } from '@/stores/agentStatus';
import { findAutoSessionRolloverTarget } from '../autoSessionRolloverPolicy';
import type { Session } from '../SessionBar';
import type { AgentGroupState } from '../types';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktree',
    environment: 'native',
    ...overrides,
  };
}

function makeStatus(percent: number): StatusData {
  const contextWindowSize = 200_000;
  const usedTokens = Math.round((contextWindowSize * percent) / 100);

  return {
    model: {
      id: 'claude-sonnet',
      displayName: 'Claude Sonnet',
    },
    contextWindow: {
      totalInputTokens: usedTokens,
      totalOutputTokens: 20_000,
      contextWindowSize,
      currentUsage: {
        inputTokens: usedTokens,
        outputTokens: 20_000,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
    },
    cost: {
      totalCostUsd: 1,
      totalDurationMs: 1,
      totalApiDurationMs: 1,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
    workspace: {
      currentDir: '/repo/worktree',
      projectDir: '/repo',
    },
    version: '1.0.0',
    updatedAt: Date.now(),
  };
}

function makeGroupState(overrides: Partial<AgentGroupState> = {}): AgentGroupState {
  return {
    groups: [
      {
        id: 'group-1',
        sessionIds: ['session-1'],
        activeSessionId: 'session-1',
      },
    ],
    activeGroupId: 'group-1',
    flexPercents: [100],
    ...overrides,
  };
}

describe('autoSessionRolloverPolicy', () => {
  it('returns the active critical session as the automatic rollover target', () => {
    const target = findAutoSessionRolloverTarget({
      groupState: makeGroupState(),
      sessions: [makeSession()],
      statuses: {
        'session-1': makeStatus(98),
      },
      handledSessionIds: new Set<string>(),
    });

    expect(target).toEqual({
      groupId: 'group-1',
      percent: 98,
      session: expect.objectContaining({
        id: 'session-1',
      }),
    });
  });

  it('ignores sessions that only reached the warning threshold', () => {
    const target = findAutoSessionRolloverTarget({
      groupState: makeGroupState(),
      sessions: [makeSession()],
      statuses: {
        'session-1': makeStatus(85),
      },
      handledSessionIds: new Set<string>(),
    });

    expect(target).toBeNull();
  });

  it('does not target a session that has already been auto-rolled over', () => {
    const target = findAutoSessionRolloverTarget({
      groupState: makeGroupState(),
      sessions: [makeSession()],
      statuses: {
        'session-1': makeStatus(99),
      },
      handledSessionIds: new Set(['session-1']),
    });

    expect(target).toBeNull();
  });

  it('only considers the active group session for automatic rollover', () => {
    const target = findAutoSessionRolloverTarget({
      groupState: {
        groups: [
          {
            id: 'group-1',
            sessionIds: ['session-1'],
            activeSessionId: 'session-1',
          },
          {
            id: 'group-2',
            sessionIds: ['session-2'],
            activeSessionId: 'session-2',
          },
        ],
        activeGroupId: 'group-1',
        flexPercents: [50, 50],
      },
      sessions: [makeSession(), makeSession({ id: 'session-2', sessionId: 'provider-2' })],
      statuses: {
        'session-1': makeStatus(70),
        'session-2': makeStatus(99),
      },
      handledSessionIds: new Set<string>(),
    });

    expect(target).toBeNull();
  });
});
