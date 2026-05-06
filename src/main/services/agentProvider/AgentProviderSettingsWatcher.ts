import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentProviderProfile, AIProvider } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';

interface AgentProviderSettingsWatcherOptions<TSettings> {
  providerId: AIProvider;
  logPrefix: string;
  configDir: () => string;
  fileName: string;
  readSettings: () => TSettings;
  extractProvider: (settings: TSettings) => Partial<AgentProviderProfile> | null;
  isDetected?: (settings: TSettings, extracted: Partial<AgentProviderProfile> | null) => boolean;
}

export interface AgentProviderSettingsWatcher {
  watch: (window: BrowserWindow) => void;
  unwatch: () => void;
}

function isTargetFile(filename: string | Buffer | null, fileName: string): boolean {
  if (!filename) {
    return false;
  }
  return path.basename(filename.toString()) === fileName;
}

export function createAgentProviderSettingsWatcher<TSettings>(
  options: AgentProviderSettingsWatcherOptions<TSettings>
): AgentProviderSettingsWatcher {
  let settingsWatcher: fs.FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let maxWaitTimer: NodeJS.Timeout | null = null;
  let lastProviderSnapshot: string | null = null;
  let lastMtimeMs: number | null = null;
  let lastFileSize: number | null = null;

  const getSettingsPath = () => path.join(options.configDir(), options.fileName);

  const clearTimers = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const hasProviderChanged = (extracted: Partial<AgentProviderProfile> | null): boolean => {
    const currentSnapshot = JSON.stringify(extracted);
    if (currentSnapshot === lastProviderSnapshot) {
      return false;
    }
    lastProviderSnapshot = currentSnapshot;
    return true;
  };

  const hasFileMetadataChanged = (): boolean => {
    const settingsPath = getSettingsPath();
    try {
      if (!fs.existsSync(settingsPath)) {
        return true;
      }

      const stats = fs.statSync(settingsPath);
      if (
        lastMtimeMs !== null &&
        lastFileSize !== null &&
        stats.mtimeMs === lastMtimeMs &&
        stats.size === lastFileSize
      ) {
        return false;
      }

      lastMtimeMs = stats.mtimeMs;
      lastFileSize = stats.size;
      return true;
    } catch (error) {
      console.warn(`[${options.logPrefix}] Failed to check file stats:`, error);
      return true;
    }
  };

  const notifySettingsChanged = (
    window: BrowserWindow,
    settings: TSettings,
    extracted: Partial<AgentProviderProfile> | null
  ): void => {
    window.webContents.send(IPC_CHANNELS.AGENT_PROVIDER_SETTINGS_CHANGED, {
      providerId: options.providerId,
      settings,
      extracted,
      detected: options.isDetected ? options.isDetected(settings, extracted) : extracted !== null,
      supported: true,
    });
  };

  const processChange = (window: BrowserWindow) => {
    clearTimers();

    if (window.isDestroyed()) {
      console.log(`[${options.logPrefix}] Window destroyed, skipping notification`);
      return;
    }

    if (!hasFileMetadataChanged()) {
      console.log(`[${options.logPrefix}] File metadata unchanged, skipping read`);
      return;
    }

    try {
      const settings = options.readSettings();
      const extracted = options.extractProvider(settings);
      if (!hasProviderChanged(extracted)) {
        console.log(`[${options.logPrefix}] Provider config unchanged, skipping notification`);
        return;
      }

      console.log(`[${options.logPrefix}] Provider config changed, notifying frontend`);
      notifySettingsChanged(window, settings, extracted);
    } catch (error) {
      console.warn(`[${options.logPrefix}] Failed to read settings after change:`, error);
    }
  };

  const watch = (window: BrowserWindow): void => {
    if (settingsWatcher) {
      settingsWatcher.close();
    }

    const configDir = options.configDir();
    const settingsPath = getSettingsPath();

    if (!fs.existsSync(configDir)) {
      try {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      } catch (error) {
        console.error(`[${options.logPrefix}] Failed to create config dir for watching:`, error);
        return;
      }
    }

    lastProviderSnapshot = JSON.stringify(options.extractProvider(options.readSettings()));

    try {
      settingsWatcher = fs.watch(configDir, (eventType, filename) => {
        if (!isTargetFile(filename, options.fileName)) {
          return;
        }

        console.log(`[${options.logPrefix}] Detected ${options.fileName} change (${eventType})`);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        if (!maxWaitTimer) {
          maxWaitTimer = setTimeout(() => processChange(window), 2000);
        }
        debounceTimer = setTimeout(() => processChange(window), 400);
      });

      settingsWatcher.on('error', (error) => {
        console.error(`[${options.logPrefix}] Watcher error:`, error);
      });

      console.log(`[${options.logPrefix}] Started watching ${settingsPath}`);
    } catch (error) {
      console.error(`[${options.logPrefix}] Failed to start watcher:`, error);
    }
  };

  const unwatch = (): void => {
    clearTimers();
    if (settingsWatcher) {
      settingsWatcher.close();
      settingsWatcher = null;
    }
    lastProviderSnapshot = null;
    lastMtimeMs = null;
    lastFileSize = null;
  };

  return {
    watch,
    unwatch,
  };
}
