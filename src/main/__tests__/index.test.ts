import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => unknown;
type ProtocolHandler = (request: {
  url: string;
  headers: {
    get: (name: string) => string | null;
  };
}) => Promise<Response> | Response;
type ProcessWithRawDebug = NodeJS.Process & {
  _rawDebug?: (message: string) => void;
};
type MockCleanupSummary = {
  hasTimeouts: boolean;
  timedOutLabels: string[];
  failedLabels: string[];
};

type MockWindow = ReturnType<typeof mainIndexTestDoubles.createWindow>;

function createCompletedCleanupSummary(): MockCleanupSummary {
  return {
    hasTimeouts: false,
    timedOutLabels: [],
    failedLabels: [],
  };
}

const mainIndexTestDoubles = vi.hoisted(() => {
  const appListeners = new Map<string, Listener[]>();
  const processListeners = new Map<string, Listener>();
  const protocolHandlers = new Map<string, ProtocolHandler>();
  const pathValues = new Map<string, string>();
  const readStreamListeners = new Map<string, Listener>();

  let ready = false;
  let readyPromise = Promise.resolve();
  let resolveReady: (() => void) | null = null;
  let windows: MockWindow[] = [];
  let focusedWindow: MockWindow | null = null;
  let nextOpenWindow: MockWindow | null = null;
  let nextWindowId = 1;
  let nextWebContentsId = 100;
  let appIsPackaged = false;

  const setAppUserModelId = vi.fn();
  const watchWindowShortcuts = vi.fn();
  const registerSchemesAsPrivileged = vi.fn();
  const handleProtocol = vi.fn((scheme: string, handler: ProtocolHandler) => {
    protocolHandlers.set(scheme, handler);
  });
  const setAsDefaultProtocolClient = vi.fn();
  const setPath = vi.fn((name: string, value: string) => {
    pathValues.set(name, value);
  });
  const getPath = vi.fn((name: string) => pathValues.get(name) ?? `/mock/${name}`);
  const getName = vi.fn(() => 'Infilux');
  const setDockIcon = vi.fn();
  const nativeThemeOn = vi.fn((event: string, listener: Listener) => {
    const listeners = appListeners.get(`nativeTheme:${event}`) ?? [];
    listeners.push(listener);
    appListeners.set(`nativeTheme:${event}`, listeners);
  });
  const quit = vi.fn();
  const exit = vi.fn();
  const appendSwitch = vi.fn();
  const requestSingleInstanceLock = vi.fn(() => true);
  const isReady = vi.fn(() => ready);
  const appOn = vi.fn((event: string, listener: Listener) => {
    const listeners = appListeners.get(event) ?? [];
    listeners.push(listener);
    appListeners.set(event, listeners);
    return {} as never;
  });
  const whenReady = vi.fn(() => readyPromise);
  const ipcHandle = vi.fn();
  const setApplicationMenu = vi.fn();
  const netFetch = vi.fn(async () => new Response('ok', { status: 200 }));
  const appendFileSync = vi.fn();
  const createReadStream = vi.fn(() => ({
    on: vi.fn((event: string, listener: Listener) => {
      readStreamListeners.set(event, listener);
    }),
    destroy: vi.fn(),
  }));
  const mkdirSync = vi.fn();
  const existsSync = vi.fn<(path: string) => boolean>(() => false);
  const readFileSync = vi.fn<(path: string, encoding?: BufferEncoding) => string | Buffer>(
    (_path: string, encoding?: BufferEncoding) => {
      if (encoding === 'utf-8') {
        return '{}';
      }
      return Buffer.from('file');
    }
  );
  const statSync = vi.fn<(path: string) => { isDirectory: () => boolean; size: number }>(() => ({
    isDirectory: () => false,
    size: 64,
  }));
  const writeFileSync = vi.fn();
  const shellEnvSync = vi.fn<() => Record<string, string>>(() => ({
    SHELL_ENV_READY: '1',
  }));
  const autoStartHapi = vi.fn<() => Promise<void>>(async () => undefined);
  const cleanupAllResources = vi.fn<() => Promise<MockCleanupSummary>>(async () =>
    createCompletedCleanupSummary()
  );
  const cleanupAllResourcesSync = vi.fn();
  const registerIpcHandlers = vi.fn();
  const initClaudeProviderWatcher = vi.fn();
  const cleanupTempFiles = vi.fn(async () => undefined);
  const readSettings = vi.fn(() => ({}));
  const registerWindowHandlersCleanup = vi.fn();
  const registerWindowHandlers = vi.fn(() => registerWindowHandlersCleanup);
  const registerClaudeBridgeIpcHandlers = vi.fn();
  const unwatchClaudeSettings = vi.fn();
  const isAllowedLocalFilePath = vi.fn(() => true);
  const registerAllowedLocalFileRoot = vi.fn();
  const checkGitInstalled = vi.fn(async () => true);
  const gitAutoFetchInit = vi.fn();
  const gitAutoFetchCleanup = vi.fn();
  const setCurrentLocale = vi.fn();
  const buildAppMenu = vi.fn(() => ({ label: 'menu' }));
  const getSharedStatePaths = vi.fn(() => ({ settingsPath: '/shared/settings.json' }));
  const getSharedRootPath = vi.fn(() => '/shared');
  const isLegacySettingsMigrated = vi.fn(() => true);
  const isLegacyTodoMigrated = vi.fn(() => true);
  const markLegacySettingsMigrated = vi.fn();
  const markLegacyTodoMigrated = vi.fn();
  const readSharedSessionState = vi.fn<
    () => {
      version: number;
      updatedAt?: number;
      settingsData?: unknown;
      localStorage?: unknown;
      todos?: unknown;
    }
  >(() => ({ version: 1 }));
  const readSharedSettings = vi.fn(() => ({}));
  const writeSharedSessionState = vi.fn();
  const writeSharedSettings = vi.fn();
  const readElectronLocalStorageSnapshotFromLevelDbDirs = vi.fn<
    () => Record<string, string> | null
  >(() => null);
  const readPersistentAgentSessions = vi.fn(() => []);
  const todoInitialize = vi.fn(async () => undefined);
  const todoExportAllTasks = vi.fn(async () => [{ id: 'board-1' }]);
  const webInspectorSetMainWindow = vi.fn();
  const logInfo = vi.fn();
  const initLogger = vi.fn();
  const autoUpdaterInit = vi.fn();
  const autoUpdaterAttachWindow = vi.fn();
  const autoUpdaterIsQuittingForUpdate = vi.fn(() => false);
  const persistentAgentSessionRepositoryInitialize = vi.fn(async () => undefined);
  const customProtocolUriToPath = vi.fn((_url: string) => '/mock/image.png');
  const trayInit = vi.fn();
  const trayRefreshMenu = vi.fn();
  const trayDestroy = vi.fn();
  const trayIsInitialized = vi.fn(() => false);
  let nativeThemeShouldUseDarkColors = true;
  const sqliteDatabaseConfigure = vi.fn();
  const sqliteDatabaseExec = vi.fn((sql: string, callback?: (err: Error | null) => void) => {
    void sql;
    callback?.(null);
  });
  const sqliteDatabaseAll = vi.fn(
    (
      sql: string,
      params: unknown[] | ((err: Error | null, rows: unknown[]) => void),
      callback?: (err: Error | null, rows: unknown[]) => void
    ) => {
      void sql;
      const cb = (typeof params === 'function' ? params : callback) ?? (() => {});
      cb(null, []);
    }
  );
  const sqliteDatabaseRun = vi.fn(
    (
      sql: string,
      params: unknown[] | ((err: Error | null) => void),
      callback?: (err: Error | null) => void
    ) => {
      void sql;
      const cb = (typeof params === 'function' ? params : callback) ?? (() => {});
      cb(null);
    }
  );
  const sqliteDatabaseClose = vi.fn((callback?: (err: Error | null) => void) => {
    callback?.(null);
  });
  const sqliteDatabase = vi.fn(function MockSqliteDatabase(
    this: Record<string, unknown>,
    _path: string,
    _flags: number,
    callback: (err: Error | null) => void
  ) {
    const database = {
      configure: sqliteDatabaseConfigure,
      exec: sqliteDatabaseExec,
      all: sqliteDatabaseAll,
      run: sqliteDatabaseRun,
      close: sqliteDatabaseClose,
    };
    queueMicrotask(() => {
      callback(null);
    });
    return database;
  });

  function appendListener(map: Map<string, Listener[]>, event: string, listener: Listener): void {
    const current = map.get(event) ?? [];
    current.push(listener);
    map.set(event, current);
  }

  function removeRegisteredListener(
    map: Map<string, Listener[]>,
    event: string,
    listener: Listener
  ): void {
    const current = map.get(event) ?? [];
    map.set(
      event,
      current.filter((candidate) => candidate !== listener)
    );
  }

  function createMockImage(label: string = 'image') {
    return {
      toPNG: vi.fn(() => Buffer.from(label)),
      getSize: vi.fn(() => ({
        width: 1200,
        height: 800,
      })),
      crop: vi.fn(
        ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) =>
          createMockImage(`${label}:${x},${y},${width},${height}`)
      ),
    };
  }

  function emitRegisteredListeners(
    listeners: Map<string, Listener[]>,
    onceListeners: Map<string, Listener[]>,
    event: string,
    args: unknown[]
  ): void {
    const pendingOnceListeners = [...(onceListeners.get(event) ?? [])];
    if (pendingOnceListeners.length > 0) {
      onceListeners.delete(event);
      for (const listener of pendingOnceListeners) {
        listener(...args);
      }
    }

    for (const listener of listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  function createWindow(options?: {
    focused?: boolean;
    loading?: boolean;
    minimized?: boolean;
    url?: string;
    visible?: boolean;
    zoomLevel?: number;
  }) {
    const windowListeners = new Map<string, Listener[]>();
    const windowOnceListeners = new Map<string, Listener[]>();
    const webContentsListeners = new Map<string, Listener[]>();
    const webContentsOnceListeners = new Map<string, Listener[]>();
    const requestErrorListeners: Listener[] = [];
    const windowId = nextWindowId;
    const webContentsId = nextWebContentsId;
    nextWindowId += 1;
    nextWebContentsId += 1;

    let destroyed = false;
    let loading = options?.loading ?? false;
    let minimized = options?.minimized ?? false;
    let url = options?.url ?? 'http://localhost:5173/';
    let visible = options?.visible ?? true;
    let focused = options?.focused ?? true;
    let zoomLevel = options?.zoomLevel ?? 0;

    const window = {
      id: windowId,
      focus: vi.fn(() => {
        focused = true;
        focusedWindow = window;
      }),
      isDestroyed: vi.fn(() => destroyed),
      isFocused: vi.fn(() => focused),
      isMinimized: vi.fn(() => minimized),
      isVisible: vi.fn(() => visible),
      getContentBounds: vi.fn(() => ({
        x: 0,
        y: 0,
        width: 1200,
        height: 800,
      })),
      on: vi.fn((event: string, listener: Listener) => {
        appendListener(windowListeners, event, listener);
      }),
      once: vi.fn((event: string, listener: Listener) => {
        appendListener(windowOnceListeners, event, listener);
      }),
      removeListener: vi.fn((event: string, listener: Listener) => {
        removeRegisteredListener(windowListeners, event, listener);
        removeRegisteredListener(windowOnceListeners, event, listener);
      }),
      restore: vi.fn(() => {
        minimized = false;
      }),
      webContents: {
        id: webContentsId,
        capturePage: vi.fn(async () => createMockImage('capture-page')),
        executeJavaScript: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({
          worktreeProbe: {
            nodeFound: false,
          },
        })),
        getURL: vi.fn(() => url),
        getZoomLevel: vi.fn(() => zoomLevel),
        isDestroyed: vi.fn(() => destroyed),
        isLoading: vi.fn(() => loading),
        listeners: vi.fn((event: string) => webContentsListeners.get(event) ?? []),
        on: vi.fn((event: string, listener: Listener) => {
          appendListener(webContentsListeners, event, listener);
        }),
        once: vi.fn((event: string, listener: Listener) => {
          appendListener(webContentsOnceListeners, event, listener);
        }),
        reload: vi.fn(),
        removeListener: vi.fn((event: string, listener: Listener) => {
          removeRegisteredListener(webContentsListeners, event, listener);
          removeRegisteredListener(webContentsOnceListeners, event, listener);
        }),
        send: vi.fn(),
        session: {
          webRequest: {
            onErrorOccurred: vi.fn((_filter: { urls: string[] }, listener: Listener) => {
              requestErrorListeners.push(listener);
            }),
          },
        },
        setZoomLevel: vi.fn((value: number) => {
          zoomLevel = value;
        }),
      },
      emitRequestError(details: {
        error: string;
        resourceType: string;
        url: string;
        webContentsId: number;
      }) {
        for (const listener of requestErrorListeners) {
          listener(details);
        }
      },
      emitWebContentsEvent(event: string, ...args: unknown[]) {
        emitRegisteredListeners(webContentsListeners, webContentsOnceListeners, event, args);
      },
      emitWindowEvent(event: string, ...args: unknown[]) {
        if (event === 'closed') {
          destroyed = true;
        }
        emitRegisteredListeners(windowListeners, windowOnceListeners, event, args);
      },
      setFocused(value: boolean) {
        focused = value;
      },
      setLoading(value: boolean) {
        loading = value;
      },
      setUrl(value: string) {
        url = value;
      },
      setVisible(value: boolean) {
        visible = value;
      },
    };

    return window;
  }

  function reset() {
    appListeners.clear();
    processListeners.clear();
    protocolHandlers.clear();
    pathValues.clear();
    pathValues.set('appData', '/mock/appData');
    pathValues.set('temp', '/mock/temp');
    pathValues.set('userData', '/mock/userData');
    windows = [];
    focusedWindow = null;
    nextOpenWindow = null;
    nextWindowId = 1;
    nextWebContentsId = 100;
    appIsPackaged = false;
    ready = false;
    readyPromise = new Promise<void>((resolve) => {
      resolveReady = () => {
        ready = true;
        resolve();
      };
    });

    const fns = [
      setAppUserModelId,
      watchWindowShortcuts,
      registerSchemesAsPrivileged,
      handleProtocol,
      setAsDefaultProtocolClient,
      setPath,
      getPath,
      getName,
      setDockIcon,
      nativeThemeOn,
      quit,
      exit,
      appendSwitch,
      requestSingleInstanceLock,
      isReady,
      appOn,
      whenReady,
      ipcHandle,
      setApplicationMenu,
      netFetch,
      appendFileSync,
      createReadStream,
      mkdirSync,
      existsSync,
      readFileSync,
      statSync,
      writeFileSync,
      shellEnvSync,
      autoStartHapi,
      cleanupAllResources,
      cleanupAllResourcesSync,
      registerIpcHandlers,
      initClaudeProviderWatcher,
      cleanupTempFiles,
      readSettings,
      registerWindowHandlersCleanup,
      registerWindowHandlers,
      registerClaudeBridgeIpcHandlers,
      unwatchClaudeSettings,
      isAllowedLocalFilePath,
      registerAllowedLocalFileRoot,
      checkGitInstalled,
      gitAutoFetchInit,
      gitAutoFetchCleanup,
      setCurrentLocale,
      buildAppMenu,
      getSharedStatePaths,
      getSharedRootPath,
      isLegacySettingsMigrated,
      isLegacyTodoMigrated,
      markLegacySettingsMigrated,
      markLegacyTodoMigrated,
      readSharedSessionState,
      readSharedSettings,
      writeSharedSessionState,
      writeSharedSettings,
      readElectronLocalStorageSnapshotFromLevelDbDirs,
      readPersistentAgentSessions,
      todoInitialize,
      todoExportAllTasks,
      webInspectorSetMainWindow,
      logInfo,
      initLogger,
      autoUpdaterInit,
      autoUpdaterAttachWindow,
      autoUpdaterIsQuittingForUpdate,
      persistentAgentSessionRepositoryInitialize,
      customProtocolUriToPath,
      trayInit,
      trayRefreshMenu,
      trayDestroy,
      trayIsInitialized,
      sqliteDatabaseConfigure,
      sqliteDatabaseExec,
      sqliteDatabaseAll,
      sqliteDatabaseRun,
      sqliteDatabaseClose,
      sqliteDatabase,
    ];

    for (const fn of fns) {
      fn.mockReset();
    }

    getPath.mockImplementation((name: string) => pathValues.get(name) ?? `/mock/${name}`);
    getName.mockReturnValue('Infilux');
    nativeThemeShouldUseDarkColors = true;
    requestSingleInstanceLock.mockReturnValue(true);
    isReady.mockImplementation(() => ready);
    whenReady.mockImplementation(() => readyPromise);
    netFetch.mockImplementation(async () => new Response('ok', { status: 200 }));
    appendFileSync.mockReset();
    mkdirSync.mockReset();
    existsSync.mockReturnValue(false);
    readFileSync.mockImplementation((_path: string, encoding?: BufferEncoding) => {
      if (encoding === 'utf-8') {
        return '{}';
      }
      return Buffer.from('file');
    });
    statSync.mockReturnValue({
      isDirectory: () => false,
      size: 64,
    });
    writeFileSync.mockReset();
    shellEnvSync.mockReturnValue({
      SHELL_ENV_READY: '1',
    });
    autoStartHapi.mockResolvedValue(undefined);
    cleanupAllResources.mockResolvedValue(createCompletedCleanupSummary());
    cleanupTempFiles.mockResolvedValue(undefined);
    readSettings.mockReturnValue({});
    registerWindowHandlers.mockReturnValue(registerWindowHandlersCleanup);
    isAllowedLocalFilePath.mockReturnValue(true);
    checkGitInstalled.mockResolvedValue(true);
    buildAppMenu.mockReturnValue({ label: 'menu' });
    getSharedStatePaths.mockReturnValue({ settingsPath: '/shared/settings.json' });
    getSharedRootPath.mockReturnValue('/shared');
    isLegacySettingsMigrated.mockReturnValue(true);
    isLegacyTodoMigrated.mockReturnValue(true);
    readSharedSessionState.mockReturnValue({ version: 1 });
    readSharedSettings.mockReturnValue({});
    readElectronLocalStorageSnapshotFromLevelDbDirs.mockReturnValue(null);
    readPersistentAgentSessions.mockReturnValue([]);
    todoInitialize.mockResolvedValue(undefined);
    todoExportAllTasks.mockResolvedValue([{ id: 'board-1' }]);
    persistentAgentSessionRepositoryInitialize.mockResolvedValue(undefined);
    autoUpdaterIsQuittingForUpdate.mockReturnValue(false);
    customProtocolUriToPath.mockImplementation((_url: string) => '/mock/image.png');
    trayInit.mockReset();
    trayRefreshMenu.mockReset();
    trayDestroy.mockReset();
    trayIsInitialized.mockReset();
    trayIsInitialized.mockReturnValue(false);
    createReadStream.mockImplementation(() => ({
      on: vi.fn((event: string, listener: Listener) => {
        readStreamListeners.set(event, listener);
      }),
      destroy: vi.fn(),
    }));
  }

  function setWindows(next: MockWindow[], focused?: MockWindow | null) {
    windows = next;
    focusedWindow = focused ?? next[0] ?? null;
  }

  function setNextOpenWindow(window: MockWindow) {
    nextOpenWindow = window;
  }

  async function resolveWhenReady() {
    resolveReady?.();
    await readyPromise;
    for (let index = 0; index < 100; index += 1) {
      await Promise.resolve();
    }
  }

  async function emitApp(event: string, ...args: unknown[]) {
    for (const listener of appListeners.get(event) ?? []) {
      await listener(...args);
    }
  }

  async function emitNativeTheme(event: string) {
    for (const listener of appListeners.get(`nativeTheme:${event}`) ?? []) {
      await listener();
    }
  }

  async function invokeProtocol(
    scheme: string,
    request: {
      url: string;
      headers?: Record<string, string>;
    }
  ) {
    const handler = protocolHandlers.get(scheme);
    if (!handler) {
      throw new Error(`Missing protocol handler for ${scheme}`);
    }

    return handler({
      url: request.url,
      headers: {
        get(name: string) {
          return request.headers?.[name] ?? request.headers?.[name.toLowerCase()] ?? null;
        },
      },
    });
  }

  const BrowserWindowMock = {
    getAllWindows: vi.fn(() => windows),
    getFocusedWindow: vi.fn(() => focusedWindow),
  };

  const openLocalWindow = vi.fn(() => {
    const window = nextOpenWindow ?? createWindow();
    nextOpenWindow = null;
    windows = [...windows, window];
    focusedWindow = window;
    return window;
  });

  return {
    setAppUserModelId,
    watchWindowShortcuts,
    registerSchemesAsPrivileged,
    handleProtocol,
    setAsDefaultProtocolClient,
    setPath,
    getPath,
    getName,
    setDockIcon,
    nativeThemeOn,
    quit,
    exit,
    appendSwitch,
    requestSingleInstanceLock,
    isReady,
    appOn,
    whenReady,
    ipcHandle,
    setApplicationMenu,
    netFetch,
    appendFileSync,
    createReadStream,
    mkdirSync,
    existsSync,
    readFileSync,
    statSync,
    writeFileSync,
    shellEnvSync,
    autoStartHapi,
    cleanupAllResources,
    cleanupAllResourcesSync,
    registerIpcHandlers,
    initClaudeProviderWatcher,
    cleanupTempFiles,
    readSettings,
    registerWindowHandlersCleanup,
    registerWindowHandlers,
    registerClaudeBridgeIpcHandlers,
    unwatchClaudeSettings,
    isAllowedLocalFilePath,
    registerAllowedLocalFileRoot,
    checkGitInstalled,
    gitAutoFetchInit,
    gitAutoFetchCleanup,
    setCurrentLocale,
    buildAppMenu,
    getSharedStatePaths,
    getSharedRootPath,
    isLegacySettingsMigrated,
    isLegacyTodoMigrated,
    markLegacySettingsMigrated,
    markLegacyTodoMigrated,
    readSharedSessionState,
    readSharedSettings,
    writeSharedSessionState,
    writeSharedSettings,
    readElectronLocalStorageSnapshotFromLevelDbDirs,
    readPersistentAgentSessions,
    todoInitialize,
    todoExportAllTasks,
    webInspectorSetMainWindow,
    logInfo,
    initLogger,
    autoUpdaterInit,
    autoUpdaterAttachWindow,
    autoUpdaterIsQuittingForUpdate,
    persistentAgentSessionRepositoryInitialize,
    customProtocolUriToPath,
    trayInit,
    trayRefreshMenu,
    trayDestroy,
    trayIsInitialized,
    sqliteDatabaseConfigure,
    sqliteDatabaseExec,
    sqliteDatabaseAll,
    sqliteDatabaseRun,
    sqliteDatabaseClose,
    sqliteDatabase,
    createMockImage,
    protocolHandlers,
    processListeners,
    BrowserWindowMock,
    openLocalWindow,
    createWindow,
    reset,
    setWindows,
    setNextOpenWindow,
    resolveWhenReady,
    emitApp,
    emitNativeTheme,
    getAppIsPackaged: () => appIsPackaged,
    getNativeThemeShouldUseDarkColors: () => nativeThemeShouldUseDarkColors,
    setAppIsPackaged: (value: boolean) => {
      appIsPackaged = value;
    },
    setNativeThemeShouldUseDarkColors: (value: boolean) => {
      nativeThemeShouldUseDarkColors = value;
    },
    invokeProtocol,
  };
});

vi.mock('node:fs', () => ({
  appendFileSync: mainIndexTestDoubles.appendFileSync,
  createReadStream: mainIndexTestDoubles.createReadStream,
  mkdirSync: mainIndexTestDoubles.mkdirSync,
  existsSync: mainIndexTestDoubles.existsSync,
  readFileSync: mainIndexTestDoubles.readFileSync,
  statSync: mainIndexTestDoubles.statSync,
  writeFileSync: mainIndexTestDoubles.writeFileSync,
}));

vi.mock('shell-env', () => ({
  shellEnvSync: mainIndexTestDoubles.shellEnvSync,
}));

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: {
    setAppUserModelId: mainIndexTestDoubles.setAppUserModelId,
  },
  optimizer: {
    watchWindowShortcuts: mainIndexTestDoubles.watchWindowShortcuts,
  },
}));

vi.mock('@shared/utils/fileUrl', () => ({
  customProtocolUriToPath: mainIndexTestDoubles.customProtocolUriToPath,
}));

vi.mock('electron', () => ({
  app: {
    getName: mainIndexTestDoubles.getName,
    getPath: mainIndexTestDoubles.getPath,
    setPath: mainIndexTestDoubles.setPath,
    setAsDefaultProtocolClient: mainIndexTestDoubles.setAsDefaultProtocolClient,
    on: mainIndexTestDoubles.appOn,
    whenReady: mainIndexTestDoubles.whenReady,
    isReady: mainIndexTestDoubles.isReady,
    get isPackaged() {
      return mainIndexTestDoubles.getAppIsPackaged();
    },
    quit: mainIndexTestDoubles.quit,
    exit: mainIndexTestDoubles.exit,
    requestSingleInstanceLock: mainIndexTestDoubles.requestSingleInstanceLock,
    dock: {
      setIcon: mainIndexTestDoubles.setDockIcon,
    },
    commandLine: {
      appendSwitch: mainIndexTestDoubles.appendSwitch,
    },
  },
  BrowserWindow: mainIndexTestDoubles.BrowserWindowMock,
  nativeTheme: {
    on: mainIndexTestDoubles.nativeThemeOn,
    get shouldUseDarkColors() {
      return mainIndexTestDoubles.getNativeThemeShouldUseDarkColors();
    },
  },
  ipcMain: {
    handle: mainIndexTestDoubles.ipcHandle,
  },
  Menu: {
    setApplicationMenu: mainIndexTestDoubles.setApplicationMenu,
  },
  net: {
    fetch: mainIndexTestDoubles.netFetch,
  },
  protocol: {
    registerSchemesAsPrivileged: mainIndexTestDoubles.registerSchemesAsPrivileged,
    handle: mainIndexTestDoubles.handleProtocol,
  },
}));

vi.mock('../ipc', () => ({
  autoStartHapi: mainIndexTestDoubles.autoStartHapi,
  cleanupAllResources: mainIndexTestDoubles.cleanupAllResources,
  cleanupAllResourcesSync: mainIndexTestDoubles.cleanupAllResourcesSync,
  registerIpcHandlers: mainIndexTestDoubles.registerIpcHandlers,
}));

vi.mock('../ipc/claudeProvider', () => ({
  initClaudeProviderWatcher: mainIndexTestDoubles.initClaudeProviderWatcher,
}));

vi.mock('../ipc/files', () => ({
  cleanupTempFiles: mainIndexTestDoubles.cleanupTempFiles,
}));

vi.mock('../ipc/settings', () => ({
  readSettings: mainIndexTestDoubles.readSettings,
}));

vi.mock('../ipc/window', () => ({
  registerWindowHandlers: mainIndexTestDoubles.registerWindowHandlers,
}));

vi.mock('../services/claude/ClaudeIdeBridge', () => ({
  registerClaudeBridgeIpcHandlers: mainIndexTestDoubles.registerClaudeBridgeIpcHandlers,
}));

vi.mock('../services/claude/ClaudeProviderManager', () => ({
  unwatchClaudeSettings: mainIndexTestDoubles.unwatchClaudeSettings,
}));

vi.mock('../services/files/LocalFileAccess', () => ({
  isAllowedLocalFilePath: mainIndexTestDoubles.isAllowedLocalFilePath,
  registerAllowedLocalFileRoot: mainIndexTestDoubles.registerAllowedLocalFileRoot,
}));

vi.mock('../services/git/checkGit', () => ({
  checkGitInstalled: mainIndexTestDoubles.checkGitInstalled,
}));

vi.mock('../services/git/GitAutoFetchService', () => ({
  gitAutoFetchService: {
    init: mainIndexTestDoubles.gitAutoFetchInit,
    cleanup: mainIndexTestDoubles.gitAutoFetchCleanup,
  },
}));

vi.mock('../services/i18n', () => ({
  setCurrentLocale: mainIndexTestDoubles.setCurrentLocale,
}));

vi.mock('../services/MenuBuilder', () => ({
  buildAppMenu: mainIndexTestDoubles.buildAppMenu,
}));

vi.mock('../services/SharedSessionState', () => ({
  getSharedStatePaths: mainIndexTestDoubles.getSharedStatePaths,
  getSharedRootPath: mainIndexTestDoubles.getSharedRootPath,
  isLegacySettingsMigrated: mainIndexTestDoubles.isLegacySettingsMigrated,
  isLegacyTodoMigrated: mainIndexTestDoubles.isLegacyTodoMigrated,
  markLegacySettingsMigrated: mainIndexTestDoubles.markLegacySettingsMigrated,
  markLegacyTodoMigrated: mainIndexTestDoubles.markLegacyTodoMigrated,
  readSharedSessionState: mainIndexTestDoubles.readSharedSessionState,
  readSharedSettings: mainIndexTestDoubles.readSharedSettings,
  readPersistentAgentSessions: mainIndexTestDoubles.readPersistentAgentSessions,
  writeSharedSessionState: mainIndexTestDoubles.writeSharedSessionState,
  writeSharedSettings: mainIndexTestDoubles.writeSharedSettings,
}));

vi.mock('../services/session/PersistentAgentSessionRepository', () => ({
  persistentAgentSessionRepository: {
    initialize: mainIndexTestDoubles.persistentAgentSessionRepositoryInitialize,
  },
}));

vi.mock('../services/settings/legacyImport', () => ({
  findLegacySettingsImportSourcePath: vi.fn(() => null),
  readElectronLocalStorageSnapshotFromLevelDbDirs:
    mainIndexTestDoubles.readElectronLocalStorageSnapshotFromLevelDbDirs,
  readLegacyElectronLocalStorageSnapshot: vi.fn(() => null),
  readLegacyImportLocalStorageSnapshot: vi.fn(() => null),
}));

vi.mock('../services/todo/TodoService', () => ({
  initialize: mainIndexTestDoubles.todoInitialize,
  exportAllTasks: mainIndexTestDoubles.todoExportAllTasks,
}));

vi.mock('sqlite3', () => ({
  default: {
    OPEN_READWRITE: 1,
    OPEN_CREATE: 2,
    Database: mainIndexTestDoubles.sqliteDatabase,
  },
}));

vi.mock('../services/updater/AutoUpdater', () => ({
  autoUpdaterService: {
    init: mainIndexTestDoubles.autoUpdaterInit,
    attachWindow: mainIndexTestDoubles.autoUpdaterAttachWindow,
    isQuittingForUpdate: mainIndexTestDoubles.autoUpdaterIsQuittingForUpdate,
  },
}));

vi.mock('../services/webInspector', () => ({
  webInspectorServer: {
    setMainWindow: mainIndexTestDoubles.webInspectorSetMainWindow,
  },
}));

vi.mock('../services/TrayService', () => ({
  appTrayService: {
    init: vi.fn((options: unknown) => {
      mainIndexTestDoubles.trayIsInitialized.mockReturnValue(true);
      return mainIndexTestDoubles.trayInit(options);
    }),
    refreshMenu: mainIndexTestDoubles.trayRefreshMenu,
    destroy: vi.fn(() => {
      mainIndexTestDoubles.trayIsInitialized.mockReturnValue(false);
      return mainIndexTestDoubles.trayDestroy();
    }),
    isInitialized: mainIndexTestDoubles.trayIsInitialized,
  },
}));

vi.mock('../utils/logger', () => ({
  default: {
    info: mainIndexTestDoubles.logInfo,
  },
  initLogger: mainIndexTestDoubles.initLogger,
}));

vi.mock('../windows/WindowManager', () => ({
  openLocalWindow: mainIndexTestDoubles.openLocalWindow,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalDefaultAppDescriptor = Object.getOwnPropertyDescriptor(process, 'defaultApp');
const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const originalRawDebugDescriptor = Object.getOwnPropertyDescriptor(process, '_rawDebug');
const originalProcessOn = process.on;
const originalArgv = [...process.argv];
const originalShellEnvReady = process.env.SHELL_ENV_READY;
const originalPath = process.env.PATH;
const originalProfile = process.env.ENSOAI_PROFILE;
const originalGtkVersion = process.env.ENSOAI_GTK_VERSION;
const originalAppImage = process.env.APPIMAGE;
const originalEnableRemoteDebugging = process.env.INFILUX_ENABLE_REMOTE_DEBUGGING;
const originalRuntimeChannel = process.env.INFILUX_RUNTIME_CHANNEL;
const originalNodeEnv = process.env.NODE_ENV;
const originalVitest = process.env.VITEST;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

function setDefaultApp(value: boolean) {
  Object.defineProperty(process, 'defaultApp', {
    value,
    configurable: true,
    writable: true,
  });
}

async function importMainModule(options?: {
  autoReady?: boolean;
  argv?: string[];
  defaultApp?: boolean;
  platform?: NodeJS.Platform;
}) {
  vi.resetModules();

  process.on = ((event: string, listener: Listener) => {
    mainIndexTestDoubles.processListeners.set(event, listener);
    return process;
  }) as typeof process.on;

  setPlatform(options?.platform ?? 'linux');
  setDefaultApp(options?.defaultApp ?? false);
  process.argv = options?.argv ?? ['/mock/electron', '/mock/app'];

  const module = await import('../index');
  if (options?.autoReady) {
    await mainIndexTestDoubles.resolveWhenReady();
  }

  return module;
}

async function flushMicrotasks(iterations: number = 10): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

function installRawDebugSpy() {
  const rawDebugSpy = vi.fn();
  Object.defineProperty(process as ProcessWithRawDebug, '_rawDebug', {
    value: rawDebugSpy,
    configurable: true,
    writable: true,
  });
  return rawDebugSpy;
}

async function bootstrapReadyWindow(window: MockWindow): Promise<void> {
  mainIndexTestDoubles.setNextOpenWindow(window);
  await importMainModule({
    autoReady: true,
    platform: 'win32',
  });
}

async function bootstrapPackagedWindow(
  window: MockWindow,
  options?: {
    platform?: NodeJS.Platform;
  }
): Promise<void> {
  mainIndexTestDoubles.setAppIsPackaged(true);
  mainIndexTestDoubles.setNextOpenWindow(window);
  await importMainModule({
    autoReady: true,
    platform: options?.platform ?? 'win32',
  });
  await mainIndexTestDoubles.emitApp('browser-window-created', {}, window);
}

async function bootstrapWindowWithRendererDiagnostics(window: MockWindow): Promise<void> {
  await bootstrapReadyWindow(window);
  await mainIndexTestDoubles.emitApp('browser-window-created', {}, window);
}

describe('main entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mainIndexTestDoubles.reset();
    delete process.env.SHELL_ENV_READY;
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    delete process.env.ENSOAI_PROFILE;
    delete process.env.ENSOAI_GTK_VERSION;
    delete process.env.APPIMAGE;
    delete process.env.INFILUX_ENABLE_REMOTE_DEBUGGING;
    delete process.env.INFILUX_RUNTIME_CHANNEL;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.VITEST = originalVitest;
  }, 15000);

  afterEach(() => {
    process.on = originalProcessOn;
    process.argv = [...originalArgv];
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalDefaultAppDescriptor) {
      Object.defineProperty(process, 'defaultApp', originalDefaultAppDescriptor);
    }
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPathDescriptor);
    }
    if (originalRawDebugDescriptor) {
      Object.defineProperty(process, '_rawDebug', originalRawDebugDescriptor);
    } else {
      delete (process as ProcessWithRawDebug)._rawDebug;
    }
    if (originalShellEnvReady === undefined) {
      delete process.env.SHELL_ENV_READY;
    } else {
      process.env.SHELL_ENV_READY = originalShellEnvReady;
    }
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalProfile === undefined) {
      delete process.env.ENSOAI_PROFILE;
    } else {
      process.env.ENSOAI_PROFILE = originalProfile;
    }
    if (originalGtkVersion === undefined) {
      delete process.env.ENSOAI_GTK_VERSION;
    } else {
      process.env.ENSOAI_GTK_VERSION = originalGtkVersion;
    }
    if (originalAppImage === undefined) {
      delete process.env.APPIMAGE;
    } else {
      process.env.APPIMAGE = originalAppImage;
    }
    if (originalEnableRemoteDebugging === undefined) {
      delete process.env.INFILUX_ENABLE_REMOTE_DEBUGGING;
    } else {
      process.env.INFILUX_ENABLE_REMOTE_DEBUGGING = originalEnableRemoteDebugging;
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
    vi.useRealTimers();
    vi.restoreAllMocks();
  }, 15000);

  it('configures import-time protocol, userData, and Linux switches without enabling remote debugging by default', async () => {
    process.env.ENSOAI_PROFILE = 'feature branch';

    await importMainModule({
      defaultApp: true,
      platform: 'linux',
      argv: ['/mock/electron', '/mock/app-entry'],
    });

    expect(mainIndexTestDoubles.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      expect.objectContaining({
        scheme: 'local-image',
      }),
    ]);
    expect(mainIndexTestDoubles.setPath).toHaveBeenCalledWith(
      'userData',
      join('/mock/appData', 'Infilux-feature-branch')
    );
    expect(mainIndexTestDoubles.setPath).toHaveBeenCalledWith(
      'sessionData',
      join('/mock/appData', 'Infilux-feature-branch', 'session-data')
    );
    expect(mainIndexTestDoubles.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'infilux',
      process.execPath,
      ['/mock/app-entry']
    );
    expect(mainIndexTestDoubles.appendSwitch).toHaveBeenCalledWith('gtk-version', '3');
    const remoteDebuggingCalls = mainIndexTestDoubles.appendSwitch.mock.calls.filter(
      ([switchName, value]) => switchName === 'remote-debugging-port' && value === '9222'
    );
    expect(remoteDebuggingCalls).toHaveLength(0);
  }, 15000);

  it('enables the remote debugging port only when explicitly requested in development', async () => {
    process.env.INFILUX_ENABLE_REMOTE_DEBUGGING = 'true';

    await importMainModule({
      defaultApp: true,
      platform: 'linux',
      argv: ['/mock/electron', '/mock/app-entry'],
    });

    const remoteDebuggingCalls = mainIndexTestDoubles.appendSwitch.mock.calls.filter(
      ([switchName, value]) => switchName === 'remote-debugging-port' && value === '9222'
    );
    expect(remoteDebuggingCalls).toHaveLength(1);
  });

  it('falls back to the default dev profile when the sanitized profile name is empty', async () => {
    process.env.ENSOAI_PROFILE = ' !!! ';

    const { __testables } = await importMainModule({
      defaultApp: true,
      platform: 'linux',
      argv: ['/mock/electron', '/mock/app-entry'],
    });

    expect(mainIndexTestDoubles.setPath).toHaveBeenCalledWith(
      'userData',
      join('/mock/appData', 'Infilux-dev')
    );
    expect(__testables.sanitizeProfileName(' !!! ')).toBe('');
  });

  it('ignores inherited prod runtime channels during development startup', async () => {
    process.env.INFILUX_RUNTIME_CHANNEL = 'prod';
    delete process.env.NODE_ENV;
    delete process.env.VITEST;

    const { __testables } = await importMainModule({
      defaultApp: true,
      platform: 'linux',
      argv: ['/mock/electron', '/mock/app-entry'],
    });

    expect(__testables.resolveStartupRuntimeChannel()).toBe('dev');
    expect(process.env.INFILUX_RUNTIME_CHANNEL).toBe('dev');
  });

  it('loads shell environment on macOS and exposes helper functions', async () => {
    process.env.PATH = '/tmp/fake-bin:/usr/bin:/bin';
    mainIndexTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          language: 'zh-CN',
        },
      },
    });
    mainIndexTestDoubles.shellEnvSync.mockReturnValue({
      SHELL_ENV_READY: '1',
      PATH: '/usr/local/bin:/usr/bin:/bin:/tmp/fake-bin',
    });

    const { __testables } = await importMainModule({
      platform: 'darwin',
    });

    expect(process.env.SHELL_ENV_READY).toBe('1');
    expect(process.env.PATH).toBe('/tmp/fake-bin:/usr/bin:/bin:/usr/local/bin');
    expect(__testables.mergePathEntries('/tmp/fake-bin:/usr/bin', '/usr/local/bin:/usr/bin')).toBe(
      '/tmp/fake-bin:/usr/bin:/usr/local/bin'
    );
    expect(__testables.isPrivateIpLiteral('127.0.0.1')).toBe(true);
    expect(__testables.isPrivateIpLiteral('8.8.8.8')).toBe(false);
    expect(__testables.isAllowedRemoteImageUrl('https://example.com/image.png')).toBe(true);
    expect(__testables.isAllowedRemoteImageUrl('http://127.0.0.1/blocked.png')).toBe(false);
    expect(__testables.sanitizeProfileName(' feature/branch ')).toBe('feature-branch');
    expect(__testables.parseInfiluxUrl('infilux://open?path=%2Ftmp%2Fdemo')).toBe('/tmp/demo');
    expect(__testables.parseInfiluxUrl('enso://open?path=%2Ftmp')).toBeNull();
    expect(__testables.sanitizePath('"/tmp/demo/"')).toBe('/tmp/demo/');
    expect(__testables.readStoredLanguage()).toBe('zh');

    mainIndexTestDoubles.readSharedSettings.mockReturnValueOnce({
      'enso-settings': {
        state: {
          language: 123,
        },
      },
    });
    expect(__testables.readStoredLanguage()).toBe('en');
  });

  it('treats terminal lifecycle write failures as ignorable runtime noise', async () => {
    const { __testables } = await importMainModule({
      platform: 'darwin',
    });

    const eioError = new Error('write failed') as NodeJS.ErrnoException;
    eioError.code = 'EIO';
    const destroyedError = new Error('stream destroyed') as NodeJS.ErrnoException;
    destroyedError.code = 'ERR_STREAM_DESTROYED';
    const messageOnlyError = new Error('write EIO');

    expect(__testables.isIgnorableConsoleWriteError(eioError)).toBe(true);
    expect(__testables.isIgnorableConsoleWriteError(destroyedError)).toBe(true);
    expect(__testables.isIgnorableConsoleWriteError(messageOnlyError)).toBe(true);
    expect(__testables.isIgnorableConsoleWriteError(new Error('boom'))).toBe(false);
  });

  it('handles helper fallbacks and restores minimized windows through test helpers', async () => {
    const existingWindow = mainIndexTestDoubles.createWindow({ minimized: true });
    mainIndexTestDoubles.setWindows([existingWindow], null);
    mainIndexTestDoubles.readSharedSettings.mockImplementationOnce(() => {
      throw new Error('settings missing');
    });

    const { __testables } = await importMainModule({
      platform: 'win32',
    });

    expect(__testables.isPrivateIpLiteral('172.20.1.5')).toBe(true);
    expect(__testables.isPrivateIpLiteral('999.1.1.1')).toBe(false);
    expect(__testables.isPrivateIpLiteral('')).toBe(false);
    expect(__testables.isAllowedRemoteImageUrl('ftp://example.com/image.png')).toBe(false);
    expect(__testables.isAllowedRemoteImageUrl('not-a-url')).toBe(false);
    expect(__testables.sanitizeProfileName('   ')).toBe('');
    expect(__testables.parseInfiluxUrl('not-a-url')).toBeNull();
    expect(__testables.readStoredLanguage()).toBe('en');
    expect(__testables.getAnyWindow()).toBe(existingWindow);
    expect(__testables.openOrRestoreMainWindow()).toBe(existingWindow);
    expect(existingWindow.restore).toHaveBeenCalledTimes(1);
    expect(existingWindow.focus).toHaveBeenCalledTimes(1);

    mainIndexTestDoubles.setWindows([], null);
    __testables.sendOpenPath('/tmp/pending');
    __testables.handleCommandLineArgs(['--flag', 'plain-arg']);
    expect(__testables.getAnyWindow()).toBeNull();
  });

  it('opens paths from command line arguments and second-instance events', async () => {
    const loadingWindow = mainIndexTestDoubles.createWindow({ loading: true, minimized: true });
    const readyWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setWindows([loadingWindow], loadingWindow);

    const { __testables } = await importMainModule({
      platform: 'win32',
    });

    __testables.handleCommandLineArgs(['--open-path="/tmp/demo/"']);
    expect(loadingWindow.focus).toHaveBeenCalled();
    expect(loadingWindow.webContents.send).not.toHaveBeenCalled();

    mainIndexTestDoubles.setWindows([readyWindow], readyWindow);
    await mainIndexTestDoubles.emitApp('second-instance', {}, [
      'infilux://open?path=%2Ftmp%2Ffrom-url',
    ]);

    expect(readyWindow.restore).not.toHaveBeenCalled();
    expect(readyWindow.focus).toHaveBeenCalled();
    expect(readyWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.APP_OPEN_PATH,
      '/tmp/from-url'
    );
    expect(__testables.getAnyWindow()).toBe(readyWindow);
  });

  it('migrates legacy settings and todo data into shared state', async () => {
    const userDataPath = join('/mock/appData', 'Infilux-dev');
    const settingsPath = join(userDataPath, 'settings.json');
    const todoPath = join(userDataPath, 'todo.db');
    mainIndexTestDoubles.isLegacySettingsMigrated.mockReturnValue(false);
    mainIndexTestDoubles.isLegacyTodoMigrated.mockReturnValue(false);
    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) => target === settingsPath || target === todoPath
    );
    mainIndexTestDoubles.readFileSync.mockImplementation(
      (target: string, encoding?: BufferEncoding) => {
        if (target === settingsPath && encoding === 'utf-8') {
          return JSON.stringify({ theme: 'dark' });
        }
        return Buffer.from('file');
      }
    );
    mainIndexTestDoubles.readSharedSessionState.mockReturnValue({
      version: 1,
      updatedAt: 1,
    });

    const { __testables } = await importMainModule({
      platform: 'win32',
    });

    __testables.migrateLegacySettingsIfNeeded();
    await __testables.migrateLegacyTodoIfNeeded();

    expect(mainIndexTestDoubles.writeSharedSettings).toHaveBeenCalledWith({ theme: 'dark' });
    expect(mainIndexTestDoubles.writeSharedSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsData: { theme: 'dark' },
      })
    );
    expect(mainIndexTestDoubles.todoInitialize).toHaveBeenCalled();
    expect(mainIndexTestDoubles.todoExportAllTasks).toHaveBeenCalled();
    expect(mainIndexTestDoubles.writeSharedSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        todos: [{ id: 'board-1' }],
      })
    );
    expect(mainIndexTestDoubles.markLegacySettingsMigrated).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.markLegacyTodoMigrated).toHaveBeenCalledTimes(1);
  });

  it('recovers shared localStorage from the current profile leveldb when shared repos are missing', async () => {
    mainIndexTestDoubles.readSharedSessionState.mockReturnValue({
      version: 2,
      updatedAt: 1,
      localStorage: {
        'enso-worktree-tabs': '{}',
      },
    });
    mainIndexTestDoubles.readElectronLocalStorageSnapshotFromLevelDbDirs.mockReturnValue({
      'enso-repositories':
        '[{"id":"local:/repo/demo","name":"demo","path":"/repo/demo","kind":"local"}]',
      'enso-selected-repo': '/repo/demo',
      'enso-worktree-tabs': '{"/repo/demo":"chat"}',
    });

    const { __testables } = await importMainModule({
      platform: 'darwin',
    });

    __testables.recoverSharedLocalStorageFromCurrentProfileIfNeeded();

    expect(
      mainIndexTestDoubles.readElectronLocalStorageSnapshotFromLevelDbDirs
    ).toHaveBeenCalledWith(['/mock/appData/Infilux-dev/Local Storage/leveldb']);
    expect(mainIndexTestDoubles.writeSharedSessionState).toHaveBeenCalledWith(
      expect.objectContaining({
        localStorage: {
          'enso-repositories':
            '[{"id":"local:/repo/demo","name":"demo","path":"/repo/demo","kind":"local"}]',
          'enso-selected-repo': '/repo/demo',
          'enso-worktree-tabs': '{}',
        },
      })
    );
  });

  it('marks missing legacy files, warns on migration failures, and initializes AppImage auto updates', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.APPIMAGE = '/tmp/Infilux.AppImage';

    const userDataPath = join('/mock/appData', 'Infilux-dev');
    const settingsPath = join(userDataPath, 'settings.json');
    const todoPath = join(userDataPath, 'todo.db');
    mainIndexTestDoubles.isLegacySettingsMigrated.mockReturnValue(false);
    mainIndexTestDoubles.isLegacyTodoMigrated.mockReturnValue(false);

    const { __testables } = await importMainModule({
      platform: 'linux',
    });

    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) => target !== settingsPath && target !== todoPath
    );
    __testables.migrateLegacySettingsIfNeeded();
    await __testables.migrateLegacyTodoIfNeeded();

    expect(mainIndexTestDoubles.markLegacySettingsMigrated).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.markLegacyTodoMigrated).toHaveBeenCalledTimes(1);

    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) => target === settingsPath || target === todoPath
    );
    mainIndexTestDoubles.readFileSync.mockImplementation(
      (target: string, encoding?: BufferEncoding) => {
        if (target === settingsPath && encoding === 'utf-8') {
          return '{invalid-json';
        }
        return Buffer.from('file');
      }
    );
    mainIndexTestDoubles.todoInitialize.mockRejectedValueOnce(new Error('todo init failed'));

    __testables.migrateLegacySettingsIfNeeded();
    await __testables.migrateLegacyTodoIfNeeded();
    await __testables.initAutoUpdater(mainIndexTestDoubles.createWindow() as never);

    expect(warnSpy).toHaveBeenCalledWith(
      '[migration] Failed to migrate legacy settings:',
      expect.any(Error)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[migration] Failed to migrate legacy todo.db:',
      expect.any(Error)
    );
    expect(mainIndexTestDoubles.autoUpdaterInit).toHaveBeenCalledWith(
      expect.any(Object),
      true,
      null
    );
  });

  it('initializes logging, git checks, IPC handlers, and the auto updater', async () => {
    const window = mainIndexTestDoubles.createWindow();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mainIndexTestDoubles.readSettings.mockReturnValue({
      'enso-settings': {
        state: {
          autoUpdateEnabled: false,
          logLevel: 'debug',
          logRetentionDays: 14,
          loggingEnabled: true,
          proxySettings: {
            enabled: true,
          },
        },
      },
    });
    mainIndexTestDoubles.checkGitInstalled.mockResolvedValue(false);

    const { __testables } = await importMainModule({
      platform: 'win32',
    });

    await __testables.init();
    await __testables.initAutoUpdater(window as never);

    expect(mainIndexTestDoubles.initLogger).toHaveBeenCalledWith(true, 'debug', 14);
    expect(mainIndexTestDoubles.logInfo).toHaveBeenCalledWith('Infilux started');
    expect(warnSpy).toHaveBeenCalledWith('Git is not installed. Some features may not work.');
    expect(mainIndexTestDoubles.registerIpcHandlers).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.registerClaudeBridgeIpcHandlers).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.persistentAgentSessionRepositoryInitialize).toHaveBeenCalledTimes(
      1
    );
    expect(mainIndexTestDoubles.autoUpdaterInit).toHaveBeenCalledWith(
      window,
      false,
      expect.objectContaining({
        enabled: true,
      })
    );
  });

  it('skips auto updater on Linux when AppImage is unavailable', async () => {
    const window = mainIndexTestDoubles.createWindow();

    const { __testables } = await importMainModule({
      platform: 'linux',
    });

    await __testables.initAutoUpdater(window as never);

    expect(mainIndexTestDoubles.autoUpdaterInit).not.toHaveBeenCalled();
  });

  it('opens the main window without waiting for background startup tasks', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    let resolveGitCheck: (value: boolean) => void = () => {
      throw new Error('Git check resolver was not initialized');
    };
    let resolveAutoStartHapi: () => void = () => {
      throw new Error('Hapi startup resolver was not initialized');
    };

    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.checkGitInstalled.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveGitCheck = resolve;
        })
    );
    mainIndexTestDoubles.autoStartHapi.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAutoStartHapi = resolve;
        })
    );

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    expect(mainIndexTestDoubles.registerIpcHandlers).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.autoStartHapi).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.webInspectorSetMainWindow).toHaveBeenCalledWith(mainWindow);

    const gitCheckResolver = resolveGitCheck;
    const autoStartHapiResolver = resolveAutoStartHapi;

    if (!gitCheckResolver || !autoStartHapiResolver) {
      throw new Error('Missing deferred startup resolvers');
    }

    gitCheckResolver(true);
    autoStartHapiResolver();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('runs the ready startup chain, flushes pending open paths, and updates language menus', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: true });
    const activatedWindow = mainIndexTestDoubles.createWindow({ loading: false });

    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.readSettings.mockReturnValue({
      'enso-settings': {
        state: {
          autoUpdateEnabled: false,
          proxySettings: {
            mode: 'manual',
          },
        },
      },
      claudeCodeIntegration: {
        enableProviderWatcher: false,
      },
    });
    mainIndexTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          language: 'zh',
        },
      },
    });

    await importMainModule({
      autoReady: true,
      platform: 'win32',
      argv: ['/mock/electron', '/mock/app', '--open-path="/tmp/bootstrap/"'],
    });

    expect(mainIndexTestDoubles.setAppUserModelId).toHaveBeenCalledWith('com.infilux.app');
    expect(mainIndexTestDoubles.registerAllowedLocalFileRoot).toHaveBeenCalledWith(
      join('/mock/temp', 'infilux-input')
    );
    expect(mainIndexTestDoubles.cleanupTempFiles).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.autoStartHapi).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.setCurrentLocale).toHaveBeenCalledWith('zh');
    expect(mainIndexTestDoubles.registerWindowHandlers).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledWith({
      bootstrapMainStage: 'main-init-complete',
    });
    expect(mainIndexTestDoubles.webInspectorSetMainWindow).toHaveBeenCalledWith(mainWindow);
    expect(mainIndexTestDoubles.initClaudeProviderWatcher).toHaveBeenCalledWith(mainWindow, false);
    expect(mainIndexTestDoubles.autoUpdaterInit).toHaveBeenCalledWith(
      mainWindow,
      false,
      expect.objectContaining({
        mode: 'manual',
      })
    );
    expect(mainIndexTestDoubles.gitAutoFetchInit).toHaveBeenCalledWith(mainWindow);
    expect(mainIndexTestDoubles.setApplicationMenu).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.trayInit).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.ipcHandle).toHaveBeenCalledWith(
      IPC_CHANNELS.APP_SET_LANGUAGE,
      expect.any(Function)
    );
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();

    const startupLogs = mainIndexTestDoubles.logInfo.mock.calls
      .map(([message]) => message)
      .filter(
        (message): message is string =>
          typeof message === 'string' && message.startsWith('[startup][main]')
      );

    expect(startupLogs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('module-evaluated'),
        expect.stringContaining('app-ready'),
        expect.stringContaining('pre-window-startup-complete'),
        expect.stringContaining('main-init-complete'),
        expect.stringContaining('main-window-created'),
        expect.stringContaining('hapi-auto-start-queued'),
        expect.stringContaining('auto-updater-initialized'),
      ])
    );

    mainWindow.setLoading(false);
    mainWindow.emitWebContentsEvent('did-finish-load');

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.APP_OPEN_PATH,
      '/tmp/bootstrap/'
    );

    const languageHandler = mainIndexTestDoubles.ipcHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.APP_SET_LANGUAGE
    )?.[1] as ((event: unknown, language: 'en' | 'zh') => void) | undefined;

    if (!languageHandler) {
      throw new Error('Missing language IPC handler');
    }

    languageHandler({}, 'en');
    expect(mainIndexTestDoubles.setCurrentLocale).toHaveBeenCalledWith('en');
    expect(mainIndexTestDoubles.setApplicationMenu).toHaveBeenCalledTimes(2);
    expect(mainIndexTestDoubles.trayRefreshMenu).toHaveBeenCalledTimes(1);

    mainIndexTestDoubles.setWindows([], null);
    mainIndexTestDoubles.setNextOpenWindow(activatedWindow);
    await mainIndexTestDoubles.emitApp('activate');
    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledTimes(2);
    expect(mainIndexTestDoubles.autoUpdaterAttachWindow).toHaveBeenCalledWith(activatedWindow);

    await mainIndexTestDoubles.emitApp('browser-window-focus', {}, activatedWindow);
    expect(mainIndexTestDoubles.webInspectorSetMainWindow).toHaveBeenLastCalledWith(
      activatedWindow
    );
    expect(mainIndexTestDoubles.autoUpdaterAttachWindow).toHaveBeenLastCalledWith(activatedWindow);
  });

  it('initializes the tray on macOS and keeps the app alive when windows close', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) => target === join(process.cwd(), 'build', 'icon-mac.png')
    );

    await importMainModule({
      autoReady: true,
      platform: 'darwin',
    });

    expect(mainIndexTestDoubles.trayInit).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.setDockIcon).toHaveBeenCalledWith(
      join(process.cwd(), 'build', 'icon-mac.png')
    );
    const trayOptions = mainIndexTestDoubles.trayInit.mock.calls[0]?.[0] as
      | { onOpen: () => void; onQuit: () => void }
      | undefined;
    expect(trayOptions).toBeDefined();

    await mainIndexTestDoubles.emitApp('window-all-closed');
    expect(mainIndexTestDoubles.quit).not.toHaveBeenCalled();

    mainIndexTestDoubles.setWindows([], null);
    trayOptions?.onOpen();
    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledTimes(2);

    trayOptions?.onQuit();
    expect(mainIndexTestDoubles.quit).toHaveBeenCalledTimes(1);
  });

  it('uses the light mac dock icon when the system appearance is light', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.setNativeThemeShouldUseDarkColors(false);
    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) => target === join(process.cwd(), 'build', 'icon-mac-light.png')
    );

    await importMainModule({
      autoReady: true,
      platform: 'darwin',
    });

    expect(mainIndexTestDoubles.setDockIcon).toHaveBeenCalledWith(
      join(process.cwd(), 'build', 'icon-mac-light.png')
    );
  });

  it('refreshes the mac dock icon when the system appearance changes', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) =>
        target === join(process.cwd(), 'build', 'icon-mac.png') ||
        target === join(process.cwd(), 'build', 'icon-mac-light.png')
    );

    await importMainModule({
      autoReady: true,
      platform: 'darwin',
    });

    expect(mainIndexTestDoubles.setDockIcon).toHaveBeenLastCalledWith(
      join(process.cwd(), 'build', 'icon-mac.png')
    );

    mainIndexTestDoubles.setNativeThemeShouldUseDarkColors(false);
    await mainIndexTestDoubles.emitNativeTheme('updated');

    expect(mainIndexTestDoubles.setDockIcon).toHaveBeenLastCalledWith(
      join(process.cwd(), 'build', 'icon-mac-light.png')
    );
  });

  it('initializes the tray on Windows and keeps the app alive when windows close', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    expect(mainIndexTestDoubles.trayInit).toHaveBeenCalledTimes(1);
    const trayOptions = mainIndexTestDoubles.trayInit.mock.calls[0]?.[0] as
      | { onOpen: () => void; onQuit: () => void }
      | undefined;
    expect(trayOptions).toBeDefined();

    await mainIndexTestDoubles.emitApp('window-all-closed');
    expect(mainIndexTestDoubles.quit).not.toHaveBeenCalled();

    mainIndexTestDoubles.setWindows([], null);
    trayOptions?.onOpen();
    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledTimes(2);
  });

  it('quits when all windows close and the tray is not initialized', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);

    await importMainModule({
      autoReady: true,
      platform: 'linux',
    });

    mainIndexTestDoubles.trayIsInitialized.mockReturnValue(false);
    await mainIndexTestDoubles.emitApp('window-all-closed');

    expect(mainIndexTestDoubles.webInspectorSetMainWindow).toHaveBeenLastCalledWith(null);
    expect(mainIndexTestDoubles.quit).toHaveBeenCalledTimes(1);
  });

  it('resolves packaged app icons from the resources root before the build fallback', async () => {
    mainIndexTestDoubles.existsSync.mockImplementation(
      (target: string) => target === join('/mock/resources', 'icon-mac.png')
    );

    const module = await importMainModule({
      platform: 'darwin',
    });

    mainIndexTestDoubles.setAppIsPackaged(true);
    Object.defineProperty(process, 'resourcesPath', {
      value: '/mock/resources',
      configurable: true,
    });

    expect(module.__testables.resolveAppIconPath()).toBe(join('/mock/resources', 'icon-mac.png'));
  });

  it('warns in production when shortcut guards are not installed by the optimizer', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });

    await bootstrapPackagedWindow(mainWindow);

    expect(mainIndexTestDoubles.watchWindowShortcuts).toHaveBeenCalledWith(mainWindow);
    expect(warnSpy).toHaveBeenCalledWith(
      '[ctrl-r-passthrough] watchWindowShortcuts did not add any before-input-event listener'
    );
  });

  it('lets Ctrl+R bypass production shortcut guards while preserving other optimizer handlers', async () => {
    const shortcutGuard = vi.fn();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });

    mainIndexTestDoubles.watchWindowShortcuts.mockImplementation((window: MockWindow) => {
      window.webContents.on('before-input-event', shortcutGuard);
    });

    await bootstrapPackagedWindow(mainWindow);

    const ctrlREvent = {
      preventDefault: vi.fn(),
    };
    mainWindow.emitWebContentsEvent('before-input-event', ctrlREvent, {
      alt: false,
      code: 'KeyR',
      control: true,
      key: 'r',
      meta: false,
      shift: false,
    });

    expect(shortcutGuard).not.toHaveBeenCalled();
    expect(ctrlREvent.preventDefault).not.toHaveBeenCalled();

    const otherShortcutEvent = {
      preventDefault: vi.fn(),
    };
    mainWindow.emitWebContentsEvent('before-input-event', otherShortcutEvent, {
      alt: false,
      code: 'KeyP',
      control: true,
      key: 'p',
      meta: false,
      shift: false,
    });

    expect(shortcutGuard).toHaveBeenCalledTimes(1);
    expect(otherShortcutEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('intercepts Ctrl+- before it reaches the renderer on Windows', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({
      loading: false,
      zoomLevel: 1,
    });
    await bootstrapReadyWindow(mainWindow);
    await mainIndexTestDoubles.emitApp('browser-window-created', {}, mainWindow);

    const zoomEvent = {
      preventDefault: vi.fn(),
    };
    mainWindow.emitWebContentsEvent('before-input-event', zoomEvent, {
      control: true,
      key: '-',
      meta: false,
    });

    expect(zoomEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.setZoomLevel).toHaveBeenCalledWith(0.5);
  });

  it('intercepts Cmd+- before it reaches the renderer on macOS', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({
      loading: false,
      zoomLevel: 1,
    });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    await importMainModule({
      autoReady: true,
      platform: 'darwin',
    });
    await mainIndexTestDoubles.emitApp('browser-window-created', {}, mainWindow);

    const zoomEvent = {
      preventDefault: vi.fn(),
    };
    mainWindow.emitWebContentsEvent('before-input-event', zoomEvent, {
      control: false,
      key: '-',
      meta: true,
    });

    expect(zoomEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindow.webContents.setZoomLevel).toHaveBeenCalledWith(0.5);
  });

  it('exposes a menu callback that opens a new local window', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    const menuOptions = mainIndexTestDoubles.buildAppMenu.mock.calls.at(0)?.at(0) as
      | { onNewWindow: () => void }
      | undefined;

    if (!menuOptions) {
      throw new Error('Missing buildAppMenu call');
    }

    menuOptions.onNewWindow();

    expect(mainIndexTestDoubles.openLocalWindow).toHaveBeenCalledTimes(2);
  });

  it('logs only actionable renderer console diagnostics', async () => {
    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });

    await bootstrapWindowWithRendererDiagnostics(mainWindow);

    mainWindow.emitWebContentsEvent(
      'console-message',
      {},
      1,
      'routine info',
      10,
      'http://localhost:5173/src/App.tsx'
    );
    mainWindow.emitWebContentsEvent(
      'console-message',
      {},
      1,
      '[renderer-bootstrap] mounted',
      11,
      'http://localhost:5173/src/bootstrap.tsx'
    );
    mainWindow.emitWebContentsEvent(
      'console-message',
      {},
      1,
      'Maximum update depth exceeded',
      12,
      'http://localhost:5173/src/App.tsx'
    );
    mainWindow.emitWebContentsEvent(
      'console-message',
      {},
      1,
      'TypeError: failed to render',
      13,
      'http://localhost:5173/src/App.tsx'
    );
    mainWindow.emitWebContentsEvent(
      'console-message',
      {},
      2,
      'warning from renderer',
      14,
      'http://localhost:5173/src/App.tsx'
    );

    const consoleLogs = rawDebugSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith('[renderer-console]'));

    expect(consoleLogs).toHaveLength(4);
    expect(consoleLogs.some((message) => message.includes('routine info'))).toBe(false);
    expect(consoleLogs.some((message) => message.includes('[renderer-bootstrap] mounted'))).toBe(
      true
    );
    expect(consoleLogs.some((message) => message.includes('Maximum update depth exceeded'))).toBe(
      true
    );
    expect(consoleLogs.some((message) => message.includes('TypeError: failed to render'))).toBe(
      true
    );
    expect(consoleLogs.some((message) => message.includes('warning from renderer'))).toBe(true);
  });

  it('falls back to console.error when raw debug output is unavailable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    Object.defineProperty(process as ProcessWithRawDebug, '_rawDebug', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await bootstrapWindowWithRendererDiagnostics(mainWindow);

    mainWindow.emitWebContentsEvent(
      'console-message',
      {},
      2,
      'warning from renderer',
      14,
      'http://localhost:5173/src/App.tsx'
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[renderer-console]'));
  });

  it('logs only tracked renderer request errors for the same window', async () => {
    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });

    await bootstrapWindowWithRendererDiagnostics(mainWindow);

    mainWindow.emitRequestError({
      error: 'ERR_ABORTED',
      resourceType: 'script',
      url: 'http://localhost:5173/src/index.tsx',
      webContentsId: mainWindow.webContents.id + 1,
    });
    mainWindow.emitRequestError({
      error: 'ERR_ABORTED',
      resourceType: 'script',
      url: 'http://localhost:5173/assets/app.js',
      webContentsId: mainWindow.webContents.id,
    });
    mainWindow.emitRequestError({
      error: 'ERR_ABORTED',
      resourceType: 'script',
      url: 'http://localhost:5173/src/index.tsx',
      webContentsId: mainWindow.webContents.id,
    });
    mainWindow.emitRequestError({
      error: 'ERR_ABORTED',
      resourceType: 'script',
      url: 'http://localhost:5173/@vite/client',
      webContentsId: mainWindow.webContents.id,
    });
    mainWindow.emitRequestError({
      error: 'ERR_FILE_NOT_FOUND',
      resourceType: 'script',
      url: 'http://localhost:5173/@fs/Users/demo/project/src/App.tsx',
      webContentsId: mainWindow.webContents.id,
    });

    const requestLogs = rawDebugSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith('[renderer-request-error]'));

    expect(requestLogs).toHaveLength(3);
    expect(requestLogs.some((message) => message.includes('/assets/app.js'))).toBe(false);
    expect(requestLogs.some((message) => message.includes('/src/index.tsx'))).toBe(true);
    expect(requestLogs.some((message) => message.includes('/@vite/client'))).toBe(true);
    expect(
      requestLogs.some((message) => message.includes('/@fs/Users/demo/project/src/App.tsx'))
    ).toBe(true);
  });

  it('captures renderer snapshots on load and scheduled follow-up checkpoints', async () => {
    vi.useFakeTimers();

    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });

    await bootstrapWindowWithRendererDiagnostics(mainWindow);
    rawDebugSpy.mockClear();

    mainWindow.emitWebContentsEvent('did-finish-load');
    await flushMicrotasks(20);

    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90_000);
    await flushMicrotasks(20);

    const snapshotLogs = rawDebugSpy.mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.startsWith('[renderer-snapshot]'));

    expect(mainWindow.webContents.executeJavaScript).toHaveBeenCalledTimes(6);
    expect(snapshotLogs).toHaveLength(6);
    expect(snapshotLogs.some((message) => message.includes('did-finish-load'))).toBe(true);
    expect(snapshotLogs.some((message) => message.includes('post-load-1000ms'))).toBe(true);
    expect(snapshotLogs.some((message) => message.includes('post-load-3000ms'))).toBe(true);
    expect(snapshotLogs.some((message) => message.includes('post-load-20000ms'))).toBe(true);
    expect(snapshotLogs.some((message) => message.includes('post-load-60000ms'))).toBe(true);
    expect(snapshotLogs.some((message) => message.includes('post-load-90000ms'))).toBe(true);
  });

  it('skips renderer snapshots once the window is already destroyed', async () => {
    vi.useFakeTimers();

    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });

    await bootstrapWindowWithRendererDiagnostics(mainWindow);
    rawDebugSpy.mockClear();
    mainWindow.webContents.executeJavaScript.mockClear();

    mainWindow.emitWindowEvent('closed');
    mainWindow.emitWebContentsEvent('did-finish-load');
    await flushMicrotasks(20);
    await vi.advanceTimersByTimeAsync(90_000);
    await flushMicrotasks(20);

    expect(mainWindow.webContents.executeJavaScript).not.toHaveBeenCalled();
    expect(rawDebugSpy).not.toHaveBeenCalled();
  });

  it('skips renderer recovery listener cleanup once the window webContents is destroyed', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainWindow.webContents.removeListener.mockImplementation(() => {
      if (mainWindow.webContents.isDestroyed()) {
        throw new TypeError('Object has been destroyed');
      }
    });

    await bootstrapWindowWithRendererDiagnostics(mainWindow);

    expect(() => {
      mainWindow.emitWindowEvent('closed');
    }).not.toThrow();
    expect(mainWindow.webContents.removeListener).not.toHaveBeenCalled();
  });

  it('writes full and cropped renderer screenshots when the worktree probe is present', async () => {
    vi.useFakeTimers();

    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    const fullScreenshot = mainIndexTestDoubles.createMockImage('full-window');
    const nodeScreenshot = mainIndexTestDoubles.createMockImage('worktree-node');
    const inlineSignalsScreenshot = mainIndexTestDoubles.createMockImage('inline-signals');
    fullScreenshot.crop
      .mockReturnValueOnce(nodeScreenshot)
      .mockReturnValueOnce(inlineSignalsScreenshot);
    mainWindow.webContents.executeJavaScript.mockResolvedValue({
      worktreeProbe: {
        nodeFound: true,
        rects: {
          inlineSignals: {
            x: 32,
            y: 48,
            width: 80,
            height: 24,
          },
          node: {
            x: 12,
            y: 24,
            width: 240,
            height: 64,
          },
        },
      },
    });
    mainWindow.webContents.capturePage.mockResolvedValue(fullScreenshot);

    await bootstrapWindowWithRendererDiagnostics(mainWindow);
    rawDebugSpy.mockClear();
    mainIndexTestDoubles.writeFileSync.mockClear();

    mainWindow.emitWebContentsEvent('did-finish-load');
    await flushMicrotasks(20);

    expect(mainIndexTestDoubles.writeFileSync).toHaveBeenCalledTimes(3);
    expect(mainIndexTestDoubles.writeFileSync).toHaveBeenNthCalledWith(
      1,
      '/tmp/infilux-worktree-1-did-finish-load.png',
      Buffer.from('full-window')
    );
    expect(mainIndexTestDoubles.writeFileSync).toHaveBeenNthCalledWith(
      2,
      '/tmp/infilux-worktree-1-did-finish-load-node.png',
      Buffer.from('worktree-node')
    );
    expect(mainIndexTestDoubles.writeFileSync).toHaveBeenNthCalledWith(
      3,
      '/tmp/infilux-worktree-1-did-finish-load-signals.png',
      Buffer.from('inline-signals')
    );

    const snapshotLog = rawDebugSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.startsWith('[renderer-snapshot]'));

    expect(snapshotLog).toContain('/tmp/infilux-worktree-1-did-finish-load.png');
    expect(snapshotLog).toContain('/tmp/infilux-worktree-1-did-finish-load-node.png');
    expect(snapshotLog).toContain('/tmp/infilux-worktree-1-did-finish-load-signals.png');
  });

  it('records renderer screenshot failures in the diagnostic payload', async () => {
    vi.useFakeTimers();

    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainWindow.webContents.executeJavaScript.mockResolvedValue({
      worktreeProbe: {
        nodeFound: true,
        rects: {
          node: {
            x: 12,
            y: 24,
            width: 240,
            height: 64,
          },
        },
      },
    });
    mainWindow.webContents.capturePage.mockRejectedValueOnce(new Error('capture failed'));

    await bootstrapWindowWithRendererDiagnostics(mainWindow);
    rawDebugSpy.mockClear();
    mainIndexTestDoubles.writeFileSync.mockClear();

    mainWindow.emitWebContentsEvent('did-finish-load');
    await flushMicrotasks(20);

    expect(mainIndexTestDoubles.writeFileSync).not.toHaveBeenCalled();

    const snapshotLog = rawDebugSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.startsWith('[renderer-snapshot]'));

    expect(snapshotLog).toContain('screenshotError');
    expect(snapshotLog).toContain('capture failed');
  });

  it('records renderer snapshot evaluation failures separately from screenshot failures', async () => {
    vi.useFakeTimers();

    const rawDebugSpy = installRawDebugSpy();
    const mainWindow = mainIndexTestDoubles.createWindow({ loading: false });
    mainWindow.webContents.executeJavaScript.mockRejectedValueOnce(new Error('snapshot failed'));

    await bootstrapWindowWithRendererDiagnostics(mainWindow);
    rawDebugSpy.mockClear();

    mainWindow.emitWebContentsEvent('did-finish-load');
    await flushMicrotasks(20);

    const snapshotErrorLog = rawDebugSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.startsWith('[renderer-snapshot-error]'));

    expect(snapshotErrorLog).toContain('snapshot failed');
  });

  it('serves local-file requests and remote local-image proxy requests safely', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    mainIndexTestDoubles.customProtocolUriToPath.mockReturnValueOnce('/allowed/file.png');
    mainIndexTestDoubles.isAllowedLocalFilePath.mockReturnValueOnce(true);
    mainIndexTestDoubles.netFetch.mockResolvedValueOnce(
      new Response('image-data', {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      })
    );

    const localFileResponse = await mainIndexTestDoubles.invokeProtocol('local-file', {
      url: 'local-file:///allowed/file.png',
    });
    expect(localFileResponse.status).toBe(200);
    expect(mainIndexTestDoubles.netFetch).toHaveBeenCalledWith('file:///allowed/file.png');

    const blockedRemoteResponse = await mainIndexTestDoubles.invokeProtocol('local-image', {
      url: 'local-image://remote-fetch?url=http%3A%2F%2F127.0.0.1%2Fsecret.png',
    });
    expect(blockedRemoteResponse.status).toBe(403);

    mainIndexTestDoubles.netFetch.mockResolvedValueOnce(
      new Response('remote-image', {
        status: 200,
        headers: {
          'content-type': 'image/webp',
        },
      })
    );
    const remoteImageResponse = await mainIndexTestDoubles.invokeProtocol('local-image', {
      url: 'local-image://remote-fetch?url=https%3A%2F%2Fcdn.example.com%2Fimage.webp',
    });

    expect(remoteImageResponse.status).toBe(200);
    expect(remoteImageResponse.headers.get('content-type')).toBe('image/webp');
    expect(remoteImageResponse.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects unsafe local-image paths and supports video range responses', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    mainIndexTestDoubles.customProtocolUriToPath.mockReturnValueOnce('/tmp/forbidden.txt');
    const forbiddenResponse = await mainIndexTestDoubles.invokeProtocol('local-image', {
      url: 'local-image:///tmp/forbidden.txt',
    });
    expect(forbiddenResponse.status).toBe(403);

    mainIndexTestDoubles.customProtocolUriToPath.mockReturnValueOnce('/tmp/folder');
    mainIndexTestDoubles.statSync.mockReturnValueOnce({
      isDirectory: () => true,
      size: 0,
    });
    const directoryResponse = await mainIndexTestDoubles.invokeProtocol('local-image', {
      url: 'local-image:///tmp/folder',
    });
    expect(directoryResponse.status).toBe(400);

    mainIndexTestDoubles.customProtocolUriToPath.mockReturnValueOnce('/tmp/video.mp4');
    mainIndexTestDoubles.statSync
      .mockReturnValueOnce({
        isDirectory: () => false,
        size: 100,
      })
      .mockReturnValueOnce({
        isDirectory: () => false,
        size: 100,
      });
    const videoResponse = await mainIndexTestDoubles.invokeProtocol('local-image', {
      url: 'local-image:///tmp/video.mp4',
      headers: {
        Range: 'bytes=10-19',
      },
    });
    expect(videoResponse.status).toBe(206);
    expect(videoResponse.headers.get('content-range')).toBe('bytes 10-19/100');
    expect(videoResponse.headers.get('content-type')).toBe('video/mp4');

    mainIndexTestDoubles.customProtocolUriToPath.mockReturnValueOnce('/tmp/image.png');
    mainIndexTestDoubles.readFileSync.mockReturnValueOnce(Buffer.from('png'));
    const imageResponse = await mainIndexTestDoubles.invokeProtocol('local-image', {
      url: 'local-image:///tmp/image.png',
    });
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get('content-type')).toBe('image/png');
  });

  it('records uncaught exceptions and suppresses console noise for ignorable stream write errors', async () => {
    await importMainModule({
      platform: 'win32',
    });

    const uncaughtHandler = mainIndexTestDoubles.processListeners.get('uncaughtException');
    if (!uncaughtHandler) {
      throw new Error('Expected uncaughtException handler to be registered');
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ignorableError = new Error('write EIO') as NodeJS.ErrnoException;
    ignorableError.code = 'EIO';

    uncaughtHandler(ignorableError);

    expect(errorSpy).not.toHaveBeenCalledWith('Uncaught Exception:', ignorableError);
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.exit).not.toHaveBeenCalled();
  });

  it('records uncaught exceptions and performs a controlled shutdown for non-ignorable failures', async () => {
    await importMainModule({
      platform: 'win32',
    });

    const uncaughtHandler = mainIndexTestDoubles.processListeners.get('uncaughtException');
    if (!uncaughtHandler) {
      throw new Error('Expected uncaughtException handler to be registered');
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('boom');

    uncaughtHandler(failure);

    expect(errorSpy).toHaveBeenCalledWith('Uncaught Exception:', failure);
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledWith(1);
  });

  it('records unhandled rejections and performs a controlled shutdown for non-ignorable failures', async () => {
    await importMainModule({
      platform: 'win32',
    });

    const rejectionHandler = mainIndexTestDoubles.processListeners.get('unhandledRejection');
    if (!rejectionHandler) {
      throw new Error('Expected unhandledRejection handler to be registered');
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rejection = new Error('boom');

    rejectionHandler(rejection);

    expect(errorSpy).toHaveBeenCalledWith('Unhandled Rejection:', rejection);
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledWith(1);
  });

  it('records unhandled rejections and suppresses console noise for ignorable stream write errors', async () => {
    await importMainModule({
      platform: 'win32',
    });

    const rejectionHandler = mainIndexTestDoubles.processListeners.get('unhandledRejection');
    if (!rejectionHandler) {
      throw new Error('Expected unhandledRejection handler to be registered');
    }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ignorableError = new Error('stream destroyed') as NodeJS.ErrnoException;
    ignorableError.code = 'ERR_STREAM_DESTROYED';

    rejectionHandler(ignorableError);

    expect(errorSpy).not.toHaveBeenCalledWith('Unhandled Rejection:', ignorableError);
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.exit).not.toHaveBeenCalled();
  });

  it('bypasses custom will-quit cleanup while updater is restarting to install an update', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.autoUpdaterIsQuittingForUpdate.mockReturnValue(true);

    await importMainModule({
      autoReady: true,
      platform: 'darwin',
    });

    const quitEvent = {
      preventDefault: vi.fn(),
    };

    await mainIndexTestDoubles.emitApp('will-quit', quitEvent);
    await Promise.resolve();

    expect(mainIndexTestDoubles.logInfo).toHaveBeenCalledWith(
      '[updater] Allowing updater-controlled quit flow for install restart'
    );
    expect(quitEvent.preventDefault).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.registerWindowHandlersCleanup).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.unwatchClaudeSettings).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.gitAutoFetchCleanup).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.cleanupAllResources).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.exit).not.toHaveBeenCalled();
  });

  it('cleans up resources on will-quit and handles shutdown signals', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);

    const { __testables } = await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    const quitEvent = {
      preventDefault: vi.fn(),
    };

    await mainIndexTestDoubles.emitApp('will-quit', quitEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(quitEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.registerWindowHandlersCleanup).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.unwatchClaudeSettings).toHaveBeenCalled();
    expect(mainIndexTestDoubles.gitAutoFetchCleanup).toHaveBeenCalled();
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledWith(0);

    __testables.handleShutdownSignal('SIGINT');
    expect(mainIndexTestDoubles.cleanupAllResourcesSync).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledTimes(2);
  });

  it('forces synchronous cleanup when async quit cleanup reports timed out tasks', async () => {
    vi.useFakeTimers();

    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.cleanupAllResources.mockResolvedValue({
      hasTimeouts: true,
      timedOutLabels: ['terminals'],
      failedLabels: [],
    });

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    const quitEvent = {
      preventDefault: vi.fn(),
    };

    await mainIndexTestDoubles.emitApp('will-quit', quitEvent);
    await Promise.resolve();

    expect(mainIndexTestDoubles.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8000);

    expect(mainIndexTestDoubles.cleanupAllResourcesSync).toHaveBeenCalledTimes(1);
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledWith(0);
  });

  it('ignores repeated will-quit cleanup requests while shutdown is already running', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.cleanupAllResources.mockImplementation(
      () => new Promise<MockCleanupSummary>(() => undefined)
    );

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    const firstQuitEvent = {
      preventDefault: vi.fn(),
    };
    const secondQuitEvent = {
      preventDefault: vi.fn(),
    };

    await mainIndexTestDoubles.emitApp('will-quit', firstQuitEvent);
    await mainIndexTestDoubles.emitApp('will-quit', secondQuitEvent);

    expect(firstQuitEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondQuitEvent.preventDefault).not.toHaveBeenCalled();
    expect(mainIndexTestDoubles.cleanupAllResources).toHaveBeenCalledTimes(1);
  });

  it('logs synchronous cleanup failures before forcing exit on timeout', async () => {
    vi.useFakeTimers();

    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    mainIndexTestDoubles.cleanupAllResources.mockResolvedValue({
      hasTimeouts: true,
      timedOutLabels: ['remoteConnections'],
      failedLabels: [],
    });
    const syncCleanupError = new Error('sync cleanup failed');
    mainIndexTestDoubles.cleanupAllResourcesSync.mockImplementationOnce(() => {
      throw syncCleanupError;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    const quitEvent = {
      preventDefault: vi.fn(),
    };

    await mainIndexTestDoubles.emitApp('will-quit', quitEvent);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(8000);

    expect(errorSpy).toHaveBeenCalledWith(
      '[app] Sync cleanup error during will-quit-timeout:',
      syncCleanupError
    );
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledWith(0);
  });

  it('still exits when signal cleanup throws synchronously', async () => {
    const mainWindow = mainIndexTestDoubles.createWindow();
    mainIndexTestDoubles.setNextOpenWindow(mainWindow);
    const syncCleanupError = new Error('signal cleanup failed');
    mainIndexTestDoubles.cleanupAllResourcesSync.mockImplementationOnce(() => {
      throw syncCleanupError;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { __testables } = await importMainModule({
      autoReady: true,
      platform: 'win32',
    });

    __testables.handleShutdownSignal('SIGTERM');

    expect(errorSpy).toHaveBeenCalledWith(
      '[app] Sync cleanup error during SIGTERM:',
      syncCleanupError
    );
    expect(mainIndexTestDoubles.exit).toHaveBeenCalledWith(0);
  });
});
