import { afterEach, describe, expect, it, vi } from 'vitest';
import { onGitAutoFetchCompleted, setRendererGitAutoFetchEnabled } from '../electronGit';

describe('electronGit', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a noop cleanup when window is unavailable', () => {
    delete (globalThis as { window?: unknown }).window;

    const cleanup = onGitAutoFetchCompleted(() => {});

    expect(cleanup).toBeTypeOf('function');
    expect(() => cleanup()).not.toThrow();
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

  it('subscribes to auto-fetch completion and returns the original cleanup when available', () => {
    const cleanup = vi.fn();
    const onAutoFetchCompleted = vi.fn(() => cleanup);

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          onAutoFetchCompleted,
        },
      },
    });

    const callback = vi.fn();
    const returnedCleanup = onGitAutoFetchCompleted(callback);

    expect(onAutoFetchCompleted).toHaveBeenCalledWith(callback);
    expect(returnedCleanup).toBe(cleanup);
  });

  it('falls back to a noop cleanup when the listener does not return one', () => {
    const onAutoFetchCompleted = vi.fn(() => undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          onAutoFetchCompleted,
        },
      },
    });

    const cleanup = onGitAutoFetchCompleted(() => {});

    expect(onAutoFetchCompleted).toHaveBeenCalledTimes(1);
    expect(cleanup).toBeTypeOf('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('forwards auto-fetch enabled updates through the renderer git bridge', async () => {
    const setAutoFetchEnabled = vi.fn(async () => undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          setAutoFetchEnabled,
        },
      },
    });

    await setRendererGitAutoFetchEnabled(false);

    expect(setAutoFetchEnabled).toHaveBeenCalledWith(false);
  });
});
