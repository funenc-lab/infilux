import type { ReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEMP_DIRECTORIES: string[] = [];

afterEach(async () => {
  vi.doUnmock('node:fs');
  vi.resetModules();

  await Promise.all(
    TEMP_DIRECTORIES.splice(0).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    })
  );
});

function trackReadStreams(trackedStreams: ReadStream[]) {
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return {
      ...actual,
      createReadStream: vi.fn(
        (filePath: string, options?: Parameters<typeof actual.createReadStream>[1]) => {
          const stream = actual.createReadStream(filePath, options);
          trackedStreams.push(stream);
          return stream;
        }
      ),
    };
  });
}

async function waitForCleanup(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('agent session stream cleanup', () => {
  it('closes codex provider session discovery streams after resolving', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-provider-stream-cleanup-'));
    TEMP_DIRECTORIES.push(tempRoot);

    const targetDir = path.join(tempRoot, '2026', '04', '08');
    await mkdir(targetDir, { recursive: true });
    await writeFile(
      path.join(targetDir, 'rollout-2026-04-08-provider-session.jsonl'),
      `${JSON.stringify({
        timestamp: '2026-04-08T16:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'provider-session-thread',
          cwd: '/repo/worktree-a',
          timestamp: '2026-04-08T16:00:00.000Z',
        },
      })}\n`,
      'utf8'
    );

    const trackedStreams: ReadStream[] = [];
    trackReadStreams(trackedStreams);

    const { AgentProviderSessionService } = await import('../AgentProviderSessionService');
    const service = new AgentProviderSessionService(tempRoot);
    await service.resolveProviderSession({
      agentCommand: 'codex',
      cwd: '/repo/worktree-a',
      createdAt: Date.parse('2026-04-08T15:59:58.000Z'),
      observedAt: Date.parse('2026-04-08T16:00:01.000Z'),
    });

    await waitForCleanup();

    expect(trackedStreams.length).toBeGreaterThan(0);
    expect(trackedStreams.every((stream) => stream.closed || stream.destroyed)).toBe(true);
  });

  it('closes codex transcript streams after loading transcript entries', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-transcript-stream-cleanup-'));
    TEMP_DIRECTORIES.push(tempRoot);

    const targetDir = path.join(tempRoot, '2026', '04', '08');
    await mkdir(targetDir, { recursive: true });
    await writeFile(
      path.join(targetDir, 'rollout-2026-04-08-thread-cleanup-check.jsonl'),
      `${[
        JSON.stringify({
          timestamp: '2026-04-08T16:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'thread-cleanup-check',
            cwd: '/repo/worktree-a',
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-08T16:00:01.000Z',
          type: 'event_msg',
          payload: { type: 'task_started' },
        }),
        JSON.stringify({
          timestamp: '2026-04-08T16:00:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Transcript entry' }],
          },
        }),
      ].join('\n')}\n`,
      'utf8'
    );

    const trackedStreams: ReadStream[] = [];
    trackReadStreams(trackedStreams);

    const { CodexSubagentTranscriptService } = await import('../CodexSubagentTranscriptService');
    const service = new CodexSubagentTranscriptService(tempRoot);
    await service.getTranscript({ threadId: 'thread-cleanup-check' });

    await waitForCleanup();

    expect(trackedStreams.length).toBeGreaterThan(0);
    expect(trackedStreams.every((stream) => stream.closed || stream.destroyed)).toBe(true);
  });
});
