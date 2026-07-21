import os from 'node:os';
import path from 'node:path';

export interface ResolveCodexHomeOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

function resolveHomeDir(options: ResolveCodexHomeOptions): string {
  const env = options.env ?? process.env;
  return options.homeDir ?? env.HOME?.trim() ?? env.USERPROFILE?.trim() ?? os.homedir();
}

export function resolveUserCodexHome(options: ResolveCodexHomeOptions = {}): string {
  return path.join(resolveHomeDir(options), '.codex');
}

export function resolveSourceCodexHome(options: ResolveCodexHomeOptions = {}): string {
  const env = options.env ?? process.env;
  const codexHome = env.CODEX_HOME?.trim();
  return codexHome || resolveUserCodexHome(options);
}

export function resolveCodexSessionsDir(options: ResolveCodexHomeOptions = {}): string {
  return path.join(resolveSourceCodexHome(options), 'sessions');
}
