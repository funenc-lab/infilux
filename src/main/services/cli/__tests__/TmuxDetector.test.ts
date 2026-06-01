import { buildAppRuntimeIdentity } from '@shared/utils/runtimeIdentity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmuxDetectorTestDoubles = vi.hoisted(() => {
  const execFile = vi.fn();
  const execInPty = vi.fn();
  const getEnvForCommand = vi.fn(() => ({ PATH: '/usr/bin:/bin:/opt/homebrew/bin' }));
  const spawnSync = vi.fn();
  const rmSync = vi.fn();

  function reset() {
    execFile.mockReset();
    execInPty.mockReset();
    getEnvForCommand.mockReset();
    getEnvForCommand.mockReturnValue({ PATH: '/usr/bin:/bin:/opt/homebrew/bin' });
    spawnSync.mockReset();
    rmSync.mockReset();
  }

  return {
    execFile,
    execInPty,
    getEnvForCommand,
    spawnSync,
    rmSync,
    reset,
  };
});

vi.mock('../../../utils/shell', () => ({
  execInPty: tmuxDetectorTestDoubles.execInPty,
  getEnvForCommand: tmuxDetectorTestDoubles.getEnvForCommand,
}));

vi.mock('node:child_process', () => ({
  execFile: tmuxDetectorTestDoubles.execFile,
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
const testHomeDir = process.env.HOME || '/Users/test';
const testSocketPath = `${testHomeDir}/.infilux/tmux/${testRuntimeIdentity.tmuxServerName}.sock`;

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

function mockExecFileSuccess(stdout = '') {
  tmuxDetectorTestDoubles.execFile.mockImplementationOnce(
    (
      _file: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error | null, stdout: string) => void
    ) => {
      callback(null, stdout);
    }
  );
}

function mockExecFileFailure(
  error: Error & { code?: string | number; killed?: boolean },
  stderr = ''
) {
  tmuxDetectorTestDoubles.execFile.mockImplementationOnce(
    (
      _file: string,
      _args: string[],
      _options: Record<string, unknown>,
      callback: (error: Error, stdout: string, stderr: string) => void
    ) => {
      callback(error, '', stderr);
    }
  );
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
    mockExecFileSuccess('tmux 3.4a');
    mockExecFileSuccess('tmux master');

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

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['-V'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenCalledTimes(2);
  });

  it('returns not installed on failures and ignores kill command errors', async () => {
    setPlatform('linux');
    mockExecFileFailure(new Error('missing tmux'));
    mockExecFileSuccess();
    mockExecFileFailure(new Error('missing session'));
    tmuxDetectorTestDoubles.execInPty
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

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenCalledWith(
      'tmux',
      ['-S', testSocketPath, 'kill-session', '-t', 'enso-session'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(
      tmuxDetectorTestDoubles.execFile.mock.calls.filter((call) => call[1]?.[2] === 'kill-session')
    ).toHaveLength(2);
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      `tmux -S '${testSocketPath}' kill-server`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.spawnSync).toHaveBeenCalledWith(
      'tmux',
      ['-S', testSocketPath, 'kill-server'],
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
    mockExecFileSuccess();
    mockExecFileFailure(new Error('missing session'));

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.hasSession('enso-live')).resolves.toBe(true);
    await expect(tmuxDetector.hasSession('enso-missing')).resolves.toBe(false);

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['-S', testSocketPath, 'has-session', '-t', 'enso-live'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      2,
      'tmux',
      ['-S', testSocketPath, 'has-session', '-t', 'enso-missing'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
  });

  it('returns an explicit probe status for tmux session reconciliation', async () => {
    setPlatform('linux');
    mockExecFileSuccess();
    mockExecFileFailure(
      Object.assign(new Error('missing session'), { code: 1 }),
      "can't find session: enso-missing"
    );
    mockExecFileFailure(Object.assign(new Error('timeout'), { killed: true }));

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.probeSession('enso-live')).resolves.toBe('exists');
    await expect(tmuxDetector.probeSession('enso-missing')).resolves.toBe('missing');
    await expect(tmuxDetector.probeSession('enso-unknown')).resolves.toBe('failed');

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['-S', testSocketPath, 'has-session', '-t', 'enso-live'],
      expect.objectContaining({ encoding: 'utf8', timeout: 5000 }),
      expect.any(Function)
    );
  });

  it('preserves state when tmux session probing cannot reach the server', async () => {
    setPlatform('linux');
    mockExecFileFailure(
      Object.assign(new Error('tmux server unavailable'), { code: 1 }),
      `error connecting to ${testSocketPath} (No such file or directory)`
    );

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.probeSession('enso-unknown')).resolves.toBe('failed');
  });

  it('preserves state when tmux probing lacks a precise missing-session stderr', async () => {
    setPlatform('linux');
    mockExecFileFailure(new Error('Command exited with code 1'));

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.probeSession('enso-unknown')).resolves.toBe('failed');
  });

  it('keeps a healthy runtime server without resetting it', async () => {
    setPlatform('darwin');
    mockExecFileSuccess('tmux 3.6a');
    mockExecFileSuccess();
    mockExecFileSuccess();

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.ensureServerHealthy()).resolves.toBe(true);

    expect(tmuxDetectorTestDoubles.execInPty).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.execFile.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['-S', testSocketPath, '-f', '/dev/null', 'new-session', '-d', '-s'])
    );
    expect(tmuxDetectorTestDoubles.execFile.mock.calls[2]?.[1]).toEqual(
      expect.arrayContaining(['-S', testSocketPath, 'kill-session', '-t'])
    );
    expect(tmuxDetectorTestDoubles.spawnSync).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.rmSync).not.toHaveBeenCalled();
  });

  it('does not reset a broken runtime server from the recovery health check path', async () => {
    setPlatform('darwin');
    mockExecFileSuccess('tmux 3.6a');
    mockExecFileFailure(new Error('broken server'));
    mockExecFileSuccess();

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.ensureServerHealthy()).resolves.toBe(false);

    expect(tmuxDetectorTestDoubles.spawnSync).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.rmSync).not.toHaveBeenCalled();
  });

  it('rethrows resource exhaustion during tmux health checks without resetting the server', async () => {
    setPlatform('darwin');
    const error = new Error('spawn EAGAIN') as NodeJS.ErrnoException;
    error.code = 'EAGAIN';
    mockExecFileSuccess('tmux 3.6a');
    mockExecFileFailure(error);
    mockExecFileSuccess();

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(tmuxDetector.ensureServerHealthy()).rejects.toMatchObject({
      name: 'TmuxResourceExhaustionError',
      code: 'EAGAIN',
      message: `System resources exhausted while probing tmux server ${testRuntimeIdentity.tmuxServerName}`,
    });
    expect(tmuxDetectorTestDoubles.spawnSync).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.rmSync).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent runtime health checks for the same tmux server', async () => {
    setPlatform('darwin');
    let resolveFirstProbe: (() => void) | null = null;
    const firstProbe = new Promise<void>((resolve) => {
      resolveFirstProbe = resolve;
    });
    let healthcheckCount = 0;

    tmuxDetectorTestDoubles.execFile.mockImplementation(
      (
        _file: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void
      ) => {
        if (args.length === 1 && args[0] === '-V') {
          callback(null, 'tmux 3.6a');
          return;
        }

        if (args.includes('new-session')) {
          healthcheckCount += 1;
          if (healthcheckCount === 1) {
            void firstProbe.then(() => callback(null, ''));
            return;
          }
          callback(null, '');
          return;
        }

        callback(null, '');
      }
    );

    const { tmuxDetector } = await import('../TmuxDetector');

    const first = tmuxDetector.ensureServerHealthy();
    const second = tmuxDetector.ensureServerHealthy();

    await vi.waitFor(() => {
      expect(healthcheckCount).toBeGreaterThan(0);
    });

    expect(healthcheckCount).toBe(1);

    expect(resolveFirstProbe).not.toBeNull();
    resolveFirstProbe!();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(healthcheckCount).toBe(1);
    expect(tmuxDetectorTestDoubles.spawnSync).not.toHaveBeenCalled();
    expect(tmuxDetectorTestDoubles.rmSync).not.toHaveBeenCalled();
  });

  it('scrolls the active tmux pane history for a matching session and reports when no pane is found', async () => {
    setPlatform('darwin');
    mockExecFileSuccess('%1\t0\t0\n%0\t1\t0\n');
    mockExecFileSuccess();
    mockExecFileSuccess();

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-1',
        direction: 'up',
        amount: 5,
      })
    ).resolves.toEqual({
      applied: true,
      inMode: true,
      sessionName: 'enso-ui-session-1',
      paneId: '%0',
    });

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      1,
      'tmux',
      [
        '-S',
        testSocketPath,
        'list-panes',
        '-t',
        'enso-ui-session-1',
        '-F',
        '#{pane_id}\t#{pane_active}\t#{pane_in_mode}',
      ],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      2,
      'tmux',
      ['-S', testSocketPath, 'copy-mode', '-eH', '-t', '%0'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      3,
      'tmux',
      ['-S', testSocketPath, 'send-keys', '-X', '-N', '5', '-t', '%0', 'scroll-up'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );

    tmuxDetectorTestDoubles.execFile.mockReset();
    mockExecFileSuccess('%0\t1\t1\n');
    mockExecFileSuccess();
    mockExecFileSuccess('%0\t1\t0\n');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-2',
        direction: 'down',
        amount: 3,
      })
    ).resolves.toEqual({
      applied: true,
      inMode: false,
      sessionName: 'enso-ui-session-2',
      paneId: '%0',
    });

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      1,
      'tmux',
      [
        '-S',
        testSocketPath,
        'list-panes',
        '-t',
        'enso-ui-session-2',
        '-F',
        '#{pane_id}\t#{pane_active}\t#{pane_in_mode}',
      ],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      2,
      'tmux',
      ['-S', testSocketPath, 'send-keys', '-X', '-N', '3', '-t', '%0', 'scroll-down-and-cancel'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      3,
      'tmux',
      [
        '-S',
        testSocketPath,
        'list-panes',
        '-t',
        'enso-ui-session-2',
        '-F',
        '#{pane_id}\t#{pane_active}\t#{pane_in_mode}',
      ],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );

    tmuxDetectorTestDoubles.execFile.mockReset();
    mockExecFileSuccess('');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-missing',
        direction: 'down',
        amount: 3,
      })
    ).resolves.toEqual({
      applied: false,
      sessionName: 'enso-ui-session-missing',
    });

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenCalledTimes(1);
  });

  it('reuses the resolved pane during consecutive upward scroll requests for the same session', async () => {
    setPlatform('darwin');
    mockExecFileSuccess('%1\t0\t0\n%0\t1\t0\n');
    mockExecFileSuccess();
    mockExecFileSuccess();
    mockExecFileSuccess();

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-1',
        direction: 'up',
        amount: 5,
      })
    ).resolves.toEqual({
      applied: true,
      inMode: true,
      sessionName: 'enso-ui-session-1',
      paneId: '%0',
    });

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-1',
        direction: 'up',
        amount: 2,
      })
    ).resolves.toEqual({
      applied: true,
      inMode: true,
      sessionName: 'enso-ui-session-1',
      paneId: '%0',
    });

    expect(
      tmuxDetectorTestDoubles.execFile.mock.calls.filter((call) => call[1]?.includes('list-panes'))
    ).toHaveLength(1);
    expect(
      tmuxDetectorTestDoubles.execFile.mock.calls.filter((call) => call[1]?.includes('copy-mode'))
    ).toHaveLength(1);
    expect(
      tmuxDetectorTestDoubles.execFile.mock.calls.filter((call) => call[1]?.includes('send-keys'))
    ).toHaveLength(2);
  });

  it('cancels tmux copy mode when explicitly scrolling to the bottom', async () => {
    setPlatform('darwin');
    mockExecFileSuccess('%0\t1\t1\n');
    mockExecFileSuccess();

    const { tmuxDetector } = await import('../TmuxDetector');

    await expect(
      tmuxDetector.scrollClient({
        sessionName: 'enso-ui-session-3',
        direction: 'bottom',
      })
    ).resolves.toEqual({
      applied: true,
      inMode: false,
      sessionName: 'enso-ui-session-3',
      paneId: '%0',
    });

    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      1,
      'tmux',
      [
        '-S',
        testSocketPath,
        'list-panes',
        '-t',
        'enso-ui-session-3',
        '-F',
        '#{pane_id}\t#{pane_active}\t#{pane_in_mode}',
      ],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
    expect(tmuxDetectorTestDoubles.execFile).toHaveBeenNthCalledWith(
      2,
      'tmux',
      ['-S', testSocketPath, 'send-keys', '-X', '-t', '%0', 'cancel'],
      expect.objectContaining({ timeout: 5000 }),
      expect.any(Function)
    );
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
      `tmux -S '${testSocketPath}' list-panes -t 'enso-ui-session-1' -F '#{pane_id}\t#{pane_active}\t#{pane_in_mode}'`,
      { timeout: 5000 }
    );
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenNthCalledWith(
      2,
      `tmux -S '${testSocketPath}' capture-pane -p -e -J -S - -t '%0'`,
      { timeout: 5000 }
    );

    tmuxDetectorTestDoubles.execInPty.mockReset();
    tmuxDetectorTestDoubles.execInPty.mockResolvedValueOnce('');

    await expect(tmuxDetector.captureSessionHistory('enso-ui-session-1')).resolves.toBe('');
    expect(tmuxDetectorTestDoubles.execInPty).toHaveBeenCalledTimes(1);
  });
});
