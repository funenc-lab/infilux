import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { inspect } from 'node:util';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import type { Locale } from '@shared/i18n';
import { TEMP_INPUT_DIRNAME } from '@shared/paths';
import { IPC_CHANNELS, type ProxySettings } from '@shared/types';
import { extractBootstrapLocaleFromSettingsData } from '@shared/utils/bootstrapLocale';
import type { BootstrapMainStage } from '@shared/utils/bootstrapMainStage';
import { customProtocolUriToPath, type SupportedFileUrlPlatform } from '@shared/utils/fileUrl';
import {
  type AppRuntimeChannel,
  parseRuntimeChannelFromArgv,
  resolveAppRuntimeChannel,
} from '@shared/utils/runtimeIdentity';
import { sanitizeRuntimeProfileName } from '@shared/utils/runtimeProfile';
import {
  createStartupTimelineRecorder,
  formatStartupTimelineEntry,
  type StartupTimelineEntry,
} from '@shared/utils/startupTimeline';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, net, protocol } from 'electron';
import { shellEnvSync } from 'shell-env';

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

// Fix environment for packaged app (macOS GUI apps don't inherit shell env)
if (process.platform === 'darwin') {
  try {
    Object.assign(process.env, shellEnvSync());
  } catch {
    // Ignore errors - will use default env
  }
}

import {
  autoStartHapi,
  cleanupAllResources,
  cleanupAllResourcesSync,
  registerIpcHandlers,
} from './ipc';
import { initClaudeProviderWatcher } from './ipc/claudeProvider';
import { cleanupTempFiles } from './ipc/files';
import { readSettings } from './ipc/settings';
import { registerWindowHandlers } from './ipc/window';
import { registerClaudeBridgeIpcHandlers } from './services/claude/ClaudeIdeBridge';
import { unwatchClaudeSettings } from './services/claude/ClaudeProviderManager';
import {
  isAllowedLocalFilePath,
  registerAllowedLocalFileRoot,
} from './services/files/LocalFileAccess';
import { checkGitInstalled } from './services/git/checkGit';
import { gitAutoFetchService } from './services/git/GitAutoFetchService';
import { setCurrentLocale } from './services/i18n';
import { buildAppMenu } from './services/MenuBuilder';
import {
  getSharedStatePaths,
  isLegacySettingsMigrated,
  isLegacyTodoMigrated,
  markLegacySettingsMigrated,
  markLegacyTodoMigrated,
  readSharedSessionState,
  readSharedSettings,
  writeSharedSessionState,
  writeSharedSettings,
} from './services/SharedSessionState';
import { persistentAgentSessionRepository } from './services/session/PersistentAgentSessionRepository';
import {
  findLegacySettingsImportSourcePath,
  readElectronLocalStorageSnapshotFromLevelDbDirs,
  readLegacyElectronLocalStorageSnapshot,
  readLegacyImportLocalStorageSnapshot,
} from './services/settings/legacyImport';
import { appTrayService } from './services/TrayService';
import * as todoService from './services/todo/TodoService';
import { webInspectorServer } from './services/webInspector';
import log, { initLogger } from './utils/logger';
import {
  buildRendererFailureContext,
  captureRendererDiagnostics,
  shouldAutoRecoverRenderer,
} from './utils/rendererRecovery';
import { openLocalWindow } from './windows/WindowManager';

let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;
let cleanupWindowHandlers: (() => void) | null = null;
let isQuittingCleanupRunning = false;
let isQuittingForAutoUpdateInstall = (): boolean => false;
let emergencyShutdownTriggered = false;

const isDev = !app.isPackaged;

// In dev mode, use an isolated userData dir before any Chromium-backed service initializes.
// This prevents dev sessions from inheriting the packaged profile and keeps sessionData writes scoped.
if (isDev) {
  const profile = sanitizeRuntimeProfileName(process.env.ENSOAI_PROFILE || '') || 'dev';
  const isolatedUserDataPath = join(app.getPath('appData'), `${app.getName()}-${profile}`);
  const isolatedSessionDataPath = join(isolatedUserDataPath, 'session-data');
  mkdirSync(isolatedUserDataPath, { recursive: true });
  mkdirSync(isolatedSessionDataPath, { recursive: true });
  app.setPath('userData', isolatedUserDataPath);
  app.setPath('sessionData', isolatedSessionDataPath);
}

function resolveStartupRuntimeChannel(): AppRuntimeChannel {
  const runtimeChannelFromArgv = parseRuntimeChannelFromArgv(process.argv);
  if (runtimeChannelFromArgv) {
    return runtimeChannelFromArgv;
  }

  return resolveAppRuntimeChannel({
    explicitChannel: app.isPackaged ? process.env.INFILUX_RUNTIME_CHANNEL : undefined,
    nodeEnv: process.env.NODE_ENV,
    vitest: process.env.VITEST,
    isPackaged: app.isPackaged,
  });
}

if (isDev && process.env.INFILUX_ENABLE_REMOTE_DEBUGGING === 'true') {
  // Enable CDP only for explicit local debugging sessions.
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}
process.env.INFILUX_RUNTIME_CHANNEL = resolveStartupRuntimeChannel();
const FORCE_EXIT_TIMEOUT_MS = 8000;
const MAX_RENDERER_RECOVERY_ATTEMPTS = 2;
const RENDERER_RECOVERY_WINDOW_MS = 30_000;
const mainStartupTimeline = createStartupTimelineRecorder('main');
const pendingMainStartupTimelineEntries: StartupTimelineEntry[] = [];
let canLogMainStartupTimeline = false;
let currentMainStartupStage: BootstrapMainStage = 'module-evaluated';

function isIgnorableConsoleWriteError(error: unknown): boolean {
  const nodeError = error as NodeJS.ErrnoException;
  const message =
    typeof nodeError?.message === 'string'
      ? nodeError.message
      : typeof error === 'string'
        ? error
        : '';
  return (
    nodeError?.code === 'EIO' ||
    nodeError?.code === 'ERR_STREAM_DESTROYED' ||
    message.includes('write EIO') ||
    message.includes('stream destroyed')
  );
}

function installConsoleStreamErrorGuards(): void {
  const handleConsoleStreamError = (error: Error) => {
    if (isIgnorableConsoleWriteError(error)) {
      return;
    }
    throw error;
  };

  const installGuard = (
    stream: NodeJS.WriteStream & {
      __infiluxConsoleErrorGuardInstalled?: boolean;
    }
  ) => {
    if (stream.__infiluxConsoleErrorGuardInstalled) {
      return;
    }
    stream.on('error', handleConsoleStreamError);
    stream.__infiluxConsoleErrorGuardInstalled = true;
  };

  installGuard(process.stdout);
  installGuard(process.stderr);
}

installConsoleStreamErrorGuards();

function writeUncaughtExceptionSnapshot(label: string, error: unknown): void {
  if (!isDev) {
    return;
  }

  try {
    const nodeError = error as NodeJS.ErrnoException;
    const payload = {
      label,
      timestamp: new Date().toISOString(),
      ignored: isIgnorableConsoleWriteError(error),
      type: typeof error,
      constructorName:
        error && typeof error === 'object' && 'constructor' in error
          ? ((error.constructor as { name?: string }).name ?? null)
          : null,
      code: typeof nodeError?.code === 'string' ? nodeError.code : null,
      errno: typeof nodeError?.errno === 'number' ? nodeError.errno : null,
      syscall: typeof nodeError?.syscall === 'string' ? nodeError.syscall : null,
      message: typeof nodeError?.message === 'string' ? nodeError.message : String(error),
      keys: error && typeof error === 'object' ? Object.keys(error) : [],
    };
    appendFileSync('/tmp/infilux-uncaught-debug.log', `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {}
}

function runDeferredStartupTask(taskName: string, task: () => Promise<void>): void {
  void task().catch((error) => {
    console.error(`[startup] ${taskName} failed:`, error);
  });
}

function recordMainStartupStage(stage: BootstrapMainStage): StartupTimelineEntry {
  currentMainStartupStage = stage;
  const entry = mainStartupTimeline.markStage(stage);
  if (!canLogMainStartupTimeline) {
    pendingMainStartupTimelineEntries.push(entry);
    return entry;
  }

  log.info(formatStartupTimelineEntry(entry));
  return entry;
}

function flushMainStartupTimeline(): void {
  if (canLogMainStartupTimeline) {
    return;
  }

  canLogMainStartupTimeline = true;
  for (const entry of pendingMainStartupTimelineEntries.splice(0)) {
    log.info(formatStartupTimelineEntry(entry));
  }
}

recordMainStartupStage('module-evaluated');

function isPrivateIpLiteral(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.endsWith('.localhost')
  ) {
    return true;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const parts = normalized.split('.').map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      return false;
    }
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }

  return false;
}

function isAllowedRemoteImageUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return !isPrivateIpLiteral(parsed.hostname);
  } catch {
    return false;
  }
}

function attachRendererRecoveryHandlers(window: BrowserWindow): () => void {
  const webContents = window.webContents;
  let recoveryAttemptCount = 0;
  let recoveryWindowStartedAt = 0;

  const attemptRendererRecovery = (trigger: string) => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }

    const now = Date.now();
    if (now - recoveryWindowStartedAt > RENDERER_RECOVERY_WINDOW_MS) {
      recoveryWindowStartedAt = now;
      recoveryAttemptCount = 0;
    }

    recoveryAttemptCount += 1;
    if (recoveryAttemptCount > MAX_RENDERER_RECOVERY_ATTEMPTS) {
      log.error('[renderer-recovery] Recovery budget exhausted', {
        trigger,
        windowId: window.id,
      });
      return;
    }

    setTimeout(() => {
      if (window.isDestroyed() || window.webContents.isDestroyed()) {
        return;
      }
      log.warn('[renderer-recovery] Reloading renderer window', {
        trigger,
        windowId: window.id,
        recoveryAttemptCount,
      });
      window.webContents.reload();
    }, 150);
  };

  const handleRenderProcessGone = (
    _: Electron.Event,
    details: Electron.RenderProcessGoneDetails
  ) => {
    const context = buildRendererFailureContext({
      diagnostics: captureRendererDiagnostics(
        window,
        mainWindow,
        BrowserWindow.getAllWindows().length
      ),
      reason: details.reason,
      exitCode: details.exitCode,
    });
    log.error('[renderer-recovery] Render process gone', context);

    if (shouldAutoRecoverRenderer(details.reason)) {
      attemptRendererRecovery(`render-process-gone:${details.reason}`);
    }
  };

  const handleUnresponsive = () => {
    log.error('[renderer-recovery] Window became unresponsive', {
      ...captureRendererDiagnostics(window, mainWindow, BrowserWindow.getAllWindows().length),
    });
    attemptRendererRecovery('unresponsive');
  };

  const handleDidFailLoad = (
    _: Electron.Event,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean
  ) => {
    if (!isMainFrame) {
      return;
    }

    log.error('[renderer-recovery] Main frame failed to load', {
      ...captureRendererDiagnostics(window, mainWindow, BrowserWindow.getAllWindows().length),
      errorCode,
      errorDescription,
      validatedURL,
    });

    if (errorCode !== -3) {
      attemptRendererRecovery(`did-fail-load:${errorCode}`);
    }
  };

  webContents.on('render-process-gone', handleRenderProcessGone);
  window.on('unresponsive', handleUnresponsive);
  webContents.on('did-fail-load', handleDidFailLoad);

  return () => {
    if (!window.isDestroyed()) {
      window.removeListener('unresponsive', handleUnresponsive);
    }
    if (!webContents.isDestroyed()) {
      webContents.removeListener('render-process-gone', handleRenderProcessGone);
      webContents.removeListener('did-fail-load', handleDidFailLoad);
    }
  };
}

function resolveAppIconPath(): string | null {
  const fileNames =
    process.platform === 'darwin'
      ? nativeTheme.shouldUseDarkColors
        ? ['icon-mac.png', 'icon-mac-light.png', 'icon.png']
        : ['icon-mac-light.png', 'icon-mac.png', 'icon.png']
      : ['icon.png'];
  const candidates = app.isPackaged
    ? fileNames.flatMap((fileName) => [
        join(process.resourcesPath, fileName),
        join(process.resourcesPath, 'build', fileName),
      ])
    : fileNames.map((fileName) => join(process.cwd(), 'build', fileName));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function syncDockIconWithAppearance(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const dockIconPath = resolveAppIconPath();
  if (dockIconPath) {
    app.dock?.setIcon(dockIconPath);
  }
}

// Register URL scheme handler (must be done before app is ready)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('infilux', process.execPath, [process.argv[1]]);
  }
} else {
  app.setAsDefaultProtocolClient('infilux');
}

// Parse Infilux URL and extract path
function parseInfiluxUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'infilux:') {
      const path = parsed.searchParams.get('path');
      if (path) {
        return decodeURIComponent(path);
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// Send open path event to renderer
function sendOpenPath(path: string): void {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const win = windows[0];
    win.focus();
    // Check if renderer is ready (not loading)
    if (win.webContents.isLoading()) {
      pendingOpenPath = path;
    } else {
      win.webContents.send(IPC_CHANNELS.APP_OPEN_PATH, path);
    }
  } else {
    pendingOpenPath = path;
  }
}

// Sanitize path: remove trailing slashes/backslashes and stray quotes (Windows CMD issue)
function sanitizePath(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/^["']|["']$/g, '');
}

// Handle command line arguments
function handleCommandLineArgs(argv: string[]): void {
  for (const arg of argv) {
    if (arg.startsWith('--open-path=')) {
      const rawPath = arg.slice('--open-path='.length);
      const path = sanitizePath(rawPath);
      if (path) {
        sendOpenPath(path);
      }
      return;
    }
    if (arg.startsWith('infilux://')) {
      const rawPath = parseInfiluxUrl(arg);
      const path = rawPath ? sanitizePath(rawPath) : null;
      if (path) {
        sendOpenPath(path);
      }
      return;
    }
  }
}

// macOS: Handle open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  const path = parseInfiluxUrl(url);
  if (path) {
    if (app.isReady()) {
      sendOpenPath(path);
    } else {
      pendingOpenPath = path;
    }
  }
});

// Handle second instance (single-instance per userData profile).
// In dev mode, set `ENSOAI_PROFILE` to run multiple isolated instances.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_, commandLine) => {
    // Focus existing window
    const window = getAnyWindow();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
    // Handle command line from second instance
    handleCommandLineArgs(commandLine);
  });
}

function readStoredLanguage(): Locale {
  try {
    return extractBootstrapLocaleFromSettingsData(readSharedSettings()) ?? 'en';
  } catch {
    return 'en';
  }
}

// Linux: avoid GTK3/GTK4 mixed symbols crash by forcing GTK3 unless explicitly overridden.
if (process.platform === 'linux') {
  const gtkVersion = process.env.ENSOAI_GTK_VERSION || '3';
  app.commandLine.appendSwitch('gtk-version', gtkVersion);
}

async function initAutoUpdater(window: BrowserWindow): Promise<void> {
  if (!isAutoUpdaterSupported()) {
    return;
  }

  const { readSettings } = await import('./ipc/settings');
  const settings = readSettings();
  const ensoSettings = settings?.['enso-settings'] as
    | { state?: { autoUpdateEnabled?: boolean; proxySettings?: ProxySettings } }
    | undefined;
  const autoUpdateEnabled = ensoSettings?.state?.autoUpdateEnabled ?? true;
  const proxySettings = ensoSettings?.state?.proxySettings ?? null;

  const { autoUpdaterService } = await import('./services/updater/AutoUpdater');
  isQuittingForAutoUpdateInstall = () => autoUpdaterService.isQuittingForUpdate();
  autoUpdaterService.init(window, autoUpdateEnabled, proxySettings);
}

function isAutoUpdaterSupported(): boolean {
  // Linux deb/rpm: avoid loading electron-updater (it can trigger GTK crashes on some systems).
  // AppImage uses APPIMAGE env var, where auto-update is expected to work.
  return !(process.platform === 'linux' && !process.env.APPIMAGE);
}

async function attachAutoUpdaterWindow(window: BrowserWindow): Promise<void> {
  if (!isAutoUpdaterSupported()) {
    return;
  }

  const { autoUpdaterService } = await import('./services/updater/AutoUpdater');
  isQuittingForAutoUpdateInstall = () => autoUpdaterService.isQuittingForUpdate();
  autoUpdaterService.attachWindow(window);
}

function migrateLegacySettingsIfNeeded(): void {
  if (isLegacySettingsMigrated()) {
    return;
  }

  const legacySettingsPath = join(app.getPath('userData'), 'settings.json');
  if (!existsSync(legacySettingsPath)) {
    markLegacySettingsMigrated();
    return;
  }

  try {
    const legacyData = JSON.parse(readFileSync(legacySettingsPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    writeSharedSettings(legacyData);
    const currentSession = readSharedSessionState();
    writeSharedSessionState({
      ...currentSession,
      updatedAt: Date.now(),
      settingsData: legacyData,
    });
    markLegacySettingsMigrated();
  } catch (error) {
    console.warn('[migration] Failed to migrate legacy settings:', error);
  }
}

async function migrateLegacyTodoIfNeeded(): Promise<void> {
  if (isLegacyTodoMigrated()) {
    return;
  }

  const legacyTodoPath = join(app.getPath('userData'), 'todo.db');
  if (!existsSync(legacyTodoPath)) {
    markLegacyTodoMigrated();
    return;
  }

  try {
    await todoService.initialize();
    const boards = await todoService.exportAllTasks();
    const currentSession = readSharedSessionState();
    writeSharedSessionState({
      ...currentSession,
      updatedAt: Date.now(),
      todos: boards,
    });
    markLegacyTodoMigrated();
  } catch (error) {
    console.warn('[migration] Failed to migrate legacy todo.db:', error);
  }
}

function recoverSharedLocalStorageFromCurrentProfileIfNeeded(): void {
  const currentSession = readSharedSessionState();
  const currentLocalStorage =
    currentSession.localStorage && typeof currentSession.localStorage === 'object'
      ? currentSession.localStorage
      : {};

  if (currentLocalStorage['enso-repositories']) {
    return;
  }

  const levelDbDir = join(app.getPath('userData'), 'Local Storage', 'leveldb');
  const recoveredSnapshotFromCurrentProfile = readElectronLocalStorageSnapshotFromLevelDbDirs([
    levelDbDir,
  ]);
  const legacySourcePath = findLegacySettingsImportSourcePath({
    homeDir: app.getPath('home'),
    env: process.env,
  });
  const recoveredSnapshotFromLegacySource = legacySourcePath
    ? {
        ...(readLegacyElectronLocalStorageSnapshot(legacySourcePath) ?? {}),
        ...(readLegacyImportLocalStorageSnapshot(legacySourcePath) ?? {}),
      }
    : null;
  const recoveredSnapshot = recoveredSnapshotFromCurrentProfile?.['enso-repositories']
    ? recoveredSnapshotFromCurrentProfile
    : recoveredSnapshotFromLegacySource;

  if (!recoveredSnapshot?.['enso-repositories']) {
    log.info('[migration] No recoverable repository snapshot found in current or legacy profiles', {
      levelDbDir,
      legacySourcePath,
    });
    return;
  }

  writeSharedSessionState({
    ...currentSession,
    updatedAt: Date.now(),
    localStorage: {
      ...recoveredSnapshot,
      ...currentLocalStorage,
    },
  });
  log.info('[migration] Recovered shared localStorage from existing profile state', {
    levelDbDir,
    legacySourcePath,
    recoveredKeyCount: Object.keys(recoveredSnapshot).length,
  });
}

async function init(): Promise<void> {
  // Initialize logger from settings
  const settings = readSettings();
  const ensoSettings = settings?.['enso-settings'] as
    | {
        state?: {
          loggingEnabled?: boolean;
          logLevel?: string;
          logRetentionDays?: number;
        };
      }
    | undefined;
  const loggingEnabled = (ensoSettings?.state?.loggingEnabled as boolean) ?? false;
  const logLevel = (ensoSettings?.state?.logLevel as 'error' | 'warn' | 'info' | 'debug') ?? 'info';
  const logRetentionDays = (ensoSettings?.state?.logRetentionDays as number) ?? 7;
  initLogger(loggingEnabled, logLevel, logRetentionDays);
  flushMainStartupTimeline();
  log.info('Infilux started');

  // Register IPC handlers
  registerIpcHandlers();

  // Register Claude IDE Bridge IPC handlers (bridge starts when enabled in settings)
  registerClaudeBridgeIpcHandlers();

  runDeferredStartupTask('git installation check', async () => {
    const gitInstalled = await checkGitInstalled();
    if (!gitInstalled) {
      console.warn('Git is not installed. Some features may not work.');
    }
  });

  runDeferredStartupTask('persistent agent session repository initialization', async () => {
    await persistentAgentSessionRepository.initialize();
  });
}

function openOrRestoreMainWindow(): BrowserWindow {
  const existingWindow = getAnyWindow();
  if (existingWindow) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }
    existingWindow.focus();
    return existingWindow;
  }

  const window = openLocalWindow({ bootstrapMainStage: currentMainStartupStage });
  mainWindow = window;
  webInspectorServer.setMainWindow(window);
  return window;
}

app.whenReady().then(async () => {
  recordMainStartupStage('app-ready');

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.infilux.app');

  if (process.platform === 'darwin') {
    nativeTheme.on('updated', syncDockIconWithAppearance);
    syncDockIconWithAppearance();
  }

  // Allow EnhancedInput temp images to be previewed via local-file:// protocol.
  // NOTE: This is registered here (in the same module as the protocol handler)
  // to avoid any potential issues with module-level state not being shared.
  const infiluxInputDir = join(app.getPath('temp'), TEMP_INPUT_DIRNAME);
  registerAllowedLocalFileRoot(infiluxInputDir);

  // Clean up temp files from previous sessions
  await cleanupTempFiles();

  const sharedPaths = getSharedStatePaths();
  log.info('Shared state paths', sharedPaths);
  migrateLegacySettingsIfNeeded();
  await migrateLegacyTodoIfNeeded();
  recoverSharedLocalStorageFromCurrentProfileIfNeeded();
  recordMainStartupStage('pre-window-startup-complete');

  // Register protocol to handle local file:// URLs for markdown images
  protocol.handle('local-file', (request) => {
    try {
      const filePath = customProtocolUriToPath(
        request.url,
        'local-file',
        process.platform as SupportedFileUrlPlatform
      );
      if (!filePath) {
        return new Response('Bad Request', { status: 400 });
      }

      if (!isAllowedLocalFilePath(filePath)) {
        return new Response('Forbidden', { status: 403 });
      }

      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });

  // Register protocol to handle local background images (no root check, but extension check)
  protocol.handle('local-image', async (request) => {
    try {
      const urlObj = new URL(request.url);

      // Remote image proxy: local-image://remote-fetch?url=<encoded-remote-url>
      // Uses net.fetch() from the main process to bypass renderer CORS/redirect issues
      // Use raw URL string check as primary detection (custom protocol hostname parsing can be unreliable)
      const isRemoteFetch =
        request.url.startsWith('local-image://remote-fetch') || urlObj.hostname === 'remote-fetch';

      if (isRemoteFetch) {
        // Extract remote URL: try searchParams first, then manual regex as fallback
        let fetchUrl = urlObj.searchParams.get('url');
        if (!fetchUrl) {
          const match = request.url.match(/[?&]url=([^&]+)/);
          fetchUrl = match ? decodeURIComponent(match[1]) : null;
        }
        if (!fetchUrl) {
          console.error('[local-image] Remote fetch: missing url parameter');
          return new Response('Missing url parameter', { status: 400 });
        }
        if (!isAllowedRemoteImageUrl(fetchUrl)) {
          console.warn('[local-image] Blocked remote fetch URL:', fetchUrl);
          return new Response('Forbidden', { status: 403 });
        }

        // Do NOT forward _t cache-busting param to the remote server —
        // some APIs reject unknown query params (400). The _t on the
        // local-image:// URL is enough for renderer-side cache invalidation.
        console.log('[local-image] Proxying remote image:', fetchUrl);

        try {
          const response = await net.fetch(fetchUrl, { redirect: 'follow' });

          if (!response.ok) {
            console.error(
              `[local-image] Remote fetch failed: HTTP ${response.status} for ${fetchUrl}`
            );
            return new Response(`Remote fetch failed: ${response.status}`, {
              status: response.status,
            });
          }

          const contentType = response.headers.get('content-type') || 'image/jpeg';
          console.log(`[local-image] Remote image OK: ${fetchUrl} (${contentType})`);

          return new Response(response.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-cache',
            },
          });
        } catch (fetchErr) {
          console.error('[local-image] Remote fetch error:', fetchUrl, fetchErr);
          return new Response('Remote fetch error', { status: 502 });
        }
      }

      const filePath = customProtocolUriToPath(
        request.url,
        'local-image',
        process.platform as SupportedFileUrlPlatform
      );
      if (!filePath) {
        return new Response('Bad Request', { status: 400 });
      }

      console.log(`[local-image] Request URL: ${request.url}`);
      console.log(`[local-image] Parsed Path: ${filePath}`);

      // Security check: only allow image/video extensions
      const ext = extname(filePath).toLowerCase();
      const allowedExts = [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.webp',
        '.bmp',
        '.svg',
        '.mp4',
        '.webm',
        '.ogg',
        '.mov',
        '',
      ];

      if (!allowedExts.includes(ext) && ext !== '') {
        console.warn(`[local-image] Blocked extension: ${ext} for path: ${filePath}`);
        return new Response('Forbidden', { status: 403 });
      }

      // Reject directory paths (e.g. folder source type before random file is resolved)
      try {
        if (statSync(filePath).isDirectory()) {
          return new Response('Not a file', { status: 400 });
        }
      } catch {
        // stat failed → file doesn't exist, will be caught below
      }

      // Video files: stream with Range request support for <video> element
      const videoExts = new Set(['.mp4', '.webm', '.ogg', '.mov']);
      const videoMimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mov': 'video/quicktime',
      };
      if (videoExts.has(ext)) {
        try {
          const fileStat = statSync(filePath);
          const fileSize = fileStat.size;
          const mimeType = videoMimeTypes[ext] || 'application/octet-stream';
          const rangeHeader = request.headers.get('Range');

          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
              const start = parseInt(match[1], 10);
              const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
              const chunkSize = end - start + 1;

              const fsStream = createReadStream(filePath, { start, end });
              let closed = false;
              const readable = new ReadableStream({
                start(controller) {
                  fsStream.on('data', (chunk: Buffer) => {
                    if (!closed) {
                      try {
                        controller.enqueue(chunk);
                      } catch {
                        closed = true;
                      }
                    }
                  });
                  fsStream.on('end', () => {
                    if (!closed) {
                      closed = true;
                      try {
                        controller.close();
                      } catch {
                        /* already closed */
                      }
                    }
                  });
                  fsStream.on('error', (err) => {
                    if (!closed) {
                      closed = true;
                      try {
                        controller.error(err);
                      } catch {
                        /* already closed */
                      }
                    }
                  });
                },
                cancel() {
                  closed = true;
                  fsStream.destroy();
                },
              });

              return new Response(readable as unknown as BodyInit, {
                status: 206,
                headers: {
                  'Content-Type': mimeType,
                  'Content-Length': String(chunkSize),
                  'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                  'Accept-Ranges': 'bytes',
                  'Access-Control-Allow-Origin': '*',
                },
              });
            }
          }

          // No Range header: serve full file
          const buffer = readFileSync(filePath);
          return new Response(buffer, {
            headers: {
              'Content-Type': mimeType,
              'Content-Length': String(fileSize),
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (e) {
          console.error(`[local-image] Video serve error for ${filePath}:`, e);
          return new Response('Not Found', { status: 404 });
        }
      }

      // Image files: use readFileSync (simpler, avoids net.fetch quirks with images)
      try {
        const buffer = readFileSync(filePath);

        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.bmp': 'image/bmp',
          '.svg': 'image/svg+xml',
        };

        return new Response(buffer, {
          headers: {
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        console.error(`[local-image] Read error for ${filePath}:`, e);
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('[local-image] Error handling request:', request.url, error);
      return new Response('Bad Request', { status: 400 });
    }
  });

  // Default open or close DevTools by F12 in development
  // Also intercept Cmd+- for all windows to bypass Monaco Editor interception
  app.on('browser-window-created', (_, window) => {
    const detachRendererRecoveryHandlers = attachRendererRecoveryHandlers(window);
    window.once('closed', () => {
      detachRendererRecoveryHandlers();
    });

    if (isDev) {
      const rawDebug = (
        process as NodeJS.Process & {
          _rawDebug?: (message: string) => void;
        }
      )._rawDebug;
      const writeDevProbe = (label: string, payload: unknown) => {
        const formatted =
          typeof payload === 'string'
            ? payload
            : inspect(payload, {
                depth: 5,
                compact: false,
                sorted: true,
                breakLength: 120,
              });
        if (typeof rawDebug === 'function') {
          rawDebug(`${label} ${formatted}`);
          return;
        }
        console.error(`${label} ${formatted}`);
      };

      const captureRendererSnapshot = (stage: string) => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) {
          return;
        }

        void window.webContents
          .executeJavaScript(
            `(async () => {
              const root = document.getElementById('root');
              const xtermNodes = Array.from(document.querySelectorAll('.xterm'));
              const roundRect = (element) => {
                if (!(element instanceof HTMLElement)) {
                  return null;
                }
                const rect = element.getBoundingClientRect();
                return {
                  width: Number(rect.width.toFixed(2)),
                  height: Number(rect.height.toFixed(2)),
                  x: Number(rect.x.toFixed(2)),
                  y: Number(rect.y.toFixed(2)),
                };
              };
              const pickStyle = (element, properties) => {
                if (!(element instanceof HTMLElement)) {
                  return null;
                }
                const style = getComputedStyle(element);
                return Object.fromEntries(
                  properties.map((property) => [property, style.getPropertyValue(property).trim()])
                );
              };
              const visibleXtermCount = xtermNodes.filter((node) => {
                const element = node instanceof HTMLElement ? node : null;
                if (!element) {
                  return false;
                }
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return (
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0' &&
                  rect.width > 0 &&
                  rect.height > 0
                );
              }).length;
              const visibleSidebarWorktreeNodes = Array.from(
                document.querySelectorAll('.control-tree-node[data-node-kind="worktree"]')
              ).filter((node) => {
                if (!(node instanceof HTMLElement)) {
                  return false;
                }
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return (
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  style.opacity !== '0' &&
                  rect.width > 0 &&
                  rect.height > 0 &&
                  rect.left < window.innerWidth * 0.4
                );
              });
              const activeWorktreeNode =
                visibleSidebarWorktreeNodes.find(
                  (node) => node.getAttribute('data-active') === 'worktree'
                ) ??
                visibleSidebarWorktreeNodes[0] ??
                document.querySelector(
                  '.control-tree-node[data-node-kind="worktree"][data-active="worktree"]'
                ) ??
                document.querySelector('.control-tree-node[data-node-kind="worktree"]');
              const titleRow = activeWorktreeNode?.querySelector('.control-tree-title-row') ?? null;
              const title = activeWorktreeNode?.querySelector('.control-tree-title') ?? null;
              const inlineSignals =
                activeWorktreeNode?.querySelector('.control-tree-inline-signals') ?? null;
              const diffBadge =
                activeWorktreeNode?.querySelector('.control-tree-diff-badge') ?? null;
              const metaRow =
                activeWorktreeNode?.querySelector('.control-tree-meta-row') ?? null;
              const actionTail =
                activeWorktreeNode?.querySelector('.control-tree-tail[data-role="action"]') ?? null;
              const primaryButton =
                activeWorktreeNode?.querySelector('.control-tree-primary') ?? null;
              const inlineSignalsRect = roundRect(inlineSignals);
              const inlineSignalLabels =
                inlineSignals instanceof HTMLElement
                  ? Array.from(inlineSignals.children)
                      .map((child) => child.textContent?.replace(/\\s+/g, ' ').trim() ?? '')
                      .filter(Boolean)
                  : [];
              const inlineSignalItems =
                inlineSignals instanceof HTMLElement
                  ? Array.from(inlineSignals.children).map((child) => {
                      const element = child instanceof HTMLElement ? child : null;
                      return {
                        text: child.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
                        html:
                          element?.innerHTML
                            ?.replace(/\\s+/g, ' ')
                            .trim()
                            .slice(0, 240) ?? '',
                        rect: roundRect(element),
                        style: pickStyle(element, [
                          'display',
                          'visibility',
                          'opacity',
                          'color',
                          'background-color',
                          'border-color',
                          'font-size',
                          'line-height',
                          'overflow',
                        ]),
                      };
                    })
                  : [];

              let runtimeMetrics = null;
              try {
                runtimeMetrics = await window.electronAPI?.app?.getRuntimeMetrics?.();
              } catch (error) {
                runtimeMetrics = {
                  error: error instanceof Error ? error.message : String(error),
                };
              }

              return {
                href: window.location.href,
                readyState: document.readyState,
                bootstrapStage: window.__infiluxBootstrapStage ?? null,
                rootHtmlLength: root?.innerHTML.length ?? 0,
                rootNodeCount: root?.querySelectorAll('*').length ?? 0,
                rootText: root?.innerText?.slice(0, 200) ?? '',
                bodyBg: getComputedStyle(document.body).backgroundColor,
                bodyColor: getComputedStyle(document.body).color,
                bodyChildCount: document.body?.childElementCount ?? 0,
                xtermCount: xtermNodes.length,
                visibleXtermCount,
                worktreeProbe: activeWorktreeNode
                  ? {
                      nodeFound: true,
                      branchText:
                        title instanceof HTMLElement
                          ? title.textContent?.replace(/\\s+/g, ' ').trim() ?? ''
                          : '',
                      nodeText:
                        activeWorktreeNode instanceof HTMLElement
                          ? activeWorktreeNode.innerText?.replace(/\\s+/g, ' ').trim() ?? ''
                          : '',
                      inlineSignalLabels,
                      inlineSignalItems,
                      titleIsTruncated:
                        title instanceof HTMLElement
                          ? title.scrollWidth > title.clientWidth + 1
                          : false,
                      metaIsOverflowing:
                        metaRow instanceof HTMLElement
                          ? metaRow.scrollWidth > metaRow.clientWidth + 1
                          : false,
                      rects: {
                        node: roundRect(activeWorktreeNode),
                        primaryButton: roundRect(primaryButton),
                        titleRow: roundRect(titleRow),
                        title: roundRect(title),
                        inlineSignals: inlineSignalsRect,
                        diffBadge: roundRect(diffBadge),
                        metaRow: roundRect(metaRow),
                        actionTail: roundRect(actionTail),
                      },
                      styles: {
                        inlineSignals: pickStyle(inlineSignals, [
                          'display',
                          'width',
                          'min-width',
                          'max-width',
                          'flex',
                          'overflow',
                          'white-space',
                          'gap',
                        ]),
                        title: pickStyle(title, ['display', 'min-width', 'max-width', 'flex']),
                        metaRow: pickStyle(metaRow, [
                          'display',
                          'flex-wrap',
                          'overflow',
                          'white-space',
                        ]),
                        actionTail: pickStyle(actionTail, [
                          'display',
                          'max-width',
                          'padding-inline-start',
                          'opacity',
                          'pointer-events',
                        ]),
                      },
                    }
                  : {
                      nodeFound: false,
                    },
                runtimeMetrics,
              };
            })()`,
            true
          )
          .then(async (snapshot) => {
            let screenshotPath: string | null = null;
            let nodeScreenshotPath: string | null = null;
            let inlineSignalsScreenshotPath: string | null = null;
            let screenshotError: string | null = null;

            if (
              snapshot &&
              typeof snapshot === 'object' &&
              'worktreeProbe' in snapshot &&
              snapshot.worktreeProbe &&
              typeof snapshot.worktreeProbe === 'object' &&
              'nodeFound' in snapshot.worktreeProbe &&
              snapshot.worktreeProbe.nodeFound
            ) {
              try {
                // Capture the current window frame alongside layout metrics for dev-only UI diagnosis.
                const image = await window.webContents.capturePage();
                const safeStage = stage.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
                screenshotPath = `/tmp/infilux-worktree-${window.id}-${safeStage}.png`;
                writeFileSync(screenshotPath, image.toPNG());

                const worktreeProbe = (
                  snapshot as {
                    worktreeProbe?: {
                      rects?: {
                        node?: {
                          x?: number;
                          y?: number;
                          width?: number;
                          height?: number;
                        } | null;
                        inlineSignals?: {
                          x?: number;
                          y?: number;
                          width?: number;
                          height?: number;
                        } | null;
                      } | null;
                    } | null;
                  }
                ).worktreeProbe;
                const nodeRect = worktreeProbe?.rects?.node;
                const inlineSignalsRect = worktreeProbe?.rects?.inlineSignals;

                if (
                  nodeRect &&
                  typeof nodeRect.x === 'number' &&
                  typeof nodeRect.y === 'number' &&
                  typeof nodeRect.width === 'number' &&
                  typeof nodeRect.height === 'number'
                ) {
                  const contentBounds = window.getContentBounds();
                  const imageSize = image.getSize();
                  const scaleX = imageSize.width / Math.max(contentBounds.width, 1);
                  const scaleY = imageSize.height / Math.max(contentBounds.height, 1);
                  const padding = 20;
                  const cropX = Math.max(0, Math.floor((nodeRect.x - padding) * scaleX));
                  const cropY = Math.max(0, Math.floor((nodeRect.y - padding) * scaleY));
                  const cropWidth = Math.max(
                    1,
                    Math.min(
                      imageSize.width - cropX,
                      Math.ceil((nodeRect.width + padding * 2) * scaleX)
                    )
                  );
                  const cropHeight = Math.max(
                    1,
                    Math.min(
                      imageSize.height - cropY,
                      Math.ceil((nodeRect.height + padding * 2) * scaleY)
                    )
                  );
                  const nodeImage = image.crop({
                    x: cropX,
                    y: cropY,
                    width: cropWidth,
                    height: cropHeight,
                  });
                  nodeScreenshotPath = `/tmp/infilux-worktree-${window.id}-${safeStage}-node.png`;
                  writeFileSync(nodeScreenshotPath, nodeImage.toPNG());
                }

                if (
                  inlineSignalsRect &&
                  typeof inlineSignalsRect.x === 'number' &&
                  typeof inlineSignalsRect.y === 'number' &&
                  typeof inlineSignalsRect.width === 'number' &&
                  typeof inlineSignalsRect.height === 'number'
                ) {
                  const contentBounds = window.getContentBounds();
                  const imageSize = image.getSize();
                  const scaleX = imageSize.width / Math.max(contentBounds.width, 1);
                  const scaleY = imageSize.height / Math.max(contentBounds.height, 1);
                  const padding = 16;
                  const cropX = Math.max(0, Math.floor((inlineSignalsRect.x - padding) * scaleX));
                  const cropY = Math.max(0, Math.floor((inlineSignalsRect.y - padding) * scaleY));
                  const cropWidth = Math.max(
                    1,
                    Math.min(
                      imageSize.width - cropX,
                      Math.ceil((inlineSignalsRect.width + padding * 2) * scaleX)
                    )
                  );
                  const cropHeight = Math.max(
                    1,
                    Math.min(
                      imageSize.height - cropY,
                      Math.ceil((inlineSignalsRect.height + padding * 2) * scaleY)
                    )
                  );
                  const inlineSignalsImage = image.crop({
                    x: cropX,
                    y: cropY,
                    width: cropWidth,
                    height: cropHeight,
                  });
                  inlineSignalsScreenshotPath = `/tmp/infilux-worktree-${window.id}-${safeStage}-signals.png`;
                  writeFileSync(inlineSignalsScreenshotPath, inlineSignalsImage.toPNG());
                }
              } catch (error) {
                screenshotError = error instanceof Error ? error.message : String(error);
              }
            }

            writeDevProbe('[renderer-snapshot]', {
              stage,
              windowId: window.id,
              snapshot,
              screenshotError,
              screenshotPath,
              nodeScreenshotPath,
              inlineSignalsScreenshotPath,
            });
          })
          .catch((error) => {
            writeDevProbe('[renderer-snapshot-error]', {
              stage,
              windowId: window.id,
              error,
            });
          });
      };

      window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        const shouldLogConsoleMessage =
          level >= 2 ||
          message.includes('[renderer-bootstrap]') ||
          message.includes('[renderer-diagnostics]') ||
          message.includes('Maximum update depth exceeded') ||
          message.includes('TypeError');

        if (!shouldLogConsoleMessage) {
          return;
        }

        writeDevProbe('[renderer-console]', {
          windowId: window.id,
          level,
          message,
          line,
          sourceId,
        });
      });

      const requestFilter = {
        urls: ['http://localhost:*/*'],
      };
      const handleRequestError = (details: Electron.OnErrorOccurredListenerDetails) => {
        if (
          details.webContentsId !== window.webContents.id ||
          (!details.url.includes('/index.tsx') &&
            !details.url.includes('/@vite/client') &&
            !details.url.includes('/@fs/'))
        ) {
          return;
        }

        writeDevProbe('[renderer-request-error]', {
          windowId: window.id,
          error: details.error,
          resourceType: details.resourceType,
          url: details.url,
        });
      };
      window.webContents.session.webRequest.onErrorOccurred(requestFilter, handleRequestError);

      window.webContents.once('did-finish-load', () => {
        captureRendererSnapshot('did-finish-load');
        setTimeout(() => captureRendererSnapshot('post-load-1000ms'), 1000);
        setTimeout(() => captureRendererSnapshot('post-load-3000ms'), 3000);
        for (const delayMs of [20_000, 60_000, 90_000]) {
          setTimeout(() => captureRendererSnapshot(`post-load-${delayMs}ms`), delayMs);
        }
      });
    }

    // Snapshot listeners before the optimizer adds its own, only needed in production.
    const listenersBefore = app.isPackaged
      ? new Set(window.webContents.listeners('before-input-event'))
      : undefined;
    optimizer.watchWindowShortcuts(window);

    // In production, allow Ctrl+R to pass through to terminal for reverse
    // history search. The optimizer blocks it by default via
    // before-input-event preventDefault.
    // Depends on @electron-toolkit/utils implementing shortcut blocking via
    // before-input-event listeners (verified up to v4.x).
    if (listenersBefore) {
      const newListeners = window.webContents
        .listeners('before-input-event')
        .filter((l) => !listenersBefore.has(l));

      if (newListeners.length === 0) {
        console.warn(
          '[ctrl-r-passthrough] watchWindowShortcuts did not add any before-input-event listener'
        );
      }

      const isCtrlR = (input: Electron.Input): boolean =>
        input.code === 'KeyR' && input.control && !input.shift && !input.meta && !input.alt;

      // Remove and re-add each listener with a wrapper. This moves them to
      // the end of the listener queue, which is acceptable since no other
      // before-input-event listeners depend on their ordering.
      for (const listener of newListeners) {
        const handler = listener as (event: Electron.Event, input: Electron.Input) => void;
        window.webContents.removeListener('before-input-event', handler);
        window.webContents.on('before-input-event', (event, input) => {
          if (isCtrlR(input)) return;
          handler(event, input);
        });
      }
    }

    // Intercept Cmd+- before renderer process to bypass Monaco Editor interception
    window.webContents.on('before-input-event', (event, input) => {
      const isMac = process.platform === 'darwin';
      const modKey = isMac ? input.meta : input.control;
      if (modKey && input.key === '-') {
        event.preventDefault();
        const currentZoom = window.webContents.getZoomLevel();
        window.webContents.setZoomLevel(currentZoom - 0.5);
      }
    });
  });

  await init();
  recordMainStartupStage('main-init-complete');

  setCurrentLocale(readStoredLanguage());

  cleanupWindowHandlers = registerWindowHandlers();
  mainWindow = openLocalWindow({ bootstrapMainStage: currentMainStartupStage });

  // Set main window for Web Inspector server (for IPC communication)
  webInspectorServer.setMainWindow(mainWindow);
  recordMainStartupStage('main-window-created');

  // Initialize Claude Provider Watcher (only when enableProviderWatcher is true)
  const appSettings = readSettings();
  const providerWatcherEnabled =
    (appSettings?.claudeCodeIntegration as Record<string, unknown>)?.enableProviderWatcher !==
    false;
  initClaudeProviderWatcher(mainWindow, providerWatcherEnabled);

  // IMPORTANT: Set up did-finish-load handler BEFORE handling command line args
  // to avoid race condition where page loads before handler is registered
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOpenPath) {
      mainWindow?.webContents.send(IPC_CHANNELS.APP_OPEN_PATH, pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  runDeferredStartupTask('Hapi auto-start', async () => {
    await autoStartHapi();
  });
  recordMainStartupStage('hapi-auto-start-queued');

  // Initialize auto-updater
  await initAutoUpdater(mainWindow);
  recordMainStartupStage('auto-updater-initialized');

  // Initialize git auto-fetch service
  gitAutoFetchService.init(mainWindow);

  const handleNewWindow = () => {
    openLocalWindow({ bootstrapMainStage: currentMainStartupStage });
  };

  // Build and set application menu
  const menu = buildAppMenu({
    onNewWindow: handleNewWindow,
  });
  Menu.setApplicationMenu(menu);

  appTrayService.init({
    onOpen: () => {
      const window = openOrRestoreMainWindow();
      void attachAutoUpdaterWindow(window);
    },
    onQuit: () => {
      app.quit();
    },
    statusLabel: app.getName(),
  });

  // Handle initial command line args (this may set pendingOpenPath)
  handleCommandLineArgs(process.argv);

  ipcMain.handle(IPC_CHANNELS.APP_SET_LANGUAGE, (_event, language: Locale) => {
    setCurrentLocale(language);
    const updatedMenu = buildAppMenu({
      onNewWindow: handleNewWindow,
    });
    Menu.setApplicationMenu(updatedMenu);
    appTrayService.refreshMenu();
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = openOrRestoreMainWindow();
      await attachAutoUpdaterWindow(mainWindow);
    }
  });

  app.on('browser-window-focus', async (_, window) => {
    mainWindow = window;
    webInspectorServer.setMainWindow(window);
    await attachAutoUpdaterWindow(window);
  });
});

app.on('window-all-closed', () => {
  mainWindow = null;
  webInspectorServer.setMainWindow(null);

  if (appTrayService.isInitialized()) {
    return;
  }
  app.quit();
});

function runBestEffortPreExitStep(reason: string, label: string, step: () => void): void {
  try {
    step();
  } catch (error) {
    console.error(`[app] ${label} cleanup error during ${reason}:`, error);
  }
}

function prepareForExit(reason: string): void {
  const windowCleanup = cleanupWindowHandlers;
  cleanupWindowHandlers = null;

  if (windowCleanup) {
    runBestEffortPreExitStep(reason, 'window', () => {
      windowCleanup();
    });
  }

  runBestEffortPreExitStep(reason, 'tray', () => appTrayService.destroy());
  runBestEffortPreExitStep(reason, 'claudeSettings', () => unwatchClaudeSettings());
  runBestEffortPreExitStep(reason, 'gitAutoFetch', () => gitAutoFetchService.cleanup());
}

function performSynchronousShutdown(
  reason: string,
  exitCode: number,
  options: {
    prepareBeforeCleanup?: boolean;
  } = {}
): void {
  if (emergencyShutdownTriggered) {
    return;
  }

  emergencyShutdownTriggered = true;
  isQuittingCleanupRunning = true;

  if (options.prepareBeforeCleanup !== false) {
    prepareForExit(reason);
  }

  try {
    cleanupAllResourcesSync();
  } catch (error) {
    console.error(`[app] Sync cleanup error during ${reason}:`, error);
  } finally {
    app.exit(exitCode);
  }
}

function handleFatalMainProcessError(
  label: 'uncaughtException' | 'unhandledRejection',
  error: unknown
): void {
  writeUncaughtExceptionSnapshot(label, error);
  if (isIgnorableConsoleWriteError(error)) {
    return;
  }

  if (label === 'uncaughtException') {
    console.error('Uncaught Exception:', error);
  } else {
    console.error('Unhandled Rejection:', error);
  }

  performSynchronousShutdown(label, 1);
}

// Cleanup before app quits (covers all quit methods: Cmd+Q, window close, etc.)
app.on('will-quit', (event) => {
  if (isQuittingForAutoUpdateInstall()) {
    log.info('[updater] Allowing updater-controlled quit flow for install restart');
    return;
  }

  if (isQuittingCleanupRunning) {
    return;
  }

  event.preventDefault();
  isQuittingCleanupRunning = true;
  console.log('[app] Will quit, cleaning up...');
  prepareForExit('will-quit');

  // Guard against double-cleanup: sync cleanup in the force-exit path must be
  // skipped if async cleanup already finished, otherwise both paths would
  // concurrently tear down node-pty native resources and cause a crash.
  let asyncCleanupDone = false;

  const forceExitTimer = setTimeout(() => {
    console.error('[app] Cleanup timed out, forcing exit');
    if (!asyncCleanupDone) {
      performSynchronousShutdown('will-quit-timeout', 0, {
        prepareBeforeCleanup: false,
      });
      return;
    }
    app.exit(0);
  }, FORCE_EXIT_TIMEOUT_MS);

  void cleanupAllResources()
    .then((summary) => {
      if (summary.failedLabels.length > 0) {
        console.warn('[app] Cleanup completed with warnings:', summary.failedLabels.join(', '));
      }
      if (summary.hasTimeouts) {
        console.error(
          '[app] Cleanup incomplete before exit deadline. Waiting for forced shutdown for tasks:',
          summary.timedOutLabels.join(', ')
        );
        return;
      }

      asyncCleanupDone = true;
      clearTimeout(forceExitTimer);
      app.exit(0);
    })
    .catch((error) => {
      console.error('[app] Cleanup error:', error);
    });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  handleFatalMainProcessError('uncaughtException', error);
});

process.on('unhandledRejection', (reason) => {
  handleFatalMainProcessError('unhandledRejection', reason);
});

// Handle SIGINT (Ctrl+C) and SIGTERM
// In dev mode, electron-vite may exit before we finish cleanup.
// Use synchronous cleanup + immediate app.exit() to ensure clean shutdown.
function handleShutdownSignal(signal: string): void {
  console.log(`[app] Received ${signal}, exiting...`);
  performSynchronousShutdown(signal, 0);
}

process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
process.on('SIGHUP', () => handleShutdownSignal('SIGHUP'));
function getAnyWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

export const __testables = {
  isPrivateIpLiteral,
  isAllowedRemoteImageUrl,
  sanitizeProfileName: sanitizeRuntimeProfileName,
  resolveStartupRuntimeChannel,
  parseInfiluxUrl,
  sendOpenPath,
  sanitizePath,
  handleCommandLineArgs,
  readStoredLanguage,
  initAutoUpdater,
  migrateLegacySettingsIfNeeded,
  migrateLegacyTodoIfNeeded,
  recoverSharedLocalStorageFromCurrentProfileIfNeeded,
  init,
  handleShutdownSignal,
  isIgnorableConsoleWriteError,
  getAnyWindow,
  openOrRestoreMainWindow,
  resolveAppIconPath,
  syncDockIconWithAppearance,
};
