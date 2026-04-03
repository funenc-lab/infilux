import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mainWindowTestDoubles = vi.hoisted(() => {
  let browserWindowOptions: Record<string, unknown> | null = null;

  const existsSync = vi.fn<(path: string) => boolean>(() => false);
  const readFileSync = vi.fn(() => '{}');
  const writeFileSync = vi.fn();
  const getPath = vi.fn((name: string) => `/mock/${name}`);
  const getAppPath = vi.fn(() => '/mock/app');
  const nativeThemeShouldUseDarkColors = vi.fn(() => true);
  const showMessageBox = vi.fn();
  const shellOpenExternal = vi.fn();
  const ipcOn = vi.fn();
  const ipcRemoveListener = vi.fn();
  const getAllDisplays = vi.fn(() => [{ workArea: { width: 1920, height: 1080, x: 0, y: 0 } }]);
  const getPrimaryDisplay = vi.fn(() => ({
    workArea: { width: 1920, height: 1080, x: 0, y: 0 },
  }));
  const translate = vi.fn((locale: string, key: string) => `${locale}:${key}`);
  const getCurrentLocale = vi.fn(() => 'en');
  const detachWindowSessions = vi.fn(async () => undefined);
  const isQuittingForUpdate = vi.fn(() => false);
  const readSharedSettings = vi.fn(() => ({}));

  class MockBrowserWindow {
    id = 1;
    webContents = {
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      removeListener: vi.fn(),
    };

    constructor(options: Record<string, unknown>) {
      browserWindowOptions = options;
    }

    getBounds() {
      return { height: 900, width: 1400, x: 10, y: 20 };
    }

    isMaximized() {
      return false;
    }

    maximize() {}

    once = vi.fn();
    on = vi.fn();
    loadURL = vi.fn();
    loadFile = vi.fn();
    isDestroyed() {
      return false;
    }
    show = vi.fn();
    focus = vi.fn();
    close = vi.fn();
    removeListener = vi.fn();
    setWindowButtonPosition = vi.fn();
  }

  function reset() {
    browserWindowOptions = null;
    existsSync.mockReset();
    readFileSync.mockReset();
    writeFileSync.mockReset();
    getPath.mockReset();
    getAppPath.mockReset();
    nativeThemeShouldUseDarkColors.mockReset();
    showMessageBox.mockReset();
    shellOpenExternal.mockReset();
    ipcOn.mockReset();
    ipcRemoveListener.mockReset();
    getAllDisplays.mockReset();
    getPrimaryDisplay.mockReset();
    translate.mockReset();
    getCurrentLocale.mockReset();
    detachWindowSessions.mockReset();
    isQuittingForUpdate.mockReset();
    readSharedSettings.mockReset();

    existsSync.mockReturnValue(false);
    readFileSync.mockReturnValue('{}');
    getPath.mockImplementation((name: string) => `/mock/${name}`);
    getAppPath.mockReturnValue('/mock/app');
    nativeThemeShouldUseDarkColors.mockReturnValue(true);
    getAllDisplays.mockReturnValue([{ workArea: { width: 1920, height: 1080, x: 0, y: 0 } }]);
    getPrimaryDisplay.mockReturnValue({
      workArea: { width: 1920, height: 1080, x: 0, y: 0 },
    });
    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('en');
    detachWindowSessions.mockResolvedValue(undefined);
    isQuittingForUpdate.mockReturnValue(false);
    readSharedSettings.mockReturnValue({});
  }

  return {
    MockBrowserWindow,
    app: {
      getAppPath,
      getPath,
      isPackaged: false,
    },
    dialog: {
      showMessageBox,
    },
    nativeTheme: {
      get shouldUseDarkColors() {
        return nativeThemeShouldUseDarkColors();
      },
    },
    shell: {
      openExternal: shellOpenExternal,
    },
    ipcMain: {
      on: ipcOn,
      removeListener: ipcRemoveListener,
    },
    screen: {
      getAllDisplays,
      getPrimaryDisplay,
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({
        popup: vi.fn(),
      })),
    },
    BrowserWindow: MockBrowserWindow,
    existsSync,
    readFileSync,
    writeFileSync,
    translate,
    getCurrentLocale,
    detachWindowSessions,
    isQuittingForUpdate,
    readSharedSettings,
    getBrowserWindowOptions: () => browserWindowOptions,
    reset,
  };
});

vi.mock('node:fs', () => ({
  existsSync: mainWindowTestDoubles.existsSync,
  readFileSync: mainWindowTestDoubles.readFileSync,
  writeFileSync: mainWindowTestDoubles.writeFileSync,
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false,
  },
}));

vi.mock('@shared/i18n', async () => {
  const actual = await vi.importActual<typeof import('@shared/i18n')>('@shared/i18n');
  return {
    ...actual,
    translate: mainWindowTestDoubles.translate,
  };
});

vi.mock('electron', () => ({
  app: mainWindowTestDoubles.app,
  BrowserWindow: mainWindowTestDoubles.BrowserWindow,
  dialog: mainWindowTestDoubles.dialog,
  ipcMain: mainWindowTestDoubles.ipcMain,
  Menu: mainWindowTestDoubles.Menu,
  nativeTheme: mainWindowTestDoubles.nativeTheme,
  screen: mainWindowTestDoubles.screen,
  shell: mainWindowTestDoubles.shell,
}));

vi.mock('../../services/i18n', () => ({
  getCurrentLocale: mainWindowTestDoubles.getCurrentLocale,
}));

vi.mock('../../services/session/SessionManager', () => ({
  sessionManager: {
    detachWindowSessions: mainWindowTestDoubles.detachWindowSessions,
  },
}));

vi.mock('../../services/updater/AutoUpdater', () => ({
  autoUpdaterService: {
    isQuittingForUpdate: mainWindowTestDoubles.isQuittingForUpdate,
  },
}));

vi.mock('../../services/SharedSessionState', () => ({
  readSharedSettings: mainWindowTestDoubles.readSharedSettings,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalResourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
const originalRuntimeChannel = process.env.INFILUX_RUNTIME_CHANNEL;
const originalNodeEnv = process.env.NODE_ENV;
const originalVitestEnv = process.env.VITEST;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

function restoreEnvVar(name: 'INFILUX_RUNTIME_CHANNEL' | 'NODE_ENV' | 'VITEST', value?: string) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe('MainWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    mainWindowTestDoubles.reset();
    delete process.env.INFILUX_RUNTIME_CHANNEL;
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalResourcesPathDescriptor) {
      Object.defineProperty(process, 'resourcesPath', originalResourcesPathDescriptor);
    } else {
      Reflect.deleteProperty(process, 'resourcesPath');
    }
    restoreEnvVar('INFILUX_RUNTIME_CHANNEL', originalRuntimeChannel);
    restoreEnvVar('NODE_ENV', originalNodeEnv);
    restoreEnvVar('VITEST', originalVitestEnv);
    mainWindowTestDoubles.app.isPackaged = false;
    vi.restoreAllMocks();
  });

  it('passes a runtime icon to BrowserWindow on Windows', async () => {
    setPlatform('win32');
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === join(process.cwd(), 'build', 'icon.png')
    );

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      icon: join(process.cwd(), 'build', 'icon.png'),
    });
  }, 15000);

  it('prefers packaged runtime icon candidates when the app is packaged', async () => {
    setPlatform('linux');
    mainWindowTestDoubles.app.isPackaged = true;
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/mock/resources',
    });
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/resources/build/icon.png'
    );

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      icon: '/mock/resources/build/icon.png',
    });
  });

  it('uses a dark bootstrap background color before the renderer paints', async () => {
    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      backgroundColor: '#0f1216',
    });
  });

  it('falls back to the default window state when the persisted state cannot be read', async () => {
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowTestDoubles.readFileSync.mockImplementation(() => {
      throw new Error('invalid window state');
    });

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 1400,
      height: 900,
      x: 260,
      y: 90,
    });
  });

  it('only passes the runtime channel when no bootstrap theme snapshot is available', async () => {
    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      webPreferences: {
        additionalArguments: ['--infilux-runtime-channel=prod'],
      },
    });
  });

  it('passes the persisted bootstrap locale through BrowserWindow additional arguments', async () => {
    mainWindowTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          language: 'zh-CN',
        },
      },
    });

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      webPreferences: {
        additionalArguments: expect.arrayContaining([
          '--infilux-runtime-channel=prod',
          '--infilux-bootstrap-locale=zh',
        ]),
      },
    });
  });

  it('passes the bootstrap main stage through BrowserWindow additional arguments', async () => {
    const { createMainWindow } = await import('../MainWindow');
    createMainWindow({ bootstrapMainStage: 'main-init-complete' });

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      webPreferences: {
        additionalArguments: expect.arrayContaining([
          '--infilux-runtime-channel=prod',
          '--infilux-bootstrap-main-stage=main-init-complete',
        ]),
      },
    });
  });

  it('passes the test runtime channel through BrowserWindow additional arguments when no explicit override is present', async () => {
    delete process.env.INFILUX_RUNTIME_CHANNEL;
    process.env.NODE_ENV = 'test';
    mainWindowTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'light',
          terminalTheme: 'Dracula',
        },
      },
    });

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      webPreferences: {
        additionalArguments: expect.arrayContaining([
          '--infilux-runtime-channel=test',
          expect.stringContaining('--infilux-bootstrap-theme='),
        ]),
      },
    });
  });

  it('prefers the explicit runtime channel override through BrowserWindow additional arguments', async () => {
    process.env.INFILUX_RUNTIME_CHANNEL = 'prod';
    process.env.NODE_ENV = 'test';
    mainWindowTestDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'light',
          terminalTheme: 'Dracula',
        },
      },
    });

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      webPreferences: {
        additionalArguments: expect.arrayContaining([
          '--infilux-runtime-channel=prod',
          expect.stringContaining('--infilux-bootstrap-theme='),
        ]),
      },
    });
  });

  it('forwards the requested partition into BrowserWindow webPreferences', async () => {
    const { createMainWindow } = await import('../MainWindow');
    createMainWindow({ partition: 'persist:workspace-1' });

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      webPreferences: {
        partition: 'persist:workspace-1',
      },
    });
  });

  it('centers the window when persisted state does not include coordinates', async () => {
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        width: 800,
        height: 700,
      })
    );

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 800,
      height: 700,
      x: 560,
      y: 190,
    });
  });

  it('clamps persisted coordinates back inside the current display work area', async () => {
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        width: 900,
        height: 700,
        x: 1700,
        y: 500,
      })
    );

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 900,
      height: 700,
      x: 1020,
      y: 380,
    });
  });

  it('clamps partially visible persisted coordinates to the minimum display bounds', async () => {
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        width: 900,
        height: 700,
        x: -10,
        y: -20,
      })
    );

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 900,
      height: 700,
      x: 0,
      y: 0,
    });
  });

  it('falls back to persisted state when the replacement window is already destroyed', async () => {
    mainWindowTestDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowTestDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        width: 960,
        height: 720,
        x: 40,
        y: 55,
      })
    );

    const replaceWindow = {
      isDestroyed: vi.fn(() => true),
      getBounds: vi.fn(() => ({ width: 1200, height: 800, x: 5, y: 6 })),
      isMaximized: vi.fn(() => true),
    };

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow({ replaceWindow: replaceWindow as never });

    expect(mainWindowTestDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 960,
      height: 720,
      x: 40,
      y: 55,
    });
    expect(replaceWindow.getBounds).not.toHaveBeenCalled();
    expect(replaceWindow.isMaximized).not.toHaveBeenCalled();
  });

  it('calls initializeWindow with the created BrowserWindow instance', async () => {
    const initializeWindow = vi.fn();

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow({ initializeWindow });

    expect(initializeWindow).toHaveBeenCalledTimes(1);
    expect(initializeWindow).toHaveBeenCalledWith(
      expect.any(mainWindowTestDoubles.MockBrowserWindow)
    );
  });
});
