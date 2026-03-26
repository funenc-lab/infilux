import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (...args: unknown[]) => unknown;

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
  });
}

const windowTestDoubles = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const removeHandler = vi.fn();
  const resolveRepositoryRuntimeContext = vi.fn();

  const window = {
    isDestroyed: vi.fn(() => false),
    minimize: vi.fn(),
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(),
    restore: vi.fn(),
    close: vi.fn(),
    isFullScreen: vi.fn(() => false),
    setWindowButtonVisibility: vi.fn(),
    webContents: {
      openDevTools: vi.fn(),
    },
  };

  const fromWebContents = vi.fn<
    (sender: unknown) => {
      isDestroyed: ReturnType<typeof vi.fn>;
      minimize: ReturnType<typeof vi.fn>;
      isMaximized: ReturnType<typeof vi.fn>;
      maximize: ReturnType<typeof vi.fn>;
      restore: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      isFullScreen: ReturnType<typeof vi.fn>;
      setWindowButtonVisibility: ReturnType<typeof vi.fn>;
      webContents: {
        openDevTools: ReturnType<typeof vi.fn>;
      };
    } | null
  >(() => window);

  function reset() {
    handlers.clear();
    removeHandler.mockReset();
    resolveRepositoryRuntimeContext.mockReset();
    resolveRepositoryRuntimeContext.mockReturnValue({ kind: 'local' });
    fromWebContents.mockReset();
    fromWebContents.mockReturnValue(window);

    window.isDestroyed.mockReset();
    window.isDestroyed.mockReturnValue(false);
    window.minimize.mockReset();
    window.isMaximized.mockReset();
    window.isMaximized.mockReturnValue(false);
    window.maximize.mockReset();
    window.restore.mockReset();
    window.close.mockReset();
    window.isFullScreen.mockReset();
    window.isFullScreen.mockReturnValue(false);
    window.setWindowButtonVisibility.mockReset();
    window.webContents.openDevTools.mockReset();
  }

  return {
    handlers,
    removeHandler,
    resolveRepositoryRuntimeContext,
    window,
    fromWebContents,
    reset,
  };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: windowTestDoubles.fromWebContents,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      windowTestDoubles.handlers.set(channel, handler);
    }),
    removeHandler: windowTestDoubles.removeHandler,
  },
}));

vi.mock('../../services/repository/RepositoryContextResolver', () => ({
  resolveRepositoryRuntimeContext: windowTestDoubles.resolveRepositoryRuntimeContext,
}));

function getHandler(channel: string) {
  const handler = windowTestDoubles.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return handler;
}

describe('window IPC handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    windowTestDoubles.reset();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
  });

  it('registers window handlers, manipulates the current window and unregisters all handlers', async () => {
    const { registerWindowHandlers } = await import('../window');
    const dispose = registerWindowHandlers();
    const event = { sender: {} };

    await getHandler(IPC_CHANNELS.WINDOW_MINIMIZE)(event);
    expect(windowTestDoubles.window.minimize).toHaveBeenCalledTimes(1);

    await getHandler(IPC_CHANNELS.WINDOW_MAXIMIZE)(event);
    expect(windowTestDoubles.window.maximize).toHaveBeenCalledTimes(1);

    windowTestDoubles.window.isMaximized.mockReturnValueOnce(true);
    await getHandler(IPC_CHANNELS.WINDOW_MAXIMIZE)(event);
    expect(windowTestDoubles.window.restore).toHaveBeenCalledTimes(1);

    await getHandler(IPC_CHANNELS.WINDOW_CLOSE)(event);
    expect(windowTestDoubles.window.close).toHaveBeenCalledTimes(1);

    windowTestDoubles.window.isMaximized.mockReturnValueOnce(true);
    expect(await getHandler(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)(event)).toBe(true);

    await getHandler(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS)(event);
    expect(windowTestDoubles.window.webContents.openDevTools).toHaveBeenCalledTimes(1);

    await getHandler(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE)(event, 'yes');
    expect(windowTestDoubles.window.setWindowButtonVisibility).not.toHaveBeenCalled();

    setPlatform('darwin');
    await getHandler(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE)(event, true);
    expect(windowTestDoubles.window.setWindowButtonVisibility).toHaveBeenCalledWith(true);

    windowTestDoubles.window.isFullScreen.mockReturnValueOnce(true);
    expect(await getHandler(IPC_CHANNELS.WINDOW_IS_FULLSCREEN)(event)).toBe(true);

    windowTestDoubles.resolveRepositoryRuntimeContext.mockReturnValueOnce({
      kind: 'remote',
      connectionId: 'conn-1',
    });
    expect(
      await getHandler(IPC_CHANNELS.WINDOW_GET_REPOSITORY_RUNTIME_CONTEXT)({}, '/__remote__/repo')
    ).toEqual({
      kind: 'remote',
      connectionId: 'conn-1',
    });

    dispose();

    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_MINIMIZE);
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_MAXIMIZE);
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_CLOSE);
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_OPEN_DEVTOOLS);
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS_VISIBLE
    );
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.WINDOW_IS_FULLSCREEN);
    expect(windowTestDoubles.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.WINDOW_GET_REPOSITORY_RUNTIME_CONTEXT
    );
  });

  it('throws when no target window is available', async () => {
    windowTestDoubles.fromWebContents.mockReturnValueOnce(null);

    const { registerWindowHandlers } = await import('../window');
    registerWindowHandlers();

    expect(() => getHandler(IPC_CHANNELS.WINDOW_MINIMIZE)({ sender: {} })).toThrow(
      'Window is not available'
    );
  });
});
