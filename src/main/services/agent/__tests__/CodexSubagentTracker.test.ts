import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyCodexLogLine,
  applyCodexSessionSubagentMeta,
  buildLiveCodexSubagents,
  CodexSubagentTracker,
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

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (!tempDir) {
      continue;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(tempDir);
  return tempDir;
}

function buildSessionDayDir(rootDir: string, timestampMs: number): string {
  const date = new Date(timestampMs);
  return path.join(
    rootDir,
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  );
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

  it('matches cwd filters with normalized workspace keys so renderer polling can use case-insensitive paths', () => {
    const state = applyLines([
      '2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/Users/tanzv/Development/Git/Repo-A"} thread_id=root-1',
      '2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"explorer","message":"Inspect the repository root"} thread_id=root-1',
      '2026-03-29T09:00:03.000Z  INFO session_loop{thread_id=root-1}:session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"ls","workdir":"/Users/tanzv/Development/Git/Repo-A"} thread_id=child-1',
    ]);

    expect(
      buildLiveCodexSubagents(state, {
        now: Date.parse('2026-03-29T09:00:10.000Z'),
        maxIdleMs: 15_000,
        cwds: ['/users/tanzv/development/git/repo-a'],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'child-1',
        cwd: '/Users/tanzv/Development/Git/Repo-A',
        label: 'Explorer 1',
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

  it('hydrates live subagents from session metadata when child logs are standalone threads', () => {
    const state = applyLines([
      `2026-03-29T09:00:00.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1`,
      `2026-03-29T09:00:01.000Z  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"explorer","message":"Inspect the package metadata"} thread_id=root-1`,
      `2026-03-29T09:00:04.000Z  INFO session_loop{thread_id=child-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"cat package.json","workdir":"/repo/worktrees/feature-a"} thread_id=child-1`,
    ]);

    applyCodexSessionSubagentMeta(state, {
      threadId: 'child-1',
      parentThreadId: 'root-1',
      cwd: '/repo/worktrees/feature-a',
      agentType: 'explorer',
      agentNickname: 'Pascal',
      timestampMs: Date.parse('2026-03-29T09:00:03.000Z'),
    });

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
        agentType: 'explorer',
        label: 'Pascal',
        summary: 'Inspect the package metadata',
        status: 'running',
      }),
    ]);
  });

  it('hydrates session metadata on later polls even when the log file has not grown', async () => {
    const tempDir = createTempDir('codex-subagent-tracker-');
    const logPath = path.join(tempDir, 'codex-tui.log');
    const sessionsDir = path.join(tempDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });

    const now = Date.now();
    const rootTimestamp = new Date(now - 4_000).toISOString();
    const spawnTimestamp = new Date(now - 3_000).toISOString();
    const childTimestamp = new Date(now - 2_000).toISOString();

    writeFileSync(
      logPath,
      [
        `${rootTimestamp}  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1`,
        `${spawnTimestamp}  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"explorer","message":"Inspect the repository root"} thread_id=root-1`,
        `${childTimestamp}  INFO session_loop{thread_id=child-1}: codex_core::session: new`,
        '',
      ].join('\n'),
      'utf8'
    );

    const tracker = new CodexSubagentTracker(logPath, sessionsDir);
    const initial = await tracker.listLive({
      cwds: ['/repo/worktrees/feature-a'],
      maxIdleMs: 60_000,
    });

    expect(initial.items).toEqual([]);

    writeFileSync(
      path.join(sessionsDir, 'rollout-child-1.jsonl'),
      [
        JSON.stringify({
          timestamp: new Date(now - 1_500).toISOString(),
          type: 'session_meta',
          payload: {
            id: 'child-1',
            timestamp: new Date(now - 1_500).toISOString(),
            cwd: '/repo/worktrees/feature-a',
            source: {
              subagent: {
                thread_spawn: {
                  parent_thread_id: 'root-1',
                  agent_role: 'explorer',
                  agent_nickname: 'Dalton',
                },
              },
            },
            agent_role: 'explorer',
            agent_nickname: 'Dalton',
          },
        }),
        '',
      ].join('\n'),
      'utf8'
    );

    const hydrated = await tracker.listLive({
      cwds: ['/repo/worktrees/feature-a'],
      maxIdleMs: 60_000,
    });

    expect(hydrated.items).toEqual([
      expect.objectContaining({
        id: 'child-1',
        rootThreadId: 'root-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        agentType: 'explorer',
        label: 'Dalton',
        summary: 'Inspect the repository root',
      }),
    ]);
  });

  it('hydrates recent session metadata even when child thread logs are missing from the retained log window', async () => {
    const tempDir = createTempDir('codex-subagent-tracker-');
    const logPath = path.join(tempDir, 'codex-tui.log');
    const sessionsDir = path.join(tempDir, 'sessions');

    const now = Date.now();
    const rootTimestamp = new Date(now - 4_000).toISOString();
    const spawnTimestamp = new Date(now - 3_000).toISOString();
    const sessionTimestamp = new Date(now - 2_000).toISOString();
    const sessionDayDir = buildSessionDayDir(sessionsDir, now);
    mkdirSync(sessionDayDir, { recursive: true });

    writeFileSync(
      logPath,
      [
        `${rootTimestamp}  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: exec_command {"cmd":"pwd","workdir":"/repo/worktrees/feature-a"} thread_id=root-1`,
        `${spawnTimestamp}  INFO session_loop{thread_id=root-1}: codex_core::stream_events_utils: ToolCall: spawn_agent {"agent_type":"explorer","message":"Inspect the repository root"} thread_id=root-1`,
        '',
      ].join('\n'),
      'utf8'
    );

    writeFileSync(
      path.join(sessionDayDir, 'rollout-child-1.jsonl'),
      [
        JSON.stringify({
          timestamp: sessionTimestamp,
          type: 'session_meta',
          payload: {
            id: 'child-1',
            timestamp: sessionTimestamp,
            cwd: '/repo/worktrees/feature-a',
            source: {
              subagent: {
                thread_spawn: {
                  parent_thread_id: 'root-1',
                  agent_role: 'explorer',
                  agent_nickname: 'Dalton',
                },
              },
            },
            agent_role: 'explorer',
            agent_nickname: 'Dalton',
          },
        }),
        '',
      ].join('\n'),
      'utf8'
    );

    const tracker = new CodexSubagentTracker(logPath, sessionsDir);
    const result = await tracker.listLive({
      cwds: ['/repo/worktrees/feature-a'],
      maxIdleMs: 60_000,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'child-1',
        rootThreadId: 'root-1',
        parentThreadId: 'root-1',
        cwd: '/repo/worktrees/feature-a',
        agentType: 'explorer',
        label: 'Dalton',
        summary: 'Inspect the repository root',
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
