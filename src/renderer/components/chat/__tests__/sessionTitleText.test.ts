import { describe, expect, it } from 'vitest';
import {
  getCanonicalSessionName,
  getDefaultSessionName,
  getStoredSessionName,
  isUnusableSessionTitle,
  normalizeSessionTitleText,
} from '../sessionTitleText';

describe('sessionTitleText', () => {
  it('normalizes whitespace and strips prompt prefixes from session titles', () => {
    expect(normalizeSessionTitleText('   ')).toBe('');
    expect(normalizeSessionTitleText('  >   Review   this   change  ')).toBe('Review this change');
    expect(normalizeSessionTitleText('❯   Investigate    logs')).toBe('Investigate logs');
  });

  it('filters generic automatic title candidates', () => {
    expect(isUnusableSessionTitle()).toBe(true);
    expect(isUnusableSessionTitle('   ')).toBe(true);
    expect(isUnusableSessionTitle('/bin/zsh')).toBe(true);
    expect(isUnusableSessionTitle('root: /repo/worktree')).toBe(true);
    expect(isUnusableSessionTitle('npm test')).toBe(true);
    expect(isUnusableSessionTitle('codex(99841) MallocStackLogging')).toBe(true);
    expect(isUnusableSessionTitle('› codex(85487) MallocSt')).toBe(true);
    expect(isUnusableSessionTitle('> codex(85487) MallocStackLogging')).toBe(true);
    expect(isUnusableSessionTitle('  > Fix failing coverage  ')).toBe(false);
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

  it('does not derive canonical session names from terminal titles', () => {
    expect(
      getCanonicalSessionName({
        agentId: 'custom-agent-hapi',
        defaultName: 'Custom Agent (Hapi)',
        name: 'Custom Agent (Hapi)',
      })
    ).toBe('Custom Agent (Hapi)');

    expect(
      getCanonicalSessionName({
        agentId: 'custom-agent-happy',
        defaultName: 'Custom Agent (Happy)',
        name: 'Custom Agent (Happy)',
      })
    ).toBe('Custom Agent (Happy)');
  });
});
