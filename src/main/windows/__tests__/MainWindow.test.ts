import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mainWindowTestDoubles = vi.hoisted(() => {
  let browserWindowOptions: Record<string, unknown> | null = null;

  const existsSync = vi.fn<(path: string) => boolean>(() => false);
  const readFileSync = vi.fn(() => '{}');
  const writeFileSync = vi.fn();
  const getPath = vi.fn((name: string) => `/mock/${name}`);
  const getAppPath = vi.fn(() => '/mock/app');
  const showMessageBox = vi.fn();
  const shellOpenExternal = vi.fn();
  const ipcOn = vi.fn();
  const ipcRemoveListener = vi.fn();
  const translate = vi.fn((locale: string, key: string) => `${locale}:${key}`);
  const getCurrentLocale = vi.fn(() => 'en');
  const detachWindowSessions = vi.fn(async () => undefined);
  const isQuittingForUpdate = vi.fn(() => false);

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
    showMessageBox.mockReset();
    shellOpenExternal.mockReset();
    ipcOn.mockReset();
    ipcRemoveListener.mockReset();
    translate.mockReset();
    getCurrentLocale.mockReset();
    detachWindowSessions.mockReset();
    isQuittingForUpdate.mockReset();

    existsSync.mockReturnValue(false);
    readFileSync.mockReturnValue('{}');
    getPath.mockImplementation((name: string) => `/mock/${name}`);
    getAppPath.mockReturnValue('/mock/app');
    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('en');
    detachWindowSessions.mockResolvedValue(undefined);
    isQuittingForUpdate.mockReturnValue(false);
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
    shell: {
      openExternal: shellOpenExternal,
    },
    ipcMain: {
      on: ipcOn,
      removeListener: ipcRemoveListener,
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

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

describe('MainWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    mainWindowTestDoubles.reset();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
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
  });
});
