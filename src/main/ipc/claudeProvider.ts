import type { ClaudeProvider } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { type BrowserWindow, ipcMain } from 'electron';
import {
  applyProvider,
  applyProviderToClaudeSettings,
  extractProviderFromClaudeSettings,
  extractProviderFromSettings,
  readClaudeSettings,
  unwatchClaudeSettings,
  watchClaudeSettings,
} from '../services/claude/ClaudeProviderManager';
import {
  readRepositoryClaudeSettings,
  writeRepositoryClaudeSettings,
} from '../services/remote/RemoteEnvironmentService';
import { resolveRepositoryRuntimeContext } from '../services/repository/RepositoryContextResolver';

async function readProviderSettings(repoPath?: string) {
  const context = resolveRepositoryRuntimeContext(repoPath);
  if (context.kind === 'remote') {
    const settings = await readRepositoryClaudeSettings(repoPath);
    const extracted = extractProviderFromClaudeSettings(settings);
    return { settings, extracted };
  }

  const settings = readClaudeSettings();
  const extracted = extractProviderFromSettings();
  return { settings, extracted };
}

async function applyProviderSettings(
  repoPath: string | undefined,
  provider: ClaudeProvider
): Promise<boolean> {
  const context = resolveRepositoryRuntimeContext(repoPath);
  if (context.kind === 'remote') {
    const settings = (await readRepositoryClaudeSettings(repoPath)) ?? {};
    return writeRepositoryClaudeSettings(
      repoPath,
      applyProviderToClaudeSettings(settings, provider)
    );
  }
  return applyProvider(provider);
}

export function registerClaudeProviderHandlers(): void {
  for (const channel of [
    IPC_CHANNELS.AGENT_PROVIDER_READ_SETTINGS,
    IPC_CHANNELS.CLAUDE_PROVIDER_READ_SETTINGS,
  ]) {
    ipcMain.handle(channel, async (_, repoPath?: string) => readProviderSettings(repoPath));
  }

  for (const channel of [IPC_CHANNELS.AGENT_PROVIDER_APPLY, IPC_CHANNELS.CLAUDE_PROVIDER_APPLY]) {
    ipcMain.handle(channel, async (_, repoPath: string | undefined, provider: ClaudeProvider) =>
      applyProviderSettings(repoPath, provider)
    );
  }
}

// Keep a reference to the window for dynamic watcher toggling.
let watcherWindow: BrowserWindow | null = null;

/**
 * Initialize provider watcher (only starts watching if enabled)
 */
export function initClaudeProviderWatcher(window: BrowserWindow, enabled: boolean): void {
  watcherWindow = window;
  if (enabled) {
    watchClaudeSettings(window);
  }
}

/**
 * Toggle provider watcher based on setting change
 */
export function toggleClaudeProviderWatcher(enabled: boolean): void {
  if (enabled && watcherWindow && !watcherWindow.isDestroyed()) {
    watchClaudeSettings(watcherWindow);
  } else {
    unwatchClaudeSettings();
  }
}
