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

const CODEX_PROVIDER_ID = 'codex-cli' as const;
const MANAGED_CODEX_PROVIDER_ID = 'infilux_provider';
const MANAGED_CODEX_ENV_KEY = 'INFILUX_CODEX_API_KEY';

export interface CodexProviderSettings {
  configPath: string;
  configToml: string | null;
}

interface ParsedCodexProviderConfig {
  root: Record<string, string>;
  modelProviders: Record<string, Record<string, string>>;
}

function getCodexConfigDir(discoveryOptions?: AgentProviderDiscoveryOptions): string {
  return path.dirname(resolveLocalCodexConfigPath(discoveryOptions));
}

function getCodexConfigPath(discoveryOptions?: AgentProviderDiscoveryOptions): string {
  return resolveLocalCodexConfigPath(discoveryOptions);
}

function getLegacyCodexConfigPath(): string {
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function getCodexHomeConfigPath(): string | null {
  const codexHomeDir = process.env.CODEX_HOME?.trim();
  if (!codexHomeDir) {
    return null;
  }

  return path.join(codexHomeDir, 'config.toml');
}

function getWindowsAppDataCodexConfigPaths(): string[] {
  if (process.platform !== 'win32') {
    return [];
  }

  const appDataDir = process.env.APPDATA?.trim();
  if (!appDataDir) {
    return [];
  }

  return [
    path.join(appDataDir, 'Codex', 'config.toml'),
    path.join(appDataDir, 'codex', 'config.toml'),
  ];
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of paths) {
    const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function getInferredWindowsHomeCodexConfigPath(
  discoveryOptions?: AgentProviderDiscoveryOptions
): string | null {
  const inferredHomeDir = resolveWindowsUserHomeFromExecutablePath(discoveryOptions);
  if (!inferredHomeDir) {
    return null;
  }

  return path.join(inferredHomeDir, '.codex', 'config.toml');
}

function getCodexConfigPathCandidates(discoveryOptions?: AgentProviderDiscoveryOptions): string[] {
  if (process.env.CODEX_CONFIG_DIR) {
    return [path.join(process.env.CODEX_CONFIG_DIR, 'config.toml')];
  }

  return uniquePaths(
    [
      getCodexHomeConfigPath(),
      ...getWindowsAppDataCodexConfigPaths(),
      getInferredWindowsHomeCodexConfigPath(discoveryOptions),
      getLegacyCodexConfigPath(),
    ].filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
    )
  );
}

function resolveLocalCodexConfigPath(discoveryOptions?: AgentProviderDiscoveryOptions): string {
  const candidates = getCodexConfigPathCandidates(discoveryOptions);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function stripTomlComment(line: string): string {
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

function parseTomlString(value: string): string | null {
  const trimmed = value.trim();
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

  return trimmed.length > 0 ? trimmed : null;
}

function parseTomlHeader(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  return trimmed
    .slice(1, -1)
    .split('.')
    .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function parseTomlAssignment(line: string): { key: string; value: string } | null {
  const separatorIndex = line.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = line
    .slice(0, separatorIndex)
    .trim()
    .replace(/^["']|["']$/g, '');
  const parsedValue = parseTomlString(line.slice(separatorIndex + 1));
  if (!key || parsedValue === null) {
    return null;
  }

  return { key, value: parsedValue };
}

function parseCodexProviderConfig(content: string | null | undefined): ParsedCodexProviderConfig {
  const root: Record<string, string> = {};
  const modelProviders: Record<string, Record<string, string>> = {};
  let activeSection: { kind: 'root' } | { kind: 'model-provider'; id: string } | { kind: 'other' } =
    {
      kind: 'root',
    };

  for (const rawLine of content?.split(/\r?\n/) ?? []) {
    const line = stripTomlComment(rawLine);
    if (!line) {
      continue;
    }

    const header = parseTomlHeader(line);
    if (header) {
      activeSection =
        header[0] === 'model_providers' && header[1]
          ? { kind: 'model-provider', id: header[1] }
          : { kind: 'other' };
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (!assignment) {
      continue;
    }

    if (activeSection.kind === 'root') {
      root[assignment.key] = assignment.value;
      continue;
    }

    if (activeSection.kind === 'model-provider') {
      const provider = modelProviders[activeSection.id] ?? {};
      provider[assignment.key] = assignment.value;
      modelProviders[activeSection.id] = provider;
    }
  }

  return { root, modelProviders };
}

function normalizeValue(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function extractProviderFromCodexConfig(
  content: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): Partial<AgentProviderProfile> | null {
  const parsed = parseCodexProviderConfig(content);
  const modelProviderId = normalizeValue(parsed.root.model_provider);
  const providerConfig = modelProviderId ? parsed.modelProviders[modelProviderId] : undefined;
  const baseUrl =
    normalizeValue(providerConfig?.base_url) ?? normalizeValue(parsed.root.openai_base_url);

  if (!baseUrl) {
    return null;
  }

  const envKey = normalizeValue(providerConfig?.env_key);
  const envToken = envKey ? normalizeValue(env[envKey]) : undefined;
  const openAiToken =
    modelProviderId === 'openai' || !modelProviderId
      ? normalizeValue(env.OPENAI_API_KEY)
      : undefined;
  const authToken =
    normalizeValue(providerConfig?.experimental_bearer_token) ?? envToken ?? openAiToken;
  const model = normalizeValue(parsed.root.model);

  return {
    providerId: CODEX_PROVIDER_ID,
    baseUrl,
    ...(authToken ? { authToken } : {}),
    ...(model ? { model } : {}),
  };
}

function quoteTomlString(value: string): string {
  return JSON.stringify(value);
}

function parseTopLevelKey(line: string): string | null {
  const assignment = parseTomlAssignment(stripTomlComment(line));
  return assignment?.key ?? null;
}

function shouldDropManagedCodexLine(
  line: string,
  section: 'root' | 'managed' | 'other',
  dropModel: boolean
): boolean {
  if (section === 'managed') {
    return true;
  }

  if (section !== 'root') {
    return false;
  }

  const key = parseTopLevelKey(line);
  return (
    key === 'model_provider' ||
    key === 'openai_base_url' ||
    key === MANAGED_CODEX_ENV_KEY ||
    (dropModel && key === 'model')
  );
}

function stripManagedCodexConfig(content: string | null | undefined, dropModel: boolean): string {
  const lines = content?.split(/\r?\n/) ?? [];
  const nextLines: string[] = [];
  let activeSection: 'root' | 'managed' | 'other' = 'root';

  for (const rawLine of lines) {
    const header = parseTomlHeader(stripTomlComment(rawLine));
    if (header) {
      activeSection =
        header[0] === 'model_providers' && header[1] === MANAGED_CODEX_PROVIDER_ID
          ? 'managed'
          : 'other';
      if (activeSection === 'managed') {
        continue;
      }
    }

    if (shouldDropManagedCodexLine(rawLine, activeSection, dropModel)) {
      continue;
    }

    nextLines.push(rawLine);
  }

  return nextLines.join('\n').replace(/\s+$/u, '');
}

function buildManagedCodexProviderBlock(provider: AgentProviderProfile): string {
  const lines = [
    `model_provider = ${quoteTomlString(MANAGED_CODEX_PROVIDER_ID)}`,
    ...(provider.model ? [`model = ${quoteTomlString(provider.model)}`] : []),
    '',
    `[model_providers.${MANAGED_CODEX_PROVIDER_ID}]`,
    `name = ${quoteTomlString(provider.name)}`,
    `base_url = ${quoteTomlString(provider.baseUrl)}`,
    `env_key = ${quoteTomlString(MANAGED_CODEX_ENV_KEY)}`,
    `experimental_bearer_token = ${quoteTomlString(provider.authToken)}`,
    'wire_api = "responses"',
  ];

  return lines.join('\n');
}

export function applyProviderToCodexConfig(
  content: string | null | undefined,
  provider: AgentProviderProfile
): string {
  const preservedConfig = stripManagedCodexConfig(content, Boolean(provider.model));
  const managedBlock = buildManagedCodexProviderBlock(provider);
  return [preservedConfig, managedBlock].filter((entry) => entry.trim().length > 0).join('\n\n');
}

function readLocalCodexConfigAtPath(configPath: string): string | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    return fs.readFileSync(configPath, 'utf-8');
  } catch (error) {
    console.error('[CodexProviderManager] Failed to read Codex config:', error);
    return null;
  }
}

function readLocalCodexProviderSettings(
  discoveryOptions?: AgentProviderDiscoveryOptions
): CodexProviderSettings {
  const configPath = getCodexConfigPath(discoveryOptions);
  return {
    configPath,
    configToml: readLocalCodexConfigAtPath(configPath),
  };
}

function writeLocalCodexConfig(content: string, configPath = getCodexConfigPath()): boolean {
  try {
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(configPath, content, { mode: 0o600 });
    return true;
  } catch (error) {
    console.error('[CodexProviderManager] Failed to write Codex config:', error);
    return false;
  }
}

async function resolveCodexConfigTarget(
  repoPath?: string,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<{
  kind: 'local' | 'remote';
  configPath: string;
}> {
  const context = await getRepositoryEnvironmentContext(repoPath);
  if (context.kind === 'remote') {
    return {
      kind: 'remote',
      configPath: `${context.homeDir}/.codex/config.toml`,
    };
  }

  return {
    kind: 'local',
    configPath: getCodexConfigPath(discoveryOptions),
  };
}

async function readCodexConfigForRepository(
  repoPath?: string,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<CodexProviderSettings> {
  const target = await resolveCodexConfigTarget(repoPath, discoveryOptions);
  if (target.kind === 'remote') {
    return {
      configPath: target.configPath,
      configToml: await readRepositoryRemoteTextFile(repoPath, target.configPath),
    };
  }

  return {
    configPath: target.configPath,
    configToml: readLocalCodexConfigAtPath(target.configPath),
  };
}

export async function readCodexProviderSettings(
  repoPath?: string,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<{
  providerId: typeof CODEX_PROVIDER_ID;
  settings: CodexProviderSettings;
  extracted: Partial<AgentProviderProfile> | null;
  supported: true;
}> {
  const settings = await readCodexConfigForRepository(repoPath, discoveryOptions);
  return {
    providerId: CODEX_PROVIDER_ID,
    settings,
    extracted: extractProviderFromCodexConfig(settings.configToml),
    supported: true,
  };
}

export async function applyCodexProvider(
  repoPath: string | undefined,
  provider: AgentProviderProfile,
  discoveryOptions?: AgentProviderDiscoveryOptions
): Promise<boolean> {
  if (provider.providerId !== CODEX_PROVIDER_ID) {
    return false;
  }

  const settings = await readCodexConfigForRepository(repoPath, discoveryOptions);
  const nextContent = applyProviderToCodexConfig(settings.configToml, provider);
  const target = await resolveCodexConfigTarget(repoPath, discoveryOptions);

  if (target.kind === 'remote') {
    return writeRepositoryRemoteTextFile(repoPath, target.configPath, nextContent);
  }

  return writeLocalCodexConfig(nextContent, target.configPath);
}

const codexProviderSettingsWatcher = createAgentProviderSettingsWatcher({
  providerId: CODEX_PROVIDER_ID,
  logPrefix: 'CodexProviderManager',
  configDir: getCodexConfigDir,
  fileName: 'config.toml',
  readSettings: readLocalCodexProviderSettings,
  extractProvider: (settings) => extractProviderFromCodexConfig(settings.configToml),
});

export function watchCodexProviderSettings(window: BrowserWindow): void {
  codexProviderSettingsWatcher.watch(window);
}

export function unwatchCodexProviderSettings(): void {
  codexProviderSettingsWatcher.unwatch();
}
