import { describe, expect, it } from 'vitest';
import { getSessionDisplayName, getSessionHoverTitle } from '../sessionBarLabels';

describe('sessionBarLabels', () => {
  it('uses stored session names instead of terminal titles for session tabs', () => {
    expect(
      getSessionDisplayName({
        name: 'Claude',
      })
    ).toBe('Claude');

    expect(
      getSessionDisplayName({
        name: 'Claude',
      })
    ).toBe('Claude');

    expect(
      getSessionDisplayName({
        name: '› Review auth flow',
      })
    ).toBe('Review auth flow');

    expect(
      getSessionDisplayName({
        name: 'Claude',
      })
    ).toBe('Claude');
  });

  it('keeps a canonical session name ahead of later terminal title changes', () => {
    expect(
      getSessionDisplayName({
        name: 'Investigate session recovery',
        agentId: 'codex',
      })
    ).toBe('Investigate session recovery');

    expect(
      getSessionHoverTitle({
        name: 'Investigate session recovery',
        agentId: 'codex',
      })
    ).toBe('Investigate session recovery');
  });

  it('preserves an explicit user title even when it resembles terminal noise', () => {
    expect(
      getSessionDisplayName({
        name: 'npm migration investigation',
        agentId: 'codex',
        userRenamed: true,
      })
    ).toBe('npm migration investigation');
  });

  it('ignores terminal titles that only repeat the agent default name', () => {
    expect(
      getSessionDisplayName({
        name: 'Codex',
        agentId: 'codex',
      })
    ).toBe('Codex');

    expect(
      getSessionDisplayName({
        name: 'Claude (Hapi)',
        agentId: 'claude-hapi',
      })
    ).toBe('Claude (Hapi)');
  });

  it('falls back when the terminal title is only whitespace or prompt chrome', () => {
    expect(
      getSessionDisplayName({
        name: 'Fix dashboard filters',
        agentId: 'codex',
      })
    ).toBe('Fix dashboard filters');

    expect(
      getSessionDisplayName({
        name: 'Review auth flow',
        agentId: 'codex',
      })
    ).toBe('Review auth flow');
  });

  it('falls back to the agent default when persisted recovery metadata no longer has a usable title', () => {
    expect(
      getSessionDisplayName({
        name: '›',
        agentId: 'codex',
      })
    ).toBe('Codex');

    expect(
      getSessionHoverTitle({
        name: '   ',
        agentId: 'claude-hapi',
      })
    ).toBe('Claude (Hapi)');

    expect(
      getSessionDisplayName({
        name: 'npm test',
        agentId: 'codex',
      })
    ).toBe('Codex');
  });

  it('prefers the effective session title for hover copy when terminal titles are generic', () => {
    expect(
      getSessionHoverTitle({
        name: 'Fix dashboard filters',
      })
    ).toBe('Fix dashboard filters');

    expect(
      getSessionHoverTitle({
        name: 'Review auth flow',
      })
    ).toBe('Review auth flow');
  });

  it('does not use meaningful terminal titles for hover copy', () => {
    expect(
      getSessionHoverTitle({
        name: 'Claude',
      })
    ).toBe('Claude');

    expect(
      getSessionHoverTitle({
        name: 'Claude',
      })
    ).toBe('Claude');
  });

  it('falls back to the session name when the title is missing', () => {
    expect(
      getSessionHoverTitle({
        name: 'Claude',
      })
    ).toBe('Claude');

    expect(
      getSessionHoverTitle({
        name: 'Claude',
      })
    ).toBe('Claude');
  });
});
