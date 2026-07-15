import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSharedRootPath } from '../SharedSessionState';

const SCOPE_MARKER_FILE_NAME = '.infilux-provider-scope-v1';

export interface AppScopedProviderConfigPaths {
  claudeConfigDir: string;
  codexHome: string;
  geminiHome: string;
}

interface InitializeAppScopedProviderConfigOptions {
  configRoot?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

interface ProviderScopeSeed {
  envKey: keyof NodeJS.ProcessEnv;
  files: readonly string[];
  sourceDir: string;
  targetDir: string;
}

function resolveHomeDir(env: NodeJS.ProcessEnv): string {
  return env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
}

function getAppScopedProviderConfigPaths(configRoot: string): AppScopedProviderConfigPaths {
  return {
    claudeConfigDir: path.join(configRoot, 'claude'),
    codexHome: path.join(configRoot, 'codex'),
    geminiHome: path.join(configRoot, 'gemini'),
  };
}

function hasExplicitEnvironmentOverride(
  env: NodeJS.ProcessEnv,
  key: keyof NodeJS.ProcessEnv
): boolean {
  const value = env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function copyMissingProviderFile(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath) || existsSync(targetPath)) {
    return;
  }

  copyFileSync(sourcePath, targetPath);
  chmodSync(targetPath, 0o600);
}

function initializeProviderScope(seed: ProviderScopeSeed): boolean {
  const markerPath = path.join(seed.targetDir, SCOPE_MARKER_FILE_NAME);
  if (existsSync(markerPath)) {
    return true;
  }

  try {
    mkdirSync(seed.targetDir, { recursive: true, mode: 0o700 });
    for (const fileName of seed.files) {
      copyMissingProviderFile(
        path.join(seed.sourceDir, fileName),
        path.join(seed.targetDir, fileName)
      );
    }
    writeFileSync(markerPath, '1\n', { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.warn('[AgentProviderScope] Failed to initialize isolated provider configuration', {
      errorName,
    });
    return false;
  }
}

/**
 * Creates a one-time Infilux-owned copy of local provider settings before assigning
 * process environment overrides inherited by provider discovery and agent sessions.
 */
export function initializeAppScopedProviderConfig(
  options: InitializeAppScopedProviderConfigOptions = {}
): AppScopedProviderConfigPaths {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? resolveHomeDir(env);
  const configRoot = options.configRoot ?? path.join(getSharedRootPath(), 'provider-config');
  const paths = getAppScopedProviderConfigPaths(configRoot);
  const seeds: ProviderScopeSeed[] = [
    {
      envKey: 'CODEX_HOME',
      files: ['auth.json', 'config.toml'],
      sourceDir: path.join(homeDir, '.codex'),
      targetDir: paths.codexHome,
    },
    {
      envKey: 'GEMINI_CLI_HOME',
      files: ['.env', 'google_accounts.json', 'oauth_creds.json', 'settings.json'],
      sourceDir: path.join(homeDir, '.gemini'),
      targetDir: paths.geminiHome,
    },
    {
      envKey: 'CLAUDE_CONFIG_DIR',
      files: ['settings.json'],
      sourceDir: path.join(homeDir, '.claude'),
      targetDir: paths.claudeConfigDir,
    },
  ];

  for (const seed of seeds) {
    if (hasExplicitEnvironmentOverride(env, seed.envKey)) {
      continue;
    }
    if (initializeProviderScope(seed)) {
      env[seed.envKey] = seed.targetDir;
    }
  }

  return paths;
}
