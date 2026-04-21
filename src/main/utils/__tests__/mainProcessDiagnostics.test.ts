import { beforeEach, describe, expect, it, vi } from 'vitest';

const diagnosticsTestDoubles = vi.hoisted(() => {
  const execFile = vi.fn();
  const logError = vi.fn();
  const logWarn = vi.fn();
  const logInfo = vi.fn();
  const getLogDiagnostics = vi.fn();
  const mkdir = vi.fn();
  const writeFile = vi.fn();
  const appGetPath = vi.fn();

  function reset() {
    execFile.mockReset();
    logError.mockReset();
    logWarn.mockReset();
    logInfo.mockReset();
    getLogDiagnostics.mockReset();
    mkdir.mockReset();
    writeFile.mockReset();
    appGetPath.mockReset();

    execFile.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(
          null,
          ['p123', 'fcwd', 'tDIR', 'f1', 'tKQUEUE', 'f2', 'tKQUEUE', 'f3', 'tREG'].join('\n'),
          ''
        );
      }
    );
    getLogDiagnostics.mockResolvedValue({
      path: '/tmp/logs/infilux-2026-04-21.log',
      lines: ['line-1', 'line-2'],
    });
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    appGetPath.mockImplementation((name: string) => {
      if (name === 'logs') {
        return '/tmp/logs';
      }
      return '/tmp';
    });
  }

  return {
    execFile,
    logError,
    logWarn,
    logInfo,
    getLogDiagnostics,
    mkdir,
    writeFile,
    appGetPath,
    reset,
  };
});

vi.mock('node:child_process', () => ({
  execFile: diagnosticsTestDoubles.execFile,
}));

vi.mock('../logger', () => ({
  default: {
    error: diagnosticsTestDoubles.logError,
    warn: diagnosticsTestDoubles.logWarn,
    info: diagnosticsTestDoubles.logInfo,
  },
  getLogDiagnostics: diagnosticsTestDoubles.getLogDiagnostics,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: diagnosticsTestDoubles.mkdir,
  writeFile: diagnosticsTestDoubles.writeFile,
}));

vi.mock('electron', () => ({
  app: {
    getPath: diagnosticsTestDoubles.appGetPath,
  },
}));

describe('mainProcessDiagnostics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    diagnosticsTestDoubles.reset();
  });

  it('captures process resources, collector snapshots, and open fd summaries', async () => {
    const diagnostics = await import('../mainProcessDiagnostics');
    diagnostics.resetMainProcessDiagnosticsForTests();
    diagnostics.registerMainProcessDiagnosticsCollector('watchers', () => ({
      localWatcherCount: 4,
    }));

    const snapshot = await diagnostics.captureMainProcessDiagnosticsSnapshot(750);

    expect(snapshot.pid).toBe(process.pid);
    expect(snapshot.memoryUsage.rssBytes).toBeGreaterThan(0);
    expect(snapshot.activeResources.total).toBeGreaterThanOrEqual(0);
    expect(snapshot.sources).toEqual({
      watchers: {
        localWatcherCount: 4,
      },
    });
    expect(snapshot.openFileDescriptors).toEqual({
      total: 4,
      byType: {
        DIR: 1,
        KQUEUE: 2,
        REG: 1,
      },
      command: 'lsof',
      timeoutMs: 750,
    });
  });

  it('throttles repeated capture requests and logs suppressed counts on the next sample', async () => {
    const diagnostics = await import('../mainProcessDiagnostics');
    diagnostics.resetMainProcessDiagnosticsForTests();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T07:00:00.000Z'));

    const firstId = diagnostics.requestMainProcessDiagnosticsCapture({
      event: 'git-spawn-failed',
      context: { cwd: '/repo' },
      throttleKey: 'git-spawn-failed:EBADF',
      cooldownMs: 1000,
    });
    const secondId = diagnostics.requestMainProcessDiagnosticsCapture({
      event: 'git-spawn-failed',
      context: { cwd: '/repo' },
      throttleKey: 'git-spawn-failed:EBADF',
      cooldownMs: 1000,
    });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(firstId).toMatch(/^mpd-/);
    expect(secondId).toBeNull();
    expect(diagnosticsTestDoubles.logError).toHaveBeenCalledTimes(1);
    expect(diagnosticsTestDoubles.logError).toHaveBeenLastCalledWith(
      'Main process diagnostics snapshot',
      expect.objectContaining({
        suppressedSinceLastCapture: 0,
      })
    );

    vi.setSystemTime(new Date('2026-04-21T07:00:01.500Z'));
    const thirdId = diagnostics.requestMainProcessDiagnosticsCapture({
      event: 'git-spawn-failed',
      context: { cwd: '/repo' },
      throttleKey: 'git-spawn-failed:EBADF',
      cooldownMs: 1000,
    });

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(thirdId).toMatch(/^mpd-/);
    expect(diagnosticsTestDoubles.logError).toHaveBeenCalledTimes(2);
    expect(diagnosticsTestDoubles.logError).toHaveBeenLastCalledWith(
      'Main process diagnostics snapshot',
      expect.objectContaining({
        suppressedSinceLastCapture: 1,
      })
    );

    vi.useRealTimers();
  });

  it('records lsof failures without aborting the snapshot', async () => {
    diagnosticsTestDoubles.execFile.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        const error = new Error('spawn EBADF') as NodeJS.ErrnoException;
        error.code = 'EBADF';
        callback(error, '', '');
      }
    );

    const diagnostics = await import('../mainProcessDiagnostics');
    diagnostics.resetMainProcessDiagnosticsForTests();
    const snapshot = await diagnostics.captureMainProcessDiagnosticsSnapshot(250);

    expect(snapshot.openFileDescriptors).toEqual({
      total: null,
      byType: {},
      command: 'lsof',
      timeoutMs: 250,
      error: 'spawn EBADF',
      errorCode: 'EBADF',
    });
  });

  it('persists a lightweight diagnostics bundle automatically for EBADF failures', async () => {
    const diagnostics = await import('../mainProcessDiagnostics');
    diagnostics.resetMainProcessDiagnosticsForTests();

    const error = new Error('spawn EBADF') as NodeJS.ErrnoException;
    error.code = 'EBADF';

    const diagnosticsId = diagnostics.requestMainProcessDiagnosticsCapture({
      event: 'git-spawn-failed',
      context: { cwd: '/repo' },
      error,
      throttleKey: 'git-spawn-failed:EBADF',
    });

    await vi.waitFor(() => {
      expect(diagnosticsTestDoubles.mkdir).toHaveBeenCalledTimes(1);
    });

    expect(diagnosticsId).toMatch(/^mpd-/);
    expect(diagnosticsTestDoubles.writeFile).toHaveBeenCalledTimes(3);
    expect(diagnosticsTestDoubles.getLogDiagnostics).toHaveBeenCalledWith(160);
    expect(diagnosticsTestDoubles.logError).toHaveBeenCalledWith(
      'Main process diagnostics snapshot',
      expect.objectContaining({
        diagnosticsId,
        persistedSnapshotDir: expect.stringContaining('/tmp/logs/auto-diagnostics/'),
        persistenceError: null,
      })
    );
  });
});
