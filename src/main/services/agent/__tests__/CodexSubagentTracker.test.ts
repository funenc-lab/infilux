import { describe, expect, it } from 'vitest';
import {
  applyCodexLogLine,
  buildLiveCodexSubagents,
  createEmptyCodexSubagentTrackerState,
} from '../CodexSubagentTracker';

function applyLines(lines: string[]) {
  const state = createEmptyCodexSubagentTrackerState();
  for (const line of lines) {
    applyCodexLogLine(state, line);
  }
  return state;
}

describe('CodexSubagentTracker', () => {
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
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        agentType: 'worker',
        label: 'Worker 1',
        summary: 'Review the failing tests',
        status: 'running',
      }),
    ]);
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
});
