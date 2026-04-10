import { describe, expect, it } from 'vitest';
import {
  applyCodexLogLine,
  buildLiveCodexSubagents,
  createEmptyCodexSubagentTrackerState,
  pruneCodexSubagentTrackerState,
  resolveCodexLogReadWindow,
} from '../CodexSubagentTracker';

function applyLines(lines: string[]) {
  const state = createEmptyCodexSubagentTrackerState();
  for (const line of lines) {
    applyCodexLogLine(state, line);
  }
  return state;
}

describe('CodexSubagentTracker', () => {
  it('keeps incremental reads when the unread tail stays within the bounded window', () => {
    expect(resolveCodexLogReadWindow(4_096, 6_144, 8_192)).toEqual({
      start: 4_096,
      resetState: false,
    });
  });

  it('jumps to the recent tail and resets state when the unread gap exceeds the bounded window', () => {
    expect(resolveCodexLogReadWindow(0, 1_024 * 1_024 * 1024, 8 * 1024 * 1024)).toEqual({
      start: 1_065_353_216,
      resetState: true,
    });
  });

  it('pairs spawn_agent calls with nested child threads and keeps live subagents by cwd', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"worker","message":"Review the failing tests"} thread_id=root-1',
      '2026-03-29T09:00:03.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::codex: new',
      '2026-03-29T09:00:04.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pytest -q","workdir":"/repo/worktrees/feature-a"} thread_id=child-1',
    ]);

    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:00:10.000Z'),
        maxIdleMs: 15_000,
        cwds: ['/repo/worktrees/feature-a'],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'child-1',
        rootThreadId: 'root-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        agentType: 'worker',
        label: 'Worker 1',
        summary: 'Review the failing tests',
        status: 'running',
      }),
    ]);
  });

  it('tracks the direct parent thread for nested subagents instead of flattening to root', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"worker","message":"Parent task"} thread_id=root-1',
      '2026-03-29T09:00:02.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=child-1',
      '2026-03-29T09:00:03.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"reviewer","message":"Nested task"} thread_id=child-1',
      '2026-03-29T09:00:04.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}:session_loop{thread_id=child-2}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=child-2',
    ]);

    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:00:10.000Z'),
        maxIdleMs: 15_000,
        cwds: ['/repo/worktrees/feature-a'],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'child-1',
          parentThreadId: 'root-1',
        }),
        expect.objectContaining({
          id: 'child-2',
          parentThreadId: 'child-1',
          agentType: 'reviewer',
        }),
      ])
    );
  });

  it('marks waiting subagents when the latest child tool is wait_agent', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"worker","message":"Review the failing tests"} thread_id=root-1',
      '2026-03-29T09:00:02.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pytest -q","workdir":"/repo/worktrees/feature-a"} thread_id=child-1',
      '2026-03-29T09:00:04.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: wait_agent {"targets":["agent-1"]} thread_id=child-1',
    ]);

    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:00:10.000Z'),
        maxIdleMs: 15_000,
        cwds: ['/repo/worktrees/feature-a'],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'child-1',
        status: 'waiting',
      }),
    ]);
  });

  it('marks subagents as stale when they are still live but idle for most of the window', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"worker","message":"Inspect the editor flow"} thread_id=root-1',
      '2026-03-29T09:00:02.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pnpm test","workdir":"/repo/worktrees/feature-a"} thread_id=child-1',
    ]);

    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:00:11.000Z'),
        maxIdleMs: 15_000,
        cwds: ['/repo/worktrees/feature-a'],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'child-1',
        status: 'stale',
      }),
    ]);
  });

  it('drops stale child threads once they exceed the live idle threshold', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"worker","message":"Review the failing tests"} thread_id=root-1',
      '2026-03-29T09:00:02.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pytest -q","workdir":"/repo/worktrees/feature-a"} thread_id=child-1',
    ]);

    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:05:00.000Z'),
        maxIdleMs: 30_000,
        cwds: ['/repo/worktrees/feature-a'],
      })
    ).toEqual([]);
  });

  it('prunes expired subagent tracker state instead of keeping old threads forever', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"worker","message":"Old task"} thread_id=root-1',
      '2026-03-29T09:00:02.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=child-1',
    ]);

    pruneCodexSubagentTrackerState(state, Date.parse('2026-03-29T09:05:00.000Z'), 30_000);

    expect(state.subagentsByThread.size).toBe(0);
    expect(state.threadContexts.size).toBe(0);
    expect(state.pendingSpawnsByRoot.size).toBe(0);
    expect(state.childSequencesByRoot.size).toBe(0);
  });

  it('keeps referenced root thread context while a recent subagent still needs it for cwd', () => {
    const state = createEmptyCodexSubagentTrackerState();
    state.threadContexts.set('root-1', {
      threadId: 'root-1',
      rootThreadId: 'root-1',
      cwd: '/repo/worktrees/feature-a',
      lastSeenAt: Date.parse('2026-03-29T09:00:00.000Z'),
    });
    state.subagentsByThread.set('child-1', {
      id: 'child-1',
      threadId: 'child-1',
      rootThreadId: 'root-1',
      parentThreadId: 'root-1',
      label: 'Worker 1',
      lastSeenAt: Date.parse('2026-03-29T09:04:50.000Z'),
    });

    pruneCodexSubagentTrackerState(state, Date.parse('2026-03-29T09:05:00.000Z'), 30_000);

    expect(state.threadContexts.has('root-1')).toBe(true);
    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:05:00.000Z'),
        maxIdleMs: 30_000,
        cwds: ['/repo/worktrees/feature-a'],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'child-1',
        cwd: '/repo/worktrees/feature-a',
      }),
    ]);
  });
});
