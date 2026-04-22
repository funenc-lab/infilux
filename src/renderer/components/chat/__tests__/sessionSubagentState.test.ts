import type { LiveAgentSubagent } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  getMatchedSessionSubagents,
  resolveSessionSubagentProvider,
  resolveSessionSubagentViewState,
  supportsSessionSubagentTracking,
} from '../sessionSubagentState';

function createSubagent(overrides: Partial<LiveAgentSubagent> = {}): LiveAgentSubagent {
  return {
    id: 'subagent-1',
    provider: 'codex',
    threadId: 'child-thread-1',
    rootThreadId: 'root-thread-1',
    parentThreadId: 'root-thread-1',
    cwd: '/repo/worktree',
    label: 'Worker 1',
    lastSeenAt: 10,
    status: 'running',
    ...overrides,
  };
}

describe('sessionSubagentState', () => {
  it('normalizes codex variants into a supported tracking provider', () => {
    expect(resolveSessionSubagentProvider('codex-hapi', 'codex')).toBe('codex');
    expect(resolveSessionSubagentProvider('codex-happy', 'codex')).toBe('codex');
    expect(supportsSessionSubagentTracking('codex-hapi', 'codex')).toBe(true);
  });

  it('returns unsupported for agent tools without child-session tracking', () => {
    expect(resolveSessionSubagentProvider('claude', 'claude')).toBeNull();
    expect(
      resolveSessionSubagentViewState({
        agentId: 'claude',
        agentCommand: 'claude',
        initialized: true,
        uiSessionId: 'ui-session-1',
        providerSessionId: 'provider-session-1',
      })
    ).toEqual({
      kind: 'unsupported',
      reason: 'provider-not-supported',
    });
  });

  it('keeps codex remote sessions in an explicit unsupported state', () => {
    expect(
      resolveSessionSubagentViewState({
        agentId: 'codex',
        agentCommand: 'codex',
        initialized: true,
        uiSessionId: 'ui-session-1',
        providerSessionId: 'provider-session-1',
        isRemoteExecution: true,
      })
    ).toEqual({
      kind: 'unsupported',
      reason: 'remote-provider-not-supported',
    });
  });

  it('marks unresolved provider sessions as pending until the provider id differs from the ui session', () => {
    expect(
      resolveSessionSubagentViewState({
        agentId: 'codex',
        agentCommand: 'codex',
        initialized: true,
        uiSessionId: 'ui-session-1',
        providerSessionId: 'ui-session-1',
      })
    ).toEqual({
      kind: 'pending',
      provider: 'codex',
      reason: 'provider-session-pending',
    });
  });

  it('matches only subagents that belong to the current provider session and provider', () => {
    expect(
      getMatchedSessionSubagents('codex-hapi', 'codex', 'root-thread-1', [
        createSubagent({ rootThreadId: 'root-thread-1' }),
        createSubagent({
          id: 'subagent-2',
          threadId: 'child-thread-2',
          rootThreadId: 'other-root-thread',
        }),
      ])
    ).toEqual([expect.objectContaining({ threadId: 'child-thread-1' })]);
  });
});
