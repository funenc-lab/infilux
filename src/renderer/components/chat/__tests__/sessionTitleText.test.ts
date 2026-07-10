import { describe, expect, it } from 'vitest';
import {
  getCanonicalSessionName,
  getDefaultSessionName,
  getMeaningfulSessionTerminalTitle,
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
    expect(getMeaningfulTerminalTitle('codex(99841) MallocStackLogging')).toBeUndefined();
    expect(getMeaningfulTerminalTitle('› codex(85487) MallocSt')).toBeUndefined();
    expect(getMeaningfulTerminalTitle('> codex(85487) MallocStackLogging')).toBeUndefined();
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
    expect(getStoredSessionName('› codex(85487) MallocSt', 'codex')).toBe('Codex');
    expect(getStoredSessionName('codex(85487) MallocStackLogging', 'codex')).toBe('Codex');
    expect(getStoredSessionName('/bin/zsh', 'claude')).toBe('Claude');
    expect(getStoredSessionName('npm test', 'codex')).toBe('Codex');
    expect(getStoredSessionName('root: /repo/worktree', 'codex')).toBe('Codex');
  });

  it('uses the explicit default label for custom agent title promotion', () => {
    expect(
      getCanonicalSessionName({
        agentId: 'custom-agent-hapi',
        defaultName: 'Custom Agent (Hapi)',
        name: 'Custom Agent (Hapi)',
        terminalTitle: 'Investigate custom recovery',
      })
    ).toBe('Investigate custom recovery');

    expect(
      getMeaningfulSessionTerminalTitle('Custom Agent', 'custom-agent-hapi', 'Custom Agent (Hapi)')
    ).toBeUndefined();

    expect(
      getCanonicalSessionName({
        agentId: 'custom-agent-happy',
        defaultName: 'Custom Agent (Happy)',
        name: 'Custom Agent (Happy)',
        terminalTitle: 'Investigate happy recovery',
      })
    ).toBe('Investigate happy recovery');
  });
});
