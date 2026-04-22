import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ListLiveAgentSubagentsResult, LiveAgentSubagent } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodexSessionSubagentService } from '../CodexSessionSubagentService';

const tempDirs: string[] = [];

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

function writeSessionMetaFile(options: {
  sessionsDir: string;
  threadId: string;
  timestampMs: number;
  cwd: string;
  parentThreadId?: string;
  agentRole?: string;
  agentNickname?: string;
}): string {
  const sessionDayDir = buildSessionDayDir(options.sessionsDir, options.timestampMs);
  mkdirSync(sessionDayDir, { recursive: true });

  const filePath = path.join(sessionDayDir, `rollout-${options.threadId}.jsonl`);
  const threadSpawn = options.parentThreadId
    ? {
        parent_thread_id: options.parentThreadId,
        agent_role: options.agentRole,
        agent_nickname: options.agentNickname,
      }
    : undefined;

  writeFileSync(
    filePath,
    [
      JSON.stringify({
        timestamp: new Date(options.timestampMs).toISOString(),
        type: 'session_meta',
        payload: {
          id: options.threadId,
          timestamp: new Date(options.timestampMs).toISOString(),
          cwd: options.cwd,
          source: threadSpawn
            ? {
                subagent: {
                  thread_spawn: threadSpawn,
                },
              }
            : {},
          agent_role: options.agentRole,
          agent_nickname: options.agentNickname,
        },
      }),
      '',
    ].join('\n'),
    'utf8'
  );

  const fileDate = new Date(options.timestampMs);
  utimesSync(filePath, fileDate, fileDate);
  return filePath;
}

function createLiveSubagent(overrides: Partial<LiveAgentSubagent> = {}): LiveAgentSubagent {
  return {
    id: 'child-1',
    provider: 'codex',
    threadId: 'child-1',
    rootThreadId: 'root-1',
    parentThreadId: 'root-1',
    cwd: '/repo/worktree',
    label: 'Dalton',
    status: 'running',
    lastSeenAt: Date.now(),
    ...overrides,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (!tempDir) {
      continue;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('CodexSessionSubagentService', () => {
  it('lists completed subagents for a provider session across nested descendants', async () => {
    const sessionsDir = createTempDir('codex-session-subagents-');
    const now = Date.now();

    writeSessionMetaFile({
      sessionsDir,
      threadId: 'root-1',
      timestampMs: now - 10_000,
      cwd: '/repo/worktree',
    });
    writeSessionMetaFile({
      sessionsDir,
      threadId: 'child-1',
      timestampMs: now - 9_000,
      cwd: '/repo/worktree',
      parentThreadId: 'root-1',
      agentRole: 'explorer',
      agentNickname: 'Dalton',
    });
    writeSessionMetaFile({
      sessionsDir,
      threadId: 'grandchild-1',
      timestampMs: now - 8_000,
      cwd: '/repo/worktree',
      parentThreadId: 'child-1',
      agentRole: 'reviewer',
    });
    writeSessionMetaFile({
      sessionsDir,
      threadId: 'other-root',
      timestampMs: now - 7_000,
      cwd: '/repo/other',
    });
    writeSessionMetaFile({
      sessionsDir,
      threadId: 'other-child',
      timestampMs: now - 6_000,
      cwd: '/repo/other',
      parentThreadId: 'other-root',
      agentRole: 'explorer',
    });

    const listLive = vi.fn<() => Promise<ListLiveAgentSubagentsResult>>().mockResolvedValue({
      items: [],
      generatedAt: now,
    });
    const service = new CodexSessionSubagentService({ listLive }, sessionsDir);

    const result = await service.listSession({
      providerSessionId: 'root-1',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        threadId: 'grandchild-1',
        rootThreadId: 'root-1',
        parentThreadId: 'child-1',
        label: 'Reviewer 2',
        status: 'completed',
      }),
      expect.objectContaining({
        threadId: 'child-1',
        rootThreadId: 'root-1',
        parentThreadId: 'root-1',
        label: 'Dalton',
        status: 'completed',
      }),
    ]);
    expect(listLive).toHaveBeenCalledWith({
      cwds: ['/repo/worktree'],
      maxIdleMs: 900000,
    });
  });

  it('merges live tracker state into session subagent items when available', async () => {
    const sessionsDir = createTempDir('codex-session-subagents-');
    const now = Date.now();

    writeSessionMetaFile({
      sessionsDir,
      threadId: 'root-1',
      timestampMs: now - 10_000,
      cwd: '/repo/worktree',
    });
    writeSessionMetaFile({
      sessionsDir,
      threadId: 'child-1',
      timestampMs: now - 9_000,
      cwd: '/repo/worktree',
      parentThreadId: 'root-1',
      agentRole: 'explorer',
      agentNickname: 'Dalton',
    });

    const listLive = vi.fn<() => Promise<ListLiveAgentSubagentsResult>>().mockResolvedValue({
      items: [
        createLiveSubagent({
          summary: 'Inspect the repository root',
          lastSeenAt: now - 1_000,
          status: 'running',
        }),
      ],
      generatedAt: now,
    });
    const service = new CodexSessionSubagentService({ listLive }, sessionsDir);

    const result = await service.listSession({
      providerSessionId: 'root-1',
      cwd: '/repo/worktree',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        threadId: 'child-1',
        label: 'Dalton',
        summary: 'Inspect the repository root',
        status: 'running',
        lastSeenAt: now - 1_000,
      }),
    ]);
  });
});
