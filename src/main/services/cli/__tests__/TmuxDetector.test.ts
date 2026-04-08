import { buildAppRuntimeIdentity } from '@shared/utils/runtimeIdentity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmuxDetectorTestDoubles = vi.hoisted(() => {
  const execInPty = vi.fn();
  const spawnSync = vi.fn();
  const rmSync = vi.fn();

  function reset() {
    execInPty.mockReset();
    spawnSync.mockReset();
    rmSync.mockReset();
  }

  return {
    execInPty,
    spawnSync,
    rmSync,
    reset,
  };
});

vi.mock('../../../utils/shell', () => ({
  execInPty: tmuxDetectorTestDoubles.execInPty,
}));

vi.mock('node:child_process', () => ({
  spawnSync: tmuxDetectorTestDoubles.spawnSync,
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    rmSync: tmuxDetectorTestDoubles.rmSync,
  };
});

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalRuntimeChannel = process.env.INFILUX_RUNTIME_CHANNEL;
const originalNodeEnv = process.env.NODE_ENV;
const originalVitest = process.env.VITEST;
const testRuntimeIdentity = buildAppRuntimeIdentity('test');

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
    process.env.INFILUX_RUNTIME_CHANNEL = 'test';
    process.env.NODE_ENV = 'test';
    process.env.VITEST = 'true';
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalRuntimeChannel === undefined) {
      delete process.env.INFILUX_RUNTIME_CHANNEL;
    } else {
      process.env.INFILUX_RUNTIME_CHANNEL = originalRuntimeChannel;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = originalVitest;
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
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' kill-session -t 'enso-session'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      4,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' kill-server`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.spawnSync).toHaveBeenCalledWith(
      'tmux',
      ['-L', testRuntimeIdentity.tmuxServerName, 'kill-server'],
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
    await expect(tmuxDetector.captureSessionHistory('ignored')).resolves.toBe('');
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
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' has-session -t 'enso-live'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' has-session -t 'enso-missing'`,
      { timeout: 5000 }
    );
  });

  it('keeps a healthy runtime server without resetting it', async () => {
    setPlatform('darwin');
    tmuxDetectorTestDoubles.execInPty.mockResolvedValueOnce('tmux 3.6a').mockResolvedValueOnce('');

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.ensureServerHealthy()).resolves.toBe(true);

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenCalledTimes(2);
    expect(tmuxDetectorTestDoubles.execInPty.mock.calls[1]?.[0]).toContain(
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' -f /dev/null new-session -d -s 'infilux-healthcheck-`
    );
    expect(tmuxDetectorTestDoubles.execInPty.mock.calls[1]?.[0]).toContain(
      `'printf infilux-healthcheck; sleep 1'`
    );
    expect(tmuxDetectorTestDoubles.spawnSync).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.rmSync).not.toHaveBeenCalled();
  });

  it('resets a broken runtime server, removes the stale socket, and retries the health check', async () => {
    setPlatform('darwin');
    tmuxDetectorTestDoubles.execInPty
      .mockResolvedValueOnce('tmux 3.6a')
      .mockRejectedValueOnce(new Error('broken server'))
      .mockResolvedValueOnce('');
    tmuxDetectorTestDoubles.spawnSync
      .mockReturnValueOnce({
        status: 0,
      })
      .mockReturnValueOnce({
        stdout: `12 tmux -L ${testRuntimeIdentity.tmuxServerName} attach-session -t broken\n`,
      });
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.ensureServerHealthy()).resolves.toBe(true);

    expect(tmuxDetectorTestDoubles.spawnSync).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['-L', testRuntimeIdentity.tmuxServerName, 'kill-server'],
      {
        timeout: 3000,
        stdio: 'ignore',
      }
    );
    expect(tmuxDetectorTestDoubles.spawnSync).toHaveBeenNthCalledWith(
      2,
      'ps',
      ['-ax', '-o', 'pid=', '-o', 'command='],
      {
        encoding: 'utf8',
        timeout: 3000,
      }
    );
    expect(killSpy).toHaveBeenCalledWith(12, 'SIGKILL');
    expect(tmuxDetectorTestDoubles.rmSync).toHaveBeenCalledWith(
      `/tmp/tmux-${process.getuid?.()}/${testRuntimeIdentity.tmuxServerName}`,
      { force: true }
    );
  });

  it('scrolls the active tmux pane history for a matching session and reports when no pane is found', async () => {
    setPlatform('darwin');
    tmuxDetectorTestDoubles.execInPty
      .mockResolvedValueOnce('%1\t0\t0\n%0\t1\t0\n')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-1',
        direction: 'up',
        amount: 5,
      })
    ).resolves.toEqual({
      applied: true,
      sessionName: 'enso-ui-session-1',
      paneId: '%0',
    });

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      1,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' list-panes -t 'enso-ui-session-1' -F '#{pane_id}\t#{pane_active}\t#{pane_in_mode}'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' copy-mode -eH -t '%0'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      3,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' send-keys -X -N 5 -t '%0' scroll-up`,
      { timeout: 5000 }
    );

    tmuxDetectorTestDoubles.execInPty.mockReset();
    tmuxDetectorTestDoubles.execInPty.mockResolvedValueOnce('%0\t1\t1\n').mockResolvedValueOnce('');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-1',
        direction: 'down',
        amount: 3,
      })
    ).resolves.toEqual({
      applied: true,
      sessionName: 'enso-ui-session-1',
      paneId: '%0',
    });

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      1,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' list-panes -t 'enso-ui-session-1' -F '#{pane_id}\t#{pane_active}\t#{pane_in_mode}'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' send-keys -X -N 3 -t '%0' scroll-down-and-cancel`,
      { timeout: 5000 }
    );

    tmuxDetectorTestDoubles.execInPty.mockReset();
    tmuxDetectorTestDoubles.execInPty.mockResolvedValueOnce('');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-1',
        direction: 'down',
        amount: 3,
      })
    ).resolves.toEqual({
      applied: false,
      sessionName: 'enso-ui-session-1',
    });

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenCalledTimes(1);
  });

  it('captures the active tmux pane history for a matching session and falls back to empty output', async () => {
    setPlatform('darwin');
    tmuxDetectorTestDoubles.execInPty
      .mockResolvedValueOnce('%1\t0\t0\n%0\t1\t0\n')
      .mockResolvedValueOnce('RECOVERY-LINE-001\nRECOVERY-LINE-002\n');

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.captureSessionHistory('enso-ui-session-1')).resolves.toBe(
      'RECOVERY-LINE-001\nRECOVERY-LINE-002\n'
    );

    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      1,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' list-panes -t 'enso-ui-session-1' -F '#{pane_id}\t#{pane_active}\t#{pane_in_mode}'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      `tmux -L '${testRuntimeIdentity.tmuxServerName}' capture-pane -p -e -J -S - -t '%0'`,
      { timeout: 5000 }
    );

    tmuxDetectorTestDoubles.execInPty.mockReset();
    tmuxDetectorTestDoubles.execInPty.mockResolvedValueOnce('');

    await expect(tmuxDetector.captureSessionHistory('enso-ui-session-1')).resolves.toBe('');
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenCalledTimes(1);
  });
});
