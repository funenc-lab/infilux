import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeRunnerProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();

  emitStdout(value: string) {
    this.stdout.emit('data', Buffer.from(value));
  }

  emitStderr(value: string) {
    this.stderr.emit('data', Buffer.from(value));
  }

  emitError(error: Error) {
    this.emit('error', error);
  }

  emitExit(code: number | null) {
    this.emit('exit', code);
  }
}

const hapiRunnerTestDoubles = vi.hoisted(() => {
  const spawn = vi.fn();
  const spawnSync = vi.fn();
  const killProcessTree = vi.fn();
  const getEnvForCommand = vi.fn();
  const getShellForCommand = vi.fn();
  const getHapiCommand = vi.fn();
  const spawned: FakeRunnerProcess[] = [];

  function reset() {
    spawn.mockReset();
    spawnSync.mockReset();
    killProcessTree.mockReset();
    getEnvForCommand.mockReset();
    getShellForCommand.mockReset();
    getHapiCommand.mockReset();
    spawned.length = 0;

    getEnvForCommand.mockReturnValue({ PATH: '/mock/bin' });
    getShellForCommand.mockReturnValue({
      shell: '/bin/zsh',
      args: ['-lc'],
    });
    getHapiCommand.mockResolvedValue('hapi');
    spawnSync.mockReturnValue({ status: 0 });
    spawn.mockImplementation(() => {
      const child = new FakeRunnerProcess();
      spawned.push(child);
      return child;
    });
  }

  return {
    spawn,
    spawnSync,
    killProcessTree,
    getEnvForCommand,
    getShellForCommand,
    getHapiCommand,
    spawned,
    reset,
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: hapiRunnerTestDoubles.spawn,
    spawnSync: hapiRunnerTestDoubles.spawnSync,
  };
});

vi.mock('../../../utils/processUtils', () => ({
  killProcessTree: hapiRunnerTestDoubles.killProcessTree,
}));

vi.mock('../../../utils/shell', () => ({
  getEnvForCommand: hapiRunnerTestDoubles.getEnvForCommand,
  getShellForCommand: hapiRunnerTestDoubles.getShellForCommand,
}));

vi.mock('../HapiServerManager', () => ({
  hapiServerManager: {
    getHapiCommand: hapiRunnerTestDoubles.getHapiCommand,
  },
}));

describe('HapiRunnerManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    hapiRunnerTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts runner successfully, extracts pid, and caches emitted status', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const statuses: Array<Record<string, unknown>> = [];
    hapiRunnerManager.on('statusChanged', (status) => {
      statuses.push({ ...status });
    });

    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    const child = hapiRunnerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing runner process');
    }
    child.emitStdout('runner active pid: 9876');
    child.emitExit(0);

    await expect(startPromise).resolves.toEqual({
      running: true,
      pid: 9876,
    });
    expect(hapiRunnerTestDoubles.spawn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lc', 'hapi runner start'],
      {
        env: { PATH: '/mock/bin' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    expect(hapiRunnerManager.getStatus()).toEqual({
      running: true,
      pid: 9876,
    });
    expect(statuses).toEqual([
      {
        running: true,
        pid: 9876,
      },
    ]);
  });

  it('skips runner commands when no runner is active', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const stopSpy = vi.spyOn(hapiRunnerManager, 'stop').mockResolvedValue({ running: false });

    await hapiRunnerManager.cleanup(4567);
    hapiRunnerManager.cleanupSync();

    expect(stopSpy).not.toHaveBeenCalled();
    expect(hapiRunnerTestDoubles.spawn).not.toHaveBeenCalled();
  });

  it('does not run a stop command when runner startup failed', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    const child = hapiRunnerTestDoubles.spawned[0];
    if (!child) {
      throw new Error('Missing start process');
    }
    child.emitStderr('runner could not start');
    child.emitExit(1);
    await expect(startPromise).resolves.toEqual({
      running: false,
      error: 'runner could not start',
    });

    const stopSpy = vi.spyOn(hapiRunnerManager, 'stop').mockResolvedValue({ running: false });
    await hapiRunnerManager.cleanup(1000);
    hapiRunnerManager.cleanupSync();

    expect(stopSpy).not.toHaveBeenCalled();
    expect(hapiRunnerTestDoubles.spawn).toHaveBeenCalledTimes(1);
  });

  it('does not launch a runner after cleanup begins during command discovery', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    let resolveCommand: ((command: string) => void) | undefined;
    hapiRunnerTestDoubles.getHapiCommand.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveCommand = resolve;
        })
    );

    const startPromise = hapiRunnerManager.start();
    await Promise.resolve();
    await hapiRunnerManager.cleanup(1000);
    resolveCommand?.('hapi');
    await Promise.resolve();
    await Promise.resolve();
    hapiRunnerTestDoubles.spawned[0]?.emitExit(0);
    await startPromise;

    expect(hapiRunnerTestDoubles.spawn).not.toHaveBeenCalled();
    expect(hapiRunnerManager.getStatus()).toEqual({ running: false });
  });

  it('cancels a runner start command before stopping during cleanup', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    const startChild = hapiRunnerTestDoubles.spawned[0];
    if (!startChild) {
      throw new Error('Missing start process');
    }

    const cleanupPromise = hapiRunnerManager.cleanup(1000);
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[1]).toBeDefined();
    });
    const stopChild = hapiRunnerTestDoubles.spawned[1];
    if (!stopChild) {
      throw new Error('Missing stop process');
    }
    stopChild.emitStdout('already stopped');
    stopChild.emitExit(0);

    await cleanupPromise;
    await expect(startPromise).resolves.toEqual({ running: false });
    expect(hapiRunnerTestDoubles.killProcessTree).toHaveBeenCalledWith(startChild);
    expect(hapiRunnerManager.getStatus()).toEqual({ running: false });
  });

  it('stops a runner that exits its start command just before cleanup', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[0]?.emitExit(0);

    const cleanupPromise = hapiRunnerManager.cleanup(1000);
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[1]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[1]?.emitExit(0);

    await cleanupPromise;
    await expect(startPromise).resolves.toEqual({ running: false });
    expect(hapiRunnerManager.getStatus()).toEqual({ running: false });
  });

  it('retries cleanup when a running runner could not be confirmed stopped', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[0]?.emitExit(0);
    await startPromise;

    const stopPromise = hapiRunnerManager.stop(1000);
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[1]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[1]?.emitStderr('permission denied');
    hapiRunnerTestDoubles.spawned[1]?.emitExit(1);
    await expect(stopPromise).resolves.toEqual({ running: true, error: 'permission denied' });

    const cleanupPromise = hapiRunnerManager.cleanup(1000);
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[2]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[2]?.emitStdout('already stopped');
    hapiRunnerTestDoubles.spawned[2]?.emitExit(0);
    await cleanupPromise;

    expect(hapiRunnerManager.getStatus()).toEqual({ running: false });
  });

  it('stops a runner with a known PID before synchronous cleanup returns', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[0]?.emitStdout('runner active pid: 9876');
    hapiRunnerTestDoubles.spawned[0]?.emitExit(0);
    await startPromise;

    hapiRunnerManager.cleanupSync();

    expect(hapiRunnerTestDoubles.spawnSync).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lc', 'hapi runner stop'],
      { env: { PATH: '/mock/bin' }, stdio: 'ignore', timeout: 1500 }
    );
    expect(hapiRunnerManager.getStatus()).toEqual({ running: false });
  });

  it('runs a bounded synchronous stop when the runner PID is unknown', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    hapiRunnerTestDoubles.spawned[0]?.emitStderr('already running');
    hapiRunnerTestDoubles.spawned[0]?.emitExit(1);
    await startPromise;

    hapiRunnerManager.cleanupSync();

    expect(hapiRunnerTestDoubles.spawnSync).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-lc', 'hapi runner stop'],
      { env: { PATH: '/mock/bin' }, stdio: 'ignore', timeout: 1500 }
    );
    expect(hapiRunnerManager.getStatus()).toEqual({ running: false });
  });

  it('handles already-running output, stop errors, cleanup warning, and sync cleanup failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { hapiRunnerManager } = await import('../HapiRunnerManager');

    hapiRunnerTestDoubles.getHapiCommand.mockResolvedValue('npx -y @twsxtd/hapi');
    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    const startChild = hapiRunnerTestDoubles.spawned[0];
    if (!startChild) {
      throw new Error('Missing start process');
    }
    startChild.emitStderr('already running');
    startChild.emitExit(1);
    await expect(startPromise).resolves.toEqual({
      running: true,
      pid: undefined,
    });

    const stopPromise = hapiRunnerManager.stop(1234);
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[1]).toBeDefined();
    });
    const stopChild = hapiRunnerTestDoubles.spawned[1];
    if (!stopChild) {
      throw new Error('Missing stop process');
    }
    stopChild.emitStderr('runner still running');
    stopChild.emitExit(2);
    await expect(stopPromise).resolves.toEqual({
      running: true,
      pid: undefined,
      error: 'runner still running',
    });

    hapiRunnerTestDoubles.spawnSync.mockReturnValueOnce({
      status: null,
      error: new Error('sync failed'),
    });
    hapiRunnerManager.cleanupSync();
    expect(warnSpy).toHaveBeenCalledWith(
      '[hapi:runner] Sync cleanup failed:',
      expect.objectContaining({ message: 'sync failed' })
    );

    const cleanupPromise = hapiRunnerManager.cleanup(4567);
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[2]).toBeDefined();
    });
    const cleanupChild = hapiRunnerTestDoubles.spawned[2];
    if (!cleanupChild) {
      throw new Error('Missing cleanup process');
    }
    cleanupChild.emitStderr('failed to stop');
    cleanupChild.emitExit(3);
    await cleanupPromise;
    expect(warnSpy).toHaveBeenCalledWith('[hapi:runner] Cleanup warning:', 'failed to stop');
  });

  it('covers timeout, stopped-output success, explicit command errors, and emitted status changes', async () => {
    const { hapiRunnerManager } = await import('../HapiRunnerManager');
    const statuses: Array<Record<string, unknown>> = [];
    hapiRunnerManager.on('statusChanged', (status) => {
      statuses.push({ ...status });
    });

    const startPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[0]).toBeDefined();
    });
    const timedOutChild = hapiRunnerTestDoubles.spawned[0];
    if (!timedOutChild) {
      throw new Error('Missing timeout process');
    }
    await vi.advanceTimersByTimeAsync(120000);
    await expect(startPromise).resolves.toEqual({
      running: false,
      error: 'hapi runner start timed out',
    });
    expect(hapiRunnerTestDoubles.killProcessTree).toHaveBeenCalledWith(timedOutChild);

    const stopPromise = hapiRunnerManager.stop();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[1]).toBeDefined();
    });
    const stoppedChild = hapiRunnerTestDoubles.spawned[1];
    if (!stoppedChild) {
      throw new Error('Missing stopped process');
    }
    stoppedChild.emitStdout('already stopped');
    stoppedChild.emitExit(1);
    await expect(stopPromise).resolves.toEqual({
      running: false,
    });

    const errorPromise = hapiRunnerManager.start();
    await vi.waitFor(() => {
      expect(hapiRunnerTestDoubles.spawned[2]).toBeDefined();
    });
    const errorChild = hapiRunnerTestDoubles.spawned[2];
    if (!errorChild) {
      throw new Error('Missing error process');
    }
    errorChild.emitError(new Error('spawn crashed'));
    await expect(errorPromise).resolves.toEqual({
      running: false,
      error: 'spawn crashed',
    });

    expect(statuses).toContainEqual({
      running: false,
      error: 'hapi runner start timed out',
    });
    expect(statuses).toContainEqual({
      running: false,
    });
    expect(statuses).toContainEqual({
      running: false,
      error: 'spawn crashed',
    });
  });
});
