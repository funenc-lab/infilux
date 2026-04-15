import { describe, expect, it } from 'vitest';
import { shouldEmitFileTreeRuntimeDiagnostics } from '../fileTreeDiagnosticsPolicy';

describe('shouldEmitFileTreeRuntimeDiagnostics', () => {
  it('returns true for development builds outside the test environment', () => {
    expect(
      shouldEmitFileTreeRuntimeDiagnostics({
        isDev: true,
        mode: 'development',
      })
    ).toBe(true);
  });

  it('returns false for test mode', () => {
    expect(
      shouldEmitFileTreeRuntimeDiagnostics({
        isDev: true,
        mode: 'test',
      })
    ).toBe(false);
  });

  it('returns false for packaged-style non-development builds', () => {
    expect(
      shouldEmitFileTreeRuntimeDiagnostics({
        isDev: false,
        mode: 'production',
      })
    ).toBe(false);
  });
});
