import { RUNTIME_STATE_DIRNAME } from '../paths';

const TMUX_SOCKET_DIRNAME = 'tmux';
const TMUX_SOCKET_SUFFIX = '.sock';

function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/, '');
}

function normalizeServerName(serverName: string): string {
  const normalized = serverName.trim().replace(/[^A-Za-z0-9._-]/g, '_');
  return normalized.length > 0 ? normalized : 'infilux';
}

export function buildManagedTmuxSocketDirRelativePath(): string {
  return `${RUNTIME_STATE_DIRNAME}/${TMUX_SOCKET_DIRNAME}`;
}

export function buildManagedTmuxSocketDirPath(homeDir: string): string {
  return `${trimTrailingSeparators(homeDir)}/${buildManagedTmuxSocketDirRelativePath()}`;
}

export function buildManagedTmuxSocketFilename(serverName: string): string {
  return `${normalizeServerName(serverName)}${TMUX_SOCKET_SUFFIX}`;
}

export function buildManagedTmuxSocketPath(homeDir: string, serverName: string): string {
  return `${buildManagedTmuxSocketDirPath(homeDir)}/${buildManagedTmuxSocketFilename(serverName)}`;
}

export function buildManagedTmuxSocketShellDir(homeExpression = '$HOME'): string {
  return `${trimTrailingSeparators(homeExpression)}/${buildManagedTmuxSocketDirRelativePath()}`;
}

export function buildManagedTmuxSocketShellPath(
  serverName: string,
  homeExpression = '$HOME'
): string {
  return `${buildManagedTmuxSocketShellDir(homeExpression)}/${buildManagedTmuxSocketFilename(serverName)}`;
}
