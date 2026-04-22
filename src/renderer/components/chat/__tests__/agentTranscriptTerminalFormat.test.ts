import type { AgentSubagentTranscriptEntry } from '@shared/types';
import { describe, expect, it } from 'vitest';

import { formatAgentTranscriptForTerminal } from '../agentTranscriptTerminalFormat';

function createEntry(
  overrides: Partial<AgentSubagentTranscriptEntry> = {}
): AgentSubagentTranscriptEntry {
  return {
    id: 'entry-1',
    timestamp: Date.parse('2026-04-22T12:34:56.000Z'),
    kind: 'message',
    role: 'assistant',
    text: 'Inspecting the repository state.',
    ...overrides,
  };
}

describe('agentTranscriptTerminalFormat', () => {
  it('formats transcript entries with role markers and timestamps', () => {
    const output = formatAgentTranscriptForTerminal(
      [
        createEntry({
          id: 'entry-user',
          role: 'user',
          text: 'Review the failing tests',
        }),
        createEntry({
          id: 'entry-commentary',
          phase: 'commentary',
          text: 'I will inspect the test suite first.',
        }),
        createEntry({
          id: 'entry-tool',
          kind: 'tool_call',
          toolName: 'exec_command',
          text: 'pnpm test --filter chat',
        }),
        createEntry({
          id: 'entry-final',
          phase: 'final_answer',
          text: 'The regression is fixed.',
        }),
      ],
      {
        locale: 'en-US',
        timeZone: 'UTC',
      }
    );

    expect(output).toContain('[12:34:56 PM]');
    expect(output).toContain('>'); // Task
    expect(output).toContain('Task');
    expect(output).toContain('Update');
    expect(output).toContain('Tool call');
    expect(output).toContain('exec_command');
    expect(output).toContain('Final answer');
    expect(output).toContain('Review the failing tests');
    expect(output).toContain('pnpm test --filter chat');
    expect(output).toContain('\r\n\r\n');
    expect(output).toContain('\x1b[96m');
    expect(output).toContain('\x1b[93m');
    expect(output).toContain('\x1b[92m');
  });

  it('preserves multiline payloads and omits empty timestamps', () => {
    const output = formatAgentTranscriptForTerminal([
      createEntry({
        timestamp: 0,
        text: 'Line 1\n\nLine 3',
      }),
    ]);

    expect(output).not.toContain('[]');
    expect(output).toContain('Reply');
    expect(output).toContain('  Line 1\r\n  \r\n  Line 3');
  });
});
