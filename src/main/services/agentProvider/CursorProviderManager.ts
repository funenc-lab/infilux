import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentProviderProfile } from '@shared/types';
import type { BrowserWindow } from 'electron';
import {
  getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile,
} from '../remote/RemoteEnvironmentService';
import { createAgentProviderSettingsWatcher } from './AgentProviderSettingsWatcher';

const CURSOR_PROVIDER_ID = 'cursor-cli' as const;
const CURSOR_CONFIG_FILE_NAME = 'cli-config.json';

export interface CursorProviderSettings {
  configPath: string;
  configJson: string | null;
}

type ParsedCursorProviderConfig = Record<string, unknown>;

function getCursorConfigDir(): string {
  if (process.env.CURSOR_CONFIG_DIR) {
    return process.env.CURSOR_CONFIG_DIR;
  }
  return path.join(os.homedir(), '.cursor');
}

function getCursorConfigPath(): string {
  return path.join(getCursorConfigDir(), CURSOR_CONFIG_FILE_NAME);
}

function normalizeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseCursorProviderConfig(
  content: string | null | undefined
): ParsedCursorProviderConfig | null {
  if (!content?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as ParsedCursorProviderConfig;
  } catch {
    return null;
  }
}

export function extractProviderFromCursorConfig(
  content: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): Partial<AgentProviderProfile> | null {
  const parsed = parseCursorProviderConfig(content);
  if (!parsed) {
    return null;
  }

  const model = normalizeValue(typeof parsed.model === 'string' ? parsed.model : undefined);
  const authToken = normalizeValue(env.CURSOR_API_KEY);

  return {
    providerId: CURSOR_PROVIDER_ID,
    ...(authToken ? { authToken } : {}),
    ...(model ? { model } : {}),
  };
}

function readLocalCursorConfig(): string | null {
  try {
    const configPath = getCursorConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }
    return fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    console.error('[CursorProviderManager] Failed to read Cursor config:', error);
    return null;
  }
}

function readLocalCursorProviderSettings(): CursorProviderSettings {
  return {
    configPath: getCursorConfigPath(),
    configJson: readLocalCursorConfig(),
  };
}

async function resolveCursorConfigTarget(repoPath?: string): Promise<{
  kind: 'local' | 'remote';
  configPath: string;
}> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'remote') {
    return {
      kind: 'remote',
      configPath: `${context.homeDir}/.cursor/${CURSOR_CONFIG_FILE_NAME}`,
    };
  }

  return {
    kind: 'local',
    configPath: getCursorConfigPath(),
  };
}

async function readCursorConfigForRepository(repoPath?: string): Promise<CursorProviderSettings> {
  const target = await resolveCursorConfigTarget(repoPath);
  if (target.kind === 'remote') {
    return {
      configPath: target.configPath,
      configJson: await readRepositoryRemoteTextFile(repoPath, target.configPath),
    };
  }

  return {
    configPath: target.configPath,
    configJson: readLocalCursorConfig(),
  };
}

function hasCursorProviderConfig(content: string | null | undefined): boolean {
  return parseCursorProviderConfig(content) !== null;
}

export async function readCursorProviderSettings(repoPath?: string): Promise<{
  providerId: typeof CURSOR_PROVIDER_ID;
  settings: CursorProviderSettings;
  extracted: Partial<AgentProviderProfile> | null;
  detected: boolean;
  supported: true;
}> {
  const settings = await readCursorConfigForRepository(repoPath);
  return {
    providerId: CURSOR_PROVIDER_ID,
    settings,
    extracted: extractProviderFromCursorConfig(settings.configJson),
    detected: hasCursorProviderConfig(settings.configJson),
    supported: true,
  };
}

const cursorProviderSettingsWatcher = createAgentProviderSettingsWatcher({
  providerId: CURSOR_PROVIDER_ID,
  logPrefix: 'CursorProviderManager',
  configDir: getCursorConfigDir,
  fileName: CURSOR_CONFIG_FILE_NAME,
  readSettings: readLocalCursorProviderSettings,
  extractProvider: (settings) => extractProviderFromCursorConfig(settings.configJson),
  isDetected: (settings) => hasCursorProviderConfig(settings.configJson),
});

export function watchCursorProviderSettings(window: BrowserWindow): void {
  cursorProviderSettingsWatcher.watch(window);
}

export function unwatchCursorProviderSettings(): void {
  cursorProviderSettingsWatcher.unwatch();
}
