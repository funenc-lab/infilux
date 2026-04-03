import { describe, expect, it } from 'vitest';
import { isClaudeWorkspaceTrustPrompt } from '../claudeTrustPrompt';

describe('isClaudeWorkspaceTrustPrompt', () => {
  it('matches the Claude workspace trust prompt output', () => {
    expect(
      isClaudeWorkspaceTrustPrompt(`Accessing workspace:

/Users/test/repo

Quick safety check: Is this a project you created or one you trust?
Security guide
1. Yes, I trust this folder
Enter to confirm`)
    ).toBe(true);
  });

  it('ignores unrelated Claude output', () => {
    expect(
      isClaudeWorkspaceTrustPrompt(`Claude Code v2.1.81

? for shortcuts`)
    ).toBe(false);
  });
});
