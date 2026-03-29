import { describe, expect, it } from 'vitest';
import { parseCodexSubagentTranscriptLines } from '../CodexSubagentTranscriptService';

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
});
