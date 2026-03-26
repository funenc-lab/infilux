import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, win32 } from 'node:path';
import {
  LEGACY_RUNTIME_STATE_DIRNAME,
  SESSION_STATE_FILENAME,
  SETTINGS_FILENAME,
} from '@shared/paths';
import type { LegacySettingsImportPreview } from '@shared/types';

const SETTINGS_SLICE_KEY = 'enso-settings';
const MAX_PREVIEW_DIFFS = 50;

type PersistedSettingsDocument = Record<string, unknown>;
type PersistedSettingsSlice = Record<string, unknown> & {
  state?: Record<string, unknown>;
};

interface LegacySettingsImportDiscoveryOptions {
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  fileExists?: (candidatePath: string) => boolean;
}

interface LegacyElectronLocalStorageReadOptions {
  listDirectories?: (targetPath: string) => string[];
  readBinaryFile?: (targetPath: string) => Buffer;
}

type LegacyLocalStorageValueKind = 'json' | 'string' | 'boolean' | 'number';

const LEGACY_ELECTRON_LOCAL_STORAGE_KEYS: Array<{
  key: string;
  kind: LegacyLocalStorageValueKind;
}> = [
  { key: 'enso-repositories', kind: 'json' },
  { key: 'enso-selected-repo', kind: 'string' },
  { key: 'enso-repository-groups', kind: 'json' },
  { key: 'enso-active-group', kind: 'string' },
  { key: 'enso-active-worktrees', kind: 'json' },
  { key: 'enso-worktree-tabs', kind: 'json' },
  { key: 'enso-worktree-order', kind: 'json' },
  { key: 'enso-repository-settings', kind: 'json' },
  { key: 'enso-repository-width', kind: 'number' },
  { key: 'enso-worktree-width', kind: 'number' },
  { key: 'enso-file-sidebar-width', kind: 'number' },
  { key: 'enso-tree-sidebar-width', kind: 'number' },
  { key: 'enso-repository-collapsed', kind: 'boolean' },
  { key: 'enso-worktree-collapsed', kind: 'boolean' },
  { key: 'enso-file-sidebar-collapsed', kind: 'boolean' },
  { key: 'enso-tab-order', kind: 'json' },
  { key: 'enso-group-collapsed-state', kind: 'json' },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildLegacySettingsPath(rootPath: string): string {
  const useWindowsPath = rootPath.includes('\\') || /^[A-Za-z]:/.test(rootPath);
  return useWindowsPath
    ? win32.join(rootPath, LEGACY_RUNTIME_STATE_DIRNAME, SETTINGS_FILENAME)
    : join(rootPath, LEGACY_RUNTIME_STATE_DIRNAME, SETTINGS_FILENAME);
}

function appendCandidate(candidates: string[], rootPath: string | undefined): void {
  const trimmedRoot = rootPath?.trim();
  if (!trimmedRoot) {
    return;
  }

  const candidatePath = buildLegacySettingsPath(trimmedRoot);
  if (!candidates.includes(candidatePath)) {
    candidates.push(candidatePath);
  }
}

function extractSettingsSlice(document: unknown): PersistedSettingsSlice | null {
  if (!isPlainObject(document)) {
    return null;
  }

  const slice = document[SETTINGS_SLICE_KEY];
  if (!isPlainObject(slice)) {
    return null;
  }

  const state = slice.state;
  if (!isPlainObject(state)) {
    return null;
  }

  return slice as PersistedSettingsSlice;
}

function extractLocalStorageSnapshot(document: unknown): Record<string, string> | null {
  if (!isPlainObject(document)) {
    return null;
  }

  const snapshot = document.localStorage;
  if (!isPlainObject(snapshot)) {
    return null;
  }

  const nextSnapshot: Record<string, string> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === 'string') {
      nextSnapshot[key] = value;
    }
  }

  if (Object.keys(nextSnapshot).length === 0) {
    return null;
  }

  return nextSnapshot;
}

export function getLegacySettingsImportCandidatePaths(
  options: LegacySettingsImportDiscoveryOptions = {}
): string[] {
  const candidates: string[] = [];
  const env = options.env ?? {};

  appendCandidate(candidates, options.homeDir);
  appendCandidate(candidates, env.HOME);
  appendCandidate(candidates, env.USERPROFILE);

  if (env.HOMEDRIVE && env.HOMEPATH) {
    appendCandidate(candidates, `${env.HOMEDRIVE}${env.HOMEPATH}`);
  }

  return candidates;
}

export function findLegacySettingsImportSourcePath(
  options: LegacySettingsImportDiscoveryOptions = {}
): string | null {
  const fileExists = options.fileExists ?? existsSync;
  for (const candidatePath of getLegacySettingsImportCandidatePaths(options)) {
    if (fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

export function readLegacyImportLocalStorageSnapshot(
  sourcePath: string,
  readTextFile: (candidatePath: string) => string = (candidatePath) =>
    readFileSync(candidatePath, 'utf-8')
): Record<string, string> | null {
  const sessionStatePath = join(dirname(sourcePath), SESSION_STATE_FILENAME);

  try {
    const sessionDocument = JSON.parse(readTextFile(sessionStatePath)) as unknown;
    return extractLocalStorageSnapshot(sessionDocument);
  } catch {
    return null;
  }
}

function deriveLegacyHomeDir(sourcePath: string): string {
  const runtimeStateDir = dirname(sourcePath);
  return dirname(runtimeStateDir);
}

function parseJsonValueFromBuffer(buffer: Buffer, start: number): string | null {
  const stack: number[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < buffer.length; index += 1) {
    const byte = buffer[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (byte === 0x5c) {
        escaped = true;
      } else if (byte === 0x22) {
        inString = false;
      }
      continue;
    }

    if (byte === 0x22) {
      inString = true;
      continue;
    }

    if (byte === 0x5b || byte === 0x7b) {
      stack.push(byte);
      continue;
    }

    if (byte === 0x5d || byte === 0x7d) {
      const opener = stack.at(-1);
      const closesArray = opener === 0x5b && byte === 0x5d;
      const closesObject = opener === 0x7b && byte === 0x7d;
      if (!closesArray && !closesObject) {
        return null;
      }
      stack.pop();
      if (stack.length === 0) {
        return buffer.toString('utf8', start, index + 1);
      }
    }
  }

  return null;
}

function parseAsciiTokenFromBuffer(
  buffer: Buffer,
  start: number,
  predicate: (value: string) => boolean
): string | null {
  let end = start;
  while (end < buffer.length) {
    const byte = buffer[end];
    if (byte < 0x20 || byte > 0x7e) {
      break;
    }
    end += 1;
  }

  if (end === start) {
    return null;
  }

  const value = buffer.toString('utf8', start, end);
  return predicate(value) ? value : null;
}

function parseLegacyLocalStorageValue(
  buffer: Buffer,
  keyIndex: number,
  kind: LegacyLocalStorageValueKind
): string | null {
  const scanLimit = Math.min(buffer.length, keyIndex + 512);

  for (let index = keyIndex; index < scanLimit; index += 1) {
    const byte = buffer[index];

    if (kind === 'json' && (byte === 0x5b || byte === 0x7b)) {
      return parseJsonValueFromBuffer(buffer, index);
    }

    if (kind === 'string' && (byte === 0x2f || byte === 0x5f || byte === 0x61)) {
      return parseAsciiTokenFromBuffer(buffer, index, (value) => value.length > 0);
    }

    if (kind === 'boolean' && (byte === 0x74 || byte === 0x66)) {
      return parseAsciiTokenFromBuffer(
        buffer,
        index,
        (value) => value === 'true' || value === 'false'
      );
    }

    if (kind === 'number' && byte >= 0x30 && byte <= 0x39) {
      return parseAsciiTokenFromBuffer(buffer, index, (value) => /^[0-9]+$/.test(value));
    }
  }

  return null;
}

function isLikelyRepositoryRootPath(value: string): boolean {
  if (
    !value ||
    value === '__enso_temp_workspace__' ||
    value.includes('/.worktrees/') ||
    value.includes('\\.worktrees\\') ||
    value.includes('/ensoai/temporary/') ||
    value.includes('\\ensoai\\temporary\\') ||
    value.includes('/ensoai/workspaces/') ||
    value.includes('\\ensoai\\workspaces\\')
  ) {
    return false;
  }

  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function deriveLegacyRepositoriesFromSnapshot(snapshot: Record<string, string>): string | null {
  const candidatePaths = new Set<string>();

  const selectedRepo = snapshot['enso-selected-repo'];
  if (typeof selectedRepo === 'string' && isLikelyRepositoryRootPath(selectedRepo)) {
    candidatePaths.add(selectedRepo);
  }

  const worktreeTabs = snapshot['enso-worktree-tabs'];
  if (typeof worktreeTabs === 'string') {
    try {
      const parsed = JSON.parse(worktreeTabs) as Record<string, unknown>;
      for (const repoPath of Object.keys(parsed)) {
        if (isLikelyRepositoryRootPath(repoPath)) {
          candidatePaths.add(repoPath);
        }
      }
    } catch {
      // Ignore malformed tabs payloads.
    }
  }

  const repositories = [...candidatePaths].map((repoPath) => ({
    name:
      repoPath
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/)
        .at(-1) || repoPath,
    path: repoPath,
    kind: 'local',
  }));

  return repositories.length > 0 ? JSON.stringify(repositories) : null;
}

function getLegacyElectronLocalStorageCandidateDirs(
  sourcePath: string,
  listDirectories: (targetPath: string) => string[]
): string[] {
  const homeDir = deriveLegacyHomeDir(sourcePath);
  const roots = [
    join(homeDir, 'Library', 'Application Support'),
    join(homeDir, '.config'),
    win32.join(homeDir, 'AppData', 'Roaming'),
  ];
  const candidates: string[] = [];

  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = listDirectories(root);
    } catch {
      entries = [];
    }

    for (const entry of entries) {
      if (!/^enso-ai/i.test(entry)) {
        continue;
      }
      const candidateDir = join(root, entry, 'Local Storage', 'leveldb');
      if (!candidates.includes(candidateDir)) {
        candidates.push(candidateDir);
      }
    }
  }

  return candidates;
}

export function readElectronLocalStorageSnapshotFromLevelDbDirs(
  levelDbDirs: string[],
  options: LegacyElectronLocalStorageReadOptions = {}
): Record<string, string> | null {
  const listDirectories =
    options.listDirectories ??
    ((targetPath: string) => readdirSync(targetPath, { encoding: 'utf8' }));
  const readBinaryFile =
    options.readBinaryFile ?? ((targetPath: string) => readFileSync(targetPath));

  const snapshot: Record<string, string> = {};
  const remainingKeys = new Map(
    LEGACY_ELECTRON_LOCAL_STORAGE_KEYS.map((entry) => [entry.key, entry.kind] as const)
  );

  for (const candidateDir of levelDbDirs) {
    let files: string[] = [];
    try {
      files = listDirectories(candidateDir)
        .filter((fileName) => /\.(ldb|log)$/i.test(fileName))
        .sort()
        .reverse();
    } catch {
      files = [];
    }

    for (const fileName of files) {
      let buffer: Buffer;
      try {
        buffer = readBinaryFile(join(candidateDir, fileName));
      } catch {
        continue;
      }

      for (const [key, kind] of [...remainingKeys.entries()]) {
        const keyBuffer = Buffer.from(key);
        const keyIndex = buffer.lastIndexOf(keyBuffer);
        if (keyIndex < 0) {
          continue;
        }

        const value = parseLegacyLocalStorageValue(buffer, keyIndex + keyBuffer.length, kind);
        if (!value) {
          continue;
        }

        snapshot[key] = value;
        remainingKeys.delete(key);
      }
    }
  }

  if (!snapshot['enso-repositories']) {
    const derivedRepositories = deriveLegacyRepositoriesFromSnapshot(snapshot);
    if (derivedRepositories) {
      snapshot['enso-repositories'] = derivedRepositories;
    }
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

export function readLegacyElectronLocalStorageSnapshot(
  sourcePath: string,
  options: LegacyElectronLocalStorageReadOptions = {}
): Record<string, string> | null {
  const listDirectories =
    options.listDirectories ??
    ((targetPath: string) => readdirSync(targetPath, { encoding: 'utf8' }));

  return readElectronLocalStorageSnapshotFromLevelDbDirs(
    getLegacyElectronLocalStorageCandidateDirs(sourcePath, listDirectories),
    options
  );
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'Not set';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatPreviewValue(value: unknown): string {
  const serialized = stableStringify(value);
  return serialized.length > 120 ? `${serialized.slice(0, 117)}...` : serialized;
}

function collectDiffs(
  currentValue: unknown,
  importedValue: unknown,
  path: string[] = []
): Array<{ path: string; currentValue: string; importedValue: string }> {
  if (isPlainObject(currentValue) && isPlainObject(importedValue)) {
    const keys = [...new Set([...Object.keys(currentValue), ...Object.keys(importedValue)])].sort();
    return keys.flatMap((key) =>
      collectDiffs(currentValue[key], importedValue[key], [...path, key])
    );
  }

  if (isPlainObject(currentValue) !== isPlainObject(importedValue)) {
    return [
      {
        path: path.join('.'),
        currentValue: formatPreviewValue(currentValue),
        importedValue: formatPreviewValue(importedValue),
      },
    ];
  }

  const currentSerialized = stableStringify(currentValue);
  const importedSerialized = stableStringify(importedValue);
  if (currentSerialized === importedSerialized) {
    return [];
  }

  return [
    {
      path: path.join('.'),
      currentValue: formatPreviewValue(currentValue),
      importedValue: formatPreviewValue(importedValue),
    },
  ];
}

export function buildLegacySettingsImportPreview(
  currentDocument: PersistedSettingsDocument | null,
  importedDocument: unknown,
  sourcePath: string,
  options: {
    currentLocalStorageSnapshot?: Record<string, string> | null;
    importedLocalStorageSnapshot?: Record<string, string> | null;
  } = {}
): LegacySettingsImportPreview {
  const importedSlice = extractSettingsSlice(importedDocument);
  if (!importedSlice?.state) {
    return {
      sourcePath,
      importable: false,
      diffCount: 0,
      diffs: [],
      truncated: false,
      error: 'Selected file does not contain persisted EnsoAI settings.',
    };
  }

  const currentSlice = extractSettingsSlice(currentDocument ?? {});
  const settingsDiffs = collectDiffs(currentSlice?.state ?? {}, importedSlice.state);
  const importedLocalStorageSnapshot = options.importedLocalStorageSnapshot ?? null;
  const currentLocalStorageSnapshot = options.currentLocalStorageSnapshot ?? null;
  const localStorageDiffs = importedLocalStorageSnapshot
    ? Object.entries(importedLocalStorageSnapshot)
        .filter(([key, value]) => currentLocalStorageSnapshot?.[key] !== value)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, value]) => ({
          path: `localStorage.${key}`,
          currentValue: formatPreviewValue(currentLocalStorageSnapshot?.[key]),
          importedValue: formatPreviewValue(value),
        }))
    : [];
  const diffs = [...settingsDiffs, ...localStorageDiffs];

  return {
    sourcePath,
    importable: diffs.length > 0,
    diffCount: diffs.length,
    diffs: diffs.slice(0, MAX_PREVIEW_DIFFS),
    truncated: diffs.length > MAX_PREVIEW_DIFFS,
    error: diffs.length === 0 ? 'Selected file matches the current settings.' : undefined,
  };
}

export function buildLegacySettingsImportPayload(
  currentDocument: PersistedSettingsDocument | null,
  importedDocument: unknown
): PersistedSettingsDocument | null {
  const importedSlice = extractSettingsSlice(importedDocument);
  if (!importedSlice) {
    return null;
  }

  return {
    ...(currentDocument ?? {}),
    [SETTINGS_SLICE_KEY]: importedSlice,
  };
}
