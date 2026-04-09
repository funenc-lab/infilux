import { is } from '@electron-toolkit/utils';
import {
  IPC_CHANNELS,
  type ProxySettings,
  type UpdateReleaseInfo,
  type UpdateStatus,
} from '@shared/types';
import type { BrowserWindow } from 'electron';
import electronUpdater, { type UpdateInfo } from 'electron-updater';

import { applyProxy, registerUpdaterSession } from '../proxy/ProxyConfig';

const { autoUpdater } = electronUpdater;

// Check interval: 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// Minimum interval between focus checks: 30 minutes
const MIN_FOCUS_CHECK_INTERVAL_MS = 30 * 60 * 1000;

type UpdaterRuntimeState = {
  autoUpdateEnabled: boolean;
  status: UpdateStatus | null;
};

function normalizeUpdateInfo(info: UpdateInfo | null | undefined): UpdateReleaseInfo | undefined {
  if (!info?.version) {
    return undefined;
  }

  return {
    version: info.version,
  };
}

class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private updateDownloaded = false;
  private _isQuittingForUpdate = false;
  private autoUpdateEnabled = true;
  private currentStatus: UpdateStatus | null = null;
  private checkIntervalId: NodeJS.Timeout | null = null;
  private initialCheckTimeoutId: NodeJS.Timeout | null = null;
  private lastCheckTime = 0;
  private onFocusHandler: (() => void) | null = null;
  private updaterEventsBound = false;

  init(
    window: BrowserWindow,
    autoUpdateEnabled = true,
    proxySettings?: ProxySettings | null
  ): void {
    this.attachWindow(window);
    this.autoUpdateEnabled = autoUpdateEnabled;

    // Register updater session so applyProxy() can configure it
    registerUpdaterSession(autoUpdater.netSession);

    // Seed proxy state before any update checks
    if (proxySettings) {
      applyProxy(proxySettings).catch((error) => {
        console.error('Failed to seed proxy settings:', error);
      });
    }

    // Enable logging in dev mode
    if (is.dev) {
      autoUpdater.logger = console;
    }

    this.ensureUpdaterEventHandlers();

    autoUpdater.autoDownload = autoUpdateEnabled;

    // Apply initial auto-update setting
    this.setAutoUpdateEnabled(autoUpdateEnabled);
  }

  attachWindow(window: BrowserWindow): void {
    this.detachWindow();
    this.mainWindow = window;

    if (!this.onFocusHandler) {
      this.onFocusHandler = () => {
        if (autoUpdater.autoDownload) {
          const now = Date.now();
          if (now - this.lastCheckTime >= MIN_FOCUS_CHECK_INTERVAL_MS) {
            void this.checkForUpdates();
          }
        }
      };
    }

    window.on('focus', this.onFocusHandler);
  }

  cleanup(): void {
    this.clearScheduledChecks();
    this.detachWindow();
  }

  private sendStatus(status: UpdateStatus): void {
    // Once update is downloaded, don't send other status updates
    // This prevents the update dialog from disappearing due to subsequent checks
    if (this.updateDownloaded && status.status !== 'downloaded') {
      return;
    }
    this.currentStatus = status;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATER_STATUS, status);
    }
  }

  async checkForUpdates(): Promise<void> {
    // Skip if update already downloaded to prevent race conditions
    if (this.updateDownloaded) {
      return;
    }
    try {
      this.lastCheckTime = Date.now();
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      throw error;
    }
  }

  quitAndInstall(): void {
    if (this.updateDownloaded) {
      this._isQuittingForUpdate = true;
      autoUpdater.quitAndInstall();
    }
  }

  isUpdateDownloaded(): boolean {
    return this.updateDownloaded;
  }

  isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate;
  }

  setAutoUpdateEnabled(enabled: boolean): void {
    this.autoUpdateEnabled = enabled;
    autoUpdater.autoDownload = enabled;
    autoUpdater.autoInstallOnAppQuit = enabled;

    if (enabled) {
      if (!this.checkIntervalId) {
        this.checkIntervalId = setInterval(() => {
          this.checkForUpdates();
        }, CHECK_INTERVAL_MS);
      }
      if (this.initialCheckTimeoutId) {
        clearTimeout(this.initialCheckTimeoutId);
      }
      this.initialCheckTimeoutId = setTimeout(() => {
        this.initialCheckTimeoutId = null;
        void this.checkForUpdates();
      }, 3000);
    } else {
      this.clearScheduledChecks();
    }
  }

  getState(): UpdaterRuntimeState {
    return {
      autoUpdateEnabled: this.autoUpdateEnabled,
      status: this.currentStatus,
    };
  }

  private ensureUpdaterEventHandlers(): void {
    if (this.updaterEventsBound) {
      return;
    }

    autoUpdater.on('checking-for-update', () => {
      this.sendStatus({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      this.sendStatus({ status: 'available', info: normalizeUpdateInfo(info) });
    });

    autoUpdater.on('update-not-available', (info) => {
      this.sendStatus({ status: 'not-available', info: normalizeUpdateInfo(info) });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.sendStatus({
        status: 'downloading',
        progress: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          total: progress.total,
          transferred: progress.transferred,
        },
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.updateDownloaded = true;
      // Stop all future update checks to prevent race conditions
      this.clearScheduledChecks();
      this.sendStatus({ status: 'downloaded', info: normalizeUpdateInfo(info) });
    });

    autoUpdater.on('error', (error) => {
      this.sendStatus({ status: 'error', error: error.message });
    });

    this.updaterEventsBound = true;
  }

  private clearScheduledChecks(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    if (this.initialCheckTimeoutId) {
      clearTimeout(this.initialCheckTimeoutId);
      this.initialCheckTimeoutId = null;
    }
  }

  private detachWindow(): void {
    if (this.mainWindow && this.onFocusHandler) {
      this.mainWindow.off('focus', this.onFocusHandler);
    }
    this.mainWindow = null;
  }
}

export const autoUpdaterService = new AutoUpdaterService();
