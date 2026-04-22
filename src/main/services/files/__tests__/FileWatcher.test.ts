import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fileWatcherTestDoubles = vi.hoisted(() => {
  const unsubscribe = vi.fn(async () => undefined);
  const subscribe = vi.fn();
  const requestMainProcessDiagnosticsCapture = vi.fn(() => 'diag-file-watch');
  const logError = vi.fn();
  const resolveModulePath = vi.fn();
  let subscribeCallback:
    | ((
        err: Error | null,
        events: Array<{ type: 'create' | 'update' | 'delete'; path: string }>
      ) => void)
    | null = null;

  function reset() {
    unsubscribe.mockReset();
    subscribe.mockReset();
    requestMainProcessDiagnosticsCapture.mockReset();
    logError.mockReset();
    resolveModulePath.mockReset();
    subscribeCallback = null;

    requestMainProcessDiagnosticsCapture.mockReturnValue('diag-file-watch');
    resolveModulePath.mockImplementation((target: string) => {
      if (target === '@parcel/watcher') {
        return '/repo/node_modules/@parcel/watcher/index.js';
      }
      if (target === '@parcel/watcher-win32-x64') {
        return '/repo/node_modules/@parcel/watcher-win32-x64/index.node';
      }
      throw new Error(`Cannot resolve ${target}`);
    });
    unsubscribe.mockResolvedValue(undefined);
    subscribe.mockImplementation(
      async (
        _dirPath: string,
        callback: typeof subscribeCallback,
        _options: Record<string, unknown>
      ) => {
        subscribeCallback = callback;
        return {
          unsubscribe,
        };
      }
    );
  }

  return {
    subscribe,
    unsubscribe,
    requestMainProcessDiagnosticsCapture,
    logError,
    resolveModulePath,
    get subscribeCallback() {
      return subscribeCallback;
    },
    reset,
  };
});

vi.mock('@parcel/watcher', () => ({
  subscribe: fileWatcherTestDoubles.subscribe,
}));

vi.mock('node:module', () => ({
  createRequire: () => ({
    resolve: fileWatcherTestDoubles.resolveModulePath,
  }),
}));

vi.mock('../../../utils/mainProcessDiagnostics', () => ({
  requestMainProcessDiagnosticsCapture: fileWatcherTestDoubles.requestMainProcessDiagnosticsCapture,
}));

vi.mock('../../../utils/logger', () => ({
  default: {
    error: fileWatcherTestDoubles.logError,
  },
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

describe('FileWatcher', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fileWatcherTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    vi.restoreAllMocks();
  });

  it('subscribes with platform-specific options and forwards file events', async () => {
    setPlatform('win32');
    const callback = vi.fn();

    const { FileWatcher, resolveFileWatcherBackendHint } = await import('../FileWatcher');
    const watcher = new FileWatcher('/repo', callback);

    await watcher.start();

    expect(fileWatcherTestDoubles.subscribe).toHaveBeenCalledWith('/repo', expect.any(Function), {
      ignore: ['node_modules', '.git', 'dist', 'out'],
      backend: 'windows',
    });
    expect(resolveFileWatcherBackendHint()).toBe('windows');
    expect(watcher.getRuntimeInfo()).toEqual(
      expect.objectContaining({
        backendHint: 'windows',
        inferredBackend: 'windows',
        inferenceSource: 'Explicit backend option for Windows',
      })
    );

    fileWatcherTestDoubles.subscribeCallback?.(null, [
      { type: 'create', path: '/repo/new.ts' },
      { type: 'update', path: '/repo/existing.ts' },
      { type: 'delete', path: '/repo/old.ts' },
    ]);

    expect(callback).toHaveBeenNthCalledWith(1, 'create', '/repo/new.ts');
    expect(callback).toHaveBeenNthCalledWith(2, 'update', '/repo/existing.ts');
    expect(callback).toHaveBeenNthCalledWith(3, 'delete', '/repo/old.ts');

    await watcher.stop();
    expect(fileWatcherTestDoubles.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('logs watcher runtime errors and safely ignores repeated stops', async () => {
    setPlatform('linux');

    const { FileWatcher } = await import('../FileWatcher');
    const watcher = new FileWatcher('/repo', vi.fn());

    await watcher.start();
    fileWatcherTestDoubles.subscribeCallback?.(new Error('watch failed'), []);

    expect(fileWatcherTestDoubles.requestMainProcessDiagnosticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'file-watcher-runtime-error',
        context: expect.objectContaining({
          dirPath: '/repo',
          runtimeInfo: expect.objectContaining({
            backendHint: 'native-default',
            inferredBackend: 'default',
          }),
        }),
      })
    );
    expect(fileWatcherTestDoubles.logError).toHaveBeenCalledWith(
      'File watcher runtime error',
      expect.objectContaining({
        diagnosticsId: 'diag-file-watch',
        dirPath: '/repo',
        runtimeInfo: expect.objectContaining({
          backendHint: 'native-default',
          inferredBackend: 'default',
        }),
      })
    );

    await watcher.stop();
    await watcher.stop();
    expect(fileWatcherTestDoubles.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('logs subscribe failures with diagnostics and rethrows the error', async () => {
    setPlatform('linux');
    fileWatcherTestDoubles.subscribe.mockRejectedValueOnce(new Error('subscribe failed'));

    const { FileWatcher } = await import('../FileWatcher');
    const watcher = new FileWatcher('/repo/failing', vi.fn());

    await expect(watcher.start()).rejects.toThrow('subscribe failed');
    expect(fileWatcherTestDoubles.requestMainProcessDiagnosticsCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'file-watcher-subscribe-failed',
        context: expect.objectContaining({
          dirPath: '/repo/failing',
          runtimeInfo: expect.objectContaining({
            backendHint: 'native-default',
            inferredBackend: 'default',
          }),
        }),
      })
    );
    expect(fileWatcherTestDoubles.logError).toHaveBeenCalledWith(
      'File watcher subscribe failed',
      expect.objectContaining({
        diagnosticsId: 'diag-file-watch',
        dirPath: '/repo/failing',
        runtimeInfo: expect.objectContaining({
          backendHint: 'native-default',
          inferredBackend: 'default',
        }),
      })
    );
  });
});
