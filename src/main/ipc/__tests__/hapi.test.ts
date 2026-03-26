import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;
type StatusListener<T> = (status: T) => void;

const hapiTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const windows: Array<{
    isDestroyed: ReturnType<typeof vi.fn>;
    webContents: { send: ReturnType<typeof vi.fn> };
  }> = [];

  const hapiListeners: Array<StatusListener<Record<string, unknown>>> = [];
  const runnerListeners: Array<StatusListener<Record<string, unknown>>> = [];
  const cloudflaredListeners: Array<StatusListener<Record<string, unknown>>> = [];

  let currentHapiStatus: Record<string, unknown> = { running: false };
  let currentRunnerStatus: Record<string, unknown> = { running: false };
  let currentCloudflaredStatus: Record<string, unknown> = {
    installed: false,
    running: false,
  };

  const resolveRepositoryRuntimeContext = vi.fn();
  const readSharedSettings = vi.fn();

  const remoteConnectionManager = {
    call: vi.fn(),
  };

  const hapiServerManager = {
    checkGlobalInstall: vi.fn(),
    checkHappyGlobalInstall: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    getStatus: vi.fn(() => currentHapiStatus),
    cleanup: vi.fn(),
    on: vi.fn((event: string, listener: StatusListener<Record<string, unknown>>) => {
      if (event === 'statusChanged') {
        hapiListeners.push(listener);
      }
    }),
  };

  const hapiRunnerManager = {
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(() => currentRunnerStatus),
    cleanup: vi.fn(),
    cleanupSync: vi.fn(),
    on: vi.fn((event: string, listener: StatusListener<Record<string, unknown>>) => {
      if (event === 'statusChanged') {
        runnerListeners.push(listener);
      }
    }),
  };

  const cloudflaredManager = {
    checkInstalled: vi.fn(),
    install: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    getStatus: vi.fn(() => currentCloudflaredStatus),
    cleanup: vi.fn(),
    on: vi.fn((event: string, listener: StatusListener<Record<string, unknown>>) => {
      if (event === 'statusChanged') {
        cloudflaredListeners.push(listener);
      }
    }),
  };

  function createWindow(destroyed = false) {
    return {
      isDestroyed: vi.fn(() => destroyed),
      webContents: {
        send: vi.fn(),
      },
    };
  }

  function setHapiStatus(status: Record<string, unknown>) {
    currentHapiStatus = status;
  }

  function setRunnerStatus(status: Record<string, unknown>) {
    currentRunnerStatus = status;
  }

  function setCloudflaredStatus(status: Record<string, unknown>) {
    currentCloudflaredStatus = status;
  }

  function emitHapiStatus(status: Record<string, unknown>) {
    currentHapiStatus = status;
    for (const listener of hapiListeners) {
      listener(status);
    }
  }

  function emitRunnerStatus(status: Record<string, unknown>) {
    currentRunnerStatus = status;
    for (const listener of runnerListeners) {
      listener(status);
    }
  }

  function emitCloudflaredStatus(status: Record<string, unknown>) {
    currentCloudflaredStatus = status;
    for (const listener of cloudflaredListeners) {
      listener(status);
    }
  }

  function reset() {
    handlers.clear();
    windows.length = 0;
    hapiListeners.length = 0;
    runnerListeners.length = 0;
    cloudflaredListeners.length = 0;

    currentHapiStatus = { running: false };
    currentRunnerStatus = { running: false };
    currentCloudflaredStatus = { installed: false, running: false };

    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockReturnValue({ kind: 'local' });

    readSharedSettings.mockReset();
    readSharedSettings.mockReturnValue({});

    remoteConnectionManager.call.mockReset();
    remoteConnectionManager.call.mockResolvedValue({ installed: true, remote: true });

    hapiServerManager.checkGlobalInstall.mockReset();
    hapiServerManager.checkGlobalInstall.mockResolvedValue({
      installed: true,
      version: '1.2.3',
    });
    hapiServerManager.checkHappyGlobalInstall.mockReset();
    hapiServerManager.checkHappyGlobalInstall.mockResolvedValue({
      installed: true,
      version: '2.3.4',
    });
    hapiServerManager.start.mockReset();
    hapiServerManager.start.mockImplementation(async (config: Record<string, unknown>) => ({
      running: true,
      port: config.webappPort,
    }));
    hapiServerManager.stop.mockReset();
    hapiServerManager.stop.mockResolvedValue({ running: false });
    hapiServerManager.restart.mockReset();
    hapiServerManager.restart.mockImplementation(async (config: Record<string, unknown>) => ({
      running: true,
      port: config.webappPort,
    }));
    hapiServerManager.getStatus.mockImplementation(() => currentHapiStatus);
    hapiServerManager.cleanup.mockReset();
    hapiServerManager.on.mockClear();

    hapiRunnerManager.start.mockReset();
    hapiRunnerManager.start.mockResolvedValue({ running: true, pid: 101 });
    hapiRunnerManager.stop.mockReset();
    hapiRunnerManager.stop.mockResolvedValue({ running: false });
    hapiRunnerManager.getStatus.mockImplementation(() => currentRunnerStatus);
    hapiRunnerManager.cleanup.mockReset();
    hapiRunnerManager.cleanup.mockResolvedValue(undefined);
    hapiRunnerManager.cleanupSync.mockReset();
    hapiRunnerManager.on.mockClear();

    cloudflaredManager.checkInstalled.mockReset();
    cloudflaredManager.checkInstalled.mockResolvedValue({
      installed: true,
      version: '2026.3.0',
    });
    cloudflaredManager.install.mockReset();
    cloudflaredManager.install.mockResolvedValue({
      installed: true,
      version: '2026.3.0',
    });
    cloudflaredManager.start.mockReset();
    cloudflaredManager.start.mockImplementation(async (config: Record<string, unknown>) => ({
      installed: true,
      running: true,
      url: `https://cf-${String(config.port)}.example.com`,
    }));
    cloudflaredManager.stop.mockReset();
    cloudflaredManager.stop.mockResolvedValue({ installed: true, running: false });
    cloudflaredManager.getStatus.mockImplementation(() => currentCloudflaredStatus);
    cloudflaredManager.cleanup.mockReset();
    cloudflaredManager.on.mockClear();
  }

  return {
    handlers,
    windows,
    createWindow,
    resolveRepositoryRuntimeContext,
    readSharedSettings,
    remoteConnectionManager,
    hapiServerManager,
    hapiRunnerManager,
    cloudflaredManager,
    setHapiStatus,
    setRunnerStatus,
    setCloudflaredStatus,
    emitHapiStatus,
    emitRunnerStatus,
    emitCloudflaredStatus,
    reset,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => hapiTestDoubles.windows),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      hapiTestDoubles.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../../services/hapi/CloudflaredManager', () => ({
  cloudflaredManager: hapiTestDoubles.cloudflaredManager,
}));

vi.mock('../../services/hapi/HapiRunnerManager', () => ({
  hapiRunnerManager: hapiTestDoubles.hapiRunnerManager,
}));

vi.mock('../../services/hapi/HapiServerManager', () => ({
  hapiServerManager: hapiTestDoubles.hapiServerManager,
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: hapiTestDoubles.remoteConnectionManager,
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: hapiTestDoubles.resolveRepositoryRuntimeContext,
}));

vi.mock('../../services/SharedSessionState', () => ({
  readSharedSettings: hapiTestDoubles.readSharedSettings,
}));

function getHandler(channel: string) {
  const handler = hapiTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('hapi IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    hapiTestDoubles.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registers global check handlers for local and remote repositories', async () => {
    const { registerHapiHandlers } = await import('../hapi');
    registerHapiHandlers();

    const hapiCheckGlobal = getHandler(IPC_CHANNELS.HAPI_CHECK_GLOBAL);
    const happyCheckGlobal = getHandler(IPC_CHANNELS.HAPPY_CHECK_GLOBAL);

    const localHapi = await hapiCheckGlobal({}, '/repo/local', true);
    const localHappy = await happyCheckGlobal({}, '/repo/local', false);

    expect(localHapi).toEqual({ installed: true, version: '1.2.3' });
    expect(localHappy).toEqual({ installed: true, version: '2.3.4' });
    expect(hapiTestDoubles.hapiServerManager.checkGlobalInstall).toHaveBeenCalledWith(true);
    expect(hapiTestDoubles.hapiServerManager.checkHappyGlobalInstall).toHaveBeenCalledWith(false);

    hapiTestDoubles.resolveRepositoryRuntimeContext.mockReturnValue({
      kind: 'remote',
      connectionId: 'conn-1',
    });
    hapiTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({ installed: true });
    hapiTestDoubles.remoteConnectionManager.call.mockResolvedValueOnce({ installed: false });

    expect(await hapiCheckGlobal({}, '/repo/remote', false)).toEqual({ installed: true });
    expect(await happyCheckGlobal({}, '/repo/remote', true)).toEqual({ installed: false });
    expect(hapiTestDoubles.remoteConnectionManager.call).toHaveBeenNthCalledWith(
      1,
      'conn-1',
      'hapi:checkGlobal',
      { forceRefresh: false }
    );
    expect(hapiTestDoubles.remoteConnectionManager.call).toHaveBeenNthCalledWith(
      2,
      'conn-1',
      'happy:checkGlobal',
      { forceRefresh: true }
    );
  });

  it('starts and restarts hapi, syncing the runner when enabled', async () => {
    hapiTestDoubles.setHapiStatus({ running: true, ready: true, port: 3006 });

    const { registerHapiHandlers } = await import('../hapi');
    registerHapiHandlers();

    const startHandler = getHandler(IPC_CHANNELS.HAPI_START);
    const restartHandler = getHandler(IPC_CHANNELS.HAPI_RESTART);
    const stopHandler = getHandler(IPC_CHANNELS.HAPI_STOP);

    const config = {
      webappPort: 3006,
      cliApiToken: 'cli-token',
      telegramBotToken: 'telegram-token',
      webappUrl: 'https://app.example.com',
      allowedChatIds: '1001',
      runnerEnabled: true,
    };

    expect(await startHandler({}, config)).toEqual({ running: true, port: 3006 });
    await Promise.resolve();
    await Promise.resolve();
    expect(hapiTestDoubles.hapiServerManager.start).toHaveBeenCalledWith({
      webappPort: 3006,
      cliApiToken: 'cli-token',
      telegramBotToken: 'telegram-token',
      webappUrl: 'https://app.example.com',
      allowedChatIds: '1001',
    });
    expect(hapiTestDoubles.hapiRunnerManager.start).toHaveBeenCalledTimes(1);

    expect(await restartHandler({}, config)).toEqual({ running: true, port: 3006 });
    await Promise.resolve();
    await Promise.resolve();
    expect(hapiTestDoubles.hapiRunnerManager.stop).toHaveBeenCalledTimes(1);
    expect(hapiTestDoubles.hapiServerManager.restart).toHaveBeenCalledWith({
      webappPort: 3006,
      cliApiToken: 'cli-token',
      telegramBotToken: 'telegram-token',
      webappUrl: 'https://app.example.com',
      allowedChatIds: '1001',
    });
    expect(hapiTestDoubles.hapiRunnerManager.start).toHaveBeenCalledTimes(2);

    expect(await stopHandler({})).toEqual({ running: false });
    expect(hapiTestDoubles.hapiRunnerManager.stop).toHaveBeenCalledTimes(2);
    expect(hapiTestDoubles.hapiServerManager.stop).toHaveBeenCalledTimes(1);
  });

  it('skips background runner sync when the server fails to start or never becomes ready', async () => {
    hapiTestDoubles.hapiServerManager.start.mockResolvedValueOnce({
      running: false,
      error: 'boom',
    });
    hapiTestDoubles.hapiServerManager.restart.mockResolvedValueOnce({
      running: true,
      port: 3007,
    });
    hapiTestDoubles.setHapiStatus({ running: true, ready: false, port: 3007 });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { registerHapiHandlers } = await import('../hapi');
    registerHapiHandlers();

    const startHandler = getHandler(IPC_CHANNELS.HAPI_START);
    const restartHandler = getHandler(IPC_CHANNELS.HAPI_RESTART);

    expect(
      await startHandler(
        {},
        {
          webappPort: 3006,
          cliApiToken: '',
          telegramBotToken: '',
          webappUrl: '',
          allowedChatIds: '',
          runnerEnabled: true,
        }
      )
    ).toEqual({ running: false, error: 'boom' });
    await Promise.resolve();
    expect(hapiTestDoubles.hapiRunnerManager.start).not.toHaveBeenCalled();

    const restartPromise = restartHandler(
      {},
      {
        webappPort: 3007,
        cliApiToken: '',
        telegramBotToken: '',
        webappUrl: '',
        allowedChatIds: '',
        runnerEnabled: true,
      }
    );
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60 * 500);
    expect(await restartPromise).toEqual({ running: true, port: 3007 });
    expect(hapiTestDoubles.hapiRunnerManager.start).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[hapi:runner] Skip start: hapi server is not ready');
  });

  it('handles runner start requests for stopped, waiting and ready servers', async () => {
    const { registerHapiHandlers } = await import('../hapi');
    registerHapiHandlers();

    const runnerStartHandler = getHandler(IPC_CHANNELS.HAPI_RUNNER_START);

    hapiTestDoubles.setHapiStatus({ running: false, ready: false });
    expect(await runnerStartHandler({})).toEqual({
      running: false,
      error: 'Hapi server is not running',
    });

    hapiTestDoubles.setHapiStatus({ running: true, ready: false });
    const notReadyPromise = runnerStartHandler({});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60 * 500);
    expect(await notReadyPromise).toEqual({
      running: false,
      error: 'Hapi server is not ready',
    });

    hapiTestDoubles.setHapiStatus({ running: true, ready: false });
    const readyPromise = runnerStartHandler({});
    await Promise.resolve();
    hapiTestDoubles.setHapiStatus({ running: true, ready: true });
    await vi.advanceTimersByTimeAsync(500);

    expect(await readyPromise).toEqual({ running: true, pid: 101 });
    expect(hapiTestDoubles.hapiRunnerManager.start).toHaveBeenCalledTimes(1);
  });

  it('registers status, cloudflared and event broadcast handlers', async () => {
    const liveWindow = hapiTestDoubles.createWindow(false);
    const destroyedWindow = hapiTestDoubles.createWindow(true);
    hapiTestDoubles.windows.push(liveWindow, destroyedWindow);
    hapiTestDoubles.setRunnerStatus({ running: true, pid: 999 });
    hapiTestDoubles.setCloudflaredStatus({ installed: true, running: true, url: 'https://old' });

    const { registerHapiHandlers } = await import('../hapi');
    registerHapiHandlers();

    const getStatusHandler = getHandler(IPC_CHANNELS.HAPI_GET_STATUS);
    const runnerStopHandler = getHandler(IPC_CHANNELS.HAPI_RUNNER_STOP);
    const runnerStatusHandler = getHandler(IPC_CHANNELS.HAPI_RUNNER_GET_STATUS);
    const cloudflaredCheckHandler = getHandler(IPC_CHANNELS.CLOUDFLARED_CHECK);
    const cloudflaredInstallHandler = getHandler(IPC_CHANNELS.CLOUDFLARED_INSTALL);
    const cloudflaredStartHandler = getHandler(IPC_CHANNELS.CLOUDFLARED_START);
    const cloudflaredStopHandler = getHandler(IPC_CHANNELS.CLOUDFLARED_STOP);
    const cloudflaredStatusHandler = getHandler(IPC_CHANNELS.CLOUDFLARED_GET_STATUS);

    expect(await getStatusHandler({})).toEqual({ running: false });
    expect(await runnerStopHandler({})).toEqual({ running: false });
    expect(await runnerStatusHandler({})).toEqual({ running: true, pid: 999 });
    expect(await cloudflaredCheckHandler({})).toEqual({ installed: true, version: '2026.3.0' });
    expect(await cloudflaredInstallHandler({})).toEqual({ installed: true, version: '2026.3.0' });
    expect(
      await cloudflaredStartHandler({}, { mode: 'quick', port: 3006, protocol: 'http2' })
    ).toEqual({
      installed: true,
      running: true,
      url: 'https://cf-3006.example.com',
    });
    expect(await cloudflaredStopHandler({})).toEqual({ installed: true, running: false });
    expect(await cloudflaredStatusHandler({})).toEqual({
      installed: true,
      running: true,
      url: 'https://old',
    });

    hapiTestDoubles.emitHapiStatus({ running: false, ready: false });
    hapiTestDoubles.emitRunnerStatus({ running: true, pid: 1234 });
    hapiTestDoubles.emitCloudflaredStatus({ installed: true, running: true, url: 'https://cf' });

    expect(hapiTestDoubles.hapiRunnerManager.stop).toHaveBeenCalledTimes(2);
    expect(liveWindow.webContents.send).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.HAPI_STATUS_CHANGED,
      { running: false, ready: false }
    );
    expect(liveWindow.webContents.send).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.HAPI_RUNNER_STATUS_CHANGED,
      { running: true, pid: 1234 }
    );
    expect(liveWindow.webContents.send).toHaveBeenNthCalledWith(
      3,
      IPC_CHANNELS.CLOUDFLARED_STATUS_CHANGED,
      { installed: true, running: true, url: 'https://cf' }
    );
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
  });

  it('cleans up hapi resources and continues after runner cleanup errors', async () => {
    hapiTestDoubles.hapiRunnerManager.cleanup.mockRejectedValueOnce(
      new Error('runner cleanup failed')
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { cleanupHapi, cleanupHapiSync } = await import('../hapi');

    await cleanupHapi(4321);
    cleanupHapiSync();

    expect(hapiTestDoubles.hapiRunnerManager.cleanup).toHaveBeenCalledWith(4321);
    expect(hapiTestDoubles.hapiRunnerManager.cleanupSync).toHaveBeenCalledTimes(1);
    expect(hapiTestDoubles.hapiServerManager.cleanup).toHaveBeenCalledTimes(2);
    expect(hapiTestDoubles.cloudflaredManager.cleanup).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      '[hapi:runner] Cleanup error:',
      expect.objectContaining({ message: 'runner cleanup failed' })
    );
  });

  it('auto-starts persisted hapi, runner and cloudflared settings and swallows startup failures', async () => {
    hapiTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          hapiSettings: {
            enabled: true,
            webappPort: 3010,
            cliApiToken: 'cli',
            telegramBotToken: 'telegram',
            webappUrl: 'https://webapp.example.com',
            allowedChatIds: '101,102',
            runnerEnabled: true,
            cfEnabled: true,
            tunnelMode: 'auth',
            tunnelToken: 'cf-token',
            useHttp2: true,
          },
        },
      },
    });
    hapiTestDoubles.setHapiStatus({ running: true, ready: true, port: 3010 });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { autoStartHapi } = await import('../hapi');

    await autoStartHapi();

    expect(hapiTestDoubles.hapiServerManager.start).toHaveBeenCalledWith({
      webappPort: 3010,
      cliApiToken: 'cli',
      telegramBotToken: 'telegram',
      webappUrl: 'https://webapp.example.com',
      allowedChatIds: '101,102',
    });
    expect(hapiTestDoubles.hapiRunnerManager.start).toHaveBeenCalledTimes(1);
    expect(hapiTestDoubles.cloudflaredManager.start).toHaveBeenCalledWith({
      mode: 'auth',
      port: 3010,
      token: 'cf-token',
      protocol: 'http2',
    });

    hapiTestDoubles.readSharedSettings.mockImplementationOnce(() => {
      throw new Error('broken settings');
    });

    await expect(autoStartHapi()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      '[hapi] Auto-start failed:',
      expect.objectContaining({ message: 'broken settings' })
    );
  });
});
