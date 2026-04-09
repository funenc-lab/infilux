import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWindow {
  private emitter = new EventEmitter();
  private destroyed = false;
  public webContents = {
    send: vi.fn(),
  };

  on(event: string, listener: (...args: unknown[]) => void) {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void) {
    this.emitter.off(event, listener);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.emitter.emit(event, ...args);
  }

  isDestroyed() {
    return this.destroyed;
  }

  setDestroyed(value: boolean) {
    this.destroyed = value;
  }

  listenerCount(event: string) {
    return this.emitter.listenerCount(event);
  }
}

const updaterTestDoubles = vi.hoisted(() => {
  class MockEmitter {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    on(event: string, listener: (...args: unknown[]) => void) {
      const current = this.listeners.get(event) ?? [];
      current.push(listener);
      this.listeners.set(event, current);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
      return true;
    }

    removeAllListeners() {
      this.listeners.clear();
      return this;
    }
  }

  const autoUpdater = Object.assign(new MockEmitter(), {
    netSession: { id: 'updater-session' },
    logger: undefined as unknown,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  });
  const applyProxy = vi.fn();
  const registerUpdaterSession = vi.fn();
  const isDev = { value: false };

  function reset() {
    autoUpdater.removeAllListeners();
    autoUpdater.logger = undefined;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.checkForUpdates.mockReset();
    autoUpdater.checkForUpdates.mockResolvedValue(undefined);
    autoUpdater.downloadUpdate.mockReset();
    autoUpdater.downloadUpdate.mockResolvedValue(undefined);
    autoUpdater.quitAndInstall.mockReset();
    applyProxy.mockReset();
    applyProxy.mockResolvedValue(undefined);
    registerUpdaterSession.mockReset();
    isDev.value = false;
  }

  return {
    autoUpdater,
    applyProxy,
    registerUpdaterSession,
    isDev,
    reset,
  };
});

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: updaterTestDoubles.autoUpdater,
  },
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return updaterTestDoubles.isDev.value;
    },
  },
}));

vi.mock('../../proxy/ProxyConfig', () => ({
  applyProxy: updaterTestDoubles.applyProxy,
  registerUpdaterSession: updaterTestDoubles.registerUpdaterSession,
}));

describe('AutoUpdaterService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    updaterTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes updater wiring, seeds proxy state, and forwards updater events', async () => {
    updaterTestDoubles.isDev.value = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    updaterTestDoubles.applyProxy.mockRejectedValueOnce(new Error('proxy failed'));
    const { autoUpdaterService } = await import('../AutoUpdater');
    const window = new FakeWindow();

    autoUpdaterService.init(window as never, true, {
      enabled: true,
      server: 'http://127.0.0.1:7890',
      bypassList: 'localhost',
      useProxyForUpdates: true,
    });
    await Promise.resolve();

    expect(updaterTestDoubles.registerUpdaterSession).toHaveBeenCalledWith(
      updaterTestDoubles.autoUpdater.netSession
    );
    expect(updaterTestDoubles.applyProxy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Failed to seed proxy settings:', expect.any(Error));
    expect(updaterTestDoubles.autoUpdater.logger).toBe(console);
    expect(updaterTestDoubles.autoUpdater.autoDownload).toBe(true);
    expect(updaterTestDoubles.autoUpdater.autoInstallOnAppQuit).toBe(true);

    updaterTestDoubles.autoUpdater.emit('checking-for-update');
    updaterTestDoubles.autoUpdater.emit('update-available', { version: '1.2.0' });
    updaterTestDoubles.autoUpdater.emit('update-not-available', { version: '1.1.9' });
    updaterTestDoubles.autoUpdater.emit('download-progress', {
      percent: 42,
      bytesPerSecond: 2048,
      total: 100,
      transferred: 42,
    });
    updaterTestDoubles.autoUpdater.emit('update-downloaded', { version: '1.2.0' });
    updaterTestDoubles.autoUpdater.emit('error', new Error('ignored after download'));

    expect(window.webContents.send).toHaveBeenNthCalledWith(1, 'updater:status', {
      status: 'checking',
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(2, 'updater:status', {
      status: 'available',
      info: { version: '1.2.0' },
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(3, 'updater:status', {
      status: 'not-available',
      info: { version: '1.1.9' },
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(4, 'updater:status', {
      status: 'downloading',
      progress: {
        percent: 42,
        bytesPerSecond: 2048,
        total: 100,
        transferred: 42,
      },
    });
    expect(window.webContents.send).toHaveBeenNthCalledWith(5, 'updater:status', {
      status: 'downloaded',
      info: { version: '1.2.0' },
    });
    expect(window.webContents.send).toHaveBeenCalledTimes(5);
    expect(autoUpdaterService.isUpdateDownloaded()).toBe(true);
  });

  it('checks on startup and focus, respects debounce, and skips destroyed windows', async () => {
    vi.setSystemTime(new Date('2026-03-25T10:00:00Z'));
    const { autoUpdaterService } = await import('../AutoUpdater');
    const window = new FakeWindow();

    autoUpdaterService.init(window as never, true);
    expect(window.listenerCount('focus')).toBe(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-03-25T10:05:00Z'));
    window.emit('focus');
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-03-25T10:35:01Z'));
    window.emit('focus');
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    window.setDestroyed(true);
    updaterTestDoubles.autoUpdater.emit('checking-for-update');
    expect(window.webContents.send).not.toHaveBeenCalledWith('updater:status', {
      status: 'checking',
    });

    autoUpdaterService.cleanup();
    expect(window.listenerCount('focus')).toBe(0);
  });

  it('rebinds updater delivery and focus checks when init is called with a replacement window', async () => {
    const { autoUpdaterService } = await import('../AutoUpdater');
    const firstWindow = new FakeWindow();
    const secondWindow = new FakeWindow();

    autoUpdaterService.init(firstWindow as never, true);
    autoUpdaterService.init(secondWindow as never, true);

    expect(firstWindow.listenerCount('focus')).toBe(0);
    expect(secondWindow.listenerCount('focus')).toBe(1);

    updaterTestDoubles.autoUpdater.emit('checking-for-update');

    expect(firstWindow.webContents.send).not.toHaveBeenCalled();
    expect(secondWindow.webContents.send).toHaveBeenCalledTimes(1);
    expect(secondWindow.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'checking',
    });
  });

  it('returns the latest updater state snapshot for renderer consumers', async () => {
    const { autoUpdaterService } = await import('../AutoUpdater');
    const window = new FakeWindow();

    autoUpdaterService.init(window as never, false);

    expect(autoUpdaterService.getState()).toEqual({
      autoUpdateEnabled: false,
      status: null,
    });

    updaterTestDoubles.autoUpdater.emit('update-available', { version: '1.2.0' });
    expect(autoUpdaterService.getState()).toEqual({
      autoUpdateEnabled: false,
      status: {
        status: 'available',
        info: { version: '1.2.0' },
      },
    });

    autoUpdaterService.setAutoUpdateEnabled(true);
    expect(autoUpdaterService.getState()).toEqual({
      autoUpdateEnabled: true,
      status: {
        status: 'available',
        info: { version: '1.2.0' },
      },
    });

    updaterTestDoubles.autoUpdater.emit('update-downloaded', { version: '1.2.0' });
    updaterTestDoubles.autoUpdater.emit('error', new Error('ignored after download'));
    expect(autoUpdaterService.getState()).toEqual({
      autoUpdateEnabled: true,
      status: {
        status: 'downloaded',
        info: { version: '1.2.0' },
      },
    });
  });

  it('handles explicit checks, downloads, and quit-and-install transitions', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { autoUpdaterService } = await import('../AutoUpdater');
    const window = new FakeWindow();

    autoUpdaterService.init(window as never, false);
    await autoUpdaterService.checkForUpdates();
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    updaterTestDoubles.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('network down'));
    await expect(autoUpdaterService.checkForUpdates()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('Failed to check for updates:', expect.any(Error));

    updaterTestDoubles.autoUpdater.downloadUpdate.mockRejectedValueOnce(
      new Error('download failed')
    );
    await expect(autoUpdaterService.downloadUpdate()).rejects.toThrow('download failed');
    expect(errorSpy).toHaveBeenCalledWith('Failed to download update:', expect.any(Error));

    autoUpdaterService.quitAndInstall();
    expect(updaterTestDoubles.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    updaterTestDoubles.autoUpdater.emit('update-downloaded', { version: '1.3.0' });
    autoUpdaterService.quitAndInstall();
    expect(updaterTestDoubles.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(autoUpdaterService.isQuittingForUpdate()).toBe(true);

    updaterTestDoubles.autoUpdater.checkForUpdates.mockClear();
    await expect(autoUpdaterService.checkForUpdates()).resolves.toBeUndefined();
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('toggles auto-update scheduling and clears timers during cleanup', async () => {
    const { autoUpdaterService } = await import('../AutoUpdater');
    const window = new FakeWindow();

    autoUpdaterService.init(window as never, false);
    expect(updaterTestDoubles.autoUpdater.autoDownload).toBe(false);
    expect(updaterTestDoubles.autoUpdater.autoInstallOnAppQuit).toBe(false);

    autoUpdaterService.setAutoUpdateEnabled(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    autoUpdaterService.setAutoUpdateEnabled(false);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    autoUpdaterService.setAutoUpdateEnabled(true);
    autoUpdaterService.cleanup();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(updaterTestDoubles.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });
});
