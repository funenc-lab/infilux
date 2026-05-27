import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentProviderDiscoveryOptions, AgentProviderProfile } from '@shared/types';
import type { BrowserWindow } from 'electron';
import {
  getRepositoryEnvironmentContext,
  readRepositoryRemoteTextFile,
  writeRepositoryRemoteTextFile,
} from '../remote/RemoteEnvironmentService';
import { createAgentProviderSettingsWatcher } from './AgentProviderSettingsWatcher';
import { resolveWindowsUserHomeFromExecutablePath } from './providerDiscovery';

const GEMINI_PROVIDER_ID = 'gemini-cli' as const;
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const GEMINI_ENV_FILE_NAME = '.env';
const MANAGED_BLOCK_START = '# Infilux managed Agent Provider';
const MANAGED_BLOCK_END = '# End Infilux managed Agent Provider';
const MANAGED_ENV_KEYS = new Set(['GEMINI_API_KEY', 'GOOGLE_GEMINI_BASE_URL', 'GEMINI_MODEL']);

export interface GeminiProviderSettings {
  envPath: string;
  envText: string | null;
}

function getGeminiConfigDir(discoveryOptions?: AgentProviderDiscoveryOptions): string {
  if (process.env.GEMINI_CONFIG_DIR) {
    return process.env.GEMINI_CONFIG_DIR;
  }

  if (process.env.GEMINI_CLI_HOME) {
    return process.env.GEMINI_CLI_HOME;
  }

  const inferredHomeDir = resolveWindowsUserHomeFromExecutablePath(discoveryOptions);
  if (inferredHomeDir) {
    return path.join(inferredHomeDir, '.gemini');
  }

  return path.join(os.homedir(), '.gemini');
}

function getGeminiEnvPath(discoveryOptions?: AgentProviderDiscoveryOptions): string {
  return path.join(getGeminiConfigDir(discoveryOptions), GEMINI_ENV_FILE_NAME);
}

function normalizeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function stripEnvComment(line: string): string {
  let result = '';
  let inDoubleQuotedString = false;
  let inSingleQuotedString = false;
  let escaped = false;

  for (const character of line) {
    if (inDoubleQuotedString) {
      result += character;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inDoubleQuotedString = false;
      }
      continue;
    }

    if (inSingleQuotedString) {
      result += character;
      if (character === "'") {
        inSingleQuotedString = false;
      }
      continue;
    }

    if (character === '"') {
      inDoubleQuotedString = true;
      result += character;
      continue;
    }

    if (character === "'") {
      inSingleQuotedString = true;
      result += character;
      continue;
    }

    if (character === '#') {
      break;
    }

    result += character;
  }

  return result.trim();
}

function parseEnvValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseEnvAssignment(line: string): { key: string; value: string } | null {
  const withoutExport = line.trim().startsWith('export ')
    ? line.trim().slice('export '.length)
    : line.trim();
  const separatorIndex = withoutExport.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = withoutExport.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    return null;
  }

  const parsedValue = parseEnvValue(withoutExport.slice(separatorIndex + 1));
  if (parsedValue === null) {
    return null;
  }

  return { key, value: parsedValue };
}

function parseGeminiEnv(content: string | null | undefined): Record<string, string> {
  const env: Record<string, string> = {};

  for (const rawLine of content?.split(/\r?\n/) ?? []) {
    const line = stripEnvComment(rawLine);
    if (!line) {
      continue;
    }

    const assignment = parseEnvAssignment(line);
    if (!assignment) {
      continue;
    }

    env[assignment.key] = assignment.value;
  }

  return env;
}

export function extractProviderFromGeminiEnv(
  content: string | null | undefined
): Partial<AgentProviderProfile> | null {
  const env = parseGeminiEnv(content);
  const authToken = normalizeValue(env.GEMINI_API_KEY) ?? normalizeValue(env.GOOGLE_API_KEY);
  const baseUrl =
    normalizeValue(env.GOOGLE_GEMINI_BASE_URL) ?? (authToken ? DEFAULT_GEMINI_BASE_URL : undefined);
  const model = normalizeValue(env.GEMINI_MODEL);

  if (!baseUrl) {
    return null;
  }

  return {
    providerId: GEMINI_PROVIDER_ID,
    baseUrl,
    ...(authToken ? { authToken } : {}),
    ...(model ? { model } : {}),
  };
}

function quoteEnvValue(value: string): string {
  return JSON.stringify(value);
}

function parseEnvLineKey(line: string): string | null {
  return parseEnvAssignment(stripEnvComment(line))?.key ?? null;
}

function stripManagedGeminiEnv(content: string | null | undefined, dropModel: boolean): string {
  const nextLines: string[] = [];
  let inManagedBlock = false;

  for (const rawLine of content?.split(/\r?\n/) ?? []) {
    if (rawLine.trim() === MANAGED_BLOCK_START) {
      inManagedBlock = true;
      continue;
    }

    if (rawLine.trim() === MANAGED_BLOCK_END) {
      inManagedBlock = false;
      continue;
    }

    if (inManagedBlock) {
      continue;
    }

    const key = parseEnvLineKey(rawLine);
    if (key && MANAGED_ENV_KEYS.has(key) && (dropModel || key !== 'GEMINI_MODEL')) {
      continue;
    }

    nextLines.push(rawLine);
  }

  return nextLines.join('\n').replace(/\s+$/u, '');
}

function buildManagedGeminiEnvBlock(provider: AgentProviderProfile): string {
  const lines = [
    MANAGED_BLOCK_START,
    `GEMINI_API_KEY=${quoteEnvValue(provider.authToken)}`,
    `GOOGLE_GEMINI_BASE_URL=${quoteEnvValue(provider.baseUrl)}`,
    ...(provider.model ? [`GEMINI_MODEL=${quoteEnvValue(provider.model)}`] : []),
    MANAGED_BLOCK_END,
  ];

  return lines.join('\n');
}

export function applyProviderToGeminiEnv(
  content: string | null | undefined,
  provider: AgentProviderProfile
): string {
  const preservedEnv = stripManagedGeminiEnv(content, Boolean(provider.model));
  const managedBlock = buildManagedGeminiEnvBlock(provider);
  return [preservedEnv, managedBlock].filter((entry) => entry.trim().length > 0).join('\n\n');
}

function readLocalGeminiEnv(discoveryOptions?: AgentProviderDiscoveryOptions): string | null {
  try {
    const envPath = getGeminiEnvPath(discoveryOptions);
    if (!fs.existsSync(envPath)) {
      return null;
    }
    return fs.readFileSync(envPath, 'utf-8');
  } catch (error) {
    console.error('[GeminiProviderManager] Failed to read Gemini env:', error);
    return null;
  }
}

function readLocalGeminiProviderSettings(
  discoveryOptions?: AgentProviderDiscoveryOptions
): GeminiProviderSettings {
  return {
    envPath: getGeminiEnvPath(discoveryOptions),
    envText: readLocalGeminiEnv(discoveryOptions),
  };
}

function writeLocalGeminiEnv(content: string, envPath = getGeminiEnvPath()): boolean {
  try {
    const configDir = path.dirname(envPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(envPath, content, { mode: 0o600 });
    return true;
  } catch (error) {
    console.error('[GeminiProviderManager] Failed to write Gemini env:', error);
    return false;
  }
}

async function resolveGeminiEnvTarget(
  repoPath?: string,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<{
  kind: 'local' | 'remote';
  envPath: string;
}> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'remote') {
    return {
      kind: 'remote',
      envPath: `${context.homeDir}/.gemini/${GEMINI_ENV_FILE_NAME}`,
    };
  }

  return {
    kind: 'local',
    envPath: getGeminiEnvPath(discoveryOptions),
  };
}

async function readGeminiEnvForRepository(
  repoPath?: string,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<GeminiProviderSettings> {
  const target = await resolveGeminiEnvTarget(repoPath, discoveryOptions);
  if (target.kind === 'remote') {
    return {
      envPath: target.envPath,
      envText: await readRepositoryRemoteTextFile(repoPath, target.envPath),
    };
  }

  return {
    envPath: target.envPath,
    envText: readLocalGeminiEnv(discoveryOptions),
  };
}

export async function readGeminiProviderSettings(
  repoPath?: string,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<{
  providerId: typeof GEMINI_PROVIDER_ID;
  settings: GeminiProviderSettings;
  extracted: Partial<AgentProviderProfile> | null;
  supported: true;
}> {
  const settings = await readGeminiEnvForRepository(repoPath, discoveryOptions);
  return {
    providerId: GEMINI_PROVIDER_ID,
    settings,
    extracted: extractProviderFromGeminiEnv(settings.envText),
    supported: true,
  };
}

export async function applyGeminiProvider(
  repoPath: string | undefined,
  provider: AgentProviderProfile,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<boolean> {
  if (provider.providerId !== GEMINI_PROVIDER_ID) {
    return false;
  }

  const settings = await readGeminiEnvForRepository(repoPath, discoveryOptions);
  const nextContent = applyProviderToGeminiEnv(settings.envText, provider);
  const target = await resolveGeminiEnvTarget(repoPath, discoveryOptions);

  if (target.kind === 'remote') {
    return writeRepositoryRemoteTextFile(repoPath, target.envPath, nextContent);
  }

  return writeLocalGeminiEnv(nextContent, target.envPath);
}

const geminiProviderSettingsWatcher = createAgentProviderSettingsWatcher({
  providerId: GEMINI_PROVIDER_ID,
  logPrefix: 'GeminiProviderManager',
  configDir: getGeminiConfigDir,
  fileName: GEMINI_ENV_FILE_NAME,
  readSettings: readLocalGeminiProviderSettings,
  extractProvider: (settings) => extractProviderFromGeminiEnv(settings.envText),
});

export function watchGeminiProviderSettings(window: BrowserWindow): void {
  geminiProviderSettingsWatcher.watch(window);
}

export function unwatchGeminiProviderSettings(): void {
  geminiProviderSettingsWatcher.unwatch();
}
