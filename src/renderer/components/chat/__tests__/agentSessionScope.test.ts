import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesAgentSessionRepoPath, matchesAgentSessionScope } from '../agentSessionScope';

describe('agent session scope matching', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('treats equivalent repository paths as the same repo scope on macOS', () => {
    expect(
      matchesAgentSessionRepoPath(
        { repoPath: '/Users/tanzv/Development/Git/Lads-Gateway/' },
        '/users/tanzv/development/git/lads-gateway'
      )
    ).toBe(true);
  });

  it('treats equivalent repository and worktree paths as the same worktree scope on macOS', () => {
    expect(
      matchesAgentSessionScope(
        {
          repoPath: '/Users/tanzv/Development/Git/Lads-Gateway/',
          cwd: '/private/tmp/EnsoAI/worktrees/feat-skill-mcp/',
        },
        '/users/tanzv/development/git/lads-gateway',
        '/tmp/ensoai/worktrees/feat-skill-mcp'
      )
    ).toBe(true);
  });
});
