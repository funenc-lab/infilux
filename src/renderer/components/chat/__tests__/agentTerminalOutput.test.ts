import { describe, expect, it } from 'vitest';
import { appendRecentAgentOutput, resolveCopyableAgentOutputBlock } from '../agentTerminalOutput';

describe('agentTerminalOutput', () => {
  it('keeps only the most recent output when the rolling buffer exceeds its limit', () => {
    expect(appendRecentAgentOutput('abcdef', 'ghijkl', 8)).toBe('efghijkl');
  });

  it('strips terminal control sequences and trailing prompts from copied output', () => {
    expect(
      resolveCopyableAgentOutputBlock(
        '\u001b[32mPlan updated\u001b[0m\r\nNext step ready\r\n\r\nuser@host ~/repo $ '
      )
    ).toBe('Plan updated\nNext step ready');
  });

  it('ignores prompt-only content that does not contain useful output', () => {
    expect(resolveCopyableAgentOutputBlock('user@host ~/repo $ ')).toBeNull();
    expect(resolveCopyableAgentOutputBlock('PS C:\\repo> ')).toBeNull();
  });
});
