import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ClaudeProvider, ClaudeSettings } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import type { BrowserWindow } from 'electron';

function getClaudeConfigDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR;
  }
  return path.join(os.homedir(), '.claude');
}

function getClaudeSettingsPath(): string {
  return path.join(getClaudeConfigDir(), 'settings.json');
}

let settingsWatcher: fs.FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let maxWaitTimer: NodeJS.Timeout | null = null;
let lastProviderSnapshot: string | null = null; // Previous provider config snapshot.
let lastMtimeMs: number | null = null; // Last file modification time.
let lastFileSize: number | null = null; // Last file size.

/**
 * Compare whether the provider config has changed.
 */
function hasProviderChanged(extracted: Partial<ClaudeProvider> | null): boolean {
  const currentSnapshot = JSON.stringify(extracted);
  if (currentSnapshot === lastProviderSnapshot) {
    return false;
  }
  lastProviderSnapshot = currentSnapshot;
  return true;
}

function notifyProviderSettingsChanged(
  window: BrowserWindow,
  payload: {
    settings: ClaudeSettings | null;
    extracted: Partial<ClaudeProvider> | null;
  }
): void {
  window.webContents.send(IPC_CHANNELS.AGENT_PROVIDER_SETTINGS_CHANGED, payload);
  window.webContents.send(IPC_CHANNELS.CLAUDE_PROVIDER_SETTINGS_CHANGED, payload);
}

/**
 * Watch ~/.claude/settings.json for changes.
 */
export function watchClaudeSettings(window: BrowserWindow): void {
  // Avoid duplicate watchers.
  if (settingsWatcher) {
    settingsWatcher.close();
  }

  const settingsPath = getClaudeSettingsPath();
  const configDir = getClaudeConfigDir();

  // Ensure the directory exists before watching it.
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    } catch (err) {
      console.error('[ClaudeProviderManager] Failed to create config dir for watching:', err);
      return;
    }
  }

  // Initialize the snapshot.
  lastProviderSnapshot = JSON.stringify(extractProviderFromSettings());

  // Watch the directory because many editors replace the settings file on save.
  try {
    settingsWatcher = fs.watch(configDir, (eventType, filename) => {
      // filename can be null on some platforms.
      if (filename && filename === 'settings.json') {
        console.log(`[ClaudeProviderManager] Detected ${filename} change (${eventType})`);

        const processChange = () => {
          // Clear pending timers.
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          if (maxWaitTimer) {
            clearTimeout(maxWaitTimer);
            maxWaitTimer = null;
          }

          // Skip notifications after the window is destroyed.
          if (window.isDestroyed()) {
            console.log('[ClaudeProviderManager] Window destroyed, skipping notification');
            return;
          }

          // Avoid unnecessary reads when file metadata did not change.
          try {
            if (fs.existsSync(settingsPath)) {
              const stats = fs.statSync(settingsPath);
              const currentMtime = stats.mtimeMs;
              const currentSize = stats.size;

              if (
                lastMtimeMs !== null &&
                lastFileSize !== null &&
                currentMtime === lastMtimeMs &&
                currentSize === lastFileSize
              ) {
                console.log('[ClaudeProviderManager] File metadata unchanged, skipping read');
                return;
              }

              lastMtimeMs = currentMtime;
              lastFileSize = currentSize;
            }
          } catch (err) {
            console.warn('[ClaudeProviderManager] Failed to check file stats:', err);
          }

          // Read the updated settings.
          try {
            const settings = readClaudeSettings();
            const extracted = extractProviderFromSettings();

            if (hasProviderChanged(extracted)) {
              console.log('[ClaudeProviderManager] Provider config changed, notifying frontend');
              notifyProviderSettingsChanged(window, {
                settings,
                extracted,
              });
            } else {
              console.log(
                '[ClaudeProviderManager] Provider config unchanged, skipping notification'
              );
            }
          } catch (err) {
            console.warn('[ClaudeProviderManager] Failed to read settings after change:', err);
          }
        };

        // Debounce bursts of filesystem events.
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // Start a max-wait timer when no one is running.
        if (!maxWaitTimer) {
          maxWaitTimer = setTimeout(() => {
            processChange();
          }, 2000); // Wait up to 2 seconds.
        }

        debounceTimer = setTimeout(() => {
          processChange();
        }, 400); // 400ms debounce delay.
      }
    });

    // Listen for watcher errors.
    settingsWatcher.on('error', (err) => {
      console.error('[ClaudeProviderManager] Watcher error:', err);
    });

    console.log(`[ClaudeProviderManager] Started watching ${settingsPath}`);
  } catch (err) {
    console.error('[ClaudeProviderManager] Failed to start watcher:', err);
  }
}

/**
 * Stop watching settings changes.
 */
export function unwatchClaudeSettings(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (maxWaitTimer) {
    clearTimeout(maxWaitTimer);
    maxWaitTimer = null;
  }
  if (settingsWatcher) {
    settingsWatcher.close();
    settingsWatcher = null;
  }
  lastProviderSnapshot = null;
  lastMtimeMs = null;
  lastFileSize = null;
}

/**
 * Read ~/.claude/settings.json.
 */
export function readClaudeSettings(): ClaudeSettings | null {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }
    const content = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content) as ClaudeSettings;
  } catch (error) {
    console.error('[ClaudeProviderManager] Failed to read settings:', error);
    return null;
  }
}

/**
 * Extract provider-related fields from the current settings.json.
 * Used for profile matching and saving the current config as a profile.
 * Model shortcut fields are intentionally skipped because users can change
 * them temporarily during normal CLI usage.
 */
export function extractProviderFromSettings(): Partial<ClaudeProvider> | null {
  const settings = readClaudeSettings();
  return extractProviderFromClaudeSettings(settings);
}

export function extractProviderFromClaudeSettings(
  settings: ClaudeSettings | null | undefined
): Partial<ClaudeProvider> | null {
  if (!settings?.env?.ANTHROPIC_BASE_URL) {
    return null;
  }

  return {
    baseUrl: settings.env.ANTHROPIC_BASE_URL,
    authToken: settings.env.ANTHROPIC_AUTH_TOKEN,
    defaultSonnetModel: settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    defaultOpusModel: settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    defaultHaikuModel: settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  };
}

/**
 * Apply provider config to ~/.claude/settings.json.
 * Only provider-related fields are updated; other settings are preserved.
 */
export function applyProvider(provider: ClaudeProvider): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();
    let settings: ClaudeSettings = {};

    // Read existing settings.
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    settings = applyProviderToClaudeSettings(settings, provider);

    // Ensure the config directory exists.
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // Write updated settings.
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log(`[ClaudeProviderManager] Applied provider: ${provider.name}`);
    return true;
  } catch (error) {
    console.error('[ClaudeProviderManager] Failed to apply provider:', error);
    return false;
  }
}

export function applyProviderToClaudeSettings(
  settings: ClaudeSettings,
  provider: ClaudeProvider
): ClaudeSettings {
  const nextSettings: ClaudeSettings = { ...settings };
  const existingEnv = { ...(nextSettings.env ?? {}) };

  delete existingEnv.ANTHROPIC_BASE_URL;
  delete existingEnv.ANTHROPIC_AUTH_TOKEN;
  delete existingEnv.ANTHROPIC_SMALL_FAST_MODEL;
  delete existingEnv.ANTHROPIC_DEFAULT_SONNET_MODEL;
  delete existingEnv.ANTHROPIC_DEFAULT_OPUS_MODEL;
  delete existingEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL;

  const providerEnv: Record<string, string> = {
    ANTHROPIC_BASE_URL: provider.baseUrl,
    ANTHROPIC_AUTH_TOKEN: provider.authToken,
  };

  if (provider.smallFastModel) {
    providerEnv.ANTHROPIC_SMALL_FAST_MODEL = provider.smallFastModel;
  }
  if (provider.defaultSonnetModel) {
    providerEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = provider.defaultSonnetModel;
  }
  if (provider.defaultOpusModel) {
    providerEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = provider.defaultOpusModel;
  }
  if (provider.defaultHaikuModel) {
    providerEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.defaultHaikuModel;
  }

  nextSettings.env = { ...existingEnv, ...providerEnv };

  if (provider.model) {
    nextSettings.model = provider.model;
  } else {
    delete nextSettings.model;
  }

  return nextSettings;
}
