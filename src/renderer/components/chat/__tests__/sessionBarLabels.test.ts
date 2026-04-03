import { describe, expect, it } from 'vitest';
import { getSessionDisplayName, getSessionHoverTitle } from '../sessionBarLabels';

describe('sessionBarLabels', () => {
  it('keeps filtered display names for session tabs', () => {
    expect(
      getSessionDisplayName({
        name: 'Claude',
        terminalTitle: 'npm run dev',
      })
    ).toBe('Claude');

    expect(
      getSessionDisplayName({
        name: 'Claude',
        terminalTitle: 'Build dashboard',
      })
    ).toBe('Build dashboard');

    expect(
      getSessionDisplayName({
        name: '› Review auth flow',
      })
    ).toBe('Review auth flow');

    expect(
      getSessionDisplayName({
        name: 'Claude',
        terminalTitle: '› Build dashboard',
      })
    ).toBe('Build dashboard');
  });

  it('prefers the effective session title for hover copy when terminal titles are generic', () => {
    expect(
      getSessionHoverTitle({
        name: 'Fix dashboard filters',
        terminalTitle: 'npm run dev',
      })
    ).toBe('Fix dashboard filters');

    expect(
      getSessionHoverTitle({
        name: 'Review auth flow',
        terminalTitle: '/bin/zsh',
      })
    ).toBe('Review auth flow');
  });

  it('keeps meaningful terminal titles for hover copy', () => {
    expect(
      getSessionHoverTitle({
        name: 'Claude',
        terminalTitle: 'Build dashboard',
      })
    ).toBe('Build dashboard');

    expect(
      getSessionHoverTitle({
        name: 'Claude',
        terminalTitle: '› Build dashboard',
      })
    ).toBe('Build dashboard');
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
        terminalTitle: '   ',
      })
    ).toBe('Claude');
  });
});
