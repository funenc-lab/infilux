import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentProviderSessionService } from '../AgentProviderSessionService';

const TEMP_DIRECTORIES: string[] = [];

afterEach(async () => {
  await Promise.all(
    TEMP_DIRECTORIES.splice(0).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    })
  );
});

async function writeCodexSessionFile(params: {
  rootDir: string;
  dayPath: string;
  threadId: string;
  cwd: string;
  timestamp: string;
}): Promise<void> {
  const targetDir = path.join(params.rootDir, params.dayPath);
  await mkdir(targetDir, { recursive: true });
  await writeFile(
    path.join(targetDir, `rollout-${params.dayPath.replaceAll('/', '-')}-${params.threadId}.jsonl`),
    `${JSON.stringify({
      timestamp: params.timestamp,
      type: 'session_meta',
      payload: {
        id: params.threadId,
        cwd: params.cwd,
        timestamp: params.timestamp,
      },
    })}\n`,
    'utf8'
  );
}

describe('AgentProviderSessionService', () => {
  it('resolves the nearest codex provider session id for the same cwd inside the startup window', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-session-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-stale-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T02:10:00.000Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-wrong-cwd',
      cwd: '/repo/worktree-b',
      timestamp: '2026-04-07T02:28:19.000Z',
    });
    await writeCodexSessionFile({
      rootDir: tempRoot,
      dayPath: '2026/04/07',
      threadId: 'codex-current-session',
      cwd: '/repo/worktree-a',
      timestamp: '2026-04-07T02:28:16.200Z',
    });

    const service = new AgentProviderSessionService(tempRoot);
    const result = await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-07T02:28:10.000Z'),
      observedAt: Date.parse('2026-04-07T02:28:18.000Z'),
    });

    expect(result).toEqual({
      providerSessionId: 'codex-current-session',
    });
  });

  it('returns null when the agent command does not support provider session discovery', async () => {
    const service = new AgentProviderSessionService('/tmp/non-existent-agent-provider-sessions');

    await expect(
      service.resolveProviderSession({
        agentCommand: 'claude',
        cwd: '/repo/worktree-a',
        createdAt: Date.now(),
        observedAt: Date.now(),
      })
    ).resolves.toEqual({
      providerSessionId: null,
    });
  });
});
