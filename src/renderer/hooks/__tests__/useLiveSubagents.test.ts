import type { LiveAgentSubagent } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  areLiveSubagentListsEqual,
  buildLiveSubagentCwds,
  buildPolledLiveSubagentCwds,
} from '../useLiveSubagents';

function createSubagent(overrides: Partial<LiveAgentSubagent> = {}): LiveAgentSubagent {
  return {
    id: 'subagent-1',
    provider: 'codex',
    threadId: 'thread-1',
    rootThreadId: 'root-thread-1',
    parentThreadId: 'root-thread-1',
    cwd: '/Users/tanzv/project/worktree-a',
    label: 'Worker',
    status: 'running',
    lastSeenAt: 1_764_317_600_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildLiveSubagentCwds', () => {
  it('normalizes, deduplicates, and sorts cwd inputs by value', () => {
    expect(
      buildLiveSubagentCwds([
        '/Users/tanzv/project/worktree-b',
        '',
        '/Users/tanzv/project/worktree-a',
        '/Users/tanzv/project/worktree-b/',
      ])
    ).toEqual(['/users/tanzv/project/worktree-a', '/users/tanzv/project/worktree-b']);
  });
});

describe('buildPolledLiveSubagentCwds', () => {
  it('only keeps worktrees that are both visible and backed by an active codex session', () => {
    expect(
      buildPolledLiveSubagentCwds(
        ['/Users/tanzv/project/worktree-a/', '/Users/tanzv/project/worktree-b'],
        ['/users/tanzv/project/worktree-b', '/users/tanzv/project/worktree-c']
      )
    ).toEqual(['/users/tanzv/project/worktree-b']);
  });
});

describe('areLiveSubagentListsEqual', () => {
  it('treats equivalent snapshots as equal even when array references differ', () => {
    const left = [createSubagent()];
    const right = [createSubagent()];

    expect(areLiveSubagentListsEqual(left, right)).toBe(true);
  });

  it('detects meaningful subagent changes', () => {
    const left = [createSubagent()];
    const right = [createSubagent({ status: 'waiting' })];

    expect(areLiveSubagentListsEqual(left, right)).toBe(false);
  });

  it('detects metadata changes that affect subagent presentation', () => {
    const left = [createSubagent()];
    const right = [createSubagent({ summary: 'Updated summary' })];

    expect(areLiveSubagentListsEqual(left, right)).toBe(false);
  });

  it('detects parent-session changes that affect session-level activity mapping', () => {
    const left = [createSubagent()];
    const right = [createSubagent({ rootThreadId: 'other-root-thread' })];

    expect(areLiveSubagentListsEqual(left, right)).toBe(false);
  });
});
