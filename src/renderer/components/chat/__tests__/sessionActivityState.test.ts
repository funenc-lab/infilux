import type { LiveAgentSubagent } from '@shared/types';
import { describe, expect, it } from 'vitest';
import {
  buildSessionActivityStateBySessionId,
  computeHighestSessionActivityState,
  resolveSessionActivityState,
} from '../sessionActivityState';

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

describe('sessionActivityState', () => {
  it('prioritizes waiting input over live background activity', () => {
    expect(
      resolveSessionActivityState({
        outputState: 'idle',
        hasCompletedTaskUnread: false,
        waitingForInput: true,
        providerSessionId: 'root-thread-1',
        subagents: [createSubagent()],
      })
    ).toBe('waiting_input');
  });

  it('treats matching live subagents as running even when the parent session terminal is idle', () => {
    expect(
      resolveSessionActivityState({
        outputState: 'idle',
        hasCompletedTaskUnread: false,
        waitingForInput: false,
        providerSessionId: 'root-thread-1',
        subagents: [createSubagent()],
      })
    ).toBe('running');
  });

  it('ignores subagents that belong to a different parent session in the same worktree', () => {
    expect(
      resolveSessionActivityState({
        outputState: 'idle',
        hasCompletedTaskUnread: false,
        waitingForInput: false,
        providerSessionId: 'root-thread-1',
        subagents: [createSubagent({ rootThreadId: 'other-root-thread' })],
      })
    ).toBe('idle');
  });

  it('does not treat codex background subagents as live activity for other agent providers', () => {
    expect(
      resolveSessionActivityState({
        agentId: 'claude',
        outputState: 'idle',
        hasCompletedTaskUnread: false,
        waitingForInput: false,
        providerSessionId: 'root-thread-1',
        subagents: [createSubagent()],
      })
    ).toBe('idle');
  });

  it('builds per-session activity states from runtime state and matched background subagents', () => {
    expect(
      buildSessionActivityStateBySessionId({
        sessions: [
          {
            id: 'session-1',
            agentId: 'codex',
            sessionId: 'root-thread-1',
            cwd: '/repo/worktree',
          },
          {
            id: 'session-2',
            agentId: 'claude',
            sessionId: 'root-thread-2',
            cwd: '/repo/worktree',
          },
        ],
        runtimeStates: {
          'session-1': {
            outputState: 'idle',
            lastActivityAt: 1,
            wasActiveWhenOutputting: false,
            waitingForInput: false,
            hasCompletedTaskUnread: false,
          },
          'session-2': {
            outputState: 'idle',
            lastActivityAt: 1,
            wasActiveWhenOutputting: false,
            waitingForInput: true,
            hasCompletedTaskUnread: false,
          },
        },
        subagentsByWorktree: new Map([
          [
            '/repo/worktree',
            [
              createSubagent({ rootThreadId: 'root-thread-1', status: 'running' }),
              createSubagent({
                id: 'subagent-2',
                threadId: 'child-thread-2',
                rootThreadId: 'root-thread-2',
                parentThreadId: 'root-thread-2',
                status: 'waiting',
              }),
            ],
          ],
        ]),
      })
    ).toEqual({
      'session-1': 'running',
      'session-2': 'waiting_input',
    });
  });

  it('computes the highest collection state with waiting input ahead of running and completed', () => {
    expect(
      computeHighestSessionActivityState({
        sessions: [
          {
            id: 'session-1',
            agentId: 'codex',
            sessionId: 'root-thread-1',
            cwd: '/repo/worktree',
          },
          {
            id: 'session-2',
            agentId: 'claude',
            sessionId: 'root-thread-2',
            cwd: '/repo/worktree',
          },
          {
            id: 'session-3',
            agentId: 'gemini',
            sessionId: 'root-thread-3',
            cwd: '/repo/worktree',
          },
        ],
        runtimeStates: {
          'session-1': {
            outputState: 'idle',
            lastActivityAt: 1,
            wasActiveWhenOutputting: false,
            waitingForInput: false,
            hasCompletedTaskUnread: false,
          },
          'session-2': {
            outputState: 'idle',
            lastActivityAt: 1,
            wasActiveWhenOutputting: false,
            waitingForInput: true,
            hasCompletedTaskUnread: false,
          },
          'session-3': {
            outputState: 'unread',
            lastActivityAt: 1,
            wasActiveWhenOutputting: false,
            waitingForInput: false,
            hasCompletedTaskUnread: true,
          },
        },
        subagentsByWorktree: new Map([
          [
            '/repo/worktree',
            [createSubagent({ rootThreadId: 'root-thread-1', status: 'running' })],
          ],
        ]),
      })
    ).toBe('waiting_input');
  });
});
