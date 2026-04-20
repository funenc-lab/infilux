import { describe, expect, it } from 'vitest';
import { resolveXtermRenderer } from '../xtermRendererPolicy';

describe('xtermRendererPolicy', () => {
  it('keeps the requested renderer when compatibility mode is disabled', () => {
    expect(
      resolveXtermRenderer({
        requestedRenderer: 'webgl',
        preferCompatibilityRenderer: false,
      })
    ).toBe('webgl');
  });

  it('falls back to the dom renderer when compatibility mode is enabled for webgl', () => {
    expect(
      resolveXtermRenderer({
        requestedRenderer: 'webgl',
        preferCompatibilityRenderer: true,
      })
    ).toBe('dom');
  });

  it('preserves the dom renderer when compatibility mode is enabled', () => {
    expect(
      resolveXtermRenderer({
        requestedRenderer: 'dom',
        preferCompatibilityRenderer: true,
      })
    ).toBe('dom');
  });
});
