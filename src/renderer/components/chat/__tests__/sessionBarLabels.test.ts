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
  });

  it('prefers the current terminal title for hover copy', () => {
    expect(
      getSessionHoverTitle({
        name: 'Claude',
        terminalTitle: 'npm run dev',
      })
    ).toBe('npm run dev');
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
