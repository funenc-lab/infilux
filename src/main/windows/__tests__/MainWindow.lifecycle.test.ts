import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mainWindowLifecycleDoubles = vi.hoisted(() => {
  let browserWindowOptions: Record<string, unknown> | null = null;
  let lastWindow: MockBrowserWindow | null = null;
  let randomUuidCounter = 0;
  const ipcListeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const menuPopup = vi.fn();

  const existsSync = vi.fn<(path: string) => boolean>(() => false);
  const readFileSync = vi.fn(() => '{}');
  const writeFileSync = vi.fn();
  const randomUUID = vi.fn(() => `uuid-${++randomUuidCounter}`);
  const getPath = vi.fn((name: string) => `/mock/${name}`);
  const getAppPath = vi.fn(() => '/mock/app');
  const nativeThemeShouldUseDarkColors = vi.fn(() => true);
  const appFocus = vi.fn();
  const dockShow = vi.fn();
  const dockSetIcon = vi.fn();
  const showMessageBox = vi.fn();
  const shellOpenExternal = vi.fn();
  const ipcOn = vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    const listeners = ipcListeners.get(channel) ?? new Set<(...args: unknown[]) => void>();
    listeners.add(handler);
    ipcListeners.set(channel, listeners);
  });
  const ipcRemoveListener = vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    ipcListeners.get(channel)?.delete(handler);
  });
  const translate = vi.fn((locale: string, key: string) => `${locale}:${key}`);
  const getCurrentLocale = vi.fn(() => 'en');
  const detachWindowSessions = vi.fn(async () => undefined);
  const isQuittingForUpdate = vi.fn(() => false);
  const readSharedSettings = vi.fn(() => ({}));
  const buildFromTemplate = vi.fn(() => ({
    popup: menuPopup,
  }));
  const is = {
    dev: false,
  };
  const screen = {
    getAllDisplays: vi.fn(() => [
      {
        workArea: { x: 0, y: 33, width: 1512, height: 949 },
      },
    ]),
    getPrimaryDisplay: vi.fn(() => ({
      workArea: { x: 0, y: 33, width: 1512, height: 949 },
    })),
  };

  class MockBrowserWindow {
    public id = 101;
    public shown = false;
    public hidden = false;
    public closed = false;
    public maximized = false;
    public destroyed = false;
    public webContentsDestroyed = false;
    private bounds: { height: number; width: number; x: number; y: number };
    private readonly windowHandlers = new Map<
      string,
      Array<{ once: boolean; handler: (...args: unknown[]) => void }>
    >();
    private readonly webContentsHandlers = new Map<
      string,
      Array<{ once: boolean; handler: (...args: unknown[]) => void }>
    >();
    private windowOpenHandler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | null =
      null;

    public webContents = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        this.addHandler(this.webContentsHandlers, event, handler, false);
      }),
      once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        this.addHandler(this.webContentsHandlers, event, handler, true);
      }),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(
        (handler: (details: { url: string }) => { action: 'deny' | 'allow' }) => {
          this.windowOpenHandler = handler;
        }
      ),
      removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        this.removeHandler(this.webContentsHandlers, event, handler);
      }),
      isDestroyed: vi.fn(() => this.webContentsDestroyed),
      session: {
        clearCache: vi.fn(async () => undefined),
      },
    };

    constructor(options: Record<string, unknown>) {
      browserWindowOptions = options;
      this.bounds = {
        width: Number(options.width ?? 1400),
        height: Number(options.height ?? 900),
        x: Number(options.x ?? 10),
        y: Number(options.y ?? 20),
      };
      lastWindow = this;
    }

    private addHandler(
      store: Map<string, Array<{ once: boolean; handler: (...args: unknown[]) => void }>>,
      event: string,
      handler: (...args: unknown[]) => void,
      once: boolean
    ) {
      const handlers = store.get(event) ?? [];
      handlers.push({ once, handler });
      store.set(event, handlers);
    }

    private removeHandler(
      store: Map<string, Array<{ once: boolean; handler: (...args: unknown[]) => void }>>,
      event: string,
      handler: (...args: unknown[]) => void
    ) {
      const handlers = store.get(event) ?? [];
      store.set(
        event,
        handlers.filter((entry) => entry.handler !== handler)
      );
    }

    private emitFrom(
      store: Map<string, Array<{ once: boolean; handler: (...args: unknown[]) => void }>>,
      event: string,
      ...args: unknown[]
    ) {
      const handlers = [...(store.get(event) ?? [])];
      for (const entry of handlers) {
        entry.handler(...args);
        if (entry.once) {
          this.removeHandler(store, event, entry.handler);
        }
      }
    }

    getBounds() {
      return { ...this.bounds };
    }

    isMaximized() {
      return this.maximized;
    }

    maximize = vi.fn(() => {
      this.maximized = true;
    });

    once = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      this.addHandler(this.windowHandlers, event, handler, true);
    });

    on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      this.addHandler(this.windowHandlers, event, handler, false);
    });

    loadURL = vi.fn();
    loadFile = vi.fn();

    isDestroyed() {
      return this.destroyed;
    }

    close = vi.fn(() => {
      this.closed = true;
    });

    hide = vi.fn(() => {
      this.hidden = true;
    });

    show = vi.fn(() => {
      this.shown = true;
    });

    focus = vi.fn();

    setBounds = vi.fn(
      (bounds: Partial<{ height: number; width: number; x: number; y: number }>) => {
        this.bounds = {
          ...this.bounds,
          ...bounds,
        };
      }
    );

    removeListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      this.removeHandler(this.windowHandlers, event, handler);
    });

    setWindowButtonPosition = vi.fn();

    emit(event: string, ...args: unknown[]) {
      this.emitFrom(this.windowHandlers, event, ...args);
    }

    emitWebContents(event: string, ...args: unknown[]) {
      this.emitFrom(this.webContentsHandlers, event, ...args);
    }

    invokeWindowOpenHandler(url: string) {
      return this.windowOpenHandler?.({ url });
    }
  }

  function emitIpc(channel: string, event: unknown, ...args: unknown[]) {
    for (const listener of ipcListeners.get(channel) ?? []) {
      listener(event, ...args);
    }
  }

  function reset() {
    browserWindowOptions = null;
    lastWindow = null;
    randomUuidCounter = 0;
    ipcListeners.clear();
    existsSync.mockReset();
    readFileSync.mockReset();
    writeFileSync.mockReset();
    randomUUID.mockReset();
    getPath.mockReset();
    getAppPath.mockReset();
    nativeThemeShouldUseDarkColors.mockReset();
    appFocus.mockReset();
    dockShow.mockReset();
    dockSetIcon.mockReset();
    showMessageBox.mockReset();
    shellOpenExternal.mockReset();
    ipcOn.mockClear();
    ipcRemoveListener.mockClear();
    translate.mockReset();
    getCurrentLocale.mockReset();
    detachWindowSessions.mockReset();
    isQuittingForUpdate.mockReset();
    readSharedSettings.mockReset();
    buildFromTemplate.mockClear();
    menuPopup.mockClear();
    is.dev = false;

    existsSync.mockReturnValue(false);
    readFileSync.mockReturnValue('{}');
    randomUUID.mockImplementation(() => `uuid-${++randomUuidCounter}`);
    getPath.mockImplementation((name: string) => `/mock/${name}`);
    getAppPath.mockReturnValue('/mock/app');
    nativeThemeShouldUseDarkColors.mockReturnValue(true);
    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('en');
    detachWindowSessions.mockResolvedValue(undefined);
    isQuittingForUpdate.mockReturnValue(false);
    readSharedSettings.mockReturnValue({});
  }

  return {
    MockBrowserWindow,
    BrowserWindow: MockBrowserWindow,
    Menu: {
      buildFromTemplate,
    },
    app: {
      dock: {
        setIcon: dockSetIcon,
        show: dockShow,
      },
      focus: appFocus,
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
    existsSync,
    readFileSync,
    writeFileSync,
    randomUUID,
    translate,
    getCurrentLocale,
    detachWindowSessions,
    isQuittingForUpdate,
    readSharedSettings,
    is,
    screen,
    appFocus,
    dockShow,
    dockSetIcon,
    buildFromTemplate,
    menuPopup,
    emitIpc,
    getBrowserWindowOptions: () => browserWindowOptions,
    getLastWindow: () => lastWindow,
    reset,
  };
});

vi.mock('node:crypto', () => ({
  randomUUID: mainWindowLifecycleDoubles.randomUUID,
}));

vi.mock('node:fs', () => ({
  existsSync: mainWindowLifecycleDoubles.existsSync,
  readFileSync: mainWindowLifecycleDoubles.readFileSync,
  writeFileSync: mainWindowLifecycleDoubles.writeFileSync,
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: mainWindowLifecycleDoubles.is,
}));

vi.mock('@shared/i18n', async () => {
  const actual = await vi.importActual<typeof import('@shared/i18n')>('@shared/i18n');
  return {
    ...actual,
    translate: mainWindowLifecycleDoubles.translate,
  };
});

vi.mock('electron', () => ({
  app: mainWindowLifecycleDoubles.app,
  BrowserWindow: mainWindowLifecycleDoubles.BrowserWindow,
  dialog: mainWindowLifecycleDoubles.dialog,
  ipcMain: mainWindowLifecycleDoubles.ipcMain,
  Menu: mainWindowLifecycleDoubles.Menu,
  nativeTheme: mainWindowLifecycleDoubles.nativeTheme,
  screen: mainWindowLifecycleDoubles.screen,
  shell: mainWindowLifecycleDoubles.shell,
}));

vi.mock('../../services/i18n', () => ({
  getCurrentLocale: mainWindowLifecycleDoubles.getCurrentLocale,
}));

vi.mock('../../services/session/SessionManager', () => ({
  sessionManager: {
    detachWindowSessions: mainWindowLifecycleDoubles.detachWindowSessions,
  },
}));

vi.mock('../../services/updater/AutoUpdater', () => ({
  autoUpdaterService: {
    isQuittingForUpdate: mainWindowLifecycleDoubles.isQuittingForUpdate,
  },
}));

vi.mock('../../services/SharedSessionState', () => ({
  readSharedSettings: mainWindowLifecycleDoubles.readSharedSettings,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalRendererUrl = process.env.ELECTRON_RENDERER_URL;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MainWindow lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    mainWindowLifecycleDoubles.reset();
    delete process.env.ELECTRON_RENDERER_URL;
  }, 15000);

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalRendererUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalRendererUrl;
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  }, 15000);

  it('restores persisted macOS state and wires menu, devtools, fullscreen, and external links', async () => {
    setPlatform('darwin');
    mainWindowLifecycleDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowLifecycleDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        width: 1200,
        height: 800,
        x: 33,
        y: 44,
        isMaximized: true,
      })
    );

    const { createMainWindow } = await import('../MainWindow');
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    expect(mainWindowLifecycleDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 1200,
      height: 800,
      x: 33,
      y: 44,
      titleBarStyle: 'hiddenInset',
      frame: true,
      trafficLightPosition: { x: 16, y: 16 },
    });
    expect(win.maximize).toHaveBeenCalledTimes(1);
    expect(win.loadFile).toHaveBeenCalledWith(expect.stringContaining('/renderer/index.html'));

    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(mainWindowLifecycleDoubles.appFocus).toHaveBeenCalledWith({ steal: true });
    expect(mainWindowLifecycleDoubles.dockShow).toHaveBeenCalledTimes(1);

    const editableEvent = { preventDefault: vi.fn() };
    win.emitWebContents('context-menu', editableEvent, {
      isEditable: true,
      editFlags: {
        canCut: true,
        canCopy: false,
        canPaste: true,
        canSelectAll: true,
      },
      x: 11,
      y: 22,
    });
    expect(editableEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(mainWindowLifecycleDoubles.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(mainWindowLifecycleDoubles.menuPopup).toHaveBeenCalledWith({
      window: win,
      x: 11,
      y: 22,
    });

    win.emitWebContents('context-menu', { preventDefault: vi.fn() }, { isEditable: false });
    expect(mainWindowLifecycleDoubles.buildFromTemplate).toHaveBeenCalledTimes(1);

    win.emitWebContents('devtools-opened');
    win.emitWebContents('devtools-closed');
    win.emit('maximize');
    win.emit('unmaximize');
    win.emit('enter-full-screen');
    win.emit('leave-full-screen');

    expect(win.setWindowButtonPosition).toHaveBeenNthCalledWith(1, { x: 240, y: 16 });
    expect(win.setWindowButtonPosition).toHaveBeenNthCalledWith(2, { x: 16, y: 16 });
    expect(win.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED,
      true
    );
    expect(win.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED,
      false
    );
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true);
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false);
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, true);
    expect(win.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED,
      false
    );

    expect(win.invokeWindowOpenHandler('https://example.com')).toEqual({ action: 'deny' });
    expect(mainWindowLifecycleDoubles.shell.openExternal).toHaveBeenCalledWith(
      'https://example.com'
    );
    expect(win.invokeWindowOpenHandler('file:///tmp/demo')).toEqual({ action: 'deny' });
    expect(mainWindowLifecycleDoubles.shell.openExternal).toHaveBeenCalledTimes(1);

    win.emit('closed');
    expect(mainWindowLifecycleDoubles.detachWindowSessions).toHaveBeenCalledWith(win.id);
  }, 15000);

  it('confirms replacement closes through renderer IPC, saves dirty files, and persists state on force close', async () => {
    setPlatform('win32');
    mainWindowLifecycleDoubles.dialog.showMessageBox.mockResolvedValue({ response: 0 });

    const { confirmWindowReplace, createMainWindow, forceReplaceClose } = await import(
      '../MainWindow'
    );
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    const confirmPromise = confirmWindowReplace(win as never);
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.APP_CLOSE_REQUEST, {
      requestId: 'uuid-1',
      reason: 'replace-window',
    });

    mainWindowLifecycleDoubles.emitIpc(
      IPC_CHANNELS.APP_CLOSE_RESPONSE,
      { sender: win.webContents },
      'uuid-1',
      { confirmed: true, dirtyPaths: ['/tmp/example.ts'] }
    );
    await flushPromises();

    expect(mainWindowLifecycleDoubles.dialog.showMessageBox).toHaveBeenCalledWith(
      win,
      expect.objectContaining({
        type: 'warning',
      })
    );
    expect(win.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST,
      'uuid-1:/tmp/example.ts',
      '/tmp/example.ts'
    );

    mainWindowLifecycleDoubles.emitIpc(
      IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE,
      { sender: win.webContents },
      'uuid-1:/tmp/example.ts',
      { ok: true }
    );

    await expect(confirmPromise).resolves.toBe(true);

    forceReplaceClose(win as never);
    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);

    const closeEvent = { preventDefault: vi.fn() };
    win.emit('close', closeEvent);
    expect(closeEvent.preventDefault).not.toHaveBeenCalled();
    expect(mainWindowLifecycleDoubles.writeFileSync).toHaveBeenCalledTimes(1);
    expect(mainWindowLifecycleDoubles.writeFileSync).toHaveBeenCalledWith(
      '/mock/userData/window-state.json',
      JSON.stringify({
        width: 1400,
        height: 900,
        x: 56,
        y: 58,
        isMaximized: false,
      })
    );
  });

  it('uses replacement bounds, supports dev renderer URLs, and closes replaced windows after ready-to-show', async () => {
    setPlatform('linux');
    mainWindowLifecycleDoubles.is.dev = true;
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';

    const replaceWindow = {
      isDestroyed: vi.fn(() => false),
      getBounds: vi.fn(() => ({ width: 900, height: 700, x: 7, y: 8 })),
      isMaximized: vi.fn(() => true),
      close: vi.fn(),
    };

    const { confirmWindowReplace, createMainWindow } = await import('../MainWindow');
    const win = createMainWindow({
      replaceWindow: replaceWindow as never,
    }) as unknown as InstanceType<typeof mainWindowLifecycleDoubles.MockBrowserWindow>;

    await flushPromises();

    expect(mainWindowLifecycleDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 900,
      height: 700,
      x: 7,
      y: 33,
      frame: false,
      titleBarStyle: 'hidden',
    });
    expect(win.maximize).toHaveBeenCalledTimes(1);
    expect(win.webContents.session.clearCache).toHaveBeenCalledTimes(1);
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173', {
      extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n',
    });
    await expect(confirmWindowReplace(replaceWindow as never)).resolves.toBe(true);

    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(replaceWindow.close).toHaveBeenCalledTimes(1);
  });

  it('normalizes invalid persisted bounds to the current display before creating the window', async () => {
    setPlatform('darwin');
    mainWindowLifecycleDoubles.existsSync.mockImplementation(
      (target: string) => target === '/mock/userData/window-state.json'
    );
    mainWindowLifecycleDoubles.readFileSync.mockReturnValue(
      JSON.stringify({
        width: 200,
        height: 163,
        x: -271,
        y: 505,
        isMaximized: false,
      })
    );

    const { createMainWindow } = await import('../MainWindow');
    createMainWindow();

    expect(mainWindowLifecycleDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 685,
      height: 600,
      x: 0,
      y: 382,
    });
  });

  it('reveals the window when did-finish-load fires before ready-to-show', async () => {
    setPlatform('darwin');

    const { createMainWindow } = await import('../MainWindow');
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    win.emitWebContents('did-finish-load');
    expect(win.show).toHaveBeenCalledTimes(1);

    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it('passes bootstrap theme query data to the static renderer file when persisted settings request light mode', async () => {
    setPlatform('darwin');
    mainWindowLifecycleDoubles.readSharedSettings.mockReturnValue({
      'enso-settings': {
        state: {
          theme: 'light',
          terminalTheme: 'Dracula',
        },
      },
    });

    const { createMainWindow } = await import('../MainWindow');
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    expect(mainWindowLifecycleDoubles.getBrowserWindowOptions()).toMatchObject({
      backgroundColor: '#f5f7fb',
    });
    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringContaining('/renderer/index.html'),
      expect.objectContaining({
        query: {
          infiluxBootstrapTheme: expect.any(String),
        },
      })
    );
  });

  it('re-centers an offscreen window during reveal before showing it', async () => {
    setPlatform('darwin');

    const { createMainWindow } = await import('../MainWindow');
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    win.setBounds({
      width: 200,
      height: 163,
      x: -271,
      y: 505,
    });
    win.setBounds.mockClear();

    win.emit('ready-to-show');

    expect(win.setBounds).toHaveBeenCalledWith({
      width: 685,
      height: 600,
      x: 0,
      y: 382,
    });
    expect(win.show).toHaveBeenCalledTimes(1);
  });

  it('reveals the window after a timeout if renderer readiness events never fire', async () => {
    vi.useFakeTimers();
    setPlatform('darwin');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { createMainWindow } = await import('../MainWindow');
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    expect(win.show).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[window] reveal fallback timer fired', {
      windowId: win.id,
      timeoutMs: 3000,
    });
    expect(errorSpy).not.toHaveBeenCalledWith('[window] reveal fallback timer fired', {
      windowId: win.id,
      timeoutMs: 3000,
    });
  });

  it('blocks close when renderer cancels or save fails, and skips confirmation during updater quit', async () => {
    setPlatform('win32');

    const { createMainWindow } = await import('../MainWindow');
    const win = createMainWindow() as unknown as InstanceType<
      typeof mainWindowLifecycleDoubles.MockBrowserWindow
    >;

    const deniedCloseEvent = { preventDefault: vi.fn() };
    win.emit('close', deniedCloseEvent);
    expect(deniedCloseEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.APP_CLOSE_REQUEST, {
      requestId: 'uuid-1',
      reason: 'quit-app',
    });

    mainWindowLifecycleDoubles.emitIpc(
      IPC_CHANNELS.APP_CLOSE_RESPONSE,
      { sender: win.webContents },
      'uuid-1',
      { confirmed: false, dirtyPaths: [] }
    );
    await flushPromises();
    expect(win.hide).not.toHaveBeenCalled();
    expect(win.close).not.toHaveBeenCalled();

    mainWindowLifecycleDoubles.dialog.showMessageBox.mockResolvedValueOnce({ response: 0 });

    const failedSaveCloseEvent = { preventDefault: vi.fn() };
    win.emit('close', failedSaveCloseEvent);
    expect(failedSaveCloseEvent.preventDefault).toHaveBeenCalledTimes(1);

    mainWindowLifecycleDoubles.emitIpc(
      IPC_CHANNELS.APP_CLOSE_RESPONSE,
      { sender: win.webContents },
      'uuid-2',
      { confirmed: true, dirtyPaths: ['/tmp/failure.ts'] }
    );
    await flushPromises();

    mainWindowLifecycleDoubles.emitIpc(
      IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE,
      { sender: win.webContents },
      'uuid-2:/tmp/failure.ts',
      { ok: false, error: 'disk full' }
    );
    await flushPromises();

    expect(mainWindowLifecycleDoubles.dialog.showMessageBox).toHaveBeenLastCalledWith(
      win,
      expect.objectContaining({
        type: 'error',
        message: 'en:Save failed',
        detail: 'disk full',
      })
    );
    expect(win.hide).not.toHaveBeenCalled();

    mainWindowLifecycleDoubles.isQuittingForUpdate.mockReturnValue(true);
    const updaterCloseEvent = { preventDefault: vi.fn() };
    win.emit('close', updaterCloseEvent);
    expect(updaterCloseEvent.preventDefault).not.toHaveBeenCalled();
    expect(mainWindowLifecycleDoubles.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
