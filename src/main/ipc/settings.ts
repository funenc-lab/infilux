import { readFileSync } from 'node:fs';
import { IPC_CHANNELS } from '@shared/types';
import { app, ipcMain } from 'electron';
import {
  readSharedSettings,
  writeSharedSettings,
  writeSharedSettingsToSession,
} from '../services/SharedSessionState';
import {
  buildLegacySettingsImportPayload,
  buildLegacySettingsImportPreview,
} from '../services/settings/legacyImport';
import { toggleClaudeProviderWatcher } from './claudeProvider';

let cachedSettings: Record<string, unknown> | null = null;
let pendingWrite: NodeJS.Timeout | null = null;
let maxWaitTimer: NodeJS.Timeout | null = null;
let isDirty = false;

const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 5000;

export function readSettings(): Record<string, unknown> | null {
  if (cachedSettings !== null) {
    return cachedSettings;
  }

  try {
    cachedSettings = readSharedSettings();
    return cachedSettings;
  } catch {
    // Return null if file doesn't exist or is corrupted
  }
  cachedSettings = null;
  return null;
}

function atomicWriteSettings(data: Record<string, unknown>): boolean {
  try {
    writeSharedSettings(data);
    writeSharedSettingsToSession(data);
    return true;
  } catch {
    return false;
  }
}

export function flushSettings(): boolean {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }

  if (isDirty && cachedSettings !== null) {
    isDirty = false;
    return atomicWriteSettings(cachedSettings);
  }
  return true;
}

function getProviderWatcherEnabled(
  data: Record<string, unknown> | null | undefined
): boolean | undefined {
  const directIntegration = data?.claudeCodeIntegration;
  if (typeof directIntegration === 'object' && directIntegration !== null) {
    const directEnabled = (directIntegration as { enableProviderWatcher?: unknown })
      .enableProviderWatcher;
    if (typeof directEnabled === 'boolean') {
      return directEnabled;
    }
  }

  const settingsSlice = data?.['enso-settings'];
  if (typeof settingsSlice !== 'object' || settingsSlice === null) {
    return undefined;
  }

  const state = (settingsSlice as { state?: Record<string, unknown> }).state;
  const integration = state?.claudeCodeIntegration;
  if (typeof integration !== 'object' || integration === null) {
    return undefined;
  }

  const enabled = (integration as { enableProviderWatcher?: unknown }).enableProviderWatcher;
  return typeof enabled === 'boolean' ? enabled : undefined;
}

function syncProviderWatcher(
  previousData: Record<string, unknown> | null,
  nextData: Record<string, unknown>
): void {
  const previousEnabled = getProviderWatcherEnabled(previousData);
  const nextEnabled = getProviderWatcherEnabled(nextData);
  if (previousEnabled !== nextEnabled) {
    toggleClaudeProviderWatcher(nextEnabled !== false);
  }
}

function clearPendingWriteTimers(): void {
  if (pendingWrite) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }
}

function persistSettingsImmediately(data: Record<string, unknown>): boolean {
  clearPendingWriteTimers();
  syncProviderWatcher(cachedSettings, data);
  cachedSettings = data;
  isDirty = false;
  return atomicWriteSettings(data);
}

function parseSettingsFile(sourcePath: string): unknown {
  return JSON.parse(readFileSync(sourcePath, 'utf-8')) as unknown;
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_READ, async () => {
    return readSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_WRITE, async (_, data: unknown) => {
    try {
      const newData = data as Record<string, unknown>;
      syncProviderWatcher(cachedSettings, newData);

      cachedSettings = newData;
      isDirty = true;

      if (pendingWrite) {
        clearTimeout(pendingWrite);
      }

      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(() => {
          if (cachedSettings !== null) {
            isDirty = false;
            atomicWriteSettings(cachedSettings);
          }
          maxWaitTimer = null;
          pendingWrite = null;
        }, MAX_WAIT_MS);
      }

      pendingWrite = setTimeout(() => {
        if (maxWaitTimer) {
          clearTimeout(maxWaitTimer);
          maxWaitTimer = null;
        }
        if (cachedSettings !== null) {
          isDirty = false;
          atomicWriteSettings(cachedSettings);
        }
        pendingWrite = null;
      }, DEBOUNCE_MS);

      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_PREVIEW, async (_, sourcePath: string) => {
    try {
      const currentData = readSettings();
      const importedData = parseSettingsFile(sourcePath);
      return buildLegacySettingsImportPreview(currentData, importedData, sourcePath);
    } catch {
      return {
        sourcePath,
        importable: false,
        diffCount: 0,
        diffs: [],
        truncated: false,
        error: 'Failed to read the selected settings file.',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_IMPORT_LEGACY_APPLY, async (_, sourcePath: string) => {
    try {
      const currentData = readSettings();
      const importedData = parseSettingsFile(sourcePath);
      const preview = buildLegacySettingsImportPreview(currentData, importedData, sourcePath);
      if (!preview.importable) {
        return {
          imported: false,
          sourcePath,
          diffCount: preview.diffCount,
          error: preview.error,
        };
      }

      const nextData = buildLegacySettingsImportPayload(currentData, importedData);
      if (!nextData) {
        return {
          imported: false,
          sourcePath,
          diffCount: 0,
          error: 'Selected file does not contain persisted EnsoAI settings.',
        };
      }

      const written = persistSettingsImmediately(nextData);
      return written
        ? {
            imported: true,
            sourcePath,
            diffCount: preview.diffCount,
          }
        : {
            imported: false,
            sourcePath,
            diffCount: preview.diffCount,
            error: 'Failed to persist imported settings.',
          };
    } catch {
      return {
        imported: false,
        sourcePath,
        diffCount: 0,
        error: 'Failed to read the selected settings file.',
      };
    }
  });

  app.on('before-quit', () => {
    flushSettings();
  });
}
