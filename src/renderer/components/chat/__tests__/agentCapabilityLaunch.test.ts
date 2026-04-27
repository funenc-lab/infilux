import type { ClaudeProjectPolicy, ClaudeWorktreePolicy } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildAgentCapabilityLaunchMetadata,
  buildAgentCapabilityLaunchRequest,
  extractAgentCapabilitySessionMetadata,
} from '../agentCapabilityLaunch';

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

describe('agentCapabilityLaunch', () => {
  it('builds generic capability launch metadata for Claude sessions', () => {
    const globalPolicy = createGlobalPolicy();
    const projectPolicy = createProjectPolicy();
    const worktreePolicy = createWorktreePolicy();

    expect(
      buildAgentCapabilityLaunchMetadata({
        agentCommand: 'claude',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        globalPolicy,
        projectPolicy,
        worktreePolicy,
        metadata: {
          uiSessionId: 'session-1',
        },
      })
    ).toEqual({
      uiSessionId: 'session-1',
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
    });
  });

  it('builds provider-native capability launch metadata for codex sessions', () => {
    const projectPolicy = createProjectPolicy();
    const worktreePolicy = createWorktreePolicy();

    expect(
      buildAgentCapabilityLaunchRequest({
        agentId: 'codex',
        agentCommand: 'codex',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        projectPolicy,
        worktreePolicy,
      })
    ).toEqual({
      provider: 'codex',
      agentId: 'codex',
      agentCommand: 'codex',
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      globalPolicy: null,
      projectPolicy,
      worktreePolicy,
      sessionPolicy: null,
      materializationMode: 'provider-native',
    });
  });

  it('builds provider-native capability launch metadata for gemini sessions', () => {
    expect(
      buildAgentCapabilityLaunchRequest({
        agentId: 'gemini',
        agentCommand: 'gemini',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        projectPolicy: null,
        worktreePolicy: null,
      })
    ).toEqual({
      provider: 'gemini',
      agentId: 'gemini',
      agentCommand: 'gemini',
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feat-a',
      globalPolicy: null,
      projectPolicy: null,
      worktreePolicy: null,
      sessionPolicy: null,
      materializationMode: 'provider-native',
    });
  });

  it('resolves known providers from the command when the agent id is custom', () => {
    const projectPolicy = createProjectPolicy();

    expect(
      buildAgentCapabilityLaunchRequest({
        agentId: 'custom-codex',
        agentCommand: '/opt/bin/codex',
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feat-a',
        projectPolicy,
        worktreePolicy: null,
      })
    ).toEqual(
      expect.objectContaining({
        provider: 'codex',
        agentId: 'custom-codex',
        agentCommand: '/opt/bin/codex',
        materializationMode: 'provider-native',
      })
    );
  });

  it('extracts generic capability launch metadata from opened sessions', () => {
    expect(
      extractAgentCapabilitySessionMetadata({
        agentCapability: {
          provider: 'codex',
          hash: 'hash-1',
          warnings: ['warn-1'],
        },
      })
    ).toEqual({
      provider: 'codex',
      hash: 'hash-1',
      warnings: ['warn-1'],
    });
  });
});
