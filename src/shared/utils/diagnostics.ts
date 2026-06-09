import { posix, resolve, win32 } from 'node:path';
import {
  LOG_FILE_PREFIX,
  RUNTIME_STATE_DIRNAME,
  SESSION_STATE_FILENAME,
  SETTINGS_FILENAME,
} from '@shared/paths';

export interface DefaultDiagnosticsPaths {
  sharedRoot: string;
  settingsPath: string;
  sessionPath: string;
  logDirCandidates: string[];
}

function normalizeDiagnosticsPath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function joinDiagnosticsPath(root: string, ...segments: string[]): string {
  const normalizedRoot = normalizeDiagnosticsPath(root).replace(/\/+$/u, '');
  const normalizedSegments = segments
    .map((segment) => normalizeDiagnosticsPath(segment).replace(/^\/+|\/+$/gu, ''))
    .filter((segment) => segment.length > 0);

  return [normalizedRoot, ...normalizedSegments].filter((segment) => segment.length > 0).join('/');
}

function resolveDiagnosticsPath(pathValue: string): string {
  const normalized = normalizeDiagnosticsPath(pathValue);

  if (/^[a-zA-Z]:\//u.test(normalized)) {
    return normalizeDiagnosticsPath(win32.resolve(pathValue));
  }

  if (normalized.startsWith('/')) {
    return posix.resolve(normalized);
  }

  return normalizeDiagnosticsPath(resolve(pathValue));
}

export function buildDefaultDiagnosticsPaths({
  homeDir,
  platform,
  appName,
}: {
  homeDir: string;
  platform: NodeJS.Platform;
  appName: string;
}): DefaultDiagnosticsPaths {
  const sharedRoot = joinDiagnosticsPath(homeDir, RUNTIME_STATE_DIRNAME);
  const settingsPath = joinDiagnosticsPath(sharedRoot, SETTINGS_FILENAME);
  const sessionPath = joinDiagnosticsPath(sharedRoot, SESSION_STATE_FILENAME);

  const logDirCandidates =
    platform === 'darwin'
      ? [
          joinDiagnosticsPath(homeDir, 'Library', 'Logs', appName),
          joinDiagnosticsPath(homeDir, 'Library', 'Logs', appName.toLowerCase()),
          joinDiagnosticsPath(homeDir, '.config', appName, 'logs'),
          joinDiagnosticsPath(homeDir, '.config', appName.toLowerCase(), 'logs'),
        ]
      : platform === 'win32'
        ? [
            joinDiagnosticsPath(homeDir, 'AppData', 'Roaming', appName, 'logs'),
            joinDiagnosticsPath(homeDir, 'AppData', 'Local', appName, 'logs'),
            joinDiagnosticsPath(homeDir, 'AppData', 'Roaming', appName.toLowerCase(), 'logs'),
            joinDiagnosticsPath(homeDir, 'AppData', 'Local', appName.toLowerCase(), 'logs'),
          ]
        : [
            joinDiagnosticsPath(homeDir, '.config', appName, 'logs'),
            joinDiagnosticsPath(homeDir, '.config', appName.toLowerCase(), 'logs'),
            joinDiagnosticsPath(homeDir, '.cache', appName, 'logs'),
            joinDiagnosticsPath(homeDir, '.cache', appName.toLowerCase(), 'logs'),
          ];

  return {
    sharedRoot,
    settingsPath,
    sessionPath,
    logDirCandidates,
  };
}

export function listManagedLogFiles(
  fileNames: string[],
  prefix: string = LOG_FILE_PREFIX
): string[] {
  return fileNames
    .filter((fileName) => fileName.startsWith(prefix) && fileName.endsWith('.log'))
    .sort((left, right) => right.localeCompare(left));
}

export function selectDiagnosticsLogFiles(
  fileNames: string[],
  prefix: string = LOG_FILE_PREFIX
): string[] {
  const managedLogFiles = listManagedLogFiles(fileNames, prefix);
  if (managedLogFiles.length > 0) {
    return managedLogFiles;
  }

  const fallbackLogFiles = fileNames
    .filter((fileName) => fileName === 'main.log')
    .sort((left, right) => right.localeCompare(left));

  return fallbackLogFiles;
}

export function formatDiagnosticsDirectoryName(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `diagnostics-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

const SENSITIVE_VALUE_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /(\bAuthorization\s*:\s*Bearer\s+)([^\s'"]+)/giu,
    replacement: '$1[REDACTED]',
  },
  {
    pattern:
      /("(?:(?:accessToken|refreshToken|idToken|apiKey|token|secret|password|passwd|pwd)|(?:access_token|refresh_token|id_token|api_key|x-api-key))"\s*:\s*)"([^"]*)"/giu,
    replacement: '$1"[REDACTED]"',
  },
  {
    pattern:
      /([?&](?:access[_-]?token|accessToken|refresh[_-]?token|refreshToken|id[_-]?token|idToken|api[_-]?key|apiKey|x-api-key|token|secret|password|passwd|pwd)=)([^&\s]+)/giu,
    replacement: '$1[REDACTED]',
  },
  {
    pattern:
      /(\b(?:access[_-]?token|accessToken|refresh[_-]?token|refreshToken|id[_-]?token|idToken|api[_-]?key|apiKey|x-api-key|apikey|token|secret|password|passwd|pwd)\b\s*[:=]\s*)(["']?)([^"'\s,;}\]]+)(\2)/giu,
    replacement: '$1$2[REDACTED]$4',
  },
];

export function sanitizeDiagnosticsText(text: string): string {
  return SENSITIVE_VALUE_PATTERNS.reduce(
    (currentText, { pattern, replacement }) => currentText.replace(pattern, replacement),
    text
  );
}

export function sanitizeDiagnosticsLines(lines: string[]): string[] {
  return lines.map((line) => sanitizeDiagnosticsText(line));
}

export function formatDiagnosticsArchivePath(outputDir: string, overridePath?: string): string {
  if (overridePath) {
    return resolveDiagnosticsPath(overridePath);
  }

  return `${resolveDiagnosticsPath(outputDir)}.tar.gz`;
}
