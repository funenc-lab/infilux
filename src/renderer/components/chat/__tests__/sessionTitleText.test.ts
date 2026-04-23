import { describe, expect, it } from 'vitest';
import {
  getDefaultSessionName,
  getMeaningfulTerminalTitle,
  getStoredSessionName,
  normalizeSessionTitleText,
} from '../sessionTitleText';

describe('sessionTitleText', () => {
  it('normalizes whitespace and strips prompt prefixes from session titles', () => {
    expect(normalizeSessionTitleText('   ')).toBe('');
    expect(normalizeSessionTitleText('  >   Review   this   change  ')).toBe('Review this change');
    expect(normalizeSessionTitleText('❯   Investigate    logs')).toBe('Investigate logs');
  });

  it('filters generic terminal titles and preserves meaningful ones', () => {
    expect(getMeaningfulTerminalTitle()).toBeUndefined();
    expect(getMeaningfulTerminalTitle('   ')).toBeUndefined();
    expect(getMeaningfulTerminalTitle('/bin/zsh')).toBeUndefined();
    expect(getMeaningfulTerminalTitle('root: /repo/worktree')).toBeUndefined();
    expect(getMeaningfulTerminalTitle('npm test')).toBeUndefined();
    expect(getMeaningfulTerminalTitle('  > Fix failing coverage  ')).toBe('Fix failing coverage');
  });

  it('derives default session names for builtin, suffixed, and unknown agents', () => {
    expect(getDefaultSessionName()).toBe('Agent');
    expect(getDefaultSessionName('claude')).toBe('Claude');
    expect(getDefaultSessionName('claude-hapi')).toBe('Claude (Hapi)');
    expect(getDefaultSessionName('cursor-happy')).toBe('Cursor (Happy)');
    expect(getDefaultSessionName('custom-agent')).toBe('custom-agent');
  });

  it('falls back to the agent default name when the stored title is empty after normalization', () => {
    expect(getStoredSessionName('  > Review PR  ', 'claude')).toBe('Review PR');
    expect(getStoredSessionName('   ', 'claude')).toBe('Claude');
    expect(getStoredSessionName('❯   ', 'custom-agent')).toBe('custom-agent');
  });
});
