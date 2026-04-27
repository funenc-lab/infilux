import type { ClaudeProjectPolicy, ClaudeWorktreePolicy } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildClaudePolicyLaunchMetadata,
  resolveClaudePolicyMaterializationMode,
  shouldMarkClaudePolicySessionStale,
} from '../claudePolicyLaunch';
import type { Session } from '../SessionBar';

function createProjectPolicy(): ClaudeProjectPolicy {
  return {
    repoPath: '/repo',
    allowedCapabilityIds: ['command:review'],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    updatedAt: 1,
  };
}

function createWorktreePolicy(): ClaudeWorktreePolicy {
  return {
    ...createProjectPolicy(),
    repoPath: '/repo',
    worktreePath: '/repo/worktrees/feat-a',
  };
}

function createGlobalPolicy() {
  return {
    allowedCapabilityIds: ['command:review'],
    blockedCapabilityIds: [],
    allowedSharedMcpIds: [],
    blockedSharedMcpIds: [],
    allowedPersonalMcpIds: [],
    blockedPersonalMcpIds: [],
    updatedAt: 1,
  };
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    sessionId: 'provider-1',
    backendSessionId: 'backend-1',
    name: 'Claude',
    agentId: 'claude',
    agentCommand: 'claude',
    initialized: true,
    activated: true,
    repoPath: '/repo',
    cwd: '/repo/worktrees/feat-a',
    environment: 'native',
    claudePolicyHash: 'hash-1',
    claudePolicyStale: false,
    ...overrides,
  };
}

describe('claudePolicyLaunch', () => {
  it('builds launch metadata for Claude sessions and preserves existing metadata', () => {
    const globalPolicy = createGlobalPolicy();
    const projectPolicy = createProjectPolicy();
    const worktreePolicy = createWorktreePolicy();
    const params = {
      agentCommand: 'claude',
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      globalPolicy,
      projectPolicy,
      worktreePolicy,
      metadata: {
        uiSessionId: 'session-1',
        environment: 'native',
      },
    } as Parameters<typeof buildClaudePolicyLaunchMetadata>[0];

    expect(buildClaudePolicyLaunchMetadata(params)).toEqual({
      uiSessionId: 'session-1',
      environment: 'native',
      agentCapabilityLaunch: {
        provider: 'claude',
        agentCommand: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        globalPolicy,
        projectPolicy,
        worktreePolicy,
        sessionPolicy: null,
        materializationMode: 'copy',
      },
      claudePolicyLaunch: {
        agentCommand: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        globalPolicy,
        projectPolicy,
        worktreePolicy,
        sessionPolicy: null,
        materializationMode: 'copy',
      },
    });

    expect(
      buildClaudePolicyLaunchMetadata({
        agentCommand: 'codex',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        projectPolicy,
        worktreePolicy,
        metadata: {
          uiSessionId: 'session-1',
        },
      })
    ).toEqual({
      uiSessionId: 'session-1',
    });
  });

  it('keeps Claude runtime projection on copy mode and reserves provider-native for unsupported agents', () => {
    expect(resolveClaudePolicyMaterializationMode('claude')).toBe('copy');
    expect(resolveClaudePolicyMaterializationMode('codex')).toBe('provider-native');
  });

  it('marks only matching Claude sessions as stale for repo and worktree policy saves', () => {
    expect(
      shouldMarkClaudePolicySessionStale(createSession(), {
        scope: 'global',
      } as never)
    ).toBe(true);
    expect(
      shouldMarkClaudePolicySessionStale(createSession(), {
        scope: 'repo',
        repoPath: '/repo',
      })
    ).toBe(true);
    expect(
      shouldMarkClaudePolicySessionStale(createSession(), {
        scope: 'worktree',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
      })
    ).toBe(true);
    expect(
      shouldMarkClaudePolicySessionStale(
        createSession({
          agentCommand: 'codex',
          claudePolicyHash: undefined,
        }),
        {
          scope: 'repo',
          repoPath: '/repo',
        }
      )
    ).toBe(false);
    expect(
      shouldMarkClaudePolicySessionStale(
        createSession({
          cwd: '/repo/worktrees/feat-b',
        }),
        {
          scope: 'worktree',
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feat-a',
        }
      )
    ).toBe(false);
  });
});
