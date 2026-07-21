import { describe, expect, it } from 'vitest';
import { resolveSessionTitleFromTrustedUserMessage } from '../sessionTitlePolicy';

describe('sessionTitlePolicy', () => {
  it('adopts a trusted user message when the session still uses its default name', () => {
    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: '  Fix   SessionBar   hover title  ',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBe('Fix SessionBar hover title');

    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: '  ›   Fix   SessionBar   hover title  ',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBe('Fix SessionBar hover title');
  });

  it('keeps the existing title when the session was renamed or already promoted', () => {
    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: 'Investigate contrast',
        currentName: 'Investigate contrast',
        defaultName: 'Codex',
        titleSource: 'provider-transcript',
      })
    ).toBeNull();

    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: 'Investigate contrast',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'manual',
        userRenamed: true,
      })
    ).toBeNull();
  });

  it('does not require terminal state to name a session from a trusted message', () => {
    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: 'Fix SessionBar hover title',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBe('Fix SessionBar hover title');
  });

  it('ignores slash commands without interpreting terminal output', () => {
    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: '/clear',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBeNull();
  });

  it('does not promote generic user commands as titles', () => {
    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: '› codex(85487) MallocSt',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBeNull();

    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: 'npm test',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBeNull();

    expect(
      resolveSessionTitleFromTrustedUserMessage({
        text: '/bin/zsh',
        currentName: 'Codex',
        defaultName: 'Codex',
        titleSource: 'default',
      })
    ).toBeNull();
  });
});
