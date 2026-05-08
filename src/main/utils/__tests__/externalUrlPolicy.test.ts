import { describe, expect, it } from 'vitest';
import { resolveAllowedExternalUrl } from '../externalUrlPolicy';

describe('resolveAllowedExternalUrl', () => {
  it('allows normalized http, https, and mailto URLs', () => {
    expect(resolveAllowedExternalUrl('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1'
    );
    expect(resolveAllowedExternalUrl('http://localhost:3000/docs')).toBe(
      'http://localhost:3000/docs'
    );
    expect(resolveAllowedExternalUrl('mailto:support@example.com')).toBe(
      'mailto:support@example.com'
    );
  });

  it('rejects unsupported schemes and embedded credentials', () => {
    expect(resolveAllowedExternalUrl('file:///tmp/demo')).toBeNull();
    expect(resolveAllowedExternalUrl('javascript:alert(1)')).toBeNull();
    expect(resolveAllowedExternalUrl('vscode://file/repo/a.ts')).toBeNull();
    expect(resolveAllowedExternalUrl('https://user:secret@example.com')).toBeNull();
  });

  it('rejects empty or whitespace-containing raw URLs', () => {
    expect(resolveAllowedExternalUrl('')).toBeNull();
    expect(resolveAllowedExternalUrl('   ')).toBeNull();
    expect(resolveAllowedExternalUrl('https://example.com/path with space')).toBeNull();
    expect(resolveAllowedExternalUrl('https://example.com/\nnext')).toBeNull();
  });
});
