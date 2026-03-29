import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureRendererBridgeFallback } from '../electronBridgeFallback';

describe('electronBridgeFallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills missing namespaces with callable no-op bridge objects', async () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    vi.stubGlobal('window', {});

    ensureRendererBridgeFallback();

    const cleanup = window.electronAPI.remote.onStatusChange(() => {});

    expect(typeof cleanup).toBe('function');
    await expect(window.electronAPI.webInspector.start()).resolves.toBeUndefined();
    await expect(window.electronAPI.sessionStorage.get()).resolves.toEqual({});
    await expect(window.electronAPI.shell.detect()).resolves.toEqual([]);
    await expect(window.electronAPI.worktree.list('/repo')).resolves.toEqual([]);
    expect(window.electronAPI.env.platform).toBe('darwin');
  });

  it('does not overwrite an existing preload bridge', () => {
    const existingBridge = {
      env: {
        HOME: '/Users/test',
        platform: 'darwin',
        appVersion: '1.0.0',
      },
      sessionStorage: {
        get: vi.fn(),
      },
    };
    const windowLike = {};
    Object.defineProperty(windowLike, 'electronAPI', {
      value: existingBridge,
      configurable: true,
      enumerable: true,
      writable: false,
    });

    vi.stubGlobal('window', windowLike);

    expect(() => ensureRendererBridgeFallback()).not.toThrow();
    expect(window.electronAPI).toBe(existingBridge);
  });
});
