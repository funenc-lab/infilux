import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

type NotificationListener = () => void;

const handlerTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();

  const detectApps = vi.fn();
  const openPathWithApp = vi.fn();
  const getAppIcon = vi.fn();
  const validateLocalPath = vi.fn();
  const getRecentProjects = vi.fn();
  const applyProxy = vi.fn();
  const testProxy = vi.fn();

  const isRemoteVirtualPath = vi.fn((input: string) => input.startsWith('/__remote__/'));
  const remoteSearchFiles = vi.fn();
  const remoteSearchContent = vi.fn();

  const searchFiles = vi.fn();
  const searchContent = vi.fn();

  const shellOpenPath = vi.fn();
  const appGetPath = vi.fn();
  const initLogger = vi.fn();
  const logInfo = vi.fn();
  const logError = vi.fn();
  const logGetFile = vi.fn();
  const getLogDiagnostics = vi.fn();

  const notificationInstances: Array<{
    options: { title: string; body?: string; silent?: boolean };
    show: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    listeners: Map<string, NotificationListener>;
  }> = [];
  const browserWindowFromWebContents = vi.fn();

  const webInspectorStart = vi.fn();
  const webInspectorStop = vi.fn();
  const webInspectorGetStatus = vi.fn();

  const updaterCheckForUpdates = vi.fn();
  const updaterQuitAndInstall = vi.fn();
  const updaterDownloadUpdate = vi.fn();
  const updaterSetAutoUpdateEnabled = vi.fn();

  const loadProfiles = vi.fn();
  const saveProfile = vi.fn();
  const deleteProfile = vi.fn();
  const testConnection = vi.fn();
  const connect = vi.fn();
  const disconnect = vi.fn();
  const getStatus = vi.fn();
  const listDirectory = vi.fn();
  const getHelperStatus = vi.fn();
  const installHelperManually = vi.fn();
  const updateHelper = vi.fn();
  const deleteHelper = vi.fn();
  const browseRoots = vi.fn();
  const respondAuthPrompt = vi.fn();

  function createNotification(options: { title: string; body?: string; silent?: boolean }) {
    const listeners = new Map<string, NotificationListener>();
    const instance = {
      options,
      show: vi.fn(),
      on: vi.fn((event: string, listener: NotificationListener) => {
        listeners.set(event, listener);
      }),
      listeners,
    };
    notificationInstances.push(instance);
    return instance;
  }

  function emitNotification(index: number, event: string) {
    notificationInstances[index]?.listeners.get(event)?.();
  }

  function reset() {
    handlers.clear();

    detectApps.mockReset();
    detectApps.mockResolvedValue([{ name: 'VS Code' }]);
    openPathWithApp.mockReset();
    openPathWithApp.mockResolvedValue(undefined);
    getAppIcon.mockReset();
    getAppIcon.mockResolvedValue('icon-data');
    validateLocalPath.mockReset();
    validateLocalPath.mockResolvedValue({ valid: true });
    getRecentProjects.mockReset();
    getRecentProjects.mockResolvedValue(['/repo/a', '/repo/b']);
    applyProxy.mockReset();
    applyProxy.mockReturnValue({ ok: true });
    testProxy.mockReset();
    testProxy.mockReturnValue({ ok: true, latency: 12 });

    isRemoteVirtualPath.mockReset();
    isRemoteVirtualPath.mockImplementation((input: string) => input.startsWith('/__remote__/'));
    remoteSearchFiles.mockReset();
    remoteSearchFiles.mockResolvedValue([{ path: 'remote.ts' }]);
    remoteSearchContent.mockReset();
    remoteSearchContent.mockResolvedValue([{ path: 'remote.ts', line: 3 }]);

    searchFiles.mockReset();
    searchFiles.mockResolvedValue([{ path: 'local.ts' }]);
    searchContent.mockReset();
    searchContent.mockResolvedValue([{ path: 'local.ts', line: 7 }]);

    shellOpenPath.mockReset();
    shellOpenPath.mockResolvedValue('');
    appGetPath.mockReset();
    appGetPath.mockReturnValue('/tmp/logs');
    initLogger.mockReset();
    logInfo.mockReset();
    logError.mockReset();
    logGetFile.mockReset();
    logGetFile.mockReturnValue({ path: '/tmp/logs/app.log' });
    getLogDiagnostics.mockReset();
    getLogDiagnostics.mockResolvedValue({
      path: '/tmp/logs/app.log',
      lines: ['[info] hello', '[error] world'],
    });

    notificationInstances.length = 0;
    browserWindowFromWebContents.mockReset();

    webInspectorStart.mockReset();
    webInspectorStart.mockResolvedValue({ running: true, port: 9229 });
    webInspectorStop.mockReset();
    webInspectorStop.mockResolvedValue(undefined);
    webInspectorGetStatus.mockReset();
    webInspectorGetStatus.mockReturnValue({ running: true, port: 9229 });

    updaterCheckForUpdates.mockReset();
    updaterCheckForUpdates.mockResolvedValue(undefined);
    updaterQuitAndInstall.mockReset();
    updaterDownloadUpdate.mockReset();
    updaterDownloadUpdate.mockResolvedValue(undefined);
    updaterSetAutoUpdateEnabled.mockReset();

    loadProfiles.mockReset();
    loadProfiles.mockResolvedValue([{ id: 'profile-1' }]);
    saveProfile.mockReset();
    saveProfile.mockResolvedValue({ id: 'profile-2' });
    deleteProfile.mockReset();
    deleteProfile.mockResolvedValue(undefined);
    testConnection.mockReset();
    testConnection.mockResolvedValue({ ok: true });
    connect.mockReset();
    connect.mockResolvedValue({ connectionId: 'conn-1' });
    disconnect.mockReset();
    disconnect.mockResolvedValue(undefined);
    getStatus.mockReset();
    getStatus.mockResolvedValue({ connected: true });
    listDirectory.mockReset();
    listDirectory.mockResolvedValue([{ path: '/tmp' }]);
    getHelperStatus.mockReset();
    getHelperStatus.mockResolvedValue({ installed: true });
    installHelperManually.mockReset();
    installHelperManually.mockResolvedValue({ installed: true });
    updateHelper.mockReset();
    updateHelper.mockResolvedValue({ updated: true });
    deleteHelper.mockReset();
    deleteHelper.mockResolvedValue({ deleted: true });
    browseRoots.mockReset();
    browseRoots.mockResolvedValue(['/']);
    respondAuthPrompt.mockReset();
    respondAuthPrompt.mockResolvedValue({ accepted: true });
  }

  return {
    handlers,
    detectApps,
    openPathWithApp,
    getAppIcon,
    validateLocalPath,
    getRecentProjects,
    applyProxy,
    testProxy,
    isRemoteVirtualPath,
    remoteSearchFiles,
    remoteSearchContent,
    searchFiles,
    searchContent,
    shellOpenPath,
    appGetPath,
    initLogger,
    logInfo,
    logError,
    logGetFile,
    getLogDiagnostics,
    createNotification,
    emitNotification,
    notificationInstances,
    browserWindowFromWebContents,
    webInspectorStart,
    webInspectorStop,
    webInspectorGetStatus,
    updaterCheckForUpdates,
    updaterQuitAndInstall,
    updaterDownloadUpdate,
    updaterSetAutoUpdateEnabled,
    loadProfiles,
    saveProfile,
    deleteProfile,
    testConnection,
    connect,
    disconnect,
    getStatus,
    listDirectory,
    getHelperStatus,
    installHelperManually,
    updateHelper,
    deleteHelper,
    browseRoots,
    respondAuthPrompt,
    reset,
  };
});

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: handlerTestDoubles.browserWindowFromWebContents,
  },
  Notification: Object.assign(
    vi.fn(function (
      this: Record<string, unknown>,
      options: { title: string; body?: string; silent?: boolean }
    ) {
      Object.assign(this, handlerTestDoubles.createNotification(options));
    }),
    {
      isSupported: vi.fn(() => true),
    }
  ),
  app: {
    getPath: handlerTestDoubles.appGetPath,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handlerTestDoubles.handlers.set(channel, handler);
    }),
  },
  shell: {
    openPath: handlerTestDoubles.shellOpenPath,
  },
}));

vi.mock('../../services/app/AppDetector', () => ({
  appDetector: {
    detectApps: handlerTestDoubles.detectApps,
    openPath: handlerTestDoubles.openPathWithApp,
    getAppIcon: handlerTestDoubles.getAppIcon,
  },
}));

vi.mock('../../services/app/PathValidator', () => ({
  validateLocalPath: handlerTestDoubles.validateLocalPath,
}));

vi.mock('../../services/app/RecentProjectsService', () => ({
  getRecentProjects: handlerTestDoubles.getRecentProjects,
}));

vi.mock('../../services/proxy/ProxyConfig', () => ({
  applyProxy: handlerTestDoubles.applyProxy,
  testProxy: handlerTestDoubles.testProxy,
}));

vi.mock('../../services/remote/RemotePath', () => ({
  isRemoteVirtualPath: handlerTestDoubles.isRemoteVirtualPath,
}));

vi.mock('../../services/remote/RemoteRepositoryBackend', () => ({
  remoteRepositoryBackend: {
    searchFiles: handlerTestDoubles.remoteSearchFiles,
    searchContent: handlerTestDoubles.remoteSearchContent,
  },
}));

vi.mock('../../services/search/SearchService', () => ({
  searchService: {
    searchFiles: handlerTestDoubles.searchFiles,
    searchContent: handlerTestDoubles.searchContent,
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: handlerTestDoubles.logInfo,
    error: handlerTestDoubles.logError,
    transports: {
      file: {
        getFile: handlerTestDoubles.logGetFile,
      },
    },
  },
  initLogger: handlerTestDoubles.initLogger,
  getLogDiagnostics: handlerTestDoubles.getLogDiagnostics,
}));

vi.mock('../../services/webInspector', () => ({
  webInspectorServer: {
    start: handlerTestDoubles.webInspectorStart,
    stop: handlerTestDoubles.webInspectorStop,
    getStatus: handlerTestDoubles.webInspectorGetStatus,
  },
}));

vi.mock('../../services/updater/AutoUpdater', () => ({
  autoUpdaterService: {
    checkForUpdates: handlerTestDoubles.updaterCheckForUpdates,
    quitAndInstall: handlerTestDoubles.updaterQuitAndInstall,
    downloadUpdate: handlerTestDoubles.updaterDownloadUpdate,
    setAutoUpdateEnabled: handlerTestDoubles.updaterSetAutoUpdateEnabled,
  },
}));

vi.mock('../../services/remote/RemoteConnectionManager', () => ({
  remoteConnectionManager: {
    loadProfiles: handlerTestDoubles.loadProfiles,
    saveProfile: handlerTestDoubles.saveProfile,
    deleteProfile: handlerTestDoubles.deleteProfile,
    testConnection: handlerTestDoubles.testConnection,
    connect: handlerTestDoubles.connect,
    disconnect: handlerTestDoubles.disconnect,
    getStatus: handlerTestDoubles.getStatus,
    listDirectory: handlerTestDoubles.listDirectory,
    getHelperStatus: handlerTestDoubles.getHelperStatus,
    installHelperManually: handlerTestDoubles.installHelperManually,
    updateHelper: handlerTestDoubles.updateHelper,
    deleteHelper: handlerTestDoubles.deleteHelper,
    browseRoots: handlerTestDoubles.browseRoots,
    respondAuthPrompt: handlerTestDoubles.respondAuthPrompt,
  },
}));

function getHandler(channel: string) {
  const handler = handlerTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('supporting IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    handlerTestDoubles.reset();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    delete process.env.APPIMAGE;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    delete process.env.APPIMAGE;
  });

  it('registers app handlers and delegates to the application services', async () => {
    const { registerAppHandlers } = await import('../app');
    registerAppHandlers();

    expect(await getHandler(IPC_CHANNELS.APP_DETECT)({})).toEqual([{ name: 'VS Code' }]);
    await getHandler(IPC_CHANNELS.APP_OPEN_WITH)({}, '/repo/file.ts', 'com.editor', {
      line: 18,
      workspacePath: '/repo',
      openFiles: ['/repo/file.ts'],
      activeFile: '/repo/file.ts',
    });
    expect(await getHandler(IPC_CHANNELS.APP_GET_ICON)({}, 'com.editor')).toBe('icon-data');
    expect(await getHandler(IPC_CHANNELS.APP_SET_PROXY)({}, { enabled: true })).toEqual({
      ok: true,
    });
    expect(await getHandler(IPC_CHANNELS.APP_TEST_PROXY)({}, 'http://proxy')).toEqual({
      ok: true,
      latency: 12,
    });
    expect(await getHandler(IPC_CHANNELS.APP_RECENT_PROJECTS)({})).toEqual(['/repo/a', '/repo/b']);
    expect(await getHandler(IPC_CHANNELS.GIT_VALIDATE_LOCAL_PATH)({}, '/repo')).toEqual({
      valid: true,
    });

    expect(handlerTestDoubles.openPathWithApp).toHaveBeenCalledWith(
      '/repo/file.ts',
      'com.editor',
      expect.objectContaining({
        line: 18,
      })
    );
    expect(handlerTestDoubles.validateLocalPath).toHaveBeenCalledWith('/repo');
  });

  it('routes search handlers to local services and remote backends', async () => {
    const { registerSearchHandlers } = await import('../search');
    registerSearchHandlers();

    expect(
      await getHandler(IPC_CHANNELS.SEARCH_FILES)(
        {},
        {
          rootPath: '/repo',
          query: 'abc',
          maxResults: 5,
        }
      )
    ).toEqual([{ path: 'local.ts' }]);
    expect(
      await getHandler(IPC_CHANNELS.SEARCH_CONTENT)(
        {},
        {
          rootPath: '/repo',
          query: 'needle',
        }
      )
    ).toEqual([{ path: 'local.ts', line: 7 }]);

    expect(
      await getHandler(IPC_CHANNELS.SEARCH_FILES)(
        {},
        {
          rootPath: '/__remote__/repo',
          query: 'abc',
          maxResults: 5,
        }
      )
    ).toEqual([{ path: 'remote.ts' }]);
    expect(
      await getHandler(IPC_CHANNELS.SEARCH_CONTENT)(
        {},
        {
          rootPath: '/__remote__/repo',
          query: 'needle',
        }
      )
    ).toEqual([{ path: 'remote.ts', line: 3 }]);

    expect(handlerTestDoubles.searchFiles).toHaveBeenCalledTimes(1);
    expect(handlerTestDoubles.remoteSearchFiles).toHaveBeenCalledWith('/__remote__/repo', 'abc', 5);
    expect(handlerTestDoubles.remoteSearchContent).toHaveBeenCalledWith({
      rootPath: '/__remote__/repo',
      query: 'needle',
    });
  });

  it('updates logging, opens the log folder and returns the current log file path', async () => {
    const { registerLogHandlers } = await import('../log');
    registerLogHandlers();

    await getHandler(IPC_CHANNELS.LOG_UPDATE_CONFIG)(
      {},
      {
        enabled: true,
        level: 'debug',
        retentionDays: 14,
      }
    );
    await expect(getHandler(IPC_CHANNELS.LOG_OPEN_FOLDER)({})).resolves.toBeUndefined();
    expect(await getHandler(IPC_CHANNELS.LOG_GET_PATH)({})).toBe('/tmp/logs/app.log');
    expect(await getHandler(IPC_CHANNELS.LOG_GET_DIAGNOSTICS)({}, 50)).toEqual({
      path: '/tmp/logs/app.log',
      lines: ['[info] hello', '[error] world'],
    });

    expect(handlerTestDoubles.initLogger).toHaveBeenCalledWith(true, 'debug', 14);
    expect(handlerTestDoubles.logInfo).toHaveBeenCalledWith(
      'Logging config updated: enabled=true, level=debug, retentionDays=14'
    );
    expect(handlerTestDoubles.getLogDiagnostics).toHaveBeenCalledWith(50);

    handlerTestDoubles.shellOpenPath.mockResolvedValueOnce('permission denied');
    handlerTestDoubles.logGetFile.mockReturnValueOnce(undefined);

    await expect(getHandler(IPC_CHANNELS.LOG_OPEN_FOLDER)({})).rejects.toThrow(
      'Failed to open log folder: permission denied'
    );
    expect(await getHandler(IPC_CHANNELS.LOG_GET_PATH)({})).toBe('');
    expect(handlerTestDoubles.logError).toHaveBeenCalledWith(
      'Failed to open log folder: permission denied'
    );
  });

  it('logs unchanged retention days when the logging update omits that field', async () => {
    const { registerLogHandlers } = await import('../log');
    registerLogHandlers();

    await getHandler(IPC_CHANNELS.LOG_UPDATE_CONFIG)(
      {},
      {
        enabled: false,
        level: 'warn',
      }
    );

    expect(handlerTestDoubles.initLogger).toHaveBeenCalledWith(false, 'warn', undefined);
    expect(handlerTestDoubles.logInfo).toHaveBeenCalledWith(
      'Logging config updated: enabled=false, level=warn, retentionDays=unchanged'
    );
  });

  it('shows notifications only when supported and forwards click events to the renderer', async () => {
    const sender = { id: 7 };
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      focus: vi.fn(),
      webContents: {
        send: vi.fn(),
      },
    };
    handlerTestDoubles.browserWindowFromWebContents.mockReturnValue(window);

    const { registerNotificationHandlers } = await import('../notification');
    registerNotificationHandlers();

    const notificationModule = await import('electron');
    vi.mocked(notificationModule.Notification.isSupported).mockReturnValueOnce(false);
    await expect(
      getHandler(IPC_CHANNELS.NOTIFICATION_SHOW)(
        { sender },
        { title: 'Unsupported', body: 'noop', sessionId: 'sess-0' }
      )
    ).resolves.toBeUndefined();
    expect(handlerTestDoubles.notificationInstances).toHaveLength(0);

    vi.mocked(notificationModule.Notification.isSupported).mockReturnValue(true);
    await getHandler(IPC_CHANNELS.NOTIFICATION_SHOW)(
      { sender },
      { title: 'Build finished', body: 'Done', silent: true, sessionId: 'sess-1' }
    );

    expect(handlerTestDoubles.notificationInstances).toHaveLength(1);
    expect(handlerTestDoubles.notificationInstances[0]?.options).toEqual({
      title: 'Build finished',
      body: 'Done',
      silent: true,
    });
    expect(handlerTestDoubles.notificationInstances[0]?.show).toHaveBeenCalledTimes(1);

    handlerTestDoubles.emitNotification(0, 'click');

    expect(window.restore).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.NOTIFICATION_CLICK, 'sess-1');
  });

  it('registers web inspector handlers and delegates every operation', async () => {
    const { registerWebInspectorHandlers } = await import('../webInspector');
    registerWebInspectorHandlers();

    expect(await getHandler('web-inspector:start')({})).toEqual({ running: true, port: 9229 });
    await expect(getHandler('web-inspector:stop')({})).resolves.toBeUndefined();
    expect(await getHandler('web-inspector:status')({})).toEqual({ running: true, port: 9229 });
  });

  it('delegates updater handlers when the updater is enabled', async () => {
    setPlatform('darwin');

    const { registerUpdaterHandlers } = await import('../updater');
    registerUpdaterHandlers();

    await getHandler(IPC_CHANNELS.UPDATER_CHECK)({});
    await getHandler(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL)({});
    await getHandler(IPC_CHANNELS.UPDATER_DOWNLOAD_UPDATE)({});
    await getHandler(IPC_CHANNELS.UPDATER_SET_AUTO_UPDATE_ENABLED)({}, true);

    expect(handlerTestDoubles.updaterCheckForUpdates).toHaveBeenCalledTimes(1);
    expect(handlerTestDoubles.updaterQuitAndInstall).toHaveBeenCalledTimes(1);
    expect(handlerTestDoubles.updaterDownloadUpdate).toHaveBeenCalledTimes(1);
    expect(handlerTestDoubles.updaterSetAutoUpdateEnabled).toHaveBeenCalledWith(true);
  });

  it('skips updater handlers on linux packages without AppImage', async () => {
    setPlatform('linux');

    const { registerUpdaterHandlers } = await import('../updater');
    registerUpdaterHandlers();

    await expect(getHandler(IPC_CHANNELS.UPDATER_CHECK)({})).resolves.toBeUndefined();
    await expect(getHandler(IPC_CHANNELS.UPDATER_QUIT_AND_INSTALL)({})).resolves.toBeUndefined();
    await expect(getHandler(IPC_CHANNELS.UPDATER_DOWNLOAD_UPDATE)({})).resolves.toBeUndefined();
    await expect(
      getHandler(IPC_CHANNELS.UPDATER_SET_AUTO_UPDATE_ENABLED)({}, false)
    ).resolves.toBeUndefined();

    expect(handlerTestDoubles.updaterCheckForUpdates).not.toHaveBeenCalled();
    expect(handlerTestDoubles.updaterQuitAndInstall).not.toHaveBeenCalled();
    expect(handlerTestDoubles.updaterDownloadUpdate).not.toHaveBeenCalled();
    expect(handlerTestDoubles.updaterSetAutoUpdateEnabled).not.toHaveBeenCalled();
  });

  it('registers remote handlers and delegates every command to the remote manager', async () => {
    const { registerRemoteHandlers } = await import('../remote');
    registerRemoteHandlers();

    const profile = { host: '127.0.0.1', username: 'tester' };
    const authResponse = { id: 'prompt-1', approved: true };

    expect(await getHandler(IPC_CHANNELS.REMOTE_PROFILE_LIST)({})).toEqual([{ id: 'profile-1' }]);
    expect(await getHandler(IPC_CHANNELS.REMOTE_PROFILE_SAVE)({}, profile)).toEqual({
      id: 'profile-2',
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_PROFILE_DELETE)({}, 'profile-1')).toBe(true);
    expect(await getHandler(IPC_CHANNELS.REMOTE_TEST_CONNECTION)({}, profile)).toEqual({
      ok: true,
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_CONNECT)({}, 'profile-1')).toEqual({
      connectionId: 'conn-1',
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_DISCONNECT)({}, 'conn-1')).toBe(true);
    expect(await getHandler(IPC_CHANNELS.REMOTE_GET_STATUS)({}, 'conn-1')).toEqual({
      connected: true,
    });
    expect(
      await getHandler(IPC_CHANNELS.REMOTE_DIRECTORY_LIST)({}, 'profile-1', '/remote/home')
    ).toEqual([{ path: '/tmp' }]);
    expect(await getHandler(IPC_CHANNELS.REMOTE_HELPER_STATUS)({}, 'profile-1')).toEqual({
      installed: true,
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_HELPER_INSTALL)({}, 'profile-1')).toEqual({
      installed: true,
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_HELPER_UPDATE)({}, 'profile-1')).toEqual({
      updated: true,
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_HELPER_DELETE)({}, 'profile-1')).toEqual({
      deleted: true,
    });
    expect(await getHandler(IPC_CHANNELS.REMOTE_BROWSE_ROOTS)({}, 'profile-1')).toEqual(['/']);
    expect(await getHandler(IPC_CHANNELS.REMOTE_AUTH_RESPONSE)({}, authResponse)).toEqual({
      accepted: true,
    });

    expect(handlerTestDoubles.deleteProfile).toHaveBeenCalledWith('profile-1');
    expect(handlerTestDoubles.disconnect).toHaveBeenCalledWith('conn-1');
    expect(handlerTestDoubles.listDirectory).toHaveBeenCalledWith('profile-1', '/remote/home');
    expect(handlerTestDoubles.respondAuthPrompt).toHaveBeenCalledWith(authResponse);
  });
});
