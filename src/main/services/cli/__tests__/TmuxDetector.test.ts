import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmuxDetectorTestDoubles = vi.hoisted(() => {
  const execInPty = vi.fn();
  const spawnSync = vi.fn();

  function reset() {
    execInPty.mockReset();
    spawnSync.mockReset();
  }

  return {
    execInPty,
    spawnSync,
    reset,
  };
});

vi.mock('../../../utils/shell', () => ({
  execInPty: tmuxDetectorTestDoubles.execInPty,
}));

vi.mock('node:child_process', () => ({
  spawnSync: tmuxDetectorTestDoubles.spawnSync,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

describe('TmuxDetector', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tmuxDetectorTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('checks tmux availability, parses versions, and respects the cache', async () => {
    setPlatform('darwin');
    tmuxDetectorTestDoubles.execInPty
      .mockResolvedValueOnce('tmux 3.4a')
      .mockResolvedValueOnce('tmux master');

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.check()).resolves.toEqual({
      installed: true,
      version: '3.4a',
    });
    await expect(tmuxDetector.check()).resolves.toEqual({
      installed: true,
      version: '3.4a',
    });
    await expect(tmuxDetector.check(true)).resolves.toEqual({
      installed: true,
      version: undefined,
    });

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(1, 'tmux -V', {
      timeout: 5000,
    });
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenCalledTimes(2);
  });

  it('returns not installed on failures and ignores kill command errors', async () => {
    setPlatform('linux');
    tmuxDetectorTestDoubles.execInPty
      .mockRejectedValueOnce(new Error('missing tmux'))
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('missing session'))
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('missing server'));
    tmuxDetectorTestDoubles.spawnSync.mockImplementationOnce(() => {
      throw new Error('sync failure');
    });

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.check()).resolves.toEqual({
      installed: false,
    });

    await expect(tmuxDetector.killSession('enso-session')).resolves.toBeUndefined();
    await expect(tmuxDetector.killSession('enso-session')).resolves.toBeUndefined();
    await expect(tmuxDetector.killServer()).resolves.toBeUndefined();
    await expect(tmuxDetector.killServer()).resolves.toBeUndefined();
    expect(() => tmuxDetector.killServerSync()).not.toThrow();

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      'tmux -L enso kill-session -t enso-session',
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      4,
      'tmux -L enso kill-server',
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.spawnSync).toHaveBeenCalledWith(
      'tmux',
      ['-L', 'enso', 'kill-server'],
      {
        timeout: 3000,
        stdio: 'ignore',
      }
    );
  });

  it('short-circuits all tmux operations on Windows', async () => {
    setPlatform('win32');

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.check()).resolves.toEqual({
      installed: false,
    });
    await expect(tmuxDetector.killSession('ignored')).resolves.toBeUndefined();
    await expect(tmuxDetector.killServer()).resolves.toBeUndefined();
    expect(() => tmuxDetector.killServerSync()).not.toThrow();

    expect(tmuxDetectorTestDoubles.execInPty).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.spawnSync).not.toHaveBeenCalled();
  });

  it('probes tmux session existence and treats missing sessions as false', async () => {
    setPlatform('linux');
    tmuxDetectorTestDoubles.execInPty
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('missing session'));

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.hasSession('enso-live')).resolves.toBe(true);
    await expect(tmuxDetector.hasSession('enso-missing')).resolves.toBe(false);

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      1,
      'tmux -L enso has-session -t enso-live',
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      'tmux -L enso has-session -t enso-missing',
      { timeout: 5000 }
    );
  });
});
