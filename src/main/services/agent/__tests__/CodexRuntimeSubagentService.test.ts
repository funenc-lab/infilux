import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexRuntimeSubagentService } from '../CodexRuntimeSubagentService';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'infilux-runtime-subagents-'));
  tempRoots.push(root);
  return root;
}

function writeSessionMetaFile(options: {
  sessionsDir: string;
  threadId: string;
  timestampMs: number;
  cwd: string;
  parentThreadId?: string;
  agentRole?: string;
}): void {
  const date = new Date(options.timestampMs);
  const sessionDayDir = path.join(
    options.sessionsDir,
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  );
  const filePath = path.join(sessionDayDir, `rollout-${options.threadId}.jsonl`);
  const threadSpawn = options.parentThreadId
    ? {
        parent_thread_id: options.parentThreadId,
        agent_role: options.agentRole,
      }
    : undefined;

  mkdirSync(sessionDayDir, { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({
      timestamp: date.toISOString(),
      type: 'session_meta',
      payload: {
        id: options.threadId,
        timestamp: date.toISOString(),
        cwd: options.cwd,
        source: threadSpawn ? { subagent: { thread_spawn: threadSpawn } } : {},
        agent_role: options.agentRole,
      },
    })}\n`,
    'utf8'
  );
  utimesSync(filePath, date, date);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('CodexRuntimeSubagentService', () => {
  it('reads subagent metadata only from active Infilux runtime homes', async () => {
    const root = createTempRoot();
    const runtimeHome = path.join(root, 'runtime-home');
    const runtimeSessionsDir = path.join(runtimeHome, 'sessions');
    const unrelatedGlobalSessionsDir = path.join(root, 'global-codex', 'sessions');
    const now = Date.now();

    writeSessionMetaFile({
      sessionsDir: runtimeSessionsDir,
      threadId: 'root-runtime',
      timestampMs: now - 2_000,
      cwd: '/repo/runtime',
    });
    writeSessionMetaFile({
      sessionsDir: runtimeSessionsDir,
      threadId: 'child-runtime',
      timestampMs: now - 1_000,
      cwd: '/repo/runtime',
      parentThreadId: 'root-runtime',
      agentRole: 'explorer',
    });
    writeSessionMetaFile({
      sessionsDir: unrelatedGlobalSessionsDir,
      threadId: 'child-global',
      timestampMs: now - 500,
      cwd: '/repo/global',
      parentThreadId: 'root-global',
      agentRole: 'reviewer',
    });

    const service = new CodexRuntimeSubagentService({
      listActiveRuntimeHomePaths: () => [runtimeHome],
    });

    await expect(
      service.listSession({
        providerSessionId: 'root-runtime',
        cwd: '/repo/runtime',
      })
    ).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          threadId: 'child-runtime',
          rootThreadId: 'root-runtime',
          cwd: '/repo/runtime',
        }),
      ],
    });

    await expect(service.listLive({ cwds: ['/repo/global'] })).resolves.toEqual(
      expect.objectContaining({ items: [] })
    );
  });

  it('does not create a filesystem reader when no Codex runtime home is active', async () => {
    const service = new CodexRuntimeSubagentService({
      listActiveRuntimeHomePaths: () => [],
    });

    await expect(service.listLive()).resolves.toEqual({
      items: [],
      generatedAt: expect.any(Number),
    });
    await expect(service.listSession({ providerSessionId: 'root-1' })).resolves.toEqual({
      items: [],
      generatedAt: expect.any(Number),
    });
  });
});
