import { describe, expect, it } from 'vitest';
import { sanitizeRuntimeProfileName } from '../runtimeProfile';

describe('runtimeProfile utilities', () => {
  it('sanitizes readable profile names for runtime isolation', () => {
    expect(sanitizeRuntimeProfileName(' feature/branch ')).toBe('feature-branch');
    expect(sanitizeRuntimeProfileName('release candidate #1')).toBe('release-candidate-1');
  });

  it('falls back when the sanitized profile name would be empty', () => {
    expect(sanitizeRuntimeProfileName('   ')).toBe('');
    expect(sanitizeRuntimeProfileName(' !!! ')).toBe('');
  });
});
