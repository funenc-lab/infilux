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
  const buildFromTemplate = vi.fn(() => ({
    popup: menuPopup,
  }));
  const is = {
    dev: false,
  };

  class MockBrowserWindow {
    public id = 101;
    public shown = false;
    public hidden = false;
    public closed = false;
    public maximized = false;
    public destroyed = false;
    public webContentsDestroyed = false;
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
    };

    constructor(options: Record<string, unknown>) {
      browserWindowOptions = options;
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
      return { height: 900, width: 1400, x: 10, y: 20 };
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
    showMessageBox.mockReset();
    shellOpenExternal.mockReset();
    ipcOn.mockClear();
    ipcRemoveListener.mockClear();
    translate.mockReset();
    getCurrentLocale.mockReset();
    detachWindowSessions.mockReset();
    isQuittingForUpdate.mockReset();
    buildFromTemplate.mockClear();
    menuPopup.mockClear();
    is.dev = false;

    existsSync.mockReturnValue(false);
    readFileSync.mockReturnValue('{}');
    randomUUID.mockImplementation(() => `uuid-${++randomUuidCounter}`);
    getPath.mockImplementation((name: string) => `/mock/${name}`);
    getAppPath.mockReturnValue('/mock/app');
    translate.mockImplementation((locale: string, key: string) => `${locale}:${key}`);
    getCurrentLocale.mockReturnValue('en');
    detachWindowSessions.mockResolvedValue(undefined);
    isQuittingForUpdate.mockReturnValue(false);
  }

  return {
    MockBrowserWindow,
    BrowserWindow: MockBrowserWindow,
    Menu: {
      buildFromTemplate,
    },
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
    existsSync,
    readFileSync,
    writeFileSync,
    randomUUID,
    translate,
    getCurrentLocale,
    detachWindowSessions,
    isQuittingForUpdate,
    is,
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
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
    if (originalRendererUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = originalRendererUrl;
    }
    vi.restoreAllMocks();
  });

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
  });

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
        x: 10,
        y: 20,
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

    expect(mainWindowLifecycleDoubles.getBrowserWindowOptions()).toMatchObject({
      width: 900,
      height: 700,
      x: 7,
      y: 8,
      frame: false,
      titleBarStyle: 'hidden',
    });
    expect(win.maximize).toHaveBeenCalledTimes(1);
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173');
    await expect(confirmWindowReplace(replaceWindow as never)).resolves.toBe(true);

    win.emit('ready-to-show');
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(replaceWindow.close).toHaveBeenCalledTimes(1);
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
