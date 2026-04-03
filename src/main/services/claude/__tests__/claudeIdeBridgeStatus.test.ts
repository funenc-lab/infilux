import { describe, expect, it } from 'vitest';
import { matchesClaudeIdeWorkspace, resolveClaudeIdeBridgeStatus } from '../claudeIdeBridgeStatus';

describe('matchesClaudeIdeWorkspace', () => {
  it('matches the exact workspace path', () => {
    expect(matchesClaudeIdeWorkspace('/repo/app', '/repo/app')).toBe(true);
  });

  it('matches nested paths inside the registered workspace folder', () => {
    expect(matchesClaudeIdeWorkspace('/repo/app/src', '/repo/app')).toBe(true);
  });

  it('does not match sibling paths', () => {
    expect(matchesClaudeIdeWorkspace('/repo/app-other', '/repo/app')).toBe(false);
  });
});

describe('resolveClaudeIdeBridgeStatus', () => {
  it('reports ready when the bridge matches the workspace and only one live lock exists', () => {
    expect(
      resolveClaudeIdeBridgeStatus({
        enabled: true,
        port: 54269,
        workspaceFolders: ['/repo/app'],
        workspacePath: '/repo/app',
        matchingWorkspaceLockCount: 1,
      })
    ).toEqual({
      enabled: true,
      port: 54269,
      workspaceFolders: ['/repo/app'],
      hasMatchingWorkspace: true,
      matchingWorkspaceLockCount: 1,
      canUseIde: true,
      reason: 'ready',
    });
  });

  it('disables IDE launch when the current workspace is not registered in the bridge', () => {
    expect(
      resolveClaudeIdeBridgeStatus({
        enabled: true,
        port: 54269,
        workspaceFolders: ['/repo/other'],
        workspacePath: '/repo/app',
        matchingWorkspaceLockCount: 1,
      })
    ).toMatchObject({
      canUseIde: false,
      hasMatchingWorkspace: false,
      reason: 'workspace-mismatch',
    });
  });

  it('disables IDE launch when multiple live IDE locks target the same workspace', () => {
    expect(
      resolveClaudeIdeBridgeStatus({
        enabled: true,
        port: 54269,
        workspaceFolders: ['/repo/app'],
        workspacePath: '/repo/app',
        matchingWorkspaceLockCount: 2,
      })
    ).toMatchObject({
      canUseIde: false,
      hasMatchingWorkspace: true,
      reason: 'ambiguous-locks',
    });
  });
});
