import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { is } from '@electron-toolkit/utils';
import { translate } from '@shared/i18n';
import type { AppCloseRequestPayload, AppCloseRequestReason } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import {
  BOOTSTRAP_THEME_SEARCH_PARAM,
  type BootstrapThemeSnapshot,
  encodeBootstrapThemeArgument,
  encodeBootstrapThemeSearchValue,
  extractBootstrapThemeSnapshotFromSettingsData,
  resolveStaticBootstrapThemeMode,
} from '@shared/utils/bootstrapTheme';
import { encodeRuntimeChannelArgument } from '@shared/utils/runtimeIdentity';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, screen, shell } from 'electron';
import { getCurrentLocale } from '../services/i18n';
import { readSharedSettings } from '../services/SharedSessionState';
import { sessionManager } from '../services/session/SessionManager';
import { autoUpdaterService } from '../services/updater/AutoUpdater';
import log from '../utils/logger';
import { getAppRuntimeChannel } from '../utils/runtimeIdentity';

/** Default macOS traffic lights position (matches BrowserWindow trafficLightPosition) */
const TRAFFIC_LIGHTS_DEFAULT_POSITION = { x: 16, y: 16 };

/**
 * Offset when DevTools is docked left — keeps buttons visible to the right of the panel.
 *
 * Assumes left-docked DevTools with a default width of ~240px. Electron does not
 * expose an API to query DevTools dock direction or panel width, so this is a
 * best-effort heuristic. If the user resizes or re-docks DevTools, the position
 * may not be perfectly aligned.
 */
const TRAFFIC_LIGHTS_DEVTOOLS_POSITION = { x: 240, y: 16 };
const MAIN_BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));
const DARK_BOOTSTRAP_WINDOW_BACKGROUND_COLOR = '#0f1216';
const LIGHT_BOOTSTRAP_WINDOW_BACKGROUND_COLOR = '#f5f7fb';

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

interface WindowBounds {
  width: number;
  height: number;
  x: number;
  y: number;
}

const DEFAULT_STATE: WindowState = {
  width: 1400,
  height: 900,
};
const SHOW_WINDOW_FALLBACK_DELAY_MS = 3000;
const MIN_WINDOW_WIDTH = 685;
const MIN_WINDOW_HEIGHT = 600;

function getStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): WindowState {
  try {
    const statePath = getStatePath();
    if (existsSync(statePath)) {
      const data = readFileSync(statePath, 'utf-8');
      return { ...DEFAULT_STATE, ...JSON.parse(data) };
    }
  } catch {}
  return DEFAULT_STATE;
}

function saveWindowState(win: BrowserWindow): void {
  try {
    const bounds = win.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized(),
    };
    writeFileSync(getStatePath(), JSON.stringify(state));
  } catch {}
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rectsIntersect(a: WindowBounds, b: WindowBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function roundBounds(bounds: WindowBounds): WindowBounds {
  return {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
  };
}

function normalizeWindowBounds(state: WindowState): WindowBounds {
  const desiredBounds: WindowBounds = {
    width: state.width,
    height: state.height,
    x: state.x ?? 0,
    y: state.y ?? 0,
  };
  const displays = screen.getAllDisplays();
  const fallbackDisplay = screen.getPrimaryDisplay();
  const matchingDisplay =
    displays.find((display) => rectsIntersect(display.workArea as WindowBounds, desiredBounds)) ??
    fallbackDisplay;
  const workArea = matchingDisplay.workArea as WindowBounds;
  const width = Math.min(Math.max(state.width, MIN_WINDOW_WIDTH), workArea.width);
  const height = Math.min(Math.max(state.height, MIN_WINDOW_HEIGHT), workArea.height);
  const hasPersistedPosition = Number.isFinite(state.x) && Number.isFinite(state.y);

  if (!hasPersistedPosition || !rectsIntersect(workArea, { ...desiredBounds, width, height })) {
    return roundBounds({
      width,
      height,
      x: workArea.x + (workArea.width - width) / 2,
      y: workArea.y + (workArea.height - height) / 2,
    });
  }

  return roundBounds({
    width,
    height,
    x: clamp(state.x ?? workArea.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(state.y ?? workArea.y, workArea.y, workArea.y + workArea.height - height),
  });
}

function ensureWindowVisibleOnScreen(win: BrowserWindow, trigger: string): void {
  if (win.isDestroyed()) {
    return;
  }

  const currentBounds = win.getBounds();
  const normalizedBounds = normalizeWindowBounds(currentBounds);
  const boundsChanged =
    currentBounds.width !== normalizedBounds.width ||
    currentBounds.height !== normalizedBounds.height ||
    currentBounds.x !== normalizedBounds.x ||
    currentBounds.y !== normalizedBounds.y;

  if (!boundsChanged) {
    return;
  }

  console.error('[window] Adjusting window bounds to visible display', {
    windowId: win.id,
    trigger,
    before: currentBounds,
    after: normalizedBounds,
  });
  win.setBounds(normalizedBounds);
}

function resolveWindowIconPath(): string | undefined {
  if (process.platform === 'darwin') {
    return undefined;
  }

  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'icon.png'), join(process.resourcesPath, 'build', 'icon.png')]
    : [join(process.cwd(), 'build', 'icon.png'), join(app.getAppPath(), 'build', 'icon.png')];

  return candidates.find((candidate) => existsSync(candidate));
}

function resolveBootstrapThemeSnapshot(): BootstrapThemeSnapshot | null {
  return extractBootstrapThemeSnapshotFromSettingsData(
    readSharedSettings(),
    nativeTheme.shouldUseDarkColors
  );
}

function resolveBootstrapThemeArgument(
  bootstrapThemeSnapshot: BootstrapThemeSnapshot | null
): string[] | undefined {
  if (!bootstrapThemeSnapshot) {
    return undefined;
  }

  return [encodeBootstrapThemeArgument(bootstrapThemeSnapshot)];
}

function resolveRendererAdditionalArguments(
  bootstrapThemeSnapshot: BootstrapThemeSnapshot | null
): string[] {
  const runtimeChannelArgument = encodeRuntimeChannelArgument(getAppRuntimeChannel());
  const bootstrapThemeArguments = resolveBootstrapThemeArgument(bootstrapThemeSnapshot) ?? [];

  return [runtimeChannelArgument, ...bootstrapThemeArguments];
}

function resolveBootstrapWindowBackgroundColor(
  bootstrapThemeSnapshot: BootstrapThemeSnapshot | null
): string {
  const mode = resolveStaticBootstrapThemeMode(bootstrapThemeSnapshot);
  return mode === 'light'
    ? LIGHT_BOOTSTRAP_WINDOW_BACKGROUND_COLOR
    : DARK_BOOTSTRAP_WINDOW_BACKGROUND_COLOR;
}

function appendBootstrapThemeToRendererUrl(
  input: string,
  bootstrapThemeSnapshot: BootstrapThemeSnapshot | null
): string {
  if (!bootstrapThemeSnapshot) {
    return input;
  }

  const nextUrl = new URL(input);
  nextUrl.searchParams.set(
    BOOTSTRAP_THEME_SEARCH_PARAM,
    encodeBootstrapThemeSearchValue(bootstrapThemeSnapshot)
  );
  return nextUrl.toString();
}

interface CreateMainWindowOptions {
  initializeWindow?: (window: BrowserWindow) => Promise<void> | void;
  partition?: string;
  replaceWindow?: BrowserWindow | null;
}

async function loadDevRendererUrl(
  win: BrowserWindow,
  url: string,
  bootstrapThemeSnapshot: BootstrapThemeSnapshot | null
): Promise<void> {
  try {
    await win.webContents.session.clearCache();
  } catch (error) {
    log.warn('[window] Failed to clear dev renderer cache before loading URL', {
      windowId: win.id,
      url,
      error,
    });
  }

  await win.loadURL(appendBootstrapThemeToRendererUrl(url, bootstrapThemeSnapshot), {
    extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n',
  });
}

interface WindowReplacementController {
  confirmWindowReplace: () => Promise<boolean>;
  forceReplaceClose: () => void;
}

const windowReplacementControllers = new WeakMap<BrowserWindow, WindowReplacementController>();

function t(key: string, params?: Record<string, string | number>): string {
  return translate(getCurrentLocale(), key, params);
}

export async function confirmWindowReplace(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) {
    return false;
  }
  return (await windowReplacementControllers.get(win)?.confirmWindowReplace()) ?? true;
}

export function forceReplaceClose(win: BrowserWindow): void {
  if (win.isDestroyed()) {
    return;
  }
  const controller = windowReplacementControllers.get(win);
  if (controller) {
    controller.forceReplaceClose();
    return;
  }
  win.close();
}

export function createMainWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
  const replacementState = options.replaceWindow
    ? options.replaceWindow.isDestroyed()
      ? null
      : {
          ...options.replaceWindow.getBounds(),
          isMaximized: options.replaceWindow.isMaximized(),
        }
    : null;
  const state = replacementState ?? loadWindowState();
  const initialBounds = normalizeWindowBounds(state);

  const isMac = process.platform === 'darwin';
  const isWindows = process.platform === 'win32';
  const windowIconPath = resolveWindowIconPath();
  const bootstrapThemeSnapshot = resolveBootstrapThemeSnapshot();
  const rendererAdditionalArguments = resolveRendererAdditionalArguments(bootstrapThemeSnapshot);

  const win = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 685,
    minHeight: 600,
    // macOS: hiddenInset 保留 traffic lights 按钮
    // Windows/Linux: hidden 隐藏标题栏，使用自定义 WindowTitleBar
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // macOS 需要 frame 来显示 traffic lights；Windows/Linux 使用无边框窗口
    frame: isMac,
    ...(isMac && { trafficLightPosition: TRAFFIC_LIGHTS_DEFAULT_POSITION }),
    // Windows 启用 thickFrame 以支持窗口边缘拖拽调整大小
    ...(isWindows && { thickFrame: true }),
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    backgroundColor: resolveBootstrapWindowBackgroundColor(bootstrapThemeSnapshot),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: options.partition,
      additionalArguments: rendererAdditionalArguments,
      preload: join(MAIN_BUNDLE_DIR, '../preload/index.cjs'),
    },
  });

  const initialBoundsAdjusted =
    initialBounds.width !== state.width ||
    initialBounds.height !== state.height ||
    initialBounds.x !== (state.x ?? initialBounds.x) ||
    initialBounds.y !== (state.y ?? initialBounds.y);
  if (initialBoundsAdjusted) {
    console.error('[window] Normalized initial bounds to visible display', {
      windowId: win.id,
      requestedBounds: state,
      normalizedBounds: initialBounds,
      isDev: is.dev,
      isPackaged: app.isPackaged,
      replaceWindow: Boolean(options.replaceWindow),
    });
  }

  void options.initializeWindow?.(win);

  // Enable native context menu for editable fields (input/textarea/contenteditable)
  // so EnhancedInput and other text fields support Cut/Copy/Paste/SelectAll.
  win.webContents.on('context-menu', (event, params) => {
    if (!params.isEditable) return;
    event.preventDefault();

    const template: Electron.MenuItemConstructorOptions[] = [
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ];

    Menu.buildFromTemplate(template).popup({
      window: win,
      x: params.x,
      y: params.y,
    });
  });

  // Restore maximized state
  if (state.isMaximized) {
    win.maximize();
  }

  let didRevealWindow = false;
  let revealWindowFallbackTimer: NodeJS.Timeout | null = null;

  const clearRevealWindowFallbacks = () => {
    if (revealWindowFallbackTimer) {
      clearTimeout(revealWindowFallbackTimer);
      revealWindowFallbackTimer = null;
    }
  };

  const revealWindow = () => {
    if (didRevealWindow || win.isDestroyed()) {
      return;
    }

    didRevealWindow = true;
    clearRevealWindowFallbacks();
    ensureWindowVisibleOnScreen(win, 'reveal');
    win.show();
    win.focus();

    if (process.platform === 'darwin') {
      void app.dock?.show();
      app.focus({ steal: true });
    }

    if (options.replaceWindow) {
      forceReplaceClose(options.replaceWindow);
    }
  };

  win.once('show', () => {
    ensureWindowVisibleOnScreen(win, 'show');
  });
  win.once('move', () => {
    ensureWindowVisibleOnScreen(win, 'move');
  });
  win.once('resize', () => {
    ensureWindowVisibleOnScreen(win, 'resize');
  });
  win.once('ready-to-show', () => {
    revealWindow();
  });
  win.webContents.once('did-finish-load', () => {
    revealWindow();
  });
  revealWindowFallbackTimer = setTimeout(() => {
    console.warn('[window] reveal fallback timer fired', {
      windowId: win.id,
      timeoutMs: SHOW_WINDOW_FALLBACK_DELAY_MS,
    });
    revealWindow();
  }, SHOW_WINDOW_FALLBACK_DELAY_MS);
  win.once('closed', clearRevealWindowFallbacks);

  // DevTools state management for traffic lights adjustment.
  // When DevTools is docked on the left, move traffic lights to the right
  // so they are not obscured by the DevTools panel.
  if (isMac) {
    win.webContents.on('devtools-opened', () => {
      win.setWindowButtonPosition(TRAFFIC_LIGHTS_DEVTOOLS_POSITION);
      win.webContents.send(IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED, true);
    });

    win.webContents.on('devtools-closed', () => {
      win.setWindowButtonPosition(TRAFFIC_LIGHTS_DEFAULT_POSITION);
      win.webContents.send(IPC_CHANNELS.WINDOW_DEVTOOLS_STATE_CHANGED, false);
    });
  }

  win.on('maximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true);
    }
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false);
    }
  });

  win.on('enter-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, true);
    }
  });

  win.on('leave-full-screen', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.WINDOW_FULLSCREEN_CHANGED, false);
    }
  });

  // Confirm before close (skip in dev mode)
  let forceClose = false;
  let closeFlowInProgress = false;
  const CLOSE_RESPONSE_IPC_TIMEOUT_MS = 30000;
  const CLOSE_SAVE_IPC_TIMEOUT_MS = 30000;

  const waitForWindowIpc = <T>(
    channel: string,
    predicate: (event: Electron.IpcMainEvent, ...args: any[]) => T | null,
    timeoutMs: number
  ) =>
    new Promise<T | null>((resolve) => {
      const webContents = win.webContents;
      let settled = false;
      let handler: (event: Electron.IpcMainEvent, ...args: any[]) => void;
      let timeout: NodeJS.Timeout | null = null;

      const finalize = (value: T | null) => {
        if (settled) return;
        settled = true;

        if (timeout) {
          clearTimeout(timeout);
        }

        ipcMain.removeListener(channel, handler);
        if (!win.isDestroyed()) {
          win.removeListener('closed', handleWindowGone);
        }
        try {
          webContents.removeListener('destroyed', handleWindowGone);
        } catch {
          // webContents may already be destroyed while close flow is settling.
        }
        resolve(value);
      };

      const handleWindowGone = () => finalize(null);

      handler = (event: Electron.IpcMainEvent, ...args: any[]) => {
        const match = predicate(event, ...args);
        if (match === null) return;
        finalize(match);
      };

      timeout = setTimeout(() => finalize(null), timeoutMs);

      ipcMain.on(channel, handler);
      win.once('closed', handleWindowGone);
      webContents.once('destroyed', handleWindowGone);
    });

  const forceReplaceCloseCurrentWindow = () => {
    if (win.isDestroyed()) {
      return;
    }
    forceClose = true;
    win.hide();
    win.close();
  };

  const confirmCloseWithReason = async (reason: AppCloseRequestReason): Promise<boolean> => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      return false;
    }

    if (forceClose || autoUpdaterService.isQuittingForUpdate()) {
      return true;
    }

    if (closeFlowInProgress) {
      return false;
    }

    closeFlowInProgress = true;
    try {
      const requestId = randomUUID();
      const payload: AppCloseRequestPayload = { requestId, reason };
      win.webContents.send(IPC_CHANNELS.APP_CLOSE_REQUEST, payload);

      const response = await waitForWindowIpc<{ confirmed: boolean; dirtyPaths: string[] }>(
        IPC_CHANNELS.APP_CLOSE_RESPONSE,
        (
          event,
          respRequestId: string,
          responsePayload: { confirmed: boolean; dirtyPaths: string[] }
        ) => {
          if (event.sender !== win.webContents) return null;
          if (respRequestId !== requestId) return null;
          return responsePayload;
        },
        CLOSE_RESPONSE_IPC_TIMEOUT_MS
      );

      if (!response?.confirmed) {
        return false;
      }

      const dirtyPaths = response.dirtyPaths ?? [];
      for (const filePath of dirtyPaths) {
        const fileName = filePath.split(/[/\\\\]/).pop() || filePath;
        const { response: buttonIndex } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: [t('Save'), t("Don't Save"), t('Cancel')],
          defaultId: 0,
          cancelId: 2,
          message: t('Do you want to save the changes you made to {{file}}?', {
            file: fileName,
          }),
          detail: t("Your changes will be lost if you don't save them."),
        });

        if (buttonIndex === 2) {
          return false;
        }

        if (buttonIndex === 0) {
          const saveRequestId = `${requestId}:${filePath}`;
          win.webContents.send(IPC_CHANNELS.APP_CLOSE_SAVE_REQUEST, saveRequestId, filePath);

          const saveResult = await waitForWindowIpc<{ ok: boolean; error?: string }>(
            IPC_CHANNELS.APP_CLOSE_SAVE_RESPONSE,
            (
              event,
              respSaveRequestId: string,
              responsePayload: { ok: boolean; error?: string }
            ) => {
              if (event.sender !== win.webContents) return null;
              if (respSaveRequestId !== saveRequestId) return null;
              return responsePayload;
            },
            CLOSE_SAVE_IPC_TIMEOUT_MS
          );

          if (!saveResult?.ok) {
            await dialog.showMessageBox(win, {
              type: 'error',
              buttons: [t('Close')],
              defaultId: 0,
              message: t('Save failed'),
              detail: saveResult?.error || t('Unknown error'),
            });
            return false;
          }
        }
      }

      return true;
    } finally {
      closeFlowInProgress = false;
    }
  };

  windowReplacementControllers.set(win, {
    confirmWindowReplace: () => confirmCloseWithReason('replace-window'),
    forceReplaceClose: forceReplaceCloseCurrentWindow,
  });

  win.on('close', (e) => {
    // Skip confirmation if force close, or quitting for update
    if (forceClose || autoUpdaterService.isQuittingForUpdate()) {
      saveWindowState(win);
      return;
    }

    e.preventDefault();
    void confirmCloseWithReason('quit-app').then((confirmed) => {
      if (confirmed) {
        forceReplaceCloseCurrentWindow();
      }
    });
  });

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load renderer
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    log.info('[window] Loading renderer URL', {
      windowId: win.id,
      url: process.env.ELECTRON_RENDERER_URL,
    });
    void loadDevRendererUrl(win, process.env.ELECTRON_RENDERER_URL, bootstrapThemeSnapshot).catch(
      (error) => {
        log.error('[window] Failed to load renderer URL', {
          windowId: win.id,
          url: process.env.ELECTRON_RENDERER_URL,
          error,
        });
      }
    );
  } else {
    const rendererFilePath = join(MAIN_BUNDLE_DIR, '../renderer/index.html');
    log.info('[window] Loading renderer file', {
      windowId: win.id,
      path: rendererFilePath,
    });
    if (bootstrapThemeSnapshot) {
      win.loadFile(rendererFilePath, {
        query: {
          [BOOTSTRAP_THEME_SEARCH_PARAM]: encodeBootstrapThemeSearchValue(bootstrapThemeSnapshot),
        },
      });
    } else {
      win.loadFile(rendererFilePath);
    }
  }

  win.on('closed', () => {
    void sessionManager.detachWindowSessions(win.id);
  });

  return win;
}
