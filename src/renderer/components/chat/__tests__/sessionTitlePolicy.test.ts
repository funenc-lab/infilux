import { describe, expect, it } from 'vitest';
import { resolveSessionTitleFromFirstInput } from '../sessionTitlePolicy';

describe('sessionTitlePolicy', () => {
  it('adopts the first meaningful input when the session still uses its default name', () => {
    expect(
      resolveSessionTitleFromFirstInput({
        line: '  Fix   SessionBar   hover title  ',
        currentName: 'Codex',
        defaultName: 'Codex',
      })
    ).toBe('Fix SessionBar hover title');
  });

  it('keeps the existing title when the session was renamed or already promoted', () => {
    expect(
      resolveSessionTitleFromFirstInput({
        line: 'Investigate contrast',
        currentName: 'Investigate contrast',
        defaultName: 'Codex',
      })
    ).toBeNull();

    expect(
      resolveSessionTitleFromFirstInput({
        line: 'Investigate contrast',
        currentName: 'Codex',
        defaultName: 'Codex',
        userRenamed: true,
      })
    ).toBeNull();
  });

  it('ignores slash commands and sessions that already have a terminal title', () => {
    expect(
      resolveSessionTitleFromFirstInput({
        line: '/clear',
        currentName: 'Codex',
        defaultName: 'Codex',
      })
    ).toBeNull();

    expect(
      resolveSessionTitleFromFirstInput({
        line: 'Fix SessionBar hover title',
        currentName: 'Codex',
        defaultName: 'Codex',
        terminalTitle: 'Build dashboard',
      })
    ).toBeNull();
  });
});
