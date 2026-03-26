import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fileWatcherTestDoubles = vi.hoisted(() => {
  const unsubscribe = vi.fn(async () => undefined);
  const subscribe = vi.fn();
  let subscribeCallback:
    | ((
        err: Error | null,
        events: Array<{ type: 'create' | 'update' | 'delete'; path: string }>
      ) => void)
    | null = null;

  function reset() {
    unsubscribe.mockReset();
    subscribe.mockReset();
    subscribeCallback = null;

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
    get subscribeCallback() {
      return subscribeCallback;
    },
    reset,
  };
});

vi.mock('@parcel/watcher', () => ({
  subscribe: fileWatcherTestDoubles.subscribe,
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

    const { FileWatcher } = await import('../FileWatcher');
    const watcher = new FileWatcher('/repo', callback);

    await watcher.start();

    expect(fileWatcherTestDoubles.subscribe).toHaveBeenCalledWith('/repo', expect.any(Function), {
      ignore: ['node_modules', '.git', 'dist', 'out'],
      backend: 'windows',
    });

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

  it('logs watcher errors and safely ignores repeated stops', async () => {
    setPlatform('linux');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { FileWatcher } = await import('../FileWatcher');
    const watcher = new FileWatcher('/repo', vi.fn());

    await watcher.start();
    fileWatcherTestDoubles.subscribeCallback?.(new Error('watch failed'), []);

    expect(errorSpy).toHaveBeenCalledWith('File watcher error:', expect.any(Error));

    await watcher.stop();
    await watcher.stop();
    expect(fileWatcherTestDoubles.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
