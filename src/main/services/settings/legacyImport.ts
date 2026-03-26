import { existsSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { LEGACY_RUNTIME_STATE_DIRNAME, SETTINGS_FILENAME } from '@shared/paths';
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
  sourcePath: string
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
  const diffs = collectDiffs(currentSlice?.state ?? {}, importedSlice.state);

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
