import { afterEach, describe, expect, it, vi } from 'vitest';
import { onGitAutoFetchCompleted, setRendererGitAutoFetchEnabled } from '../electronGit';

describe('electronGit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a noop cleanup when the auto-fetch listener is unavailable', () => {
    vi.stubGlobal('window', {});

    const cleanup = onGitAutoFetchCompleted(() => {});

    expect(cleanup).toBeTypeOf('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('skips toggling auto-fetch when the git bridge is unavailable', async () => {
    vi.stubGlobal('window', {});

    await expect(setRendererGitAutoFetchEnabled(true)).resolves.toBeUndefined();
  });
});
