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
  const killProcessTree = vi.fn();
  const getEnvForCommand = vi.fn();
  const getShellForCommand = vi.fn();
  const getHapiCommand = vi.fn();
  const spawned: FakeRunnerProcess[] = [];

  function reset() {
    spawn.mockReset();
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
    spawn.mockImplementation(() => {
      const child = new FakeRunnerProcess();
      spawned.push(child);
      return child;
    });
  }

  return {
    spawn,
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

    vi.spyOn(hapiRunnerManager, 'stop').mockRejectedValueOnce(new Error('sync failed'));
    hapiRunnerManager.cleanupSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith('[hapi:runner] Sync cleanup failed:', expect.any(Error));
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
