import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CodexSubagentTranscriptService,
  parseCodexSubagentTranscriptLines,
} from '../CodexSubagentTranscriptService';

const TEMP_DIRECTORIES: string[] = [];

afterEach(async () => {
  await Promise.all(
    TEMP_DIRECTORIES.splice(0).map(async (dirPath) => {
      await rm(dirPath, { recursive: true, force: true });
    })
  );
});

describe('CodexSubagentTranscriptService', () => {
  it('parses subagent transcript lines after task start and skips bootstrap context', () => {
    const parsed = parseCodexSubagentTranscriptLines([
      JSON.stringify({
        timestamp: '2026-03-29T10:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: 'child-thread-1',
          cwd: '/repo/worktrees/feature-a',
          agent_nickname: 'Lorentz',
          agent_role: 'reviewer',
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: 'root-thread-1',
                agent_role: 'reviewer',
              },
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-29T10:00:00.100Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Bootstrap instructions should be ignored' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-29T10:00:01.000Z',
        type: 'event_msg',
        payload: { type: 'task_started' },
      }),
      JSON.stringify({
        timestamp: '2026-03-29T10:00:01.100Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Review the failing tests' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-29T10:00:02.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          phase: 'commentary',
          content: [{ type: 'output_text', text: 'I will inspect the test suite first.' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-29T10:00:03.000Z',
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          arguments: JSON.stringify({ cmd: 'pnpm test', workdir: '/repo/worktrees/feature-a' }),
        },
      }),
    ]);

    expect(parsed.meta).toMatchObject({
      threadId: 'child-thread-1',
      cwd: '/repo/worktrees/feature-a',
      parentThreadId: 'root-thread-1',
      agentNickname: 'Lorentz',
      agentType: 'reviewer',
    });

    expect(parsed.entries).toEqual([
      expect.objectContaining({
        kind: 'message',
        role: 'user',
        text: 'Review the failing tests',
      }),
      expect.objectContaining({
        kind: 'message',
        role: 'assistant',
        phase: 'commentary',
        text: 'I will inspect the test suite first.',
      }),
      expect.objectContaining({
        kind: 'tool_call',
        role: 'assistant',
        toolName: 'exec_command',
        text: 'exec_command: pnpm test · /repo/worktrees/feature-a',
      }),
    ]);
  });

  it('keeps only the latest transcript entries when a cap is provided', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-transcript-cap-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    const nestedDir = path.join(tempRoot, '2026', '03', '29');
    const threadId = 'thread-capped-session';
    const sessionFilePath = path.join(nestedDir, `${threadId}.jsonl`);
    const lines = [
      JSON.stringify({
        timestamp: '2026-03-29T10:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: threadId,
          cwd: '/repo/worktrees/feature-b',
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: 'root-thread-2',
              },
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-29T10:00:01.000Z',
        type: 'event_msg',
        payload: { type: 'task_started' },
      }),
      ...Array.from({ length: 5 }, (_, index) =>
        JSON.stringify({
          timestamp: `2026-03-29T10:00:0${index + 2}.000Z`,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: `Entry ${index + 1}` }],
          },
        })
      ),
    ];

    await mkdir(nestedDir, { recursive: true });
    await writeFile(sessionFilePath, `${lines.join('\n')}\n`, 'utf8');

    const service = new CodexSubagentTranscriptService(tempRoot, 3);
    const result = await service.getTranscript({ threadId });

    expect(result.entries.map((entry) => entry.text)).toEqual(['Entry 3', 'Entry 4', 'Entry 5']);
    expect(result).toMatchObject({
      truncated: true,
      omittedEntryCount: 2,
    });
  });

  it('returns only the latest transcript entries from disk for long sessions', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'codex-transcript-test-'));
    TEMP_DIRECTORIES.push(tempRoot);

    const nestedDir = path.join(tempRoot, '2026', '03', '30');
    const threadId = 'thread-long-session';
    const sessionFilePath = path.join(nestedDir, `${threadId}.jsonl`);

    const lines = [
      JSON.stringify({
        timestamp: '2026-03-30T08:00:00.000Z',
        type: 'session_meta',
        payload: {
          id: threadId,
          cwd: '/repo/worktrees/feature-c',
          agent_role: 'worker',
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: 'root-thread-3',
                agent_role: 'worker',
              },
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-03-30T08:00:01.000Z',
        type: 'event_msg',
        payload: { type: 'task_started' },
      }),
      ...Array.from({ length: 250 }, (_, index) =>
        JSON.stringify({
          timestamp: `2026-03-30T08:01:${String(index).padStart(2, '0')}.000Z`,
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: `Long entry ${index}` }],
          },
        })
      ),
    ];

    await mkdir(nestedDir, { recursive: true });
    await writeFile(sessionFilePath, `${lines.join('\n')}\n`, 'utf8');

    const service = new CodexSubagentTranscriptService(tempRoot);
    const result = await service.getTranscript({ threadId });

    expect(result.entries).toHaveLength(200);
    expect(result.entries[0]?.text).toBe('Long entry 50');
    expect(result.entries.at(-1)?.text).toBe('Long entry 249');
    expect(result).toMatchObject({
      truncated: true,
      omittedEntryCount: 50,
    });
  });
});
